-- ============================================================================
-- O LOCK DE EDIÇÃO PASSA A SER POR UNIDADE DE PROVA — e passa a funcionar.
-- ============================================================================
--
-- O DEFEITO, medido em 2026-09-16 contra o log de produção e reproduzido no banco
-- local: `GerenciarColaboradoresProva` chamava `acquire_prova_lock` passando o
-- `prova_unidades.id` da rota (`/gerenciar-colaboradores-prova/:provaUnidadeId`) no
-- parâmetro `p_prova_id`. A coluna `prova_edit_locks.prova_id` referencia
-- `provas(id)`, então TODO INSERT falhava com 23503:
--
--   insert or update on table "prova_edit_locks" violates foreign key constraint
--   "prova_edit_locks_prova_id_fkey"
--   Key (prova_id)=(…) is not present in table "provas".
--
-- Mais de 500 ocorrências em 24h em produção — uma por abertura da tela. A linha
-- nasceu assim no commit inicial (`10c749c`): **o lock nunca funcionou**, nem local,
-- nem em produção. E falhava calado: no erro o hook devolve
-- `hasAccess:false, isLocked:false, error:"…"`, e o portão da tela testa
-- `isLocked && !hasAccess` — que é falso. A página abria normalmente para todos.
--
-- ⚠️ Pista que já estava registrada e passou batido: a migration 20260731110000
-- anotou que `prova_edit_locks` devolvia `[]` "só porque está vazia". Estava vazia
-- porque nenhum INSERT nela jamais teve sucesso.
--
-- POR QUE POR UNIDADE, e não corrigir o id para o da prova. O coordenador se vincula
-- à prova por uma alocação (`coordenadores_prova.colaborador_prova_id` →
-- `colaboradores_prova`, que pertence a uma `prova_unidade`), então coordenadores
-- diferentes trabalham em UNIDADES DIFERENTES da mesma prova. Um lock por prova faria
-- um barrar o outro — seria regressão, não conserto. As três mensagens da tela
-- ("Unidade em edição", "está editando esta unidade", "esta página") já dizem unidade.
--
-- A TABELA ANTIGA SE APAGA sem cerimônia: ela está vazia por construção (todo INSERT
-- falhava), o dump não a menciona, e mesmo que tivesse linha seria estado efêmero de
-- 10 minutos. Recriar em vez de renomear dá nomes honestos a constraints e policies —
-- neste repo o NOME mente antes do código.
--
-- ⚠️ A FK é CASCADE de propósito, contra a regra geral de RESTRICT: um lock não é
-- registro, é estado transitório. Com RESTRICT, uma aba esquecida bloquearia por 10
-- minutos o desvínculo da unidade da prova.

-- ── 1. Fora o que não funcionava ─────────────────────────────────────────────
DROP TABLE IF EXISTS public.prova_edit_locks;

DROP FUNCTION IF EXISTS public.acquire_prova_lock(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.update_prova_lock_activity(uuid, uuid);
DROP FUNCTION IF EXISTS public.release_prova_lock(uuid, uuid);
-- `check_prova_lock` nunca teve um único consumidor no código. Sai junto.
DROP FUNCTION IF EXISTS public.check_prova_lock(uuid);

-- ── 2. A tabela, agora por unidade ───────────────────────────────────────────
CREATE TABLE public.prova_unidade_edit_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prova_unidade_id UUID NOT NULL UNIQUE
    REFERENCES public.prova_unidades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prova_unidade_edit_locks ENABLE ROW LEVEL SECURITY;

-- Toda escrita passa pelas funções SECURITY DEFINER abaixo; a tabela só se lê.
CREATE POLICY "Authenticated users can view prova_unidade_edit_locks"
ON public.prova_unidade_edit_locks FOR SELECT TO authenticated USING (true);

CREATE POLICY "No direct insert - use function"
ON public.prova_unidade_edit_locks FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "No direct update - use function"
ON public.prova_unidade_edit_locks FOR UPDATE TO authenticated USING (false);

CREATE POLICY "No direct delete - use function"
ON public.prova_unidade_edit_locks FOR DELETE TO authenticated USING (false);

-- `anon` não recebe nada em tabela nova (default privileges do schema public, como
-- ficaram em 20260731110000), mas o REVOKE é explícito para que a leitura da
-- migration não dependa de conhecer o default.
REVOKE ALL ON TABLE public.prova_unidade_edit_locks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prova_unidade_edit_locks
  TO authenticated, service_role;

-- ── 3. As RPCs ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.acquire_prova_unidade_lock(
  p_prova_unidade_id UUID, p_user_id UUID, p_user_name TEXT)
RETURNS TABLE(success BOOLEAN, locked_by_name TEXT, locked_since TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_lock RECORD;
  v_lock_timeout INTERVAL := '10 minutes';
BEGIN
  SELECT * INTO v_existing_lock
  FROM public.prova_unidade_edit_locks
  WHERE prova_unidade_id = p_prova_unidade_id;

  -- Ninguém está editando: o lock é nosso.
  IF v_existing_lock IS NULL THEN
    INSERT INTO public.prova_unidade_edit_locks
      (prova_unidade_id, user_id, user_name, locked_at, last_activity)
    VALUES (p_prova_unidade_id, p_user_id, p_user_name, NOW(), NOW());

    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- Já é nosso (outra aba, ou volta do bfcache): renova.
  IF v_existing_lock.user_id = p_user_id THEN
    UPDATE public.prova_unidade_edit_locks
    SET last_activity = NOW(), user_name = p_user_name
    WHERE prova_unidade_id = p_prova_unidade_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- De outra pessoa, mas abandonado há mais de 10 minutos: toma.
  IF v_existing_lock.last_activity < NOW() - v_lock_timeout THEN
    UPDATE public.prova_unidade_edit_locks
    SET user_id = p_user_id, user_name = p_user_name, locked_at = NOW(), last_activity = NOW()
    WHERE prova_unidade_id = p_prova_unidade_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- De outra pessoa e vivo: quem pediu fica de fora, e a tela diz de quem é.
  RETURN QUERY SELECT FALSE, v_existing_lock.user_name, v_existing_lock.locked_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_prova_unidade_lock_activity(
  p_prova_unidade_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- É UPDATE: NÃO recria linha apagada. Quem volta do bfcache tem de readquirir.
  UPDATE public.prova_unidade_edit_locks
  SET last_activity = NOW()
  WHERE prova_unidade_id = p_prova_unidade_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_prova_unidade_lock(
  p_prova_unidade_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.prova_unidade_edit_locks
  WHERE prova_unidade_id = p_prova_unidade_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Função nova em `public` nasce com EXECUTE só para `postgres` (default privileges
-- deste projeto), então a concessão é obrigatória — sem ela o PostgREST recusaria.
REVOKE ALL ON FUNCTION public.acquire_prova_unidade_lock(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_prova_unidade_lock_activity(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_prova_unidade_lock(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.acquire_prova_unidade_lock(uuid, uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_prova_unidade_lock_activity(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_prova_unidade_lock(uuid, uuid)
  TO authenticated, service_role;
