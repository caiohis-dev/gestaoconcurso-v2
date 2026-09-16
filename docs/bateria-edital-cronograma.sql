-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 3: o cronograma do certame
-- migration 20260916191028_editais_cronograma_etapas
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Roadmap: my_rules/analises/roadmap-editais-cronograma-e-prazos.yaml
--
-- ⚠️ AS REGRAS DE COERÊNCIA NÃO SE TESTAM AQUI: precedência, fim de semana e etapa sem
-- data são função pura no cliente (`src/lib/edital-cronograma.ts`), com o cronograma REAL
-- do Edital 003 como fixture. Aqui ficam as barreiras do BANCO: cardinalidade por tipo,
-- intervalo ordenado, RLS e RESTRICT.
--
-- 🔴 A cardinalidade é a barreira que importa. INTERVALO com 3 datas ou DATA_UNICA com 2
-- é um cronograma que a tela renderizaria errado SEM DAR ERRO — o formato de defeito que
-- este repo mais teme.
--
-- Como rodar:
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-edital-cronograma.sql

\set ON_ERROR_STOP off
BEGIN;

SELECT 'CASO 0' AS caso, c.conname,
       (SELECT relname FROM pg_class WHERE oid = c.confrelid) AS aponta_para,
       CASE c.confdeltype WHEN 'r' THEN 'RESTRICT' ELSE c.confdeltype::text END AS on_delete,
       CASE WHEN c.confdeltype = 'r' THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_constraint c
WHERE c.conrelid = 'public.cronograma_etapas'::regclass AND c.contype = 'f'
  AND c.conname NOT LIKE '%created_by%';

SELECT 'CASO 0b' AS caso,
       has_table_privilege('anon','public.cronograma_etapas','SELECT') AS anon_le,
       CASE WHEN NOT has_table_privilege('anon','public.cronograma_etapas','SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito;

DO $$
DECLARE v_edital uuid; v_con text; v_comum uuid; v_n int;
BEGIN
  SELECT id INTO v_edital FROM public.editais ORDER BY created_at LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u WHERE NOT public.has_role(u.id,'admin'::app_role) LIMIT 1;

  -- CASO 1 — ⭐ CONTROLE POSITIVO: as três formas do cronograma REAL do Edital 003.
  INSERT INTO public.cronograma_etapas (edital_id, chave, nome_evento, tipo, datas, ordem) VALUES
    (v_edital,'inscricoes','Inscrições','INTERVALO', ARRAY['2026-06-29','2026-07-27']::date[], 1),
    (v_edital,'prova_objetiva','Prova objetiva','DATA_UNICA', ARRAY['2026-09-20']::date[], 2),
    (v_edital,'retirada_atestado_pcd','Retirada do atestado','ALTERNATIVAS',
       ARRAY['2026-07-06','2026-07-09','2026-07-13','2026-07-16','2026-07-20']::date[], 3);
  RAISE NOTICE 'CASO 1 (as três formas do Edital 003) OK — intervalo, data única e 5 alternativas';

  -- CASO 2 — ⭐ CONTROLE POSITIVO: etapa SEM data é estado válido no banco.
  INSERT INTO public.cronograma_etapas (edital_id, chave, nome_evento, tipo, ordem)
  VALUES (v_edital,'resultado_final','Resultado final','DATA_UNICA', 4);
  RAISE NOTICE 'CASO 2 (etapa sem data) OK — gravar é possível; quem recusa PUBLICAR é o linter';

  -- CASO 3 — 🔴 cardinalidade: DATA_UNICA com duas datas.
  BEGIN
    INSERT INTO public.cronograma_etapas (edital_id, nome_evento, tipo, datas)
    VALUES (v_edital,'Errada','DATA_UNICA', ARRAY['2026-01-01','2026-01-02']::date[]);
    RAISE NOTICE 'CASO 3 (DATA_UNICA com 2 datas) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3 (DATA_UNICA com 2 datas) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_cronograma_cardinalidade' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 3b — INTERVALO com três datas.
  BEGIN
    INSERT INTO public.cronograma_etapas (edital_id, nome_evento, tipo, datas)
    VALUES (v_edital,'Errada','INTERVALO', ARRAY['2026-01-01','2026-01-02','2026-01-03']::date[]);
    RAISE NOTICE 'CASO 3b (INTERVALO com 3 datas) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 3b (INTERVALO com 3 datas) RECUSADO  OK';
  END;

  -- CASO 3c — ⭐ CONTROLE POSITIVO: ALTERNATIVAS com uma só data é legítimo.
  INSERT INTO public.cronograma_etapas (edital_id, nome_evento, tipo, datas)
  VALUES (v_edital,'Uma alternativa só','ALTERNATIVAS', ARRAY['2026-01-01']::date[]);
  RAISE NOTICE 'CASO 3c (ALTERNATIVAS com 1 data) OK — controle positivo';

  -- CASO 4 — intervalo que termina antes de começar.
  BEGIN
    INSERT INTO public.cronograma_etapas (edital_id, nome_evento, tipo, datas)
    VALUES (v_edital,'Invertida','INTERVALO', ARRAY['2026-07-27','2026-06-29']::date[]);
    RAISE NOTICE 'CASO 4 (intervalo invertido) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (intervalo invertido) RECUSADO por %  OK', v_con;
  END;

  -- CASO 5 — RESTRICT: edital com cronograma não se apaga em silêncio.
  BEGIN
    DELETE FROM public.editais WHERE id = v_edital;
    RAISE NOTICE 'CASO 5 🔴 FALHOU — o edital foi apagado';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CASO 5 (apagar edital com cronograma) RECUSADO  OK';
  END;

  -- CASO 6 — 🔴 RLS.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_comum,'role','authenticated')::text, true);
  BEGIN
    INSERT INTO public.cronograma_etapas (edital_id, nome_evento) VALUES (v_edital,'Intrusa');
    RAISE NOTICE 'CASO 6 (não-admin escreve) 🔴 FALHOU';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'CASO 6 (não-admin escreve) RECUSADO por %  OK', SQLSTATE;
  END;
  SELECT count(*) INTO v_n FROM public.cronograma_etapas;
  RAISE NOTICE 'CASO 6b (não-admin LÊ) linhas=%  OK', v_n;
  RESET ROLE;
END $$;

ROLLBACK;

SELECT 'CASO 7' AS caso, count(*) AS linhas_apos_rollback,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '⚠️ sobrou linha' END AS veredito
FROM public.cronograma_etapas;
