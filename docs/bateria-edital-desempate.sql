-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 11: critérios de desempate
-- migration 20260917130000_editais_desempate_e_resultado
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- 🔴 O CASO 4 é o que o roadmap pedia explicitamente: "critério PONTUACAO_DISCIPLINA sem
-- disciplina tem de ser recusado PELO BANCO". Não é validação de tela — um critério
-- "maior pontuação em ___" sai publicado como item em branco na ordem de desempate.
--
-- ⚠️ O cruzamento do nome da disciplina contra a matriz da prova NÃO se testa aqui: é
-- comparação entre tabelas e mora em `src/lib/edital-desempate.ts`. O CASO 6 prova a
-- ausência — o banco aceita nome que a matriz não conhece.
--
-- Rodar:  docker exec -i <supabase_db> psql -U postgres -d postgres < docs/bateria-edital-desempate.sql

\set ON_ERROR_STOP off
BEGIN;

SELECT 'CASO 0' AS caso, c.relname, count(p.polname) AS policies, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       CASE WHEN count(p.polname)=4 AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid,'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname = 'criterios_desempate'
GROUP BY c.relname, c.relrowsecurity, c.oid;

DO $$
DECLARE
  v_ed uuid; v_cargo uuid; v_con text; v_admin uuid; v_comum uuid; v_n int; v_ordens text;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='admin'::app_role LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id=u.id AND r.role IN ('admin'::app_role,'superadmin'::app_role))
   LIMIT 1;

  INSERT INTO public.editais (nome) VALUES ('ZZZ bateria desempate ' || gen_random_uuid())
    RETURNING id INTO v_ed;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA DES DOCENTE I') RETURNING id INTO v_cargo;

  -- ══ ⭐ CONTROLE POSITIVO: a ordem do Edital 002, item 14.5.1 ═══════════════════════
  -- As duas preferências legais (14.2 e 14.3) e depois os 5 critérios da lista.
  INSERT INTO public.criterios_desempate
    (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo, disciplina_referencia) VALUES
    (v_ed, true, 'GERAL', 1, 'IDADE_60_MAIS', NULL),
    (v_ed, true, 'GERAL', 2, 'FUNCAO_JURADO', NULL),
    (v_ed, true, 'GERAL', 3, 'PONTUACAO_DISCIPLINA', 'Conhecimentos Específicos'),
    (v_ed, true, 'GERAL', 4, 'PONTUACAO_DISCIPLINA', 'Conhecimentos Pedagógicos'),
    (v_ed, true, 'GERAL', 5, 'PONTUACAO_DISCIPLINA', 'Língua Portuguesa'),
    (v_ed, true, 'GERAL', 6, 'MAIOR_PONTOS_TITULOS', NULL),
    (v_ed, true, 'GERAL', 7, 'MAIOR_IDADE', NULL);
  SELECT string_agg(ordem_prioridade::text, ',' ORDER BY ordem_prioridade) INTO v_ordens
    FROM public.criterios_desempate WHERE edital_id = v_ed AND lista = 'GERAL';
  RAISE NOTICE 'CASO 1 (ordem do Edital 002) [%]  %', v_ordens,
    CASE WHEN v_ordens = '1,2,3,4,5,6,7' THEN 'OK' ELSE '🔴 FALHOU' END;

  -- CASO 1b — ⭐ CONTROLE POSITIVO: a lista de PCD, idêntica nos três editais.
  INSERT INTO public.criterios_desempate
    (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo) VALUES
    (v_ed, true, 'PCD', 1, 'ARRIMO_FAMILIA'),
    (v_ed, true, 'PCD', 2, 'MAIS_DEPENDENTES_ATE_21'),
    (v_ed, true, 'PCD', 3, 'SEM_FONTE_DE_RENDA');
  SELECT count(*) INTO v_n FROM public.criterios_desempate WHERE edital_id = v_ed AND lista='PCD';
  RAISE NOTICE 'CASO 1b (lista de PCD, Leis 3.113/94 e 3.221/95) n=%  %', v_n,
    CASE WHEN v_n = 3 THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ══ 🔴 UM DESEMPATE QUE EMPATA ════════════════════════════════════════════════════
  -- CASO 2 — dois critérios na MESMA posição.
  -- ⚠️ É o caso que um `UNIQUE (edital_id, lista, cargo_id, ordem)` comum deixaria passar:
  -- em Postgres nulos são DISTINTOS, e nos três editais reais `cargo_id` É nulo. Daí o
  -- índice PARCIAL.
  BEGIN
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_ed, true, 'GERAL', 3, 'MAIOR_IDADE');
    RAISE NOTICE 'CASO 2 🔴 FALHOU — dois critérios na 3ª posição. O desempate empata.';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (posição repetida) RECUSADA por %  %', v_con,
      CASE WHEN v_con='criterios_desempate_geral_ordem_key' THEN 'OK — e foi o índice PARCIAL'
           ELSE '🔴 outra regra' END;
  END;

  -- CASO 2b — ⭐ CONTROLE POSITIVO: a mesma posição na OUTRA lista é legítima.
  -- A lista de PCD tem a sua própria 1ª posição, e já entrou no CASO 1b.
  RAISE NOTICE 'CASO 2b (mesma posição em lista diferente) OK — provado no CASO 1b';

  -- CASO 2c — ⭐ CONTROLE: a mesma posição em OUTRO edital entra.
  DECLARE v_ed2 uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria des 2 ' || gen_random_uuid())
      RETURNING id INTO v_ed2;
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_ed2, true, 'GERAL', 1, 'IDADE_60_MAIS');
    RAISE NOTICE 'CASO 2c (mesma posição, outro edital) OK';
  END;

  -- CASO 3 — posição ZERO ou negativa. A ordem publicada começa em 1º.
  BEGIN
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_ed, true, 'GERAL', 0, 'MAIOR_IDADE');
    RAISE NOTICE 'CASO 3 (posição 0) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3 (posição 0) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_desempate_ordem' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- ══ 🎯 O QUE O ROADMAP PEDIU EXPLICITAMENTE ═══════════════════════════════════════
  -- CASO 4 — critério de disciplina SEM disciplina.
  BEGIN
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_ed, true, 'GERAL', 8, 'PONTUACAO_DISCIPLINA');
    RAISE NOTICE 'CASO 4 🔴 FALHOU — "maior pontuação em ___" entrou sem a disciplina';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (disciplina obrigatória) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_desempate_disciplina' THEN 'OK — e é CHECK, não validação de tela'
           ELSE '🔴 outra regra' END;
  END;

  -- CASO 4b — 🔴 E O OUTRO LADO DA BICONDICIONAL: disciplina num critério que não é de
  -- disciplina. "Maior idade — Língua Portuguesa" não quer dizer nada, e a tela
  -- renderizaria as duas coisas sem erro.
  BEGIN
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo, disciplina_referencia)
    VALUES (v_ed, true, 'GERAL', 8, 'MAIOR_IDADE', 'Língua Portuguesa');
    RAISE NOTICE 'CASO 4b 🔴 FALHOU — disciplina num critério que não a usa';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4b (disciplina onde não cabe) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_desempate_disciplina' THEN 'OK — a CHECK é BICONDICIONAL'
           ELSE '🔴 outra regra' END;
  END;

  -- ══ O TIPO TEM DE PERTENCER À LISTA ═══════════════════════════════════════════════
  -- CASO 5 — 🔴 "arrimo de família" na lista GERAL seria a regra de PCD aplicada a todo
  -- mundo, e ninguém notaria: as duas saem em parágrafos diferentes do mesmo capítulo.
  BEGIN
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_ed, true, 'GERAL', 9, 'ARRIMO_FAMILIA');
    RAISE NOTICE 'CASO 5 🔴 FALHOU — critério de PCD entrou na lista geral';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5 (critério de PCD na lista geral) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_desempate_tipo_da_lista' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 5b — e o inverso: critério geral na lista de PCD.
  BEGIN
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_ed, true, 'PCD', 9, 'FUNCAO_JURADO');
    RAISE NOTICE 'CASO 5b 🔴 FALHOU — critério geral entrou na lista de PCD';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5b (critério geral na lista de PCD) RECUSADO por %  OK', v_con;
  END;

  -- CASO 5c — lista fora do domínio.
  BEGIN
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_ed, true, 'COTAS_RACIAIS', 9, 'MAIOR_IDADE');
    RAISE NOTICE 'CASO 5c 🔴 FALHOU — lista inventada entrou';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 5c (lista fora do domínio) RECUSADA  OK';
  END;

  -- ══ 🔴 PROVA DE AUSÊNCIA ══════════════════════════════════════════════════════════
  -- CASO 6 — disciplina que a matriz da prova NÃO conhece ENTRA.
  -- Barrar isso exigiria FK para `provas_disciplinas`, que pende de `edital_cargo_id` e
  -- obrigaria todo critério a ter cargo — quebrando a lista comum, que é o que os três
  -- editais publicam. Quem acusa é `edital-desempate.ts`. Se alguém puser a FK, este caso
  -- avisa.
  INSERT INTO public.criterios_desempate
    (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo, disciplina_referencia)
  VALUES (v_ed, true, 'GERAL', 9, 'PONTUACAO_DISCIPLINA', 'Disciplina que não existe na prova');
  RAISE NOTICE 'CASO 6 (disciplina fora da matriz) ACEITA — é regra de linter, não do banco';

  -- ══ O ESCOPO ══════════════════════════════════════════════════════════════════════
  -- CASO 7 — "vale para todos" e "esqueci de escolher" não podem ser o mesmo estado.
  BEGIN
    INSERT INTO public.criterios_desempate (edital_id, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_ed, 'GERAL', 10, 'MAIOR_IDADE');
    RAISE NOTICE 'CASO 7 🔴 FALHOU — entrou sem escopo declarado';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 7 (sem escopo) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_desempate_escopo' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 7b — ⭐ CONTROLE POSITIVO: lista POR CARGO convive com a geral na mesma posição.
  -- ⚠️ Nenhum dos três editais faz isso; entra porque a numeração do documento — 14.5.1 —
  -- antecipa um 14.5.2. É o índice parcial por cargo que o permite.
  INSERT INTO public.criterios_desempate
    (edital_id, cargo_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
  VALUES (v_ed, v_cargo, false, 'GERAL', 1, 'MAIOR_IDADE');
  RAISE NOTICE 'CASO 7b (lista por cargo, mesma posição da geral) OK';

  -- ══ RLS ═══════════════════════════════════════════════════════════════════════════
  -- CASO 8 — não-admin autenticado NÃO escreve.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 8 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.criterios_desempate
        (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
      VALUES (v_ed, true, 'GERAL', 20, 'MAIOR_IDADE');
      RESET ROLE;
      RAISE NOTICE 'CASO 8 (não-admin insere) 🔴 FALHOU — a RLS deixou passar';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 8 (não-admin insere) RECUSADO por % OK', SQLSTATE;
    END;
  END IF;

  -- CASO 9 — ⭐ CONTROLE POSITIVO: admin escreve.
  IF v_admin IS NULL THEN
    RAISE NOTICE 'CASO 9 NÃO EXERCITADO — não há admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.criterios_desempate
        (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
      VALUES (v_ed, true, 'GERAL', 21, 'MAIOR_IDADE');
      RESET ROLE;
      RAISE NOTICE 'CASO 9 (admin insere) OK';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 9 (admin insere) 🔴 FALHOU — a policy travou o admin';
    END;
  END IF;

  -- ══ FK RESTRICT ═══════════════════════════════════════════════════════════════════
  -- CASO 10 — apagar edital com critérios é recusado PELA FK DOS CRITÉRIOS.
  -- ⚠️ Edital LIMPO: num edital existente quem barraria seria `provas_edital_id_fkey`.
  DECLARE v_limpo uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria des limpo ' || gen_random_uuid())
      RETURNING id INTO v_limpo;
    INSERT INTO public.criterios_desempate
      (edital_id, aplica_a_todos_os_cargos, lista, ordem_prioridade, criterio_tipo)
    VALUES (v_limpo, true, 'GERAL', 1, 'MAIOR_IDADE');
    BEGIN
      DELETE FROM public.editais WHERE id = v_limpo;
      RAISE NOTICE 'CASO 10 🔴 FALHOU — os critérios sumiram junto';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 10 (apagar edital com critérios) RECUSADO por %  %', v_con,
        CASE WHEN v_con='criterios_desempate_edital_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;
  END;
END $$;

ROLLBACK;

SELECT 'CASO 11' AS caso,
       (SELECT count(*) FROM public.criterios_desempate) AS linhas_apos_rollback,
       'esperado 0' AS veredito;
