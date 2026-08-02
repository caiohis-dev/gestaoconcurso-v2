-- Bateria manual da PE001 — o edital de uma prova é IMUTÁVEL depois de definido
-- Rodar contra o banco LOCAL:
--   docker cp docs/bateria-prova-edital-imutavel.sql supabase_db_<ref>:/tmp/b.sql
--   docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/b.sql
--
-- POR QUE ISTO EXISTE, e por que não é um teste do Vitest: a suíte mocka o Supabase. Ela
-- não exercita trigger — um teste lá afirmaria o mock. O `ProvaDialog` esconder o campo é
-- CONVENIÊNCIA; a garantia é o trigger, e só esta bateria a verifica.
--
-- 🔴 O CASO QUE NÃO PODE FALTAR É O 3. A regra NÃO é "edital_id não muda" — é "edital_id
-- que JÁ TEM VALOR não muda". O backfill do seed.pos.sql faz
-- `UPDATE provas SET edital_id = ... WHERE edital_id IS NULL` DEPOIS das migrations; se o
-- trigger bloquear NULL -> valor, todo `db reset` deixa as provas do dump sem edital, e o
-- sintoma aparece como "o seed falhou".
--
-- REGRA DA CASA: toda recusa vem acompanhada do CONTROLE POSITIVO. Provar que passou a
-- recusar é metade do trabalho; a outra metade é provar que continua aceitando o que deve.
-- Tudo em transação com ROLLBACK — a bateria não deixa resíduo.

\set ON_ERROR_STOP off
\timing off

\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. ESTRUTURA                                                           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Esperado: check_prova_edital_imutavel presente e habilitado (tgenabled = O).'
SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid = 'public.provas'::regclass AND NOT tgisinternal
 ORDER BY tgname;

\echo ''
\echo '-- Esperado: edital_id segue NULLABLE — a PE001 congela, NÃO obriga a ter edital.'
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'provas' AND column_name = 'edital_id';

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. COMPORTAMENTO                                                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;

\echo ''
\echo '-- Preparo: dois editais e uma prova ligada ao primeiro.'
INSERT INTO public.editais (id, nome) VALUES
  ('88880000-0000-0000-0000-000000000001', 'EDITAL BATERIA PE001 A'),
  ('88880000-0000-0000-0000-000000000002', 'EDITAL BATERIA PE001 B');
INSERT INTO public.provas (id, edital_id, prova_edital, prova_data) VALUES
  ('88881111-0000-0000-0000-000000000001',
   '88880000-0000-0000-0000-000000000001', 'EDITAL BATERIA PE001 A', '2026-09-01');

\echo ''
\echo '── CASO 1  trocar o edital de uma prova que JÁ TEM um -> DEVE FALHAR (PE001) ──'
SAVEPOINT s1;
UPDATE public.provas SET edital_id = '88880000-0000-0000-0000-000000000002'
 WHERE id = '88881111-0000-0000-0000-000000000001';
ROLLBACK TO s1;

\echo ''
\echo '── CASO 2  APAGAR o vínculo (valor -> NULL) -> DEVE FALHAR ──'
\echo '-- Sem este ramo a trava teria uma porta dos fundos: zerar e regravar em dois passos.'
SAVEPOINT s2;
UPDATE public.provas SET edital_id = NULL
 WHERE id = '88881111-0000-0000-0000-000000000001';
ROLLBACK TO s2;

\echo ''
\echo '── CASO 3 (CONTROLE +) 🔴 NULL -> valor DEVE PASSAR — é o backfill do seed.pos.sql ──'
\echo '-- Se ESTE caso falhar, todo `db reset` deixa as provas do dump v1 sem edital.'
SAVEPOINT s3;
INSERT INTO public.provas (id, edital_id, prova_edital, prova_data) VALUES
  ('88881111-0000-0000-0000-000000000002', NULL, 'SEM EDITAL AINDA', '2026-09-02');
UPDATE public.provas SET edital_id = '88880000-0000-0000-0000-000000000001'
 WHERE id = '88881111-0000-0000-0000-000000000002';
SELECT edital_id IS NOT NULL AS backfill_funcionou
  FROM public.provas WHERE id = '88881111-0000-0000-0000-000000000002';
RELEASE s3;

\echo ''
\echo '── CASO 4 (CONTROLE +) editar OS OUTROS campos DEVE PASSAR ──'
\echo '-- É o que "Parâmetros Gerais" faz o tempo todo. Se cair, a PE001 travou a tela.'
SAVEPOINT s4;
UPDATE public.provas
   SET prova_data = '2026-10-10', prova_hora_inicio = '09:00', prova_n_candidatos = 500
 WHERE id = '88881111-0000-0000-0000-000000000001';
SELECT prova_data, prova_n_candidatos
  FROM public.provas WHERE id = '88881111-0000-0000-0000-000000000001';
RELEASE s4;

\echo ''
\echo '── CASO 5 (CONTROLE +) reescrever o MESMO edital_id DEVE PASSAR ──'
\echo '-- O PATCH do PostgREST pode reenviar a coluna sem intenção de trocá-la. A condição'
\echo '-- é IS DISTINCT FROM, não "veio no payload" — senão a tela quebraria sem motivo.'
SAVEPOINT s5;
UPDATE public.provas SET edital_id = '88880000-0000-0000-0000-000000000001'
 WHERE id = '88881111-0000-0000-0000-000000000001';
RELEASE s5;

ROLLBACK;

\echo ''
\echo '-- Esperado: 0 — a bateria não deixa resíduo.'
SELECT count(*) AS sobrou FROM public.editais WHERE nome LIKE 'EDITAL BATERIA PE001%';
