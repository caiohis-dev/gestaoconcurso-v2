-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais v3: o ARTIGO como registro próprio
-- migration 20260916225307_editais_artigos_por_registro
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Roadmap: my_rules/analises/roadmap-editais-artigos-por-registro.yaml
--
-- 🔴 O QUE ESTA BATERIA COBRE E A SUÍTE NÃO ALCANÇA: a FK RESTRICT, o índice único
-- parcial da âncora, as 7 CHECKs, os GRANTs, a RLS e a RPC de reordenação — inclusive a
-- prova de que ela roda EM TRANSAÇÃO. `npm test` mocka o Supabase: lá qualquer string
-- passa por uuid, nenhuma policy é avaliada e nenhuma função do banco existe.
--
-- ⚠️ A NUMERAÇÃO NÃO SE TESTA AQUI, e é desenho: `7.1`, `7.2.1` e a alínea `a)` são
-- calculados no cliente (`src/lib/edital-itens.ts`), cobertos por `edital-itens.test.ts`
-- com o capítulo 6 do Edital 002/2026 como controle positivo. O banco guarda `ordem` e
-- `nivel`, nunca o número.
--
-- COMO A SESSÃO É SIMULADA: `auth.uid()` lê o `sub` de `request.jwt.claims`; os casos de
-- permissão usam `set_config(..., true)` + `SET LOCAL ROLE authenticated`.
--
-- Como rodar (o container muda de nome por projeto):
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-edital-itens.sql
--
-- ⚠️ Roda em TRANSAÇÃO com ROLLBACK: não deixa edital nem artigo para trás.

\set ON_ERROR_STOP off
BEGIN;

-- ── CASO 0 — a FK aponta para onde se diz, e é RESTRICT ──────────────────────────────
SELECT 'CASO 0' AS caso, c.conname,
       (SELECT relname FROM pg_class WHERE oid = c.confrelid) AS aponta_para,
       CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
                          WHEN 'a' THEN 'NO ACTION' ELSE c.confdeltype::text END AS on_delete,
       CASE WHEN (SELECT relname FROM pg_class WHERE oid = c.confrelid) = 'editais'
             AND c.confdeltype = 'r'
            THEN 'OK — RESTRICT: o artigo é texto redigido, não some em silêncio'
            ELSE '🔴 FALHOU' END AS veredito
FROM pg_constraint c
WHERE c.conrelid = 'public.edital_itens'::regclass AND c.contype = 'f'
  AND c.conname LIKE '%edital_id%';

-- ── CASO 0b — `numero` NÃO é coluna, nem aqui nem no capítulo ────────────────────────
-- É o invariante central do módulo, e agora vale nos DOIS níveis.
SELECT 'CASO 0b' AS caso, table_name,
       count(*) FILTER (WHERE column_name = 'numero') AS coluna_numero,
       CASE WHEN count(*) FILTER (WHERE column_name = 'numero') = 0
            THEN 'OK — o número é calculado, nunca persistido'
            ELSE '🔴 FALHOU — alguém persistiu o número' END AS veredito
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('edital_itens', 'edital_capitulos')
GROUP BY table_name ORDER BY table_name;

-- ── CASO 0c — `edital_capitulos.texto` SAIU ──────────────────────────────────────────
-- Se voltar, há duas fontes para o texto do capítulo — e a que ninguém lê é a que um dia
-- volta a ser escrita.
SELECT 'CASO 0c' AS caso,
       count(*) FILTER (WHERE column_name = 'texto') AS coluna_texto,
       CASE WHEN count(*) FILTER (WHERE column_name = 'texto') = 0
            THEN 'OK — o texto do capítulo são os registros de edital_itens'
            ELSE '🔴 FALHOU — a coluna voltou' END AS veredito
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'edital_capitulos';

-- ── CASO 0d — `anon` não lê nada; `authenticated` tem o DML ──────────────────────────
SELECT 'CASO 0d' AS caso,
       has_table_privilege('anon', 'public.edital_itens', 'SELECT') AS anon_le,
       has_table_privilege('authenticated', 'public.edital_itens', 'SELECT') AS auth_le,
       has_function_privilege('anon', 'public.reordenar_itens_do_capitulo(uuid,text,uuid[])', 'EXECUTE') AS anon_rpc,
       CASE WHEN NOT has_table_privilege('anon', 'public.edital_itens', 'SELECT')
             AND has_table_privilege('authenticated', 'public.edital_itens', 'SELECT')
             AND NOT has_function_privilege('anon', 'public.reordenar_itens_do_capitulo(uuid,text,uuid[])', 'EXECUTE')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito;

-- ── CASO 0e — a RPC é SECURITY INVOKER ───────────────────────────────────────────────
-- 🔴 Se virar DEFINER, a autorização passa a existir em DOIS lugares: nas policies e
-- dentro da função. É o padrão que já bloqueou o superadmin três vezes neste repo.
SELECT 'CASO 0e' AS caso, p.prosecdef AS security_definer,
       CASE WHEN NOT p.prosecdef
            THEN 'OK — INVOKER: a autorização são as policies, e só elas'
            ELSE '🔴 FALHOU — virou DEFINER' END AS veredito
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'reordenar_itens_do_capitulo';

-- ── CASOS 1 a 14 — comportamento ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_edital uuid;
  v_outro  uuid;
  v_admin  uuid;
  v_comum  uuid;
  v_a uuid; v_b uuid; v_c uuid;
  v_con text; v_msg text; v_n int; v_ordens text;
BEGIN
  SELECT id INTO v_edital FROM public.editais ORDER BY created_at LIMIT 1;
  SELECT id INTO v_outro  FROM public.editais WHERE id <> v_edital LIMIT 1;
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT u.id INTO v_comum FROM auth.users u
   WHERE NOT public.has_role(u.id, 'admin'::app_role) LIMIT 1;
  RAISE NOTICE '--- fixture: edital=% outro=% admin=% naoadmin=%', v_edital, v_outro, v_admin, v_comum;

  -- ══ CONTROLE POSITIVO: os três tipos de artigo entram ══════════════════════════════
  -- Prova metade nenhuma: provar que passou a recusar sem provar que continua aceitando
  -- o caso legítimo é meia verificação (CLAUDE.md §2).
  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora)
  VALUES (v_edital, 'quadro_de_cargos', 0, 0, 'item', 'Dos cargos oferecidos.', 'cargos_oferecidos')
  RETURNING id INTO v_a;
  RAISE NOTICE 'CASO 1 (artigo comum, com âncora) %', CASE WHEN v_a IS NOT NULL THEN 'OK' ELSE '🔴 FALHOU' END;

  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, nivel, tipo, texto, quadro_fonte)
  VALUES (v_edital, 'quadro_de_cargos', 1, 0, 'quadro', 'QUADRO I: DOS CARGOS, N.º DE VAGAS…', 'cargos')
  RETURNING id INTO v_b;
  RAISE NOTICE 'CASO 1b (artigo do tipo quadro) %', CASE WHEN v_b IS NOT NULL THEN 'OK' ELSE '🔴 FALHOU' END;

  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, nivel, tipo, texto)
  VALUES (v_edital, 'quadro_de_cargos', 2, 0, 'prosa', 'O envelope deverá ser entregue na Fundação…')
  RETURNING id INTO v_c;
  RAISE NOTICE 'CASO 1c (parágrafo sem número) %', CASE WHEN v_c IS NOT NULL THEN 'OK' ELSE '🔴 FALHOU' END;

  -- CASO 1d — CONTROLE POSITIVO: artigo em capítulo SEM linha em `edital_capitulos`.
  -- 🔴 É o que prova que a linha de capítulo continua sendo OVERRIDE OPCIONAL. Se um dia
  -- alguém puser uma FK composta aqui, este caso é o que cai.
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
    VALUES (v_edital, 'disposicoes_preliminares', 0, 'item', 'Artigo em capítulo sem override.');
    SELECT count(*) INTO v_n FROM public.edital_capitulos
     WHERE edital_id = v_edital AND chave = 'disposicoes_preliminares';
    RAISE NOTICE 'CASO 1d (capítulo sem linha de override tem artigo) OK — linhas de capítulo=%', v_n;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CASO 1d 🔴 FALHOU — alguém amarrou o artigo à existência da linha de capítulo';
  END;

  -- CASO 1e — CONTROLE POSITIVO: artigo com `texto` VAZIO entra.
  -- Deliberado: "Adicionar artigo" cria a linha em branco. Uma CHECK aqui obrigaria a UI
  -- a inventar um texto-placeholder — o inimigo declarado deste módulo. Quem acusa é o
  -- linter (`artigo-vazio`).
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
    VALUES (v_edital, 'quadro_de_cargos', 3, 'item', '');
    RAISE NOTICE 'CASO 1e (artigo vazio entra) OK — é achado do LINTER, não recusa do banco';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASO 1e 🔴 FALHOU — alguém pôs CHECK de não-vazio e a UI vai ter de inventar placeholder';
  END;

  -- ══ ÂNCORA ════════════════════════════════════════════════════════════════════════
  -- CASO 2 — a mesma âncora duas vezes no mesmo edital.
  -- 🔵 Até 16/09 isto era regra do LINTER (`ancora-duplicada`), ou seja, conveniência.
  -- Virou barreira: o linter não a detecta mais porque ela não pode acontecer.
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto, ancora)
    VALUES (v_edital, 'das_vagas', 0, 'item', 'Outro artigo.', 'cargos_oferecidos');
    RAISE NOTICE 'CASO 2 (âncora duplicada) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2 (âncora duplicada) RECUSADO por %/%  %', SQLSTATE, v_con,
      CASE WHEN v_con = 'edital_itens_ancora_key' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 2b — CONTROLE POSITIVO: a mesma âncora em OUTRO edital é permitida.
  IF v_outro IS NULL THEN
    RAISE NOTICE 'CASO 2b NÃO EXERCITADO — só há um edital no banco';
  ELSE
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto, ancora)
    VALUES (v_outro, 'quadro_de_cargos', 0, 'item', 'Artigo de outro edital.', 'cargos_oferecidos');
    RAISE NOTICE 'CASO 2b (mesma âncora em outro edital) OK — o índice é por edital';
  END IF;

  -- CASO 2c — CONTROLE POSITIVO: VÁRIOS artigos sem âncora convivem.
  -- 🔴 É o caso que o índice ÍNTEGRO (sem o WHERE parcial) quebraria — e quebraria o uso
  -- NORMAL, porque a esmagadora maioria dos artigos não tem âncora. Se este caso cair, o
  -- `WHERE ancora IS NOT NULL` sumiu do índice.
  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
  VALUES (v_edital, 'das_vagas', 1, 'item', 'Sem âncora A.'),
         (v_edital, 'das_vagas', 2, 'item', 'Sem âncora B.');
  RAISE NOTICE 'CASO 2c (vários artigos sem âncora) OK — o índice único é PARCIAL';

  -- CASO 2d — âncora com formato inválido.
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto, ancora)
    VALUES (v_edital, 'das_vagas', 3, 'item', 'x', 'Laudo Médico');
    RAISE NOTICE 'CASO 2d (âncora "Laudo Médico") 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 2d (âncora com espaço e maiúscula) RECUSADA por %  %', v_con,
      CASE WHEN v_con = 'chk_edital_item_ancora_formato' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- ══ TIPO E QUADRO ═════════════════════════════════════════════════════════════════
  -- CASO 3 — tipo 'quadro' SEM fonte: renderizaria um vazio silencioso.
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
    VALUES (v_edital, 'das_vagas', 4, 'quadro', 'QUADRO SEM FONTE');
    RAISE NOTICE 'CASO 3 (quadro sem fonte) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3 (quadro sem fonte) RECUSADO por %  %', v_con,
      CASE WHEN v_con = 'chk_edital_item_quadro' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 3b — o outro lado do bicondicional: fonte em artigo de TEXTO é dado morto.
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto, quadro_fonte)
    VALUES (v_edital, 'das_vagas', 5, 'item', 'Artigo comum', 'cargos');
    RAISE NOTICE 'CASO 3b (fonte em artigo de texto) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3b (fonte em artigo de texto) RECUSADO por %  %', v_con,
      CASE WHEN v_con = 'chk_edital_item_quadro' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 3c — fonte fora do domínio. 🔴 É a guarda contra tabela inventada: uma fonte
  -- nova exige FATIA nova, nunca digitação.
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto, quadro_fonte)
    VALUES (v_edital, 'das_vagas', 6, 'quadro', 'QUADRO X', 'planilha_do_word');
    RAISE NOTICE 'CASO 3c (fonte inventada) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 3c (fonte "planilha_do_word") RECUSADA por %  %', v_con,
      CASE WHEN v_con = 'chk_edital_item_quadro_fonte' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 3d — CONTROLE POSITIVO: as fontes das fatias 6 e 7, ainda sem tabela, já entram.
  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto, quadro_fonte)
  VALUES (v_edital, 'prova_de_titulos', 0, 'quadro', 'QUADRO DE TÍTULOS - DOCENTE I', 'titulos');
  RAISE NOTICE 'CASO 3d (fonte "titulos", fatia 6 ainda não feita) OK — ligar a fatia não mexe na CHECK';

  -- CASO 4 — tipo fora do domínio.
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
    VALUES (v_edital, 'das_vagas', 7, 'paragrafo', 'x');
    RAISE NOTICE 'CASO 4 (tipo inventado) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 4 (tipo "paragrafo") RECUSADO por %  %', v_con,
      CASE WHEN v_con = 'chk_edital_item_tipo' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 5 — nível fora de 0..2 (não existe quarto nível nos editais reais).
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, nivel, tipo, texto)
    VALUES (v_edital, 'das_vagas', 8, 3, 'item', 'x');
    RAISE NOTICE 'CASO 5 (nivel 3) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 5 (nivel 3) RECUSADO por %  %', v_con,
      CASE WHEN v_con = 'chk_edital_item_nivel' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 5b — CONTROLE POSITIVO: nível que PULA (alínea sem subitem) é ACEITO.
  -- Deliberado, e é o outro lado do CASO 5: o parser sempre foi tolerante, e o nível
  -- errado aparece no preview na hora. Vira AVISO do linter, não recusa.
  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, nivel, tipo, texto)
  VALUES (v_edital, 'das_vagas', 9, 2, 'item', 'Alínea sem subitem acima.');
  RAISE NOTICE 'CASO 5b (nível que pula) OK — tolerado de propósito, o linter avisa';

  -- CASO 6 — ordem negativa.
  BEGIN
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
    VALUES (v_edital, 'das_vagas', -1, 'item', 'x');
    RAISE NOTICE 'CASO 6 (ordem -1) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 6 (ordem -1) RECUSADA por %  %', v_con,
      CASE WHEN v_con = 'chk_edital_item_ordem' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 6b — CONTROLE POSITIVO: ordem REPETIDA é aceita, de propósito.
  -- Não há UNIQUE em (edital, capítulo, ordem): o empate resolve-se por `created_at`. A
  -- alternativa DEFERRABLE já foi reprovada pelo `db reset` neste repo em 03/08.
  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
  VALUES (v_edital, 'das_vagas', 9, 'item', 'Mesma ordem que o anterior.');
  RAISE NOTICE 'CASO 6b (ordem repetida) OK — sem UNIQUE, o desempate é por created_at';

  -- ══ A RPC DE REORDENAÇÃO ══════════════════════════════════════════════════════════
  -- CASO 7 — CONTROLE POSITIVO: reordenar de fato reordena.
  PERFORM public.reordenar_itens_do_capitulo(
    v_edital, 'quadro_de_cargos',
    ARRAY(SELECT id FROM public.edital_itens
           WHERE edital_id = v_edital AND capitulo_chave = 'quadro_de_cargos'
           ORDER BY ordem DESC));
  SELECT string_agg(ordem::text, ',' ORDER BY ordem) INTO v_ordens
    FROM public.edital_itens WHERE edital_id = v_edital AND capitulo_chave = 'quadro_de_cargos';
  SELECT ordem INTO v_n FROM public.edital_itens WHERE id = v_a;
  -- ⚠️ São QUATRO artigos em `quadro_de_cargos`: os CASOS 1, 1b, 1c e 1e. O CASO 3d
  -- insere em `prova_de_titulos`. Na primeira execução desta bateria eu contei cinco, e
  -- os CASOS 7, 9b, 12b e 14 acusaram falha que não existia — a asserção estava errada,
  -- não o banco.
  RAISE NOTICE 'CASO 7 (reordenar invertendo) ordens=[%]  primeiro artigo foi para %  %',
    v_ordens, v_n, CASE WHEN v_ordens = '0,1,2,3' AND v_n = 3
                        THEN 'OK — contíguo 0..n-1 e o primeiro virou último'
                        ELSE '🔴 FALHOU' END;

  -- CASO 8 — EI001: id de OUTRO capítulo na lista.
  BEGIN
    PERFORM public.reordenar_itens_do_capitulo(
      v_edital, 'quadro_de_cargos',
      ARRAY(SELECT id FROM public.edital_itens
             WHERE edital_id = v_edital AND capitulo_chave = 'quadro_de_cargos')
      || ARRAY[(SELECT id FROM public.edital_itens
                 WHERE edital_id = v_edital AND capitulo_chave = 'das_vagas' LIMIT 1)]);
    RAISE NOTICE 'CASO 8 (id de outro capítulo) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 8 (id de outro capítulo) RECUSADO  %',
      CASE WHEN v_msg LIKE 'EI001%' THEN 'OK — ' || left(v_msg, 60) ELSE '🔴 outro erro: ' || v_msg END;
  END;

  -- CASO 9 — EI002: lista incompleta deixaria buraco na numeração.
  BEGIN
    PERFORM public.reordenar_itens_do_capitulo(
      v_edital, 'quadro_de_cargos', ARRAY[v_a, v_b]);
    RAISE NOTICE 'CASO 9 (lista incompleta) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 9 (lista incompleta) RECUSADA  %',
      CASE WHEN v_msg LIKE 'EI002%' THEN 'OK — ' || left(v_msg, 60) ELSE '🔴 outro erro: ' || v_msg END;
  END;

  -- CASO 9b — 🔴 A RECUSA NÃO DEIXA ORDEM PELA METADE.
  -- É a razão de a reordenação ser RPC e não duas UPDATEs do cliente (§2). Se a função
  -- deixasse de ser atômica, este caso é o que pega — e nenhum dos anteriores pegaria.
  SELECT string_agg(ordem::text, ',' ORDER BY ordem) INTO v_ordens
    FROM public.edital_itens WHERE edital_id = v_edital AND capitulo_chave = 'quadro_de_cargos';
  RAISE NOTICE 'CASO 9b (ordem após as duas recusas) [%]  %', v_ordens,
    CASE WHEN v_ordens = '0,1,2,3' THEN 'OK — intacta' ELSE '🔴 FALHOU — a recusa mexeu no dado' END;

  -- ══ RLS ═══════════════════════════════════════════════════════════════════════════
  -- CASO 10 — não-admin autenticado NÃO escreve.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 10 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
      VALUES (v_edital, 'das_vagas', 20, 'item', 'Escrita indevida.');
      RESET ROLE;
      RAISE NOTICE 'CASO 10 (não-admin insere) 🔴 FALHOU — a RLS deixou passar';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 10 (não-admin insere) RECUSADO por % OK', SQLSTATE;
    END;
  END IF;

  -- CASO 11 — CONTROLE POSITIVO: admin autenticado ESCREVE.
  -- 🔴 Sem ele a bateria provaria só metade: uma policy que recusa todo mundo passaria
  -- no CASO 10 e deixaria o módulo inteiro travado em produção.
  IF v_admin IS NULL THEN
    RAISE NOTICE 'CASO 11 NÃO EXERCITADO — não há admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
      VALUES (v_edital, 'das_vagas', 21, 'item', 'Escrita legítima do admin.');
      RESET ROLE;
      RAISE NOTICE 'CASO 11 (admin insere) OK';
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'CASO 11 (admin insere) 🔴 FALHOU — a policy travou o admin';
    END;
  END IF;

  -- CASO 12 — a RPC roda como INVOKER: não-admin chamando-a NÃO escreve.
  -- ⚠️ Este é o caso que uma RPC SECURITY DEFINER sem checagem interna deixaria passar —
  -- e é exatamente a falha de "verify_jwt não é autorização" em outra roupa.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 12 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
      SET LOCAL ROLE authenticated;
      -- 🔴 DESC, e é o ponto do caso. Na primeira versão eu passei o array na ordem em
      -- que os artigos JÁ estavam: a reordenação seria no-op mesmo com a permissão
      -- aberta, e o CASO 12b passaria verde guardando nada. Invertendo, qualquer
      -- escrita que vazasse aparece no dado.
      PERFORM public.reordenar_itens_do_capitulo(
        v_edital, 'quadro_de_cargos',
        ARRAY(SELECT id FROM public.edital_itens
               WHERE edital_id = v_edital AND capitulo_chave = 'quadro_de_cargos'
               ORDER BY ordem DESC));
      RESET ROLE;
      -- ⚠️ A RPC NÃO levanta erro. O não-admin LÊ (a policy de SELECT é aberta a
      -- `authenticated`), então EI001 e EI002 passam; é o UPDATE que a RLS recusa em
      -- silêncio, alcançando zero linhas. Por isso a prova é o DADO, no CASO 12b —
      -- esperar uma exceção aqui seria esperar a coisa errada.
      RAISE NOTICE 'CASO 12 (não-admin reordena, pedindo inversão) — a prova é o CASO 12b';
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      RAISE NOTICE 'CASO 12 (não-admin reordena) RECUSADO — %', left(v_msg, 70);
    END;
  END IF;

  SELECT string_agg(ordem::text, ',' ORDER BY ordem) INTO v_ordens
    FROM public.edital_itens WHERE edital_id = v_edital AND capitulo_chave = 'quadro_de_cargos';
  RAISE NOTICE 'CASO 12b (ordem após o não-admin) [%]  %', v_ordens,
    CASE WHEN v_ordens = '0,1,2,3' THEN 'OK — intacta' ELSE '🔴 FALHOU — o não-admin reordenou' END;

  -- ══ FK RESTRICT ═══════════════════════════════════════════════════════════════════
  -- CASO 13 — apagar edital com artigo é recusado PELA FK DO ARTIGO.
  --
  -- ⚠️ Edital LIMPO, criado aqui. Num edital existente a recusa viria de
  -- `provas_edital_id_fkey` e o caso passaria "verde" sem exercitar nada — foi
  -- exatamente o defeito da primeira versão do CASO 3 da bateria de capítulos.
  DECLARE v_limpo uuid;
  BEGIN
    INSERT INTO public.editais (nome) VALUES ('ZZZ bateria itens ' || gen_random_uuid())
    RETURNING id INTO v_limpo;
    INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto)
    VALUES (v_limpo, 'das_vagas', 0, 'item', 'Artigo do edital limpo.');
    BEGIN
      DELETE FROM public.editais WHERE id = v_limpo;
      RAISE NOTICE 'CASO 13 (apagar edital com artigo) 🔴 FALHOU — o artigo sumiu junto';
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 13 (apagar edital com artigo) RECUSADO por %  %', v_con,
        CASE WHEN v_con = 'edital_itens_edital_id_fkey' THEN 'OK — RESTRICT, e foi ESTA FK'
             ELSE '🔴 barrou outra FK: o caso não exercita o que diz' END;
    END;

    -- CASO 13b — CONTROLE POSITIVO: sem artigo, o mesmo edital apaga.
    DELETE FROM public.edital_itens WHERE edital_id = v_limpo;
    DELETE FROM public.editais WHERE id = v_limpo;
    RAISE NOTICE 'CASO 13b (edital sem artigo apaga) OK — a FK não trava o caso legítimo';
  END;

  -- CASO 14 — apagar o CAPÍTULO (a linha de override) não arrasta os artigos.
  -- Não há FK entre eles de propósito; desligar/religar um capítulo não pode destruir
  -- texto redigido.
  DELETE FROM public.edital_capitulos WHERE edital_id = v_edital AND chave = 'quadro_de_cargos';
  SELECT count(*) INTO v_n FROM public.edital_itens
   WHERE edital_id = v_edital AND capitulo_chave = 'quadro_de_cargos';
  RAISE NOTICE 'CASO 14 (apagar override do capítulo) artigos restantes=%  %', v_n,
    CASE WHEN v_n = 4 THEN 'OK — o texto redigido sobrevive' ELSE '🔴 FALHOU' END;
END $$;

ROLLBACK;
