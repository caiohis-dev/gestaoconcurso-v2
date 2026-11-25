-- Bateria: trilha do "Resetar senha" do superadmin
-- Migration coberta: 20261125161819_trilha_reset_senha_colaborador.sql
--   · tabela `log_reset_senha` (+ RLS, GRANTs, FKs SET NULL)
-- Escrita em 2026-11-25, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-log-reset-senha.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase; a RLS e as FKs só se provam contra o banco. A EF
-- `resetar-senha-colaborador` tem teste de integração próprio (Deno), que prova a
-- AUTORIZAÇÃO da função; esta bateria prova quem LÊ a trilha e que ela SOBREVIVE.
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. Fixtures dinâmicas; tudo em
-- transação com ROLLBACK.

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES                                                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo '-- 0.1 A tabela existe com RLS ligada'
SELECT CASE WHEN c.relrowsecurity THEN 'OK — log_reset_senha com RLS ligada'
            ELSE 'FALHOU — RLS DESLIGADA' END AS resultado
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'log_reset_senha';

\echo '-- 0.2 anon não tem privilégio nenhum; authenticated só SELECT; service_role escreve'
SELECT CASE
         WHEN NOT has_table_privilege('anon', 'public.log_reset_senha', 'SELECT')
          AND NOT has_table_privilege('anon', 'public.log_reset_senha', 'INSERT')
          AND has_table_privilege('authenticated', 'public.log_reset_senha', 'SELECT')
          AND NOT has_table_privilege('authenticated', 'public.log_reset_senha', 'INSERT')
          AND NOT has_table_privilege('authenticated', 'public.log_reset_senha', 'UPDATE')
          AND NOT has_table_privilege('authenticated', 'public.log_reset_senha', 'DELETE')
          AND has_table_privilege('service_role', 'public.log_reset_senha', 'INSERT')
           THEN 'OK — GRANTs como desenhados'
         ELSE 'FALHOU — anon_sel=' || has_table_privilege('anon', 'public.log_reset_senha', 'SELECT')
              || ' auth_ins=' || has_table_privilege('authenticated', 'public.log_reset_senha', 'INSERT')
              || ' auth_upd=' || has_table_privilege('authenticated', 'public.log_reset_senha', 'UPDATE')
              || ' auth_del=' || has_table_privilege('authenticated', 'public.log_reset_senha', 'DELETE')
       END AS resultado;

\echo '-- 0.3 As três FKs são SET NULL (trilha não evapora, e não trava exclusão)'
SELECT CASE WHEN count(*) = 3 AND bool_and(confdeltype = 'n')
            THEN 'OK — 3 FKs, todas ON DELETE SET NULL'
            ELSE 'FALHOU — fks=' || count(*) || ' tipos=' || string_agg(confdeltype::text, ',') END AS resultado
FROM pg_constraint
WHERE conrelid = 'public.log_reset_senha'::regclass AND contype = 'f';

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. Quem LÊ a trilha                                                    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- 🔴 CONTROLE POSITIVO: o superadmin lê — e um superadmin SEM linha admin, que é'
\echo '--    o caso que o SELECT literal em user_roles já quebrou 3 vezes. As contas'
\echo '--    superadmin do banco local também têm linha admin; usá-las cruas não provaria'
\echo '--    nada, então a linha admin é apagada DENTRO da transação.'

BEGIN;
DO $$
DECLARE
  v_sa uuid; v_admin uuid; v_comum uuid;
  n_sa int; n_admin int; n_comum int;
BEGIN
  SELECT user_id INTO v_sa FROM public.user_roles WHERE role = 'superadmin' LIMIT 1;
  SELECT ur.user_id INTO v_admin FROM public.user_roles ur
   WHERE ur.role = 'admin'
     AND NOT EXISTS (SELECT 1 FROM public.user_roles s WHERE s.user_id = ur.user_id AND s.role = 'superadmin')
   LIMIT 1;
  SELECT ur.user_id INTO v_comum FROM public.user_roles ur
   WHERE ur.role = 'colaborador'
     AND NOT EXISTS (SELECT 1 FROM public.user_roles g WHERE g.user_id = ur.user_id
                      AND g.role IN ('superadmin','admin','coordenador','financeiro'))
   LIMIT 1;
  IF v_sa IS NULL OR v_admin IS NULL OR v_comum IS NULL THEN
    RAISE NOTICE 'CASO 1: PULADO — sem fixture (sa=% admin=% comum=%)', v_sa, v_admin, v_comum; RETURN;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_sa AND role = 'admin';

  INSERT INTO public.log_reset_senha (colab_nome, alvo_user_id, executado_por)
  VALUES ('FIXTURE BATERIA', v_comum, v_sa);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sa, 'role','authenticated')::text, true);
  SELECT count(*) INTO n_sa FROM public.log_reset_senha;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  SELECT count(*) INTO n_admin FROM public.log_reset_senha;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum, 'role','authenticated')::text, true);
  SELECT count(*) INTO n_comum FROM public.log_reset_senha;
  RESET ROLE;

  IF n_sa >= 1 AND n_admin = 0 AND n_comum = 0 THEN
    RAISE NOTICE 'CASO 1: OK — superadmin (sem linha admin) vê %, admin vê 0, colaborador vê 0', n_sa;
  ELSE
    RAISE NOTICE 'CASO 1: FALHOU — superadmin=% admin=% colaborador=%', n_sa, n_admin, n_comum;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. Ninguém ESCREVE na trilha pelo PostgREST — nem o superadmin         ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Quem escreve é só a EF (service_role). Um superadmin que pudesse apagar a'
\echo '-- própria linha tornaria a trilha decorativa.'

BEGIN;
DO $$
DECLARE v_sa uuid; v_erro_ins text; v_erro_del text;
BEGIN
  SELECT user_id INTO v_sa FROM public.user_roles WHERE role = 'superadmin' LIMIT 1;
  IF v_sa IS NULL THEN RAISE NOTICE 'CASO 2: PULADO — sem superadmin'; RETURN; END IF;
  INSERT INTO public.log_reset_senha (colab_nome, executado_por) VALUES ('FIXTURE', v_sa);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sa, 'role','authenticated')::text, true);
  BEGIN
    INSERT INTO public.log_reset_senha (colab_nome) VALUES ('forjado');
  EXCEPTION WHEN OTHERS THEN v_erro_ins := SQLSTATE;
  END;
  BEGIN
    DELETE FROM public.log_reset_senha;
  EXCEPTION WHEN OTHERS THEN v_erro_del := SQLSTATE;
  END;
  RESET ROLE;

  IF v_erro_ins = '42501' AND v_erro_del = '42501' THEN
    RAISE NOTICE 'CASO 2: OK — INSERT e DELETE recusados por privilégio (42501)';
  ELSE
    RAISE NOTICE 'CASO 2: FALHOU — insert=% delete=%', v_erro_ins, v_erro_del;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. anon não lê                                                         ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE v_erro text;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.log_reset_senha LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_erro := SQLSTATE;
  END;
  RESET ROLE;
  IF v_erro = '42501' THEN RAISE NOTICE 'CASO 3: OK — anon recusado (42501)';
  ELSE RAISE NOTICE 'CASO 3: FALHOU — anon leu (erro=%)', v_erro; END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. Apagar o cadastro NÃO apaga a trilha — e a trilha NÃO trava a exclusão ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Controle positivo dos dois lados: a exclusão PASSA (RESTRICT a travaria) e a'
\echo '-- linha FICA, legível pelo snapshot do nome (CASCADE a levaria).'

BEGIN;
DO $$
DECLARE v_colab uuid; v_restou int; v_nome text; v_fk uuid;
BEGIN
  INSERT INTO public.colaboradores (colab_nome_completo, colab_cpf, colab_data_nascimento)
  VALUES ('FIXTURE RESET SENHA', '99988877766', '1990-01-01')
  RETURNING id INTO v_colab;
  INSERT INTO public.log_reset_senha (colaborador_id, colab_nome) VALUES (v_colab, 'FIXTURE RESET SENHA');

  DELETE FROM public.colaboradores WHERE id = v_colab;

  SELECT count(*), max(colab_nome), max(colaborador_id::text)::uuid INTO v_restou, v_nome, v_fk
    FROM public.log_reset_senha WHERE colab_nome = 'FIXTURE RESET SENHA';
  IF v_restou = 1 AND v_fk IS NULL AND v_nome = 'FIXTURE RESET SENHA' THEN
    RAISE NOTICE 'CASO 4: OK — colaborador excluído, trilha ficou com colaborador_id NULL e o nome';
  ELSE
    RAISE NOTICE 'CASO 4: FALHOU — restou=% fk=% nome=%', v_restou, v_fk, v_nome;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'CASO 4: FALHOU — a exclusão foi recusada: % (%)', SQLERRM, SQLSTATE;
END $$;
ROLLBACK;
