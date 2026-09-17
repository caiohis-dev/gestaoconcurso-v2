-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 7: territorialidade e lotação
-- migration 20260917..._editais_territorialidade_e_lotacao
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ A soma da distribuição contra o total do cargo NÃO se testa aqui: não é CHECK, pela
-- mesma razão das fatias 5 e 6. Ela é `src/lib/edital-territorialidade.ts`, com o Quadro
-- II do Edital 004 (39 unidades, 80 vagas) como fixture.
--
-- 🔴 O CASO 9 é o mais importante: ele prova o TETO DO POSTGREST com dado real. 843
-- logradouros num edital só, e uma leitura sem `.range()` devolveria 1000 sem erro.
--
-- Rodar:  docker exec -i <supabase_db> psql -U postgres -d postgres < docs/bateria-edital-territorialidade.sql

\set ON_ERROR_STOP off
BEGIN;

SELECT 'CASO 0' AS caso, c.relname, count(p.polname) AS policies, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       CASE WHEN count(p.polname)=4 AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid,'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('unidades_lotacao','edital_cargo_unidades','territorialidade_abrangencia')
GROUP BY c.relname, c.relrowsecurity, c.oid ORDER BY 1;

DO $$
DECLARE
  v_edital uuid; v_cargo uuid; v_ec uuid; v_u1 uuid; v_u2 uuid;
  v_con text; v_admin uuid; v_comum uuid; v_n int; v_soma int;
BEGIN
  SELECT id INTO v_edital FROM public.editais ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='admin'::app_role LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id=u.id AND r.role IN ('admin'::app_role,'superadmin'::app_role))
   LIMIT 1;

  INSERT INTO public.cargos (nome) VALUES ('BATERIA TERR AGENTE COMUNITARIO') RETURNING id INTO v_cargo;
  INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo) RETURNING id INTO v_ec;
  INSERT INTO public.unidades_lotacao (nome, endereco, bairro)
    VALUES ('BATERIA UBSF Belmonte', 'Rua X, 100', 'Belmonte') RETURNING id INTO v_u1;
  INSERT INTO public.unidades_lotacao (nome) VALUES ('BATERIA UBSF Água Limpa I') RETURNING id INTO v_u2;

  -- ══ CONTROLE POSITIVO COM DADO REAL ═══════════════════════════════════════════════
  -- CASO 1 — ⭐ duas linhas do Quadro II do Edital 004, como publicadas.
  INSERT INTO public.edital_cargo_unidades
    (edital_cargo_id, unidade_lotacao_id, codigo_inscricao, ordem,
     vagas_ampla_concorrencia, vagas_pcd, vagas_negros) VALUES
    (v_ec, v_u1, 'DN-3',  0, 3, 0, 1),
    (v_ec, v_u2, 'DN-13', 1, 2, 0, 0);
  SELECT sum(vagas_ampla_concorrencia + vagas_pcd + vagas_negros) INTO v_soma
    FROM public.edital_cargo_unidades WHERE edital_cargo_id = v_ec;
  RAISE NOTICE 'CASO 1 (2 linhas do Quadro II) soma=%  %', v_soma,
    CASE WHEN v_soma = 6 THEN 'OK — 4 do Belmonte + 2 do Água Limpa I' ELSE '🔴 FALHOU' END;

  -- CASO 2 — a mesma unidade duas vezes no mesmo cargo dobraria as vagas sem ninguém ver.
  BEGIN
    INSERT INTO public.edital_cargo_unidades (edital_cargo_id, unidade_lotacao_id, vagas_ampla_concorrencia)
    VALUES (v_ec, v_u1, 9);
    RAISE NOTICE 'CASO 2 (unidade repetida no cargo) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (unidade repetida no cargo) RECUSADA por %  %', v_con,
      CASE WHEN v_con='edital_cargo_unidades_par_key' THEN 'OK' ELSE '🔴 outra regra barrou' END;
  END;

  -- CASO 2b — ⭐ CONTROLE POSITIVO: a mesma unidade em OUTRO cargo é permitida.
  -- No Edital 004 uma UBSF pode receber ACS e, em tese, outro cargo territorializado.
  DECLARE v_cargo2 uuid; v_ec2 uuid;
  BEGIN
    INSERT INTO public.cargos (nome) VALUES ('BATERIA TERR AGENTE ENDEMIAS') RETURNING id INTO v_cargo2;
    INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo2) RETURNING id INTO v_ec2;
    INSERT INTO public.edital_cargo_unidades (edital_cargo_id, unidade_lotacao_id, vagas_ampla_concorrencia)
    VALUES (v_ec2, v_u1, 2);
    RAISE NOTICE 'CASO 2b (mesma unidade, outro cargo) OK';
  END;

  -- CASO 2c — ⭐ CONTROLE: código de inscrição REPETIDO é ACEITO pelo banco.
  -- 🔴 Prova de AUSÊNCIA, e deliberada: metade dos 39 códigos fica NULL enquanto se
  -- digita, e um índice único barraria o meio do caminho. Quem acusa é o linter, em
  -- `edital-territorialidade.ts`. Se alguém puser um índice aqui, este caso avisa.
  DECLARE v_u3 uuid;
  BEGIN
    INSERT INTO public.unidades_lotacao (nome) VALUES ('BATERIA UBSF Roma') RETURNING id INTO v_u3;
    INSERT INTO public.edital_cargo_unidades (edital_cargo_id, unidade_lotacao_id, codigo_inscricao, vagas_ampla_concorrencia)
    VALUES (v_ec, v_u3, 'DN-3', 1);
    RAISE NOTICE 'CASO 2c (código repetido aceito) OK — é regra de linter, não do banco';
  END;

  -- CASO 3 — vagas negativas.
  BEGIN
    INSERT INTO public.edital_cargo_unidades (edital_cargo_id, unidade_lotacao_id, vagas_negros)
    VALUES (v_ec, v_u2, -1);
    RAISE NOTICE 'CASO 3 (vagas negativas) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'CASO 3 🔴 INEFICAZ — barrou pelo par, não pelo sinal. Caso mal construído.';
  WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3 (vagas negativas) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_ecu_vagas_nao_negativas' THEN 'OK' ELSE '🔴 outra regra barrou' END;
  END;

  -- ══ O CATÁLOGO DE UNIDADES ════════════════════════════════════════════════════════
  -- CASO 4 — nome repetido, com CAIXA e ESPAÇO diferentes.
  BEGIN
    INSERT INTO public.unidades_lotacao (nome) VALUES ('  bateria ubsf belmonte  ');
    RAISE NOTICE 'CASO 4 (unidade repetida, outra caixa) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (unidade repetida, outra caixa) RECUSADA por %  %', v_con,
      CASE WHEN v_con='unidades_lotacao_nome_key' THEN 'OK — normaliza caixa e espaço' ELSE '🔴 outra regra' END;
  END;

  -- CASO 4a — ⚠️ O LIMITE, e ele é o mesmo de `cargos_nome_chave_key`: ACENTO não é
  -- normalizado. 'BATERIA UBSF AGUA LIMPA I' e '…ÁGUA…' são unidades distintas. Fica
  -- documentado como limite conhecido, não como defeito — fundir por acento seria
  -- IDENTIDADE, e pode juntar nomes legitimamente diferentes.
  INSERT INTO public.unidades_lotacao (nome) VALUES ('BATERIA UBSF Agua Limpa I');
  RAISE NOTICE 'CASO 4a (acento NÃO é normalizado) OK — limite conhecido';

  -- CASO 5 — nome em branco.
  BEGIN
    INSERT INTO public.unidades_lotacao (nome) VALUES ('   ');
    RAISE NOTICE 'CASO 5 (unidade sem nome) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5 (unidade sem nome) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_unidade_lotacao_nome' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- ══ A ABRANGÊNCIA ═════════════════════════════════════════════════════════════════
  -- CASO 6 — ⭐ CONTROLE POSITIVO: logradouros do Anexo I, COMO PUBLICADOS.
  -- 🔴 As quatro formas que derrubaram `numero_inicial`/`numero_final` do esboço.
  INSERT INTO public.territorialidade_abrangencia
    (edital_id, unidade_lotacao_id, bairro, logradouro, ordem) VALUES
    (v_edital, v_u1, 'AERO CLUBE', 'AVENIDA BEIRA-RIO', 0),
    (v_edital, v_u1, 'AERO CLUBE', 'TRAV. VISCONDE DO RIO BRANCO (ALAMEDAS 1 A 7)', 1),
    (v_edital, v_u1, 'AERO CLUBE', 'RODOVIA LÚCIO MEIRA KM 7501 A 8500', 2),
    (v_edital, v_u1, 'AERO CLUBE', 'RUA VEREADOR ACACIO DA ROCHA (DO N 03 ATÉ O N 9201)', 3),
    (v_edital, v_u1, 'AERO CLUBE', 'RUA 1, 2, 3 e 4 (CONDOMÍNIO VISTA BELA)', 4),
    -- ⚠️ bairro NULO: 12 das 28 seções do Anexo I listam as ruas direto sob a unidade.
    (v_edital, v_u1, NULL, 'RUA 552', 5);
  SELECT count(*) INTO v_n FROM public.territorialidade_abrangencia WHERE unidade_lotacao_id = v_u1;
  RAISE NOTICE 'CASO 6 (6 logradouros reais, inclusive bairro NULO) n=%  %', v_n,
    CASE WHEN v_n = 6 THEN 'OK — texto publicado entra cru' ELSE '🔴 FALHOU' END;

  -- CASO 6b — ⭐ CONTROLE: a MESMA rua pode repetir em duas unidades (área limítrofe).
  -- O item 5.1.5 do Edital 004 fala em divisas de propósito. Um índice único por
  -- (edital, logradouro) impediria o que o documento prevê.
  INSERT INTO public.territorialidade_abrangencia (edital_id, unidade_lotacao_id, logradouro)
  VALUES (v_edital, v_u2, 'RUA 552');
  RAISE NOTICE 'CASO 6b (mesma rua em duas unidades) OK — áreas limítrofes existem';

  -- CASO 7 — logradouro em branco.
  BEGIN
    INSERT INTO public.territorialidade_abrangencia (edital_id, unidade_lotacao_id, logradouro)
    VALUES (v_edital, v_u1, '  ');
    RAISE NOTICE 'CASO 7 (logradouro vazio) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 7 (logradouro vazio) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_abrangencia_logradouro' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 8 — 🔴 A ABRANGÊNCIA É POR EDITAL: o mesmo par (unidade, rua) entra em outro
  -- edital sem conflito. É o que impede um edital novo de reescrever, calado, o anexo de
  -- um edital já publicado.
  DECLARE v_e2 uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria terr ' || gen_random_uuid())
    RETURNING id INTO v_e2;
    INSERT INTO public.territorialidade_abrangencia (edital_id, unidade_lotacao_id, logradouro)
    VALUES (v_e2, v_u1, 'AVENIDA BEIRA-RIO');
    RAISE NOTICE 'CASO 8 (mesma rua e unidade, outro edital) OK — limite muda entre editais';

    -- CASO 8b — apagar esse edital é recusado PELA FK DA ABRANGÊNCIA.
    BEGIN
      DELETE FROM public.editais WHERE id = v_e2;
      RAISE NOTICE 'CASO 8b (apagar edital com abrangência) 🔴 FALHOU — sumiu junto';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 8b (apagar edital com abrangência) RECUSADO por %  %', v_con,
        CASE WHEN v_con='territorialidade_abrangencia_edital_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;
  END;

  -- ══ 🔴 O TETO DO POSTGREST, COM VOLUME REAL ═══════════════════════════════════════
  -- CASO 9 — 843 logradouros é o que o Edital 004 publica, 84% do `max_rows` de 1000.
  -- Este caso não testa o PostgREST (não dá, daqui) — ele garante que o VOLUME cabe e
  -- que o índice o serve. A prova do corte é `buscar-em-fatias`, no cliente.
  INSERT INTO public.territorialidade_abrangencia (edital_id, unidade_lotacao_id, logradouro, ordem)
  SELECT v_edital, v_u2, 'RUA DE CARGA ' || g, g FROM generate_series(1, 843) g;
  SELECT count(*) INTO v_n FROM public.territorialidade_abrangencia
   WHERE edital_id = v_edital AND unidade_lotacao_id = v_u2;
  RAISE NOTICE 'CASO 9 (volume real do Anexo I) n=%  %', v_n,
    CASE WHEN v_n = 844 THEN 'OK — 843 de carga + a rua do CASO 6b' ELSE '🔴 FALHOU' END;

  -- ══ RLS ═══════════════════════════════════════════════════════════════════════════
  -- CASO 10 — não-admin autenticado NÃO escreve.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 10 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.unidades_lotacao (nome) VALUES ('BATERIA ESCRITA INDEVIDA');
      RESET ROLE;
      RAISE NOTICE 'CASO 10 (não-admin cria unidade) 🔴 FALHOU — a RLS deixou passar';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 10 (não-admin cria unidade) RECUSADO por % OK', SQLSTATE;
    END;
  END IF;

  -- CASO 11 — ⭐ CONTROLE POSITIVO: admin escreve. Sem ele, o CASO 10 passaria verde com
  -- a tabela simplesmente inacessível para todo mundo.
  IF v_admin IS NULL THEN
    RAISE NOTICE 'CASO 11 NÃO EXERCITADO — não há admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.unidades_lotacao (nome) VALUES ('BATERIA ESCRITA DO ADMIN');
      RESET ROLE;
      RAISE NOTICE 'CASO 11 (admin cria unidade) OK';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 11 (admin cria unidade) 🔴 FALHOU — a policy travou o admin';
    END;
  END IF;

  -- ══ FK RESTRICT ═══════════════════════════════════════════════════════════════════
  -- CASO 12 — unidade em uso não se apaga, nem pela distribuição nem pela abrangência.
  BEGIN
    DELETE FROM public.unidades_lotacao WHERE id = v_u1;
    RAISE NOTICE 'CASO 12 (apagar unidade em uso) 🔴 FALHOU — sumiu com a distribuição junto';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 12 (apagar unidade em uso) RECUSADO por %  OK', v_con;
  END;

  -- CASO 13 — cargo do edital com distribuição não se apaga.
  BEGIN
    DELETE FROM public.edital_cargos WHERE id = v_ec;
    RAISE NOTICE 'CASO 13 (apagar cargo com distribuição) 🔴 FALHOU — as vagas sumiram';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 13 (apagar cargo com distribuição) RECUSADO por %  %', v_con,
      CASE WHEN v_con='edital_cargo_unidades_edital_cargo_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
           ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
  END;
END $$;

ROLLBACK;

SELECT 'CASO 14' AS caso,
       (SELECT count(*) FROM public.territorialidade_abrangencia)
     + (SELECT count(*) FROM public.edital_cargo_unidades)
     + (SELECT count(*) FROM public.unidades_lotacao) AS linhas_apos_rollback,
       'esperado 0' AS veredito;
