-- Bateria: "fiscal de sala" é uma MARCAÇÃO da função, e o banco recusa fiscal inválido.
-- Migration coberta: 20261009004823_fiscal_de_sala_marcado_na_funcao.sql
--   · coluna `funcoes_colaboradores.fiscal_de_sala` + a "Fiscal" de referência marcada
--   · triggers por comando `check_fiscais_de_sala_insert/_update` em salas_prova_distribuidas
--       FS001 função não marcada · FS002 fiscal em duas salas (ou nos dois postos) · FS003 outra prova
-- Escrita em 2026-10-08, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-fiscal-de-sala.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: não alcança trigger nenhum. E cada recusa aqui afirma
-- o SQLSTATE de quem barrou — três códigos convivem no mesmo trigger, e uma recusa pelo
-- motivo errado passaria por "recusou" (CLAUDE.md §8, a CHECK que ofuscou outra).
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. Funções, colaboradores e salas
-- são SINTÉTICOS (criados e revertidos em cada transação); só `provas`/`prova_unidades` e
-- um admin vêm do dado real. Tudo em transação com ROLLBACK.
--
-- 🔴 O QUE ESTA BATERIA NÃO PROVA: a serialização de duas gravações SIMULTÂNEAS (o
-- FOR UPDATE na alocação). Exige duas sessões concorrentes; aqui há uma só.

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES — sem isto, "passou" não quer dizer nada             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

SELECT CASE WHEN count(*) = 1 THEN 'OK — coluna fiscal_de_sala existe'
            ELSE 'FALHOU — coluna fiscal_de_sala não existe' END AS resultado
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'funcoes_colaboradores' AND column_name = 'fiscal_de_sala';

SELECT CASE WHEN fiscal_de_sala THEN 'OK — a função de referência "Fiscal" está marcada'
            ELSE 'FALHOU — "Fiscal" existe mas está desmarcada' END AS resultado
FROM public.funcoes_colaboradores WHERE id = 'd62fe957-3868-4d8d-bd61-848a09396088';

SELECT CASE WHEN count(*) = 2 THEN 'OK — os dois triggers por comando existem'
            ELSE 'FALHOU — só ' || count(*) || ' dos 2 triggers' END AS resultado
FROM pg_trigger
WHERE tgrelid = 'public.salas_prova_distribuidas'::regclass
  AND tgname IN ('check_fiscais_de_sala_insert', 'check_fiscais_de_sala_update');

SELECT CASE WHEN has_function_privilege('anon', 'public.recusa_fiscal_de_sala_invalido(uuid,uuid)', 'EXECUTE')
              OR has_function_privilege('authenticated', 'public.recusa_fiscal_de_sala_invalido(uuid,uuid)', 'EXECUTE')
            THEN 'FALHOU — a função auxiliar é executável pela API'
            ELSE 'OK — a função auxiliar não é RPC' END AS resultado;

SELECT CASE WHEN EXISTS (
         SELECT 1 FROM public.prova_unidades pu JOIN public.provas p ON p.id = pu.prova_id
          WHERE NOT coalesce(p.prova_finalizada, false) AND NOT coalesce(pu.unidade_finalizada, false))
            THEN 'OK — há unidade aberta para as fixtures'
            ELSE 'FALHOU — nenhuma unidade aberta: os casos serão PULADOS' END AS resultado;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. 🟢 CONTROLE POSITIVO — função marcada vira fiscal                   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_pu uuid; v_prova uuid; v_unidade uuid; v_admin uuid; v_funcao uuid;
  v_colab uuid; v_cp uuid; v_sala uuid; v_f1 uuid;
BEGIN
  SELECT pu.id, pu.prova_id, pu.unidade_id INTO v_pu, v_prova, v_unidade
    FROM public.prova_unidades pu JOIN public.provas p ON p.id = pu.prova_id
   WHERE NOT coalesce(p.prova_finalizada, false) AND NOT coalesce(pu.unidade_finalizada, false) LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu IS NULL THEN RAISE NOTICE 'CASO 1: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, fiscal_de_sala, created_by)
  VALUES ('BATERIA FS — marcada 1', true, v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA FS 1', '99999901011', '1990-01-01') RETURNING id INTO v_colab;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu, v_colab, v_funcao, v_admin) RETURNING id INTO v_cp;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade)
  VALUES (v_prova, v_unidade, 9201, 30) RETURNING id INTO v_sala;

  UPDATE public.salas_prova_distribuidas SET sala_fiscal_1 = v_cp WHERE id = v_sala;
  SELECT sala_fiscal_1 INTO v_f1 FROM public.salas_prova_distribuidas WHERE id = v_sala;

  IF v_f1 = v_cp THEN
    RAISE NOTICE 'CASO 1: OK — atribuído';
  ELSE
    RAISE NOTICE 'CASO 1: FALHOU — fiscal=%', v_f1;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. 🔴 Função NÃO marcada é recusada — FS001, no UPDATE e no INSERT     ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_pu uuid; v_prova uuid; v_unidade uuid; v_admin uuid; v_funcao uuid;
  v_colab uuid; v_cp uuid; v_sala uuid; v_f1 uuid;
  v_estado_upd text; v_estado_ins text; v_msg text;
BEGIN
  SELECT pu.id, pu.prova_id, pu.unidade_id INTO v_pu, v_prova, v_unidade
    FROM public.prova_unidades pu JOIN public.provas p ON p.id = pu.prova_id
   WHERE NOT coalesce(p.prova_finalizada, false) AND NOT coalesce(pu.unidade_finalizada, false) LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu IS NULL THEN RAISE NOTICE 'CASO 2: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, fiscal_de_sala, created_by)
  VALUES ('BATERIA FS — desmarcada 2', false, v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA FS 2', '99999901021', '1990-01-01') RETURNING id INTO v_colab;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu, v_colab, v_funcao, v_admin) RETURNING id INTO v_cp;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade)
  VALUES (v_prova, v_unidade, 9202, 30) RETURNING id INTO v_sala;

  BEGIN
    UPDATE public.salas_prova_distribuidas SET sala_fiscal_1 = v_cp WHERE id = v_sala;
    v_estado_upd := 'PASSOU';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado_upd = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  BEGIN
    INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade, sala_fiscal_2)
    VALUES (v_prova, v_unidade, 9203, 30, v_cp);
    v_estado_ins := 'PASSOU';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado_ins = RETURNED_SQLSTATE;
  END;

  SELECT sala_fiscal_1 INTO v_f1 FROM public.salas_prova_distribuidas WHERE id = v_sala;

  IF v_estado_upd = 'FS001' AND v_estado_ins = 'FS001' AND v_f1 IS NULL
     AND v_msg LIKE '%BATERIA FS — desmarcada 2%' THEN
    RAISE NOTICE 'CASO 2: OK — recusado [FS001] nos dois caminhos, nomeando a função; sala intacta';
  ELSE
    RAISE NOTICE 'CASO 2: FALHOU — upd=% ins=% fiscal=% : %', v_estado_upd, v_estado_ins, v_f1, v_msg;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. 🔴 A mesma pessoa em salas de DUAS UNIDADES da prova — FS002        ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Era o furo da tela: a deduplicação só olhava as salas da unidade aberta.'

BEGIN;
DO $$
DECLARE
  v_prova uuid; v_pu_a uuid; v_un_a uuid; v_un_b uuid; v_admin uuid; v_funcao uuid;
  v_colab uuid; v_cp uuid; v_sala_a uuid; v_sala_b uuid; v_f1_b uuid;
  v_estado text; v_msg text;
BEGIN
  SELECT pu.prova_id INTO v_prova
    FROM public.prova_unidades pu JOIN public.provas p ON p.id = pu.prova_id
   WHERE NOT coalesce(p.prova_finalizada, false) AND NOT coalesce(pu.unidade_finalizada, false)
   GROUP BY pu.prova_id HAVING count(*) >= 2 LIMIT 1;
  IF v_prova IS NULL THEN RAISE NOTICE 'CASO 3: PULADO — nenhuma prova com 2 unidades abertas'; RETURN; END IF;
  SELECT id, unidade_id INTO v_pu_a, v_un_a FROM public.prova_unidades
   WHERE prova_id = v_prova AND NOT coalesce(unidade_finalizada, false) ORDER BY id LIMIT 1;
  SELECT unidade_id INTO v_un_b FROM public.prova_unidades
   WHERE prova_id = v_prova AND NOT coalesce(unidade_finalizada, false) AND unidade_id <> v_un_a ORDER BY id LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, fiscal_de_sala, created_by)
  VALUES ('BATERIA FS — marcada 3', true, v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA FS 3', '99999901031', '1990-01-01') RETURNING id INTO v_colab;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu_a, v_colab, v_funcao, v_admin) RETURNING id INTO v_cp;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade, sala_fiscal_1)
  VALUES (v_prova, v_un_a, 9301, 30, v_cp) RETURNING id INTO v_sala_a;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade)
  VALUES (v_prova, v_un_b, 9302, 30) RETURNING id INTO v_sala_b;

  BEGIN
    UPDATE public.salas_prova_distribuidas SET sala_fiscal_1 = v_cp WHERE id = v_sala_b;
    v_estado := 'PASSOU';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  SELECT sala_fiscal_1 INTO v_f1_b FROM public.salas_prova_distribuidas WHERE id = v_sala_b;

  IF v_estado = 'FS002' AND v_f1_b IS NULL AND v_msg LIKE '%sala 9301%' THEN
    RAISE NOTICE 'CASO 3: OK — recusado [FS002] nomeando a sala de origem; a outra unidade ficou intacta';
  ELSE
    RAISE NOTICE 'CASO 3: FALHOU — estado=% fiscal_b=% : %', v_estado, v_f1_b, v_msg;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. 🔴 Fiscal 1 e Fiscal 2 da MESMA sala — FS002, mensagem própria       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_pu uuid; v_prova uuid; v_unidade uuid; v_admin uuid; v_funcao uuid;
  v_colab uuid; v_cp uuid; v_sala uuid; v_estado text; v_msg text;
BEGIN
  SELECT pu.id, pu.prova_id, pu.unidade_id INTO v_pu, v_prova, v_unidade
    FROM public.prova_unidades pu JOIN public.provas p ON p.id = pu.prova_id
   WHERE NOT coalesce(p.prova_finalizada, false) AND NOT coalesce(pu.unidade_finalizada, false) LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu IS NULL THEN RAISE NOTICE 'CASO 4: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, fiscal_de_sala, created_by)
  VALUES ('BATERIA FS — marcada 4', true, v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA FS 4', '99999901041', '1990-01-01') RETURNING id INTO v_colab;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu, v_colab, v_funcao, v_admin) RETURNING id INTO v_cp;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade)
  VALUES (v_prova, v_unidade, 9401, 30) RETURNING id INTO v_sala;

  BEGIN
    UPDATE public.salas_prova_distribuidas SET sala_fiscal_1 = v_cp, sala_fiscal_2 = v_cp WHERE id = v_sala;
    v_estado := 'PASSOU';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  IF v_estado = 'FS002' AND v_msg LIKE '%Fiscal 1 e Fiscal 2 da mesma sala%' THEN
    RAISE NOTICE 'CASO 4: OK — recusado [FS002] com a mensagem da mesma sala';
  ELSE
    RAISE NOTICE 'CASO 4: FALHOU — estado=% : %', v_estado, v_msg;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 5. 🟢 CONTROLE POSITIVO — TROCAR fiscais entre duas salas num lote só   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- É o que obrigou o trigger a ser AFTER: um BEFORE ... FOR EACH ROW veria Y ainda em B'
\echo '-- ao gravar A e recusaria a troca no meio. Falsificado em 08/10: a versão BEFORE ROW'
\echo '-- reprova este caso. (AFTER ROW passaria também — ele só dispara no fim do comando.)'

BEGIN;
DO $$
DECLARE
  v_pu uuid; v_prova uuid; v_unidade uuid; v_admin uuid; v_funcao uuid;
  v_x uuid; v_y uuid; v_cp_x uuid; v_cp_y uuid; v_sala_a uuid; v_sala_b uuid;
  v_fa uuid; v_fb uuid; v_estado text; v_msg text;
BEGIN
  SELECT pu.id, pu.prova_id, pu.unidade_id INTO v_pu, v_prova, v_unidade
    FROM public.prova_unidades pu JOIN public.provas p ON p.id = pu.prova_id
   WHERE NOT coalesce(p.prova_finalizada, false) AND NOT coalesce(pu.unidade_finalizada, false) LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu IS NULL OR v_admin IS NULL THEN RAISE NOTICE 'CASO 5: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, fiscal_de_sala, created_by)
  VALUES ('BATERIA FS — marcada 5', true, v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA FS 5X', '99999901051', '1990-01-01') RETURNING id INTO v_x;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA FS 5Y', '99999901052', '1990-01-01') RETURNING id INTO v_y;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu, v_x, v_funcao, v_admin) RETURNING id INTO v_cp_x;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu, v_y, v_funcao, v_admin) RETURNING id INTO v_cp_y;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade, sala_fiscal_1)
  VALUES (v_prova, v_unidade, 9501, 30, v_cp_x) RETURNING id INTO v_sala_a;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade, sala_fiscal_1)
  VALUES (v_prova, v_unidade, 9502, 30, v_cp_y) RETURNING id INTO v_sala_b;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.salvar_salas_distribuidas(jsonb_build_array(
      jsonb_build_object('id', v_sala_a, 'sala_numero', 9501, 'sala_capacidade', 30, 'sala_fiscal_1', v_cp_y),
      jsonb_build_object('id', v_sala_b, 'sala_numero', 9502, 'sala_capacidade', 30, 'sala_fiscal_1', v_cp_x)
    ));
    v_estado := 'PASSOU';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  SELECT sala_fiscal_1 INTO v_fa FROM public.salas_prova_distribuidas WHERE id = v_sala_a;
  SELECT sala_fiscal_1 INTO v_fb FROM public.salas_prova_distribuidas WHERE id = v_sala_b;

  IF v_estado = 'PASSOU' AND v_fa = v_cp_y AND v_fb = v_cp_x THEN
    RAISE NOTICE 'CASO 5: OK — a troca passou pela RPC de salvamento';
  ELSE
    RAISE NOTICE 'CASO 5: FALHOU — estado=% A=% B=% : %', v_estado, v_fa, v_fb, v_msg;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 6. 🔴 Alocação de OUTRA prova — FS003                                   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_prova uuid; v_unidade uuid; v_pu_outra uuid; v_admin uuid; v_funcao uuid;
  v_colab uuid; v_cp uuid; v_sala uuid; v_estado text; v_msg text;
BEGIN
  SELECT pu.prova_id, pu.unidade_id INTO v_prova, v_unidade
    FROM public.prova_unidades pu JOIN public.provas p ON p.id = pu.prova_id
   WHERE NOT coalesce(p.prova_finalizada, false) AND NOT coalesce(pu.unidade_finalizada, false) LIMIT 1;
  SELECT id INTO v_pu_outra FROM public.prova_unidades WHERE prova_id <> v_prova LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_prova IS NULL OR v_pu_outra IS NULL THEN RAISE NOTICE 'CASO 6: PULADO — falta uma segunda prova'; RETURN; END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, fiscal_de_sala, created_by)
  VALUES ('BATERIA FS — marcada 6', true, v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA FS 6', '99999901061', '1990-01-01') RETURNING id INTO v_colab;
  -- Função MARCADA de propósito: a única coisa errada é a prova, então a recusa só pode
  -- ser FS003 — se viesse FS001, o caso estaria ofuscado.
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu_outra, v_colab, v_funcao, v_admin) RETURNING id INTO v_cp;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade)
  VALUES (v_prova, v_unidade, 9601, 30) RETURNING id INTO v_sala;

  BEGIN
    UPDATE public.salas_prova_distribuidas SET sala_fiscal_1 = v_cp WHERE id = v_sala;
    v_estado := 'PASSOU';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  IF v_estado = 'FS003' THEN
    RAISE NOTICE 'CASO 6: OK — recusado [FS003]';
  ELSE
    RAISE NOTICE 'CASO 6: FALHOU — estado=% : %', v_estado, v_msg;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 7. 🟢 CONTROLE POSITIVO — só o posto que MUDOU é conferido              ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Fiscal atribuído e função desmarcada depois: editar a capacidade da sala NÃO reprova.'

BEGIN;
DO $$
DECLARE
  v_pu uuid; v_prova uuid; v_unidade uuid; v_admin uuid; v_funcao uuid;
  v_colab uuid; v_cp uuid; v_sala uuid; v_cap integer; v_estado text; v_msg text;
BEGIN
  SELECT pu.id, pu.prova_id, pu.unidade_id INTO v_pu, v_prova, v_unidade
    FROM public.prova_unidades pu JOIN public.provas p ON p.id = pu.prova_id
   WHERE NOT coalesce(p.prova_finalizada, false) AND NOT coalesce(pu.unidade_finalizada, false) LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_pu IS NULL THEN RAISE NOTICE 'CASO 7: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO public.funcoes_colaboradores (cargo_nome, fiscal_de_sala, created_by)
  VALUES ('BATERIA FS — marcada 7', true, v_admin) RETURNING id INTO v_funcao;
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('BATERIA FS 7', '99999901071', '1990-01-01') RETURNING id INTO v_colab;
  INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, created_by)
  VALUES (v_pu, v_colab, v_funcao, v_admin) RETURNING id INTO v_cp;
  INSERT INTO public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade, sala_fiscal_1)
  VALUES (v_prova, v_unidade, 9701, 30, v_cp) RETURNING id INTO v_sala;

  UPDATE public.funcoes_colaboradores SET fiscal_de_sala = false WHERE id = v_funcao;

  BEGIN
    UPDATE public.salas_prova_distribuidas SET sala_capacidade = 31 WHERE id = v_sala;
    v_estado := 'PASSOU';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  SELECT sala_capacidade INTO v_cap FROM public.salas_prova_distribuidas WHERE id = v_sala;

  IF v_estado = 'PASSOU' AND v_cap = 31 THEN
    RAISE NOTICE 'CASO 7: OK — a edição passou, o fiscal antigo não foi reconferido';
  ELSE
    RAISE NOTICE 'CASO 7: FALHOU — estado=% capacidade=% : %', v_estado, v_cap, v_msg;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '-- FIM. Nenhuma linha sobreviveu: tudo rodou em transação com ROLLBACK.'
\echo ''
