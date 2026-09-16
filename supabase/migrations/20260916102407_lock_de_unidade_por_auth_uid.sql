-- Lock de edição da unidade: a identidade passa a vir de `auth.uid()`.
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-16, de manhã (horário local).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O DEFEITO
-- ─────────────────────────────────────────────────────────────────────────────
-- As três funções recebiam `p_user_id uuid` e decidiam sobre ele DE QUEM é o lock — um
-- parâmetro que o próprio chamador envia. SECURITY DEFINER não salva: o DEFINER garante
-- que a função escreve, não que quem pediu tinha direito. Qualquer usuário autenticado
-- podia, chamando o PostgREST direto:
--
--   · liberar o lock de outra pessoa (`release`, passando o uuid dela) e tomar a unidade;
--   · manter vivo o lock alheio (`update_activity`), impedindo que os 10 min expirem;
--   · adquirir o lock EM NOME de outra pessoa, e a tela dos demais culparia o inocente.
--
-- É a mesma falha que `20260912191749_finalizacao_por_auth_uid` fechou nas quatro RPCs de
-- finalização, e o conserto aqui segue aquele padrão de propósito.
--
-- ⚠️ `p_user_name` SAI JUNTO, e não é detalhe estético. Ele é o nome que as OUTRAS pessoas
-- veem ("Fulano está editando esta unidade"), e era string livre do cliente: dava para
-- trancar uma unidade assinando com o nome de qualquer um. Identidade exibida é
-- identidade. Agora ela sai de `profiles`, pelo `auth.uid()`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE MUDA
-- ─────────────────────────────────────────────────────────────────────────────
-- Os dois parâmetros são REMOVIDOS da assinatura, não ignorados: manter um argumento que
-- parece identificar e não identifica é a armadilha "o nome mente antes do código" do
-- CLAUDE.md §8. Quem chamar com a forma antiga recebe 42883 (função inexistente) — erro
-- barulhento, que é o que se quer.
--
-- 🔴 `auth.uid()` é NULL fora de uma sessão de usuário. Conferido em 2026-09-16: as três
-- só são chamadas por `useProvaUnidadeLock` (front, com sessão) — nenhuma Edge Function,
-- nenhum script. Se um dia uma automação precisar delas, o caminho é função própria com
-- guarda explícita, NÃO devolver o parâmetro.
--
-- ⚠️ Esta migration vem logo depois da 20260916100732, que acabou de criar estas mesmas
-- funções. São duas porque migration aplicada não se edita (§3) — e a 100732 já rodou
-- localmente. O `db reset` prova as duas na ordem.

DROP FUNCTION IF EXISTS public.acquire_prova_unidade_lock(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.update_prova_unidade_lock_activity(uuid, uuid);
DROP FUNCTION IF EXISTS public.release_prova_unidade_lock(uuid, uuid);

CREATE OR REPLACE FUNCTION public.acquire_prova_unidade_lock(p_prova_unidade_id UUID)
RETURNS TABLE(success BOOLEAN, locked_by_name TEXT, locked_since TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_lock RECORD;
  v_lock_timeout INTERVAL := '10 minutes';
  v_uid uuid := auth.uid();
  v_nome text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada. Entre de novo para editar esta unidade.'
      USING ERRCODE = 'P0002';
  END IF;

  -- O nome exibido aos outros vem do banco, nunca do cliente. A cadeia repete a que a
  -- tela usava antes (full_name → email do perfil → e-mail da conta), porque é o que as
  -- pessoas estão acostumadas a ver; o `nullif(trim(...))` evita nome em branco, que
  -- deixaria a tela dizendo que "" está editando.
  SELECT coalesce(
           nullif(trim(p.full_name), ''),
           nullif(trim(p.email), ''),
           (SELECT nullif(trim(u.email), '') FROM auth.users u WHERE u.id = v_uid),
           'Usuário'
         )
    INTO v_nome
    FROM public.profiles p
   WHERE p.id = v_uid;

  -- Sem linha em `profiles` o SELECT acima não atribui nada: o coalesce não chega a rodar.
  IF v_nome IS NULL THEN
    SELECT coalesce(nullif(trim(u.email), ''), 'Usuário') INTO v_nome
      FROM auth.users u WHERE u.id = v_uid;
    v_nome := coalesce(v_nome, 'Usuário');
  END IF;

  SELECT * INTO v_existing_lock
  FROM public.prova_unidade_edit_locks
  WHERE prova_unidade_id = p_prova_unidade_id;

  -- Ninguém está editando: o lock é nosso.
  IF v_existing_lock IS NULL THEN
    INSERT INTO public.prova_unidade_edit_locks
      (prova_unidade_id, user_id, user_name, locked_at, last_activity)
    VALUES (p_prova_unidade_id, v_uid, v_nome, NOW(), NOW());

    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- Já é nosso (outra aba, ou volta do bfcache): renova.
  IF v_existing_lock.user_id = v_uid THEN
    UPDATE public.prova_unidade_edit_locks
    SET last_activity = NOW(), user_name = v_nome
    WHERE prova_unidade_id = p_prova_unidade_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- De outra pessoa, mas abandonado há mais de 10 minutos: toma.
  IF v_existing_lock.last_activity < NOW() - v_lock_timeout THEN
    UPDATE public.prova_unidade_edit_locks
    SET user_id = v_uid, user_name = v_nome, locked_at = NOW(), last_activity = NOW()
    WHERE prova_unidade_id = p_prova_unidade_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- De outra pessoa e vivo: quem pediu fica de fora, e a tela diz de quem é.
  RETURN QUERY SELECT FALSE, v_existing_lock.user_name, v_existing_lock.locked_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_prova_unidade_lock_activity(p_prova_unidade_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;   -- heartbeat não interrompe a tela; só não renova.
  END IF;

  -- É UPDATE: NÃO recria linha apagada. Quem volta do bfcache tem de readquirir.
  -- O `user_id = v_uid` é o que impede manter vivo o lock de outra pessoa.
  UPDATE public.prova_unidade_edit_locks
  SET last_activity = NOW()
  WHERE prova_unidade_id = p_prova_unidade_id AND user_id = v_uid;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_prova_unidade_lock(p_prova_unidade_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;   -- a aba está indo embora; o timeout de 10 min cobre.
  END IF;

  -- O `user_id = v_uid` é o que impede liberar o lock alheio para tomar a unidade.
  DELETE FROM public.prova_unidade_edit_locks
  WHERE prova_unidade_id = p_prova_unidade_id AND user_id = v_uid;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_prova_unidade_lock(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_prova_unidade_lock_activity(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_prova_unidade_lock(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.acquire_prova_unidade_lock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_prova_unidade_lock_activity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_prova_unidade_lock(uuid) TO authenticated, service_role;
