-- ============================================================================
-- BATERIA — public.funcoes_em_uso()  +  a barreira REAL da exclusão de função
-- ============================================================================
-- A RPC alimenta o botão de excluir de `/funcoes-colaboradores`. Ela substituiu três
-- selects crus que somavam 42.778 bytes em 3 requisições (medido em 2026-09-10).
--
-- 🔴 MAS O QUE ESTA BATERIA MAIS PRECISA AFIRMAR NÃO É A RPC — é que a barreira mora nas
--    FKs. Um cabeçalho de teste afirmou de 2026-07-25 a 2026-09-10 que as FKs eram
--    CASCADE/SET NULL e que "não há rede no banco". Era verdade quando escrito e virou
--    falso UM DIA DEPOIS (migration `20260726190000_*_on_delete_restrict.sql`). O aviso
--    envelhecido foi lido de boa-fé em 09/10 e virou um item de backlog errado.
--    **O bloco 3 existe para isso não se repetir.**
--
-- 🔴 NADA AUTOMÁTICO RODA ESTE ARQUIVO — nem `npm test` (mocka o Supabase) nem
--    `docs:conferir` (confere doc). Ao mudar a assinatura da RPC, volte aqui no mesmo passe.
--
-- COMO RODAR (banco LOCAL):
--   sg docker -c "docker exec -i supabase_db_dqslqfzqukcahogkieet \
--     psql -U postgres -d postgres -f /dev/stdin" < docs/bateria-funcoes-em-uso.sql
-- ============================================================================

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. ⭐ CONTROLE POSITIVO — a RPC bate com a conta ingênua               ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Esperado: as duas colunas iguais e `confere` = t.'
BEGIN;
  WITH pela_rpc AS (SELECT count(*) AS n FROM public.funcoes_em_uso()),
  ingenua AS (
    SELECT count(*) AS n FROM (
      SELECT funcao_id FROM public.valores_funcao_prova       WHERE funcao_id IS NOT NULL
      UNION SELECT funcao_id FROM public.colaboradores_prova        WHERE funcao_id IS NOT NULL
      UNION SELECT funcao_id FROM public.meta_colaboradores_unidade WHERE funcao_id IS NOT NULL
    ) x
  )
  SELECT r.n AS pela_rpc, i.n AS ingenua, r.n = i.n AS confere FROM pela_rpc r, ingenua i;
ROLLBACK;

\echo ''
\echo '-- 1.1 ⭐ E o outro lado do controle: existe função LIVRE? Se a RPC devolvesse'
\echo '--      TODAS as funções, o caso acima passaria e o botão nunca habilitaria.'
\echo '-- Esperado: livres > 0.'
BEGIN;
  SELECT count(*) FILTER (WHERE f.id IN (SELECT public.funcoes_em_uso())) AS em_uso,
         count(*) FILTER (WHERE f.id NOT IN (SELECT public.funcoes_em_uso())) AS livres
  FROM public.funcoes_colaboradores f;
ROLLBACK;

\echo ''
\echo '-- 1.2 Uma função recém-criada nasce LIVRE, e passa a EM USO ao ganhar vínculo.'
\echo '-- Esperado: antes = f, depois = t.'
BEGIN;
  INSERT INTO public.funcoes_colaboradores (id, cargo_nome)
    VALUES ('11111111-1111-1111-1111-111111111111', 'BATERIA FUNCAO NOVA');
  SELECT '11111111-1111-1111-1111-111111111111' IN (SELECT public.funcoes_em_uso()) AS antes;

  INSERT INTO public.meta_colaboradores_unidade (prova_unidade_id, funcao_id, quantidade_meta)
    SELECT pu.id, '11111111-1111-1111-1111-111111111111', 1
    FROM public.prova_unidades pu LIMIT 1;
  SELECT '11111111-1111-1111-1111-111111111111' IN (SELECT public.funcoes_em_uso()) AS depois;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. NULO não associa ninguém                                            ║'
\echo '║    `colaboradores_prova.funcao_id` é nullable. A RPC filtra.           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Esperado: 0 (nenhum NULL no retorno).'
BEGIN;
  SELECT count(*) AS nulos_no_retorno FROM public.funcoes_em_uso() f WHERE f IS NULL;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. 🔴 A BARREIRA REAL — as FKs são RESTRICT, não CASCADE               ║'
\echo '║    É o bloco que existe porque um aviso envelhecido afirmou o oposto.  ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- 3.1 Esperado: as TRÊS linhas com ao_deletar = RESTRICT.'
BEGIN;
  SELECT c.conrelid::regclass AS tabela, c.conname,
         CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
              WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' END AS ao_deletar
  FROM pg_constraint c
  WHERE c.contype = 'f' AND c.confrelid = 'public.funcoes_colaboradores'::regclass
  ORDER BY 1;
ROLLBACK;

\echo ''
\echo '-- 3.2 ⚠️ A ARMADILHA DA OFUSCAÇÃO: escolher a função errada prova a regra ERRADA.'
\echo '--     Apagar uma função BÁSICA é barrado por `prevent_system_funcao_changes()`,'
\echo '--     não pela FK — a recusa acontece, mas por outro motivo, e a cobertura da FK'
\echo '--     vira fantasma. Esperado aqui: erro citando "funções básicas do sistema".'
BEGIN;
  DELETE FROM public.funcoes_colaboradores WHERE cargo_editavel = false;
ROLLBACK;

\echo ''
\echo '-- 3.3 🔴 A FK DE VERDADE: função EDITÁVEL e EM USO.'
\echo '--     Esperado: erro nomeando `colaboradores_prova_funcao_id_fkey`.'
\echo '--     LEIA O NOME. Recusa por outro motivo não prova este RESTRICT.'
BEGIN;
  DELETE FROM public.funcoes_colaboradores f
   WHERE f.cargo_editavel = true
     AND EXISTS (SELECT 1 FROM public.colaboradores_prova c WHERE c.funcao_id = f.id);
ROLLBACK;

\echo ''
\echo '-- 3.4 ⭐ CONTROLE POSITIVO da barreira: função LIVRE e editável ainda se exclui.'
\echo '--      Sem isto, uma regra que recusasse TUDO passaria no 3.3.'
BEGIN;
  INSERT INTO public.funcoes_colaboradores (cargo_nome) VALUES ('BATERIA FUNCAO SEM USO');
  DELETE FROM public.funcoes_colaboradores WHERE cargo_nome = 'BATERIA FUNCAO SEM USO';
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. O GRANT                                                             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- 4.1 anon: esperado `42501 permission denied for function funcoes_em_uso`.'
BEGIN;
  SET LOCAL ROLE anon;
  SELECT count(*) FROM public.funcoes_em_uso();
ROLLBACK;

\echo ''
\echo '-- 4.2 ⭐ CONTROLE POSITIVO: admin autenticado executa.'
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO '{"sub":"0a8e7003-6979-4fa3-8ac1-0507917fa2bf","role":"authenticated"}';
  SELECT count(*) AS admin_executa FROM public.funcoes_em_uso();
ROLLBACK;

\echo ''
\echo '== fim =='
