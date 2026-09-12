-- Bateria: autorização de finalizar/reabrir prova e unidade
-- Migration coberta: 20260912191749_finalizacao_por_auth_uid.sql
-- Escrita em 2026-09-12, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-finalizacao-autorizacao.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: um teste lá afirma o MOCK, nunca a autorização. E
-- quando o conserto foi feito, NENHUM teste caiu — ninguém guardava este contrato.
-- ⚠️ O `tsc` também NÃO guarda: reintroduzir `p_user_id` na chamada passa limpo (medido
-- em 2026-09-12). Isto aqui é a única prova de que a autorização funciona.
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. Tudo roda em transação com
-- ROLLBACK; os papéis fabricados não sobrevivem.
--
-- COMO A SESSÃO É SIMULADA: `auth.uid()` lê o `sub` de `request.jwt.claims`. Os casos
-- usam `set_config(..., true)` (local à transação) — o mesmo padrão de bateria-cargos.sql.

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES                                                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 0.1 🔴 O parametro p_user_id NAO EXISTE MAIS. Se a assinatura de 2 argumentos'
\echo '--     voltar, alguem restaurou o defeito.'
SELECT proname, pg_get_function_arguments(oid) AS assinatura,
       CASE WHEN pg_get_function_arguments(oid) LIKE '%p_user_id%'
            THEN 'FALHOU — o parametro voltou' ELSE 'OK' END AS resultado
FROM pg_proc
WHERE proname IN ('finalizar_prova','reabrir_prova','finalizar_prova_unidade','reabrir_prova_unidade')
ORDER BY 1;

\echo ''
\echo '-- 0.2 As quatro leem auth.uid() no corpo'
SELECT proname,
       CASE WHEN prosrc LIKE '%auth.uid()%' THEN 'OK — usa auth.uid()'
            ELSE 'FALHOU — decide sobre parametro do chamador' END AS resultado
FROM pg_proc
WHERE proname IN ('finalizar_prova','reabrir_prova','finalizar_prova_unidade','reabrir_prova_unidade')
ORDER BY 1;

\echo ''
\echo '-- 0.3 anon nao executa nenhuma delas'
SELECT string_agg(p.proname, ', ') AS executaveis_por_anon
FROM pg_proc p
WHERE p.proname IN ('finalizar_prova','reabrir_prova','finalizar_prova_unidade','reabrir_prova_unidade')
  AND has_function_privilege('anon', p.oid, 'EXECUTE');


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. PROVA — superadmin OU criador (politica nova, decidida em 12/09)    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE
  v_prova uuid; v_criador uuid; v_outro uuid; v_super uuid; v_msg text; v_estado text;
BEGIN
  SELECT id, created_by INTO v_prova, v_criador FROM public.provas
   WHERE created_by IS NOT NULL LIMIT 1;

  IF v_prova IS NULL THEN RAISE NOTICE 'CASOS 1.x: PULADOS — sem prova'; RETURN; END IF;

  -- As provas do dump estao finalizadas. Reabrimos AQUI DENTRO (a transacao volta atras),
  -- para o caso nao depender do estado em que o dump calhou de estar.
  UPDATE public.provas SET prova_finalizada = FALSE WHERE id = v_prova;

  -- Alguem autenticado que NAO e' o criador nem superadmin.
  SELECT ur.user_id INTO v_outro FROM public.user_roles ur
   WHERE ur.user_id <> v_criador
     AND ur.user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'superadmin')
   LIMIT 1;

  -- 1.1 🔴 O DEFEITO QUE ISTO FECHA: outro usuario logado NAO finaliza prova alheia.
  --     Antes, bastava passar o uuid do criador em p_user_id.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_outro, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.finalizar_prova(v_prova);
    RAISE NOTICE 'CASO 1.1: FALHOU — usuario alheio finalizou a prova';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_estado = RETURNED_SQLSTATE;
    IF v_estado = 'P0002' THEN
      RAISE NOTICE 'CASO 1.1: OK — recusado (%)', v_msg;
    ELSE
      RAISE NOTICE 'CASO 1.1: ATENCAO — barrou por OUTRA regra [%]: %', v_estado, v_msg;
    END IF;
  END;

  -- 1.2 CONTROLE POSITIVO: o criador finaliza.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_criador, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.finalizar_prova(v_prova);
    RAISE NOTICE 'CASO 1.2: OK — o criador finaliza (controle positivo)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 1.2: FALHOU — o criador foi barrado: %', v_msg;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- 1.3 🔵 SUPERADMIN passa a finalizar prova que NAO criou.'
\echo '--     E a mudanca de politica de 12/09, e o motivo e medido: as provas do banco'
\echo '--     foram criadas por uma admin que nao e superadmin — antes, nem as contas'
\echo '--     superadmin conseguiam socorrer.'
BEGIN;
DO $$
DECLARE v_prova uuid; v_criador uuid; v_super uuid; v_msg text;
BEGIN
  SELECT id, created_by INTO v_prova, v_criador FROM public.provas
   WHERE created_by IS NOT NULL LIMIT 1;
  UPDATE public.provas SET prova_finalizada = FALSE WHERE id = v_prova;

  -- Fabrica um superadmin PURO (sem linha admin) que nao e' o criador: usar uma conta que
  -- ja' e' admin nao provaria que a hierarquia funciona.
  SELECT ur.user_id INTO v_super FROM public.user_roles ur
   WHERE ur.role = 'user' AND ur.user_id <> v_criador
     AND ur.user_id NOT IN (SELECT user_id FROM public.user_roles
                             WHERE role IN ('admin','superadmin','coordenador'))
   LIMIT 1;

  IF v_prova IS NULL OR v_super IS NULL THEN
    RAISE NOTICE 'CASO 1.3: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_super, 'superadmin');
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.finalizar_prova(v_prova);
    RAISE NOTICE 'CASO 1.3: OK — superadmin puro finaliza prova de outro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 1.3: FALHOU — superadmin barrado: %', v_msg;
  END;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. UNIDADE — a politica NAO mudou, so a fonte da identidade            ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE
  v_pu uuid; v_prova uuid; v_coord uuid; v_estranho uuid; v_msg text; v_estado text;
BEGIN
  -- Precisa de uma unidade de uma prova QUE TENHA coordenador — e a unidade pode estar
  -- finalizada no dump, entao reabrimos aqui dentro.
  SELECT pu.id, pu.prova_id INTO v_pu, v_prova
    FROM public.prova_unidades pu
   WHERE EXISTS (SELECT 1 FROM public.coordenadores_prova cp WHERE cp.prova_id = pu.prova_id)
   LIMIT 1;

  IF v_pu IS NULL THEN RAISE NOTICE 'CASOS 2.x: PULADOS — nenhuma prova com coordenador'; RETURN; END IF;

  UPDATE public.prova_unidades
     SET unidade_finalizada = FALSE, unidade_finalizada_at = NULL, unidade_finalizada_by = NULL
   WHERE id = v_pu;

  -- 2.1 CONTROLE POSITIVO do ramo do COORDENADOR — medido em 12/09: 2 das 11 unidades
  --     finalizadas foram por coordenadores, entao este ramo e' usado de verdade.
  SELECT cp.user_id INTO v_coord FROM public.coordenadores_prova cp
   WHERE cp.prova_id = v_prova LIMIT 1;

  IF v_coord IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.finalizar_prova_unidade(v_pu);
      RAISE NOTICE 'CASO 2.1: OK — coordenador da prova finaliza a unidade';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      RAISE NOTICE 'CASO 2.1: FALHOU — coordenador barrado: %', v_msg;
    END;
  ELSE
    RAISE NOTICE 'CASO 2.1: PULADO — a prova nao tem coordenador';
  END IF;
END $$;
ROLLBACK;

BEGIN;
DO $$
DECLARE v_pu uuid; v_prova uuid; v_estranho uuid; v_msg text; v_estado text;
BEGIN
  SELECT pu.id, pu.prova_id INTO v_pu, v_prova FROM public.prova_unidades pu LIMIT 1;
  UPDATE public.prova_unidades
     SET unidade_finalizada = FALSE, unidade_finalizada_at = NULL, unidade_finalizada_by = NULL
   WHERE id = v_pu;

  -- Autenticado que nao e' superadmin, nem criador, nem coordenador DESTA prova.
  SELECT ur.user_id INTO v_estranho FROM public.user_roles ur
   WHERE ur.user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role IN ('superadmin'))
     AND ur.user_id NOT IN (SELECT created_by FROM public.provas WHERE created_by IS NOT NULL)
     AND ur.user_id NOT IN (SELECT user_id FROM public.coordenadores_prova WHERE prova_id = v_prova)
   LIMIT 1;

  IF v_pu IS NULL OR v_estranho IS NULL THEN
    RAISE NOTICE 'CASO 2.2: PULADO — sem fixture'; RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_estranho, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.finalizar_prova_unidade(v_pu);
    RAISE NOTICE 'CASO 2.2: FALHOU — estranho finalizou unidade alheia';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_estado = RETURNED_SQLSTATE;
    IF v_estado = 'P0002' THEN
      RAISE NOTICE 'CASO 2.2: OK — recusado (%)', v_msg;
    ELSE
      RAISE NOTICE 'CASO 2.2: ATENCAO — outra regra barrou [%]: %', v_estado, v_msg;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- 2.3 REABRIR unidade e mais restrito: so quem finalizou, ou superadmin.'
BEGIN;
DO $$
DECLARE v_pu uuid; v_quem uuid; v_outro uuid; v_msg text; v_estado text;
BEGIN
  SELECT id, unidade_finalizada_by INTO v_pu, v_quem
    FROM public.prova_unidades
   WHERE unidade_finalizada AND unidade_finalizada_by IS NOT NULL LIMIT 1;

  IF v_pu IS NULL THEN RAISE NOTICE 'CASOS 2.3: PULADOS — nenhuma unidade finalizada'; RETURN; END IF;

  SELECT ur.user_id INTO v_outro FROM public.user_roles ur
   WHERE ur.user_id <> v_quem
     AND ur.user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'superadmin')
   LIMIT 1;

  -- Quem NAO finalizou nao reabre...
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_outro, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.reabrir_prova_unidade(v_pu);
    RAISE NOTICE 'CASO 2.3a: FALHOU — outro usuario reabriu';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE;
    RAISE NOTICE 'CASO 2.3a: OK — recusado [%]', v_estado;
  END;

  -- ...mas quem finalizou, sim (controle positivo).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_quem, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.reabrir_prova_unidade(v_pu);
    RAISE NOTICE 'CASO 2.3b: OK — quem finalizou reabre (controle positivo)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 2.3b: FALHOU — %', v_msg;
  END;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. SEM SESSAO — auth.uid() nulo tem de RECUSAR, nao passar             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo ''
\echo '-- 🔴 Sem claims, auth.uid() e NULL. Comparacao com NULL avalia NULL (nem true nem'
\echo '--    false), entao um IF mal escrito NAO dispara e cai no caminho de sucesso — foi'
\echo '--    exatamente assim que a verify_user_password virou oraculo (ver auth-e-permissoes).'
BEGIN;
DO $$
DECLARE v_prova uuid; v_pu uuid; v_msg text;
BEGIN
  SELECT id INTO v_prova FROM public.provas LIMIT 1;
  SELECT id INTO v_pu FROM public.prova_unidades LIMIT 1;
  UPDATE public.provas SET prova_finalizada = FALSE WHERE id = v_prova;
  UPDATE public.prova_unidades SET unidade_finalizada = FALSE WHERE id = v_pu;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM public.finalizar_prova(v_prova);
    RAISE NOTICE 'CASO 3.1: FALHOU — finalizou SEM SESSAO';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 3.1: OK — %', v_msg;
  END;

  BEGIN
    PERFORM public.finalizar_prova_unidade(v_pu);
    RAISE NOTICE 'CASO 3.2: FALHOU — finalizou unidade SEM SESSAO';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 3.2: OK — %', v_msg;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- 4. Controle final: nada sobreviveu (as provas seguem no estado original).'
SELECT count(*) FILTER (WHERE prova_finalizada) AS provas_finalizadas,
       (SELECT count(*) FROM public.prova_unidades WHERE unidade_finalizada) AS unidades_finalizadas
FROM public.provas;
