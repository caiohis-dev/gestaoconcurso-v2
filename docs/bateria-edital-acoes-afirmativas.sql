-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 4: ações afirmativas e condições especiais
-- migration 20260916193309_editais_acoes_afirmativas
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Roadmap: my_rules/analises/roadmap-editais-acoes-afirmativas.yaml
--
-- ⚠️ A DERIVAÇÃO DA DATA DE CORTE não se testa aqui: é função pura no cliente
-- (`src/lib/edital-acoes-afirmativas.ts`), com o caso do Edital 003 como fixture. O
-- banco NÃO TEM coluna de data de corte, e o CASO 0 é justamente isso.
--
-- Como rodar:
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-edital-acoes-afirmativas.sql

\set ON_ERROR_STOP off
BEGIN;

-- ── CASO 0 — 🔴 a data de corte NÃO é coluna. É o ponto da fatia. ────────────────────
SELECT 'CASO 0' AS caso,
       count(*) FILTER (WHERE column_name LIKE 'data_limite%') AS colunas_de_corte,
       CASE WHEN count(*) FILTER (WHERE column_name LIKE 'data_limite%') = 0
            THEN 'OK — derivada da data da prova, nunca persistida'
            ELSE '🔴 FALHOU — alguém persistiu a data de corte' END AS veredito
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'regras_lactantes';

-- ── CASO 0b — RLS e anon nas três tabelas ────────────────────────────────────────────
SELECT 'CASO 0b' AS caso, c.relname, count(p.polname) AS policies, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       CASE WHEN count(p.polname) = 4 AND c.relrowsecurity
             AND NOT has_table_privilege('anon', c.oid, 'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('regras_pcd','regras_cotas_raciais','regras_lactantes')
GROUP BY c.relname, c.relrowsecurity, c.oid ORDER BY 1;

DO $$
DECLARE v_edital uuid; v_con text; v_comum uuid;
BEGIN
  SELECT id INTO v_edital FROM public.editais ORDER BY created_at LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u WHERE NOT public.has_role(u.id,'admin'::app_role) LIMIT 1;

  -- CASO 1 — ⭐ CONTROLE POSITIVO: os TRÊS editais reais cabem no mesmo modelo.
  INSERT INTO public.regras_lactantes (edital_id, idade_maxima_lactente_meses, permite_compensacao_tempo, tempo_maximo_compensacao_minutos)
  VALUES (v_edital, 6, true, 30);
  RAISE NOTICE 'CASO 1 (regra do Edital 003/004: compensa 30 min) OK';

  UPDATE public.regras_lactantes
     SET permite_compensacao_tempo = false, tempo_maximo_compensacao_minutos = NULL
   WHERE edital_id = v_edital;
  RAISE NOTICE 'CASO 1b (regra do Edital 002: SEM compensação) OK — o modelo cabe nos dois';

  -- CASO 2 — 🔴 a incoerência que o 002 misturado com o 003 produziria.
  BEGIN
    UPDATE public.regras_lactantes
       SET permite_compensacao_tempo = false, tempo_maximo_compensacao_minutos = 30
     WHERE edital_id = v_edital;
    RAISE NOTICE 'CASO 2 (sem compensação MAS com tempo) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (sem compensação MAS com tempo) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_lactante_tempo_coerente' THEN 'OK — o edital não diz as duas coisas' ELSE '🔴 outra regra' END;
  END;

  -- CASO 2b — ⭐ CONTROLE POSITIVO: COM compensação, o tempo é permitido.
  UPDATE public.regras_lactantes
     SET permite_compensacao_tempo = true, tempo_maximo_compensacao_minutos = 30
   WHERE edital_id = v_edital;
  RAISE NOTICE 'CASO 2b (com compensação E tempo) OK — controle positivo';

  -- CASO 3 — PCD: os dois regimes de laudo convivem.
  INSERT INTO public.regras_pcd (edital_id, percentual_reserva, aceita_laudo_indeterminado, validade_meses_laudo_temporario)
  VALUES (v_edital, 10, false, 6);
  RAISE NOTICE 'CASO 3 (Editais 002/003: prazo fixo de 6 meses) OK';
  UPDATE public.regras_pcd SET aceita_laudo_indeterminado = true WHERE edital_id = v_edital;
  RAISE NOTICE 'CASO 3b (Edital 004: validade indeterminada) OK — mesmo modelo';

  -- CASO 4 — percentual fora da faixa.
  BEGIN
    UPDATE public.regras_pcd SET percentual_reserva = 150 WHERE edital_id = v_edital;
    RAISE NOTICE 'CASO 4 (percentual 150%%) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 4 (percentual 150%%) RECUSADO  OK';
  END;

  -- CASO 5 — uma linha por edital: a PK é o próprio edital_id.
  BEGIN
    INSERT INTO public.regras_pcd (edital_id, percentual_reserva) VALUES (v_edital, 10);
    RAISE NOTICE 'CASO 5 (duas regras de PCD no mesmo edital) 🔴 FALHOU';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'CASO 5 (duas regras de PCD no mesmo edital) RECUSADO  OK';
  END;

  -- CASO 6 — RESTRICT.
  BEGIN
    DELETE FROM public.editais WHERE id = v_edital;
    RAISE NOTICE 'CASO 6 🔴 FALHOU — o edital foi apagado';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CASO 6 (apagar edital com regras) RECUSADO  OK';
  END;

  -- CASO 7 — 🔴 RLS.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_comum,'role','authenticated')::text, true);
  BEGIN
    INSERT INTO public.regras_cotas_raciais (edital_id, percentual_reserva) VALUES (v_edital, 20);
    RAISE NOTICE 'CASO 7 (não-admin escreve) 🔴 FALHOU';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'CASO 7 (não-admin escreve) RECUSADO por %  OK', SQLSTATE;
  END;
  RESET ROLE;
END $$;

ROLLBACK;

SELECT 'CASO 8' AS caso,
       (SELECT count(*) FROM public.regras_pcd)
     + (SELECT count(*) FROM public.regras_cotas_raciais)
     + (SELECT count(*) FROM public.regras_lactantes) AS linhas_apos_rollback,
       'esperado 0' AS veredito;
