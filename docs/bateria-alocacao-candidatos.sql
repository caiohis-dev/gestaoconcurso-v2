-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Alocação de Candidatos em salas (migration 20260804225156)
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Prova as barreiras do vínculo candidato ↔ sala e o comportamento da distribuição
-- automática: por cargo, alfabética dentro do cargo, CARGO NOVO ABRE SALA NOVA (a sala
-- de fronteira fica com vagas ociosas), especiais fora do automático, manual preservado
-- ao redistribuir. Cada recusa afirma o SQLSTATE E o nome de quem barrou — regra nova
-- não pode ofuscar a antiga (prova finalizada continua respondendo PF001, não AL007).
--
-- Como rodar (o container muda de nome por projeto):
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-alocacao-candidatos.sql
--
-- ⚠️ Roda como `postgres` (dono das tabelas), que NÃO passa pela RLS — os casos de
-- permissão trocam para `SET LOCAL ROLE authenticated` + JWT forjado com set_config.
--
-- ⚠️ Uma bateria só existe quando alguém a executa: `npm test` mocka o Supabase e
-- `docs:conferir` não lê bateria. Ao mudar a assinatura de qualquer função daqui,
-- procure as chamadas neste arquivo no mesmo passe (a da troca total ficou quebrada por
-- 2 dias exatamente assim).
--
-- Tudo roda numa transação com ROLLBACK final: o banco fica como estava.
-- ─────────────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\timing off

BEGIN;

\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ SETUP — prova do dump reaberta + candidatos sintéticos                 ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Os UUIDs da prova saem do próprio banco: a bateria não envelhece com o dump.'

-- A prova do Edital 001 (16 salas de uma unidade) e a prova do Edital 002 (outra prova,
-- para os casos de coerência).
SELECT p.id AS p_id, p.edital_id AS ed_a
  FROM provas p JOIN editais e ON e.id = p.edital_id
 WHERE e.nome = 'Edital 001/2026 SMA' \gset
SELECT p.id AS q_id, p.edital_id AS ed_b
  FROM provas p JOIN editais e ON e.id = p.edital_id
 WHERE e.nome = 'Edital 002/2026 - SMA' \gset
SELECT sala_fk_unidade AS u_id FROM salas_prova_distribuidas
 WHERE prova_id = :'p_id' GROUP BY 1 LIMIT 1 \gset

-- Reabre prova e unidade (no dump estão finalizadas; o congelamento é o CASO 7) e
-- encolhe as salas para capacidade 3 — os números pequenos tornam os casos legíveis.
UPDATE provas SET prova_finalizada = false WHERE id IN (:'p_id'::uuid, :'q_id'::uuid);
-- As unidades das DUAS provas: sem reabrir as da prova B, o caso 6b morreria em PF001
-- antes de chegar à FK composta que ele existe para provar.
UPDATE prova_unidades SET unidade_finalizada = false
 WHERE prova_id IN (:'p_id'::uuid, :'q_id'::uuid);
UPDATE salas_prova_distribuidas SET sala_capacidade = 3 WHERE prova_id = :'p_id'::uuid;

-- As três primeiras salas da prova, na MESMA ordem física da distribuição.
SELECT id AS sala_1 FROM salas_prova_distribuidas WHERE prova_id = :'p_id'
 ORDER BY sala_andar NULLS LAST, sala_numero LIMIT 1 \gset
SELECT id AS sala_2 FROM salas_prova_distribuidas WHERE prova_id = :'p_id'
 ORDER BY sala_andar NULLS LAST, sala_numero OFFSET 1 LIMIT 1 \gset
SELECT id AS sala_3 FROM salas_prova_distribuidas WHERE prova_id = :'p_id'
 ORDER BY sala_andar NULLS LAST, sala_numero OFFSET 2 LIMIT 1 \gset
-- E a última, que ficará vazia — é onde o manual entra.
SELECT id AS sala_z FROM salas_prova_distribuidas WHERE prova_id = :'p_id'
 ORDER BY sala_andar NULLS LAST, sala_numero DESC LIMIT 1 \gset
-- Uma sala da OUTRA prova, para a FK composta.
SELECT id AS sala_q FROM salas_prova_distribuidas WHERE prova_id = :'q_id'
 ORDER BY sala_numero LIMIT 1 \gset

-- Cargos e candidatos sintéticos. Cargo A: 5 elegíveis (2 salas de 3, a 2ª com vaga
-- ociosa); cargo B: 3 (fecha uma sala exata); + 2 especiais (1 PCD, 1 sala_especial).
INSERT INTO cargos (id, nome) VALUES
  ('ba7e01a0-0000-0000-0000-00000000000a', 'BATERIA CARGO A'),
  ('ba7e01a0-0000-0000-0000-00000000000b', 'BATERIA CARGO B');

INSERT INTO candidatos (id, edital_id, n_inscricao, nome, cargo, cargo_id,
                        portador_deficiencia, sala_especial) VALUES
  ('ca000000-0000-0000-0000-000000000001', :'ed_a', 'T001', 'ANA SILVA',    'cru', 'ba7e01a0-0000-0000-0000-00000000000a', false, NULL),
  ('ca000000-0000-0000-0000-000000000002', :'ed_a', 'T002', 'BETO SILVA',   'cru', 'ba7e01a0-0000-0000-0000-00000000000a', false, NULL),
  ('ca000000-0000-0000-0000-000000000003', :'ed_a', 'T003', 'CARLA SILVA',  'cru', 'ba7e01a0-0000-0000-0000-00000000000a', false, NULL),
  ('ca000000-0000-0000-0000-000000000004', :'ed_a', 'T004', 'DORA SILVA',   'cru', 'ba7e01a0-0000-0000-0000-00000000000a', false, NULL),
  ('ca000000-0000-0000-0000-000000000005', :'ed_a', 'T005', 'EVA SILVA',    'cru', 'ba7e01a0-0000-0000-0000-00000000000a', false, NULL),
  ('ca000000-0000-0000-0000-000000000006', :'ed_a', 'T006', 'FABIO SILVA',  'cru', 'ba7e01a0-0000-0000-0000-00000000000b', false, NULL),
  ('ca000000-0000-0000-0000-000000000007', :'ed_a', 'T007', 'GILDA SILVA',  'cru', 'ba7e01a0-0000-0000-0000-00000000000b', false, NULL),
  ('ca000000-0000-0000-0000-000000000008', :'ed_a', 'T008', 'HUGO SILVA',   'cru', 'ba7e01a0-0000-0000-0000-00000000000b', false, NULL),
  ('ca000000-0000-0000-0000-000000000009', :'ed_a', 'T009', 'IARA ESPECIAL','cru', 'ba7e01a0-0000-0000-0000-00000000000a', true,  NULL),
  ('ca000000-0000-0000-0000-000000000010', :'ed_a', 'T010', 'JOAO ESPECIAL','cru', 'ba7e01a0-0000-0000-0000-00000000000a', false, 'Sala térrea e ledor'),
  -- E um inscrito do OUTRO edital, para a coerência (CASO 6).
  ('ca000000-0000-0000-0000-000000000011', :'ed_b', 'T011', 'KELI DE FORA', 'cru', 'ba7e01a0-0000-0000-0000-00000000000a', false, NULL);

-- O admin forjado (has_role lê auth.uid() do claim sub).
SELECT user_id AS admin_id,
       format('{"sub":"%s","role":"authenticated"}', user_id) AS jwt_admin
  FROM user_roles WHERE role = 'admin' LIMIT 1 \gset
SELECT ur.user_id AS naoadmin_id,
       format('{"sub":"%s","role":"authenticated"}', ur.user_id) AS jwt_naoadmin
  FROM user_roles ur
 WHERE ur.role NOT IN ('admin','superadmin')
   AND NOT EXISTS (SELECT 1 FROM user_roles x
                    WHERE x.user_id = ur.user_id AND x.role IN ('admin','superadmin'))
 LIMIT 1 \gset

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 1 — A DISTRIBUIÇÃO: por cargo, alfabética, cargo novo abre sala nova ──'
\echo '-- Esperado: alocados=8, pendentes=2. Sala 1 = ANA,BETO,CARLA; sala 2 = DORA,EVA'
\echo '-- (1 vaga OCIOSA — fronteira); sala 3 = FABIO,GILDA,HUGO (cargo B abre sala nova).'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c1;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM distribuir_candidatos_da_prova(:'p_id');
RESET ROLE;

SELECT c.nome, s.sala_numero, a.origem
  FROM candidatos_alocacao a
  JOIN candidatos c ON c.id = a.candidato_id
  JOIN salas_prova_distribuidas s ON s.id = a.sala_id
 WHERE a.prova_id = :'p_id'
 ORDER BY s.sala_andar NULLS LAST, s.sala_numero, c.nome;

\echo '-- E a concordância: NENHUM alocado automático aparece em especiais_da_prova, e os'
\echo '-- 2 especiais aparecem PENDENTES (sala_id nulo). Esperado: 2 linhas, sala vazia.'
SELECT nome, sala_especial, portador_deficiencia, sala_id FROM especiais_da_prova(:'p_id');

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 2 — REDISTRIBUIR PRESERVA O MANUAL ──'
\echo '-- IARA (PCD) entra à mão na última sala; redistribuir mantém a linha manual.'
\echo '-- Esperado: preservados=1, pendentes=1; depois, origem manual=1 e automatica=8.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c2;
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000009', :'sala_z', :'p_id', 'manual');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM distribuir_candidatos_da_prova(:'p_id');
RESET ROLE;

SELECT origem, count(*) FROM candidatos_alocacao WHERE prova_id = :'p_id' GROUP BY origem ORDER BY origem;
\echo '-- E especiais_da_prova agora mostra IARA ATENDIDA (sala preenchida), JOAO pendente:'
SELECT nome, sala_id IS NOT NULL AS atendido FROM especiais_da_prova(:'p_id');
ROLLBACK TO SAVEPOINT c2;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 3 — 🔴 AL004: espaço insuficiente NOMEIA o cargo, e nada muda ──'
\echo '-- Cargo C ganha 40 inscritos; a prova tem 16 salas × 3 = 48 vagas, mas A e B'
\echo '-- ocupam 3 salas (fronteiras fechadas), restam 13 × 3 = 39 < 40.'
\echo '-- Esperado: ERRO AL004 citando "BATERIA CARGO C", e a alocação do CASO 1 intacta.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c3;
INSERT INTO cargos (id, nome) VALUES ('ba7e01a0-0000-0000-0000-00000000000c', 'BATERIA CARGO C');
INSERT INTO candidatos (edital_id, n_inscricao, nome, cargo, cargo_id)
SELECT :'ed_a', 'C' || lpad(g::text, 3, '0'), 'ZE NUMERO ' || lpad(g::text, 3, '0'), 'cru',
       'ba7e01a0-0000-0000-0000-00000000000c'
  FROM generate_series(1, 40) g;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM distribuir_candidatos_da_prova(:'p_id');
ROLLBACK TO SAVEPOINT c3;
\echo '-- Controle: a alocação anterior segue de pé (esperado 8):'
SELECT count(*) AS alocados_intactos FROM candidatos_alocacao WHERE prova_id = :'p_id';

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 4 — AL006: sala lotada recusa, inclusive no MEIO de um INSERT em massa ──'
\echo '-- A sala vazia tem capacidade 3; um INSERT de 4 linhas num comando só estoura na'
\echo '-- 4ª. Esperado: ERRO AL006 — o trigger enxerga as linhas do próprio comando.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c4;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
SELECT c.id, :'sala_z', :'p_id', 'manual'
  FROM candidatos c
 WHERE c.id IN ('ca000000-0000-0000-0000-000000000001',
                'ca000000-0000-0000-0000-000000000002',
                'ca000000-0000-0000-0000-000000000003',
                'ca000000-0000-0000-0000-000000000004');
ROLLBACK TO SAVEPOINT c4;

\echo '-- ⭐ Controle positivo: 3 linhas (a capacidade exata) passam.'
SAVEPOINT c4b;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
SELECT c.id, :'sala_z', :'p_id', 'manual'
  FROM candidatos c
 WHERE c.id IN ('ca000000-0000-0000-0000-000000000001',
                'ca000000-0000-0000-0000-000000000002',
                'ca000000-0000-0000-0000-000000000003');
SELECT count(*) AS na_sala_cheia FROM candidatos_alocacao WHERE sala_id = :'sala_z';
ROLLBACK TO SAVEPOINT c4b;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 5 — AL007: a capacidade não desce abaixo da ocupação ──'
\echo '-- Sala 1 tem 3 alocados (CASO 1). Reduzir para 2: ERRO AL007 nomeando a sala.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c5;
UPDATE salas_prova_distribuidas SET sala_capacidade = 2 WHERE id = :'sala_1';
ROLLBACK TO SAVEPOINT c5;

\echo '-- ⭐ Controle positivo: reduzir para 3 (a ocupação exata) passa.'
SAVEPOINT c5b;
UPDATE salas_prova_distribuidas SET sala_capacidade = 3 WHERE id = :'sala_1';
SELECT 'reducao_ate_a_ocupacao_passou' AS ok;
ROLLBACK TO SAVEPOINT c5b;

\echo '-- 🔴 E com a prova FINALIZADA quem responde é PF001, não AL007 — a regra nova não'
\echo '-- ofusca a antiga (a ordem alfabética dos triggers foi escolhida para isso):'
SAVEPOINT c5c;
UPDATE provas SET prova_finalizada = true WHERE id = :'p_id';
UPDATE salas_prova_distribuidas SET sala_capacidade = 2 WHERE id = :'sala_1';
ROLLBACK TO SAVEPOINT c5c;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 6 — COERÊNCIA: cada metade barra por um nome diferente ──'
\echo '-- 6a. Candidato do edital B numa sala da prova A: ERRO AL005 (trigger).'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c6;
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000011', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c6;

\echo '-- 6b. Sala da prova B com prova_id da prova A: ERRO 23503 na FK COMPOSTA'
\echo '--     (candidatos_alocacao_sala_prova_fkey) — a metade declarativa. Usa o JOAO,'
\echo '--     que é do edital A e NÃO está alocado (senão o UNIQUE do caso 9 falaria antes).'
SAVEPOINT c6b;
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000010', :'sala_q', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c6b;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 7 — PF001: prova/unidade finalizada congela INCLUIR e RETIRAR ──'
-- ═════════════════════════════════════════════════════════════════════════════════════
\echo '-- 7a. Prova finalizada: INSERT recusado (PF001).'
SAVEPOINT c7;
UPDATE provas SET prova_finalizada = true WHERE id = :'p_id';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000009', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c7;

\echo '-- 7b. Prova finalizada: DELETE recusado (PF001).'
SAVEPOINT c7b;
UPDATE provas SET prova_finalizada = true WHERE id = :'p_id';
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
ROLLBACK TO SAVEPOINT c7b;

\echo '-- 7c. Unidade finalizada (prova aberta): INSERT recusado (PF001).'
SAVEPOINT c7c;
UPDATE prova_unidades SET unidade_finalizada = true
 WHERE prova_id = :'p_id' AND unidade_id = :'u_id';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000009', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c7c;

\echo '-- ⭐ 7d. Controle positivo: reaberta, o DELETE passa (esperado: 8 removidos, 0 restantes).'
SAVEPOINT c7d;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
SELECT count(*) AS restantes FROM candidatos_alocacao WHERE prova_id = :'p_id';
ROLLBACK TO SAVEPOINT c7d;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 8 — 🔴 O RESTRICT BARRA A TROCA TOTAL (decisão 3 do usuário) ──'
\echo '-- Com alocação de pé, reimportar o edital é recusado: ERRO 23503 nomeando'
\echo '-- candidatos_alocacao_candidato_id_fkey. É esse nome que mensagemErroImportacao'
\echo '-- traduz no cliente.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c8;
INSERT INTO candidatos_importacao (importacao_id, edital_id, linha)
VALUES ('11111111-0000-0000-0000-000000000001', :'ed_a',
        jsonb_build_object('n_inscricao', 'N001', 'nome', 'NOVO INSCRITO', 'cargo', 'cru'));
SELECT * FROM trocar_candidatos_do_edital(:'ed_a', '11111111-0000-0000-0000-000000000001', 1, '[]'::jsonb);
ROLLBACK TO SAVEPOINT c8;

\echo '-- ⭐ Controle positivo: SEM alocação a troca volta a passar (removidos=10, inseridos=1).'
SAVEPOINT c8b;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
INSERT INTO candidatos_importacao (importacao_id, edital_id, linha)
VALUES ('11111111-0000-0000-0000-000000000002', :'ed_a',
        jsonb_build_object('n_inscricao', 'N001', 'nome', 'NOVO INSCRITO', 'cargo', 'cru'));
SELECT * FROM trocar_candidatos_do_edital(:'ed_a', '11111111-0000-0000-0000-000000000002', 1, '[]'::jsonb);
ROLLBACK TO SAVEPOINT c8b;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 9 — UM CANDIDATO, UMA SALA POR PROVA ──'
\echo '-- Incluir quem já está alocado: ERRO 23505 nomeando candidatos_alocacao_prova_candidato_key'
\echo '-- (é esse índice que mensagemErroAlocacao traduz no cliente).'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c9;
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000001', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c9;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 10 — PERMISSÕES ──'
-- ═════════════════════════════════════════════════════════════════════════════════════
\echo '-- 10a. Não-admin: RLS devolve 0 linhas SEM ERRO (a armadilha a conhecer), e a RPC'
\echo '--      de distribuição recusa com a mensagem de admin (não com "não há candidatos").'
SAVEPOINT c10;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_naoadmin';
SELECT count(*) AS linhas_para_nao_admin FROM candidatos_alocacao WHERE prova_id = :'p_id';
SELECT * FROM distribuir_candidatos_da_prova(:'p_id');
ROLLBACK TO SAVEPOINT c10;

\echo '-- 10b. INSERT direto como não-admin: RLS recusa (42501).'
SAVEPOINT c10b;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_naoadmin';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000009', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c10b;

\echo '-- 10c. ⭐ SUPERADMIN PURO (sem linha admin): a hierarquia mora em has_role — a'
\echo '--      distribuição PASSA. Um SELECT literal em user_roles quebraria este caso.'
SAVEPOINT c10c;
INSERT INTO user_roles (user_id, role) VALUES (:'naoadmin_id'::uuid, 'superadmin');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_naoadmin';
SELECT alocados FROM distribuir_candidatos_da_prova(:'p_id');
ROLLBACK TO SAVEPOINT c10c;

\echo ''
\echo '── FIM — ROLLBACK geral: o banco fica como estava ──'
ROLLBACK;
