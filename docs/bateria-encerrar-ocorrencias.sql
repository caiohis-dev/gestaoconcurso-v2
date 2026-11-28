-- Bateria manual de `encerrar_ocorrencias_unidade(p_prova_unidade_id)` — identidade por
-- `auth.uid()`, só coordenador DA UNIDADE ou superadmin, e senha digitada há ≤ 5 min
-- (migration 20261128002649).
-- Rodar contra o banco LOCAL:
--   docker cp docs/bateria-encerrar-ocorrencias.sql supabase_db_<ref>:/tmp/b.sql
--   docker exec supabase_db_<ref> psql -U postgres -d postgres -At -f /tmp/b.sql
--
-- POR QUE ISTO EXISTE: a suíte mocka o Supabase — não exercita RPC, GRANT nem JWT.
-- Esconder o botão na tela é CONVENIÊNCIA; a garantia é a RPC, e só esta bateria a verifica.
--
-- COMO A SESSÃO É SIMULADA: `auth.uid()` lê `sub` e `auth.jwt()` lê o JSON inteiro de
-- `request.jwt.claims` — `set_config(..., true)`, local à transação (mesmo padrão de
-- `bateria-lock-edicao-unidade.sql`). O `amr` imita o que o GoTrue emite, medido em
-- 2026-11-27: `[{"method":"password","timestamp":<epoch do login>}]`.
--
-- Cada recusa afirma o SQLSTATE de quem barrou — OC001 (permissão) e OC002 (senha) têm de
-- ser distinguíveis, senão um caso de senha passaria "recusado" pela regra de permissão.
-- REGRA DA CASA: toda recusa vem com CONTROLE POSITIVO. Tudo em transação com ROLLBACK.
-- Saída esperada: só linhas "OK". Qualquer "FALHOU" é defeito.

\set ON_ERROR_STOP on
\timing off

\echo '── ESTRUTURA ──'
SELECT CASE WHEN to_regprocedure('public.encerrar_ocorrencias_unidade(uuid,uuid)') IS NULL
            THEN 'OK      E1 a assinatura antiga (com p_user_id) não existe mais'
            ELSE 'FALHOU  E1 a assinatura antiga ainda existe' END;
SELECT CASE WHEN has_function_privilege('authenticated', 'public.encerrar_ocorrencias_unidade(uuid)', 'EXECUTE')
            THEN 'OK      E2 authenticated executa' ELSE 'FALHOU  E2 authenticated sem EXECUTE' END;
SELECT CASE WHEN NOT has_function_privilege('anon', 'public.encerrar_ocorrencias_unidade(uuid)', 'EXECUTE')
            THEN 'OK      E3 anon NÃO executa' ELSE 'FALHOU  E3 anon executa' END;

BEGIN;

CREATE TEMP TABLE fx (chave text PRIMARY KEY, id uuid) ON COMMIT DROP;

DO $$
DECLARE
  v_super uuid; v_admin uuid; v_coord uuid; v_coord_outra uuid; v_sem uuid;
  v_prova uuid := gen_random_uuid();
  v_un_a uuid := gen_random_uuid(); v_un_b uuid := gen_random_uuid(); v_un_c uuid := gen_random_uuid();
  v_pu_a uuid := gen_random_uuid(); v_pu_b uuid := gen_random_uuid(); v_pu_c uuid := gen_random_uuid();
  v_col_a uuid := gen_random_uuid(); v_col_b uuid := gen_random_uuid();
  v_cp_a uuid := gen_random_uuid(); v_cp_b uuid := gen_random_uuid();
BEGIN
  SELECT user_id INTO v_super FROM user_roles WHERE role = 'superadmin' ORDER BY user_id LIMIT 1;
  SELECT ur.user_id INTO v_admin FROM user_roles ur
   WHERE ur.role = 'admin'
     AND NOT EXISTS (SELECT 1 FROM user_roles s WHERE s.user_id = ur.user_id AND s.role = 'superadmin')
   ORDER BY ur.user_id LIMIT 1;
  -- Três contas sem papel de gestão: duas viram coordenadoras NESTA prova, uma fica sem vínculo.
  SELECT id INTO v_coord FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('admin','superadmin'))
   ORDER BY id LIMIT 1 OFFSET 0;
  SELECT id INTO v_coord_outra FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('admin','superadmin'))
   ORDER BY id LIMIT 1 OFFSET 1;
  SELECT id INTO v_sem FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('admin','superadmin'))
   ORDER BY id LIMIT 1 OFFSET 2;

  IF v_super IS NULL OR v_admin IS NULL OR v_sem IS NULL THEN
    RAISE EXCEPTION 'fixture: faltam contas no banco local (super=% admin=% sem=%)', v_super, v_admin, v_sem;
  END IF;

  -- A prova foi CRIADA pelo admin: o criador perdeu o direito de encerrar (caso 3).
  INSERT INTO provas (id, prova_edital, created_by) VALUES (v_prova, 'BATERIA ENCERRAR OCORRENCIAS', v_admin);
  INSERT INTO unidades_prova (id, unid_nome, unid_sigla) VALUES
    (v_un_a, 'BATERIA UNIDADE A', 'BTA'), (v_un_b, 'BATERIA UNIDADE B', 'BTB'), (v_un_c, 'BATERIA UNIDADE C', 'BTC');
  INSERT INTO prova_unidades (id, prova_id, unidade_id) VALUES
    (v_pu_a, v_prova, v_un_a), (v_pu_b, v_prova, v_un_b), (v_pu_c, v_prova, v_un_c);

  INSERT INTO colaboradores (id, colab_cpf, colab_data_nascimento, colab_nome_completo) VALUES
    (v_col_a, '52998224725', '1990-01-01', 'BATERIA COORDENADOR A'),
    (v_col_b, '11144477735', '1990-01-01', 'BATERIA COORDENADOR B');
  INSERT INTO colaboradores_prova (id, colaborador_id, prova_unidade_id) VALUES
    (v_cp_a, v_col_a, v_pu_a), (v_cp_b, v_col_b, v_pu_b);
  -- v_coord coordena a unidade A; v_coord_outra coordena a B (MESMA prova, outra unidade).
  INSERT INTO coordenadores_prova (prova_id, colaborador_prova_id, user_id) VALUES
    (v_prova, v_cp_a, v_coord), (v_prova, v_cp_b, v_coord_outra);

  INSERT INTO fx VALUES ('super', v_super), ('admin', v_admin), ('coord', v_coord),
    ('coord_outra', v_coord_outra), ('sem', v_sem), ('pu_a', v_pu_a), ('pu_b', v_pu_b), ('pu_c', v_pu_c);
END $$;

-- Claims de uma sessão: `amr` com método e "há quantos segundos" a senha foi digitada.
CREATE FUNCTION pg_temp.sessao(p_quem text, p_metodo text, p_ha_segundos int) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_quem IS NULL THEN '' ELSE
      json_build_object(
        'sub', (SELECT id FROM fx WHERE chave = p_quem),
        'role', 'authenticated',
        'amr', CASE WHEN p_metodo IS NULL THEN '[]'::json ELSE json_build_array(json_build_object(
          'method', p_metodo,
          'timestamp', extract(epoch FROM now())::bigint - p_ha_segundos)) END
      )::text END,
    true);
END $$;

-- Recusa esperada por um SQLSTATE específico; a escrita indevida é desfeita (BT000).
CREATE FUNCTION pg_temp.deve_recusar(p_caso text, p_esperado text, p_pu text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM public.encerrar_ocorrencias_unidade(coalesce((SELECT id FROM fx WHERE chave = p_pu), gen_random_uuid()));
    RAISE EXCEPTION 'bateria: passou' USING ERRCODE = 'BT000';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'BT000' THEN RETURN 'FALHOU  ' || p_caso || ' — PASSOU, devia ser ' || p_esperado; END IF;
    IF SQLSTATE = p_esperado THEN RETURN 'OK      ' || p_caso || ' — ' || SQLSTATE || ': ' || SQLERRM; END IF;
    RETURN 'FALHOU  ' || p_caso || ' — esperava ' || p_esperado || ', veio ' || SQLSTATE || ': ' || SQLERRM;
  END;
END $$;

CREATE FUNCTION pg_temp.deve_passar(p_caso text, p_pu text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.encerrar_ocorrencias_unidade((SELECT id FROM fx WHERE chave = p_pu));
  RETURN 'OK      ' || p_caso || ' — passou';
EXCEPTION WHEN OTHERS THEN
  RETURN 'FALHOU  ' || p_caso || ' — recusado: ' || SQLSTATE || ' ' || SQLERRM;
END $$;

\echo ''
\echo '── QUEM NÃO PODE (todos COM senha recente — a recusa tem de ser a de permissão) ──'
SELECT pg_temp.sessao(NULL, NULL, 0);
SELECT pg_temp.deve_recusar('1 sem sessão', 'OC000', 'pu_a');
SELECT pg_temp.sessao('admin', 'password', 10);
SELECT pg_temp.deve_recusar('2 admin (não superadmin)', 'OC001', 'pu_a');
SELECT pg_temp.deve_recusar('3 o CRIADOR da prova (é o mesmo admin) — perdeu o direito', 'OC001', 'pu_c');
SELECT pg_temp.sessao('coord_outra', 'password', 10);
SELECT pg_temp.deve_recusar('4 coordenador de OUTRA unidade da mesma prova', 'OC001', 'pu_a');
SELECT pg_temp.sessao('sem', 'password', 10);
SELECT pg_temp.deve_recusar('5 usuário logado sem vínculo', 'OC001', 'pu_a');

\echo ''
\echo '── QUEM PODE, mas sem senha recente ──'
SELECT pg_temp.sessao('coord', NULL, 0);
SELECT pg_temp.deve_recusar('6 coordenador da unidade, token sem amr', 'OC002', 'pu_a');
SELECT pg_temp.sessao('coord', 'password', 600);
SELECT pg_temp.deve_recusar('7 coordenador da unidade, senha há 10 min', 'OC002', 'pu_a');
SELECT pg_temp.sessao('coord', 'otp', 10);
SELECT pg_temp.deve_recusar('8 coordenador da unidade, entrou por LINK há 10 s (otp)', 'OC002', 'pu_a');
SELECT pg_temp.sessao('super', 'recovery', 10);
SELECT pg_temp.deve_recusar('9 superadmin, sessão de recuperação de senha', 'OC002', 'pu_c');

\echo ''
\echo '── CONTROLE POSITIVO ──'
SELECT pg_temp.sessao('coord', 'password', 10);
SELECT pg_temp.deve_passar('10 coordenador DA UNIDADE com senha há 10 s', 'pu_a');
SELECT CASE WHEN pu.ocorrencias_encerradas AND pu.ocorrencias_encerradas_by = (SELECT id FROM fx WHERE chave='coord')
                 AND pu.ocorrencias_encerradas_at IS NOT NULL
            THEN 'OK      11 gravou encerrada, por QUEM (auth.uid) e quando'
            ELSE 'FALHOU  11 gravação: ' || pu.ocorrencias_encerradas || ' by=' || coalesce(pu.ocorrencias_encerradas_by::text,'-') END
  FROM prova_unidades pu WHERE pu.id = (SELECT id FROM fx WHERE chave='pu_a');
SELECT pg_temp.sessao('super', 'password', 290);
SELECT pg_temp.deve_passar('12 superadmin com senha há 4min50s (dentro da janela)', 'pu_c');

\echo ''
\echo '── TRILHA: encerrar de novo não sobrescreve quem fechou ──'
SELECT pg_temp.sessao('super', 'password', 10);
SELECT pg_temp.deve_recusar('13 superadmin re-encerrando a unidade A', 'OC003', 'pu_a');
SELECT CASE WHEN ocorrencias_encerradas_by = (SELECT id FROM fx WHERE chave='coord')
            THEN 'OK      14 a trilha da unidade A segue sendo do coordenador'
            ELSE 'FALHOU  14 a trilha foi sobrescrita' END
  FROM prova_unidades WHERE id = (SELECT id FROM fx WHERE chave='pu_a');
SELECT pg_temp.deve_recusar('15 unidade inexistente', 'P0001', 'nao_existe');

\echo ''
\echo '── A unidade B, sem ninguém autorizado com senha, segue aberta ──'
SELECT CASE WHEN NOT ocorrencias_encerradas THEN 'OK      16 unidade B intacta'
            ELSE 'FALHOU  16 unidade B foi encerrada' END
  FROM prova_unidades WHERE id = (SELECT id FROM fx WHERE chave='pu_b');

ROLLBACK;
