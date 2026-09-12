-- Bateria: concessão de acesso de coordenador
-- Migration coberta: 20260912165246_conceder_coordenador.sql
--   · RPC `conceder_coordenador(p_colaborador_prova_id uuid)`
--   · trigger `check_coordenador_prova_coerente_trigger` em `coordenadores_prova`
-- Escrita em 2026-09-12, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-conceder-coordenador.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: um teste lá afirmaria o mock, nunca a RPC nem o
-- trigger. Isto aqui é a única verificação real — e só existe quando alguém a executa.
-- ⚠️ "Ela existe" não é "ela passa": uma bateria deste repo já ficou 2 dias quebrada na
-- primeira linha, sem que nenhum dos 10 casos rodasse.
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset` (dump + seed.pos.sql). Os casos
-- escolhem as fixtures DINAMICAMENTE do dado real; o bloco 0 confere que elas existem e
-- diz qual falta. Tudo roda em transação com ROLLBACK — nada sobrevive.
--
-- O QUE ESTA BATERIA SUBSTITUI: a verificação manual da Edge Function
-- `create-coordenador`, removida no mesmo passe. Ela era Deno, fora do alcance de tudo.

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES — sem isto, "passou" não quer dizer nada             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 0.1 Os DOIS UUIDs de coordenação ainda existem'
\echo '--     ⚠️ Fragilidade conhecida: eles são literais em src/hooks/useCoordenadoresProva.tsx'
\echo '--     E NA RPC. Recriar essas linhas de funcoes_colaboradores gera id novo e esvazia'
\echo '--     a elegibilidade SEM erro. Este caso é o que dá sinal.'
SELECT CASE WHEN count(*) = 2 THEN 'OK — as 2 funções de coordenação existem'
            ELSE 'FALHOU — só ' || count(*) || ' das 2; a elegibilidade está quebrada' END AS resultado
FROM public.funcoes_colaboradores
WHERE id IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89', '8d36ef0f-becb-45f3-837b-04eea15489fb');

\echo ''
\echo '-- 0.2 A RPC existe, é SECURITY DEFINER, e o trigger está instalado'
SELECT CASE WHEN p.prosecdef THEN 'OK — conceder_coordenador é SECURITY DEFINER'
            ELSE 'FALHOU — não é SECURITY DEFINER, a autorização explícita não basta' END AS resultado
FROM pg_proc p WHERE p.proname = 'conceder_coordenador';

SELECT CASE WHEN count(*) = 1 THEN 'OK — trigger de coerência instalado'
            ELSE 'FALHOU — o trigger sumiu; a regra passa a valer só pelo caminho certo' END AS resultado
FROM pg_trigger WHERE tgname = 'check_coordenador_prova_coerente_trigger';

\echo ''
\echo '-- 0.3 `anon` não executa a RPC (o acesso dele vem de PUBLIC, não de si mesmo)'
SELECT CASE WHEN has_function_privilege('anon', 'public.conceder_coordenador(uuid)', 'EXECUTE')
            THEN 'FALHOU — anon executa a concessão'
            ELSE 'OK — anon sem EXECUTE' END AS resultado;
SELECT CASE WHEN has_function_privilege('authenticated', 'public.conceder_coordenador(uuid)', 'EXECUTE')
            THEN 'OK — authenticated executa (controle positivo do revoke)'
            ELSE 'FALHOU — revogamos de quem precisa; ninguém consegue conceder' END AS resultado;

\echo ''
\echo '-- 0.4 As fixtures de dado real que os casos abaixo consomem'
\echo '--     Zero em qualquer coluna = o caso correspondente não prova nada.'
WITH eleg AS (
  SELECT ap.id, c.user_id, c.colab_email, (cp.id IS NOT NULL) AS tem_acesso
  FROM public.colaboradores_prova ap
  JOIN public.colaboradores c ON c.id = ap.colaborador_id
  LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
  WHERE ap.funcao_id IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89','8d36ef0f-becb-45f3-837b-04eea15489fb')
)
SELECT count(*) FILTER (WHERE NOT tem_acesso AND user_id IS NOT NULL)                          AS com_conta_sem_acesso,
       count(*) FILTER (WHERE NOT tem_acesso AND user_id IS NULL AND colab_email IS NOT NULL)  AS sem_conta_com_email,
       count(*) FILTER (WHERE NOT tem_acesso AND user_id IS NULL AND colab_email IS NULL)      AS sem_conta_sem_email,
       (SELECT count(*) FROM public.user_roles WHERE role = 'admin')                           AS admins,
       (SELECT count(*) FROM public.user_roles WHERE role = 'coordenador')                     AS coordenadores
FROM eleg;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. CONTROLE POSITIVO — a concessão legítima CONTINUA passando         ║'
\echo '║    Provar que passou a recusar é metade. Esta é a outra.              ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE
  v_admin uuid;
  v_aloc  uuid;
  v_user  uuid;
  v_novo  uuid;
  v_coord_antes int; v_coord_depois int;
  v_papel_antes int;  v_papel_depois int;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;

  SELECT ap.id, c.user_id INTO v_aloc, v_user
    FROM public.colaboradores_prova ap
    JOIN public.colaboradores c ON c.id = ap.colaborador_id
    LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
   WHERE ap.funcao_id IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89','8d36ef0f-becb-45f3-837b-04eea15489fb')
     AND c.user_id IS NOT NULL AND cp.id IS NULL
   LIMIT 1;

  IF v_aloc IS NULL THEN
    RAISE NOTICE 'CASO 1: PULADO — não há elegível com conta e sem acesso no banco';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_coord_antes FROM public.coordenadores_prova;
  SELECT count(*) INTO v_papel_antes FROM public.user_roles WHERE user_id = v_user AND role = 'coordenador';

  v_novo := public.conceder_coordenador(v_aloc);

  SELECT count(*) INTO v_coord_depois FROM public.coordenadores_prova;
  SELECT count(*) INTO v_papel_depois FROM public.user_roles WHERE user_id = v_user AND role = 'coordenador';

  -- ⚠️ A CONTAGEM é a prova, não o "não deu erro": um erro pode chegar depois da escrita.
  IF v_coord_depois = v_coord_antes + 1 AND v_papel_depois = 1
     AND EXISTS (SELECT 1 FROM public.coordenadores_prova
                  WHERE id = v_novo AND user_id = v_user AND created_by = v_admin)
  THEN
    RAISE NOTICE 'CASO 1: OK — acesso concedido (% -> % linhas), papel presente, user_id = o do CADASTRO',
      v_coord_antes, v_coord_depois;
  ELSE
    RAISE NOTICE 'CASO 1: FALHOU — linhas % -> %, papel %', v_coord_antes, v_coord_depois, v_papel_depois;
  END IF;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. AS RECUSAS — e cada uma tem de NOMEAR a providência                ║'
\echo '║    Mensagem de banco que não instrui já foi dívida duas vezes aqui.   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE
  v_admin uuid; v_aloc uuid; v_msg text; v_estado text;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;

  -- 2.1 colaborador SEM conta, mas COM e-mail: a providência é ele reivindicar
  SELECT ap.id INTO v_aloc
    FROM public.colaboradores_prova ap
    JOIN public.colaboradores c ON c.id = ap.colaborador_id
    LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
   WHERE ap.funcao_id IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89','8d36ef0f-becb-45f3-837b-04eea15489fb')
     AND c.user_id IS NULL AND c.colab_email IS NOT NULL AND cp.id IS NULL
   LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  IF v_aloc IS NULL THEN
    RAISE NOTICE 'CASO 2.1: PULADO — sem fixture';
  ELSE
    BEGIN
      PERFORM public.conceder_coordenador(v_aloc);
      RAISE NOTICE 'CASO 2.1: FALHOU — concedeu a quem não tem conta (o meio-usuário voltou)';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_estado = RETURNED_SQLSTATE;
      IF v_msg LIKE '%Estou sem minha senha%' THEN
        RAISE NOTICE 'CASO 2.1: OK — recusou e MANDOU reivindicar [%]', v_estado;
      ELSE
        RAISE NOTICE 'CASO 2.1: FALHOU — recusou sem dizer o que fazer: %', v_msg;
      END IF;
    END;
  END IF;

  -- 2.2 colaborador SEM conta e SEM e-mail: providência DIFERENTE (são 255 assim)
  SELECT ap.id INTO v_aloc
    FROM public.colaboradores_prova ap
    JOIN public.colaboradores c ON c.id = ap.colaborador_id
    LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
   WHERE ap.funcao_id IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89','8d36ef0f-becb-45f3-837b-04eea15489fb')
     AND c.user_id IS NULL AND c.colab_email IS NULL AND cp.id IS NULL
   LIMIT 1;

  IF v_aloc IS NULL THEN
    RAISE NOTICE 'CASO 2.2: PULADO — sem fixture';
  ELSE
    BEGIN
      PERFORM public.conceder_coordenador(v_aloc);
      RAISE NOTICE 'CASO 2.2: FALHOU — concedeu a cadastro sem e-mail';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg LIKE '%não tem e-mail%' THEN
        RAISE NOTICE 'CASO 2.2: OK — recusou mandando CADASTRAR O E-MAIL (outra providência)';
      ELSE
        RAISE NOTICE 'CASO 2.2: FALHOU — caiu na mensagem errada: %', v_msg;
      END IF;
    END;
  END IF;

  -- 2.3 alocação que NÃO é de coordenação
  SELECT ap.id INTO v_aloc
    FROM public.colaboradores_prova ap
   WHERE ap.funcao_id IS NOT NULL
     AND ap.funcao_id NOT IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89','8d36ef0f-becb-45f3-837b-04eea15489fb')
   LIMIT 1;

  BEGIN
    PERFORM public.conceder_coordenador(v_aloc);
    RAISE NOTICE 'CASO 2.3: FALHOU — concedeu a quem não está alocado como coordenação';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%função de coordenação%' THEN
      RAISE NOTICE 'CASO 2.3: OK — recusou nomeando a função';
    ELSE
      RAISE NOTICE 'CASO 2.3: FALHOU — %', v_msg;
    END IF;
  END;

  -- 2.4 alocação inexistente
  BEGIN
    PERFORM public.conceder_coordenador('00000000-0000-0000-0000-000000000000');
    RAISE NOTICE 'CASO 2.4: FALHOU — aceitou alocação inexistente';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 2.4: OK — %', v_msg;
  END;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. AUTORIZAÇÃO — e o superadmin, que já falhou 3 vezes neste repo     ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE
  v_coord uuid; v_super uuid; v_aloc uuid; v_msg text; v_estado text;
BEGIN
  SELECT ap.id INTO v_aloc
    FROM public.colaboradores_prova ap
    JOIN public.colaboradores c ON c.id = ap.colaborador_id
    LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
   WHERE ap.funcao_id IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89','8d36ef0f-becb-45f3-837b-04eea15489fb')
     AND c.user_id IS NOT NULL AND cp.id IS NULL
   LIMIT 1;

  -- 3.1 COORDENADOR não concede acesso de coordenador
  SELECT user_id INTO v_coord FROM public.user_roles WHERE role = 'coordenador' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.conceder_coordenador(COALESCE(v_aloc, '00000000-0000-0000-0000-000000000000'));
    RAISE NOTICE 'CASO 3.1: FALHOU — coordenador concedeu acesso';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_estado = RETURNED_SQLSTATE;
    IF v_estado = '42501' THEN
      RAISE NOTICE 'CASO 3.1: OK — recusado com 42501 (%)', v_msg;
    ELSE
      RAISE NOTICE 'CASO 3.1: FALHOU — barrou por OUTRA regra [%]: %', v_estado, v_msg;
    END IF;
  END;

  -- 3.2 ⚠️ SUPERADMIN PURO. As contas de superadmin do banco local TAMBÉM têm linha
  --     `admin`, então usá-las não provaria nada — passaria até com SELECT literal em
  --     user_roles, que é justamente o bug. Por isso fabricamos um superadmin puro.
  SELECT user_id INTO v_super FROM public.user_roles WHERE role = 'user'
    AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin','superadmin','coordenador'))
    LIMIT 1;

  IF v_super IS NULL OR v_aloc IS NULL THEN
    RAISE NOTICE 'CASO 3.2: PULADO — sem fixture';
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (v_super, 'superadmin');
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.conceder_coordenador(v_aloc);
      RAISE NOTICE 'CASO 3.2: OK — superadmin SEM linha admin concedeu (hierarquia dentro do has_role)';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_estado = RETURNED_SQLSTATE;
      RAISE NOTICE 'CASO 3.2: FALHOU — superadmin barrado [%]: % (é a 4ª ocorrência da classe)', v_estado, v_msg;
    END;
  END IF;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. AS DUAS RECUSAS DE ESTADO: já tem acesso, e o alvo é admin         ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE
  v_admin uuid; v_aloc uuid; v_user uuid; v_msg text;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT ap.id, c.user_id INTO v_aloc, v_user
    FROM public.colaboradores_prova ap
    JOIN public.colaboradores c ON c.id = ap.colaborador_id
    LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
   WHERE ap.funcao_id IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89','8d36ef0f-becb-45f3-837b-04eea15489fb')
     AND c.user_id IS NOT NULL AND cp.id IS NULL
   LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  IF v_aloc IS NULL THEN
    RAISE NOTICE 'CASOS 4.x: PULADOS — sem fixture';
    RETURN;
  END IF;

  -- 4.1 conceder duas vezes na mesma prova
  PERFORM public.conceder_coordenador(v_aloc);
  BEGIN
    PERFORM public.conceder_coordenador(v_aloc);
    RAISE NOTICE 'CASO 4.1: FALHOU — concedeu duas vezes';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%já possui acesso%' THEN
      RAISE NOTICE 'CASO 4.1: OK — recusado pela REGRA, não pela unique (%)', left(v_msg, 40);
    ELSE
      RAISE NOTICE 'CASO 4.1: ATENÇÃO — barrou por outra coisa: %', v_msg;
    END IF;
  END;
END $$;
ROLLBACK;

BEGIN;
DO $$
DECLARE
  v_admin uuid; v_aloc uuid; v_user uuid; v_msg text;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT ap.id, c.user_id INTO v_aloc, v_user
    FROM public.colaboradores_prova ap
    JOIN public.colaboradores c ON c.id = ap.colaborador_id
    LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
   WHERE ap.funcao_id IN ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89','8d36ef0f-becb-45f3-837b-04eea15489fb')
     AND c.user_id IS NOT NULL AND cp.id IS NULL
   LIMIT 1;

  IF v_aloc IS NULL THEN
    RAISE NOTICE 'CASO 4.2: PULADO — sem fixture';
    RETURN;
  END IF;

  -- 4.2 o alvo é ADMIN: a barreira que antes vivia num SELECT do diálogo, e que por
  --     isso se contornava pelo PostgREST. Agora é recusa da RPC.
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin') ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.conceder_coordenador(v_aloc);
    RAISE NOTICE 'CASO 4.2: FALHOU — rebaixou um administrador a coordenador';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%Administrador%' THEN
      RAISE NOTICE 'CASO 4.2: OK — recusou nomeando que o alvo é Administrador';
    ELSE
      RAISE NOTICE 'CASO 4.2: FALHOU — %', v_msg;
    END IF;
  END;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 5. O TRIGGER — a regra tem de valer por PostgREST e psql também       ║'
\echo '║    Botão desabilitado é conveniência; só o banco é garantia.          ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
BEGIN;
DO $$
DECLARE
  v_aloc uuid; v_user uuid; v_prova uuid; v_outro uuid; v_outra_prova uuid; v_msg text;
BEGIN
  SELECT ap.id, c.user_id, pu.prova_id INTO v_aloc, v_user, v_prova
    FROM public.colaboradores_prova ap
    JOIN public.prova_unidades pu ON pu.id = ap.prova_unidade_id
    JOIN public.colaboradores c ON c.id = ap.colaborador_id
    LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
   WHERE c.user_id IS NOT NULL AND cp.id IS NULL
   LIMIT 1;

  IF v_aloc IS NULL THEN
    RAISE NOTICE 'CASOS 5.x: PULADOS — sem fixture';
    RETURN;
  END IF;

  SELECT user_id INTO v_outro FROM public.user_roles WHERE user_id <> v_user LIMIT 1;
  SELECT id INTO v_outra_prova FROM public.provas WHERE id <> v_prova LIMIT 1;

  -- 5.1 A CONTA DO ACESSO TEM DE SER A DO CADASTRO
  BEGIN
    INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id)
    VALUES (v_aloc, v_outro, v_prova);
    RAISE NOTICE 'CASO 5.1: FALHOU — aceitou acesso com a conta de OUTRA pessoa';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    -- ⚠️ Ler o NOME de quem barrou, não só que houve recusa: uma unique ou uma FK
    -- barrando aqui deixaria a cobertura do trigger virar fantasma.
    IF v_msg LIKE '%não é a conta de%' THEN
      RAISE NOTICE 'CASO 5.1: OK — barrado pelo TRIGGER DE COERÊNCIA (%)', left(v_msg, 60);
    ELSE
      RAISE NOTICE 'CASO 5.1: ATENÇÃO — recusado por OUTRA regra: %', v_msg;
    END IF;
  END;

  -- 5.2 prova_id tem de ser a prova da alocação
  IF v_outra_prova IS NOT NULL THEN
    BEGIN
      INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id)
      VALUES (v_aloc, v_user, v_outra_prova);
      RAISE NOTICE 'CASO 5.2: FALHOU — aceitou acesso apontando para outra prova';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg LIKE '%pertence a outra prova%' THEN
        RAISE NOTICE 'CASO 5.2: OK — barrado pelo trigger, nomeando a incoerência';
      ELSE
        RAISE NOTICE 'CASO 5.2: ATENÇÃO — recusado por outra regra: %', v_msg;
      END IF;
    END;
  END IF;

  -- 5.3 CONTROLE POSITIVO do trigger: o par coerente passa
  BEGIN
    INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id)
    VALUES (v_aloc, v_user, v_prova);
    RAISE NOTICE 'CASO 5.3: OK — o par coerente continua entrando (não travamos tudo)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 5.3: FALHOU — o trigger barra até o caso legítimo: %', v_msg;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- 5.4 🔴 O CARVE-OUT QUE MANTÉM O `db reset` DE PÉ'
\echo '--     O dump NÃO traz colaboradores.user_id (o backfill está no seed.pos.sql, que'
\echo '--     roda DEPOIS). Se o trigger exigisse o vínculo incondicionalmente, a carga das'
\echo '--     10 linhas de coordenadores_prova falharia — aqui e no bootstrap de produção.'
\echo '--     Este caso prova que colaborador SEM vínculo passa (e a RPC é quem exige).'
BEGIN;
DO $$
DECLARE
  v_aloc uuid; v_prova uuid; v_qualquer uuid; v_msg text;
BEGIN
  SELECT ap.id, pu.prova_id INTO v_aloc, v_prova
    FROM public.colaboradores_prova ap
    JOIN public.prova_unidades pu ON pu.id = ap.prova_unidade_id
    JOIN public.colaboradores c ON c.id = ap.colaborador_id
    LEFT JOIN public.coordenadores_prova cp ON cp.colaborador_prova_id = ap.id
   WHERE c.user_id IS NULL AND cp.id IS NULL
   LIMIT 1;

  -- Uma conta que ainda NÃO seja coordenadora desta prova: senão a unique
  -- (user_id, prova_id) barra antes do trigger e o caso não prova o que diz provar.
  SELECT u.id INTO v_qualquer
    FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.coordenadores_prova cp
                      WHERE cp.user_id = u.id AND cp.prova_id = v_prova)
   LIMIT 1;

  IF v_aloc IS NULL THEN
    RAISE NOTICE 'CASO 5.4: PULADO — sem fixture';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id)
    VALUES (v_aloc, v_qualquer, v_prova);
    RAISE NOTICE 'CASO 5.4: OK — sem vínculo no cadastro, o trigger não compara (db reset salvo)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 5.4: FALHOU — isto QUEBRARIA o db reset e o bootstrap: %', v_msg;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- 6. Controle final: nada sobreviveu. As duas contagens têm de ser as iniciais.'
SELECT (SELECT count(*) FROM public.coordenadores_prova) AS coordenadores_prova,
       (SELECT count(*) FROM public.user_roles WHERE role = 'coordenador') AS papel_coordenador;
