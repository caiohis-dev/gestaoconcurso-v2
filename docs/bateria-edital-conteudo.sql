-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 10: conteúdo programático
-- migration 20260917115000_editais_conteudo_programatico
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ O CRUZAMENTO com a matriz da prova NÃO se testa aqui, e é a regra central da fatia:
-- ele compara NOMES entre duas tabelas e não cabe em CHECK. Está em
-- `src/lib/edital-conteudo.ts`, com o "LESGISLAÇÃO DO SUS" do Edital 003 como fixture.
-- O CASO 5 aqui prova a ausência: o banco aceita o nome divergente.
--
-- Rodar:  docker exec -i <supabase_db> psql -U postgres -d postgres < docs/bateria-edital-conteudo.sql

\set ON_ERROR_STOP off
BEGIN;

SELECT 'CASO 0' AS caso, c.relname, count(p.polname) AS policies, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       CASE WHEN count(p.polname)=4 AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid,'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname = 'conteudo_programatico'
GROUP BY c.relname, c.relrowsecurity, c.oid;

DO $$
DECLARE
  v_ed uuid; v_c_enf uuid; v_c_tec uuid; v_con text; v_admin uuid; v_comum uuid; v_n int;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='admin'::app_role LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id=u.id AND r.role IN ('admin'::app_role,'superadmin'::app_role))
   LIMIT 1;

  INSERT INTO public.editais (nome) VALUES ('ZZZ bateria conteudo ' || gen_random_uuid())
    RETURNING id INTO v_ed;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA CONT ENFERMEIRO') RETURNING id INTO v_c_enf;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA CONT TECNICO ENF') RETURNING id INTO v_c_tec;

  -- ══ ⭐ CONTROLE POSITIVO: o Anexo I do Edital 003 ══════════════════════════════════
  -- 🔴 Ele tem 6 blocos publicados, e vira 4 LINHAS: Português e SUS são IDÊNTICOS byte a
  -- byte entre os dois cargos (1049 e 619 caracteres), então são "comuns a todos". Só os
  -- Conhecimentos Específicos diferem. A repetição do documento é redundância, não
  -- informação — e foi ela que propagou o erro de digitação do CASO 5.
  INSERT INTO public.conteudo_programatico
    (edital_id, cargo_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa, ordem) VALUES
    (v_ed, NULL, true, 'Língua Portuguesa', 'Compreensão e interpretação de textos. Tipologia e gêneros textuais.', 0),
    (v_ed, NULL, true, 'Legislação do SUS', 'Lei nº 8.080/1990 – princípios, diretrizes, organização e gestão do SUS.', 1),
    (v_ed, v_c_enf, false, 'Conhecimentos Específicos', 'Ementa do Enfermeiro.', 2),
    (v_ed, v_c_tec, false, 'Conhecimentos Específicos', 'Ementa do Técnico em Enfermagem.', 3);
  SELECT count(*) INTO v_n FROM public.conteudo_programatico WHERE edital_id = v_ed;
  RAISE NOTICE 'CASO 1 (Anexo I do 003: 2 comuns + 2 específicas) n=%  %', v_n,
    CASE WHEN v_n = 4 THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ══ OS DOIS ÍNDICES PARCIAIS ══════════════════════════════════════════════════════
  -- CASO 2 — 🔴 A DISCIPLINA COMUM REPETIDA. É o caso que um `UNIQUE` comum deixaria
  -- passar: em Postgres nulos são DISTINTOS, então `UNIQUE (edital_id, cargo_id, nome)`
  -- aceitaria duas "Língua Portuguesa" com `cargo_id` nulo. Daí o índice PARCIAL.
  BEGIN
    INSERT INTO public.conteudo_programatico
      (edital_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
    VALUES (v_ed, true, '  LÍNGUA PORTUGUESA  ', 'Ementa duplicada.');
    RAISE NOTICE 'CASO 2 🔴 FALHOU — duas ementas comuns da mesma disciplina entraram';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (disciplina comum repetida, outra caixa) RECUSADA por %  %', v_con,
      CASE WHEN v_con='conteudo_programatico_comum_key' THEN 'OK — e foi o índice PARCIAL'
           ELSE '🔴 outra regra' END;
  END;

  -- CASO 2b — a mesma disciplina repetida NO MESMO cargo.
  BEGIN
    INSERT INTO public.conteudo_programatico
      (edital_id, cargo_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
    VALUES (v_ed, v_c_enf, false, 'conhecimentos específicos', 'Outra ementa.');
    RAISE NOTICE 'CASO 2b 🔴 FALHOU — disciplina repetida no mesmo cargo entrou';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2b (repetida no mesmo cargo) RECUSADA por %  %', v_con,
      CASE WHEN v_con='conteudo_programatico_por_cargo_key' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 2c — ⭐ CONTROLE POSITIVO: a MESMA disciplina em OUTRO cargo é o normal.
  -- É exatamente o "Conhecimentos Específicos" do Edital 003, que existe para os dois
  -- cargos com ementas diferentes. Já provado no CASO 1; aqui fica explícito que é o
  -- índice parcial por cargo que o permite.
  RAISE NOTICE 'CASO 2c (mesma disciplina, outro cargo) OK — provado no CASO 1';

  -- CASO 2d — ⭐ CONTROLE: comum e por-cargo com o MESMO nome convivem.
  -- ⚠️ É legítimo e acontece: o Edital 002 tem "LÍNGUA PORTUGUESA (comum a todos)" e
  -- também "DOCENTE I – LÍNGUA PORTUGUESA", que é a específica daquele cargo.
  INSERT INTO public.conteudo_programatico
    (edital_id, cargo_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
  VALUES (v_ed, v_c_enf, false, 'Língua Portuguesa', 'Específica do Enfermeiro.');
  RAISE NOTICE 'CASO 2d (comum + específica do mesmo nome) OK — o 002 faz isso';

  -- ══ O ESCOPO ══════════════════════════════════════════════════════════════════════
  -- CASO 3 — "vale para todos" e "esqueci de escolher" não podem ser o mesmo estado.
  BEGIN
    INSERT INTO public.conteudo_programatico (edital_id, nome_disciplina, texto_ementa)
    VALUES (v_ed, 'Sem escopo', 'Ementa.');
    RAISE NOTICE 'CASO 3 🔴 FALHOU — entrou sem escopo declarado';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3 (sem escopo) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_conteudo_escopo' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 3b — cargo específico marcado como "todos".
  BEGIN
    INSERT INTO public.conteudo_programatico
      (edital_id, cargo_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
    VALUES (v_ed, v_c_tec, true, 'Incoerente', 'Ementa.');
    RAISE NOTICE 'CASO 3b 🔴 FALHOU — cargo E todos ao mesmo tempo';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3b (cargo E todos) RECUSADO por %  OK', v_con;
  END;

  -- ══ EMENTA E DISCIPLINA VAZIAS ════════════════════════════════════════════════════
  -- CASO 4 — 🔴 EMENTA VAZIA É RECUSADA, e aqui a decisão difere da fatia 1 de propósito.
  -- Lá o artigo em branco é aceito porque "Adicionar artigo" cria a linha vazia. Aqui a
  -- ementa só nasce depois de escrita: uma disciplina no anexo sem ementa nenhuma é uma
  -- seção com título e nada embaixo, e o candidato não tem o que estudar.
  BEGIN
    INSERT INTO public.conteudo_programatico
      (edital_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
    VALUES (v_ed, true, 'Matemática', '   ');
    RAISE NOTICE 'CASO 4 🔴 FALHOU — ementa em branco entrou';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (ementa em branco) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_conteudo_ementa' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 4b — disciplina sem nome.
  BEGIN
    INSERT INTO public.conteudo_programatico
      (edital_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
    VALUES (v_ed, true, '  ', 'Ementa.');
    RAISE NOTICE 'CASO 4b 🔴 FALHOU — disciplina sem nome entrou';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4b (disciplina sem nome) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_conteudo_disciplina' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- ══ 🔴 O DEFEITO PUBLICADO, E A PROVA DE QUE O BANCO NÃO O BARRA ══════════════════
  -- CASO 5 — "LESGISLAÇÃO DO SUS" entra sem reclamação.
  -- É o erro real do Anexo I do Edital 003, onde o corpo diz "Legislação do SUS". Barrar
  -- isso no banco exigiria FK para `provas_disciplinas` — que pende de `edital_cargo_id` e
  -- obrigaria toda ementa a ter cargo, quebrando a ementa COMUM. Quem acusa é o linter.
  -- ⚠️ Se alguém puser essa FK um dia, este caso avisa.
  INSERT INTO public.conteudo_programatico
    (edital_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
  VALUES (v_ed, true, 'LESGISLAÇÃO DO SUS', 'O erro de digitação do Edital 003, publicado.');
  RAISE NOTICE 'CASO 5 (nome divergente da matriz) ACEITO — é regra de linter, não do banco';

  -- ══ RLS ═══════════════════════════════════════════════════════════════════════════
  -- CASO 6 — não-admin autenticado NÃO escreve.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 6 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.conteudo_programatico
        (edital_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
      VALUES (v_ed, true, 'Escrita indevida', 'x');
      RESET ROLE;
      RAISE NOTICE 'CASO 6 (não-admin insere) 🔴 FALHOU — a RLS deixou passar';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 6 (não-admin insere) RECUSADO por % OK', SQLSTATE;
    END;
  END IF;

  -- CASO 7 — ⭐ CONTROLE POSITIVO: admin escreve.
  IF v_admin IS NULL THEN
    RAISE NOTICE 'CASO 7 NÃO EXERCITADO — não há admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.conteudo_programatico
        (edital_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
      VALUES (v_ed, true, 'Escrita do admin', 'x');
      RESET ROLE;
      RAISE NOTICE 'CASO 7 (admin insere) OK';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 7 (admin insere) 🔴 FALHOU — a policy travou o admin';
    END;
  END IF;

  -- ══ FK RESTRICT ═══════════════════════════════════════════════════════════════════
  -- CASO 8 — apagar edital com ementa é recusado PELA FK DA EMENTA.
  -- ⚠️ Edital LIMPO: num edital existente quem barraria seria `provas_edital_id_fkey`.
  DECLARE v_limpo uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria cont limpo ' || gen_random_uuid())
      RETURNING id INTO v_limpo;
    INSERT INTO public.conteudo_programatico
      (edital_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
    VALUES (v_limpo, true, 'Língua Portuguesa', 'Ementa.');
    BEGIN
      DELETE FROM public.editais WHERE id = v_limpo;
      RAISE NOTICE 'CASO 8 🔴 FALHOU — a ementa sumiu junto';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 8 (apagar edital com ementa) RECUSADO por %  %', v_con,
        CASE WHEN v_con='conteudo_programatico_edital_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;
  END;

  -- CASO 9 — cargo com ementa própria não se apaga.
  -- ⚠️ Cargo criado AQUI e fora de `edital_cargos`: com o Enfermeiro, quem barraria seria
  -- `edital_cargos_cargo_id_fkey`, e o caso passaria verde sem tocar na FK deste módulo.
  -- É o mesmo defeito que o CASO 10 da bateria de investidura teve.
  DECLARE v_c_solto uuid;
  BEGIN
    INSERT INTO public.cargos (nome) VALUES ('BATERIA CONT CARGO SOLTO') RETURNING id INTO v_c_solto;
    INSERT INTO public.conteudo_programatico
      (edital_id, cargo_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa)
    VALUES (v_ed, v_c_solto, false, 'Específica', 'Ementa.');
    BEGIN
      DELETE FROM public.cargos WHERE id = v_c_solto;
      RAISE NOTICE 'CASO 9 🔴 FALHOU — apagou o cargo com ementa';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 9 (apagar cargo com ementa) RECUSADO por %  %', v_con,
        CASE WHEN v_con='conteudo_programatico_cargo_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;
  END;
END $$;

ROLLBACK;

SELECT 'CASO 10' AS caso,
       (SELECT count(*) FROM public.conteudo_programatico) AS linhas_apos_rollback,
       'esperado 0' AS veredito;
