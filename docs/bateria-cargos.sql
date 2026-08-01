-- Bateria manual do módulo CARGOS — etapa 1 do roadmap-cargos.yaml
-- Rodar contra o banco LOCAL:
--   docker cp docs/bateria-cargos.sql supabase_db_<ref>:/tmp/b.sql
--   docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/b.sql
--
-- POR QUE ISTO EXISTE, e por que não é um teste do Vitest: a suíte mocka o Supabase.
-- Ela não exercita RLS, CHECK, índice único, coluna gerada, FK nem trigger — um teste lá
-- afirmaria o mock. Esta é a única verificação real destas regras.
--
-- ✅ A PRÉ-CONDIÇÃO FOI ELIMINADA em 2026-07-31 — não precisa mais de `db reset`.
--
-- O que era: os fixtures usavam os nomes reais — DOCENTE II, ARTE, DOCENTE I — HISTÓRIA —,
-- que são EXATAMENTE os que uma importação real cria no catálogo. Com o catálogo povoado,
-- os INSERTs colidiam em `cargos_nome_chave_key`, cada colisão abortava o bloco, e o
-- resultado era uma cascata de "transaction is aborted" que PARECIA falha da bateria e
-- não era.
--
-- O conserto: todo fixture ganhou o prefixo **'BATERIA '**, que nenhuma origem produz. A
-- bateria roda agora em qualquer estado do catálogo. ⚠️ Ao acrescentar caso novo, mantenha
-- o prefixo — sem ele a pré-condição volta, e ela se manifesta como falha falsa.
--
-- REGRA DA CASA: toda recusa vem acompanhada do CONTROLE POSITIVO. Provar que passou a
-- recusar é metade do trabalho; a outra metade é provar que continua aceitando o que deve.
-- Tudo em transação com ROLLBACK — a bateria não deixa resíduo.

\set ON_ERROR_STOP off
\timing off

\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. ESTRUTURA                                                           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 1.1 As duas tabelas existem, com RLS ATIVA (esperado: 2 linhas, rowsecurity=t)'
SELECT relname, relrowsecurity AS rls_ativa
FROM pg_class
WHERE relname IN ('cargos', 'cargo_apelidos') AND relnamespace = 'public'::regnamespace
ORDER BY relname;

\echo ''
\echo '-- 1.2 candidatos.cargo_id existe e é NULLABLE (esperado: is_nullable = YES)'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'candidatos' AND column_name = 'cargo_id';

\echo ''
\echo '-- 1.3 Os índices. Esperado: os 2 únicos + os 2 de apoio a FK'
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename IN ('cargos', 'cargo_apelidos') OR indexname = 'idx_candidatos_cargo')
ORDER BY tablename, indexname;

\echo ''
\echo '-- 1.4 As FKs e suas ações. Esperado: candidatos RESTRICT (r), apelidos CASCADE (c).'
\echo '--     ⚠️ As duas foram RESTRICT por UM dia (31/07 → 01/08), quando a CG001 trancava'
\echo '--     por qualquer menção. Desde 01/08 o bloqueio olha só inscritos, e a assimetria'
\echo '--     deliberada voltou: apelido é atalho de digitação, candidato é gente.'
SELECT c.conrelid::regclass AS tabela, c.conname, c.confdeltype AS on_delete
FROM pg_constraint c
WHERE c.contype = 'f' AND c.confrelid = 'public.cargos'::regclass
ORDER BY 1;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. GRANTS — cargos nasceu enxuta; candidatos alcançou em 31/07         ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 2.1 anon NÃO tem privilégio nenhum nas tabelas novas (esperado: 0 linhas)'
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
  AND table_name IN ('cargos', 'cargo_apelidos')
ORDER BY 1, 2;

\echo ''
\echo '-- 2.2 authenticated tem SÓ o DML (esperado: DELETE, INSERT, SELECT, UPDATE — 4 cada)'
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'authenticated'
  AND table_name IN ('cargos', 'cargo_apelidos')
GROUP BY table_name ORDER BY 1;

\echo ''
\echo '-- 2.3 candidatos também ficou enxuta (migration 20260731110000).'
\echo '--     Esperado: anon AUSENTE; authenticated só com o DML.'
\echo '--     ⚠️ Este caso era um CONTRASTE — até 30/07 esperava-se ver anon com TRUNCATE'
\echo '--     aqui, e era essa a prova de que a revogação das tabelas novas tinha pegado.'
\echo '--     O contraste acabou: agora as três tabelas seguem o mesmo padrão.'
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'candidatos'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee ORDER BY 1;

\echo ''
\echo '-- 2.4 TRUNCATE como anon é RECUSADO nas tabelas novas (esperado: permission denied)'
BEGIN;
  SET LOCAL ROLE anon;
  TRUNCATE public.cargos;
ROLLBACK;

BEGIN;
  SET LOCAL ROLE anon;
  TRUNCATE public.cargo_apelidos;
ROLLBACK;

\echo ''
\echo '-- 2.5 TRUNCATE como authenticated também é RECUSADO (esperado: permission denied)'
BEGIN;
  SET LOCAL ROLE authenticated;
  TRUNCATE public.cargos;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. UNICIDADE E CHECKS                                                  ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 3.1 nome_chave normaliza caixa e espaço (esperado: RECUSA na 2a inserção)'
BEGIN;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA DOCENTE II');
  INSERT INTO public.cargos (nome) VALUES ('  bateria docente ii  ');
ROLLBACK;

\echo ''
\echo '-- 3.2 CONTROLE POSITIVO — nome de fato diferente ENTRA (esperado: INSERT 0 1 duas vezes)'
BEGIN;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA DOCENTE II');
  INSERT INTO public.cargos (nome) VALUES ('BATERIA DOCENTE I — HISTÓRIA');
  SELECT count(*) AS cargos_inseridos FROM public.cargos;
ROLLBACK;

\echo ''
\echo '-- 3.3 A coluna gerada acompanha o RENAME sozinha (esperado: nome_chave novo)'
BEGIN;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA DOCENTE I ¿ HISTÓRIA');
  UPDATE public.cargos SET nome = 'BATERIA DOCENTE I — HISTÓRIA' WHERE nome LIKE 'BATERIA DOCENTE I%';
  SELECT nome, nome_chave FROM public.cargos;
ROLLBACK;

\echo ''
\echo '-- 3.4 Nome em branco é recusado (esperado: chk_cargo_nome_preenchido)'
BEGIN;
  INSERT INTO public.cargos (nome) VALUES ('   ');
ROLLBACK;

\echo ''
\echo '-- 3.5 Apelido: um texto de origem aponta para UM cargo (esperado: RECUSA)'
BEGIN;
  INSERT INTO public.cargos (id, nome) VALUES
    ('11111111-1111-1111-1111-111111111111', 'BATERIA DOCENTE II'),
    ('22222222-2222-2222-2222-222222222222', 'BATERIA ARTE');
  INSERT INTO public.cargo_apelidos (texto_origem, cargo_id)
    VALUES ('BATERIA DOCENTE I ¿ HISTÓRIA', '11111111-1111-1111-1111-111111111111');
  INSERT INTO public.cargo_apelidos (texto_origem, cargo_id)
    VALUES ('  bateria docente i ¿ história  ', '22222222-2222-2222-2222-222222222222');
ROLLBACK;

\echo ''
\echo '-- 3.6 CONTROLE POSITIVO — reassociar a MESMA grafia a outro cargo ATUALIZA'
\echo '--     (é o upsert que o app fará; esperado: 1 linha, apontando para ARTE)'
BEGIN;
  INSERT INTO public.cargos (id, nome) VALUES
    ('11111111-1111-1111-1111-111111111111', 'BATERIA DOCENTE II'),
    ('22222222-2222-2222-2222-222222222222', 'BATERIA ARTE');
  INSERT INTO public.cargo_apelidos (texto_origem, cargo_id)
    VALUES ('BATERIA ARTE', '11111111-1111-1111-1111-111111111111');
  INSERT INTO public.cargo_apelidos (texto_origem, cargo_id)
    VALUES ('BATERIA ARTE', '22222222-2222-2222-2222-222222222222')
    ON CONFLICT (texto_chave) DO UPDATE SET cargo_id = EXCLUDED.cargo_id;
  SELECT a.texto_origem, c.nome AS aponta_para, count(*) OVER () AS total_linhas
  FROM public.cargo_apelidos a JOIN public.cargos c ON c.id = a.cargo_id;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. AS DUAS FKs — OPOSTAS de propósito: candidato barra, apelido cede   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 4.1 Apagar cargo COM APELIDO PASSA, e leva o apelido junto (CASCADE).'
\echo '--     Esperado: DELETE 1, e apelidos_restantes = 0'
\echo '--     🔴 ESTE CASO JÁ FOI INVERTIDO DUAS VEZES, e por isso carrega a data: era'
\echo '--     assim até 30/07; a CG001 (31/07) o virou em recusa (23503); em 01/08 o'
\echo '--     bloqueio passou a olhar SÓ inscritos e ele voltou ao que era.'
\echo '--     ⚠️ O "apelidos_restantes = 0" é PERDA SILENCIOSA: some a memória de'
\echo '--     "texto sujo → cargo" que pré-preenche as próximas importações. Quem avisa'
\echo '--     é a UI (Cargos.tsx), e há teste guardando o aviso.'
BEGIN;
  INSERT INTO public.cargos (id, nome)
    VALUES ('33333333-3333-3333-3333-333333333333', 'BATERIA CARGO DE TESTE');
  INSERT INTO public.cargo_apelidos (texto_origem, cargo_id)
    VALUES ('BATERIA CARGO ¿ TESTE', '33333333-3333-3333-3333-333333333333');
  DELETE FROM public.cargos WHERE id = '33333333-3333-3333-3333-333333333333';
  SELECT count(*) AS apelidos_restantes FROM public.cargo_apelidos
    WHERE cargo_id = '33333333-3333-3333-3333-333333333333';
ROLLBACK;

\echo ''
\echo '-- 4.2 Apagar cargo COM CANDIDATO é RECUSADO (RESTRICT). Esperado: 23503'
BEGIN;
  INSERT INTO public.cargos (id, nome)
    VALUES ('44444444-4444-4444-4444-444444444444', 'BATERIA CARGO COM INSCRITO');
  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cargo, cargo_id)
    SELECT id, '999001', 'INSCRITO DE TESTE', 'BATERIA CARGO ¿ COM INSCRITO',
           '44444444-4444-4444-4444-444444444444'
    FROM public.editais LIMIT 1;
  DELETE FROM public.cargos WHERE id = '44444444-4444-4444-4444-444444444444';
ROLLBACK;

\echo ''
\echo '-- 4.3 CONTROLE POSITIVO — cargo SEM uso nenhum é excluível (esperado: DELETE 1)'
BEGIN;
  INSERT INTO public.cargos (id, nome)
    VALUES ('55555555-5555-5555-5555-555555555555', 'BATERIA CARGO SEM USO');
  DELETE FROM public.cargos WHERE id = '55555555-5555-5555-5555-555555555555';
ROLLBACK;

\echo ''
\echo '-- 4.4 O DELETE usa os índices de apoio, não seq scan.'
\echo '--     Esperado: Index Scan usando idx_candidatos_cargo / idx_cargo_apelidos_cargo'
EXPLAIN (COSTS OFF)
  SELECT 1 FROM public.candidatos WHERE cargo_id = '44444444-4444-4444-4444-444444444444';
EXPLAIN (COSTS OFF)
  SELECT 1 FROM public.cargo_apelidos WHERE cargo_id = '44444444-4444-4444-4444-444444444444';

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4-bis. CARGO COM INSCRITO É IMUTÁVEL — trigger CG001 (01/08)           ║'
\echo '║   ⚠️ ESTREITADO em 01/08. Entre 31/07 e 01/08 a regra trancava por     ║'
\echo '║   QUALQUER menção — e como o assistente grava os apelidos no fim do    ║'
\echo '║   passo 3, o cargo virava imutável ANTES de existir um só inscrito:    ║'
\echo '║   a janela fechava dentro do passo que devia abri-la. Agora só         ║'
\echo '║   inscrito tranca, e a janela vai até a 1a importação que o use.       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 4b.1 Renomear cargo COM INSCRITO é recusado (esperado: CG001)'
BEGIN;
  INSERT INTO public.cargos (id, nome)
    VALUES ('66666666-6666-6666-6666-666666666666', 'BATERIA CARGO IMUTAVEL');
  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cargo, cargo_id)
    SELECT id, '999002', 'INSCRITO DE TESTE', 'BATERIA CARGO IMUTAVEL',
           '66666666-6666-6666-6666-666666666666'
    FROM public.editais LIMIT 1;
  UPDATE public.cargos SET nome = 'BATERIA NOME NOVO'
    WHERE id = '66666666-6666-6666-6666-666666666666';
ROLLBACK;

\echo ''
\echo '-- 4b.2 ⭐ CONTROLE POSITIVO — renomear cargo com APELIDO e SEM inscrito PASSA'
\echo '--     (esperado: UPDATE 1). É o caso que a mudança de 01/08 existe para destravar:'
\echo '--     é exatamente a situação dos 9 cargos reais hoje. ⚠️ Este caso afirmava o'
\echo '--     OPOSTO entre 31/07 e 01/08 (CG001 por menção); foi invertido junto com a regra.'
\echo '--     O apelido continua apontando para o cargo — ele guarda cargo_id, não o nome.'
BEGIN;
  INSERT INTO public.cargos (id, nome)
    VALUES ('66666666-6666-6666-6666-666666666667', 'BATERIA CARGO ¿ COM APELIDO');
  INSERT INTO public.cargo_apelidos (texto_origem, cargo_id)
    VALUES ('BATERIA CARGO ¿ COM APELIDO', '66666666-6666-6666-6666-666666666667');
  UPDATE public.cargos SET nome = 'BATERIA CARGO — COM APELIDO'
    WHERE id = '66666666-6666-6666-6666-666666666667';
  SELECT c.nome, a.texto_origem AS apelido_ainda_aponta
    FROM public.cargos c JOIN public.cargo_apelidos a ON a.cargo_id = c.id
    WHERE c.id = '66666666-6666-6666-6666-666666666667';
ROLLBACK;

\echo ''
\echo '-- 4b.3 ⚠️ O trigger é sobre a LINHA, não a coluna: trocar `ativo` também é'
\echo '--     recusado, mesmo sem tocar no nome (esperado: CG001)'
\echo '--     🔴 A FIXTURE AQUI TEM DE SER UM INSCRITO, não um apelido. Com apelido este'
\echo '--     caso passaria a PERMITIR o UPDATE desde 01/08 — e continuaria "verde"'
\echo '--     afirmando no \echo o contrário do que o banco faz.'
BEGIN;
  INSERT INTO public.cargos (id, nome)
    VALUES ('66666666-6666-6666-6666-666666666668', 'BATERIA CARGO ATIVO');
  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cargo, cargo_id)
    SELECT id, '999004', 'INSCRITO DE TESTE', 'BATERIA CARGO ATIVO',
           '66666666-6666-6666-6666-666666666668'
    FROM public.editais LIMIT 1;
  UPDATE public.cargos SET ativo = false
    WHERE id = '66666666-6666-6666-6666-666666666668';
ROLLBACK;

\echo ''
\echo '-- 4b.4 CONTROLE POSITIVO — cargo SEM menção nenhuma é renomeável'
\echo '--     (esperado: UPDATE 1). É a metade que prova que a regra não travou tudo:'
\echo '--     a janela para corrigir um nome existe, e vai ATÉ a primeira importação.'
BEGIN;
  INSERT INTO public.cargos (id, nome)
    VALUES ('66666666-6666-6666-6666-666666666669', 'BATERIA CARGO ¿ LIVRE');
  UPDATE public.cargos SET nome = 'BATERIA CARGO — LIVRE'
    WHERE id = '66666666-6666-6666-6666-666666666669';
  SELECT nome, nome_chave FROM public.cargos
    WHERE id = '66666666-6666-6666-6666-666666666669';
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 5. RLS POR PAPEL                                                       ║'
\echo '║    ⚠️ O superadmin é o caso que já falhou 3 vezes neste repo.          ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo ''
\echo '-- Os JWTs são forjados com set_config; has_role lê auth.uid() de dentro deles.'

\echo ''
\echo '-- 5.1 Quem é quem no banco local (para conferir os UUIDs usados abaixo)'
SELECT ur.role, count(*) AS contas FROM public.user_roles ur GROUP BY 1 ORDER BY 1;

\echo ''
\echo '-- 5.2 ADMIN: lê e escreve (esperado: SELECT ok, INSERT 0 1)'
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO
    '{"sub":"12118d98-0f62-4947-bbd4-a2067fa116f2","role":"authenticated"}';
  SELECT count(*) AS admin_le_cargos FROM public.cargos;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA CRIADO PELO ADMIN');
ROLLBACK;

\echo ''
\echo '-- 5.3 ⚠️ SUPERADMIN PURO: o caso que já falhou 3 vezes neste repo.'
\echo '--     A conta de superadmin do banco local TAMBÉM tem linha `admin`, então usá-la'
\echo '--     aqui não provaria nada: passaria até com um SELECT literal em user_roles.'
\echo '--     Por isso o teste FABRICA um superadmin sem `admin` dentro da transação.'
\echo '--     Esperado: lê e ESCREVE, porque a hierarquia mora DENTRO de has_role.'
BEGIN;
  -- Um usuário que hoje só tem o papel `user` vira superadmin puro, e só aqui dentro.
  INSERT INTO public.user_roles (user_id, role)
    VALUES ('0979e1b3-b683-4679-9140-41cb7d751bf7', 'superadmin');

  SELECT has_role('0979e1b3-b683-4679-9140-41cb7d751bf7', 'admin'::app_role)
           AS superadmin_puro_e_admin_por_hierarquia,
         EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = '0979e1b3-b683-4679-9140-41cb7d751bf7'
                   AND role = 'admin') AS tem_linha_admin_literal;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO
    '{"sub":"0979e1b3-b683-4679-9140-41cb7d751bf7","role":"authenticated"}';
  SELECT count(*) AS superadmin_le_cargos FROM public.cargos;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA CRIADO PELO SUPERADMIN');
ROLLBACK;

\echo ''
\echo '-- 5.4 COORDENADOR: LÊ (nome de cargo não é dado de ninguém) mas NÃO escreve'
\echo '--     Esperado: SELECT ok; INSERT recusado por RLS (42501)'
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO
    '{"sub":"5100fb6c-fbdb-47d3-91a3-335b77ba7353","role":"authenticated"}';
  SELECT count(*) AS coordenador_le_cargos FROM public.cargos;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA NAO DEVE ENTRAR');
ROLLBACK;

\echo ''
\echo '-- 5.5 ANON: não lê nada (aqui nem chega à RLS — o GRANT já barra)'
BEGIN;
  SET LOCAL ROLE anon;
  SELECT count(*) FROM public.cargos;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 6. TRIGGER                                                             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 6.1 updated_at se move sozinho no UPDATE (esperado: mudou = t)'
BEGIN;
  INSERT INTO public.cargos (id, nome)
    VALUES ('66666666-6666-6666-6666-666666666666', 'ANTES');
  UPDATE public.cargos SET updated_at = '2000-01-01'
    WHERE id = '66666666-6666-6666-6666-666666666666';
  UPDATE public.cargos SET nome = 'DEPOIS'
    WHERE id = '66666666-6666-6666-6666-666666666666';
  SELECT updated_at > '2020-01-01'::timestamptz AS trigger_mexeu
  FROM public.cargos WHERE id = '66666666-6666-6666-6666-666666666666';
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 7. ETAPAS 5 e 5b — a chave por cargo_id e a guarda do reapontamento    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 7.1 A chave natural é por cargo_id, e cargo_chave NÃO existe mais (D3)'
\echo '--     Esperado: candidatos_cpf_cargo_id_inscricao_key presente; nenhuma cargo_chave'
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'candidatos' AND indexname LIKE '%cargo%'
ORDER BY 1;
SELECT count(*) AS colunas_cargo_chave_restantes
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'candidatos' AND column_name = 'cargo_chave';

\echo ''
\echo '-- 7.2 🔴 REESCRITO em 31/07 — este caso afirmava o que a CG001 TORNOU IMPOSSÍVEL.'
\echo '--     Ele se chamava "RENOMEAR O CARGO NÃO DUPLICA CANDIDATO — o ponto inteiro da'
\echo '--     etapa 5" e renomeava um cargo COM 3 inscritos, esperando 3 antes e 3 depois.'
\echo '--     Desde a CG001 esse UPDATE é RECUSADO: cargo com inscrito é imutável.'
\echo '--     ⚠️ O ESTREITAMENTO DE 01/08 NÃO O RESSUSCITA. A regra deixou de trancar por'
\echo '--     apelido, mas continua trancando por INSCRITO — e este caso tem 3. Ele segue'
\echo '--     valendo como está; quem passou a testemunhar o ganho da etapa 5 é o 4b.2,'
\echo '--     onde o cargo tem apelido e nenhum inscrito.'
\echo '--     ⚠️ NÃO o restaure: um caso que só passa se a CG001 sumir vira pressão para'
\echo '--     removê-la. Se a decisão for revista, isto se reescreve de novo, de propósito.'

\echo ''
\echo '-- 7.2a A recusa, com os inscritos no lugar (esperado: CG001)'
BEGIN;
  INSERT INTO public.editais (id, nome) VALUES
    ('77770000-0000-0000-0000-000000000001', 'EDITAL BATERIA 5');
  INSERT INTO public.cargos (id, nome) VALUES
    ('77771111-0000-0000-0000-000000000001', 'BATERIA DOCENTE I ¿ HISTÓRIA');
  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cpf, cargo, cargo_id) VALUES
    ('77770000-0000-0000-0000-000000000001', '900001', 'INSCRITO A', '22940161739', 'BATERIA DOCENTE I ¿ HISTÓRIA', '77771111-0000-0000-0000-000000000001'),
    ('77770000-0000-0000-0000-000000000001', '900002', 'INSCRITO B', '14781065732', 'BATERIA DOCENTE I ¿ HISTÓRIA', '77771111-0000-0000-0000-000000000001'),
    ('77770000-0000-0000-0000-000000000001', '900003', 'INSCRITO C', '99528037704', 'BATERIA DOCENTE I ¿ HISTÓRIA', '77771111-0000-0000-0000-000000000001');

  UPDATE public.cargos SET nome = 'BATERIA DOCENTE I — HISTÓRIA'
   WHERE id = '77771111-0000-0000-0000-000000000001';
ROLLBACK;

\echo ''
\echo '-- 7.2b ⭐ O QUE A ETAPA 5 AINDA COMPRA, e continua valendo: o candidato aponta'
\echo '--      para cargo_id, não para o TEXTO. Renomeando DENTRO DA JANELA (antes do'
\echo '--      primeiro inscrito), os 3 entram já com o nome corrigido e a listagem'
\echo '--      mostra o canônico — sem nunca duplicar ninguém.'
\echo '--      Esperado: 3 inscritos, nome_canonico com travessão de verdade.'
BEGIN;
  INSERT INTO public.editais (id, nome) VALUES
    ('77770000-0000-0000-0000-000000000001', 'EDITAL BATERIA 5');
  INSERT INTO public.cargos (id, nome) VALUES
    ('77771111-0000-0000-0000-000000000001', 'BATERIA DOCENTE I ¿ HISTÓRIA');

  -- A JANELA: enquanto ninguém aponta para ele, o cargo ainda é renomeável.
  UPDATE public.cargos SET nome = 'BATERIA DOCENTE I — HISTÓRIA'
   WHERE id = '77771111-0000-0000-0000-000000000001';

  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cpf, cargo, cargo_id) VALUES
    ('77770000-0000-0000-0000-000000000001', '900001', 'INSCRITO A', '22940161739', 'BATERIA DOCENTE I ¿ HISTÓRIA', '77771111-0000-0000-0000-000000000001'),
    ('77770000-0000-0000-0000-000000000001', '900002', 'INSCRITO B', '14781065732', 'BATERIA DOCENTE I ¿ HISTÓRIA', '77771111-0000-0000-0000-000000000001'),
    ('77770000-0000-0000-0000-000000000001', '900003', 'INSCRITO C', '99528037704', 'BATERIA DOCENTE I ¿ HISTÓRIA', '77771111-0000-0000-0000-000000000001');

  SELECT count(*) AS inscritos FROM public.candidatos
   WHERE edital_id = '77770000-0000-0000-0000-000000000001';
  -- O `cargo` textual dos 3 segue sujo (é a procedência da planilha) e o canônico não:
  -- é exatamente a separação que a etapa 6 passou a exibir.
  SELECT DISTINCT cg.nome AS nome_canonico_na_listagem, c.cargo AS texto_da_planilha
    FROM public.candidatos c JOIN public.cargos cg ON cg.id = c.cargo_id
   WHERE c.edital_id = '77770000-0000-0000-0000-000000000001';
ROLLBACK;

\echo ''
\echo '-- 7.3 IDEMPOTÊNCIA: reimportar 2x o mesmo lote mantém a contagem (esperado: 2, 2, 2)'
BEGIN;
  INSERT INTO public.editais (id, nome) VALUES
    ('77770000-0000-0000-0000-000000000002', 'EDITAL BATERIA 5B');
  INSERT INTO public.cargos (id, nome) VALUES
    ('77771111-0000-0000-0000-000000000002', 'BATERIA DOCENTE II');

  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cpf, cargo, cargo_id) VALUES
    ('77770000-0000-0000-0000-000000000002', '900010', 'PRIMEIRO NOME', '22940161739', 'BATERIA DOCENTE II', '77771111-0000-0000-0000-000000000002'),
    ('77770000-0000-0000-0000-000000000002', '900011', 'SEM CPF', NULL, 'BATERIA DOCENTE II', '77771111-0000-0000-0000-000000000002')
  ON CONFLICT (edital_id, cpf, cargo_id, n_inscricao) DO UPDATE SET nome = EXCLUDED.nome;
  SELECT count(*) AS apos_1a_carga FROM public.candidatos
   WHERE edital_id = '77770000-0000-0000-0000-000000000002';

  -- Segunda e terceira cargas, a terceira com o nome MUDADO: é o CONTROLE POSITIVO.
  -- Sem ele, "não duplicou" poderia ser o insert falhando em silêncio.
  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cpf, cargo, cargo_id) VALUES
    ('77770000-0000-0000-0000-000000000002', '900010', 'PRIMEIRO NOME', '22940161739', 'BATERIA DOCENTE II', '77771111-0000-0000-0000-000000000002'),
    ('77770000-0000-0000-0000-000000000002', '900011', 'SEM CPF', NULL, 'BATERIA DOCENTE II', '77771111-0000-0000-0000-000000000002')
  ON CONFLICT (edital_id, cpf, cargo_id, n_inscricao) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cpf, cargo, cargo_id) VALUES
    ('77770000-0000-0000-0000-000000000002', '900010', 'NOME CORRIGIDO', '22940161739', 'BATERIA DOCENTE II', '77771111-0000-0000-0000-000000000002')
  ON CONFLICT (edital_id, cpf, cargo_id, n_inscricao) DO UPDATE SET nome = EXCLUDED.nome;

  SELECT count(*) AS apos_3_cargas FROM public.candidatos
   WHERE edital_id = '77770000-0000-0000-0000-000000000002';
  SELECT nome AS controle_positivo_atualizou FROM public.candidatos
   WHERE edital_id = '77770000-0000-0000-0000-000000000002' AND n_inscricao = '900010';
  -- A linha SEM CPF continua sendo UMA depois de 3 cargas: é o NULLS NOT DISTINCT.
  SELECT count(*) AS linhas_sem_cpf FROM public.candidatos
   WHERE edital_id = '77770000-0000-0000-0000-000000000002' AND cpf IS NULL;
ROLLBACK;

\echo ''
\echo '-- 7.4 ⭐ REAPONTAR CARGO É SEGURO — a troca total converge para UMA linha'
\echo '--     ⚠️ ESTE CASO AFIRMAVA O CONTRÁRIO até 2026-07-30: ele provava que o trigger'
\echo '--     RC001 RECUSAVA o reapontamento. O trigger foi DROPADO (migration'
\echo '--     20260730140000) porque a troca total o tornou incapaz de disparar — e porque'
\echo '--     o gesto que ele barrava deixou de ser perigoso. Esperado: 1 linha, no cargo NOVO.'
BEGIN;
  INSERT INTO public.editais (id, nome) VALUES
    ('77770000-0000-0000-0000-000000000003', 'EDITAL BATERIA 5B2');
  INSERT INTO public.cargos (id, nome) VALUES
    ('77771111-0000-0000-0000-00000000000a', 'BATERIA ARTE'),
    ('77771111-0000-0000-0000-00000000000b', 'DOCENTE I — ARTE');

  -- A lista como está hoje: o inscrito apontado para 'BATERIA ARTE'.
  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cpf, cargo, cargo_id) VALUES
    ('77770000-0000-0000-0000-000000000003', '900020', 'INSCRITO ARTE', '22940161739', 'BATERIA ARTE', '77771111-0000-0000-0000-00000000000a');

  -- O usuário reaponta 'BATERIA ARTE' para 'DOCENTE I — ARTE' no passo Cargos e reimporta.
  -- No fluxo de UPSERT isto criava uma linha nova e órfãva a antiga — daí o RC001.
  -- Com a troca total, o DELETE roda antes e a antiga simplesmente não existe mais.
  INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
    ('77772222-0000-0000-0000-000000000001', '77770000-0000-0000-0000-000000000003',
     '{"n_inscricao":"900020","nome":"INSCRITO ARTE","cpf":"22940161739","cargo":"ARTE","cargo_id":"77771111-0000-0000-0000-00000000000b"}');

  SELECT * FROM public.trocar_candidatos_do_edital(
    '77770000-0000-0000-0000-000000000003', '77772222-0000-0000-0000-000000000001', 1);

  SELECT count(*) AS deve_ser_1, max(cargo_id::text) AS cargo_final
    FROM public.candidatos WHERE edital_id = '77770000-0000-0000-0000-000000000003';
ROLLBACK;

\echo ''
\echo '-- 7.5 ⭐ CONTROLE POSITIVO 1 — a mesma pessoa num SEGUNDO cargo ENTRA.'
\echo '--     São os 382 casos reais. ⚠️ O QUE ELE GUARDA MUDOU DE DONO: até 29/07 era a'
\echo '--     estreiteza da condição do trigger; hoje é o ÍNDICE ÚNICO, que continua'
\echo '--     precisando ter o cargo dentro para não fundir estes dois. Esperado: 2 linhas.'
BEGIN;
  INSERT INTO public.editais (id, nome) VALUES
    ('77770000-0000-0000-0000-000000000004', 'EDITAL BATERIA 382');
  INSERT INTO public.cargos (id, nome) VALUES
    ('77771111-0000-0000-0000-00000000000c', 'BATERIA DOCENTE II'),
    ('77771111-0000-0000-0000-00000000000d', 'BATERIA DOCENTE I — HISTÓRIA');
  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cpf, cargo, cargo_id) VALUES
    ('77770000-0000-0000-0000-000000000004', '213946', 'CASSIA ANDREA', '22940161739', 'BATERIA DOCENTE II', '77771111-0000-0000-0000-00000000000c');
  -- Mesma inscrição, mesmo CPF, cargo DIFERENTE → tem de entrar.
  INSERT INTO public.candidatos (edital_id, n_inscricao, nome, cpf, cargo, cargo_id) VALUES
    ('77770000-0000-0000-0000-000000000004', '213946', 'CASSIA ANDREA', '22940161739', 'BATERIA DOCENTE I — HISTÓRIA', '77771111-0000-0000-0000-00000000000d');
  SELECT count(*) AS mesma_inscricao_dois_cargos FROM public.candidatos
   WHERE edital_id = '77770000-0000-0000-0000-000000000004';
ROLLBACK;

\echo ''
\echo '-- 7.6 ⭐ DUPLICATA DENTRO DO ARQUIVO é recusada pelo índice único'
\echo '--     ⚠️ REESCRITO em 2026-07-30. Ele testava ON CONFLICT DO UPDATE, caminho que a'
\echo '--     troca total eliminou (o app não faz mais upsert). O que o índice guarda AGORA'
\echo '--     é a duplicata no LOTE — e o custo subiu: o INSERT passou a ser a lista'
\echo '--     inteira, então uma linha repetida derruba a troca toda. É por isso que'
\echo '--     deduplicar() no cliente virou PRÉ-REQUISITO. Esperado: erro de chave duplicada.'
BEGIN;
  INSERT INTO public.editais (id, nome) VALUES
    ('77770000-0000-0000-0000-000000000005', 'EDITAL BATERIA DUPLICATA');
  INSERT INTO public.cargos (id, nome) VALUES
    ('77771111-0000-0000-0000-00000000000e', 'BATERIA DOCENTE II');

  -- Duas linhas com a MESMA chave natural no mesmo lote — o que `deduplicar()` impede.
  INSERT INTO public.candidatos_importacao (importacao_id, edital_id, linha) VALUES
    ('77772222-0000-0000-0000-000000000002', '77770000-0000-0000-0000-000000000005',
     '{"n_inscricao":"900030","nome":"PRIMEIRO","cpf":"22940161739","cargo":"DOCENTE II","cargo_id":"77771111-0000-0000-0000-00000000000e"}'),
    ('77772222-0000-0000-0000-000000000002', '77770000-0000-0000-0000-000000000005',
     '{"n_inscricao":"900030","nome":"SEGUNDO","cpf":"22940161739","cargo":"DOCENTE II","cargo_id":"77771111-0000-0000-0000-00000000000e"}');

  SELECT * FROM public.trocar_candidatos_do_edital(
    '77770000-0000-0000-0000-000000000005', '77772222-0000-0000-0000-000000000002', 2);
ROLLBACK;

\echo ''
\echo '-- 7.7 O lookup do trigger usa ÍNDICE, não seq scan (BEFORE INSERT roda por LINHA,'
\echo '--     e o caminho quente são 7.416 delas). Esperado: Index Scan / Bitmap.'
EXPLAIN (COSTS OFF)
SELECT 1 FROM public.candidatos c
 WHERE c.edital_id = '77770000-0000-0000-0000-000000000001'
   AND c.cpf IS NOT DISTINCT FROM '22940161739'
   AND c.n_inscricao = '900001'
   AND lower(btrim(coalesce(c.cargo, ''))) = 'docente i ¿ história';

\echo ''
\echo '-- FIM. Nenhum caso acima deixa resíduo: todos em transação com ROLLBACK.'
SELECT count(*) AS cargos_no_fim FROM public.cargos;
SELECT count(*) AS apelidos_no_fim FROM public.cargo_apelidos;
SELECT count(*) AS candidatos_no_fim FROM public.candidatos;
