-- Bateria manual da RPC `salvar_salas_distribuidas` — renumerar salas em transação
-- Rodar contra o banco LOCAL:
--   docker cp docs/bateria-salas-renumeracao.sql supabase_db_<ref>:/tmp/b.sql
--   docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/b.sql
--
-- POR QUE ISTO EXISTE, e por que não é um teste do Vitest: a suíte mocka o Supabase. Ela
-- não exercita índice único, transação nem SECURITY DEFINER — um teste lá afirmaria o
-- mock. `useSalasDistribuidas.test.tsx` prova o que é do cliente (o lote sai numa chamada
-- só, a mensagem chega traduzida); TUDO o que segue só existe no banco.
--
-- 🔴 O CASO QUE NÃO PODE FALTAR É O 2.1 — a TROCA. Ela é o motivo da RPC existir: com um
-- UPDATE por sala, trocar 101↔102 era impossível, porque o índice único é checado linha a
-- linha e a primeira escrita encontrava a irmã ainda no número antigo.
--
-- ⚠️ A unicidade NÃO é deferrable, de propósito — a alternativa canônica foi rejeitada
-- porque `ON CONFLICT DO NOTHING` (que o dump usa em toda linha) não aceita constraint
-- deferrable como árbitro, e o `db reset` quebra. Ver o cabeçalho da migration
-- 20260803001556. É por isso que a troca é resolvida em DOIS PASSOS dentro da RPC.
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
\echo '-- Esperado: a função existe e é SECURITY DEFINER (prosecdef = t).'
SELECT proname, prosecdef, pronargs
  FROM pg_proc
 WHERE proname = 'salvar_salas_distribuidas';

\echo ''
\echo '-- Esperado: a unicidade continua sendo ÍNDICE ÚNICO comum, e NÃO uma constraint'
\echo '--           deferrable. Se algum dia aparecer linha em pg_constraint com'
\echo '--           condeferrable = t, o `db reset` vai quebrar na carga do dump.'
SELECT indexname FROM pg_indexes
 WHERE tablename = 'salas_prova_distribuidas'
   AND indexname = 'salas_prova_distribuidas_prova_unidade_numero_key';

SELECT conname, condeferrable
  FROM pg_constraint
 WHERE conrelid = 'public.salas_prova_distribuidas'::regclass
   AND contype = 'u';
\echo '-- (0 linhas acima é o resultado CERTO.)'

\echo ''
\echo '-- Esperado: 0 duplicatas de (prova_id, sala_fk_unidade, sala_numero).'
SELECT count(*) AS grupos_duplicados FROM (
  SELECT prova_id, sala_fk_unidade, sala_numero
    FROM salas_prova_distribuidas
   GROUP BY 1,2,3 HAVING count(*) > 1
) t;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. COMPORTAMENTO                                                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Os UUIDs saem do próprio banco: a bateria não envelhece com o dump.'

-- Uma unidade de prova com pelo menos 3 salas, e três salas dela.
SELECT prova_id AS p_id, sala_fk_unidade AS u_id
  FROM salas_prova_distribuidas
 GROUP BY 1,2 HAVING count(*) >= 3
 ORDER BY 1,2 LIMIT 1
\gset

SELECT id AS sala_a, sala_numero AS num_a FROM salas_prova_distribuidas
 WHERE prova_id = :'p_id' AND sala_fk_unidade = :'u_id' ORDER BY sala_numero LIMIT 1 \gset
SELECT id AS sala_b, sala_numero AS num_b FROM salas_prova_distribuidas
 WHERE prova_id = :'p_id' AND sala_fk_unidade = :'u_id' ORDER BY sala_numero OFFSET 1 LIMIT 1 \gset
SELECT id AS sala_c, sala_numero AS num_c FROM salas_prova_distribuidas
 WHERE prova_id = :'p_id' AND sala_fk_unidade = :'u_id' ORDER BY sala_numero OFFSET 2 LIMIT 1 \gset

-- Um admin de verdade e alguém que NÃO é admin. Os JWTs são forjados com set_config;
-- `has_role` lê `auth.uid()` de dentro deles.
SELECT user_id AS admin_id,
       format('{"sub":"%s","role":"authenticated"}', user_id) AS jwt_admin
  FROM user_roles WHERE role = 'admin' LIMIT 1
\gset

SELECT ur.user_id AS naoadmin_id,
       format('{"sub":"%s","role":"authenticated"}', ur.user_id) AS jwt_naoadmin
  FROM user_roles ur
 WHERE ur.role NOT IN ('admin','superadmin')
   AND NOT EXISTS (SELECT 1 FROM user_roles x
                    WHERE x.user_id = ur.user_id AND x.role IN ('admin','superadmin'))
 LIMIT 1
\gset

\echo ''
\echo '-- Salas usadas nos casos abaixo:'
SELECT :'sala_a' AS sala_a, :num_a AS num_a, :'sala_b' AS sala_b, :num_b AS num_b,
       :'sala_c' AS sala_c, :num_c AS num_c;

\echo ''
\echo '-- 2.1 🔴 A TROCA (o caso que não existia): sala A recebe o número de B e vice-versa.'
\echo '--     Esperado: a função devolve 2, e os números aparecem TROCADOS.'
BEGIN;
  -- 🔴 ABRE a prova e a unidade só DENTRO desta transação. No dump, as 2 provas e 11 dos
  -- 13 vínculos estão finalizados, e desde 03/08 o trigger PF001 congela as salas deles —
  -- sem isto a seção 2 falharia por um motivo que não é o dela. O congelamento é a seção 4.
  UPDATE provas SET prova_finalizada = false WHERE id = :'p_id'::uuid;
  UPDATE prova_unidades SET unidade_finalizada = false
   WHERE prova_id = :'p_id'::uuid AND unidade_id = :'u_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_admin';

  SELECT public.salvar_salas_distribuidas(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'sala_numero', CASE WHEN s.id = :'sala_a'::uuid THEN :num_b ELSE :num_a END,
        'sala_capacidade', s.sala_capacidade,
        'sala_descricao', s.sala_descricao,
        'sala_andar', s.sala_andar,
        'sala_fiscal_1', s.sala_fiscal_1,
        'sala_fiscal_2', s.sala_fiscal_2))
       FROM salas_prova_distribuidas s
      WHERE s.id IN (:'sala_a'::uuid, :'sala_b'::uuid))
  ) AS salas_salvas;

  SELECT id, sala_numero FROM salas_prova_distribuidas
   WHERE id IN (:'sala_a'::uuid, :'sala_b'::uuid) ORDER BY id;
  \echo '-- (A tem de estar com num_b e B com num_a.)'
ROLLBACK;

\echo ''
\echo '-- 2.2 ⭐ CONTROLE POSITIVO DA REGRA: colidir com sala de FORA do lote CONTINUA sendo'
\echo '--     recusado. Manda A para o número de C, que não está no lote.'
\echo '--     Esperado: ERRO 23505 — e o DETAIL nomeia o número (é dele que a mensagem'
\echo '--     traduzida do cliente tira o "sala 203").'
BEGIN;
  -- 🔴 ABRE a prova e a unidade só DENTRO desta transação. No dump, as 2 provas e 11 dos
  -- 13 vínculos estão finalizados, e desde 03/08 o trigger PF001 congela as salas deles —
  -- sem isto a seção 2 falharia por um motivo que não é o dela. O congelamento é a seção 4.
  UPDATE provas SET prova_finalizada = false WHERE id = :'p_id'::uuid;
  UPDATE prova_unidades SET unidade_finalizada = false
   WHERE prova_id = :'p_id'::uuid AND unidade_id = :'u_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_admin';

  SELECT public.salvar_salas_distribuidas(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'sala_numero', :num_c,
        'sala_capacidade', s.sala_capacidade, 'sala_descricao', s.sala_descricao,
        'sala_andar', s.sala_andar, 'sala_fiscal_1', s.sala_fiscal_1,
        'sala_fiscal_2', s.sala_fiscal_2))
       FROM salas_prova_distribuidas s WHERE s.id = :'sala_a'::uuid)
  );
ROLLBACK;

\echo ''
\echo '-- 2.3 🔴 ATOMICIDADE: lote com uma sala boa e um id que não existe.'
\echo '--     Esperado: ERRO nomeando quantas não foram encontradas.'
BEGIN;
  -- 🔴 ABRE a prova e a unidade só DENTRO desta transação. No dump, as 2 provas e 11 dos
  -- 13 vínculos estão finalizados, e desde 03/08 o trigger PF001 congela as salas deles —
  -- sem isto a seção 2 falharia por um motivo que não é o dela. O congelamento é a seção 4.
  UPDATE provas SET prova_finalizada = false WHERE id = :'p_id'::uuid;
  UPDATE prova_unidades SET unidade_finalizada = false
   WHERE prova_id = :'p_id'::uuid AND unidade_id = :'u_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_admin';

  SELECT public.salvar_salas_distribuidas(jsonb_build_array(
    jsonb_build_object('id', :'sala_a'::uuid, 'sala_numero', :num_a,
                       'sala_capacidade', 999, 'sala_descricao', 'BATERIA',
                       'sala_andar', 1, 'sala_fiscal_1', NULL, 'sala_fiscal_2', NULL),
    jsonb_build_object('id', '00000000-0000-0000-0000-000000000000'::uuid,
                       'sala_numero', 9999, 'sala_capacidade', 10, 'sala_descricao', NULL,
                       'sala_andar', 9, 'sala_fiscal_1', NULL, 'sala_fiscal_2', NULL)
  ));
ROLLBACK;

\echo ''
\echo '-- 2.3b A prova de que NADA da 2.3 sobrou (a capacidade 999 não foi gravada).'
\echo '--      Esperado: a capacidade original, e nenhuma descrição "BATERIA".'
SELECT sala_capacidade, coalesce(sala_descricao,'(null)') AS descricao
  FROM salas_prova_distribuidas WHERE id = :'sala_a'::uuid;

\echo ''
\echo '-- 2.4 ⭐ CONTROLE POSITIVO: o passo 1 não deixa número negativo para trás.'
\echo '--     Esperado: 0 — se aparecer linha aqui, a renumeração vazou.'
SELECT count(*) AS salas_com_numero_negativo
  FROM salas_prova_distribuidas WHERE sala_numero < 0;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. AUTORIZAÇÃO                                                         ║'
\echo '║    ⚠️ O superadmin é o caso que já falhou 3 vezes neste repo.          ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 3.1 Quem NÃO é admin: esperado ERRO "Apenas administradores...".'
BEGIN;
  -- Abre a prova e a unidade só DENTRO desta transação (no dump as 2 provas e 11 dos 13
  -- vínculos estão finalizados, e o PF001 congela as salas deles — seção 4).
  UPDATE provas SET prova_finalizada = false WHERE id = :'p_id'::uuid;
  UPDATE prova_unidades SET unidade_finalizada = false
   WHERE prova_id = :'p_id'::uuid AND unidade_id = :'u_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_naoadmin';

  SELECT public.salvar_salas_distribuidas(jsonb_build_array(
    jsonb_build_object('id', :'sala_a'::uuid, 'sala_numero', :num_a,
                       'sala_capacidade', 1, 'sala_descricao', NULL,
                       'sala_andar', 1, 'sala_fiscal_1', NULL, 'sala_fiscal_2', NULL)));
ROLLBACK;

\echo ''
\echo '-- 3.2 ⚠️ SUPERADMIN PURO — sem linha `admin` na user_roles. A hierarquia mora'
\echo '--     DENTRO de has_role; um SELECT literal em user_roles bloquearia este caso,'
\echo '--     como já bloqueou 3 vezes. Esperado: SALVA (devolve 1).'
BEGIN;
  -- Abre a prova e a unidade só DENTRO desta transação (no dump as 2 provas e 11 dos 13
  -- vínculos estão finalizados, e o PF001 congela as salas deles — seção 4).
  UPDATE provas SET prova_finalizada = false WHERE id = :'p_id'::uuid;
  UPDATE prova_unidades SET unidade_finalizada = false
   WHERE prova_id = :'p_id'::uuid AND unidade_id = :'u_id'::uuid;

  INSERT INTO public.user_roles (user_id, role) VALUES (:'naoadmin_id'::uuid, 'superadmin');

  SELECT has_role(:'naoadmin_id'::uuid, 'admin'::app_role) AS e_admin_por_hierarquia,
         EXISTS (SELECT 1 FROM user_roles
                  WHERE user_id = :'naoadmin_id'::uuid AND role = 'admin') AS tem_linha_admin;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_naoadmin';

  SELECT public.salvar_salas_distribuidas(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'sala_numero', s.sala_numero,
        'sala_capacidade', s.sala_capacidade, 'sala_descricao', s.sala_descricao,
        'sala_andar', s.sala_andar, 'sala_fiscal_1', s.sala_fiscal_1,
        'sala_fiscal_2', s.sala_fiscal_2))
       FROM salas_prova_distribuidas s WHERE s.id = :'sala_a'::uuid)
  ) AS superadmin_puro_salvou;
ROLLBACK;

\echo ''
\echo '-- 3.3 ⭐ CONTROLE POSITIVO do 3.1/3.2: a policy de UPDATE direto não afrouxou.'
\echo '--     Esperado: 0 linhas atualizadas (a RLS barra quem não é admin).'
BEGIN;
  -- Abre a prova e a unidade só DENTRO desta transação (no dump as 2 provas e 11 dos 13
  -- vínculos estão finalizados, e o PF001 congela as salas deles — seção 4).
  UPDATE provas SET prova_finalizada = false WHERE id = :'p_id'::uuid;
  UPDATE prova_unidades SET unidade_finalizada = false
   WHERE prova_id = :'p_id'::uuid AND unidade_id = :'u_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_naoadmin';

  UPDATE salas_prova_distribuidas SET sala_capacidade = 1 WHERE id = :'sala_a'::uuid;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. PROVA/UNIDADE FINALIZADA CONGELA AS SALAS (PF001, 03/08)            ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Antes disto, o único obstáculo era GerenciarProva não mostrar o link para a tela'
\echo '-- na visão de prova finalizada: URL na mão, aba antiga e PostgREST direto gravavam.'
\echo '-- as 2 provas do dump estão finalizadas: o trigger vale sobre TODAS as 58 salas.'

\echo ''
\echo '-- 4.1 PROVA finalizada: a RPC recusa, e a mensagem NOMEIA a prova.'
BEGIN;
  UPDATE provas SET prova_finalizada = true WHERE id = :'p_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_admin';

  SELECT public.salvar_salas_distribuidas(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'sala_numero', s.sala_numero, 'sala_capacidade', 99,
        'sala_descricao', s.sala_descricao, 'sala_andar', s.sala_andar,
        'sala_fiscal_1', s.sala_fiscal_1, 'sala_fiscal_2', s.sala_fiscal_2))
       FROM salas_prova_distribuidas s WHERE s.id = :'sala_a'::uuid));
ROLLBACK;

\echo ''
\echo '-- 4.2 🔴 UNIDADE finalizada com a PROVA ABERTA: congela do mesmo jeito.'
\echo '--     Quem aciona este nível é o COORDENADOR (finalizar_prova_unidade).'
BEGIN;
  UPDATE provas SET prova_finalizada = false WHERE id = :'p_id'::uuid;
  UPDATE prova_unidades SET unidade_finalizada = true
   WHERE prova_id = :'p_id'::uuid AND unidade_id = :'u_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_admin';

  SELECT public.salvar_salas_distribuidas(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'sala_numero', s.sala_numero, 'sala_capacidade', 99,
        'sala_descricao', s.sala_descricao, 'sala_andar', s.sala_andar,
        'sala_fiscal_1', s.sala_fiscal_1, 'sala_fiscal_2', s.sala_fiscal_2))
       FROM salas_prova_distribuidas s WHERE s.id = :'sala_a'::uuid));
ROLLBACK;

\echo ''
\echo '-- 4.3 INSERT de sala extra em prova finalizada (o caminho do `addSala`): recusado.'
BEGIN;
  UPDATE provas SET prova_finalizada = true WHERE id = :'p_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_admin';

  INSERT INTO salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero, sala_capacidade)
  VALUES (:'p_id'::uuid, :'u_id'::uuid, 9999, 10);
ROLLBACK;

\echo ''
\echo '-- 4.4 DELETE em prova finalizada: recusado.'
\echo '--     ⚠️ Consequência assumida: `desvincular_unidade_da_prova` apaga estas salas,'
\echo '--     então desvincular unidade de prova finalizada passa a ser recusado também.'
BEGIN;
  UPDATE provas SET prova_finalizada = true WHERE id = :'p_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_admin';

  DELETE FROM salas_prova_distribuidas WHERE id = :'sala_a'::uuid;
ROLLBACK;

\echo ''
\echo '-- 4.5 ⭐ CONTROLE POSITIVO: REABRIR devolve a edição. Sem isto, "recusa" poderia'
\echo '--     significar "recusa para sempre", e o congelamento seria uma armadilha.'
BEGIN;
  UPDATE provas SET prova_finalizada = true WHERE id = :'p_id'::uuid;
  UPDATE provas SET prova_finalizada = false WHERE id = :'p_id'::uuid;
  UPDATE prova_unidades SET unidade_finalizada = false
   WHERE prova_id = :'p_id'::uuid AND unidade_id = :'u_id'::uuid;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO :'jwt_admin';

  SELECT public.salvar_salas_distribuidas(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'sala_numero', s.sala_numero, 'sala_capacidade', 99,
        'sala_descricao', s.sala_descricao, 'sala_andar', s.sala_andar,
        'sala_fiscal_1', s.sala_fiscal_1, 'sala_fiscal_2', s.sala_fiscal_2))
       FROM salas_prova_distribuidas s WHERE s.id = :'sala_a'::uuid)
  ) AS reaberta_volta_a_salvar;
ROLLBACK;

\echo ''
\echo '-- 4.6 ⚠️ O QUE MANTÉM O `db reset` DE PÉ é o próprio dump: ele abre com'
\echo '--     `SET session_replication_role = replica` (linha 9), que desliga TRIGGER e FK'
\echo '--     durante a carga. NÃO há exceção por role no trigger — um carve-out por'
\echo '--     superusuário foi escrito e removido: em Supabase o `postgres` NÃO é'
\echo '--     superusuário (usesuper = f), então ele nunca dispararia. Esperado: UPDATE 1.'
BEGIN;
  UPDATE provas SET prova_finalizada = true WHERE id = :'p_id'::uuid;
  SET LOCAL session_replication_role = replica;
  UPDATE salas_prova_distribuidas SET sala_capacidade = 99 WHERE id = :'sala_a'::uuid;
ROLLBACK;

\echo ''
\echo '-- 4.7 ⭐ CONTROLE POSITIVO do 4.6: sem o session_replication_role, a MESMA escrita'
\echo '--     como `postgres` é recusada. Sem este par, 4.6 provaria só que postgres escreve.'
BEGIN;
  UPDATE provas SET prova_finalizada = true WHERE id = :'p_id'::uuid;
  UPDATE salas_prova_distribuidas SET sala_capacidade = 99 WHERE id = :'sala_a'::uuid;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ FIM — nada acima foi commitado.                                        ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
