-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 1: metadados do certame e capítulos do documento
-- migration 20260916173801_editais_metadados_e_capitulos
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Roadmap: my_rules/analises/roadmap-editais-espinha-do-documento.yaml
--
-- 🔴 O QUE ESTA BATERIA COBRE E A SUÍTE NÃO ALCANÇA: a FK RESTRICT, o UNIQUE por
-- (edital, capítulo), as CHECKs de domínio, os GRANTs e a RLS. `npm test` mocka o
-- Supabase — lá, qualquer string passa por uuid e nenhuma policy é avaliada.
--
-- ⚠️ A NUMERAÇÃO NÃO SE TESTA AQUI, e isso é desenho, não esquecimento: ela é calculada
-- no cliente (`src/lib/edital-numeracao.ts`) e coberta por `edital-numeracao.test.ts`,
-- com os três editais reais como controle positivo. O banco NÃO tem coluna `numero`.
--
-- COMO A SESSÃO É SIMULADA: `auth.uid()` lê o `sub` de `request.jwt.claims`; os casos de
-- permissão usam `set_config(..., true)` + `SET LOCAL ROLE authenticated`.
--
-- Como rodar (o container muda de nome por projeto):
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-edital-capitulos.sql
--
-- ⚠️ Roda em TRANSAÇÃO com ROLLBACK: não deixa edital nem capítulo para trás.

\set ON_ERROR_STOP off
BEGIN;

-- ── CASO 0 — a FK aponta para onde se diz, e é RESTRICT ──────────────────────────────
SELECT 'CASO 0' AS caso, c.conname,
       (SELECT relname FROM pg_class WHERE oid = c.confrelid) AS aponta_para,
       CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
                          WHEN 'a' THEN 'NO ACTION' ELSE c.confdeltype::text END AS on_delete,
       CASE WHEN (SELECT relname FROM pg_class WHERE oid = c.confrelid) = 'editais'
             AND c.confdeltype = 'r'
            THEN 'OK — RESTRICT: capítulo carrega TEXTO REDIGIDO, não some em silêncio'
            ELSE '🔴 FALHOU' END AS veredito
FROM pg_constraint c
WHERE c.conrelid = 'public.edital_capitulos'::regclass AND c.contype = 'f'
  AND c.conname LIKE '%edital_id%';

-- ── CASO 0b — `numero` NÃO é coluna. É o ponto central do módulo. ────────────────────
SELECT 'CASO 0b' AS caso,
       count(*) FILTER (WHERE column_name = 'numero') AS coluna_numero,
       CASE WHEN count(*) FILTER (WHERE column_name = 'numero') = 0
            THEN 'OK — o número é calculado, nunca persistido'
            ELSE '🔴 FALHOU — alguém persistiu o número' END AS veredito
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'edital_capitulos';

-- ── CASO 0c — `anon` não lê nada; `authenticated` tem o DML ──────────────────────────
SELECT 'CASO 0c' AS caso,
       has_table_privilege('anon', 'public.edital_capitulos', 'SELECT') AS anon_le,
       has_table_privilege('authenticated', 'public.edital_capitulos', 'SELECT') AS auth_le,
       CASE WHEN NOT has_table_privilege('anon', 'public.edital_capitulos', 'SELECT')
             AND has_table_privilege('authenticated', 'public.edital_capitulos', 'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito;

-- ── CASOS 1 a 9 — comportamento ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_edital uuid;
  v_admin  uuid;
  v_comum  uuid;
  v_cap    uuid;
  v_con text; v_msg text; v_estado text; v_n int;
BEGIN
  SELECT id INTO v_edital FROM public.editais ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u
   WHERE NOT public.has_role(u.id, 'admin'::app_role) LIMIT 1;
  RAISE NOTICE '--- fixture: edital=% admin=% naoadmin=%', v_edital, v_admin, v_comum;

  -- CASO 1 — CONTROLE POSITIVO: capítulo nasce, e um edital sem linha nenhuma é válido.
  SELECT count(*) INTO v_n FROM public.edital_capitulos WHERE edital_id = v_edital;
  RAISE NOTICE 'CASO 1 (edital SEM capítulo é estado válido) linhas=%  %',
    v_n, CASE WHEN v_n = 0 THEN 'OK — a linha é override, não registro obrigatório' ELSE 'ATENÇÃO: já havia linhas' END;

  -- 🔵 A coluna `texto` SAIU em 20260916225307: o texto do capítulo virou registro em
  -- `edital_itens`, um por artigo. Este INSERT a nomeava e teria quebrado a bateria
  -- inteira na primeira linha — o mesmo apodrecimento silencioso que deixou
  -- `bateria-troca-total-candidatos.sql` verde e morta por dois dias em 02/08.
  INSERT INTO public.edital_capitulos (edital_id, chave, ordem, incluido)
  VALUES (v_edital, 'prova_de_titulos', 14, true)
  RETURNING id INTO v_cap;
  RAISE NOTICE 'CASO 1b (insere capítulo) %', CASE WHEN v_cap IS NOT NULL THEN 'OK' ELSE '🔴 FALHOU' END;

  -- CASO 2 — UNIQUE (edital_id, chave): o mesmo capítulo duas vezes no mesmo edital.
  BEGIN
    INSERT INTO public.edital_capitulos (edital_id, chave, ordem, incluido)
    VALUES (v_edital, 'prova_de_titulos', 14, false);
    RAISE NOTICE 'CASO 2 (capítulo duplicado) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (capítulo duplicado) RECUSADO por %/%  %', SQLSTATE, v_con,
      CASE WHEN v_con = 'edital_capitulos_edital_chave_key' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 2b — CONTROLE POSITIVO: a MESMA chave em OUTRO edital é permitida.
  DECLARE v_outro uuid;
  BEGIN
    SELECT id INTO v_outro FROM public.editais WHERE id <> v_edital LIMIT 1;
    IF v_outro IS NULL THEN
      RAISE NOTICE 'CASO 2b NÃO EXERCITADO — só há um edital no banco';
    ELSE
      INSERT INTO public.edital_capitulos (edital_id, chave, ordem, incluido)
      VALUES (v_outro, 'prova_de_titulos', 14, true);
      RAISE NOTICE 'CASO 2b (mesma chave em outro edital) OK — o UNIQUE é por edital';
    END IF;
  END;

  -- CASO 3 — 🔴 RESTRICT: apagar edital com capítulo é recusado PELA FK DO CAPÍTULO.
  --
  -- ⚠️ O edital tem de ser LIMPO, criado aqui. Na primeira versão deste caso eu usei um
  -- edital existente e ele foi barrado por `provas_edital_id_fkey` — o caso passava
  -- dizendo OK e NÃO exercitava a FK nova. É a armadilha do CLAUDE.md §8: regra nova
  -- ofuscada por regra antiga. Por isso o veredito exige o NOME exato da constraint.
  DECLARE v_limpo uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('BATERIA CAPITULOS — descartável')
    RETURNING id INTO v_limpo;
    INSERT INTO public.edital_capitulos (edital_id, chave, ordem, incluido)
    VALUES (v_limpo, 'anexos', 18, true);

    BEGIN
      DELETE FROM public.editais WHERE id = v_limpo;
      RAISE NOTICE 'CASO 3 (apagar edital com capítulo) 🔴 FALHOU — foi aceito';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 3 (apagar edital com capítulo) RECUSADO por %/%  %', SQLSTATE, v_con,
        CASE WHEN v_con = 'edital_capitulos_edital_id_fkey'
             THEN 'OK — o documento não some junto'
             ELSE '🔴 FALHOU — barrou OUTRA regra, a FK do capítulo não foi exercitada' END;
    END;

    -- ⭐ CONTROLE POSITIVO: sem capítulo, o mesmo edital limpo se apaga.
    DELETE FROM public.edital_capitulos WHERE edital_id = v_limpo;
    DELETE FROM public.editais WHERE id = v_limpo;
    RAISE NOTICE 'CASO 3b (edital limpo, sem capítulo, APAGA) OK — controle positivo';
  END;

  -- CASO 4 — CHECKs da tabela.
  BEGIN
    INSERT INTO public.edital_capitulos (edital_id, chave, ordem, incluido)
    VALUES (v_edital, '   ', 1, true);
    RAISE NOTICE 'CASO 4 (chave em branco) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (chave em branco) RECUSADO por %  OK', v_con;
  END;

  BEGIN
    INSERT INTO public.edital_capitulos (edital_id, chave, ordem, incluido)
    VALUES (v_edital, 'anexos', -1, true);
    RAISE NOTICE 'CASO 4b (ordem negativa) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4b (ordem negativa) RECUSADO por %  OK', v_con;
  END;

  -- CASO 5 — `natureza_juridica` é domínio fechado.
  BEGIN
    UPDATE public.editais SET natureza_juridica = 'LICITACAO' WHERE id = v_edital;
    RAISE NOTICE 'CASO 5 (natureza inválida) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5 (natureza inválida) RECUSADO por %  OK', v_con;
  END;

  UPDATE public.editais SET natureza_juridica = 'PROCESSO_SELETIVO' WHERE id = v_edital;
  RAISE NOTICE 'CASO 5b (natureza válida) OK — controle positivo';

  UPDATE public.editais SET natureza_juridica = NULL WHERE id = v_edital;
  RAISE NOTICE 'CASO 5c (natureza NULA) OK — os 3 editais de produção não têm metadado';

  -- CASO 6 — ⭐ `numero_edital` entra CRU: o banco não tem opinião sobre formato.
  UPDATE public.editais SET numero_edital = '002/2026-SMA' WHERE id = v_edital;
  RAISE NOTICE 'CASO 6 (numero_edital "002/2026-SMA") OK — sem CHECK de formato, por decisão de 01/08';

  -- CASO 7 — prazo de validade positivo.
  BEGIN
    UPDATE public.editais SET prazo_validade_anos = 0 WHERE id = v_edital;
    RAISE NOTICE 'CASO 7 (prazo 0) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 7 (prazo 0) RECUSADO  OK';
  END;

  -- CASO 8 — 🔴 RLS: quem NÃO é admin não escreve capítulo.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_comum, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.edital_capitulos (edital_id, chave, ordem, incluido)
    VALUES (v_edital, 'disposicoes_gerais', 18, true);
    RAISE NOTICE 'CASO 8 (não-admin escreve) 🔴 FALHOU — a RLS deixou passar';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'CASO 8 (não-admin escreve) RECUSADO por %  OK', SQLSTATE;
  END;

  -- CASO 8b — mas LÊ, porque a política de SELECT espelha `editais`.
  SELECT count(*) INTO v_n FROM public.edital_capitulos;
  RAISE NOTICE 'CASO 8b (não-admin LÊ) linhas=%  OK — SELECT é aberto a autenticado, como editais', v_n;

  -- CASO 8c — ⭐ CONTROLE POSITIVO: admin escreve.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.edital_capitulos (edital_id, chave, ordem, incluido)
    VALUES (v_edital, 'disposicoes_gerais', 18, true);
    RAISE NOTICE 'CASO 8c (ADMIN escreve) OK — controle positivo';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_estado = RETURNED_SQLSTATE;
    RAISE NOTICE 'CASO 8c (ADMIN escreve) 🔴 FALHOU [%]: %', v_estado, v_msg;
  END;
  RESET ROLE;
END $$;

ROLLBACK;

SELECT 'CASO 9' AS caso, count(*) AS linhas_apos_rollback,
       CASE WHEN count(*) = 0 THEN 'OK — a bateria não deixou capítulo para trás'
            ELSE '⚠️ sobrou linha (pode ser de uso real; confira antes de apagar)' END AS veredito
FROM public.edital_capitulos;
