-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — a troca TOTAL de candidatos (etapa 1: preparo + RPC)
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Prova que `trocar_candidatos_do_edital` faz a troca atômica e — mais importante — que
-- ela RECUSA os dois gestos que apagariam a lista sem repor. Cada caso roda em transação
-- com ROLLBACK, e cada recusa vem acompanhada do CONTROLE POSITIVO: provar que passou a
-- recusar é metade do trabalho; a outra metade é provar que ainda aceita o que deve.
--
-- Como rodar (o container muda de nome por projeto):
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-troca-total-candidatos.sql
--
-- ⚠️ Roda como `postgres` (superusuário), então NÃO exercita RLS — ela é verificada à
-- parte, pelo PostgREST com JWT forjado. O que esta bateria cobre é a LÓGICA da função.
-- ─────────────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP off
\timing off

BEGIN;

-- Dois editais, para o controle de isolamento do caso 5.
INSERT INTO public.editais (id, nome)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'BATERIA — Edital A'),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'BATERIA — Edital B');

-- Lista "atual" do edital A: 3 inscritos, como se já tivessem sido importados antes.
INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cargo)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'A001', 'ANTIGO UM',   'DOCENTE II'),
       ('aaaaaaaa-0000-0000-0000-000000000001', 'A002', 'ANTIGO DOIS', 'DOCENTE II'),
       ('aaaaaaaa-0000-0000-0000-000000000001', 'A003', 'ANTIGO TRES', 'DOCENTE II');

-- E o edital B com 2, que NINGUÉM pode tocar.
INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cargo)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'B001', 'OUTRO EDITAL UM',  'DOCENTE II'),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'B002', 'OUTRO EDITAL DOIS','DOCENTE II');

SELECT '── PONTO DE PARTIDA ──' AS etapa,
       (SELECT count(*) FROM candidatos WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001') AS edital_a,
       (SELECT count(*) FROM candidatos WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000002') AS edital_b;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 1 — 🔴 GUARDA 1: lote VAZIO é recusado (IM001)
-- O modo de falha mais grave da troca total: sem esta guarda, o DELETE roda, o INSERT não
-- insere ninguém, e não há erro nenhum — a lista some e PARECE ter funcionado.
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c1;
SELECT 'CASO 1 — lote vazio (espera IM001)' AS caso;
SELECT * FROM trocar_candidatos_do_edital(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-00000000dead', 1);
ROLLBACK TO c1;

SELECT 'CASO 1 — a lista sobreviveu' AS verificacao,
       count(*) AS deve_ser_3 FROM candidatos
 WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 2 — 🔴 GUARDA 2: preparo com edital divergente é recusado (IM002)
-- Sem ela, um edital_id trocado por engano apaga a lista de A e põe a de B no lugar.
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c2;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II"}'),
  -- esta é do edital B, no MESMO lote
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002',
   '{"n_inscricao":"N002","nome":"INTRUSO","cargo":"DOCENTE II"}');

SELECT 'CASO 2 — preparo misturado (espera IM002)' AS caso;
SELECT * FROM trocar_candidatos_do_edital(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002', 2);
ROLLBACK TO c2;

SELECT 'CASO 2 — a lista sobreviveu' AS verificacao,
       count(*) AS deve_ser_3 FROM candidatos
 WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 3 — ⭐ CONTROLE POSITIVO: a troca acontece de verdade
-- Sem este caso, os dois anteriores provariam só que a função recusa tudo.
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c3;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II","cpf":"22940161739"}'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N002","nome":"NOVO DOIS","cargo":"DOCENTE II"}');

SELECT 'CASO 3 — a troca (espera removidos=3, inseridos=2)' AS caso;
SELECT * FROM trocar_candidatos_do_edital(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000003', 2);

SELECT 'CASO 3 — quem ficou' AS verificacao, n_inscricao, nome, cpf
  FROM candidatos WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001'
 ORDER BY n_inscricao;

-- O preparo foi consumido: sem isto, rodar a troca de novo apagaria e reinseriria.
SELECT 'CASO 3 — preparo limpo' AS verificacao,
       count(*) AS deve_ser_0 FROM candidatos_importacao
 WHERE importacao_id='bbbbbbbb-0000-0000-0000-000000000003';

-- E o `id`/`created_at` são NOSSOS, não da planilha.
SELECT 'CASO 3 — identidade e datas geradas' AS verificacao,
       count(*) FILTER (WHERE id IS NOT NULL)         AS com_id,
       count(*) FILTER (WHERE created_at IS NOT NULL) AS com_created_at
  FROM candidatos WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001';
ROLLBACK TO c3;

-- (O CASO 4 — atomicidade — roda FORA desta transação, no fim do arquivo. Ver lá o
--  porquê: dentro de um BEGIN não dá para observar o estado depois de um erro.)

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 4b — 🔴 GUARDA 3: preparo INCOMPLETO é recusado (IM003)
--
-- O caso mais provável de todos, porque acontece SOZINHO: o preparo sobe em blocos, um
-- bloco falha, e sobram menos linhas do que a planilha tem. Para as guardas 1 e 2 isso é
-- um lote perfeitamente válido — tem linhas e é do edital certo. Sem a guarda 3, a troca
-- apagaria a lista inteira e reporia só uma parte, dizendo sucesso.
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c4b;
-- 2 linhas no preparo, mas a importação declara 3: um bloco se perdeu.
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000004b', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II"}'),
  ('bbbbbbbb-0000-0000-0000-00000000004b', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N002","nome":"NOVO DOIS","cargo":"DOCENTE II"}');

SELECT 'CASO 4b — preparo INCOMPLETO, 2 de 3 (espera IM003)' AS caso;
SELECT * FROM trocar_candidatos_do_edital(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-00000000004b', 3);
ROLLBACK TO c4b;

SELECT '⭐ CASO 4b — a lista sobreviveu' AS verificacao,
       count(*) AS deve_ser_3 FROM candidatos
 WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 4c — 🔴 GUARDA 3 pelo OUTRO lado: preparo DUPLICADO também é recusado
-- Acontece quando uma tentativa anterior deixou resto e a retentativa não limpou.
-- Sem isto, a troca inseriria cada inscrito duas vezes — ou derrubaria tudo no índice
-- único, que é o menos ruim dos dois.
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c4c;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000004c', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II"}'),
  ('bbbbbbbb-0000-0000-0000-00000000004c', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II"}');

SELECT 'CASO 4c — preparo DUPLICADO, 2 de 1 (espera IM003)' AS caso;
SELECT * FROM trocar_candidatos_do_edital(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-00000000004c', 1);
ROLLBACK TO c4c;

SELECT 'CASO 4c — a lista sobreviveu' AS verificacao,
       count(*) AS deve_ser_3 FROM candidatos
 WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 4d — total esperado ZERO não é caminho para esvaziar edital
-- Esvaziar é gesto legítimo, mas tem tela própria ("limpar edital", com senha).
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c4d;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000004d', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II"}');

SELECT 'CASO 4d — total esperado = 0 (espera IM001)' AS caso;
SELECT * FROM trocar_candidatos_do_edital(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-00000000004d', 0);
ROLLBACK TO c4d;

SELECT 'CASO 4d — a lista sobreviveu' AS verificacao,
       count(*) AS deve_ser_3 FROM candidatos
 WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 5 — ⭐ CONTROLE POSITIVO: a troca NÃO alcança outro edital
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c5;
INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II"}');

SELECT * FROM trocar_candidatos_do_edital(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000005', 1);

SELECT 'CASO 5 — edital B intocado' AS verificacao,
       count(*) AS deve_ser_2 FROM candidatos
 WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000002';
ROLLBACK TO c5;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 6 — coluna NOVA em `candidatos` viaja sem ninguém mexer na RPC
-- É a razão de a linha ser jsonb. Se este caso quebrar, alguém trocou o
-- jsonb_populate_record por uma lista de colunas — e o próximo campo novo se perderá
-- em silêncio no meio de uma troca total.
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c6;
ALTER TABLE public.candidatos ADD COLUMN campo_futuro text;

INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II","campo_futuro":"chegou"}');

SELECT * FROM trocar_candidatos_do_edital(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000006', 1);

SELECT '⭐ CASO 6 — o campo novo chegou sozinho' AS verificacao, n_inscricao, campo_futuro
  FROM candidatos WHERE edital_id='aaaaaaaa-0000-0000-0000-000000000001';
ROLLBACK TO c6;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 7 — grants: `anon` não tem nada na tabela de preparo nem na função
-- Contraste com `candidatos`, que herdou os sete privilégios da era Lovable.
-- ═════════════════════════════════════════════════════════════════════════════════════
SELECT 'CASO 7 — privilégios de anon' AS verificacao, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE grantee='anon' AND table_name IN ('candidatos_importacao','candidatos')
 ORDER BY table_name, privilege_type;

SELECT 'CASO 7 — anon pode EXECUTAR a troca?' AS verificacao,
       has_function_privilege('anon', 'public.trocar_candidatos_do_edital(uuid,uuid,integer)', 'EXECUTE') AS deve_ser_false,
       has_function_privilege('authenticated', 'public.trocar_candidatos_do_edital(uuid,uuid,integer)', 'EXECUTE') AS deve_ser_true;

ROLLBACK;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- CASO 4 — 🔴 ATOMICIDADE, e é a propriedade que a TROCA TOTAL inteira exige
--
-- Se o INSERT falha depois de o DELETE ter rodado, o edital TEM de continuar como estava.
-- É o que separa "troca atômica" de "apagou e não repôs".
--
-- ⚠️ RODA FORA DE TRANSAÇÃO, de propósito. Dentro de um BEGIN, o erro aborta o bloco e
-- toda consulta seguinte é ignorada até o ROLLBACK — e o que se mediria DEPOIS do
-- ROLLBACK seria o efeito dele, não o da função. O caso provaria a si mesmo.
-- Por isso aqui é autocommit, com limpeza explícita no fim.
-- ═════════════════════════════════════════════════════════════════════════════════════
INSERT INTO public.editais (id, nome)
VALUES ('cccccccc-0000-0000-0000-000000000004', 'BATERIA C4 — atomicidade');

INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cargo)
VALUES ('cccccccc-0000-0000-0000-000000000004', 'C001', 'SOBREVIVENTE UM',  'DOCENTE II'),
       ('cccccccc-0000-0000-0000-000000000004', 'C002', 'SOBREVIVENTE DOIS','DOCENTE II'),
       ('cccccccc-0000-0000-0000-000000000004', 'C003', 'SOBREVIVENTE TRES','DOCENTE II');

INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
  ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000004',
   '{"n_inscricao":"N001","nome":"NOVO UM","cargo":"DOCENTE II"}'),
  -- A SABOTAGEM: nome em branco viola chk_candidato_nome_preenchido. A linha boa vem
  -- antes, então o DELETE e parte do INSERT já terão acontecido quando isto estourar.
  ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000004',
   '{"n_inscricao":"N002","nome":"   ","cargo":"DOCENTE II"}');

SELECT 'CASO 4 — INSERT sabotado (espera violação de CHECK)' AS caso;
SELECT * FROM trocar_candidatos_do_edital(
  'cccccccc-0000-0000-0000-000000000004',
  'dddddddd-0000-0000-0000-000000000004', 2);

-- ⭐ A asserção que vale por toda a bateria.
SELECT '⭐ CASO 4 — NINGUÉM foi apagado' AS verificacao,
       count(*) AS deve_ser_3 FROM candidatos
 WHERE edital_id='cccccccc-0000-0000-0000-000000000004';

-- E o preparo continua lá: a troca não consumiu nada, então dá para corrigir a origem e
-- tentar de novo sem resubir os blocos.
SELECT 'CASO 4 — preparo intacto' AS verificacao,
       count(*) AS deve_ser_2 FROM candidatos_importacao
 WHERE importacao_id='dddddddd-0000-0000-0000-000000000004';

-- Limpeza explícita (candidatos antes de editais: a FK é RESTRICT).
DELETE FROM public.candidatos_importacao WHERE edital_id='cccccccc-0000-0000-0000-000000000004';
DELETE FROM public.candidatos            WHERE edital_id='cccccccc-0000-0000-0000-000000000004';
DELETE FROM public.editais               WHERE id      ='cccccccc-0000-0000-0000-000000000004';

SELECT '── LIMPO ──' AS fim,
       (SELECT count(*) FROM candidatos)            AS candidatos,
       (SELECT count(*) FROM candidatos_importacao) AS preparo,
       (SELECT count(*) FROM editais WHERE nome LIKE 'BATERIA%') AS editais_de_teste;
