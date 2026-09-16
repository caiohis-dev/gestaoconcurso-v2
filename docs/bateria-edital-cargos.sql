-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3, fatia 2: o Quadro I (cargos, vagas, remuneração)
-- migration 20260916184254_editais_cargos_vagas_e_cg001_por_nome
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Roadmap: my_rules/analises/roadmap-editais-cargos-vagas-remuneracao.yaml
--
-- 🔴 A CG001 FOI ESTREITADA PELA SEGUNDA VEZ nesta fatia, e os casos que provam isso
-- estão em `docs/bateria-cargos.sql` (4b.1, 4b.3 e 4b.3b) — é lá que a regra mora. Aqui
-- ficam as tabelas NOVAS. Rodar as duas.
--
-- ⚠️ A REGRA DAS COTAS NÃO SE TESTA AQUI: ela é função pura no cliente
-- (`src/lib/edital-cotas.ts`), com os 22 valores reais dos Editais 002 e 003 como
-- fixture. O banco só guarda o resultado e confere que a soma fecha — que é o que este
-- arquivo verifica.
--
-- Como rodar (o container muda de nome por projeto):
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-edital-cargos.sql
--
-- ⚠️ Roda em TRANSAÇÃO com ROLLBACK.

\set ON_ERROR_STOP off
BEGIN;

-- ── CASO 0 — as duas FKs são RESTRICT ────────────────────────────────────────────────
SELECT 'CASO 0' AS caso, c.conname,
       (SELECT relname FROM pg_class WHERE oid = c.confrelid) AS aponta_para,
       CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' ELSE c.confdeltype::text END AS on_delete,
       CASE WHEN c.confdeltype = 'r' THEN 'OK' ELSE '🔴 FALHOU — CASCADE por omissão' END AS veredito
FROM pg_constraint c
WHERE c.conrelid = 'public.edital_cargos'::regclass AND c.contype = 'f'
  AND c.conname NOT LIKE '%created_by%'
ORDER BY c.conname;

-- ── CASO 0b — `anon` não lê ──────────────────────────────────────────────────────────
SELECT 'CASO 0b' AS caso,
       has_table_privilege('anon', 'public.edital_cargos', 'SELECT') AS anon_le,
       has_table_privilege('authenticated', 'public.edital_cargos', 'SELECT') AS auth_le,
       CASE WHEN NOT has_table_privilege('anon', 'public.edital_cargos', 'SELECT')
             AND has_table_privilege('authenticated', 'public.edital_cargos', 'SELECT')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito;

DO $$
DECLARE
  v_edital uuid; v_cargo uuid; v_cargo2 uuid; v_admin uuid; v_comum uuid;
  v_con text; v_n int;
BEGIN
  SELECT id INTO v_edital FROM public.editais ORDER BY created_at LIMIT 1;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA EC ENFERMEIRO') RETURNING id INTO v_cargo;
  INSERT INTO public.cargos (nome) VALUES ('BATERIA EC AGENTE') RETURNING id INTO v_cargo2;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u WHERE NOT public.has_role(u.id,'admin'::app_role) LIMIT 1;

  -- CASO 1 — ⭐ CONTROLE POSITIVO: o Quadro I do Edital 003 (Técnico em Enfermagem),
  --          com os números REAIS. É o caso que prova que o modelo cabe no mundo.
  INSERT INTO public.edital_cargos
    (edital_id, cargo_id, codigo_inscricao, vagas_total, vagas_ampla_concorrencia, vagas_pcd, vagas_negros, vencimento_base)
  VALUES (v_edital, v_cargo, 'TE 5', 155, 108, 16, 31, 1621.00);
  RAISE NOTICE 'CASO 1 (Quadro I real do Edital 003) OK — 155 = 108 + 16 + 31';

  -- CASO 2 — 🔴 a soma que NÃO fecha é recusada PELO BANCO, não só pela tela.
  BEGIN
    INSERT INTO public.edital_cargos
      (edital_id, cargo_id, vagas_total, vagas_ampla_concorrencia, vagas_pcd, vagas_negros)
    VALUES (v_edital, v_cargo2, 100, 80, 10, 5);
    RAISE NOTICE 'CASO 2 (soma não fecha) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (soma não fecha: 80+10+5 <> 100) RECUSADO por %  %', v_con,
      CASE WHEN v_con = 'chk_edital_cargo_vagas_somam' THEN 'OK' ELSE '🔴 outra regra' END;
  END;

  -- CASO 2b — ⭐ CONTROLE POSITIVO: vagas TODAS nulas passa (o autor ainda não preencheu).
  INSERT INTO public.edital_cargos (edital_id, cargo_id, codigo_inscricao)
  VALUES (v_edital, v_cargo2, 'AG 1');
  RAISE NOTICE 'CASO 2b (vagas ainda não preenchidas) OK — a CHECK não atrapalha a redação';

  -- CASO 3 — o mesmo cargo duas vezes no mesmo edital.
  BEGIN
    INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo);
    RAISE NOTICE 'CASO 3 (cargo repetido no edital) 🔴 FALHOU';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3 (cargo repetido no edital) RECUSADO por %  OK', v_con;
  END;

  -- CASO 4 — RESTRICT: cargo usado por um edital não some do catálogo.
  BEGIN
    DELETE FROM public.cargos WHERE id = v_cargo;
    RAISE NOTICE 'CASO 4 (apagar cargo em uso) 🔴 FALHOU';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (apagar cargo em uso) RECUSADO por %  %', v_con,
      CASE WHEN v_con = 'edital_cargos_cargo_id_fkey' THEN 'OK' ELSE '🔴 barrou OUTRA regra' END;
  END;

  -- CASO 5 — domínios fechados de `cargos`.
  BEGIN
    UPDATE public.cargos SET escolaridade_minima = 'POS_DOUTORADO' WHERE id = v_cargo;
    RAISE NOTICE 'CASO 5 (escolaridade inválida) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 5 (escolaridade inválida) RECUSADO  OK';
  END;
  BEGIN
    UPDATE public.cargos SET conselho_classe_obrigatorio = 'CONSELHO_INVENTADO' WHERE id = v_cargo;
    RAISE NOTICE 'CASO 5b (conselho inválido) 🔴 FALHOU';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 5b (conselho inválido) RECUSADO  OK';
  END;
  UPDATE public.cargos SET escolaridade_minima='SUPERIOR', conselho_classe_obrigatorio='COREN' WHERE id = v_cargo;
  UPDATE public.cargos SET escolaridade_minima='MEDIO', conselho_classe_obrigatorio='NENHUM' WHERE id = v_cargo2;
  RAISE NOTICE 'CASO 5c (valores válidos, inclusive NENHUM) OK — controle positivo';

  -- CASO 5d — ⚠️ NENHUM e NULL são estados DIFERENTES, e a fatia 8 depende disso.
  SELECT count(*) INTO v_n FROM public.cargos
   WHERE id IN (v_cargo, v_cargo2) AND conselho_classe_obrigatorio IS NOT NULL;
  RAISE NOTICE 'CASO 5d (NENHUM não é NULL) preenchidos=%  %', v_n,
    CASE WHEN v_n = 2 THEN 'OK — "não exige conselho" é afirmação, não ausência' ELSE '🔴 FALHOU' END;

  -- CASO 6 — 🔴 RLS: quem não é admin não escreve no Quadro I.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum, 'role','authenticated')::text, true);
  BEGIN
    INSERT INTO public.edital_cargos (edital_id, cargo_id) VALUES (v_edital, v_cargo2);
    RAISE NOTICE 'CASO 6 (não-admin escreve) 🔴 FALHOU — a RLS deixou passar';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR unique_violation THEN
    RAISE NOTICE 'CASO 6 (não-admin escreve) RECUSADO por %  OK', SQLSTATE;
  END;
  SELECT count(*) INTO v_n FROM public.edital_cargos;
  RAISE NOTICE 'CASO 6b (não-admin LÊ) linhas=%  OK — SELECT aberto, como em editais', v_n;
  RESET ROLE;
END $$;

ROLLBACK;

SELECT 'CASO 7' AS caso, count(*) AS linhas_apos_rollback,
       CASE WHEN count(*) = 0 THEN 'OK — nada ficou para trás' ELSE '⚠️ sobrou linha' END AS veredito
FROM public.edital_cargos;
