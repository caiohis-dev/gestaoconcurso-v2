-- Bateria manual do RELATÓRIO PERSISTIDO da importação de candidatos
-- Rodar contra o banco LOCAL:
--   docker cp docs/bateria-relatorio-importacao.sql supabase_db_<ref>:/tmp/b.sql
--   docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/b.sql
--
-- POR QUE ISTO EXISTE, e por que não é um teste do Vitest: a suíte mocka o Supabase. Ela
-- não exercita a transação de verdade da RPC — um teste lá afirmaria o mock, não que o
-- relatório e os candidatos trocam JUNTOS ou que uma guarda que recusa a troca também
-- preserva o relatório antigo.
--
-- O QUE ESTA BATERIA PROVA, decisão do usuário em 2026-08-02: "a reimportação apaga os
-- candidatos e por isso deve apagar e escrever novo relatório" — migration
-- 20260802145848.
--
-- REGRA DA CASA: toda recusa vem acompanhada do CONTROLE POSITIVO. Provar que passou a
-- recusar é metade do trabalho; a outra metade é provar que continua aceitando o que deve.
-- Tudo em transação com ROLLBACK — a bateria não deixa resíduo.

\set ON_ERROR_STOP off
\timing off

\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. ESTRUTURA                                                           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Esperado: 4 colunas de conteúdo (n_inscricao, situacao, campo, detalhe), todas'
\echo '--           NOT NULL, e edital_id com ON DELETE CASCADE (não RESTRICT, ao'
\echo '--           contrário de candidatos/provas — este relatório é descartável).'
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'candidatos_relatorio_importacao'
 ORDER BY ordinal_position;

SELECT confdeltype  -- 'c' = CASCADE
  FROM pg_constraint
 WHERE conname = 'candidatos_relatorio_importacao_edital_id_fkey';

\echo ''
\echo '-- Esperado: a RPC aceita 4 parâmetros, o último jsonb.'
SELECT pg_get_function_identity_arguments(oid)
  FROM pg_proc WHERE proname = 'trocar_candidatos_do_edital';

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. COMPORTAMENTO                                                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;

\echo ''
\echo '-- Preparo: um edital e uma linha JÁ preparada para a troca.'
INSERT INTO public.editais (id, nome) VALUES
  ('99990000-0000-0000-0000-000000000001', 'EDITAL BATERIA RELATORIO');

\echo ''
\echo '── CASO 1 (CONTROLE +) importação limpa grava candidato E relatório VAZIO ──────'
\echo '-- Relatório vazio não é ausência de linha — é uma troca que também limpa o'
\echo '-- relatório velho, se houver. Aqui não há velho, então o resultado é 0 linhas.'
SAVEPOINT s1;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('11110000-0000-0000-0000-000000000001',
   '99990000-0000-0000-0000-000000000001',
   '{"n_inscricao":"900001","nome":"BATERIA UM","cpf":null}'::jsonb);
SELECT * FROM public.trocar_candidatos_do_edital(
  '99990000-0000-0000-0000-000000000001'::uuid,
  '11110000-0000-0000-0000-000000000001'::uuid,
  1,
  '[]'::jsonb
);
SELECT count(*) AS candidatos_gravados FROM public.candidatos
 WHERE edital_id = '99990000-0000-0000-0000-000000000001';
SELECT count(*) AS relatorio_vazio FROM public.candidatos_relatorio_importacao
 WHERE edital_id = '99990000-0000-0000-0000-000000000001';
RELEASE s1;

\echo ''
\echo '── CASO 2 (CONTROLE +) 🔴 relatório com problema grava JUNTO com o candidato ────'
SAVEPOINT s2;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('11110000-0000-0000-0000-000000000002',
   '99990000-0000-0000-0000-000000000001',
   '{"n_inscricao":"900002","nome":"BATERIA DOIS","cpf":null}'::jsonb);
SELECT * FROM public.trocar_candidatos_do_edital(
  '99990000-0000-0000-0000-000000000001'::uuid,
  '11110000-0000-0000-0000-000000000002'::uuid,
  1,
  '[{"n_inscricao":"185","situacao":"Não importada (inscrição não paga)","campo":"Pagamento","detalhe":"FULANA — inscrição não consta como paga"}]'::jsonb
);
SELECT n_inscricao, situacao, campo FROM public.candidatos_relatorio_importacao
 WHERE edital_id = '99990000-0000-0000-0000-000000000001';
RELEASE s2;

\echo ''
\echo '── CASO 3 🔴 REIMPORTAR APAGA o relatório anterior e grava só o novo ───────────'
\echo '-- É o pedido do usuário, palavra por palavra: "a reimportação apaga os'
\echo '-- candidatos e por isso deve apagar e escrever novo relatório". Depois desta'
\echo '-- chamada, a linha do CASO 2 (n_inscricao 185) NÃO pode sobrar.'
SAVEPOINT s3;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('11110000-0000-0000-0000-000000000003',
   '99990000-0000-0000-0000-000000000001',
   '{"n_inscricao":"900003","nome":"BATERIA TRES","cpf":null}'::jsonb);
SELECT * FROM public.trocar_candidatos_do_edital(
  '99990000-0000-0000-0000-000000000001'::uuid,
  '11110000-0000-0000-0000-000000000003'::uuid,
  1,
  '[{"n_inscricao":"777","situacao":"Importada com ressalva","campo":"CPF","detalhe":"novo problema"}]'::jsonb
);
SELECT count(*) AS total_apos_reimportar FROM public.candidatos_relatorio_importacao
 WHERE edital_id = '99990000-0000-0000-0000-000000000001';
SELECT count(*) AS linha_antiga_ainda_existe FROM public.candidatos_relatorio_importacao
 WHERE edital_id = '99990000-0000-0000-0000-000000000001' AND n_inscricao = '185';
RELEASE s3;

\echo ''
\echo '── CASO 4 🔴 GUARDA que recusa a troca preserva o relatório ANTIGO intacto ──────'
\echo '-- A prova de que "ou tudo muda, ou nada muda" vale para os DOIS juntos: dispara'
\echo '-- a GUARDA 3 (contagem não bate) com um relatório novo, e confere que nem'
\echo '-- candidatos nem relatório mudaram.'
SAVEPOINT s4;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('11110000-0000-0000-0000-000000000004',
   '99990000-0000-0000-0000-000000000001',
   '{"n_inscricao":"900004","nome":"BATERIA QUATRO","cpf":null}'::jsonb);
SAVEPOINT s4_chamada;
SELECT * FROM public.trocar_candidatos_do_edital(
  '99990000-0000-0000-0000-000000000001'::uuid,
  '11110000-0000-0000-0000-000000000004'::uuid,
  2,  -- declara 2, só 1 preparada -> GUARDA 3 recusa
  '[{"n_inscricao":"999","situacao":"Não importada","campo":"Nome","detalhe":"nao deveria gravar"}]'::jsonb
);
ROLLBACK TO s4_chamada;
SELECT count(*) AS relatorio_continua_o_do_caso_3 FROM public.candidatos_relatorio_importacao
 WHERE edital_id = '99990000-0000-0000-0000-000000000001' AND n_inscricao = '777';
SELECT count(*) AS relatorio_da_guarda_NAO_entrou FROM public.candidatos_relatorio_importacao
 WHERE edital_id = '99990000-0000-0000-0000-000000000001' AND n_inscricao = '999';
RELEASE s4;

\echo ''
\echo '── CASO 5 (CONTROLE +) apagar o EDITAL leva o relatório junto (CASCADE) ─────────'
SAVEPOINT s5;
DELETE FROM public.candidatos WHERE edital_id = '99990000-0000-0000-0000-000000000001';
DELETE FROM public.editais WHERE id = '99990000-0000-0000-0000-000000000001';
SELECT count(*) AS relatorio_apos_apagar_edital FROM public.candidatos_relatorio_importacao
 WHERE edital_id = '99990000-0000-0000-0000-000000000001';
RELEASE s5;

ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. RLS POR PAPEL                                                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Mesma régua de candidatos_importacao. UUIDs já auditados em bateria-cargos.sql.'

BEGIN;
\echo ''
\echo '-- 3.1 ADMIN: lê (esperado: SELECT ok, sem erro)'
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"12118d98-0f62-4947-bbd4-a2067fa116f2","role":"authenticated"}';
SELECT count(*) AS admin_le_relatorio FROM public.candidatos_relatorio_importacao;
ROLLBACK;

BEGIN;
\echo ''
\echo '-- 3.2 COORDENADOR: NÃO lê e NÃO insere — este relatório é tão restrito quanto'
\echo '--     candidatos (Papéis com acesso: admin/superadmin, NÃO coordenador).'
\echo '--     Esperado: SELECT devolve 0 linhas (RLS filtra, não dá erro); INSERT recusado (42501).'
\echo '--     ⚠️ O edital é criado como `postgres` NESTA transação (não o da seção 2, já'
\echo '--     desfeita) — senão o INSERT falharia por FK, e o teste provaria a coisa errada.'
INSERT INTO public.editais (id, nome) VALUES
  ('99990000-0000-0000-0000-000000000002', 'EDITAL BATERIA RELATORIO RLS');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"5100fb6c-fbdb-47d3-91a3-335b77ba7353","role":"authenticated"}';
SELECT count(*) AS coordenador_le_relatorio FROM public.candidatos_relatorio_importacao;
INSERT INTO public.candidatos_relatorio_importacao (edital_id, n_inscricao, situacao, campo, detalhe)
VALUES ('99990000-0000-0000-0000-000000000002', '1', 'x', 'y', 'z');
ROLLBACK;

\echo ''
\echo '-- Esperado: 0 — a bateria não deixa resíduo.'
SELECT count(*) AS sobrou FROM public.editais WHERE nome LIKE 'EDITAL BATERIA RELATORIO%';
