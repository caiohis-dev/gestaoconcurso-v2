-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 9: inscrição, taxas, isenção e canais
-- migration 20260917104500_editais_inscricao_taxas_e_isencao
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ A correlação entre taxa e escolaridade NÃO se testa aqui: ela é SUGESTÃO, não regra
-- do banco. Está em `src/lib/edital-inscricao.ts`, com os 6 valores reais como fixture.
-- O CASO 2 aqui prova a ausência — o banco aceita taxas divergentes de propósito.
--
-- Rodar:  docker exec -i <supabase_db> psql -U postgres -d postgres < docs/bateria-edital-inscricao.sql

\set ON_ERROR_STOP off
BEGIN;

SELECT 'CASO 0' AS caso, c.relname, count(p.polname) AS policies, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       CASE WHEN count(p.polname)=4 AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid,'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('regras_isencao','inscricao_config','edital_canais_atendimento')
GROUP BY c.relname, c.relrowsecurity, c.oid ORDER BY 1;

DO $$
DECLARE
  v_ed uuid; v_c_sup uuid; v_c_med uuid; v_ec_sup uuid; v_ec_med uuid;
  v_con text; v_admin uuid; v_comum uuid; v_n int; v_taxa numeric;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='admin'::app_role LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id=u.id AND r.role IN ('admin'::app_role,'superadmin'::app_role))
   LIMIT 1;

  INSERT INTO public.editais (nome) VALUES ('ZZZ bateria inscricao ' || gen_random_uuid())
    RETURNING id INTO v_ed;
  INSERT INTO public.cargos (nome, escolaridade_minima) VALUES ('BATERIA INSC ENFERMEIRO', 'SUPERIOR')
    RETURNING id INTO v_c_sup;
  INSERT INTO public.cargos (nome, escolaridade_minima) VALUES ('BATERIA INSC TECNICO ENF', 'TECNICO')
    RETURNING id INTO v_c_med;

  -- ══ A TAXA, POR CARGO ═════════════════════════════════════════════════════════════
  -- CASO 1 — ⭐ CONTROLE POSITIVO: as duas taxas reais do Edital 003.
  INSERT INTO public.edital_cargos (edital_id, cargo_id, taxa_inscricao)
    VALUES (v_ed, v_c_sup, 100.00) RETURNING id INTO v_ec_sup;
  INSERT INTO public.edital_cargos (edital_id, cargo_id, taxa_inscricao)
    VALUES (v_ed, v_c_med, 80.00) RETURNING id INTO v_ec_med;
  SELECT sum(taxa_inscricao) INTO v_taxa FROM public.edital_cargos WHERE edital_id = v_ed;
  RAISE NOTICE 'CASO 1 (taxas reais do 003: 100 + 80) soma=%  %', v_taxa,
    CASE WHEN v_taxa = 180.00 THEN 'OK' ELSE '🔴 FALHOU' END;

  -- CASO 1b — 🔴 NUMERIC, não float: os centavos têm de voltar exatos.
  -- Em `float`, 0.1 + 0.2 não dá 0.3, e um boleto errado só aparece no extrato.
  UPDATE public.edital_cargos SET taxa_inscricao = 85.35 WHERE id = v_ec_med;
  SELECT taxa_inscricao INTO v_taxa FROM public.edital_cargos WHERE id = v_ec_med;
  RAISE NOTICE 'CASO 1b (centavos exatos) taxa=%  %', v_taxa,
    CASE WHEN v_taxa = 85.35::numeric THEN 'OK — numeric preserva' ELSE '🔴 FALHOU' END;
  UPDATE public.edital_cargos SET taxa_inscricao = 80.00 WHERE id = v_ec_med;

  -- CASO 1c — taxa negativa.
  BEGIN
    UPDATE public.edital_cargos SET taxa_inscricao = -1 WHERE id = v_ec_med;
    RAISE NOTICE 'CASO 1c (taxa negativa) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 1c (taxa negativa) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_edital_cargo_taxa' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 1d — ⭐ CONTROLE POSITIVO: taxa ZERO é concurso sem taxa, decisão legítima.
  UPDATE public.edital_cargos SET taxa_inscricao = 0 WHERE id = v_ec_med;
  RAISE NOTICE 'CASO 1d (taxa zero) OK — `>= 0`, não `> 0`';
  UPDATE public.edital_cargos SET taxa_inscricao = 80.00 WHERE id = v_ec_med;

  -- CASO 2 — 🔴 PROVA DE AUSÊNCIA: o banco NÃO impõe a correlação com escolaridade.
  -- Dois cargos de nível superior com taxas diferentes ENTRAM. A correlação medida
  -- (100 superior / 80 médio) é sugestão do sistema, não regra do documento — e se
  -- alguém puser um trigger para "resolver" isso, este caso acusa.
  DECLARE v_c_sup2 uuid;
  BEGIN
    INSERT INTO public.cargos (nome, escolaridade_minima) VALUES ('BATERIA INSC MEDICO', 'SUPERIOR')
      RETURNING id INTO v_c_sup2;
    INSERT INTO public.edital_cargos (edital_id, cargo_id, taxa_inscricao)
      VALUES (v_ed, v_c_sup2, 150.00);
    RAISE NOTICE 'CASO 2 (dois superiores, taxas 100 e 150) ACEITO — a correlação é do linter';
  END;

  -- ══ A ISENÇÃO ═════════════════════════════════════════════════════════════════════
  -- CASO 3 — ⭐ CONTROLE POSITIVO: os TRÊS critérios, como os três editais os publicam.
  INSERT INTO public.regras_isencao
    (edital_id, tipo_criterio, lei_referencia, minimo_doacoes_sangue_12m, redome_exige_ano_vigente, ordem) VALUES
    (v_ed, 'CADUNICO', 'Lei nº 8.112/90 art. 11; Decretos Federais 6.593/2008 e 11.016/2022', NULL, NULL, 0),
    (v_ed, 'DOADOR_SANGUE_OU_MEDULA', 'Lei Municipal 5.989/2022', 3, true, 1),
    (v_ed, 'SERVICO_ELEITORAL', 'Lei Municipal nº 6.359/2024', NULL, NULL, 2);
  SELECT count(*) INTO v_n FROM public.regras_isencao WHERE edital_id = v_ed;
  RAISE NOTICE 'CASO 3 (os 3 critérios reais) n=%  %', v_n,
    CASE WHEN v_n = 3 THEN 'OK — e são TRÊS, não quatro' ELSE '🔴 FALHOU' END;

  -- CASO 3b — o mesmo critério duas vezes sairia como duas alíneas idênticas.
  BEGIN
    INSERT INTO public.regras_isencao (edital_id, tipo_criterio) VALUES (v_ed, 'CADUNICO');
    RAISE NOTICE 'CASO 3b (critério repetido) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3b (critério repetido) RECUSADO por %  %', v_con,
      CASE WHEN v_con='regras_isencao_edital_tipo_key' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 3c — ⚠️ O CRITÉRIO QUE O ESBOÇO QUERIA E O DOCUMENTO NÃO TEM.
  -- Ele propunha DOADOR_MEDULA_REDOME separado de DOADOR_SANGUE; os três editais os
  -- juntam sob a Lei Municipal 5.989/2022, numa alínea só. O domínio recusa.
  BEGIN
    INSERT INTO public.regras_isencao (edital_id, tipo_criterio) VALUES (v_ed, 'DOADOR_MEDULA_REDOME');
    RAISE NOTICE 'CASO 3c 🔴 FALHOU — o critério que o documento não tem foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3c (critério fora do domínio) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_isencao_tipo' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 3d — zero doações é regra que não filtra ninguém.
  BEGIN
    UPDATE public.regras_isencao SET minimo_doacoes_sangue_12m = 0
     WHERE edital_id = v_ed AND tipo_criterio = 'DOADOR_SANGUE_OU_MEDULA';
    RAISE NOTICE 'CASO 3d (0 doações) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3d (0 doações) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_isencao_doacoes' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 3e — ⭐ CONTROLE: o mesmo critério em OUTRO edital entra.
  DECLARE v_ed2 uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria insc 2 ' || gen_random_uuid())
      RETURNING id INTO v_ed2;
    INSERT INTO public.regras_isencao (edital_id, tipo_criterio) VALUES (v_ed2, 'CADUNICO');
    RAISE NOTICE 'CASO 3e (mesmo critério, outro edital) OK';
  END;

  -- ══ A CONFIG DE INSCRIÇÃO ═════════════════════════════════════════════════════════
  -- CASO 4 — ⭐ CONTROLE POSITIVO: o parâmetro que DIVERGE entre os três editais.
  INSERT INTO public.inscricao_config
    (edital_id, documentacao_isencao_vale_para_um_cargo, limite_envelopes_por_candidato)
  VALUES (v_ed, true, 2);
  RAISE NOTICE 'CASO 4 (config do 003/004: 1 cargo por pedido, 2 envelopes) OK';

  -- CASO 4b — ⭐ CONTROLE: o 002 NÃO tem a cláusula, e `false` é declaração válida.
  UPDATE public.inscricao_config SET documentacao_isencao_vale_para_um_cargo = false
   WHERE edital_id = v_ed;
  RAISE NOTICE 'CASO 4b (regime do 002) OK — o modelo cabe nos dois';

  -- CASO 4c — uma config por edital.
  BEGIN
    INSERT INTO public.inscricao_config (edital_id) VALUES (v_ed);
    RAISE NOTICE 'CASO 4c (segunda config) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'CASO 4c (segunda config no mesmo edital) RECUSADA  OK';
  END;

  -- CASO 4d — zero envelopes é regra que impede a entrega.
  BEGIN
    UPDATE public.inscricao_config SET limite_envelopes_por_candidato = 0 WHERE edital_id = v_ed;
    RAISE NOTICE 'CASO 4d (0 envelopes) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4d (0 envelopes) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_inscricao_envelopes' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- ══ OS CANAIS ═════════════════════════════════════════════════════════════════════
  -- CASO 5 — ⭐ CONTROLE POSITIVO: os três canais reais dos editais.
  INSERT INTO public.edital_canais_atendimento
    (edital_id, tipo_canal, rotulo, endereco, horario_funcionamento, ordem) VALUES
    (v_ed, 'PORTAL_WEB', 'Site do concurso', 'www.voltaredonda.rj.gov.br/concursopublico', NULL, 0),
    (v_ed, 'POSTO_PRESENCIAL', 'Entrega de envelopes',
     'Sede Administrativa da FEVRE, Rua 154, nº 783 – Laranjal, Volta Redonda/RJ', 'das 9h às 16 horas', 1),
    (v_ed, 'EMAIL', 'Vista da folha de respostas', 'visto_fr@fevre.com.br', NULL, 2);
  SELECT count(*) INTO v_n FROM public.edital_canais_atendimento WHERE edital_id = v_ed;
  RAISE NOTICE 'CASO 5 (3 canais reais) n=%  %', v_n,
    CASE WHEN v_n = 3 THEN 'OK' ELSE '🔴 FALHOU' END;

  -- CASO 5b — 🔴 O MESMO POSTO, CITADO DE NOVO, É PERMITIDO — e tem de ser.
  -- No Edital 002 a mesma sede aparece em QUATRO finalidades (isenção, laudo PCD,
  -- autodeclaração, títulos). Um índice único por endereço impediria o que o documento faz.
  -- ⚠️ O ganho da tabela não é impedir a repetição: é que ela seja UMA linha referenciada
  -- por vários capítulos, em vez de quatro textos digitados à mão que podem divergir.
  INSERT INTO public.edital_canais_atendimento (edital_id, tipo_canal, rotulo, endereco)
  VALUES (v_ed, 'POSTO_PRESENCIAL', 'Entrega de títulos',
          'Sede Administrativa da FEVRE, Rua 154, nº 783 – Laranjal, Volta Redonda/RJ');
  RAISE NOTICE 'CASO 5b (mesmo endereço, outra finalidade) OK';

  -- CASO 5c — tipo de canal fora do domínio. ⚠️ Os quatro são MEIOS, não finalidades:
  -- o esboço propunha EMAIL_IMPUGNACAO e EMAIL_VISTA_PROVA, que são finalidades.
  BEGIN
    INSERT INTO public.edital_canais_atendimento (edital_id, tipo_canal, rotulo)
    VALUES (v_ed, 'EMAIL_VISTA_PROVA', 'Vista');
    RAISE NOTICE 'CASO 5c 🔴 FALHOU — finalidade entrou como tipo';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5c (finalidade como tipo) RECUSADA por %  %', v_con,
      CASE WHEN v_con='chk_canal_tipo' THEN 'OK — o tipo é o MEIO' ELSE '🔴 outra regra' END;
  END;

  -- CASO 5d — rótulo em branco: é o que identifica o canal na lista.
  BEGIN
    INSERT INTO public.edital_canais_atendimento (edital_id, tipo_canal, rotulo)
    VALUES (v_ed, 'EMAIL', '   ');
    RAISE NOTICE 'CASO 5d 🔴 FALHOU — canal sem rótulo entrou';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5d (canal sem rótulo) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_canal_rotulo' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 5e — 🔴 PROVA DE AUSÊNCIA: e-mail malformado ENTRA, de propósito.
  -- É a decisão de 01/08 ("dado inválido entra cru; valide na leitura"), que removeu 4
  -- CHECKs de formato deste repo. Quem confere é o linter.
  INSERT INTO public.edital_canais_atendimento (edital_id, tipo_canal, rotulo, endereco)
  VALUES (v_ed, 'EMAIL', 'Impugnação', 'isto nao e um email');
  RAISE NOTICE 'CASO 5e (e-mail malformado) ACEITO — formato é do linter';

  -- ══ RLS ═══════════════════════════════════════════════════════════════════════════
  -- CASO 6 — não-admin autenticado NÃO escreve.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 6 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.regras_isencao (edital_id, tipo_criterio) VALUES (v_ed, 'SERVICO_ELEITORAL');
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
      INSERT INTO public.edital_canais_atendimento (edital_id, tipo_canal, rotulo)
      VALUES (v_ed, 'TELEFONE', 'Atendimento do admin');
      RESET ROLE;
      RAISE NOTICE 'CASO 7 (admin insere) OK';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 7 (admin insere) 🔴 FALHOU — a policy travou o admin';
    END;
  END IF;

  -- ══ FK RESTRICT ═══════════════════════════════════════════════════════════════════
  -- CASO 8 — apagar edital com canal é recusado. ⚠️ Edital LIMPO: num edital existente a
  -- recusa viria de `provas_edital_id_fkey` e o caso não exercitaria nada.
  DECLARE v_limpo uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria insc limpo ' || gen_random_uuid())
      RETURNING id INTO v_limpo;
    INSERT INTO public.edital_canais_atendimento (edital_id, tipo_canal, rotulo)
    VALUES (v_limpo, 'PORTAL_WEB', 'Site');
    BEGIN
      DELETE FROM public.editais WHERE id = v_limpo;
      RAISE NOTICE 'CASO 8 🔴 FALHOU — o canal sumiu junto';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 8 (apagar edital com canal) RECUSADO por %  %', v_con,
        CASE WHEN v_con='edital_canais_atendimento_edital_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;
  END;
END $$;

ROLLBACK;

SELECT 'CASO 9' AS caso,
       (SELECT count(*) FROM public.regras_isencao)
     + (SELECT count(*) FROM public.inscricao_config)
     + (SELECT count(*) FROM public.edital_canais_atendimento) AS linhas_apos_rollback,
       'esperado 0' AS veredito;
