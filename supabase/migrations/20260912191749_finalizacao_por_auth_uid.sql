-- Finalizar/reabrir prova e unidade: a identidade passa a vir de `auth.uid()`.
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-12, à tarde (horário local).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O DEFEITO
-- ─────────────────────────────────────────────────────────────────────────────
-- As quatro funções recebiam `p_user_id uuid` e decidiam a autorização sobre ele — um
-- parâmetro que o próprio chamador envia. Isso não é autorização: é uma conferência que
-- o atacante controla dos dois lados. Qualquer usuário autenticado que soubesse o
-- `created_by` de uma prova (ou o uuid de um superadmin) finalizava ou reabria prova
-- alheia, mesmo sendo SECURITY DEFINER — o DEFINER só garante que a função escreve, não
-- que quem pediu tinha direito.
--
-- Achado em 2026-09-08, ao fechar o acesso de `anon` às funções, e adiado por decisão do
-- usuário na mesma data. O acesso anônimo foi fechado então; ISTO é o que sobrava, e vale
-- para usuário logado.
--
-- ⚠️ A NOTA DO BACKLOG ESTAVA INCOMPLETA, e isso mudou o conserto. Ela descrevia as
-- quatro como "comparam `created_by` com `p_user_id`" — exato só para as duas de PROVA.
-- As duas `_unidade` já tinham regras mais ricas, e diferentes entre si. Medido no corpo
-- de cada uma em 2026-09-12, antes de reescrever:
--
--   finalizar_prova .......... só created_by            (nem superadmin!)
--   reabrir_prova ............ só created_by            (nem superadmin!)
--   finalizar_prova_unidade .. superadmin OU created_by OU coordenador da prova
--   reabrir_prova_unidade .... superadmin OU quem finalizou aquela unidade
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE MUDA, E O QUE NÃO MUDA
-- ─────────────────────────────────────────────────────────────────────────────
-- MUDA a fonte da identidade: `auth.uid()`, que vem do JWT e o cliente não escolhe. O
-- parâmetro `p_user_id` é REMOVIDO da assinatura — mantê-lo e ignorá-lo deixaria no
-- contrato um argumento que parece autorizar e não autoriza, que é a armadilha "o nome
-- mente antes do código" do CLAUDE.md §8.
--
-- MUDA também, por decisão do usuário em 2026-09-12, a política das duas de PROVA:
-- passa a ser **superadmin OU o criador**, alinhando com o que as `_unidade` já faziam.
-- 🔵 O motivo é operacional e foi medido: as 2 provas do banco foram criadas por uma
-- admin que NÃO é superadmin, então hoje nem as contas superadmin conseguem finalizá-las
-- — se aquela pessoa sair, ninguém socorre.
--
-- NÃO MUDA a política das duas `_unidade`: coordenador segue finalizando (medido: 2 das
-- 11 unidades finalizadas foram por coordenadores, então o ramo é usado de verdade), e
-- reabrir unidade segue restrito a quem a finalizou, ou a um superadmin.
--
-- 🔴 `auth.uid()` é NULL fora de uma sessão de usuário. Medido em 2026-09-12: NENHUMA
-- Edge Function e NENHUM script chamam estas RPCs — só o front, com sessão. Se um dia
-- alguma automação precisar delas, o caminho é uma função própria com guarda explícita,
-- NÃO devolver o parâmetro.

DROP FUNCTION IF EXISTS public.finalizar_prova(uuid, uuid);
DROP FUNCTION IF EXISTS public.reabrir_prova(uuid, uuid);
DROP FUNCTION IF EXISTS public.finalizar_prova_unidade(uuid, uuid);
DROP FUNCTION IF EXISTS public.reabrir_prova_unidade(uuid, uuid);


-- ── PROVA INTEIRA ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.finalizar_prova(p_prova_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada. Entre de novo para finalizar a prova.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT created_by INTO v_created_by FROM public.provas WHERE id = p_prova_id;

  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.has_role(v_uid, 'superadmin'::app_role) OR v_created_by = v_uid) THEN
    RAISE EXCEPTION 'Apenas quem criou a prova (ou um superadmin) pode finalizá-la.'
      USING ERRCODE = 'P0002';
  END IF;

  -- ⚠️ `provas` NÃO tem coluna de "quem finalizou" — só `finalizada_at`. Quem guarda
  -- autoria é `prova_unidades.unidade_finalizada_by`, no nível da unidade.
  UPDATE public.provas
     SET prova_finalizada = TRUE,
         finalizada_at = NOW(),
         updated_at = NOW()
   WHERE id = p_prova_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reabrir_prova(p_prova_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada. Entre de novo para reabrir a prova.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT created_by INTO v_created_by FROM public.provas WHERE id = p_prova_id;

  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.has_role(v_uid, 'superadmin'::app_role) OR v_created_by = v_uid) THEN
    RAISE EXCEPTION 'Apenas quem criou a prova (ou um superadmin) pode reabri-la.'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.provas
     SET prova_finalizada = FALSE,
         finalizada_at = NULL,
         updated_at = NOW()
   WHERE id = p_prova_id;

  RETURN TRUE;
END;
$$;


-- ── UNIDADE ──────────────────────────────────────────────────────────────────
-- A política destas duas NÃO muda; só a fonte da identidade.

CREATE OR REPLACE FUNCTION public.finalizar_prova_unidade(p_prova_unidade_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prova_id uuid;
  v_created_by uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada. Entre de novo para finalizar a unidade.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT pu.prova_id, p.created_by
    INTO v_prova_id, v_created_by
    FROM public.prova_unidades pu
    JOIN public.provas p ON p.id = pu.prova_id
   WHERE pu.id = p_prova_unidade_id;

  IF v_prova_id IS NULL THEN
    RAISE EXCEPTION 'Unidade de prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  -- O ramo do coordenador é usado de verdade: medido em 12/09, 2 das 11 unidades
  -- finalizadas foram por coordenadores, não por admin.
  IF NOT (
    public.has_role(v_uid, 'superadmin'::app_role)
    OR v_created_by = v_uid
    OR public.is_coordenador_prova(v_uid, v_prova_id)
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para finalizar esta unidade.'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.prova_unidades
     SET unidade_finalizada = TRUE,
         unidade_finalizada_at = NOW(),
         unidade_finalizada_by = v_uid
   WHERE id = p_prova_unidade_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reabrir_prova_unidade(p_prova_unidade_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_finalized_by uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada. Entre de novo para reabrir a unidade.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT unidade_finalizada_by INTO v_finalized_by
    FROM public.prova_unidades WHERE id = p_prova_unidade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade de prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  -- Mais restrito que finalizar, de propósito: reabrir desfaz o ato de outra pessoa.
  IF NOT (
    public.has_role(v_uid, 'superadmin'::app_role)
    OR (v_finalized_by IS NOT NULL AND v_finalized_by = v_uid)
  ) THEN
    RAISE EXCEPTION 'Apenas o usuário que finalizou esta unidade pode reabri-la.'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.prova_unidades
     SET unidade_finalizada = FALSE,
         unidade_finalizada_at = NULL,
         unidade_finalizada_by = NULL
   WHERE id = p_prova_unidade_id;

  RETURN TRUE;
END;
$$;


-- O DROP levou os grants junto; as funções novas nascem com EXECUTE para PUBLIC.
-- Padrão da 20260908231620: revogar de PUBLIC (revogar de `anon` não faria nada, porque
-- o acesso dele vem de ser membro de PUBLIC) e devolver a quem precisa.
-- ⚠️ Sem `service_role` aqui, de propósito: `auth.uid()` seria NULL e a função recusaria
-- de qualquer forma. Conceder daria a impressão de um caminho que não existe.
REVOKE ALL ON FUNCTION public.finalizar_prova(uuid)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reabrir_prova(uuid)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_prova_unidade(uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reabrir_prova_unidade(uuid)    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.finalizar_prova(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_prova(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_prova_unidade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_prova_unidade(uuid)   TO authenticated;
