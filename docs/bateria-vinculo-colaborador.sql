-- Bateria: vínculo colaborador↔conta  +  carimbo do último acesso
-- Migrations cobertas:
--   · 20260919121555_vinculo_colaborador_em_conta_existente.sql  (casos 0 a 8)
--   · 20260921002249_carimbar_ultimo_acesso_no_login.sql         (casos 9 a 14)
--     ⚠️ o nome do arquivo é UTC; a sessão que a escreveu foi 2026-09-20 local
--   · função  `vincular_colaborador_a_conta(uuid, text)`
--   · trigger `on_auth_user_created`  → `handle_new_user()`        (nascimento da conta)
--   · trigger `on_auth_user_signin`   → `vincular_colaborador_no_signin()` (login/confirmação)
-- Escrita em 2026-09-19 junto com a primeira migration; estendida em 2026-09-20.
--
-- 🔴 OS CASOS 0 A 8 SÃO O CONTROLE POSITIVO DOS NOVOS. O carimbo foi acrescentado
-- DENTRO da função do vínculo: provar que ele passou a carimbar é metade, a outra é
-- provar que o vínculo não regrediu. Se algum caso de 1 a 8 falhar, o conserto do
-- carimbo quebrou o que já funcionava — e isso importa mais que o carimbo.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-vinculo-colaborador.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: um teste lá afirmaria o mock, nunca o trigger nem a
-- UNIQUE. Isto aqui é a única verificação real — e só existe quando alguém a executa.
-- ⚠️ "Ela existe" não é "ela passa": uma bateria deste repo já ficou 2 dias quebrada na
-- primeira linha, sem que nenhum dos 10 casos rodasse.
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. As fixtures são escolhidas
-- DINAMICAMENTE do dado real; o bloco 0 confere o que precisa existir. Tudo roda em
-- transação com ROLLBACK — nada sobrevive, nem as contas de mentira em `auth.users`.
--
-- 🔴 O QUE ESTA BATERIA **NÃO** SUBSTITUI: ela não exercita as Edge Functions.
-- `reivindicar-acesso`, `recuperar-senha` e `public-create-colaborador` ENVIAM E-MAIL DE
-- VERDADE a partir deste banco (cópia de produção, PII real) e o `generateLink('invite')`
-- CRIA conta fora de transação. Não invoque nenhuma das três para "conferir".
-- A camada de Edge Function é verificada por `npm run test:ef`
-- (`supabase/functions/_shared/enviar-link-acesso.test.ts`, cliente dublê, sem rede).

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES — sem isto, "passou" não quer dizer nada             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 0.1 A função existe, é SECURITY DEFINER e tem search_path fixo'
SELECT CASE
         WHEN p.prosecdef AND p.proconfig @> ARRAY['search_path=public']
           THEN 'OK — vincular_colaborador_a_conta é SECURITY DEFINER com search_path fixo'
         WHEN p.oid IS NULL THEN 'FALHOU — a função não existe'
         ELSE 'FALHOU — secdef=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'NULL')
       END AS resultado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'vincular_colaborador_a_conta';

\echo ''
\echo '-- 0.2 🔴 anon e authenticated NÃO alcançam a função pelo PostgREST'
\echo '--     Ela é SECURITY DEFINER e escreve user_roles: exposta, seria escalada de'
\echo '--     privilégio direta (chamar com o próprio user_id + e-mail de um colaborador).'
SELECT CASE
         WHEN NOT has_function_privilege('anon', 'public.vincular_colaborador_a_conta(uuid, text)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.vincular_colaborador_a_conta(uuid, text)', 'EXECUTE')
           THEN 'OK — EXECUTE revogado de anon e authenticated'
         ELSE 'FALHOU — anon=' || has_function_privilege('anon', 'public.vincular_colaborador_a_conta(uuid, text)', 'EXECUTE')
              || ' authenticated=' || has_function_privilege('authenticated', 'public.vincular_colaborador_a_conta(uuid, text)', 'EXECUTE')
       END AS resultado;

\echo ''
\echo '-- 0.3 Os DOIS triggers estão instalados em auth.users, e o de login olha as'
\echo '--     colunas certas (last_sign_in_at E email_confirmed_at)'
\echo '--     ⚠️ A CONTAGEM vem primeiro de propósito: trigger que sumiu não gera linha'
\echo '--     na listagem abaixo, e "nenhuma linha FALHOU" pareceria aprovação.'
SELECT CASE WHEN count(*) = 2 THEN 'OK — os 2 triggers existem'
            ELSE 'FALHOU — só ' || count(*) || ' de 2; os casos 2, 3 e 7 não exercitam mais nada' END AS resultado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
  AND tgname IN ('on_auth_user_created', 'on_auth_user_signin');

SELECT tgname,
       CASE
         WHEN tgname = 'on_auth_user_created' AND pg_get_triggerdef(t.oid) LIKE '%AFTER INSERT%'
           THEN 'OK — nascimento da conta'
         WHEN tgname = 'on_auth_user_signin'
          AND pg_get_triggerdef(t.oid) LIKE '%last_sign_in_at%'
          AND pg_get_triggerdef(t.oid) LIKE '%email_confirmed_at%'
           THEN 'OK — login e confirmação'
         ELSE 'FALHOU — ' || pg_get_triggerdef(t.oid)
       END AS resultado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
ORDER BY tgname;

\echo ''
\echo '-- 0.4 A UNIQUE que torna o caso 6 possível ainda existe'
SELECT CASE WHEN count(*) = 1 THEN 'OK — colaboradores_user_id_key UNIQUE (user_id) existe'
            ELSE 'FALHOU — a UNIQUE sumiu; o caso 6 deixou de exercitar o que diz' END AS resultado
FROM pg_constraint
WHERE conrelid = 'public.colaboradores'::regclass AND conname = 'colaboradores_user_id_key';

\echo ''
\echo '-- 0.5 Há fixture: cadastro em estado A com e-mail, e cadastro já vinculado'
SELECT CASE WHEN (SELECT count(*) FROM public.colaboradores WHERE user_id IS NULL AND colab_email IS NOT NULL) >= 3
             AND (SELECT count(*) FROM public.colaboradores WHERE user_id IS NOT NULL) >= 1
            THEN 'OK — há fixture de sobra'
            ELSE 'FALHOU — falta cadastro em estado A com e-mail, ou nenhum vinculado' END AS resultado;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. 🟢 CONTROLE POSITIVO — o caminho feliz de HOJE continua passando   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Conta NASCE com o e-mail de um cadastro em estado A → vincula e concede o papel.'
\echo '-- Provar que passou a funcionar no caso novo é METADE; a outra é esta.'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_email text; v_novo uuid := gen_random_uuid();
  v_user_id uuid; v_papeis int; v_profile int;
BEGIN
  SELECT id, colab_email INTO v_colab, v_email
    FROM public.colaboradores WHERE user_id IS NULL AND colab_email IS NOT NULL LIMIT 1;

  IF v_colab IS NULL THEN RAISE NOTICE 'CASO 1: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_novo, v_email, 'authenticated', 'authenticated', now());

  SELECT user_id INTO v_user_id FROM public.colaboradores WHERE id = v_colab;
  SELECT count(*) INTO v_papeis FROM public.user_roles WHERE user_id = v_novo;
  SELECT count(*) INTO v_profile FROM public.profiles WHERE id = v_novo;

  IF v_user_id = v_novo AND v_profile = 1
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_novo AND role = 'user')
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_novo AND role = 'colaborador')
  THEN
    RAISE NOTICE 'CASO 1: OK — nascimento vinculou o cadastro, criou profile e os % papéis', v_papeis;
  ELSE
    RAISE NOTICE 'CASO 1: FALHOU — user_id=% profile=% papéis=%', v_user_id, v_profile, v_papeis;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. 🔴 O DEFEITO — conta que JÁ existia se vincula ao LOGAR            ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- É o caso do item de backlog: o admin digita um e-mail que já tem conta. Antes'
\echo '-- desta migration NADA vinculava essa linha, por caminho nenhum.'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.vinculo.caso2@exemplo.test';
  v_antes uuid; v_depois uuid; v_papel boolean;
BEGIN
  -- A conta nasce SEM cadastro casando (é o "já existia").
  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now() - interval '30 days');

  -- Só DEPOIS o admin põe esse e-mail num cadastro em estado A.
  SELECT id INTO v_colab FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL LIMIT 1;
  UPDATE public.colaboradores SET colab_email = v_email WHERE id = v_colab;

  SELECT user_id INTO v_antes FROM public.colaboradores WHERE id = v_colab;

  -- A pessoa loga: o GoTrue carimba last_sign_in_at.
  UPDATE auth.users SET last_sign_in_at = now() WHERE id = v_conta;

  SELECT user_id INTO v_depois FROM public.colaboradores WHERE id = v_colab;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_conta AND role = 'colaborador')
    INTO v_papel;

  IF v_antes IS NULL AND v_depois = v_conta AND v_papel THEN
    RAISE NOTICE 'CASO 2: OK — não vinculado antes do login, vinculado COM papel depois';
  ELSE
    RAISE NOTICE 'CASO 2: FALHOU — antes=% depois=% papel=%', v_antes, v_depois, v_papel;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. Confirmar o e-mail também vincula (conta pendente, sem sessão)     ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.vinculo.caso3@exemplo.test';
  v_depois uuid;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, created_at, email_confirmed_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now() - interval '10 days', NULL);

  SELECT id INTO v_colab FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL LIMIT 1;
  UPDATE public.colaboradores SET colab_email = v_email WHERE id = v_colab;

  UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_conta;

  SELECT user_id INTO v_depois FROM public.colaboradores WHERE id = v_colab;

  IF v_depois = v_conta THEN
    RAISE NOTICE 'CASO 3: OK — a confirmação do e-mail vinculou';
  ELSE
    RAISE NOTICE 'CASO 3: FALHOU — user_id ficou %', v_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. NO-OP barato — login de quem não tem cadastro não escreve nada     ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- ⚠️ A CONTAGEM é a prova, não o "não deu erro": o gatilho roda em TODO login do'
\echo '-- sistema. Se ele escrevesse algo aqui, escreveria 58 vezes por rodada de logins.'

BEGIN;
DO $$
DECLARE
  v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.vinculo.caso4.sem.cadastro@exemplo.test';
  v_vinc_antes int; v_vinc_depois int; v_papel_antes int; v_papel_depois int;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now() - interval '5 days');

  SELECT count(*) INTO v_vinc_antes FROM public.colaboradores WHERE user_id IS NOT NULL;
  SELECT count(*) INTO v_papel_antes FROM public.user_roles WHERE role = 'colaborador';

  UPDATE auth.users SET last_sign_in_at = now() WHERE id = v_conta;

  SELECT count(*) INTO v_vinc_depois FROM public.colaboradores WHERE user_id IS NOT NULL;
  SELECT count(*) INTO v_papel_depois FROM public.user_roles WHERE role = 'colaborador';

  IF v_vinc_antes = v_vinc_depois AND v_papel_antes = v_papel_depois THEN
    RAISE NOTICE 'CASO 4: OK — nenhuma escrita (vinculados % , papéis %)', v_vinc_depois, v_papel_depois;
  ELSE
    RAISE NOTICE 'CASO 4: FALHOU — vinculados % -> %, papéis % -> %',
      v_vinc_antes, v_vinc_depois, v_papel_antes, v_papel_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 5. A contenção do typo: e-mail de cadastro já vinculado é RECUSADO    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- ⚠️ Lê-se o NOME de quem barrou, não só "houve recusa" (CLAUDE.md §8): é o índice'
\echo '-- único FUNCIONAL sobre lower(trim(colab_email)), não uma UNIQUE de coluna.'

BEGIN;
DO $$
DECLARE
  v_vinculado uuid; v_email_vinc text; v_alvo uuid; v_erro text; v_constraint text;
BEGIN
  SELECT id, colab_email INTO v_vinculado, v_email_vinc
    FROM public.colaboradores WHERE user_id IS NOT NULL AND colab_email IS NOT NULL LIMIT 1;
  SELECT id INTO v_alvo FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL AND id <> v_vinculado LIMIT 1;

  IF v_vinculado IS NULL OR v_alvo IS NULL THEN RAISE NOTICE 'CASO 5: PULADO — sem fixture'; RETURN; END IF;

  BEGIN
    UPDATE public.colaboradores SET colab_email = v_email_vinc WHERE id = v_alvo;
    RAISE NOTICE 'CASO 5: FALHOU — o banco ACEITOU dois cadastros com o mesmo e-mail';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT, v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'colaboradores_colab_email_key' THEN
      RAISE NOTICE 'CASO 5: OK — recusado por %, que é quem tem de barrar', v_constraint;
    ELSE
      RAISE NOTICE 'CASO 5: FALHOU (OFUSCADO) — recusou, mas por "%" (%)', v_constraint, v_erro;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 6. 🔴 O caso que DERRUBARIA O LOGIN — UNIQUE (user_id)                ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Alcançável de verdade: conta renomeada (a linha antiga fica dessincronizada, o'
\echo '-- estado B) + outro cadastro em estado A com o e-mail NOVO da conta. Sem a guarda,'
\echo '-- o UPDATE levantaria 23505 DENTRO da transação de login e a pessoa não entraria.'
\echo '-- ⚠️ SOZINHO este caso é OFUSCADO: ele fica verde com a guarda OU com o EXCEPTION'
\echo '-- do gatilho — falsificado em 19/09, tirar a guarda não o derruba. Quem separa os'
\echo '-- dois é o 6b. Não use o caso 6 como prova de que a guarda existe.'

BEGIN;
DO $$
DECLARE
  v_l1 uuid; v_conta uuid; v_l2 uuid;
  v_email_novo text := 'bateria.vinculo.caso6@exemplo.test';
  v_l1_depois uuid; v_l2_depois uuid; v_logou timestamptz;
BEGIN
  SELECT id, user_id INTO v_l1, v_conta
    FROM public.colaboradores WHERE user_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_l2 FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL AND id <> v_l1 LIMIT 1;

  IF v_l1 IS NULL OR v_l2 IS NULL THEN RAISE NOTICE 'CASO 6: PULADO — sem fixture'; RETURN; END IF;

  -- A conta é renomeada (não mexe em last_sign_in_at, então o gatilho não dispara).
  UPDATE auth.users SET email = v_email_novo WHERE id = v_conta;
  -- E o e-mail novo cai num OUTRO cadastro, ainda em estado A.
  UPDATE public.colaboradores SET colab_email = v_email_novo WHERE id = v_l2;

  -- O login. Isto NÃO pode falhar.
  UPDATE auth.users SET last_sign_in_at = now() WHERE id = v_conta;

  SELECT last_sign_in_at INTO v_logou FROM auth.users WHERE id = v_conta;
  SELECT user_id INTO v_l1_depois FROM public.colaboradores WHERE id = v_l1;
  SELECT user_id INTO v_l2_depois FROM public.colaboradores WHERE id = v_l2;

  IF v_logou IS NOT NULL AND v_l1_depois = v_conta AND v_l2_depois IS NULL THEN
    RAISE NOTICE 'CASO 6: OK — login sobreviveu, L1 intacta, L2 NÃO foi roubada';
  ELSE
    RAISE NOTICE 'CASO 6: FALHOU — logou=% L1=% L2=%', v_logou, v_l1_depois, v_l2_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '-- 6b. Qual das DUAS defesas está segurando? (senão uma ofusca a outra)'
\echo '--     Chamada DIRETA à função, fora do trigger: aqui não há EXCEPTION para salvar.'
\echo '--     Com a guarda → devolve NULL. Sem a guarda → 23505. É o caso que falsifica.'

BEGIN;
DO $$
DECLARE
  v_l1 uuid; v_conta uuid; v_l2 uuid;
  v_email_novo text := 'bateria.vinculo.caso6b@exemplo.test';
  v_ret uuid; v_erro text;
BEGIN
  SELECT id, user_id INTO v_l1, v_conta FROM public.colaboradores WHERE user_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_l2 FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL AND id <> v_l1 LIMIT 1;

  IF v_l1 IS NULL OR v_l2 IS NULL THEN RAISE NOTICE 'CASO 6b: PULADO — sem fixture'; RETURN; END IF;

  UPDATE public.colaboradores SET colab_email = v_email_novo WHERE id = v_l2;

  BEGIN
    v_ret := public.vincular_colaborador_a_conta(v_conta, v_email_novo);
    IF v_ret IS NULL THEN
      RAISE NOTICE 'CASO 6b: OK — a GUARDA segurou (devolveu NULL, sem exceção)';
    ELSE
      RAISE NOTICE 'CASO 6b: FALHOU — vinculou % a uma conta que já tinha cadastro', v_ret;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 6b: FALHOU — a guarda não existe; quem segura é só o EXCEPTION do trigger (%)', v_erro;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- 6c. E a rede de baixo: o EXCEPTION do gatilho preserva o login quando o vínculo'
\echo '--     falha por um motivo IMPREVISTO. Simulado com um trigger que sempre recusa.'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.vinculo.caso6c@exemplo.test';
  v_logou timestamptz; v_depois uuid;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now() - interval '3 days');

  SELECT id INTO v_colab FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL LIMIT 1;
  UPDATE public.colaboradores SET colab_email = v_email WHERE id = v_colab;

  CREATE FUNCTION pg_temp.recusa_tudo() RETURNS trigger LANGUAGE plpgsql AS
    $f$ BEGIN RAISE EXCEPTION 'falha imprevista de teste'; END $f$;
  EXECUTE 'CREATE TRIGGER zzz_bateria_recusa BEFORE UPDATE ON public.colaboradores
           FOR EACH ROW EXECUTE FUNCTION pg_temp.recusa_tudo()';

  UPDATE auth.users SET last_sign_in_at = now() WHERE id = v_conta;

  SELECT last_sign_in_at INTO v_logou FROM auth.users WHERE id = v_conta;
  SELECT user_id INTO v_depois FROM public.colaboradores WHERE id = v_colab;
  EXECUTE 'DROP TRIGGER zzz_bateria_recusa ON public.colaboradores';

  IF v_logou IS NOT NULL AND v_depois IS NULL THEN
    RAISE NOTICE 'CASO 6c: OK — vínculo falhou, LOGIN sobreviveu (o WARNING fica no log)';
  ELSE
    RAISE NOTICE 'CASO 6c: FALHOU — logou=% user_id=%', v_logou, v_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 7. Idempotência — logar de novo não duplica nada                      ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.vinculo.caso7@exemplo.test';
  v_papeis int; v_user_id uuid;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now() - interval '20 days');

  SELECT id INTO v_colab FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL LIMIT 1;
  UPDATE public.colaboradores SET colab_email = v_email WHERE id = v_colab;

  UPDATE auth.users SET last_sign_in_at = now() WHERE id = v_conta;
  UPDATE auth.users SET last_sign_in_at = now() + interval '1 minute' WHERE id = v_conta;
  UPDATE auth.users SET last_sign_in_at = now() + interval '2 minutes' WHERE id = v_conta;

  SELECT count(*) INTO v_papeis FROM public.user_roles
   WHERE user_id = v_conta AND role = 'colaborador';
  SELECT user_id INTO v_user_id FROM public.colaboradores WHERE id = v_colab;

  IF v_papeis = 1 AND v_user_id = v_conta THEN
    RAISE NOTICE 'CASO 7: OK — três logins, um papel só, vínculo estável';
  ELSE
    RAISE NOTICE 'CASO 7: FALHOU — papéis=% user_id=%', v_papeis, v_user_id;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 8. `session_replication_role = replica` desliga os DOIS gatilhos      ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- É o que sustenta o `db reset`: o dump carrega com os triggers desligados.'
\echo '-- ⚠️ Até esta migration era UM trigger em auth.users; agora são DOIS.'

BEGIN;
SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  v_colab uuid; v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.vinculo.caso8@exemplo.test';
  v_perfis int; v_depois uuid;
BEGIN
  SELECT id, colab_email INTO v_colab, v_email
    FROM public.colaboradores WHERE user_id IS NULL AND colab_email IS NOT NULL LIMIT 1;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now());
  UPDATE auth.users SET last_sign_in_at = now() WHERE id = v_conta;

  SELECT count(*) INTO v_perfis FROM public.profiles WHERE id = v_conta;
  SELECT user_id INTO v_depois FROM public.colaboradores WHERE id = v_colab;

  IF v_perfis = 0 AND v_depois IS NULL THEN
    RAISE NOTICE 'CASO 8: OK — em `replica` nem o de nascimento nem o de login dispararam';
  ELSE
    RAISE NOTICE 'CASO 8: FALHOU — profiles=% user_id=% (o db reset vai se comportar diferente)',
      v_perfis, v_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 9. 🟢 O CARIMBO — login grava colab_ultimo_acesso = last_sign_in_at   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Conta JÁ vinculada, para isolar o carimbo do vínculo.'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_conta uuid; v_quando timestamptz := now() - interval '3 hours';
  v_carimbo timestamptz;
BEGIN
  SELECT id, user_id INTO v_colab, v_conta
    FROM public.colaboradores WHERE user_id IS NOT NULL LIMIT 1;
  IF v_colab IS NULL THEN RAISE NOTICE 'CASO 9: PULADO — sem fixture vinculada'; RETURN; END IF;

  UPDATE public.colaboradores SET colab_ultimo_acesso = NULL WHERE id = v_colab;
  UPDATE auth.users SET last_sign_in_at = v_quando WHERE id = v_conta;

  SELECT colab_ultimo_acesso INTO v_carimbo FROM public.colaboradores WHERE id = v_colab;

  IF v_carimbo = v_quando THEN
    RAISE NOTICE 'CASO 9: OK — o login carimbou, e com o valor EXATO de last_sign_in_at';
  ELSIF v_carimbo IS NULL THEN
    RAISE NOTICE 'CASO 9: FALHOU — não carimbou nada (a coluna continua morta)';
  ELSE
    RAISE NOTICE 'CASO 9: FALHOU — carimbou % , esperado %', v_carimbo, v_quando;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 10. ⚠️ Confirmar o e-mail NÃO é acesso — e não pode mexer no carimbo  ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- O gatilho dispara TAMBÉM em email_confirmed_at. Sem a guarda de DISTINCT'
\echo '-- FROM, a confirmação reescreveria o carimbo e a coluna voltaria a mentir.'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_conta uuid;
  v_antes timestamptz := '2026-01-15 10:00:00+00';
  v_depois timestamptz;
BEGIN
  SELECT id, user_id INTO v_colab, v_conta
    FROM public.colaboradores WHERE user_id IS NOT NULL LIMIT 1;
  IF v_colab IS NULL THEN RAISE NOTICE 'CASO 10: PULADO — sem fixture'; RETURN; END IF;

  UPDATE public.colaboradores SET colab_ultimo_acesso = v_antes WHERE id = v_colab;
  -- confirma o e-mail SEM tocar em last_sign_in_at
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_conta;

  SELECT colab_ultimo_acesso INTO v_depois FROM public.colaboradores WHERE id = v_colab;

  IF v_depois = v_antes THEN
    RAISE NOTICE 'CASO 10: OK — a confirmação não tocou no carimbo';
  ELSE
    RAISE NOTICE 'CASO 10: FALHOU — carimbo virou % (era %)', v_depois, v_antes;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 11. O carimbo AVANÇA a cada login — não congela no primeiro           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- É literalmente o defeito que esta migration conserta: uma coluna parada.'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_conta uuid;
  v_t1 timestamptz := now() - interval '2 days';
  v_t2 timestamptz := now() - interval '1 hour';
  v_carimbo timestamptz;
BEGIN
  SELECT id, user_id INTO v_colab, v_conta
    FROM public.colaboradores WHERE user_id IS NOT NULL LIMIT 1;
  IF v_colab IS NULL THEN RAISE NOTICE 'CASO 11: PULADO — sem fixture'; RETURN; END IF;

  UPDATE auth.users SET last_sign_in_at = v_t1 WHERE id = v_conta;
  UPDATE auth.users SET last_sign_in_at = v_t2 WHERE id = v_conta;

  SELECT colab_ultimo_acesso INTO v_carimbo FROM public.colaboradores WHERE id = v_colab;

  IF v_carimbo = v_t2 THEN
    RAISE NOTICE 'CASO 11: OK — o segundo login sobrescreveu o primeiro';
  ELSE
    RAISE NOTICE 'CASO 11: FALHOU — carimbo ficou em % , esperado %', v_carimbo, v_t2;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 12. Primeiro acesso: VINCULA e CARIMBA no mesmo disparo               ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Prova a ORDEM dos dois blocos: sem user_id, o carimbo não acha a linha.'
\echo '-- Invertida a ordem na função, este caso é o único que reprova.'

BEGIN;
DO $$
DECLARE
  v_colab uuid; v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.vinculo.caso12@exemplo.test';
  v_quando timestamptz := now() - interval '10 minutes';
  v_user_id uuid; v_carimbo timestamptz;
BEGIN
  SELECT id INTO v_colab FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL LIMIT 1;
  IF v_colab IS NULL THEN RAISE NOTICE 'CASO 12: PULADO — sem fixture em estado A'; RETURN; END IF;

  UPDATE public.colaboradores
     SET colab_email = v_email, colab_ultimo_acesso = NULL WHERE id = v_colab;

  -- conta que já existia (nasce com os gatilhos de nascimento) e agora loga
  SET LOCAL session_replication_role = replica;
  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now() - interval '30 days');
  SET LOCAL session_replication_role = origin;

  UPDATE auth.users SET last_sign_in_at = v_quando WHERE id = v_conta;

  SELECT user_id, colab_ultimo_acesso INTO v_user_id, v_carimbo
    FROM public.colaboradores WHERE id = v_colab;

  IF v_user_id = v_conta AND v_carimbo = v_quando THEN
    RAISE NOTICE 'CASO 12: OK — vinculou E carimbou no mesmo login';
  ELSIF v_user_id = v_conta THEN
    RAISE NOTICE 'CASO 12: FALHOU — vinculou mas NÃO carimbou (a ordem dos blocos está invertida)';
  ELSE
    RAISE NOTICE 'CASO 12: FALHOU — nem vinculou (user_id=%, carimbo=%)', v_user_id, v_carimbo;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 13. Conta que NÃO é de colaborador loga — nada quebra, nada é tocado  ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- O gatilho dispara em TODO login do sistema, não só nos de colaborador.'

BEGIN;
DO $$
DECLARE
  v_conta uuid := gen_random_uuid();
  v_antes int; v_depois int;
BEGIN
  SELECT count(*) INTO v_antes FROM public.colaboradores WHERE colab_ultimo_acesso IS NOT NULL;

  SET LOCAL session_replication_role = replica;
  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, 'bateria.vinculo.caso13@exemplo.test', 'authenticated', 'authenticated', now());
  SET LOCAL session_replication_role = origin;

  UPDATE auth.users SET last_sign_in_at = now() WHERE id = v_conta;

  SELECT count(*) INTO v_depois FROM public.colaboradores WHERE colab_ultimo_acesso IS NOT NULL;

  IF v_antes = v_depois THEN
    RAISE NOTICE 'CASO 13: OK — login de não-colaborador não carimbou ninguém (% linhas)', v_depois;
  ELSE
    RAISE NOTICE 'CASO 13: FALHOU — o total de carimbos mudou de % para %', v_antes, v_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 14. 🔴 O CARIMBO FALHANDO NÃO DERRUBA O LOGIN NEM O VÍNCULO           ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- É o caso que justifica os DOIS blocos EXCEPTION separados. Um gatilho'
\echo '-- temporário faz o UPDATE de colaboradores explodir; o login e o vínculo'
\echo '-- têm de sobreviver. Junte os dois blocos na função e este caso reprova.'

BEGIN;
CREATE FUNCTION pg_temp.sabotar_carimbo() RETURNS trigger LANGUAGE plpgsql AS $sab$
BEGIN
  IF NEW.colab_ultimo_acesso IS DISTINCT FROM OLD.colab_ultimo_acesso THEN
    RAISE EXCEPTION 'sabotagem proposital da bateria (caso 14)';
  END IF;
  RETURN NEW;
END;
$sab$;
CREATE TRIGGER tr_sabotar_carimbo BEFORE UPDATE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION pg_temp.sabotar_carimbo();

DO $$
DECLARE
  v_colab uuid; v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.vinculo.caso14@exemplo.test';
  v_quando timestamptz := now() - interval '5 minutes';
  v_user_id uuid; v_login timestamptz; v_carimbo timestamptz;
BEGIN
  SELECT id INTO v_colab FROM public.colaboradores
   WHERE user_id IS NULL AND colab_email IS NOT NULL LIMIT 1;
  IF v_colab IS NULL THEN RAISE NOTICE 'CASO 14: PULADO — sem fixture'; RETURN; END IF;

  SET LOCAL session_replication_role = replica;
  UPDATE public.colaboradores SET colab_email = v_email, colab_ultimo_acesso = NULL
   WHERE id = v_colab;
  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now() - interval '30 days');
  SET LOCAL session_replication_role = origin;

  UPDATE auth.users SET last_sign_in_at = v_quando WHERE id = v_conta;

  SELECT last_sign_in_at INTO v_login FROM auth.users WHERE id = v_conta;
  SELECT user_id, colab_ultimo_acesso INTO v_user_id, v_carimbo
    FROM public.colaboradores WHERE id = v_colab;

  IF v_login = v_quando AND v_user_id = v_conta AND v_carimbo IS NULL THEN
    RAISE NOTICE 'CASO 14: OK — carimbo falhou, LOGIN e VÍNCULO sobreviveram (o WARNING fica no log)';
  ELSIF v_login IS NULL THEN
    RAISE NOTICE 'CASO 14: FALHOU — O LOGIN MORREU. A exceção escapou do bloco.';
  ELSIF v_user_id IS NULL THEN
    RAISE NOTICE 'CASO 14: FALHOU — o vínculo foi junto com o carimbo (blocos EXCEPTION fundidos?)';
  ELSE
    RAISE NOTICE 'CASO 14: FALHOU — login=% user_id=% carimbo=%', v_login, v_user_id, v_carimbo;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '-- FIM. Nenhuma linha sobreviveu: tudo rodou em transação com ROLLBACK.'
\echo ''
