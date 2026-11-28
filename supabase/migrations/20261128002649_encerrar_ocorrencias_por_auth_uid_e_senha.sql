-- Encerrar o registro de ocorrências: identidade por `auth.uid()`, só coordenador DA
-- UNIDADE ou superadmin, e SENHA digitada há pouco — conferida pelo banco.
--
-- ⚠️ O timestamp do nome é UTC: escrito em 2026-11-27, à noite (horário local).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O DEFEITO
-- ─────────────────────────────────────────────────────────────────────────────
-- `encerrar_ocorrencias_unidade(p_prova_unidade_id, p_user_id)` decidia a autorização
-- sobre `p_user_id` — um parâmetro que o próprio chamador envia (`has_role(p_user_id, …)`,
-- `created_by = p_user_id`, `is_coordenador_prova(p_user_id, …)`), com EXECUTE para
-- `authenticated`. Qualquer usuário logado que mandasse o uuid de um admin encerrava o
-- registro de qualquer unidade. É o mesmo defeito que `20260912191749` fechou nas
-- funções de finalizar/reabrir.
--
-- Ficou mais grave em 2026-11-27: o encerramento virou PRÉ-CONDIÇÃO da Exportação DAF (o
-- arquivo de pagamento), e ele é IRREVERSÍVEL pelo app. Um encerramento indevido liberava o
-- pagamento antes da hora e travava o registro de ocorrências para sempre.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A NOVA POLÍTICA — decisão do usuário (2026-11-27)
-- ─────────────────────────────────────────────────────────────────────────────
-- "Encerramento exige senha. Somente o coordenador ou um superadmin podem fechar."
--
--   • SUPERADMIN — `has_role(auth.uid(), 'superadmin')`.
--   • COORDENADOR DA UNIDADE — vínculo em `coordenadores_prova` cujo
--     `colaborador_prova_id` aponta para uma alocação NESTA `prova_unidade`. É a mesma
--     definição de `get_coordenador_prova_unidade_ids`, que decide quais unidades a tela
--     mostra ao coordenador. Antes valia coordenador de QUALQUER unidade da prova.
--   • SAEM: admin (sem ser superadmin) e o `created_by` da prova.
--
-- MEDIDO ANTES (banco local = cópia de produção, 2026-11-27): das 11 unidades encerradas,
-- **10 foram pelo coordenador daquela mesma unidade** e **1 por um superadmin**. Nenhuma
-- por admin comum nem pelo criador da prova — a política nova não tira ninguém de um
-- caminho que estivesse em uso. Os 19 vínculos de coordenador têm unidade.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A SENHA, conferida pelo banco sem que ela chegue ao banco
-- ─────────────────────────────────────────────────────────────────────────────
-- O `PasswordConfirmDialog` sempre pediu a senha — mas conferia NO CLIENTE
-- (`signInWithPassword`) e então chamava a RPC. Quem chamasse a RPC direto pulava a senha.
--
-- O login por senha gera um JWT com `amr: [{"method":"password","timestamp":<login>}]`.
-- MEDIDO no GoTrue local (2026-11-27): o timestamp é o do LOGIN, e o refresh do token o
-- PRESERVA (só o `iat` muda). Então "senha digitada há no máximo 5 minutos" é uma
-- afirmação que o banco consegue checar lendo `auth.jwt()`:
--   • a senha nunca trafega para o Postgres (nada em parâmetro, nada em log);
--   • quem confere a senha é o GoTrue, com o rate limit dele;
--   • sessão aberta por link (convite/recuperação: método `otp`/`recovery`) não serve —
--     a pessoa digita a senha no diálogo, que faz um login novo.
-- ⚠️ Consequência aceita: quem ENTROU com senha há menos de 5 minutos encerra sem o
-- diálogo, por chamada direta. A afirmação continua verdadeira — a senha foi digitada
-- há pouco, pela mesma sessão.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- E UMA GUARDA DE TRILHA
-- ─────────────────────────────────────────────────────────────────────────────
-- Unidade JÁ encerrada é recusada (OC003). Antes, encerrar de novo sobrescrevia
-- `ocorrencias_encerradas_at`/`_by` — a trilha de quem fechou e quando se perdia calada.
-- A tela não oferece o botão para unidade encerrada; isto é para o caminho direto.
--
-- `p_user_id` SAI da assinatura (DROP + CREATE): mantê-lo e ignorá-lo deixaria no
-- contrato um argumento que parece autorizar e não autoriza (CLAUDE.md §8).
-- SQLSTATEs: OC000 sem sessão · OC001 sem permissão · OC002 senha não recente ·
-- OC003 já encerrada · P0001 unidade inexistente (mantido).

DROP FUNCTION IF EXISTS public.encerrar_ocorrencias_unidade(uuid, uuid);

CREATE FUNCTION public.encerrar_ocorrencias_unidade(p_prova_unidade_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existe boolean;
  v_encerrada boolean;
  v_senha_recente boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada. Entre novamente para encerrar o registro.'
      USING ERRCODE = 'OC000';
  END IF;

  SELECT true, pu.ocorrencias_encerradas
    INTO v_existe, v_encerrada
    FROM public.prova_unidades pu
   WHERE pu.id = p_prova_unidade_id;

  IF v_existe IS NULL THEN
    RAISE EXCEPTION 'Unidade de prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1
        FROM public.coordenadores_prova cp
        JOIN public.colaboradores_prova colp ON colp.id = cp.colaborador_prova_id
       WHERE cp.user_id = v_uid
         AND colp.prova_unidade_id = p_prova_unidade_id
    )
  ) THEN
    RAISE EXCEPTION 'Só o coordenador desta unidade ou um superadmin pode encerrar o registro de ocorrências.'
      USING ERRCODE = 'OC001';
  END IF;

  IF v_encerrada THEN
    RAISE EXCEPTION 'O registro de ocorrências desta unidade já foi encerrado.'
      USING ERRCODE = 'OC003';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) AS m
     WHERE m ->> 'method' = 'password'
       AND (m ->> 'timestamp')::bigint >= extract(epoch FROM now())::bigint - 300
  ) INTO v_senha_recente;

  IF NOT v_senha_recente THEN
    RAISE EXCEPTION 'Para encerrar o registro, confirme sua senha novamente.'
      USING ERRCODE = 'OC002';
  END IF;

  UPDATE public.prova_unidades
     SET ocorrencias_encerradas = TRUE,
         ocorrencias_encerradas_at = NOW(),
         ocorrencias_encerradas_by = v_uid
   WHERE id = p_prova_unidade_id;

  RETURN TRUE;
END;
$function$;

-- `anon` explícito: no Supabase os default privileges podem conceder EXECUTE a `anon` em
-- função NOVA, e o REVOKE de PUBLIC não alcança esse grant.
REVOKE ALL ON FUNCTION public.encerrar_ocorrencias_unidade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encerrar_ocorrencias_unidade(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.encerrar_ocorrencias_unidade(uuid) TO authenticated;

COMMENT ON FUNCTION public.encerrar_ocorrencias_unidade(uuid) IS
  'Encerra (irreversivel) o registro de ocorrencias da unidade. Identidade = auth.uid(); so superadmin ou coordenador DA UNIDADE; exige JWT com amr password de no maximo 5 min (OC002). Ver migration 20261128002649.';
