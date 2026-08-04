-- ============================================================================
-- BATERIA — Salas do CATÁLOGO (`sala_prova`), 2026-08-03
--
-- Objeto: a migration `20260803234944_salas_sem_arcondicionado_e_numero_casa_com_andar`.
--
--   1. `sala_arcondicionado` deixou de existir  → e o dump continua carregando
--   2. `chk_sala_numero_casa_com_andar`         → sala_numero = andar × 100 + (1..99)
--
-- 🔴 A suíte do Vitest NÃO alcança nada disto: ela mocka o Supabase, então não exercita
-- CHECK, coluna dropada, índice único nem trigger. O que `useSalasProva.test.tsx` e
-- `lib/salas.test.ts` provam é que o CLIENTE calcula os números certos — o que se prova
-- aqui é que o BANCO recusa quem não passa pelo cliente (psql, PostgREST, script).
--
-- Como rodar (tudo em transação; termina em ROLLBACK, não deixa resíduo):
--   sg docker -c 'docker exec -i supabase_db_<ref> psql -U postgres -d postgres' \
--     < docs/bateria-salas-cadastro.sql
--
-- Cada recusa esperada está entre SAVEPOINT/ROLLBACK TO, então um erro não aborta o resto.
-- ============================================================================

BEGIN;

\echo ''
\echo '=== §0. Estado medido antes (a base de comparação) ==================='

SELECT
  count(*)                                                          AS salas,
  count(*) FILTER (WHERE sala_andar IS NULL)                        AS sem_andar,
  count(*) FILTER (WHERE sala_andar IS NOT NULL
                     AND sala_numero / 100 <> sala_andar)           AS divergentes,
  count(*) FILTER (WHERE sala_numero % 100 = 0)                     AS sequencia_zero
FROM sala_prova;
-- Esperado numa base recém-resetada (03/08): 42 salas, 0 sem_andar, 0 divergentes,
-- 0 sequencia_zero. ⚠️ Medir em base COM resíduo de teste dá outro total (eu vi 52 antes
-- do reset, com as mesmas 0 violações) — o que não pode variar são as três colunas de zero.
-- `divergentes = 0` é o que autorizou a CHECK a entrar sem saneamento.

\echo ''
\echo '=== §1. A coluna de ar-condicionado não existe mais =================='

SELECT count(*) AS deveria_ser_zero
FROM information_schema.columns
WHERE table_name = 'sala_prova' AND column_name = 'sala_arcondicionado';

-- ⚠️ CONTROLE POSITIVO da consulta acima: se ela devolvesse 0 por estar procurando o
-- lugar errado, este SELECT também daria 0 — e ele TEM de dar as colunas reais.
SELECT count(*) AS colunas_da_tabela
FROM information_schema.columns
WHERE table_name = 'sala_prova';
-- Esperado: 9 colunas (id, sala_fk_unidade, sala_numero, sala_descricao,
-- sala_capacidade, sala_andar, created_at, updated_at, created_by).

\echo ''
\echo '=== §2. A CHECK recusa número que não casa com o andar =============='

SAVEPOINT s1;
\echo '-- 2a. INSERT com número do andar 3 e sala_andar 1 → deve FALHAR'
INSERT INTO sala_prova (sala_fk_unidade, sala_numero, sala_capacidade, sala_andar)
SELECT id, 305, 30, 1 FROM unidades_prova LIMIT 1;
ROLLBACK TO s1;

SAVEPOINT s2;
\echo '-- 2b. UPDATE mudando SÓ o andar (o defeito da edição) → deve FALHAR'
UPDATE sala_prova SET sala_andar = 3
WHERE sala_numero = 101 AND sala_andar = 1;
ROLLBACK TO s2;

SAVEPOINT s3;
\echo '-- 2c. UPDATE mudando SÓ o número → deve FALHAR'
UPDATE sala_prova SET sala_numero = 305
WHERE sala_numero = 101 AND sala_andar = 1;
ROLLBACK TO s3;

SAVEPOINT s4;
\echo '-- 2d. sequência 0 (o número 100, o 200) → deve FALHAR'
INSERT INTO sala_prova (sala_fk_unidade, sala_numero, sala_capacidade, sala_andar)
SELECT id, 100, 30, 1 FROM unidades_prova LIMIT 1;
ROLLBACK TO s4;

SAVEPOINT s5;
\echo '-- 2e. negativo → deve FALHAR (não há renumeração em dois passos no catálogo)'
INSERT INTO sala_prova (sala_fk_unidade, sala_numero, sala_capacidade, sala_andar)
SELECT id, -101, 30, 1 FROM unidades_prova LIMIT 1;
ROLLBACK TO s5;

\echo ''
\echo '=== §3. CONTROLE POSITIVO — o que é legítimo continua passando ======='
\echo '   (sem esta seção, uma CHECK que recusasse TUDO passaria na §2)'

SAVEPOINT p1;
\echo '-- 3a. sala coerente (andar 4, número 401) → deve PASSAR'
INSERT INTO sala_prova (sala_fk_unidade, sala_numero, sala_capacidade, sala_andar)
SELECT id, 401, 30, 4 FROM unidades_prova LIMIT 1;
SELECT count(*) AS inseriu_uma FROM sala_prova WHERE sala_numero = 401;
ROLLBACK TO p1;

SAVEPOINT p2;
\echo '-- 3b. sala SEM andar (coluna é NULLABLE) → deve PASSAR com qualquer número'
INSERT INTO sala_prova (sala_fk_unidade, sala_numero, sala_capacidade, sala_andar)
SELECT id, 7777, 30, NULL FROM unidades_prova LIMIT 1;
SELECT count(*) AS inseriu_uma FROM sala_prova WHERE sala_numero = 7777;
ROLLBACK TO p2;

SAVEPOINT p3;
\echo '-- 3c. mudar número E andar JUNTOS → deve PASSAR (é como a edição corrige)'
UPDATE sala_prova SET sala_numero = 301, sala_andar = 3
WHERE sala_numero = 101 AND sala_andar = 1;
SELECT count(*) AS atualizou FROM sala_prova WHERE sala_numero = 301 AND sala_andar = 3;
ROLLBACK TO p3;

SAVEPOINT p4;
\echo '-- 3d. a sequência 99 é o teto legítimo → deve PASSAR'
INSERT INTO sala_prova (sala_fk_unidade, sala_numero, sala_capacidade, sala_andar)
SELECT id, 199, 30, 1 FROM unidades_prova WHERE unid_sigla LIKE 'SA%' LIMIT 1;
SELECT count(*) AS inseriu_uma FROM sala_prova WHERE sala_numero = 199;
ROLLBACK TO p4;

\echo ''
\echo '=== §4. A CHECK NÃO vazou para o snapshot da prova =================='
\echo '   (se tivesse vazado, a renumeração em dois passos de 03/08 morreria)'

SELECT count(*) AS deveria_ser_zero
FROM pg_constraint
WHERE conrelid = 'salas_prova_distribuidas'::regclass
  AND conname = 'chk_sala_numero_casa_com_andar';

SAVEPOINT d1;
\echo '-- 4a. o valor transitório do passo 1 da RPC continua aceito lá → deve PASSAR'
-- `session_replication_role = replica` desliga o trigger PF001 (as 2 provas do dump estão
-- finalizadas); ele NÃO desliga CHECK, então o que se mede aqui continua sendo a CHECK.
SET session_replication_role = replica;
UPDATE salas_prova_distribuidas SET sala_numero = -101
WHERE id = (SELECT id FROM salas_prova_distribuidas ORDER BY sala_numero LIMIT 1);
SELECT count(*) AS transitorio_gravado FROM salas_prova_distribuidas WHERE sala_numero < 0;
SET session_replication_role = origin;
ROLLBACK TO d1;

\echo ''
\echo '=== §5. O dump editado carrega contra o schema novo =================='
\echo '   (rodar à parte — ver o comando no comentário abaixo)'
-- A prova de que a cirurgia no dump acompanhou o DROP COLUMN não cabe aqui dentro, porque
-- depende de reler o arquivo. O procedimento, que termina em ROLLBACK:
--
--   { echo "BEGIN; DELETE FROM public.sala_prova; SET session_replication_role = replica;";
--     grep '^INSERT INTO public.sala_prova ' supabase/seed.local.sql;
--     echo "SET session_replication_role = origin;";
--     echo "SELECT count(*), sum(sala_capacidade) FROM public.sala_prova; ROLLBACK;"; } \
--   | sg docker -c 'docker exec -i supabase_db_<ref> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -'
--
-- Executado em 2026-08-03: 42 linhas, 1.260 lugares, nenhuma recusa da CHECK.

ROLLBACK;

\echo ''
\echo '=== FIM — nada foi gravado (ROLLBACK) ==============================='
