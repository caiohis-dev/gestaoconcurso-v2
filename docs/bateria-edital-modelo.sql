-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Editais: o EDITAL MODELO e a clonagem
-- migrations 20260918103305_editais_campos_escalares_do_documento
--            20260918183433_editais_modelo_padrao_e_clonagem
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- 🔴 O QUE ESTA BATERIA COBRE E A SUÍTE NÃO ALCANÇA: o índice único parcial que limita o
-- modelo a UM, os dois triggers de coerência (EM010/EM011), as cinco guardas da RPC
-- (EM001–EM005), a atomicidade da cópia, os GRANTs, a RLS — e as 5 colunas escalares da
-- rodada 0, que ficaram sem bateria quando nasceram. `npm test` mocka o Supabase: lá
-- qualquer string passa por uuid, nenhuma policy é avaliada e nenhuma função existe.
--
-- ⚠️ O TEXTO DO MODELO NÃO SE TESTA AQUI. Nas rodadas 2 a 20, cada capítulo entra por
-- migration e é conferido por teste de código (literal proibido, marcador no catálogo,
-- numeração contra o Edital 004). O banco guarda o texto; não tem opinião sobre ele.
--
-- COMO A SESSÃO É SIMULADA: `auth.uid()` lê o `sub` de `request.jwt.claims`; os casos de
-- permissão usam `set_config(..., true)` + `SET LOCAL ROLE authenticated`.
--
-- Como rodar (o container muda de nome por projeto):
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-edital-modelo.sql
--
-- ⚠️ Roda em TRANSAÇÃO com ROLLBACK: não deixa edital nem artigo para trás.

\set ON_ERROR_STOP off
BEGIN;

-- ── CASO 0 — o índice do modelo existe, é ÚNICO e é PARCIAL ──────────────────────────
-- Parcial é o ponto: sem o `WHERE eh_modelo`, todas as linhas com `false` colidiriam na
-- mesma chave `(true)` e o banco só aceitaria um edital no sistema inteiro.
SELECT 'CASO 0' AS caso, i.relname AS indice, ix.indisunique AS unico,
       (ix.indpred IS NOT NULL) AS parcial,
       CASE WHEN ix.indisunique AND ix.indpred IS NOT NULL
            THEN 'OK — único e parcial: no máximo um modelo, e os demais editais livres'
            ELSE '🔴 FALHOU' END AS veredito
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
WHERE ix.indrelid = 'public.editais'::regclass AND i.relname = 'editais_um_modelo_key';

-- ── CASO 0b — as 5 colunas escalares da rodada 0 existem e são ANULÁVEIS ─────────────
-- Anuláveis não é descuido: produção tem 3 editais que não conhecem nenhum destes valores,
-- e o dump carrega DEPOIS das migrations. Um NOT NULL aqui quebraria todo `db reset`.
SELECT 'CASO 0b' AS caso, column_name, data_type, is_nullable,
       CASE WHEN is_nullable = 'YES' THEN 'OK' ELSE '🔴 FALHOU — NOT NULL quebra o db reset' END AS veredito
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'editais'
  AND column_name IN ('site_oficial','executora_endereco','signatario_nome','signatario_cargo','data_publicacao')
ORDER BY column_name;

-- ── CASO 0c — a RPC é SECURITY INVOKER ──────────────────────────────────────────────
-- 🔴 DEFINER aqui criaria uma segunda cópia da regra de quem pode escrever — o padrão que
-- já quebrou o superadmin três vezes neste repo.
SELECT 'CASO 0c' AS caso, p.proname, p.prosecdef AS definer,
       CASE WHEN NOT p.prosecdef THEN 'OK — INVOKER: a autorização são as policies'
            ELSE '🔴 FALHOU — virou DEFINER' END AS veredito
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'aplicar_edital_modelo';

-- ── CASO 0d — `anon` não executa a RPC ──────────────────────────────────────────────
SELECT 'CASO 0d' AS caso,
       has_function_privilege('anon', 'public.aplicar_edital_modelo(uuid,text[])', 'EXECUTE') AS anon_executa,
       has_function_privilege('authenticated', 'public.aplicar_edital_modelo(uuid,text[])', 'EXECUTE') AS auth_executa,
       CASE WHEN NOT has_function_privilege('anon', 'public.aplicar_edital_modelo(uuid,text[])', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.aplicar_edital_modelo(uuid,text[])', 'EXECUTE')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito;

-- ── CASO 1 — existe exatamente UM modelo, e é o UUID fixo ───────────────────────────
-- ⚠️ `min(id::text)`, não `min(id)`: não existe `min(uuid)` no Postgres.
SELECT 'CASO 1' AS caso, count(*) AS modelos,
       min(id::text) AS id,
       CASE WHEN count(*) = 1 AND min(id::text) = '00000000-0000-4000-8000-000000000001'
            THEN 'OK — a linha da migration, com o UUID fixo'
            ELSE '🔴 FALHOU' END AS veredito
FROM public.editais WHERE eh_modelo;

DO $$
DECLARE
  v_modelo    UUID;
  v_destino   UUID;
  v_outro     UUID;
  v_prova     UUID;
  v_comum     UUID;
  v_admin     UUID;
  v_n         INTEGER;
  v_msg       TEXT;
  v_con       TEXT;
  v_aplicado  TIMESTAMPTZ;
  v_versao    TEXT;
  -- 🔴 CONTADO, nunca cravado. O modelo cresce uma rodada de capítulo por vez (19 delas):
  -- um número fixo aqui faria esta bateria quebrar em toda rodada, e o conserto fácil seria
  -- atualizar o número — perdendo o que o caso afirma. Medir o modelo é o que a torna
  -- estável e ainda assim exata.
  v_no_modelo INTEGER;
BEGIN
  SELECT id, modelo_versao INTO v_modelo, v_versao FROM public.editais WHERE eh_modelo;
  SELECT ur.user_id INTO v_admin FROM public.user_roles ur WHERE ur.role = 'admin'::app_role LIMIT 1;
  SELECT ur.user_id INTO v_comum
    FROM public.user_roles ur
   WHERE NOT public.has_role(ur.user_id, 'admin'::app_role)
   LIMIT 1;

  -- A sessão dos casos de dado é a de um admin: a RLS de `edital_itens` exige.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- Dois editais de trabalho, criados na hora. ⚠️ Criados AQUI e não reaproveitados: com
  -- edital existente, o CASO 7 seria barrado por `provas_edital_id_fkey` e passaria verde
  -- sem exercitar o trigger — foi exatamente o defeito da primeira versão do CASO 3 da
  -- bateria de capítulos.
  INSERT INTO public.editais (nome) VALUES ('BATERIA modelo destino') RETURNING id INTO v_destino;
  INSERT INTO public.editais (nome) VALUES ('BATERIA modelo outro')   RETURNING id INTO v_outro;

  -- Texto no modelo, para haver o que clonar. Um artigo COM âncora e um `quadro`.
  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora)
  VALUES (v_modelo, 'disposicoes_preliminares', 0, 0, 'item', 'O Processo Seletivo…', 'objeto'),
         (v_modelo, 'disposicoes_preliminares', 1, 0, 'item', 'Prova em {{campo:cronograma_prova_objetiva}}.', NULL),
         (v_modelo, 'prova_de_titulos',         0, 0, 'item', 'Capítulo que nasce DESLIGADO.', 'titulos_base');
  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, nivel, tipo, texto, quadro_fonte)
  VALUES (v_modelo, 'quadro_de_cargos', 0, 0, 'quadro', 'QUADRO I', 'cargos');

  -- ══ A CLONAGEM ════════════════════════════════════════════════════════════════════

  -- Quantos artigos o modelo tem AGORA: os 4 da fixture acima mais os que as migrations de
  -- capítulo semearam.
  SELECT count(*) INTO v_no_modelo FROM public.edital_itens WHERE edital_id = v_modelo;

  -- CASO 2 — aplicar num edital novo copia tudo e carimba o fato.
  v_n := public.aplicar_edital_modelo(v_destino);
  SELECT modelo_aplicado_em INTO v_aplicado FROM public.editais WHERE id = v_destino;
  RAISE NOTICE 'CASO 2 (primeira absorção) copiou % de % artigo(s) do modelo  %', v_n, v_no_modelo,
    CASE WHEN v_n = v_no_modelo AND v_aplicado IS NOT NULL
         THEN 'OK — copiou o modelo inteiro e carimbou o fato'
         ELSE '🔴 FALHOU' END;

  -- CASO 2b — ⭐ CONTROLE POSITIVO: a cópia é FIEL, coluna a coluna.
  -- Provar que "copiou 4" é metade; a outra é provar que copiou o que devia. Uma cópia que
  -- perdesse a âncora ou o `quadro_fonte` passaria no CASO 2 e quebraria o documento.
  SELECT count(*) INTO v_n
    FROM public.edital_itens d
    JOIN public.edital_itens m
      ON m.edital_id = v_modelo
     AND m.capitulo_chave = d.capitulo_chave
     AND m.ordem = d.ordem
     AND m.nivel = d.nivel
     AND m.tipo  = d.tipo
     AND m.texto IS NOT DISTINCT FROM d.texto
     AND m.ancora IS NOT DISTINCT FROM d.ancora
     AND m.quadro_fonte IS NOT DISTINCT FROM d.quadro_fonte
   WHERE d.edital_id = v_destino;
  RAISE NOTICE 'CASO 2b (cópia fiel) % de % batem em TODAS as colunas  %', v_n, v_no_modelo,
    CASE WHEN v_n = v_no_modelo THEN 'OK' ELSE '🔴 FALHOU — a cópia perdeu campo' END;

  -- CASO 2c — ⭐ CONTROLE: a versão gravada é a DO MODELO, não uma que o cliente mandou.
  -- §8: "parâmetro que o chamador envia não é identidade" — e versão declarada pelo cliente
  -- é a mesma classe de erro, com o agravante de ficar gravada como se fosse fato.
  SELECT modelo_versao INTO v_msg FROM public.editais WHERE id = v_destino;
  RAISE NOTICE 'CASO 2c (versão herdada) [%] vs modelo [%]  %', v_msg, v_versao,
    CASE WHEN v_msg = v_versao THEN 'OK — lida do modelo' ELSE '🔴 FALHOU' END;

  -- CASO 2d — 🔴 `edital_capitulos` continua VAZIO para o destino.
  -- Guarda a decisão: o modelo NÃO copia override de capítulo. Se copiasse, ligaria
  -- `distribuicao_geografica` em todo edital novo — a peculiaridade do Edital 004 virando
  -- padrão de todos, que é o mapa carreira→funcionalidade recusado em 2026-09-16.
  SELECT count(*) INTO v_n FROM public.edital_capitulos WHERE edital_id = v_destino;
  RAISE NOTICE 'CASO 2d (sem override de capítulo) % linha(s)  %', v_n,
    CASE WHEN v_n = 0 THEN 'OK — capítulo sem linha vale pelo padrão do catálogo'
         ELSE '🔴 FALHOU — o modelo passou a decidir o que fica ligado' END;

  -- CASO 2e — ⭐ CONTROLE: o capítulo que nasce DESLIGADO também recebeu texto.
  -- Texto em capítulo desligado fica dormente e aparece quando o autor liga o capítulo. Se
  -- a clonagem "otimizar" e pular os desligados, quem ligar Prova de Títulos acha branco.
  --
  -- ⚠️ CONTADO CONTRA O MODELO, nunca cravado — e esta linha é a prova de por que a regra
  -- existe. Até 2026-09-19 o caso comparava com `= 1`, o único artigo que a FIXTURE insere;
  -- a rodada 19 transcreveu o capítulo (28 artigos) e ele passou a achar 29 e a REPROVAR uma
  -- clonagem correta. O número certo é sempre "o que o modelo tem".
  SELECT count(*) INTO v_no_modelo
    FROM public.edital_itens WHERE edital_id = v_modelo AND capitulo_chave = 'prova_de_titulos';
  SELECT count(*) INTO v_n
    FROM public.edital_itens WHERE edital_id = v_destino AND capitulo_chave = 'prova_de_titulos';
  RAISE NOTICE 'CASO 2e (capítulo desligado tem texto) % de %  %', v_n, v_no_modelo,
    CASE WHEN v_n = v_no_modelo AND v_n > 0 THEN 'OK — dormente, não ausente' ELSE '🔴 FALHOU' END;

  -- CASO 3 — EM002: segunda aplicação TOTAL é recusada.
  BEGIN
    PERFORM public.aplicar_edital_modelo(v_destino);
    RAISE NOTICE 'CASO 3 (segunda absorção total) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN sqlstate 'EM002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 3 (segunda absorção total) RECUSADA por EM002 OK — %', left(v_msg, 70);
  END;

  -- CASO 4 — EM003: capítulo alvo com texto é recusado, NOMEANDO a chave.
  -- A mensagem importa tanto quanto a recusa: "não foi possível" mandaria o autor procurar
  -- em 19 capítulos qual tem texto.
  BEGIN
    PERFORM public.aplicar_edital_modelo(v_destino, ARRAY['prova_de_titulos']);
    RAISE NOTICE 'CASO 4 (capítulo ocupado) 🔴 FALHOU — sobrescreveu';
  EXCEPTION WHEN sqlstate 'EM003' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 4 (capítulo ocupado) RECUSADO por EM003  %',
      CASE WHEN v_msg LIKE '%prova_de_titulos%' THEN 'OK — nomeia a chave'
           ELSE '🔴 recusou sem dizer qual: ' || left(v_msg, 60) END;
  END;

  -- CASO 4b — ⭐ CONTROLE POSITIVO: capítulo VAZIO é aplicado, mesmo com o edital já
  -- absorvido. É o que faz uma rodada nova alcançar um edital que já existe, sem migration
  -- de dados. Sem este caso, alguém "endureceria" o EM002 para valer também no alvo.
  -- ⚠️ CONTADO, nunca cravado — pelo mesmo motivo do CASO 2. Este caso já quebrou uma vez por
  -- cravar `1`: a rodada 4 transcreveu `quadro_de_cargos` e o capítulo passou a ter 4 artigos
  -- no modelo, mais o da fixture. O conserto fácil seria trocar o número; medir é o que torna
  -- o caso estável ao longo das 19 rodadas e ainda assim exato.
  DELETE FROM public.edital_itens WHERE edital_id = v_destino AND capitulo_chave = 'quadro_de_cargos';
  SELECT count(*) INTO v_no_modelo FROM public.edital_itens
   WHERE edital_id = v_modelo AND capitulo_chave = 'quadro_de_cargos';
  v_n := public.aplicar_edital_modelo(v_destino, ARRAY['quadro_de_cargos']);
  RAISE NOTICE 'CASO 4b (capítulo vazio, edital já absorvido) copiou % de %  %', v_n, v_no_modelo,
    CASE WHEN v_n = v_no_modelo THEN 'OK — a porta da rodada nova está aberta' ELSE '🔴 FALHOU' END;

  -- CASO 5 — EM004: o modelo não absorve a si mesmo.
  BEGIN
    PERFORM public.aplicar_edital_modelo(v_modelo);
    RAISE NOTICE 'CASO 5 (modelo em si mesmo) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN sqlstate 'EM004' THEN
    RAISE NOTICE 'CASO 5 (modelo em si mesmo) RECUSADO por EM004 OK';
  END;

  -- CASO 6 — EM001: destino inexistente.
  BEGIN
    PERFORM public.aplicar_edital_modelo('00000000-0000-4000-8000-00000000dead');
    RAISE NOTICE 'CASO 6 (destino inexistente) 🔴 FALHOU';
  EXCEPTION WHEN sqlstate 'EM001' THEN
    RAISE NOTICE 'CASO 6 (destino inexistente) RECUSADO por EM001 OK';
  END;

  -- CASO 6b — 🔴 A COLISÃO DE ÂNCORA ABORTA A CÓPIA INTEIRA.
  -- É o caso mais importante da bateria: a diferença entre "o edital ficou com o documento"
  -- e "o edital ficou com meio capítulo". O índice parcial `edital_itens_ancora_key` levanta
  -- 23505 dentro da função, e como a função É a transação, nada entra.
  --
  -- ⚠️ MEDIDO ao escrever este caso, e ele corrigiu o desenho do teste: numa aplicação
  -- TOTAL a colisão é INALCANÇÁVEL, porque o EM003 confere todos os capítulos e recusa antes
  -- de chegar ao INSERT. A colisão só existe na aplicação POR CAPÍTULO — e aí é um cenário
  -- real: o autor escreveu, em OUTRO capítulo, um artigo com a âncora que o capítulo do
  -- modelo publica. A primeira versão deste caso aplicava o documento inteiro e morria no
  -- EM003, afirmando cobrir a atomicidade sem nunca exercitá-la.
  -- ⚠️ O artigo entra FORA do bloco de exceção. Um `BEGIN … EXCEPTION` do PL/pgSQL é uma
  -- SUBTRANSAÇÃO: ao capturar o erro, tudo que aconteceu dentro dele volta atrás — inclusive
  -- este INSERT. A primeira versão o punha lá dentro, e o CASO 6c media zero artigos e
  -- acusava "a recusa deixou dado pela metade", quando o que tinha sumido era a fixture.
  INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, tipo, texto, ancora)
  VALUES (v_outro, 'disposicoes_gerais', 0, 'item', 'Artigo próprio com a âncora do modelo.', 'objeto');

  BEGIN
    PERFORM public.aplicar_edital_modelo(v_outro, ARRAY['disposicoes_preliminares']);
    RAISE NOTICE 'CASO 6b (âncora colidindo) 🔴 FALHOU — foi aceita';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 6b (âncora colidindo) RECUSADA por %/%  %', SQLSTATE, v_con,
      CASE WHEN v_con = 'edital_itens_ancora_key' THEN 'OK' ELSE '🔴 barrou outra regra' END;
  END;

  -- CASO 6c — ⭐ CONTROLE: depois da recusa, o destino tem SÓ o que já tinha.
  -- Sem este caso, o 6b passaria verde com a cópia deixando metade dos artigos.
  SELECT count(*) INTO v_n FROM public.edital_itens WHERE edital_id = v_outro;
  RAISE NOTICE 'CASO 6c (nada entrou após a recusa) % artigo(s)  %', v_n,
    CASE WHEN v_n = 1 THEN 'OK — só o artigo próprio; a cópia abortou inteira'
         ELSE '🔴 FALHOU — a recusa deixou dado pela metade' END;

  -- ══ OS TRIGGERS DE COERÊNCIA ══════════════════════════════════════════════════════

  -- CASO 7 — EM010: prova não aponta para o modelo.
  BEGIN
    INSERT INTO public.provas (prova_edital, edital_id)
    VALUES ('BATERIA no modelo', v_modelo);
    RAISE NOTICE 'CASO 7 (prova no modelo) 🔴 FALHOU — foi aceita';
  EXCEPTION
    WHEN sqlstate 'EM010' THEN
      RAISE NOTICE 'CASO 7 (prova no modelo) RECUSADA por EM010 OK';
    WHEN others THEN
      RAISE NOTICE 'CASO 7 (prova no modelo) recusada por OUTRO erro: % %', SQLSTATE, left(SQLERRM, 60);
  END;

  -- CASO 7b — ⭐ CONTROLE POSITIVO: prova sob edital COMUM passa.
  -- Sem ele, um trigger escrito largo (recusando toda prova) passaria no CASO 7.
  BEGIN
    INSERT INTO public.provas (prova_edital, edital_id)
    VALUES ('BATERIA legitima', v_destino)
    RETURNING id INTO v_prova;
    RAISE NOTICE 'CASO 7b (prova sob edital comum) ACEITA OK';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'CASO 7b (prova sob edital comum) 🔴 FALHOU — recusou o caso legítimo: % %',
      SQLSTATE, left(SQLERRM, 60);
  END;

  -- CASO 8 — EM011: edital com prova não vira modelo.
  BEGIN
    UPDATE public.editais SET eh_modelo = true WHERE id = v_destino;
    RAISE NOTICE 'CASO 8 (promover edital com prova) 🔴 FALHOU — foi aceito';
  EXCEPTION
    WHEN sqlstate 'EM011' THEN
      RAISE NOTICE 'CASO 8 (promover edital com prova) RECUSADO por EM011 OK';
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      RAISE NOTICE 'CASO 8 (promover edital com prova) recusado por %, NÃO pelo trigger — o caso não exercitou a regra', v_con;
  END;

  -- CASO 8b — EM011 não barra edital LIMPO… mas o índice único, sim.
  -- Dois modelos são impossíveis, e é o índice do CASO 0 que diz isso. Aqui se prova que o
  -- trigger deixa passar (o edital está limpo) e quem barra é o índice — regras diferentes,
  -- motivos diferentes. É o padrão "CHECK nova pode OFUSCAR CHECK antiga" do §8, invertido:
  -- confirmar QUEM barrou, não só que houve recusa.
  BEGIN
    UPDATE public.editais SET eh_modelo = true WHERE id = v_outro;
    RAISE NOTICE 'CASO 8b (segundo modelo) 🔴 FALHOU — o banco aceitou DOIS modelos';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE NOTICE 'CASO 8b (segundo modelo) RECUSADO por %  %', v_con,
      CASE WHEN v_con = 'editais_um_modelo_key' THEN 'OK — o índice parcial, não o trigger'
           ELSE '🔴 barrou outra regra' END;
  END;

  -- ══ RLS ═══════════════════════════════════════════════════════════════════════════

  -- CASO 9 — não-admin autenticado NÃO clona. Prova o INVOKER na prática: se a função
  -- virasse DEFINER, este caso passaria a inserir com os privilégios do dono.
  IF v_comum IS NULL THEN
    RAISE NOTICE 'CASO 9 NÃO EXERCITADO — não há usuário sem admin no banco';
  ELSE
    DECLARE
      v_terceiro UUID;
    BEGIN
      INSERT INTO public.editais (nome) VALUES ('BATERIA modelo rls') RETURNING id INTO v_terceiro;
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum)::text, true);
        SET LOCAL ROLE authenticated;
        PERFORM public.aplicar_edital_modelo(v_terceiro);
        RESET ROLE;
        RAISE NOTICE 'CASO 9 (não-admin clona) 🔴 FALHOU — a RLS deixou passar';
      -- 🔴 MEDIDO: o não-admin para em EM001 ("edital não encontrado"), não em 42501.
      -- O motivo é do Postgres e vale saber: `SELECT … FOR UPDATE` é filtrado pela policy de
      -- UPDATE, que aqui exige `has_role(…, 'admin')`. A linha simplesmente não aparece, o
      -- `NOT FOUND` dispara, e a função recusa antes de qualquer escrita. A proteção é
      -- DUPLA — se passasse daqui, o INSERT em `edital_itens` cairia na RLS —, e o caso
      -- aceita as duas siglas para não afirmar um caminho que pode mudar.
      EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' OR sqlstate 'EM001' THEN
        RESET ROLE;
        RAISE NOTICE 'CASO 9 (não-admin clona) RECUSADO por % OK — %', SQLSTATE,
          CASE WHEN SQLSTATE = 'EM001' THEN 'o FOR UPDATE não vê a linha sob a policy de UPDATE'
               ELSE 'a RLS barrou a escrita' END;
      END;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
    END;
  END IF;
  -- ══ O TEXTO QUE AS MIGRATIONS DE CAPÍTULO SEMEARAM ════════════════════════════════
  --
  -- ⚠️ Aqui NÃO se testa o conteúdo — isso é de `edital-modelo.test.ts`, com o Edital 004
  -- como controle. O que só o banco sabe é se a semeadura CHEGOU e se ela é idempotente.

  -- CASO 10 — o modelo tem artigo e versão, vindos das migrations de capítulo.
  -- ⚠️ Conta os artigos SEMEADOS, descontando os que esta bateria inseriu.
  SELECT count(*) INTO v_n
    FROM public.edital_itens
   WHERE edital_id = v_modelo
     AND capitulo_chave NOT IN ('disposicoes_preliminares', 'prova_de_titulos', 'quadro_de_cargos');
  -- ⚠️ A exclusão acima são as chaves que a FIXTURE desta bateria usa. Se uma rodada futura
  -- transcrever um desses capítulos, tire-o da lista — senão este caso passa a ignorar texto
  -- semeado de verdade e vira fantasma.
  SELECT modelo_versao INTO v_msg FROM public.editais WHERE eh_modelo;
  RAISE NOTICE 'CASO 10 (semeadura chegou) % artigo(s), versão [%]  %', v_n, v_msg,
    CASE WHEN v_n >= 1 AND v_msg <> '0.0' THEN 'OK — as migrations de capítulo correram'
         ELSE '🔴 FALHOU — o modelo está vazio; migration de capítulo não aplicada' END;

  -- CASO 10b — 🔴 REEXECUTAR o bloco do capítulo é NO-OP.
  -- É a guarda `NOT EXISTS` por CAPÍTULO. Sem ela, um `db reset` duplicaria o texto a cada
  -- execução — e com âncora no capítulo, o índice único abortaria a migration, quebrando
  -- todo reset. Este caso roda o mesmo INSERT guardado que a migration roda.
  DECLARE
    v_antes INTEGER;
    v_depois INTEGER;
  BEGIN
    SELECT count(*) INTO v_antes FROM public.edital_itens
     WHERE edital_id = v_modelo AND capitulo_chave = 'preambulo';

    IF NOT EXISTS (SELECT 1 FROM public.edital_itens
                   WHERE edital_id = v_modelo AND capitulo_chave = 'preambulo') THEN
      INSERT INTO public.edital_itens (edital_id, capitulo_chave, ordem, nivel, tipo, texto)
      VALUES (v_modelo, 'preambulo', 0, 0, 'prosa', 'duplicata que não deveria entrar');
    END IF;

    SELECT count(*) INTO v_depois FROM public.edital_itens
     WHERE edital_id = v_modelo AND capitulo_chave = 'preambulo';
    RAISE NOTICE 'CASO 10b (reexecução do capítulo) antes % depois %  %', v_antes, v_depois,
      CASE WHEN v_antes = v_depois THEN 'OK — no-op, a guarda por capítulo funciona'
           ELSE '🔴 FALHOU — o texto duplicaria a cada db reset' END;
  END;
END $$;

ROLLBACK;
