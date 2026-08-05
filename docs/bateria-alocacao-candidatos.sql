-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Alocação de Candidatos em salas
-- migrations 20260804225156 (a tabela e as barreiras) + 20260805185155 (o PLANO)
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Prova as barreiras do vínculo candidato ↔ sala e o comportamento da APLICAÇÃO DE PLANO:
-- por cargo, alfabética dentro do cargo, CARGO NOVO ABRE SALA NOVA **dentro de cada
-- unidade** (a sala de fronteira fica com vagas ociosas), um cargo PODE se dividir entre
-- unidades, especiais fora, manual preservado. Cada recusa afirma o SQLSTATE E o nome de
-- quem barrou — regra nova não pode ofuscar a antiga (prova finalizada continua
-- respondendo PF001, não AL007).
--
-- ⚠️ REESCRITA em 2026-08-05. `distribuir_candidatos_da_prova` foi DROPADA e substituída
-- por `aplicar_plano_de_alocacao(prova, plano jsonb)`: o admin passou a escolher QUAL
-- unidade recebe cada cargo. As 5 chamadas antigas foram trocadas no mesmo passe em que
-- a função saiu — é a lição de 02/08, quando a bateria da troca total ficou 2 dias
-- falhando na primeira linha porque a assinatura mudou e ninguém procurou as chamadas.
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
-- procure as chamadas neste arquivo no mesmo passe.
--
-- 🔴 A bateria chama `aplicar_plano_de_alocacao` VÁRIAS VEZES na mesma transação. Isso é
-- de propósito: é o controle de que a RPC é RE-ENTRANTE. Uma implementação com
-- `CREATE TEMP TABLE ... ON COMMIT DROP` morreria na segunda chamada com "relation
-- already exists" — foi por isso que o plano e o ponteiro viraram jsonb.
--
-- Tudo roda numa transação com ROLLBACK final: o banco fica como estava.
-- ─────────────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\timing off

BEGIN;

\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ SETUP — prova do dump reaberta, 2 unidades com salas, sintéticos       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Os UUIDs saem do próprio banco: a bateria não envelhece com o dump.'

-- A prova do Edital 001 e a prova do Edital 002 (esta só para os casos de coerência).
SELECT p.id AS p_id, p.edital_id AS ed_a
  FROM provas p JOIN editais e ON e.id = p.edital_id
 WHERE e.nome = 'Edital 001/2026 SMA' \gset
SELECT p.id AS q_id, p.edital_id AS ed_b
  FROM provas p JOIN editais e ON e.id = p.edital_id
 WHERE e.nome = 'Edital 002/2026 - SMA' \gset

-- Reabre prova e unidade (no dump estão finalizadas; o congelamento é o CASO 11) e
-- encolhe as salas para capacidade 3 — os números pequenos tornam os casos legíveis.
UPDATE provas SET prova_finalizada = false WHERE id IN (:'p_id'::uuid, :'q_id'::uuid);
UPDATE prova_unidades SET unidade_finalizada = false
 WHERE prova_id IN (:'p_id'::uuid, :'q_id'::uuid);
UPDATE salas_prova_distribuidas SET sala_capacidade = 3 WHERE prova_id = :'p_id'::uuid;

-- 🔴 DUAS unidades com salas. No dump, as 16 salas da prova A estão todas numa unidade
-- (CGV) e a outra vinculada (SA) está VAZIA — não daria para exercitar nem a divisão de
-- um cargo entre unidades, nem o ponteiro POR UNIDADE, que é o miolo da RPC nova.
-- O andar 2 inteiro muda de unidade: 8 salas em cada, 24 vagas em cada.
SELECT pu.unidade_id AS u_id FROM prova_unidades pu
 WHERE pu.prova_id = :'p_id'
   AND EXISTS (SELECT 1 FROM salas_prova_distribuidas s
                WHERE s.prova_id = :'p_id' AND s.sala_fk_unidade = pu.unidade_id) \gset
SELECT pu.unidade_id AS u_id2 FROM prova_unidades pu
 WHERE pu.prova_id = :'p_id' AND pu.unidade_id <> :'u_id'::uuid LIMIT 1 \gset

UPDATE salas_prova_distribuidas SET sala_fk_unidade = :'u_id2'::uuid
 WHERE prova_id = :'p_id' AND sala_andar = 2;

\echo '-- Confirmação do setup (esperado: 2 linhas, 8 salas e 24 vagas em cada):'
SELECT u.unid_sigla, count(*) AS salas, sum(s.sala_capacidade) AS vagas
  FROM salas_prova_distribuidas s JOIN unidades_prova u ON u.id = s.sala_fk_unidade
 WHERE s.prova_id = :'p_id' GROUP BY u.unid_sigla ORDER BY 1;

-- As três primeiras salas da unidade A, na MESMA ordem física da aplicação do plano.
SELECT id AS sala_1 FROM salas_prova_distribuidas
 WHERE prova_id = :'p_id' AND sala_fk_unidade = :'u_id'
 ORDER BY sala_andar NULLS LAST, sala_numero LIMIT 1 \gset
SELECT id AS sala_2 FROM salas_prova_distribuidas
 WHERE prova_id = :'p_id' AND sala_fk_unidade = :'u_id'
 ORDER BY sala_andar NULLS LAST, sala_numero OFFSET 1 LIMIT 1 \gset
-- A última da unidade A, que ficará vazia — é onde o manual entra.
SELECT id AS sala_z FROM salas_prova_distribuidas
 WHERE prova_id = :'p_id' AND sala_fk_unidade = :'u_id'
 ORDER BY sala_andar NULLS LAST, sala_numero DESC LIMIT 1 \gset
-- Uma sala da OUTRA prova, para a FK composta.
SELECT id AS sala_q FROM salas_prova_distribuidas WHERE prova_id = :'q_id'
 ORDER BY sala_numero LIMIT 1 \gset
-- Uma unidade que NÃO é desta prova, para o AL009.
SELECT id AS u_fora FROM unidades_prova
 WHERE id NOT IN (SELECT unidade_id FROM prova_unidades WHERE prova_id = :'p_id') LIMIT 1 \gset

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
  -- E um inscrito do OUTRO edital, para a coerência (CASO 10).
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
\echo '── CASO 0 — cargos_pendentes_da_prova alimenta a faixa de arrasto ──'
\echo '-- Esperado: CARGO A a_distribuir=5 especiais=2 ja_alocados=0 total=7;'
\echo '--           CARGO B a_distribuir=3 total=3.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SELECT cargo_nome, a_distribuir, especiais, ja_alocados, total
  FROM cargos_pendentes_da_prova(:'p_id')
 WHERE cargo_nome LIKE 'BATERIA%';

\echo ''
\echo '-- ⭐ 0b. CONTROLE CRÍTICO: com o plano APLICADO, `a_distribuir` NÃO cai.'
\echo '-- Aplicar um plano apaga origem=automatica e reinsere, então quem está alocado'
\echo '-- CONTINUA disponível. Se caísse, uma prova já distribuída abriria a tela com a'
\echo '-- faixa VAZIA — número plausível e errado. Esperado: a_distribuir SEGUE 5 e 3,'
\echo '-- e ja_alocados passa a 5 e 3.'
SAVEPOINT c0b;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT alocados FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',5),
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000b','unidade_id',:'u_id','quantidade',3)
));
RESET ROLE;
SELECT cargo_nome, a_distribuir, ja_alocados FROM cargos_pendentes_da_prova(:'p_id')
 WHERE cargo_nome LIKE 'BATERIA%';

\echo '-- E a ocupação por unidade separa o que o plano PRESERVA do que ele refaz'
\echo '-- (esperado: total=8, manuais=0):'
SELECT u.unid_sigla, o.total, o.manuais
  FROM contar_alocados_por_unidade(:'p_id') o
  JOIN unidades_prova u ON u.id = o.unidade_id;
ROLLBACK TO SAVEPOINT c0b;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 1 — O PLANO: alfabética, e CARGO NOVO ABRE SALA NOVA na mesma unidade ──'
\echo '-- Plano: cargo A (5) → unidade A; cargo B (3) → unidade A.'
\echo '-- Esperado: alocados=8, sem_sala=0, pendentes_especiais=2.'
\echo '-- Sala 1 = ANA,BETO,CARLA; sala 2 = DORA,EVA (1 vaga OCIOSA — fronteira);'
\echo '-- sala 3 = FABIO,GILDA,HUGO — o cargo B NÃO ocupa a vaga ociosa da sala 2.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c1;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',5),
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000b','unidade_id',:'u_id','quantidade',3)
));
RESET ROLE;

SELECT c.nome, u.unid_sigla, s.sala_numero, a.origem
  FROM candidatos_alocacao a
  JOIN candidatos c ON c.id = a.candidato_id
  JOIN salas_prova_distribuidas s ON s.id = a.sala_id
  JOIN unidades_prova u ON u.id = s.sala_fk_unidade
 WHERE a.prova_id = :'p_id'
 ORDER BY u.unid_sigla, s.sala_andar NULLS LAST, s.sala_numero, c.nome;

\echo '-- E a concordância: nenhum alocado automático aparece em especiais_da_prova, e os'
\echo '-- 2 especiais aparecem PENDENTES (sala_id nulo). Esperado: 2 linhas, sala vazia.'
SELECT nome, sala_especial, portador_deficiencia, sala_id FROM especiais_da_prova(:'p_id');

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 2 — 🔴 UM CARGO DIVIDIDO ENTRE DUAS UNIDADES (o caso PRINCIPAL) ──'
\echo '-- Medido em 05/08: DOCENTE II tem 3.663 inscritos e a maior unidade 3.200 vagas.'
\echo '-- Dividir não é borda, é o caso normal. Plano: cargo A 3 → unid A, cargo A 2 → unid B.'
\echo '-- Esperado: alocados=5. ANA,BETO,CARLA na unid A; DORA,EVA na unid B — SEM repetir'
\echo '-- ninguém (é o NOT EXISTS que garante que a 2ª entrada pega os SEGUINTES).'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c2;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',3),
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id2','quantidade',2)
));
RESET ROLE;

SELECT c.nome, u.unid_sigla, s.sala_numero
  FROM candidatos_alocacao a
  JOIN candidatos c ON c.id = a.candidato_id
  JOIN salas_prova_distribuidas s ON s.id = a.sala_id
  JOIN unidades_prova u ON u.id = s.sala_fk_unidade
 WHERE a.prova_id = :'p_id' ORDER BY u.unid_sigla, s.sala_numero, c.nome;

\echo '-- ⭐ CONTROLE: cada inscrito aparece UMA vez só (esperado: 5 linhas, 5 distintos).'
SELECT count(*) AS linhas, count(DISTINCT candidato_id) AS distintos
  FROM candidatos_alocacao WHERE prova_id = :'p_id';
ROLLBACK TO SAVEPOINT c2;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 3 — 🔴 PONTEIRO POR UNIDADE: voltar a uma unidade já usada ──'
\echo '-- Plano: A→unidA(3), B→unidB(3), A→unidA(2). A 3ª entrada volta à unidade A, que'
\echo '-- já tem a sala 1 fechada. Um ponteiro GLOBAL (o da RPC antiga) reabriria a conta'
\echo '-- errada; o ponteiro POR UNIDADE manda DORA,EVA para a sala 2 da unidade A.'
\echo '-- Esperado: alocados=8; unidade A com sala1=3 e sala2=2; unidade B com 3.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c3;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',3),
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000b','unidade_id',:'u_id2','quantidade',3),
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',2)
));
RESET ROLE;

SELECT u.unid_sigla, s.sala_numero, count(*) AS ocupada, string_agg(c.nome, ', ' ORDER BY c.nome) AS quem
  FROM candidatos_alocacao a
  JOIN candidatos c ON c.id = a.candidato_id
  JOIN salas_prova_distribuidas s ON s.id = a.sala_id
  JOIN unidades_prova u ON u.id = s.sala_fk_unidade
 WHERE a.prova_id = :'p_id'
 GROUP BY u.unid_sigla, s.sala_andar, s.sala_numero ORDER BY 1, 2;
ROLLBACK TO SAVEPOINT c3;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 4 — REAPLICAR PRESERVA O MANUAL (e prova a RE-ENTRÂNCIA da RPC) ──'
\echo '-- IARA (PCD) entra à mão na última sala; reaplicar o plano mantém a linha manual.'
\echo '-- Esperado: preservados=1, pendentes_especiais=1; depois manual=1 e automatica=8.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c4;
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000009', :'sala_z', :'p_id', 'manual');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',5),
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000b','unidade_id',:'u_id','quantidade',3)
));
RESET ROLE;

SELECT origem, count(*) FROM candidatos_alocacao WHERE prova_id = :'p_id' GROUP BY origem ORDER BY origem;
\echo '-- E especiais_da_prova mostra IARA ATENDIDA (sala preenchida), JOAO pendente:'
SELECT nome, sala_id IS NOT NULL AS atendido FROM especiais_da_prova(:'p_id');
ROLLBACK TO SAVEPOINT c4;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 5 — ⭐ PLANO INCOMPLETO É PERMITIDO (decisão D3) ──'
\echo '-- Plano só com o cargo A. O cargo B fica de fora, e o retorno DIZ o número.'
\echo '-- Esperado: alocados=5, sem_sala=3 (o cargo B), pendentes_especiais=2.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c5;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',5)
));
RESET ROLE;
ROLLBACK TO SAVEPOINT c5;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 6 — 🔴 AL004: não coube, e a mensagem NOMEIA O CARGO E A UNIDADE ──'
\echo '-- Cargo C ganha 40 inscritos; a unidade A tem 8 salas × 3 = 24 vagas.'
\echo '-- Esperado: ERRO AL004 citando "BATERIA CARGO C" E a sigla da unidade. Nada muda.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c6;
INSERT INTO cargos (id, nome) VALUES ('ba7e01a0-0000-0000-0000-00000000000c', 'BATERIA CARGO C');
INSERT INTO candidatos (edital_id, n_inscricao, nome, cargo, cargo_id)
SELECT :'ed_a', 'C' || lpad(g::text, 3, '0'), 'ZE NUMERO ' || lpad(g::text, 3, '0'), 'cru',
       'ba7e01a0-0000-0000-0000-00000000000c'
  FROM generate_series(1, 40) g;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000c','unidade_id',:'u_id','quantidade',40)
));
ROLLBACK TO SAVEPOINT c6;
\echo '-- Controle: a alocação do CASO 1 segue de pé (esperado 8):'
SELECT count(*) AS alocados_intactos FROM candidatos_alocacao WHERE prova_id = :'p_id';

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 7 — AL010: o plano pede mais gente do que o cargo tem ──'
\echo '-- Cargo B tem 3 elegíveis; o plano pede 99. Esperado: ERRO AL010 dizendo 99 e 3.'
\echo '-- (Sem esta guarda a RPC alocaria só 3 e diria "pronto" — perda silenciosa.)'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c7;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000b','unidade_id',:'u_id','quantidade',99)
));
ROLLBACK TO SAVEPOINT c7;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 8 — AL009 e AL008: plano incoerente ou vazio ──'
\echo '-- 8a. Unidade que não é desta prova: ERRO AL009 (a FK pegaria, mas sem nomear).'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c8;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_fora','quantidade',1)
));
ROLLBACK TO SAVEPOINT c8;

\echo '-- 8b. Plano VAZIO: ERRO AL008.'
SAVEPOINT c8b;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', '[]'::jsonb);
ROLLBACK TO SAVEPOINT c8b;

\echo '-- 8c. Quantidade ZERO: ERRO AL008 (não é "não faz nada" — é plano malformado).'
SAVEPOINT c8c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',0)
));
ROLLBACK TO SAVEPOINT c8c;

\echo '-- 8d. 🔴 PF001 tem de responder ANTES: prova finalizada + plano válido.'
\echo '--     Quem barra é o trigger no DELETE do automático, não uma checagem da RPC.'
SAVEPOINT c8d;
UPDATE provas SET prova_finalizada = true WHERE id = :'p_id';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_admin';
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',5)
));
ROLLBACK TO SAVEPOINT c8d;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 9 — AL006: sala lotada recusa, inclusive no MEIO de um INSERT em massa ──'
\echo '-- A sala vazia tem capacidade 3; um INSERT de 4 linhas num comando só estoura na'
\echo '-- 4ª. Esperado: ERRO AL006 — o trigger enxerga as linhas do próprio comando.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c9;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
SELECT c.id, :'sala_z', :'p_id', 'manual'
  FROM candidatos c
 WHERE c.id IN ('ca000000-0000-0000-0000-000000000001',
                'ca000000-0000-0000-0000-000000000002',
                'ca000000-0000-0000-0000-000000000003',
                'ca000000-0000-0000-0000-000000000004');
ROLLBACK TO SAVEPOINT c9;

\echo '-- ⭐ Controle positivo: 3 linhas (a capacidade exata) passam.'
SAVEPOINT c9b;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
SELECT c.id, :'sala_z', :'p_id', 'manual'
  FROM candidatos c
 WHERE c.id IN ('ca000000-0000-0000-0000-000000000001',
                'ca000000-0000-0000-0000-000000000002',
                'ca000000-0000-0000-0000-000000000003');
SELECT count(*) AS na_sala_cheia FROM candidatos_alocacao WHERE sala_id = :'sala_z';
ROLLBACK TO SAVEPOINT c9b;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 10 — AL007 e a ORDEM DOS TRIGGERS ──'
\echo '-- Sala 1 tem 3 alocados (CASO 1). Reduzir para 2: ERRO AL007 nomeando a sala.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c10;
UPDATE salas_prova_distribuidas SET sala_capacidade = 2 WHERE id = :'sala_1';
ROLLBACK TO SAVEPOINT c10;

\echo '-- ⭐ Controle positivo: reduzir para 3 (a ocupação exata) passa.'
SAVEPOINT c10b;
UPDATE salas_prova_distribuidas SET sala_capacidade = 3 WHERE id = :'sala_1';
SELECT 'reducao_ate_a_ocupacao_passou' AS ok;
ROLLBACK TO SAVEPOINT c10b;

\echo '-- 🔴 E com a prova FINALIZADA quem responde é PF001, não AL007 — a regra nova não'
\echo '-- ofusca a antiga (a ordem alfabética dos triggers foi escolhida para isso):'
SAVEPOINT c10c;
UPDATE provas SET prova_finalizada = true WHERE id = :'p_id';
UPDATE salas_prova_distribuidas SET sala_capacidade = 2 WHERE id = :'sala_1';
ROLLBACK TO SAVEPOINT c10c;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 11 — COERÊNCIA: cada metade barra por um nome diferente ──'
\echo '-- 11a. Candidato do edital B numa sala da prova A: ERRO AL005 (trigger).'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c11;
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000011', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c11;

\echo '-- 11b. Sala da prova B com prova_id da prova A: ERRO 23503 na FK COMPOSTA'
\echo '--      (candidatos_alocacao_sala_prova_fkey) — a metade declarativa. Usa o JOAO,'
\echo '--      que é do edital A e NÃO está alocado (senão o UNIQUE falaria antes).'
SAVEPOINT c11b;
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000010', :'sala_q', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c11b;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 12 — PF001: prova/unidade finalizada congela INCLUIR e RETIRAR ──'
-- ═════════════════════════════════════════════════════════════════════════════════════
\echo '-- 12a. Prova finalizada: INSERT recusado (PF001).'
SAVEPOINT c12;
UPDATE provas SET prova_finalizada = true WHERE id = :'p_id';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000009', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c12;

\echo '-- 12b. Prova finalizada: DELETE recusado (PF001).'
SAVEPOINT c12b;
UPDATE provas SET prova_finalizada = true WHERE id = :'p_id';
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
ROLLBACK TO SAVEPOINT c12b;

\echo '-- 12c. Unidade finalizada (prova aberta): INSERT recusado (PF001).'
SAVEPOINT c12c;
UPDATE prova_unidades SET unidade_finalizada = true
 WHERE prova_id = :'p_id' AND unidade_id = :'u_id';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000009', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c12c;

\echo '-- ⭐ 12d. Controle positivo: reaberta, o DELETE passa (esperado: 8 removidos, 0 restantes).'
SAVEPOINT c12d;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
SELECT count(*) AS restantes FROM candidatos_alocacao WHERE prova_id = :'p_id';
ROLLBACK TO SAVEPOINT c12d;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 13 — 🔴 O RESTRICT BARRA A TROCA TOTAL (decisão 4 do módulo) ──'
\echo '-- Com alocação de pé, reimportar o edital é recusado: ERRO 23503 nomeando'
\echo '-- candidatos_alocacao_candidato_id_fkey. É esse nome que mensagemErroImportacao'
\echo '-- traduz no cliente.'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c13;
INSERT INTO candidatos_importacao (importacao_id, edital_id, linha)
VALUES ('11111111-0000-0000-0000-000000000001', :'ed_a',
        jsonb_build_object('n_inscricao', 'N001', 'nome', 'NOVO INSCRITO', 'cargo', 'cru'));
SELECT * FROM trocar_candidatos_do_edital(:'ed_a', '11111111-0000-0000-0000-000000000001', 1, '[]'::jsonb);
ROLLBACK TO SAVEPOINT c13;

\echo '-- ⭐ Controle positivo: SEM alocação a troca volta a passar (removidos=10, inseridos=1).'
SAVEPOINT c13b;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
INSERT INTO candidatos_importacao (importacao_id, edital_id, linha)
VALUES ('11111111-0000-0000-0000-000000000002', :'ed_a',
        jsonb_build_object('n_inscricao', 'N001', 'nome', 'NOVO INSCRITO', 'cargo', 'cru'));
SELECT * FROM trocar_candidatos_do_edital(:'ed_a', '11111111-0000-0000-0000-000000000002', 1, '[]'::jsonb);
ROLLBACK TO SAVEPOINT c13b;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 14 — UM CANDIDATO, UMA SALA POR PROVA ──'
\echo '-- Incluir quem já está alocado: ERRO 23505 nomeando candidatos_alocacao_prova_candidato_key'
\echo '-- (é esse índice que mensagemErroAlocacao traduz no cliente).'
-- ═════════════════════════════════════════════════════════════════════════════════════
SAVEPOINT c14;
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000001', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c14;

-- ═════════════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '── CASO 15 — PERMISSÕES ──'
-- ═════════════════════════════════════════════════════════════════════════════════════
\echo '-- 15a. Não-admin: RLS devolve 0 linhas SEM ERRO (a armadilha a conhecer), e a RPC'
\echo '--      recusa com a mensagem de ADMIN (não com "não há candidatos").'
SAVEPOINT c15;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_naoadmin';
SELECT count(*) AS linhas_para_nao_admin FROM candidatos_alocacao WHERE prova_id = :'p_id';
SELECT count(*) AS cargos_para_nao_admin FROM cargos_pendentes_da_prova(:'p_id');
SELECT * FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',5)
));
ROLLBACK TO SAVEPOINT c15;

\echo '-- 15b. INSERT direto como não-admin: RLS recusa (42501).'
SAVEPOINT c15b;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_naoadmin';
INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem)
VALUES ('ca000000-0000-0000-0000-000000000009', :'sala_z', :'p_id', 'manual');
ROLLBACK TO SAVEPOINT c15b;

\echo '-- 15c. ⭐ SUPERADMIN PURO (sem linha admin): a hierarquia mora em has_role — a'
\echo '--      aplicação do plano PASSA. Um SELECT literal em user_roles quebraria isto.'
SAVEPOINT c15c;
DELETE FROM candidatos_alocacao WHERE prova_id = :'p_id';
INSERT INTO user_roles (user_id, role) VALUES (:'naoadmin_id'::uuid, 'superadmin');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO :'jwt_naoadmin';
SELECT alocados FROM aplicar_plano_de_alocacao(:'p_id', jsonb_build_array(
  jsonb_build_object('cargo_id','ba7e01a0-0000-0000-0000-00000000000a','unidade_id',:'u_id','quantidade',5)
));
ROLLBACK TO SAVEPOINT c15c;

\echo ''
\echo '── FIM — ROLLBACK geral: o banco fica como estava ──'
ROLLBACK;
