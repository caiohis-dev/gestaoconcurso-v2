-- Bateria: totais_do_dashboard() — os dois cards do /dashboard agregados no banco.
-- Migration coberta: 20260925005346_totais_do_dashboard.sql
--   ⚠️ o nome do arquivo é UTC; a sessão que a escreveu foi 2026-09-24 local
-- Escrita em 2026-09-24, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i \$(docker ps --format '{{.Names}}' | grep supabase_db) \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1" < docs/bateria-totais-do-dashboard.sql
--   Toda linha de resultado começa com OK ou FALHOU.
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: o teste do Dashboard afirma o que a TELA faz com os
-- números, nunca o que a função calcula nem o que a RLS deixa ela ver. Isto é a única
-- verificação da função — e só existe quando alguém a executa.
--
-- 🔴 O CASO QUE MAIS IMPORTA É O DO COORDENADOR (bloco 3): é ele que prova o SECURITY
-- INVOKER. Com DEFINER, a função leria `colaboradores_prova` inteira para qualquer conta
-- autenticada — recorte de tela virando vazamento. Falsificado ao escrever: recriar a
-- função como DEFINER faz o caso 3.1 cair.
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. Fixtures escolhidas do dado real;
-- tudo numa transação com ROLLBACK, e cada caso que escreve num SAVEPOINT próprio.

\set ON_ERROR_STOP on
\timing off
\pset tuples_only on
\pset format unaligned

BEGIN;

\o /dev/null
-- ADMIN: conta com papel admin. COORD: coordenador de prova SEM papel de admin (senão a RLS
-- o deixaria ver tudo e o caso 3 não distinguiria INVOKER de DEFINER).
SELECT set_config('bat.admin', (SELECT user_id::text FROM user_roles WHERE role = 'admin' LIMIT 1), true),
       set_config('bat.coord', (
         SELECT cp.user_id::text FROM coordenadores_prova cp
          WHERE NOT EXISTS (SELECT 1 FROM user_roles r
                             WHERE r.user_id = cp.user_id AND r.role IN ('admin', 'superadmin'))
          LIMIT 1), true);
\o

-- Chama a função COMO `p_uid` e devolve 'atuaram|capacidade'.
CREATE FUNCTION pg_temp.como(p_uid text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT t.colaboradores_atuaram || '|' || t.capacidade_total INTO r
    FROM public.totais_do_dashboard() t;
  PERFORM set_config('role', 'postgres', true);
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;

CREATE FUNCTION pg_temp.conferir(p_caso text, p_obtido text, p_esperado text)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_obtido = p_esperado THEN 'OK — ' || p_caso
              ELSE 'FALHOU — ' || p_caso || E'\n    esperado: ' || coalesce(p_esperado, 'NULL')
                   || E'\n    obtido:   ' || coalesce(p_obtido, 'NULL') END
$$;

-- A verdade, calculada direto nas tabelas como superusuário.
CREATE FUNCTION pg_temp.verdade() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT count(DISTINCT colaborador_id) FROM colaboradores_prova) || '|' ||
         (SELECT coalesce(sum(sala_capacidade), 0) FROM sala_prova)
$$;

\echo ''
\echo '── 0. PRÉ-CONDIÇÕES'
SELECT CASE WHEN current_setting('bat.admin', true) <> '' AND current_setting('bat.coord', true) <> ''
            THEN 'OK — há admin e coordenador-sem-admin para as fixtures'
            ELSE 'FALHOU — sem fixture; nada abaixo significa coisa alguma' END;
SELECT CASE WHEN NOT p.prosecdef THEN 'OK — a função é SECURITY INVOKER'
            ELSE 'FALHOU — a função é SECURITY DEFINER' END
  FROM pg_proc p WHERE p.oid = 'public.totais_do_dashboard()'::regprocedure;
SELECT CASE WHEN NOT has_function_privilege('anon', 'public.totais_do_dashboard()', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.totais_do_dashboard()', 'EXECUTE')
            THEN 'OK — anon NÃO executa; authenticated executa'
            ELSE 'FALHOU — permissões erradas' END;
SELECT CASE WHEN (SELECT count(*) FROM colaboradores_prova) > 0
            THEN 'OK — colaboradores_prova tem ' || (SELECT count(*) FROM colaboradores_prova) || ' linhas'
            ELSE 'FALHOU — tabela vazia; a soma não prova nada' END;

\echo ''
\echo '── 1. ADMIN: os números batem com a agregação direta'
SELECT pg_temp.conferir('admin vê ' || pg_temp.verdade() || ' (atuaram|capacidade)',
  pg_temp.como(current_setting('bat.admin')), pg_temp.verdade());

\echo ''
\echo '── 2. CONTROLE POSITIVO: a contagem é de DISTINTOS'
SAVEPOINT c2;
\o /dev/null
SELECT set_config('bat.antes', split_part(pg_temp.como(current_setting('bat.admin')), '|', 1), true);
\o
-- Colaborador que NUNCA atuou, alocado numa unidade qualquer → +1.
INSERT INTO colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id)
SELECT (SELECT id FROM prova_unidades LIMIT 1),
       (SELECT c.id FROM colaboradores c
         WHERE NOT EXISTS (SELECT 1 FROM colaboradores_prova x WHERE x.colaborador_id = c.id) LIMIT 1),
       (SELECT id FROM funcoes_colaboradores WHERE cargo_editavel LIMIT 1);
SELECT pg_temp.conferir('alocar quem nunca atuou soma 1 ao valor de ANTES',
  split_part(pg_temp.como(current_setting('bat.admin')), '|', 1),
  (current_setting('bat.antes')::int + 1)::text);
ROLLBACK TO c2;

SAVEPOINT c2b;
-- Quem JÁ atuou, alocado de novo em OUTRA prova → o total NÃO muda.
\o /dev/null
SELECT set_config('bat.antes', split_part(pg_temp.como(current_setting('bat.admin')), '|', 1), true);
\o
-- A prova escolhida é uma em que ele AINDA NÃO atua: senão quem recusa é o trigger
-- `check_colaborador_prova_unique` (uma unidade por prova), e o caso não chega a medir nada.
INSERT INTO colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id)
SELECT pu.id, c.colaborador_id, (SELECT id FROM funcoes_colaboradores WHERE cargo_editavel LIMIT 1)
  FROM (SELECT DISTINCT colaborador_id FROM colaboradores_prova) c
  JOIN prova_unidades pu
    ON NOT EXISTS (SELECT 1 FROM colaboradores_prova cp2
                     JOIN prova_unidades pu2 ON pu2.id = cp2.prova_unidade_id
                    WHERE cp2.colaborador_id = c.colaborador_id AND pu2.prova_id = pu.prova_id)
 LIMIT 1;
SELECT CASE WHEN (SELECT count(*) FROM colaboradores_prova) = 978
            THEN 'OK — a realocação entrou (978 linhas)'
            ELSE 'FALHOU — a realocação não entrou; o caso abaixo não mede nada' END;
SELECT pg_temp.conferir('realocar quem já atuou NÃO muda o total',
  split_part(pg_temp.como(current_setting('bat.admin')), '|', 1), current_setting('bat.antes'));
ROLLBACK TO c2b;

\echo ''
\echo '── 3. 🔴 COORDENADOR: soma só o que a RLS lhe mostra (prova o SECURITY INVOKER)'
SELECT pg_temp.conferir('coordenador vê só as provas que coordena',
  split_part(pg_temp.como(current_setting('bat.coord')), '|', 1),
  (SELECT count(DISTINCT cp.colaborador_id)::text
     FROM colaboradores_prova cp JOIN prova_unidades pu ON pu.id = cp.prova_unidade_id
    WHERE is_coordenador_prova(current_setting('bat.coord')::uuid, pu.prova_id)));
SELECT CASE WHEN split_part(pg_temp.como(current_setting('bat.coord')), '|', 1)::int
                 < split_part(pg_temp.verdade(), '|', 1)::int
            THEN 'OK — e esse número é MENOR que o total (senão o caso acima não distingue nada)'
            ELSE 'FALHOU — o coordenador vê o total; o caso 3 não prova o INVOKER' END;

\echo ''
-- ⚠️ Não há caso de "sala sem capacidade": `sala_capacidade` é NOT NULL (medido ao escrever
-- esta bateria — o UPDATE para NULL foi recusado). O `coalesce` da função só cobre a tabela
-- VAZIA, em que `sum` devolve NULL.

ROLLBACK;
