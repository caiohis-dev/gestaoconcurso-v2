-- ============================================================================
-- BATERIA — public.totais_da_prova(uuid, uuid[])
-- ============================================================================
-- A RPC que o modal da lanterna de `/provas` usa. Ela substituiu 3 consultas por card
-- (122.418 bytes na maior prova) por uma chamada que devolve o resultado já somado.
--
-- 🔴 NADA AUTOMÁTICO RODA ESTE ARQUIVO. `npm test` mocka o Supabase e `npm run
--    docs:conferir` confere doc, não bateria. Ela pode apodrecer verde por dias — foi o
--    que aconteceu com `bateria-troca-total-candidatos.sql`, que ficou 2 dias quebrada na
--    primeira linha depois de a RPC ganhar um 4º parâmetro. **Ao mudar a assinatura de
--    `totais_da_prova`, volte aqui no mesmo passe.**
--
-- COMO RODAR (banco LOCAL, nunca produção):
--   sg docker -c "docker exec supabase_db_dqslqfzqukcahogkieet \
--     psql -U postgres -d postgres -f /dev/stdin" < docs/bateria-totais-da-prova.sql
--
-- Tudo em transação com ROLLBACK. Os UUIDs abaixo são do dump local; se o dump mudar,
-- reconfira-os com o bloco 0.
-- ============================================================================

\set PROVA    '0112d2ac-0223-40b1-8109-c67eb97eafcd'
\set ADMIN    '0a8e7003-6979-4fa3-8ac1-0507917fa2bf'
\set COORD    'aac3b2cf-75e1-43e8-ab0c-f35f0d3616f5'

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. OS UUIDs AINDA VALEM?  (se algum vier 0, conserte antes de seguir)  ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
SELECT (SELECT count(*) FROM public.provas WHERE id = :'PROVA')            AS prova_existe,
       (SELECT count(*) FROM public.user_roles
         WHERE user_id = :'ADMIN' AND role = 'admin')                      AS admin_e_admin,
       (SELECT count(*) FROM public.coordenadores_prova
         WHERE user_id = :'COORD' AND prova_id = :'PROVA')                 AS coord_da_prova,
       (SELECT count(*) FROM public.prova_unidades WHERE prova_id = :'PROVA') AS unidades_da_prova;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. ⭐ CONTROLE POSITIVO — os números da RPC batem com a soma direta    ║'
\echo '║    Provar que o coordenador vê menos é METADE. A outra metade é que o  ║'
\echo '║    número continua CERTO — senão a tela fica rápida e mentirosa.       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Esperado: as duas linhas idênticas, e `confere` = t nas duas colunas.'
BEGIN;
  WITH pela_rpc AS (
    SELECT sum(meta)::bigint AS meta, sum(ocupadas)::bigint AS ocupadas
    FROM public.totais_da_prova(:'PROVA')
  ),
  direto AS (
    SELECT (SELECT sum(m.quantidade_meta)::bigint
              FROM public.meta_colaboradores_unidade m
              JOIN public.prova_unidades pu ON pu.id = m.prova_unidade_id
             WHERE pu.prova_id = :'PROVA')                        AS meta,
           (SELECT count(*)::bigint
              FROM public.colaboradores_prova c
              JOIN public.prova_unidades pu ON pu.id = c.prova_unidade_id
             WHERE pu.prova_id = :'PROVA' AND c.funcao_id IS NOT NULL) AS ocupadas
  )
  SELECT r.meta AS meta_rpc, d.meta AS meta_direto, r.meta = d.meta AS meta_confere,
         r.ocupadas AS ocup_rpc, d.ocupadas AS ocup_direto,
         r.ocupadas = d.ocupadas AS ocup_confere
  FROM pela_rpc r, direto d;
ROLLBACK;

\echo ''
\echo '-- 1.1 Uma unidade conferida à mão (a maior), linha a linha.'
\echo '--     Esperado: `confere` = t em todas as linhas.'
BEGIN;
  SELECT t.funcao_nome, t.meta, t.ocupadas,
         t.ocupadas = (SELECT count(*) FROM public.colaboradores_prova c
                        WHERE c.prova_unidade_id = t.prova_unidade_id
                          AND c.funcao_id = t.funcao_id) AS confere
  FROM public.totais_da_prova(:'PROVA') t
  WHERE t.prova_unidade_id = (
    SELECT c.prova_unidade_id FROM public.colaboradores_prova c
    JOIN public.prova_unidades pu ON pu.id = c.prova_unidade_id
    WHERE pu.prova_id = :'PROVA'
    GROUP BY c.prova_unidade_id ORDER BY count(*) DESC LIMIT 1)
  ORDER BY t.funcao_nome;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. ADMIN vê a prova inteira                                            ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Esperado: 11 unidades distintas (o total do bloco 0).'
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO '{"sub":"0a8e7003-6979-4fa3-8ac1-0507917fa2bf","role":"authenticated"}';
  SELECT count(DISTINCT prova_unidade_id) AS unidades_que_o_admin_ve,
         sum(meta) AS meta, sum(ocupadas) AS ocupadas
  FROM public.totais_da_prova(:'PROVA');
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. 🔴 COORDENADOR **SEM** o recorte — por que o parâmetro existe       ║'
\echo '║    A RLS sozinha NÃO reproduz o que a tela mostra: ela esconde as      ║'
\echo '║    METAS alheias, mas NÃO a ocupação, nem o nome da unidade.           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- 🔵 MEDIDO em 2026-09-10, e NÃO era o que eu esperava — as duas policies'
\echo '--    recortam em GRANULARIDADES DIFERENTES, e isso está no texto delas:'
\echo '--      meta_colaboradores_unidade → por UNIDADE'
\echo '--        (prova_unidade_id IN get_coordenador_prova_unidade_ids(auth.uid()))'
\echo '--      colaboradores_prova        → por PROVA'
\echo '--        (is_coordenador_prova(auth.uid(), pu.prova_id))'
\echo '--    Ou seja: o coordenador PODE ler a alocação da prova inteira, e só as METAS'
\echo '--    ficam restritas à unidade dele. Não é defeito — é o que a policy diz.'
\echo '--'
\echo '-- Esperado: unid_com_meta = 1  ·  unid_com_ocupacao = 11'
\echo '-- 🔴 Se `unid_com_meta` passar de 1, a policy das metas afrouxou — investigue.'
\echo '-- ⚠️ E é POR ISSO que o recorte explícito existe: sem ele a tela mostraria ao'
\echo '--    coordenador a ocupação de unidades que ele não coordena. A RLS não impede;'
\echo '--    quem impede é o parâmetro (bloco 4).'
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO '{"sub":"aac3b2cf-75e1-43e8-ab0c-f35f0d3616f5","role":"authenticated"}';
  SELECT count(DISTINCT prova_unidade_id)                            AS unidades_alcancadas,
         count(DISTINCT prova_unidade_id) FILTER (WHERE meta > 0)     AS unid_com_meta,
         count(DISTINCT prova_unidade_id) FILTER (WHERE ocupadas > 0) AS unid_com_ocupacao
  FROM public.totais_da_prova(:'PROVA');
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. COORDENADOR **COM** o recorte — o que a tela faz de verdade         ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Esperado: exatamente 1 unidade, e com números > 0 (⭐ controle positivo:'
\echo '--           recortar não pode ZERAR o que ele legitimamente vê).'
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO '{"sub":"aac3b2cf-75e1-43e8-ab0c-f35f0d3616f5","role":"authenticated"}';
  SELECT count(DISTINCT prova_unidade_id) AS unidades,
         sum(meta) AS meta, sum(ocupadas) AS ocupadas
  FROM public.totais_da_prova(
    :'PROVA',
    ARRAY(SELECT public.get_coordenador_prova_unidade_ids('aac3b2cf-75e1-43e8-ab0c-f35f0d3616f5'))
  );
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 5. O GRANT — quem NÃO pode executar                                    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- 5.1 anon: esperado ERRO `42501 permission denied for function totais_da_prova`.'
\echo '--     ⚠️ Leia o NOME na mensagem: recusa por outro motivo não prova este REVOKE.'
BEGIN;
  SET LOCAL ROLE anon;
  SELECT count(*) FROM public.totais_da_prova(:'PROVA');
ROLLBACK;

\echo ''
\echo '-- 5.2 ⭐ CONTROLE POSITIVO do grant: `authenticated` executa (não erra).'
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO '{"sub":"0a8e7003-6979-4fa3-8ac1-0507917fa2bf","role":"authenticated"}';
  SELECT count(*) AS authenticated_executa FROM public.totais_da_prova(:'PROVA');
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 6. BORDAS                                                              ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- 6.1 Prova inexistente: esperado 0 linhas, NÃO erro (a tela mostra vazio).'
BEGIN;
  SELECT count(*) AS linhas FROM public.totais_da_prova('00000000-0000-0000-0000-000000000000');
ROLLBACK;

\echo ''
\echo '-- 6.2 Recorte com array VAZIO: esperado 0 linhas.'
\echo '--     ⚠️ Isto NÃO é o mesmo que NULL — NULL significa "sem recorte" (admin).'
\echo '--     Confundir os dois faria o coordenador sem unidade ver a prova inteira.'
BEGIN;
  SELECT count(*) AS com_array_vazio FROM public.totais_da_prova(:'PROVA', ARRAY[]::uuid[]),
         LATERAL (SELECT 1) _;
ROLLBACK;

\echo ''
\echo '-- 6.3 ⭐ E o contraste: NULL devolve tudo.'
BEGIN;
  SELECT count(*) AS com_null FROM public.totais_da_prova(:'PROVA', NULL);
ROLLBACK;

\echo ''
\echo '-- 6.4 Função com gente alocada e SEM meta cadastrada aparece com meta = 0?'
\echo '--     A RPC devolve; é a UI que filtra (`.filter(f => f.meta > 0)`). Se aqui vier'
\echo '--     0 linhas, é porque o dado local não tem esse caso — não é falha da RPC.'
BEGIN;
  SELECT count(*) AS linhas_com_meta_zero_e_gente
  FROM public.totais_da_prova(:'PROVA')
  WHERE meta = 0 AND ocupadas > 0;
ROLLBACK;

\echo ''
\echo '== fim =='
