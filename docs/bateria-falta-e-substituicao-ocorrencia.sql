-- Bateria: falta em Nova Ocorrência remove o colaborador da lista de trabalhadores da
-- prova — e a substituição, unificada no mesmo RPC, ganha transação.
-- Migration coberta: 20260923232343_falta_remove_colaborador_da_prova.sql
--   · coluna `ocorrencias_colaborador.falta` + CHECK de exclusividade com `substituido`
--   · colunas `funcao_id_congelada` (RESTRICT) / `valor_pagamento_congelado`
--   · RPC `registrar_ocorrencia_colaborador(...)`
--   · RPC `excluir_ocorrencia_colaborador(uuid)`
-- Escrita em 2026-09-23, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-falta-e-substituicao-ocorrencia.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: um teste lá afirmaria o mock, nunca a transação, a
-- RESTRICT nova nem a autorização por unidade. Isto aqui é a única verificação real — e
-- só existe quando alguém a executa (⚠️ "ela existe" não é "ela passa" — ver CLAUDE.md §5).
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. Os colaboradores e a função
-- usados são 100% SINTÉTICOS (criados e revertidos dentro de cada transação) — só
-- `prova_unidades`/`provas` e um `user_roles` com papel admin vêm do dado real, e o
-- bloco 0 confere que existem. Tudo roda em transação com ROLLBACK: nada sobrevive.
--
-- 🔴 O QUE ESTA BATERIA NÃO PROVA: o aviso de fiscal de sala e o aviso inline no dialog
-- são só de UI (`OcorrenciasProva.tsx`) — não têm contraparte no banco para testar aqui.

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES — sem isto, "passou" não quer dizer nada             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 0.1 As duas funções existem, são SECURITY DEFINER, com search_path fixo'
SELECT p.proname,
       CASE
         WHEN p.prosecdef AND p.proconfig @> ARRAY['search_path=public']
           THEN 'OK — SECURITY DEFINER com search_path fixo'
         WHEN p.oid IS NULL THEN 'FALHOU — a função não existe'
         ELSE 'FALHOU — secdef=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'NULL')
       END AS resultado
FROM (VALUES ('registrar_ocorrencia_colaborador'), ('excluir_ocorrencia_colaborador')) AS f(nome)
LEFT JOIN pg_proc p ON p.proname = f.nome AND p.pronamespace = 'public'::regnamespace;

\echo ''
\echo '-- 0.2 🔴 anon NÃO alcança nenhuma das duas pelo PostgREST; authenticated alcança'
\echo '--     ⚠️ O default do Postgres é EXECUTE para PUBLIC em toda função nova — medido'
\echo '--     que o ALTER DEFAULT PRIVILEGES de 20260908231620 NÃO impede isso sozinho.'
\echo '--     Ver o REVOKE explícito na migration, e o aviso em auth-e-permissoes.md.'
SELECT 'registrar_ocorrencia_colaborador' AS funcao,
       CASE WHEN has_function_privilege('anon', 'public.registrar_ocorrencia_colaborador(uuid,uuid,text,timestamptz,text,text,uuid)', 'EXECUTE')
              OR NOT has_function_privilege('authenticated', 'public.registrar_ocorrencia_colaborador(uuid,uuid,text,timestamptz,text,text,uuid)', 'EXECUTE')
            THEN 'FALHOU — anon executa, ou authenticated não executa'
            ELSE 'OK — anon revogado, authenticated liberado' END AS resultado
UNION ALL
SELECT 'excluir_ocorrencia_colaborador',
       CASE WHEN has_function_privilege('anon', 'public.excluir_ocorrencia_colaborador(uuid)', 'EXECUTE')
              OR NOT has_function_privilege('authenticated', 'public.excluir_ocorrencia_colaborador(uuid)', 'EXECUTE')
            THEN 'FALHOU — anon executa, ou authenticated não executa'
            ELSE 'OK — anon revogado, authenticated liberado' END;

\echo ''
\echo '-- 0.3 As colunas novas existem, com o CHECK de exclusividade'
SELECT CASE WHEN count(*) = 3 THEN 'OK — falta, funcao_id_congelada, valor_pagamento_congelado existem'
            ELSE 'FALHOU — só ' || count(*) || ' das 3 colunas' END AS resultado
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ocorrencias_colaborador'
  AND column_name IN ('falta', 'funcao_id_congelada', 'valor_pagamento_congelado');

SELECT CASE WHEN count(*) = 1 THEN 'OK — CHECK de exclusividade existe'
            ELSE 'FALHOU — chk_ocorrencia_falta_substituicao_mutuamente_exclusivas sumiu' END AS resultado
FROM pg_constraint
WHERE conrelid = 'public.ocorrencias_colaborador'::regclass
  AND conname = 'chk_ocorrencia_falta_substituicao_mutuamente_exclusivas';

\echo ''
\echo '-- 0.4 🔴 `funcao_id_congelada` é RESTRICT, não SET NULL — é o que evita a ambiguidade'
\echo '--     descrita no cabeçalho da migration (NULL só pode significar "sem função")'
SELECT CASE WHEN confdeltype = 'r' THEN 'OK — ON DELETE RESTRICT'
            WHEN confdeltype IS NULL THEN 'FALHOU — a FK sumiu'
            ELSE 'FALHOU — ON DELETE é "' || confdeltype::text || '", não RESTRICT' END AS resultado
FROM pg_constraint
WHERE conrelid = 'public.ocorrencias_colaborador'::regclass
  AND conname = 'ocorrencias_colaborador_funcao_id_congelada_fkey';

\echo ''
\echo '-- 0.5 Fixtures de dado real: pelo menos 1 admin e 2 prova_unidades distintas'
SELECT CASE WHEN (SELECT count(*) FROM public.user_roles WHERE role = 'admin') >= 1
             AND (SELECT count(DISTINCT id) FROM public.prova_unidades) >= 2
            THEN 'OK — há fixture de sobra'
            ELSE 'FALHOU — falta admin ou uma segunda prova_unidade' END AS resultado;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. 🟢 CONTROLE POSITIVO — FALTA remove da lista, congela função/valor ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_coord uuid := gen_random_uuid();
  v_funcao uuid; v_colab_falta uuid; v_colab_coord uuid; v_cp_falta uuid; v_cp_coord uuid;
  v_oc public.ocorrencias_colaborador;
  v_ainda_alocado boolean;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 1: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, created_by)
  VALUES ('BATERIA TESTE — Fiscal', v_admin) RETURNING id INTO v_funcao;

  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE FALTA 1', '99999900001', '1990-01-01') RETURNING id INTO v_colab_falta;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE COORD 1', '99999900002', '1990-01-01') RETURNING id INTO v_colab_coord;

  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
  VALUES (v_pu_a, v_colab_falta, v_funcao, 250.75, v_admin) RETURNING id INTO v_cp_falta;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
  VALUES (v_pu_a, v_colab_coord, NULL, NULL, v_admin) RETURNING id INTO v_cp_coord;

  -- v_coord coordena SÓ v_pu_a (via o vínculo em coordenadores_prova, na alocação de v_colab_coord).
  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord, 'bateria.falta.coord@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_coord, v_coord, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);

  v_oc := public.registrar_ocorrencia_colaborador(
    p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab_falta,
    p_tipo_ocorrencia := 'Falta', p_data_ocorrencia := now(),
    p_descricao := 'Bateria caso 1', p_efeito := 'falta'
  );

  SELECT EXISTS (SELECT 1 FROM public.colaboradores_prova WHERE id = v_cp_falta) INTO v_ainda_alocado;

  IF NOT v_ainda_alocado AND v_oc.falta AND v_oc.substituido = 0 AND v_oc.substituto_id IS NULL
     AND v_oc.funcao_id_congelada = v_funcao AND v_oc.valor_pagamento_congelado = 250.75
  THEN
    RAISE NOTICE 'CASO 1: OK — saiu de colaboradores_prova, ocorrência congelou função e valor certos';
  ELSE
    RAISE NOTICE 'CASO 1: FALHOU — alocado=% falta=% subst=% congelada=% valor=%',
      v_ainda_alocado, v_oc.falta, v_oc.substituido, v_oc.funcao_id_congelada, v_oc.valor_pagamento_congelado;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. 🟢 CONTROLE POSITIVO — excluir a ocorrência REINSTALA o colaborador ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_coord uuid := gen_random_uuid();
  v_funcao uuid; v_colab_falta uuid; v_colab_coord uuid; v_cp_falta uuid; v_cp_coord uuid;
  v_oc public.ocorrencias_colaborador; v_ok boolean;
  v_funcao_depois uuid; v_valor_depois numeric;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 2: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, created_by)
  VALUES ('BATERIA TESTE — Fiscal 2', v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE FALTA 2', '99999900003', '1990-01-01') RETURNING id INTO v_colab_falta;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE COORD 2', '99999900004', '1990-01-01') RETURNING id INTO v_colab_coord;

  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
  VALUES (v_pu_a, v_colab_falta, v_funcao, 300.00, v_admin) RETURNING id INTO v_cp_falta;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
  VALUES (v_pu_a, v_colab_coord, NULL, NULL, v_admin) RETURNING id INTO v_cp_coord;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord, 'bateria.falta.coord@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_coord, v_coord, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);

  v_oc := public.registrar_ocorrencia_colaborador(
    p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab_falta,
    p_tipo_ocorrencia := 'Falta', p_data_ocorrencia := now(),
    p_descricao := 'Bateria caso 2', p_efeito := 'falta'
  );

  PERFORM public.excluir_ocorrencia_colaborador(v_oc.id);

  SELECT funcao_id, valor_pagamento INTO v_funcao_depois, v_valor_depois
    FROM public.colaboradores_prova WHERE prova_unidade_id = v_pu_a AND colaborador_id = v_colab_falta;

  v_ok := v_funcao_depois = v_funcao AND v_valor_depois = 300.00
          AND NOT EXISTS (SELECT 1 FROM public.ocorrencias_colaborador WHERE id = v_oc.id);

  IF v_ok THEN
    RAISE NOTICE 'CASO 2: OK — reinstalado com a MESMA função e valor, ocorrência apagada';
  ELSE
    RAISE NOTICE 'CASO 2: FALHOU — funcao=% (esperado %) valor=% (esperado 300.00)',
      v_funcao_depois, v_funcao, v_valor_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. 🔴 NEGATIVO — unidade que o coordenador NÃO coordena é recusada    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Nada muda: nem a alocação sai, nem a ocorrência é criada.'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_pu_b uuid; v_admin uuid; v_coord uuid := gen_random_uuid();
  v_colab_falta uuid; v_colab_coord uuid; v_cp_falta uuid; v_cp_coord uuid;
  v_msg text; v_estado text; v_ainda_alocado boolean; v_total_oc_antes int; v_total_oc_depois int;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades ORDER BY id LIMIT 1;
  SELECT id INTO v_pu_b FROM public.prova_unidades WHERE id <> v_pu_a ORDER BY id LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_pu_b IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 3: PULADO — sem fixture (precisa de 2 prova_unidades)'; RETURN;
  END IF;

  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE FALTA 3', '99999900005', '1990-01-01') RETURNING id INTO v_colab_falta;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE COORD 3', '99999900006', '1990-01-01') RETURNING id INTO v_colab_coord;

  -- v_colab_falta está alocado em v_pu_b — fora do escopo do coordenador de v_pu_a.
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_b, v_colab_falta, v_admin) RETURNING id INTO v_cp_falta;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab_coord, v_admin) RETURNING id INTO v_cp_coord;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord, 'bateria.falta.coord@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_coord, v_coord, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_total_oc_antes FROM public.ocorrencias_colaborador;

  BEGIN
    PERFORM public.registrar_ocorrencia_colaborador(
      p_prova_unidade_id := v_pu_b, p_colaborador_id := v_colab_falta,
      p_tipo_ocorrencia := 'Falta', p_data_ocorrencia := now(),
      p_descricao := 'Bateria caso 3', p_efeito := 'falta'
    );
    RAISE NOTICE 'CASO 3: FALHOU — o RPC aceitou uma unidade fora do escopo do coordenador';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_estado = RETURNED_SQLSTATE;
    SELECT EXISTS (SELECT 1 FROM public.colaboradores_prova WHERE id = v_cp_falta) INTO v_ainda_alocado;
    SELECT count(*) INTO v_total_oc_depois FROM public.ocorrencias_colaborador;
    IF v_estado = 'P0002' AND v_ainda_alocado AND v_total_oc_depois = v_total_oc_antes THEN
      RAISE NOTICE 'CASO 3: OK — recusado [%], alocação intacta, nenhuma ocorrência criada', v_estado;
    ELSE
      RAISE NOTICE 'CASO 3: FALHOU (OFUSCADO) — estado=% alocado=% oc %->% : %',
        v_estado, v_ainda_alocado, v_total_oc_antes, v_total_oc_depois, v_msg;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. 🔴 NEGATIVO — o titular do vínculo de coordenação não pode faltar   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- É o RESTRICT de 20260726250000 vindo à tona AQUI: prova que a transação inteira'
\echo '-- aborta (nem a ocorrência sobrevive) — o ganho de ter virado RPC.'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_colab_titular uuid; v_cp_titular uuid; v_coord_dummy uuid := gen_random_uuid();
  v_msg text; v_ainda_alocado boolean; v_total_oc_antes int; v_total_oc_depois int;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 4: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE TITULAR 4', '99999900007', '1990-01-01') RETURNING id INTO v_colab_titular;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab_titular, v_admin) RETURNING id INTO v_cp_titular;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord_dummy, 'bateria.falta.coord.dummy@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord_dummy, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_titular, v_coord_dummy, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  -- Quem tenta é o ADMIN — o vínculo bloqueia mesmo para quem tem acesso total.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_total_oc_antes FROM public.ocorrencias_colaborador;

  BEGIN
    PERFORM public.registrar_ocorrencia_colaborador(
      p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab_titular,
      p_tipo_ocorrencia := 'Falta', p_data_ocorrencia := now(),
      p_descricao := 'Bateria caso 4', p_efeito := 'falta'
    );
    RAISE NOTICE 'CASO 4: FALHOU — removeu quem tem acesso de Coordenador desta unidade';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    SELECT EXISTS (SELECT 1 FROM public.colaboradores_prova WHERE id = v_cp_titular) INTO v_ainda_alocado;
    SELECT count(*) INTO v_total_oc_depois FROM public.ocorrencias_colaborador;
    IF v_msg LIKE '%Acesso dos Coordenadores%' AND v_ainda_alocado AND v_total_oc_depois = v_total_oc_antes THEN
      RAISE NOTICE 'CASO 4: OK — recusado nomeando a providência, alocação intacta, SEM ocorrência órfã';
    ELSE
      RAISE NOTICE 'CASO 4: FALHOU (OFUSCADO) — alocado=% oc %->% : %',
        v_ainda_alocado, v_total_oc_antes, v_total_oc_depois, v_msg;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 5. Regressão — a SUBSTITUIÇÃO continua funcionando, agora via RPC     ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_coord uuid := gen_random_uuid();
  v_funcao uuid; v_colab_orig uuid; v_colab_subst uuid; v_colab_coord uuid;
  v_cp_orig uuid; v_cp_coord uuid; v_oc public.ocorrencias_colaborador;
  v_orig_ainda_alocado boolean; v_subst_alocado boolean;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 5: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, created_by)
  VALUES ('BATERIA TESTE — Fiscal 5', v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE ORIGINAL 5', '99999900008', '1990-01-01') RETURNING id INTO v_colab_orig;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE SUBSTITUTO 5', '99999900009', '1990-01-01') RETURNING id INTO v_colab_subst;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE COORD 5', '99999900010', '1990-01-01') RETURNING id INTO v_colab_coord;

  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
  VALUES (v_pu_a, v_colab_orig, v_funcao, 400.00, v_admin) RETURNING id INTO v_cp_orig;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab_coord, v_admin) RETURNING id INTO v_cp_coord;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord, 'bateria.falta.coord@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_coord, v_coord, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);

  v_oc := public.registrar_ocorrencia_colaborador(
    p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab_orig,
    p_tipo_ocorrencia := 'Substituição', p_data_ocorrencia := now(),
    p_descricao := 'Bateria caso 5', p_efeito := 'substituicao', p_substituto_id := v_colab_subst
  );

  SELECT EXISTS (SELECT 1 FROM public.colaboradores_prova WHERE id = v_cp_orig) INTO v_orig_ainda_alocado;
  SELECT EXISTS (SELECT 1 FROM public.colaboradores_prova
                  WHERE prova_unidade_id = v_pu_a AND colaborador_id = v_colab_subst
                    AND funcao_id = v_funcao AND valor_pagamento = 400.00) INTO v_subst_alocado;

  IF NOT v_orig_ainda_alocado AND v_subst_alocado AND v_oc.substituido = 1
     AND v_oc.substituto_id = v_colab_subst AND NOT v_oc.falta
     AND v_oc.funcao_id_congelada = v_funcao AND v_oc.valor_pagamento_congelado = 400.00
  THEN
    RAISE NOTICE 'CASO 5: OK — original saiu, substituto entrou com a mesma função/valor';
  ELSE
    RAISE NOTICE 'CASO 5: FALHOU — orig_alocado=% subst_alocado=% substituido=% falta=%',
      v_orig_ainda_alocado, v_subst_alocado, v_oc.substituido, v_oc.falta;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 6. 🔴 A reversão usa o CONGELADO, não a função ATUAL do substituto    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- É o defeito antigo, ao contrário: o substituto muda de função DEPOIS da'
\echo '-- substituição, e a reversão tem de ignorar essa mudança.'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_coord uuid := gen_random_uuid();
  v_funcao_original uuid; v_funcao_nova uuid;
  v_colab_orig uuid; v_colab_subst uuid; v_colab_coord uuid;
  v_cp_orig uuid; v_cp_coord uuid; v_cp_subst uuid; v_oc public.ocorrencias_colaborador;
  v_funcao_depois uuid; v_valor_depois numeric;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 6: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, created_by)
  VALUES ('BATERIA TESTE — Original 6', v_admin) RETURNING id INTO v_funcao_original;
  INSERT INTO public.funcoes_colaboradores (cargo_nome, created_by)
  VALUES ('BATERIA TESTE — Nova 6', v_admin) RETURNING id INTO v_funcao_nova;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE ORIGINAL 6', '99999900011', '1990-01-01') RETURNING id INTO v_colab_orig;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE SUBSTITUTO 6', '99999900012', '1990-01-01') RETURNING id INTO v_colab_subst;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE COORD 6', '99999900013', '1990-01-01') RETURNING id INTO v_colab_coord;

  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
  VALUES (v_pu_a, v_colab_orig, v_funcao_original, 500.00, v_admin) RETURNING id INTO v_cp_orig;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab_coord, v_admin) RETURNING id INTO v_cp_coord;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord, 'bateria.falta.coord@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_coord, v_coord, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);

  v_oc := public.registrar_ocorrencia_colaborador(
    p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab_orig,
    p_tipo_ocorrencia := 'Substituição', p_data_ocorrencia := now(),
    p_descricao := 'Bateria caso 6', p_efeito := 'substituicao', p_substituto_id := v_colab_subst
  );

  -- O substituto muda de função DEPOIS, como editando pela tela de Gerenciar Colaboradores.
  SELECT id INTO v_cp_subst FROM public.colaboradores_prova
   WHERE prova_unidade_id = v_pu_a AND colaborador_id = v_colab_subst;
  UPDATE public.colaboradores_prova SET funcao_id = v_funcao_nova, valor_pagamento = 999.99
   WHERE id = v_cp_subst;

  PERFORM public.excluir_ocorrencia_colaborador(v_oc.id);

  SELECT funcao_id, valor_pagamento INTO v_funcao_depois, v_valor_depois
    FROM public.colaboradores_prova WHERE prova_unidade_id = v_pu_a AND colaborador_id = v_colab_orig;

  IF v_funcao_depois = v_funcao_original AND v_valor_depois = 500.00 THEN
    RAISE NOTICE 'CASO 6: OK — voltou com a função ORIGINAL congelada, ignorando a mudança do substituto';
  ELSIF v_funcao_depois = v_funcao_nova THEN
    RAISE NOTICE 'CASO 6: FALHOU — voltou com a função NOVA do substituto (o defeito antigo, de volta)';
  ELSE
    RAISE NOTICE 'CASO 6: FALHOU — funcao=% valor=%', v_funcao_depois, v_valor_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 7. O CHECK de exclusividade barra substituido=1 E falta=true JUNTOS   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Insert BRUTO, contornando os dois RPCs — prova que quem segura é o CHECK.'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_colab uuid;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 7: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE CHECK 7', '99999900014', '1990-01-01') RETURNING id INTO v_colab;

  BEGIN
    INSERT INTO public.ocorrencias_colaborador
      (colaborador_id, prova_id, prova_unidade_id, descricao, substituido, falta, created_by)
    SELECT v_colab, prova_id, v_pu_a, 'Bateria caso 7', 1, true, v_admin
    FROM public.prova_unidades WHERE id = v_pu_a;
    RAISE NOTICE 'CASO 7: FALHOU — o banco ACEITOU substituido=1 e falta=true na mesma linha';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 7: OK — CHECK recusou a combinação';
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 8. 🔴 RESTRICT — função referenciada por ocorrência congelada NÃO cai ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Sem isto, DROP na função esvaziaria funcao_id_congelada em silêncio — a mesma'
\echo '-- ambiguidade que o cabeçalho da migration descarta ter de resolver na reversão.'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_coord uuid := gen_random_uuid();
  v_funcao uuid; v_colab_falta uuid; v_colab_coord uuid; v_cp_coord uuid; v_oc public.ocorrencias_colaborador;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 8: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, created_by)
  VALUES ('BATERIA TESTE — Só na congelada 8', v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE FALTA 8', '99999900015', '1990-01-01') RETURNING id INTO v_colab_falta;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE COORD 8', '99999900016', '1990-01-01') RETURNING id INTO v_colab_coord;

  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu_a, v_colab_falta, v_funcao, v_admin);
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab_coord, v_admin) RETURNING id INTO v_cp_coord;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord, 'bateria.falta.coord@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_coord, v_coord, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);

  -- Depois desta chamada, v_funcao só é referenciada pela ocorrência CONGELADA — a
  -- alocação em colaboradores_prova (a outra RESTRICT) já foi removida junto com a falta.
  v_oc := public.registrar_ocorrencia_colaborador(
    p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab_falta,
    p_tipo_ocorrencia := 'Falta', p_data_ocorrencia := now(),
    p_descricao := 'Bateria caso 8', p_efeito := 'falta'
  );

  BEGIN
    DELETE FROM public.funcoes_colaboradores WHERE id = v_funcao;
    RAISE NOTICE 'CASO 8: FALHOU — apagou a função ainda citada por uma ocorrência congelada';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CASO 8: OK — RESTRICT segurou (a função é histórico)';
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 9. Admin registra falta em QUALQUER unidade, sem vínculo de coord.    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_colab uuid; v_oc public.ocorrencias_colaborador;
  v_ainda_alocado boolean;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 9: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE FALTA 9', '99999900017', '1990-01-01') RETURNING id INTO v_colab;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab, v_admin);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_oc := public.registrar_ocorrencia_colaborador(
    p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab,
    p_tipo_ocorrencia := 'Falta', p_data_ocorrencia := now(),
    p_descricao := 'Bateria caso 9', p_efeito := 'falta'
  );

  SELECT EXISTS (SELECT 1 FROM public.colaboradores_prova
                  WHERE prova_unidade_id = v_pu_a AND colaborador_id = v_colab) INTO v_ainda_alocado;

  IF NOT v_ainda_alocado AND v_oc.falta THEN
    RAISE NOTICE 'CASO 9: OK — admin não precisa de vínculo em coordenadores_prova';
  ELSE
    RAISE NOTICE 'CASO 9: FALHOU — alocado=% falta=%', v_ainda_alocado, v_oc.falta;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 10. `efeito = ''nenhum''` continua funcionando (ocorrência comum)      ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Regressão mínima: nem toda ocorrência mexe em colaboradores_prova.'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_coord uuid := gen_random_uuid();
  v_colab uuid; v_colab_coord uuid; v_cp_coord uuid; v_cp_alvo uuid; v_oc public.ocorrencias_colaborador;
  v_ainda_alocado boolean;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 10: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE ATRASO 10', '99999900018', '1990-01-01') RETURNING id INTO v_colab;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE COORD 10', '99999900019', '1990-01-01') RETURNING id INTO v_colab_coord;

  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab, v_admin) RETURNING id INTO v_cp_alvo;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab_coord, v_admin) RETURNING id INTO v_cp_coord;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord, 'bateria.falta.coord@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_coord, v_coord, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);

  v_oc := public.registrar_ocorrencia_colaborador(
    p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab,
    p_tipo_ocorrencia := 'Atraso', p_data_ocorrencia := now(),
    p_descricao := 'Bateria caso 10', p_efeito := 'nenhum'
  );

  SELECT EXISTS (SELECT 1 FROM public.colaboradores_prova WHERE id = v_cp_alvo) INTO v_ainda_alocado;

  IF v_ainda_alocado AND NOT v_oc.falta AND v_oc.substituido = 0 AND v_oc.funcao_id_congelada IS NULL THEN
    RAISE NOTICE 'CASO 10: OK — ocorrência comum não mexeu na alocação';
  ELSE
    RAISE NOTICE 'CASO 10: FALHOU — alocado=% falta=% substituido=%', v_ainda_alocado, v_oc.falta, v_oc.substituido;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 11. `p_efeito` com valor inválido é recusado, não ignorado calado     ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_admin uuid; v_colab uuid; v_msg text;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 11: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE EFEITO 11', '99999900020', '1990-01-01') RETURNING id INTO v_colab;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab, v_admin);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.registrar_ocorrencia_colaborador(
      p_prova_unidade_id := v_pu_a, p_colaborador_id := v_colab,
      p_tipo_ocorrencia := 'Typo', p_data_ocorrencia := now(),
      p_descricao := 'Bateria caso 11', p_efeito := 'faltta'
    );
    RAISE NOTICE 'CASO 11: FALHOU — aceitou um efeito que não existe';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%Efeito de ocorrência inválido%' THEN
      RAISE NOTICE 'CASO 11: OK — recusado por nome, não por erro genérico';
    ELSE
      RAISE NOTICE 'CASO 11: FALHOU (OFUSCADO) — recusou, mas com outra mensagem: %', v_msg;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 12. 🔴 NEGATIVO — excluir ocorrência de OUTRA unidade é recusado      ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- A alocação revertida NÃO acontece: nem a ocorrência, nem colaboradores_prova mudam.'

BEGIN;
DO $$
DECLARE
  v_pu_a uuid; v_pu_b uuid; v_admin uuid; v_coord_a uuid := gen_random_uuid();
  v_colab_falta uuid; v_colab_coord_a uuid; v_cp_coord_a uuid; v_oc public.ocorrencias_colaborador;
  v_msg text; v_estado text; v_ainda_removido boolean; v_oc_ainda_existe boolean;
BEGIN
  SELECT id INTO v_pu_a FROM public.prova_unidades ORDER BY id LIMIT 1;
  SELECT id INTO v_pu_b FROM public.prova_unidades WHERE id <> v_pu_a ORDER BY id LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu_a IS NULL OR v_pu_b IS NULL OR v_admin IS NULL THEN
    RAISE NOTICE 'CASO 12: PULADO — sem fixture'; RETURN;
  END IF;

  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE FALTA 12', '99999900021', '1990-01-01') RETURNING id INTO v_colab_falta;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA TESTE COORD A 12', '99999900022', '1990-01-01') RETURNING id INTO v_colab_coord_a;

  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_b, v_colab_falta, v_admin);
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, created_by)
  VALUES (v_pu_a, v_colab_coord_a, v_admin) RETURNING id INTO v_cp_coord_a;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_coord_a, 'bateria.falta.coord.a@exemplo.test', 'authenticated', 'authenticated', now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_coord_a, 'coordenador');
  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  SELECT v_cp_coord_a, v_coord_a, prova_id, v_admin FROM public.prova_unidades WHERE id = v_pu_a;

  -- Admin registra a falta em v_pu_b (fora do escopo do coordenador de v_pu_a).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_oc := public.registrar_ocorrencia_colaborador(
    p_prova_unidade_id := v_pu_b, p_colaborador_id := v_colab_falta,
    p_tipo_ocorrencia := 'Falta', p_data_ocorrencia := now(),
    p_descricao := 'Bateria caso 12', p_efeito := 'falta'
  );

  -- Agora o coordenador de v_pu_a (SEM vínculo em v_pu_b) tenta excluí-la.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord_a, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.excluir_ocorrencia_colaborador(v_oc.id);
    RAISE NOTICE 'CASO 12: FALHOU — excluiu ocorrência de uma unidade fora do seu escopo';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_estado = RETURNED_SQLSTATE;
    SELECT NOT EXISTS (SELECT 1 FROM public.colaboradores_prova
                        WHERE prova_unidade_id = v_pu_b AND colaborador_id = v_colab_falta) INTO v_ainda_removido;
    SELECT EXISTS (SELECT 1 FROM public.ocorrencias_colaborador WHERE id = v_oc.id) INTO v_oc_ainda_existe;
    IF v_estado = 'P0002' AND v_ainda_removido AND v_oc_ainda_existe THEN
      RAISE NOTICE 'CASO 12: OK — recusado [%], nada revertido, ocorrência intacta', v_estado;
    ELSE
      RAISE NOTICE 'CASO 12: FALHOU (OFUSCADO) — estado=% removido=% oc_existe=% : %',
        v_estado, v_ainda_removido, v_oc_ainda_existe, v_msg;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- FIM. Nenhuma linha sobreviveu: tudo rodou em transação com ROLLBACK.'
\echo ''
