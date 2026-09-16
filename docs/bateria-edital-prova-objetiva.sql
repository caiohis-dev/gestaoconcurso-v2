-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 5: a matriz da prova objetiva
-- migration 20260916194709_editais_prova_objetiva
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ A SOMA das disciplinas × o total NÃO se testa aqui, e não é esquecimento: ela não é
-- CHECK. Não dá para expressar agregação de outra tabela numa CHECK, e um trigger
-- recusaria a digitação no meio do caminho — quem monta a matriz preenche uma disciplina
-- por vez, e o estado intermediário é legítimo. A soma é `src/lib/edital-prova.ts`, com
-- as três composições reais como fixture.
--
-- Aqui ficam as barreiras do BANCO.

\set ON_ERROR_STOP off
BEGIN;

SELECT 'CASO 0' AS caso, c.relname, count(p.polname) AS policies, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       CASE WHEN count(p.polname)=4 AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid,'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('provas_objetivas_config','provas_disciplinas','regras_vista_prova')
GROUP BY c.relname, c.relrowsecurity, c.oid ORDER BY 1;

DO $$
DECLARE v_edital uuid; v_cargo uuid; v_ec uuid; v_con text;
BEGIN
  SELECT id INTO v_edital FROM public.editais ORDER BY created_at LIMIT 1;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA PROVA ENFERMEIRO') RETURNING id INTO v_cargo;
  INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo) RETURNING id INTO v_ec;

  -- CASO 1 — ⭐ CONTROLE POSITIVO: a matriz REAL do Edital 003 (Enfermeiro).
  INSERT INTO public.provas_objetivas_config
    (edital_cargo_id, total_questoes, duracao_minutos, tempo_minimo_permanencia_minutos,
     tempo_minimo_levar_caderno_minutos, nota_corte_percentual, permite_zerar_disciplina)
  VALUES (v_ec, 70, 180, 60, 120, 50, false);
  INSERT INTO public.provas_disciplinas (edital_cargo_id, nome_disciplina, quantidade_questoes, ordem) VALUES
    (v_ec,'Língua Portuguesa',10,1), (v_ec,'Legislação do SUS',10,2), (v_ec,'Conhecimentos Específicos',50,3);
  RAISE NOTICE 'CASO 1 (matriz real do Edital 003: 70 = 10+10+50) OK';

  -- CASO 2 — a mesma disciplina duas vezes no mesmo cargo: CAIXA e ESPAÇO normalizados.
  BEGIN
    INSERT INTO public.provas_disciplinas (edital_cargo_id, nome_disciplina, quantidade_questoes)
    VALUES (v_ec, '  LÍNGUA PORTUGUESA  ', 5);
    RAISE NOTICE 'CASO 2 (disciplina repetida, outra caixa) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (disciplina repetida, outra caixa) RECUSADO por %  %', v_con,
      CASE WHEN v_con='provas_disciplinas_cargo_nome_key' THEN 'OK — normaliza caixa e espaço' ELSE '🔴 outra regra' END;
  END;

  -- CASO 2a — ⚠️ O LIMITE DA REGRA, e ele é REAL: ACENTO NÃO é normalizado.
  --
  -- 'lingua portuguesa' e 'Língua Portuguesa' são disciplinas DIFERENTES para o índice, e
  -- as duas entram. Isto não é defeito desta migration: é o mesmo comportamento de
  -- `cargos_nome_chave_key`, que também só faz `lower(btrim(...))`. A alternativa seria
  -- dobrar acento com `translate`, como faz `colab_nome_busca` — mas ali é BUSCA, e aqui
  -- seria IDENTIDADE: fundir por acento pode juntar nomes legitimamente distintos.
  --
  -- 🔴 A primeira versão deste caso usava 'lingua' sem acento e AFIRMAVA que seria
  -- recusado. Passava como falha e mentia sobre o que o sistema protege — quem lesse a
  -- bateria suporia uma garantia inexistente. Fica documentado como limite, não como bug.
  INSERT INTO public.provas_disciplinas (edital_cargo_id, nome_disciplina, quantidade_questoes)
  VALUES (v_ec, 'lingua portuguesa', 5);
  RAISE NOTICE 'CASO 2a (acento NÃO é normalizado) OK — limite conhecido, igual a cargos_nome_chave';

  -- CASO 2b — ⭐ CONTROLE POSITIVO: a MESMA disciplina em OUTRO cargo é permitida.
  DECLARE v_cargo2 uuid; v_ec2 uuid;
  BEGIN
    INSERT INTO public.cargos (nome) VALUES ('BATERIA PROVA TECNICO') RETURNING id INTO v_cargo2;
    INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo2) RETURNING id INTO v_ec2;
    INSERT INTO public.provas_disciplinas (edital_cargo_id, nome_disciplina, quantidade_questoes)
    VALUES (v_ec2, 'Língua Portuguesa', 10);
    RAISE NOTICE 'CASO 2b (mesma disciplina em outro cargo) OK — o UNIQUE é por cargo';
  END;

  -- CASO 3 — 🔴 levar o caderno DEPOIS do fim da prova é impossível de cumprir.
  BEGIN
    UPDATE public.provas_objetivas_config
       SET tempo_minimo_levar_caderno_minutos = 200 WHERE edital_cargo_id = v_ec; -- prova de 180
    RAISE NOTICE 'CASO 3 (caderno aos 200 min numa prova de 180) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3 (caderno depois do fim) RECUSADO por %  OK', v_con;
  END;

  -- CASO 4 — quantidade de questões zero ou negativa.
  BEGIN
    INSERT INTO public.provas_disciplinas (edital_cargo_id, nome_disciplina, quantidade_questoes)
    VALUES (v_ec, 'Disciplina vazia', 0);
    RAISE NOTICE 'CASO 4 (disciplina com 0 questões) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 4 (disciplina com 0 questões) RECUSADO  OK';
  END;

  -- CASO 5 — vista presencial com e-mail em branco.
  BEGIN
    INSERT INTO public.regras_vista_prova (edital_id, tipo_procedimento, email_solicitacao)
    VALUES (v_edital, 'VISTA_PRESENCIAL_ASSISTIDA', '   ');
    RAISE NOTICE 'CASO 5 (vista presencial sem e-mail) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 5 (vista presencial com e-mail em branco) RECUSADO  OK';
  END;

  -- CASO 5b — ⭐ CONTROLE POSITIVO: os dois regimes de vista convivem.
  INSERT INTO public.regras_vista_prova (edital_id, tipo_procedimento, email_solicitacao, intersticio_minimo_horas)
  VALUES (v_edital, 'VISTA_PRESENCIAL_ASSISTIDA', 'visto_fr@fevre.com.br', 72);
  RAISE NOTICE 'CASO 5b (regime do Edital 003) OK';
  UPDATE public.regras_vista_prova SET tipo_procedimento='APENAS_RECURSO_ONLINE', email_solicitacao=NULL
   WHERE edital_id = v_edital;
  RAISE NOTICE 'CASO 5c (regime do Edital 002) OK — o modelo cabe nos dois';

  -- CASO 6 — RESTRICT: cargo do edital com matriz não se apaga.
  BEGIN
    DELETE FROM public.edital_cargos WHERE id = v_ec;
    RAISE NOTICE 'CASO 6 🔴 FALHOU — apagou o cargo com matriz';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CASO 6 (apagar cargo com matriz) RECUSADO  OK';
  END;
END $$;

ROLLBACK;

SELECT 'CASO 7' AS caso,
       (SELECT count(*) FROM public.provas_disciplinas)
     + (SELECT count(*) FROM public.provas_objetivas_config) AS linhas_apos_rollback,
       'esperado 0' AS veredito;
