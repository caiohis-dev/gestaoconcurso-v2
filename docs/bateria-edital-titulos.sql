-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 6: a prova de títulos
-- migration 20260916234302_editais_prova_de_titulos
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ A SOMA dos pontos contra o teto NÃO se testa aqui, e não é esquecimento: ela não é
-- CHECK, pela mesma razão da fatia 5 — agregação de outra tabela não cabe numa CHECK, e
-- um trigger recusaria a digitação no meio do caminho. Ela é `src/lib/edital-titulos.ts`,
-- com os Quadros III e IV reais como fixture. O CASO 12 aqui PROVA que o banco não barra.
--
-- Aqui ficam as barreiras do BANCO. Casos de permissão usam `set_config(..., true)` +
-- `SET LOCAL ROLE authenticated`.
--
-- Rodar:  docker exec -i <supabase_db> psql -U postgres -d postgres < docs/bateria-edital-titulos.sql

\set ON_ERROR_STOP off
BEGIN;

SELECT 'CASO 0' AS caso, c.relname, count(p.polname) AS policies, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       CASE WHEN count(p.polname)=4 AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid,'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('titulos_config','titulos_itens')
GROUP BY c.relname, c.relrowsecurity, c.oid ORDER BY 1;

DO $$
DECLARE
  v_edital uuid; v_cargo uuid; v_ec uuid; v_cargo2 uuid; v_ec2 uuid;
  v_con text; v_admin uuid; v_comum uuid; v_soma numeric;
BEGIN
  SELECT id INTO v_edital FROM public.editais ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='admin'::app_role LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id=u.id AND r.role IN ('admin'::app_role,'superadmin'::app_role))
   LIMIT 1;

  INSERT INTO public.cargos (nome) VALUES ('BATERIA TITULOS DOCENTE I ARTE') RETURNING id INTO v_cargo;
  INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo) RETURNING id INTO v_ec;

  -- ══ CONTROLE POSITIVO COM DADO REAL ═══════════════════════════════════════════════
  -- CASO 1 — ⭐ O QUADRO III do Edital 002/2026, item a item, como publicado.
  INSERT INTO public.titulos_config
    (edital_id, teto_maximo_pontos, carater_classificatorio, exige_historico_escolar,
     exige_reconhecimento_mec_cne, dias_conclusao_antes_fim_inscricoes,
     exige_traducao_juramentada, exige_revalidacao_diploma_estrangeiro)
  VALUES (v_edital, 12, true, true, true, 30, true, true);

  INSERT INTO public.titulos_itens
    (edital_cargo_id, ordem, nivel, descricao, area_exigida, carga_horaria_minima_horas,
     pontos_minimo, pontos_maximo) VALUES
    (v_ec, 0, 'MESTRADO_PROFISSIONAL',
     'Diploma/Certificado de conclusão de curso de pós-graduação (stricto sensu) em nível de Mestrado Profissional, acompanhado obrigatoriamente do respectivo histórico escolar.',
     'Área do Componente Curricular a que concorre', NULL, 5, 5),
    (v_ec, 1, 'ESPECIALIZACAO_LATO_SENSU',
     'Diploma/Certificado de conclusão de curso de pós-graduação (lato sensu), em nível de especialização, acompanhado obrigatoriamente do respectivo histórico escolar.',
     'Tecnologias Digitais na Educação', 360, 4, 4),
    (v_ec, 2, 'ESPECIALIZACAO_LATO_SENSU',
     'Diploma/Certificado de conclusão de curso de pós-graduação (lato sensu), em nível de especialização, acompanhado obrigatoriamente do respectivo histórico escolar.',
     'Educação Inclusiva', 360, 3, 3);

  SELECT sum(pontos_maximo) INTO v_soma FROM public.titulos_itens WHERE edital_cargo_id = v_ec;
  RAISE NOTICE 'CASO 1 (Quadro III real: 5+4+3) soma=%  %', v_soma,
    CASE WHEN v_soma = 12 THEN 'OK — bate com o teto de 12 publicado' ELSE '🔴 FALHOU' END;

  -- CASO 1b — ⭐ O QUADRO IV, noutro cargo. Mesmos pontos, áreas diferentes: é o par que
  -- mostra que o modelo separa os dois quadros sem caso especial.
  INSERT INTO public.cargos (nome) VALUES ('BATERIA TITULOS DOCENTE II') RETURNING id INTO v_cargo2;
  INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo2) RETURNING id INTO v_ec2;
  INSERT INTO public.titulos_itens
    (edital_cargo_id, ordem, nivel, descricao, area_exigida, carga_horaria_minima_horas,
     pontos_minimo, pontos_maximo) VALUES
    (v_ec2, 0, 'MESTRADO_PROFISSIONAL', 'Mestrado Profissional com histórico escolar.',
     'Docência na Educação Básica', NULL, 5, 5),
    (v_ec2, 1, 'ESPECIALIZACAO_LATO_SENSU', 'Especialização com histórico escolar.',
     'Alfabetização e Letramento em Educação Infantil', 360, 4, 4),
    (v_ec2, 2, 'ESPECIALIZACAO_LATO_SENSU', 'Especialização com histórico escolar.',
     'Educação Inclusiva', 360, 3, 3);
  RAISE NOTICE 'CASO 1b (Quadro IV, outro cargo) OK — os dois quadros convivem';

  -- CASO 1c — ⭐ CONTROLE POSITIVO: cargo SEM nenhum título é estado legítimo.
  -- É como o item 13.2 ("a pontuação só ocorrerá para Docente I e Docente II") acontece
  -- sozinho, sem coluna `tem_titulos` para alguém esquecer de marcar.
  DECLARE v_cargo3 uuid; v_ec3 uuid; v_n int;
  BEGIN
    INSERT INTO public.cargos (nome) VALUES ('BATERIA TITULOS SEM TITULOS') RETURNING id INTO v_cargo3;
    INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo3) RETURNING id INTO v_ec3;
    SELECT count(*) INTO v_n FROM public.titulos_itens WHERE edital_cargo_id = v_ec3;
    RAISE NOTICE 'CASO 1c (cargo sem títulos) n=%  %', v_n,
      CASE WHEN v_n = 0 THEN 'OK — aplicabilidade implícita' ELSE '🔴 FALHOU' END;
  END;

  -- ══ AS CHECKS DE `titulos_itens` ══════════════════════════════════════════════════
  -- CASO 2 — título que vale ZERO ponto é linha que ocupa o quadro e não pontua ninguém.
  BEGIN
    INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, pontos_minimo, pontos_maximo)
    VALUES (v_ec, 'DOUTORADO', 'Título que não vale nada.', 0, 0);
    RAISE NOTICE 'CASO 2 (título de 0 ponto) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (título de 0 ponto) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_titulo_pontos_positivos' THEN 'OK' ELSE '🔴 outra regra barrou' END;
  END;

  -- CASO 3 — mínimo ACIMA do máximo: o par invertido, que a tela renderizaria sem erro.
  BEGIN
    INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, pontos_minimo, pontos_maximo)
    VALUES (v_ec, 'DOUTORADO', 'Mínimo maior que o máximo.', 9, 4);
    RAISE NOTICE 'CASO 3 (mínimo > máximo) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3 (mínimo > máximo) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_titulo_pontos_coerentes' THEN 'OK' ELSE '🔴 outra regra barrou' END;
  END;

  -- CASO 3b — ⚠️ FRONTEIRA REGISTRADA E NÃO EXERCITADA PELO MUNDO: mínimo < máximo.
  -- Nos 6 itens reais do Edital 002 as duas colunas são IGUAIS, então a diferença entre
  -- elas não é exercitada por dado nenhum que temos. O banco permite — e este caso existe
  -- para que, no dia em que um edital as diferenciar, se saiba que o modelo já cabia.
  INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, pontos_minimo, pontos_maximo)
  VALUES (v_ec, 'DOUTORADO', 'Faixa de pontos, não valor fixo.', 2, 6);
  RAISE NOTICE 'CASO 3b (mínimo < máximo) OK — permitido, e nenhum edital real o usa';

  -- CASO 4 — nível fora do domínio.
  BEGIN
    INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, pontos_minimo, pontos_maximo)
    VALUES (v_ec, 'POS_DOUTORADO', 'Nível inventado.', 1, 1);
    RAISE NOTICE 'CASO 4 (nível fora do domínio) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (nível fora do domínio) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_titulo_nivel' THEN 'OK' ELSE '🔴 outra regra barrou' END;
  END;

  -- CASO 4b — ⭐ CONTROLE POSITIVO: os DOIS níveis que nenhum edital real usa entram.
  -- Sem este caso, o domínio poderia ter sido estreitado aos 2 valores medidos sem que
  -- nada acusasse — e o primeiro edital com doutorado bateria num muro.
  INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, pontos_minimo, pontos_maximo)
  VALUES (v_ec, 'MESTRADO_ACADEMICO', 'Mestrado acadêmico.', 1, 1);
  RAISE NOTICE 'CASO 4b (DOUTORADO e MESTRADO_ACADEMICO aceitos) OK — domínio maior que o medido';

  -- CASO 5 — descrição vazia: é a coluna "Títulos Aferíveis" do quadro publicado.
  BEGIN
    INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, pontos_minimo, pontos_maximo)
    VALUES (v_ec, 'DOUTORADO', '   ', 1, 1);
    RAISE NOTICE 'CASO 5 (descrição vazia) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5 (descrição em branco) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_titulo_descricao' THEN 'OK' ELSE '🔴 outra regra barrou' END;
  END;

  -- CASO 6 — carga horária ZERO é engano; NULL é legítimo (o mestrado não declara CH).
  BEGIN
    INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, carga_horaria_minima_horas, pontos_minimo, pontos_maximo)
    VALUES (v_ec, 'ESPECIALIZACAO_LATO_SENSU', 'CH zero.', 0, 1, 1);
    RAISE NOTICE 'CASO 6 (carga horária 0) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 6 (carga horária 0) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_titulo_carga_horaria' THEN 'OK' ELSE '🔴 outra regra barrou' END;
  END;
  RAISE NOTICE 'CASO 6b (carga horária NULL) OK — já provado no CASO 1, o mestrado não a declara';

  -- ══ AS CHECKS DE `titulos_config` ═════════════════════════════════════════════════
  -- CASO 7 — teto ZERO: capítulo ligado em que nenhum título pode pontuar.
  DECLARE v_limpo2 uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria titulos teto ' || gen_random_uuid())
    RETURNING id INTO v_limpo2;
    BEGIN
      INSERT INTO public.titulos_config (edital_id, teto_maximo_pontos) VALUES (v_limpo2, 0);
      RAISE NOTICE 'CASO 7 (teto 0) 🔴 FALHOU — foi aceito';
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 7 (teto 0) RECUSADO por %  %', v_con,
        CASE WHEN v_con='chk_titulos_teto' THEN 'OK' ELSE '🔴 outra regra barrou' END;
    END;
    -- CASO 7b — dias NEGATIVOS recusados; ZERO permitido (concluir até o fim das inscrições).
    BEGIN
      INSERT INTO public.titulos_config (edital_id, dias_conclusao_antes_fim_inscricoes)
      VALUES (v_limpo2, -1);
      RAISE NOTICE 'CASO 7b (dias negativos) 🔴 FALHOU — foi aceito';
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 7b (dias negativos) RECUSADO por %  %', v_con,
        CASE WHEN v_con='chk_titulos_dias' THEN 'OK' ELSE '🔴 outra regra barrou' END;
    END;
    INSERT INTO public.titulos_config (edital_id, dias_conclusao_antes_fim_inscricoes)
    VALUES (v_limpo2, 0);
    RAISE NOTICE 'CASO 7c (0 dias) OK — "até o fim das inscrições" é regra válida';
  END;

  -- CASO 8 — a config é UMA por edital: a PK não deixa a segunda entrar.
  BEGIN
    INSERT INTO public.titulos_config (edital_id, teto_maximo_pontos) VALUES (v_edital, 20);
    RAISE NOTICE 'CASO 8 (segunda config no mesmo edital) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 8 (segunda config no mesmo edital) RECUSADA por %  OK', v_con;
  END;

  -- ══ A SOMA NÃO É BARREIRA DE BANCO ════════════════════════════════════════════════
  -- CASO 9 — 🔴 PROVA DA AUSÊNCIA, e é o caso mais importante daqui.
  -- Os títulos deste cargo já somam mais que o teto de 12, e o banco ACEITA. Se um dia
  -- alguém puser um trigger para "resolver" isto, este caso acusa — e quem monta o quadro
  -- perde a capacidade de digitar um título por vez. Quem confere é o linter.
  SELECT sum(pontos_maximo) INTO v_soma FROM public.titulos_itens WHERE edital_cargo_id = v_ec;
  RAISE NOTICE 'CASO 9 (soma % > teto 12, aceita pelo banco)  %', v_soma,
    CASE WHEN v_soma > 12 THEN 'OK — a soma é do linter, não do banco' ELSE '🔴 esperava soma acima do teto' END;

  -- ══ RLS ═══════════════════════════════════════════════════════════════════════════
  -- CASO 10 — não-admin autenticado NÃO escreve.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 10 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, pontos_minimo, pontos_maximo)
      VALUES (v_ec, 'DOUTORADO', 'Escrita indevida.', 1, 1);
      RESET ROLE;
      RAISE NOTICE 'CASO 10 (não-admin insere título) 🔴 FALHOU — a RLS deixou passar';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 10 (não-admin insere título) RECUSADO por % OK', SQLSTATE;
    END;
  END IF;

  -- CASO 11 — ⭐ CONTROLE POSITIVO: admin autenticado ESCREVE. Sem ele, o CASO 10
  -- passaria verde com a tabela simplesmente inacessível para todo mundo.
  IF v_admin IS NULL THEN
    RAISE NOTICE 'CASO 11 NÃO EXERCITADO — não há admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.titulos_itens (edital_cargo_id, nivel, descricao, pontos_minimo, pontos_maximo)
      VALUES (v_ec, 'DOUTORADO', 'Escrita legítima do admin.', 1, 1);
      RESET ROLE;
      RAISE NOTICE 'CASO 11 (admin insere título) OK';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 11 (admin insere título) 🔴 FALHOU — a policy travou o admin';
    END;
  END IF;

  -- ══ FK RESTRICT ═══════════════════════════════════════════════════════════════════
  -- CASO 12 — cargo do edital com título não se apaga.
  BEGIN
    DELETE FROM public.edital_cargos WHERE id = v_ec;
    RAISE NOTICE 'CASO 12 (apagar cargo com título) 🔴 FALHOU — os títulos sumiram junto';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 12 (apagar cargo com título) RECUSADO por %  %', v_con,
      CASE WHEN v_con='titulos_itens_edital_cargo_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
           ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
  END;

  -- CASO 13 — apagar edital com config de títulos é recusado PELA FK DA CONFIG.
  --
  -- ⚠️ Edital LIMPO, criado aqui. Num edital existente a recusa viria de
  -- `provas_edital_id_fkey` e o caso passaria "verde" sem exercitar nada — foi
  -- exatamente o defeito da primeira versão do CASO 3 da bateria de capítulos.
  DECLARE v_limpo uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria titulos ' || gen_random_uuid())
    RETURNING id INTO v_limpo;
    INSERT INTO public.titulos_config (edital_id, teto_maximo_pontos) VALUES (v_limpo, 12);
    BEGIN
      DELETE FROM public.editais WHERE id = v_limpo;
      RAISE NOTICE 'CASO 13 (apagar edital com config) 🔴 FALHOU — a config sumiu junto';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 13 (apagar edital com config) RECUSADO por %  %', v_con,
        CASE WHEN v_con='titulos_config_edital_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;
  END;
END $$;

ROLLBACK;

SELECT 'CASO 14' AS caso,
       (SELECT count(*) FROM public.titulos_itens)
     + (SELECT count(*) FROM public.titulos_config) AS linhas_apos_rollback,
       'esperado 0' AS veredito;
