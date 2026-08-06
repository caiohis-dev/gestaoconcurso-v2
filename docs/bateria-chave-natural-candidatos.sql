-- Bateria manual da CHAVE NATURAL de `candidatos` — (edital_id, n_inscricao)
-- Rodar contra o banco LOCAL:
--   docker cp docs/bateria-chave-natural-candidatos.sql supabase_db_<ref>:/tmp/b.sql
--   docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/b.sql
--
-- POR QUE ISTO EXISTE, e por que não é um teste do Vitest: a suíte mocka o Supabase. Ela
-- não exercita índice único — um teste lá afirmaria o mock. `chaveNatural()` em
-- src/lib/candidatos-import.ts é um ESPELHO deste índice, e quando os dois divergem o
-- sintoma não é teste vermelho: é a troca inteira recusada na hora de importar.
--
-- O QUE MUDOU (migration 20260801193530, 2026-08-01): a chave era
-- (edital_id, cpf, cargo_id, n_inscricao) NULLS NOT DISTINCT e passou a ser
-- (edital_id, n_inscricao). Decisão do usuário: o nº de inscrição identifica a inscrição.
--
-- MEDIDO antes de apertar — arquivo real, 7.416 linhas: nº de inscrição repetido = 0.
-- A mesma pessoa em dois cargos tem DOIS números (CPF 05261923727 nas inscrições 9 e
-- 5208), e é isso que faz o cargo ser dispensável na chave.
--
-- REGRA DA CASA: toda recusa vem acompanhada do CONTROLE POSITIVO. Provar que passou a
-- recusar é metade do trabalho; a outra metade é provar que continua aceitando o que deve.
-- Tudo em transação com ROLLBACK — a bateria não deixa resíduo.
--
-- ⚠️ PRÉ-CONDIÇÃO: precisa de 2 editais cadastrados (o caso 3 usa o segundo). Um `db reset`
-- entrega isso pelo dump. Os fixtures usam nº de inscrição alto e nomes com prefixo
-- 'BATERIA ' para não colidir com uma importação real que esteja na base.

\set ON_ERROR_STOP off
\timing off

\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. ESTRUTURA                                                           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Esperado: candidatos_edital_inscricao_key presente, SEM "NULLS NOT DISTINCT";'
\echo '--           nenhum candidatos_cpf_cargo_id_inscricao_key.'
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'candidatos' AND indexdef LIKE '%UNIQUE%'
 ORDER BY indexname;

\echo ''
\echo '-- Esperado: as DUAS colunas da chave NOT NULL (por isso NULLS NOT DISTINCT saiu).'
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'candidatos' AND column_name IN ('edital_id', 'n_inscricao')
 ORDER BY column_name;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. COMPORTAMENTO                                                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;

\echo ''
\echo '── CASO 1 (CONTROLE +) mesma pessoa, mesmo CPF, DOIS números -> DEVE PASSAR ──'
\echo '-- É o caso dos 382 do arquivo real: quem concorre a dois cargos faz duas'
\echo '-- inscrições. Se ISTO falhar, a chave ficou larga e 380 pagantes perdem a segunda.'
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '900001', 'BATERIA CASSIA', '99528037704' FROM editais ORDER BY id LIMIT 1;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '900002', 'BATERIA CASSIA', '99528037704' FROM editais ORDER BY id LIMIT 1;

\echo ''
\echo '── CASO 2  MESMO número no MESMO edital -> DEVE FALHAR ──'
\echo '-- A recusa nomeia candidatos_edital_inscricao_key, e é por esse NOME que'
\echo '-- mensagemErroImportacao() traduz o erro. Renomear o índice sem mexer lá faz o'
\echo '-- usuário voltar a ver a mensagem crua do Postgres.'
SAVEPOINT s2;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '900001', 'BATERIA OUTRA PESSOA', '22940161739' FROM editais ORDER BY id LIMIT 1;
ROLLBACK TO s2;

\echo ''
\echo '── CASO 3 (CONTROLE +) MESMO número em OUTRO edital -> DEVE PASSAR ──'
\echo '-- Por que edital_id é indispensável: o nº de inscrição recomeça em 1 a cada'
\echo '-- planilha. Sem ele, o segundo edital importado colidiria já na primeira linha.'
SAVEPOINT s3;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '900001', 'BATERIA EDITAL B', '22940161739' FROM editais ORDER BY id OFFSET 1 LIMIT 1;
RELEASE s3;

\echo ''
\echo '── CASO 4 (CONTROLE +) mesmo CPF e mesmo cargo, números diferentes -> DEVE PASSAR ──'
\echo '-- ⚠️ É o AFROUXAMENTO ACEITO da mudança: a chave não barra mais o mesmo CPF duas'
\echo '-- vezes no mesmo cargo. Não ocorre no arquivo medido (0 casos).'
SAVEPOINT s4;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '900003', 'BATERIA CASSIA', '99528037704' FROM editais ORDER BY id LIMIT 1;
RELEASE s4;

\echo ''
\echo '── CASO 5 (CONTROLE +) CPF NULO em linhas de números diferentes -> DEVE PASSAR ──'
\echo '-- O que o NULLS NOT DISTINCT guardava até 31/07: dois inscritos sem CPF fundidos'
\echo '-- num só. Com o CPF fora da identidade a proteção deixou de depender dele — são as'
\echo '-- 2 linhas de CPF impossível do arquivo real, que estão nas inscrições 375 e 4256.'
SAVEPOINT s5;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '900375', 'BATERIA CRISTIANE', NULL FROM editais ORDER BY id LIMIT 1;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '904256', 'BATERIA JOSIANE', NULL FROM editais ORDER BY id LIMIT 1;
RELEASE s5;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. O TETO DE 12 CARACTERES (migration 20260806162539)                  ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Decisão do usuário 2026-08-06: n_inscricao cabe ATÉ 12. É capacidade, não'
\echo '-- formato — valor mais curto vale, e NÃO há regra de "só dígitos" (47 literais'
\echo '-- não-numéricos vivem nestas baterias: N001, A001, S002…).'
\echo ''
\echo '-- Esperado: n_inscricao = text; chk_candidato_n_inscricao_tamanho (<= 12) E'
\echo '--           chk_candidato_n_inscricao_preenchido presentes, as DUAS.'
SELECT data_type, character_maximum_length
  FROM information_schema.columns
 WHERE table_name = 'candidatos' AND column_name = 'n_inscricao';

SELECT conname, pg_get_constraintdef(oid) AS definicao
  FROM pg_constraint
 WHERE conrelid = 'public.candidatos'::regclass
   AND conname LIKE 'chk_candidato_n_inscricao%'
 ORDER BY conname;

\echo ''
\echo '── CASO 6 — 13 caracteres -> DEVE FALHAR por chk_candidato_n_inscricao_tamanho ──'
\echo '-- 🔴 O NOME importa, não só a recusa: é ele que prova qual regra barrou. A tela'
\echo '-- (LIMITE_N_INSCRICAO em candidatos-import.ts) espelha ESTA constraint, e'
\echo '-- mensagemErroImportacao a traduz casando o nome.'
SAVEPOINT s6;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '1234567890123', 'BATERIA TRECO LONGO', NULL FROM editais ORDER BY id LIMIT 1;
ROLLBACK TO s6;

\echo ''
\echo '── CASO 7 (CONTROLE +) exatamente 12 caracteres -> DEVE PASSAR ──'
\echo '-- A outra metade da prova. Sem este caso, um <= virado em < passaria despercebido.'
\echo '-- O zero à esquerda também está aqui de propósito: é o motivo de a coluna ser texto.'
SAVEPOINT s7;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '000000900012', 'BATERIA DOZE EXATOS', NULL FROM editais ORDER BY id LIMIT 1;
RELEASE s7;

\echo ''
\echo '── CASO 8 — branco -> DEVE FALHAR por chk_candidato_n_inscricao_PREENCHIDO ──'
\echo '-- 🔴 Este caso NÃO é sobre o branco: é sobre a CHECK nova não ter OFUSCADO a'
\echo '-- antiga. O teto foi escrito só com o limite superior (char_length <= 12) para que'
\echo '-- o piso continuasse sendo trabalho da _preenchido. Se um dia a recusa aqui passar'
\echo '-- a citar _tamanho, a cobertura da _preenchido virou fantasma — é o caso de 03/08'
\echo '-- com sala_numero = -1 (§8 do CLAUDE.md).'
SAVEPOINT s8;
INSERT INTO candidatos (edital_id, n_inscricao, nome, cpf)
SELECT id, '   ', 'BATERIA BRANCO', NULL FROM editais ORDER BY id LIMIT 1;
ROLLBACK TO s8;

\echo ''
\echo '-- Esperado: 7 linhas BATERIA (900001, 900002, 900003, 900375, 904256 e'
\echo '--           000000900012 no edital A + 900001 no edital B).'
SELECT count(*) AS total_bateria FROM candidatos WHERE nome LIKE 'BATERIA %';

ROLLBACK;

\echo ''
\echo '-- Esperado: 0 — a bateria não deixa resíduo.'
SELECT count(*) AS sobrou FROM candidatos WHERE nome LIKE 'BATERIA %';
