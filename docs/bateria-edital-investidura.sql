-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 8: investidura e posse
-- migration 20260917093000_editais_investidura_e_posse
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- 🎯 O CASO 3 É A RAZÃO DE ESTA FATIA EXISTIR: num edital sem nenhum cargo de enfermagem,
-- o documento do COREN é RECUSADO PELO BANCO. É o defeito do Edital 004/2026, item 15.8-L,
-- virando estado impossível.
--
-- 🔴 E o par importa: provar só que o COREN ENTRA num edital de Enfermeiro (CASO 2) não
-- prova nada. O risco R1 do roadmap é exatamente esse — "testar só o caso feliz", que foi
-- o que aconteceu no 004.
--
-- Rodar:  docker exec -i <supabase_db> psql -U postgres -d postgres < docs/bateria-edital-investidura.sql

\set ON_ERROR_STOP off
BEGIN;

SELECT 'CASO 0' AS caso, c.relname, count(p.polname) AS policies, c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       CASE WHEN count(p.polname)=4 AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid,'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname = 'documentos_investidura'
GROUP BY c.relname, c.relrowsecurity, c.oid;

DO $$
DECLARE
  v_ed_enf uuid; v_ed_acs uuid;
  v_c_enf uuid; v_c_acs uuid;
  v_con text; v_msg text; v_admin uuid; v_comum uuid; v_n int;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='admin'::app_role LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id=u.id AND r.role IN ('admin'::app_role,'superadmin'::app_role))
   LIMIT 1;

  -- Dois editais montados aqui, que são o par do teste:
  --   · v_ed_enf reproduz o Edital 003 — tem Enfermeiro, que exige COREN.
  --   · v_ed_acs reproduz o Edital 004 — só Agente Comunitário de Saúde, sem conselho.
  INSERT INTO public.editais (nome) VALUES ('ZZZ bateria inv ENFERMAGEM ' || gen_random_uuid())
    RETURNING id INTO v_ed_enf;
  INSERT INTO public.editais (nome) VALUES ('ZZZ bateria inv ACS ' || gen_random_uuid())
    RETURNING id INTO v_ed_acs;

  INSERT INTO public.cargos (nome, escolaridade_minima, conselho_classe_obrigatorio)
    VALUES ('BATERIA INV ENFERMEIRO', 'SUPERIOR', 'COREN') RETURNING id INTO v_c_enf;
  INSERT INTO public.cargos (nome, escolaridade_minima, conselho_classe_obrigatorio)
    VALUES ('BATERIA INV AGENTE COMUNITARIO', 'MEDIO', 'NENHUM') RETURNING id INTO v_c_acs;

  INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_ed_enf, v_c_enf);
  INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_ed_acs, v_c_acs);

  -- ══ O NÚCLEO COMUM AOS TRÊS EDITAIS ═══════════════════════════════════════════════
  -- CASO 1 — ⭐ CONTROLE POSITIVO: os 10 documentos que os três checklists compartilham.
  INSERT INTO public.documentos_investidura
    (edital_id, aplica_a_todos_os_cargos, nome_documento, ordem) VALUES
    (v_ed_acs, true, 'Comprovante de votação (último pleito eleitoral)', 0),
    (v_ed_acs, true, 'Documento Oficial de Identificação com foto (original e fotocópia)', 1),
    (v_ed_acs, true, 'Comprovante de residência atualizado – últimos três meses', 2),
    (v_ed_acs, true, 'CPF (original e fotocópia)', 3),
    (v_ed_acs, true, 'Cartão PIS/PASEP (original e fotocópia)', 4),
    (v_ed_acs, true, 'Certidão de Nascimento ou Casamento (original e fotocópia)', 5),
    (v_ed_acs, true, 'Certidão de Nascimento de filhos menores de 14 anos', 6),
    (v_ed_acs, true, '2 (duas) fotos 3X4 recentes', 7),
    -- ⚠️ A condição mora no TEXTO, como nos três editais reais. Foi por isso que a
    -- coluna `aplica_apenas_sexo` da P1 do roadmap NÃO foi criada.
    (v_ed_acs, true, 'Certificado de Reservista (homem). (original e fotocópia)', 8),
    (v_ed_acs, true, 'Cópia de inteiro teor da última declaração de Imposto de Renda, caso declare', 9);
  SELECT count(*) INTO v_n FROM public.documentos_investidura WHERE edital_id = v_ed_acs;
  RAISE NOTICE 'CASO 1 (núcleo comum dos 3 editais) n=%  %', v_n,
    CASE WHEN v_n = 10 THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ══ 🎯 O PAR QUE É A RAZÃO DESTA FATIA ════════════════════════════════════════════
  -- CASO 2 — ⭐ CONTROLE POSITIVO: no edital COM Enfermeiro, os dois documentos de COREN
  -- do Edital 003 entram. Sem este caso, o CASO 3 passaria verde com a regra simplesmente
  -- recusando tudo.
  INSERT INTO public.documentos_investidura
    (edital_id, aplica_a_todos_os_cargos, nome_documento, conselho_exigido, ordem) VALUES
    (v_ed_enf, true, 'Registro Ativo e regular com anuidade paga no Conselho Regional de Enfermagem – COREN', 'COREN', 0),
    (v_ed_enf, true, 'Certidão Nada Consta do COREN (Certidão Única Atualizada)', 'COREN', 1);
  RAISE NOTICE 'CASO 2 (COREN num edital de Enfermeiro) OK — os dois documentos do 003 entram';

  -- CASO 3 — 🎯 O DEFEITO DO EDITAL 004, RECUSADO PELO BANCO.
  BEGIN
    INSERT INTO public.documentos_investidura
      (edital_id, aplica_a_todos_os_cargos, nome_documento, conselho_exigido)
    VALUES (v_ed_acs, true, 'Certidão Nada Consta do COREN (Certidão Única Atualizada)', 'COREN');
    RAISE NOTICE 'CASO 3 🔴 FALHOU — o COREN entrou num edital só de ACS. É o defeito do 004.';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 3 (COREN num edital só de ACS) RECUSADO  %',
      CASE WHEN left(v_msg, 5) = 'IN001' THEN 'OK — e com IN001, a regra certa' ELSE '🔴 outra regra: ' || left(v_msg,50) END;
  END;

  -- CASO 3b — 🔴 E NÃO DÁ PARA CONTORNAR POR UPDATE. Sem o trigger no UPDATE, bastaria
  -- inserir com conselho nulo e depois preencher — o buraco clássico de validar só o
  -- INSERT.
  DECLARE v_doc uuid;
  BEGIN
    INSERT INTO public.documentos_investidura (edital_id, aplica_a_todos_os_cargos, nome_documento)
    VALUES (v_ed_acs, true, 'Documento que vai tentar virar COREN') RETURNING id INTO v_doc;
    BEGIN
      UPDATE public.documentos_investidura SET conselho_exigido = 'COREN' WHERE id = v_doc;
      RAISE NOTICE 'CASO 3b 🔴 FALHOU — o UPDATE contornou a regra';
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      RAISE NOTICE 'CASO 3b (virar COREN por UPDATE) RECUSADO  %',
        CASE WHEN left(v_msg, 5) = 'IN001' THEN 'OK — o trigger cobre INSERT e UPDATE' ELSE '🔴 outra regra' END;
    END;
  END;

  -- CASO 3c — ⚠️ E O CARGO COM CONSELHO 'NENHUM' NÃO SERVE DE BRECHA. 'NENHUM' é
  -- declaração de que o cargo não tem conselho, não um conselho chamado NENHUM.
  BEGIN
    INSERT INTO public.documentos_investidura
      (edital_id, aplica_a_todos_os_cargos, nome_documento, conselho_exigido)
    VALUES (v_ed_acs, true, 'Certidão do conselho NENHUM', 'CRM');
    RAISE NOTICE 'CASO 3c 🔴 FALHOU — aceitou conselho que nenhum cargo exige';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 3c (outro conselho qualquer) RECUSADO  OK';
  END;

  -- CASO 3d — ⭐ CONTROLE: o conselho CERTO no edital CERTO, mas de outro conselho, cai.
  -- Prova que o trigger compara a SIGLA, não só "existe algum conselho".
  BEGIN
    INSERT INTO public.documentos_investidura
      (edital_id, aplica_a_todos_os_cargos, nome_documento, conselho_exigido)
    VALUES (v_ed_enf, true, 'Registro no CRM', 'CRM');
    RAISE NOTICE 'CASO 3d 🔴 FALHOU — CRM entrou num edital que só exige COREN';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 3d (CRM num edital de COREN) RECUSADO  OK — compara a sigla';
  END;

  -- CASO 3e — 🔴 A BRECHA CONHECIDA, e ela é DELIBERADA: o mesmo texto, com a coluna
  -- vazia, ENTRA. Barrar texto livre no banco exigiria casar "COREN", "Coren-RJ" e
  -- "Conselho Regional de Enfermagem" — e recusaria documento legítimo. Quem varre o
  -- texto é `src/lib/edital-investidura.ts`. Se alguém puser essa regra no banco um dia,
  -- este caso avisa.
  INSERT INTO public.documentos_investidura (edital_id, aplica_a_todos_os_cargos, nome_documento)
  VALUES (v_ed_acs, true, 'Certidão Nada Consta do COREN (Certidão Única Atualizada)');
  RAISE NOTICE 'CASO 3e (mesmo texto, coluna vazia) ACEITO — brecha conhecida, é do linter';

  -- ══ O ESCOPO DO DOCUMENTO ═════════════════════════════════════════════════════════
  -- CASO 4 — 🔴 "vale para todos" e "esqueci de escolher" NÃO podem ser o mesmo estado.
  BEGIN
    INSERT INTO public.documentos_investidura (edital_id, nome_documento)
    VALUES (v_ed_acs, 'Documento sem escopo declarado');
    RAISE NOTICE 'CASO 4 🔴 FALHOU — entrou sem escopo, e o nulo virou ambíguo';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (sem escopo) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_doc_inv_escopo' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 4b — os dois ao mesmo tempo também é incoerente.
  BEGIN
    INSERT INTO public.documentos_investidura
      (edital_id, cargo_id, aplica_a_todos_os_cargos, nome_documento)
    VALUES (v_ed_acs, v_c_acs, true, 'Documento de cargo E de todos');
    RAISE NOTICE 'CASO 4b 🔴 FALHOU — cargo específico marcado como "todos"';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4b (cargo E todos) RECUSADO por %  OK', v_con;
  END;

  -- CASO 4c — ⭐ CONTROLE POSITIVO: documento POR CARGO entra. É o "Diploma de Enfermeiro"
  -- do Edital 003, que o 002 escreve genérico e o 003 lista um por cargo.
  INSERT INTO public.documentos_investidura
    (edital_id, cargo_id, aplica_a_todos_os_cargos, nome_documento)
  VALUES (v_ed_enf, v_c_enf, false, 'Diploma de Enfermeiro (original e fotocópia)');
  RAISE NOTICE 'CASO 4c (documento por cargo) OK';

  -- CASO 5 — nome em branco.
  BEGIN
    INSERT INTO public.documentos_investidura (edital_id, aplica_a_todos_os_cargos, nome_documento)
    VALUES (v_ed_acs, true, '   ');
    RAISE NOTICE 'CASO 5 🔴 FALHOU — documento sem nome entrou';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5 (documento sem nome) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_doc_inv_nome' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 6 — conselho fora do domínio.
  --
  -- ⚠️ QUEM BARRA É O TRIGGER, NÃO A CHECK — e a primeira versão deste caso afirmava o
  -- contrário. É o padrão do §8 do CLAUDE.md: regra nova OFUSCA regra antiga. O trigger é
  -- BEFORE, então roda antes das CHECKs de tabela, e nenhum cargo exige 'CONSELHO_X'.
  --
  -- 🔴 A consequência vale registrar: `chk_doc_inv_conselho` é quase inalcançável. Para
  -- chegar nela, o valor precisa passar pelo trigger — isto é, ALGUM cargo do edital tem
  -- de declará-lo — e `cargos` só admite o mesmo domínio mais 'NENHUM'. Logo o único
  -- valor que a exercita é 'NENHUM', que é o CASO 6b. A CHECK não é redundante: é ela que
  -- segura exatamente esse caso.
  BEGIN
    INSERT INTO public.documentos_investidura
      (edital_id, aplica_a_todos_os_cargos, nome_documento, conselho_exigido)
    VALUES (v_ed_enf, true, 'Registro no conselho inventado', 'CONSELHO_X');
    RAISE NOTICE 'CASO 6 🔴 FALHOU — conselho fora do domínio entrou';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 6 (conselho fora do domínio) RECUSADO  %',
      CASE WHEN left(v_msg,5)='IN001' THEN 'OK — pelo TRIGGER, que roda antes da CHECK'
           ELSE '🔴 esperava o trigger; veio: ' || left(v_msg,40) END;
  END;

  -- CASO 6b — ⚠️ 'NENHUM' não é conselho, e o domínio daqui o exclui de propósito: em
  -- `cargos` ele significa "declarado, e não tem". Um documento do conselho NENHUM não
  -- quer dizer nada.
  BEGIN
    INSERT INTO public.documentos_investidura
      (edital_id, aplica_a_todos_os_cargos, nome_documento, conselho_exigido)
    VALUES (v_ed_acs, true, 'Documento do conselho NENHUM', 'NENHUM');
    RAISE NOTICE 'CASO 6b 🔴 FALHOU — NENHUM foi aceito como conselho';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 6b (NENHUM como conselho) RECUSADO por %  %', v_con,
      CASE WHEN v_con='chk_doc_inv_conselho' THEN 'OK — o domínio daqui não o tem' ELSE '🔴 outra regra' END;
  END;

  -- ══ RLS ═══════════════════════════════════════════════════════════════════════════
  -- CASO 7 — não-admin autenticado NÃO escreve.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 7 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.documentos_investidura (edital_id, aplica_a_todos_os_cargos, nome_documento)
      VALUES (v_ed_acs, true, 'Escrita indevida');
      RESET ROLE;
      RAISE NOTICE 'CASO 7 (não-admin insere) 🔴 FALHOU — a RLS deixou passar';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 7 (não-admin insere) RECUSADO por % OK', SQLSTATE;
    END;
  END IF;

  -- CASO 8 — ⭐ CONTROLE POSITIVO: admin escreve.
  IF v_admin IS NULL THEN
    RAISE NOTICE 'CASO 8 NÃO EXERCITADO — não há admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.documentos_investidura (edital_id, aplica_a_todos_os_cargos, nome_documento)
      VALUES (v_ed_acs, true, 'Escrita legítima do admin');
      RESET ROLE;
      RAISE NOTICE 'CASO 8 (admin insere) OK';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 8 (admin insere) 🔴 FALHOU — a policy travou o admin';
    END;
  END IF;

  -- CASO 8b — 🔴 O TRIGGER VALE TAMBÉM PARA O ADMIN. Ele é SECURITY INVOKER e roda depois
  -- da RLS: papel não é salvo-conduto para publicar um edital incoerente.
  IF v_admin IS NOT NULL THEN
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.documentos_investidura
        (edital_id, aplica_a_todos_os_cargos, nome_documento, conselho_exigido)
      VALUES (v_ed_acs, true, 'Certidão Nada Consta do COREN', 'COREN');
      RESET ROLE;
      RAISE NOTICE 'CASO 8b 🔴 FALHOU — o admin conseguiu pôr o COREN no edital de ACS';
    EXCEPTION WHEN check_violation THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 8b (admin tenta o COREN no edital de ACS) RECUSADO  OK';
    END;
  END IF;

  -- ══ FK RESTRICT ═══════════════════════════════════════════════════════════════════
  -- CASO 9 — apagar edital com checklist é recusado PELA FK DO CHECKLIST.
  -- ⚠️ Edital LIMPO: num edital existente quem barraria seria `provas_edital_id_fkey`.
  DECLARE v_limpo uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria inv limpo ' || gen_random_uuid())
    RETURNING id INTO v_limpo;
    INSERT INTO public.documentos_investidura (edital_id, aplica_a_todos_os_cargos, nome_documento)
    VALUES (v_limpo, true, 'CPF');
    BEGIN
      DELETE FROM public.editais WHERE id = v_limpo;
      RAISE NOTICE 'CASO 9 🔴 FALHOU — o checklist sumiu junto';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 9 (apagar edital com checklist) RECUSADO por %  %', v_con,
        CASE WHEN v_con='documentos_investidura_edital_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;
  END;

  -- CASO 10 — cargo com documento próprio não se apaga.
  --
  -- ⚠️ CARGO CRIADO AQUI, e FORA de `edital_cargos`. A primeira versão usava o Enfermeiro
  -- e era barrada por `edital_cargos_cargo_id_fkey` — passava "verde" sem nunca exercitar
  -- a FK deste módulo. Mesmo defeito que a bateria de capítulos teve no CASO 3.
  DECLARE v_c_solto uuid;
  BEGIN
    INSERT INTO public.cargos (nome) VALUES ('BATERIA INV CARGO SOLTO') RETURNING id INTO v_c_solto;
    INSERT INTO public.documentos_investidura (edital_id, cargo_id, nome_documento)
    VALUES (v_ed_acs, v_c_solto, 'Diploma específico deste cargo');
    BEGIN
      DELETE FROM public.cargos WHERE id = v_c_solto;
      RAISE NOTICE 'CASO 10 🔴 FALHOU — apagou o cargo com documento';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 10 (apagar cargo com documento) RECUSADO por %  %', v_con,
        CASE WHEN v_con='documentos_investidura_cargo_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;
  END;
END $$;

ROLLBACK;

SELECT 'CASO 11' AS caso,
       (SELECT count(*) FROM public.documentos_investidura) AS linhas_apos_rollback,
       'esperado 0' AS veredito;
