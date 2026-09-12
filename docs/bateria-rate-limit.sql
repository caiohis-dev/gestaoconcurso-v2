-- Bateria: rate limit atômico dos fluxos de acesso
-- Migration coberta: 20260912184822_rate_limit_atomico.sql (RPC `registrar_tentativa`)
-- Escrita em 2026-09-12, junto com a migration. Etapa 1 do
-- `my_rules/analises/roadmap-rate-limit-fluxos-de-acesso.yaml`.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-rate-limit.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase e não alcança RPC nenhuma; os testes de Edge Function
-- (`npm run test:ef`) não podem rodar estas quatro, porque três delas ENVIAM E-MAIL DE
-- VERDADE (o banco local é cópia de produção, com endereços reais). Isto aqui é a única
-- verificação automatizável do teto — e só existe quando alguém a executa.
--
-- ⚠️ PRÉ-CONDIÇÃO: nenhuma. Tudo roda em transação com ROLLBACK e usa chaves fabricadas
-- (prefixo `bateria-`), então não depende de dado carregado nem suja a tabela.

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES — quem pode executar o teto                           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 0.1 A RPC existe e é SECURITY DEFINER'
SELECT CASE WHEN p.prosecdef THEN 'OK — SECURITY DEFINER'
            ELSE 'FALHOU — sem DEFINER a EF nao escreve na tabela' END AS resultado
FROM pg_proc p WHERE p.proname = 'registrar_tentativa';

\echo ''
\echo '-- 0.2 🔴 SÓ service_role executa.'
\echo '--     Se `anon` pudesse chamar, qualquer um gastaria o orcamento de um IP alheio'
\echo '--     — ou limparia a propria janela. O teto viraria enfeite.'
SELECT CASE WHEN has_function_privilege('anon',
              'public.registrar_tentativa(text,text,int,interval)', 'EXECUTE')
            THEN 'FALHOU — anon executa o teto' ELSE 'OK — anon sem EXECUTE' END AS resultado;
SELECT CASE WHEN has_function_privilege('authenticated',
              'public.registrar_tentativa(text,text,int,interval)', 'EXECUTE')
            THEN 'FALHOU — authenticated executa o teto' ELSE 'OK — authenticated sem EXECUTE' END AS resultado;
SELECT CASE WHEN has_function_privilege('service_role',
              'public.registrar_tentativa(text,text,int,interval)', 'EXECUTE')
            THEN 'OK — service_role executa (controle positivo)'
            ELSE 'FALHOU — revogamos de quem precisa; as 4 EFs param' END AS resultado;

\echo ''
\echo '-- 0.3 A tabela tem escopo, e `ip` virou `chave`'
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS colunas
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reivindicacao_rate_limit';

\echo ''
\echo '-- 0.4 ⚠️ `anon` e `authenticated` nao alcancam a TABELA tambem'
SELECT coalesce(string_agg(DISTINCT grantee, ', '), '(nenhum — OK)') AS quem_alcanca_a_tabela
FROM information_schema.role_table_grants
WHERE table_name = 'reivindicacao_rate_limit' AND grantee IN ('anon', 'authenticated');


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. O TETO — e o CONTROLE POSITIVO junto                                ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE
  v_ok boolean; v_passaram int := 0; v_barradas int := 0; i int;
BEGIN
  -- Teto de 3 numa janela de 60 min: o mesmo do cadastro publico.
  FOR i IN 1..5 LOOP
    v_ok := public.registrar_tentativa('bateria-teto', 'chave-A', 3, interval '60 minutes');
    IF v_ok THEN v_passaram := v_passaram + 1; ELSE v_barradas := v_barradas + 1; END IF;
  END LOOP;

  -- 🔴 As 3 primeiras passam (controle positivo: o teto NAO barra quem esta' no direito)
  -- e as 2 seguintes sao barradas.
  IF v_passaram = 3 AND v_barradas = 2 THEN
    RAISE NOTICE 'CASO 1.1: OK — 3 passaram, 2 barradas (teto=3)';
  ELSE
    RAISE NOTICE 'CASO 1.1: FALHOU — % passaram, % barradas', v_passaram, v_barradas;
  END IF;

  -- ⚠️ A tentativa BARRADA tambem e' registrada. E' o que mantem quem martela do outro
  -- lado do teto: se so' as aprovadas contassem, a janela expiraria enquanto o atacante
  -- continua batendo, e ele voltaria a passar.
  IF (SELECT count(*) FROM public.reivindicacao_rate_limit
       WHERE escopo = 'bateria-teto' AND chave = 'chave-A') = 5 THEN
    RAISE NOTICE 'CASO 1.2: OK — as 5 tentativas ficaram registradas, inclusive as barradas';
  ELSE
    RAISE NOTICE 'CASO 1.2: FALHOU — % linhas gravadas',
      (SELECT count(*) FROM public.reivindicacao_rate_limit WHERE escopo='bateria-teto' AND chave='chave-A');
  END IF;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. ISOLAMENTO — escopos e chaves nao se contaminam                     ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE v_ok boolean; i int;
BEGIN
  -- Estoura o escopo 'cadastro' para a chave A.
  FOR i IN 1..4 LOOP
    PERFORM public.registrar_tentativa('bateria-cadastro', 'chave-A', 3, interval '60 minutes');
  END LOOP;

  -- 2.1 OUTRO ESCOPO, mesma chave: orcamento proprio. Sem isto, apertar o cadastro
  --     publico apertaria junto o "esqueci minha senha", que e' outra porta.
  v_ok := public.registrar_tentativa('bateria-acesso', 'chave-A', 5, interval '15 minutes');
  IF v_ok THEN
    RAISE NOTICE 'CASO 2.1: OK — escopo diferente tem orcamento proprio';
  ELSE
    RAISE NOTICE 'CASO 2.1: FALHOU — o escopo vazou para o vizinho';
  END IF;

  -- 2.2 MESMO escopo, OUTRA chave: um IP nao gasta o teto do outro.
  v_ok := public.registrar_tentativa('bateria-cadastro', 'chave-B', 3, interval '60 minutes');
  IF v_ok THEN
    RAISE NOTICE 'CASO 2.2: OK — outra chave (outro IP) nao herda o bloqueio';
  ELSE
    RAISE NOTICE 'CASO 2.2: FALHOU — um IP barrou o outro';
  END IF;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. A JANELA E A RETENÇÃO (D4 — a tabela nao cresce para sempre)        ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE v_ok boolean; v_restou int;
BEGIN
  -- 3 tentativas ANTIGAS, fora da janela de 15 min.
  INSERT INTO public.reivindicacao_rate_limit (escopo, chave, created_at)
  SELECT 'bateria-janela', 'chave-A', now() - interval '30 minutes' FROM generate_series(1,3);

  -- Com teto 3, elas barrariam a proxima — se contassem. Fora da janela, nao contam.
  v_ok := public.registrar_tentativa('bateria-janela', 'chave-A', 3, interval '15 minutes');
  IF v_ok THEN
    RAISE NOTICE 'CASO 3.1: OK — tentativa fora da janela nao conta';
  ELSE
    RAISE NOTICE 'CASO 3.1: FALHOU — a janela nao esta sendo respeitada';
  END IF;

  -- E foram APAGADAS, nao so' ignoradas: sobra apenas a tentativa nova.
  SELECT count(*) INTO v_restou FROM public.reivindicacao_rate_limit
   WHERE escopo = 'bateria-janela' AND chave = 'chave-A';
  IF v_restou = 1 THEN
    RAISE NOTICE 'CASO 3.2: OK — as antigas foram expurgadas (sobrou 1)';
  ELSE
    RAISE NOTICE 'CASO 3.2: FALHOU — sobraram % linhas', v_restou;
  END IF;

  -- 3.3 O expurgo GLOBAL: linha velha de OUTRA chave/escopo tambem sai. Sem isto, a
  --     chave que nunca mais volta ficaria na tabela para sempre.
  INSERT INTO public.reivindicacao_rate_limit (escopo, chave, created_at)
  VALUES ('bateria-fossil', 'chave-Z', now() - interval '3 days');
  PERFORM public.registrar_tentativa('bateria-janela', 'chave-A', 3, interval '15 minutes');
  IF NOT EXISTS (SELECT 1 FROM public.reivindicacao_rate_limit WHERE escopo = 'bateria-fossil') THEN
    RAISE NOTICE 'CASO 3.3: OK — linha de 3 dias foi expurgada por qualquer chamada';
  ELSE
    RAISE NOTICE 'CASO 3.3: FALHOU — a tabela cresce para sempre (D4 aberto)';
  END IF;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. RECUSA DE ENTRADA INVÁLIDA                                          ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE v_msg text; v_ok boolean;
BEGIN
  BEGIN
    v_ok := public.registrar_tentativa('bateria', '', 3, interval '15 minutes');
    RAISE NOTICE 'CASO 4.1: FALHOU — aceitou chave vazia (todo mundo no mesmo balde)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 4.1: OK — %', v_msg;
  END;

  BEGIN
    v_ok := public.registrar_tentativa(NULL, 'chave-A', 3, interval '15 minutes');
    RAISE NOTICE 'CASO 4.2: FALHOU — aceitou escopo nulo';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CASO 4.2: OK — escopo nulo recusado';
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- 5. Controle final: a bateria nao deixou residuo.'
SELECT count(*) AS linhas_bateria_que_sobraram
FROM public.reivindicacao_rate_limit WHERE escopo LIKE 'bateria-%';
