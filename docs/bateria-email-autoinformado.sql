-- Bateria: e-mail autoinformado pelo próprio colaborador
-- Migration coberta: 20260919163646_autosservico_email_do_cadastro.sql
--   · função `registrar_email_do_proprio_cadastro(text, text, text, text)`
--   · tabela  `log_email_autoinformado` (+ RLS)
-- Escrita em 2026-09-19, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-email-autoinformado.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: um teste lá afirmaria o mock, nunca a RPC, a RLS nem
-- a guarda. Isto aqui é a única verificação real — e só existe quando alguém a executa.
--
-- 🔴 O QUE ESTA PORTA É, PARA QUEM FOR MEXER: autosserviço SEM prova de posse, por
-- decisão explícita do usuário em 2026-09-19. O CPF não é credencial. As guardas abaixo
-- são o que restou de contenção — mexer nelas sem ler
-- my_rules/analises/dividas-auth-colaborador.md §5 é abrir a porta de par em par.
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. Fixtures dinâmicas; tudo em
-- transação com ROLLBACK.
--
-- 🔴 O QUE ESTA BATERIA **NÃO** ALCANÇA: a Edge Function `incluir-email-cadastro`. Ela
-- ENVIA E-MAIL DE VERDADE (o convite E os avisos aos admins) a partir deste banco, que é
-- cópia de produção com PII real, e o `generateLink('invite')` CRIA conta fora de
-- transação. Não a invoque para "conferir".

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES — sem isto, "passou" não quer dizer nada             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 0.1 A RPC existe, é SECURITY DEFINER e tem search_path fixo'
SELECT CASE
         WHEN p.prosecdef AND p.proconfig @> ARRAY['search_path=public']
           THEN 'OK — SECURITY DEFINER com search_path fixo'
         ELSE 'FALHOU — secdef=' || coalesce(p.prosecdef::text,'?')
              || ' config=' || coalesce(p.proconfig::text,'NULL')
       END AS resultado
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'registrar_email_do_proprio_cadastro';

\echo ''
\echo '-- 0.2 🔴 anon e authenticated NÃO alcançam a RPC; a service_role alcança'
\echo '--     Ela escreve PII sem autenticação nenhuma — exposta ao PostgREST, qualquer'
\echo '--     um mudaria o e-mail de um cadastro direto, sem passar pelo rate limit.'
SELECT CASE
         WHEN NOT has_function_privilege('anon', f, 'EXECUTE')
          AND NOT has_function_privilege('authenticated', f, 'EXECUTE')
          AND has_function_privilege('service_role', f, 'EXECUTE')
           THEN 'OK — fechada para anon/authenticated, aberta só para service_role'
         ELSE 'FALHOU — anon=' || has_function_privilege('anon', f, 'EXECUTE')
              || ' authenticated=' || has_function_privilege('authenticated', f, 'EXECUTE')
              || ' service_role=' || has_function_privilege('service_role', f, 'EXECUTE')
       END AS resultado
FROM (SELECT 'public.registrar_email_do_proprio_cadastro(text, text, text, text)'::text AS f) t;

\echo ''
\echo '-- 0.3 O FOR UPDATE está no corpo da função'
\echo '--     ⚠️ Checagem ESTRUTURAL, e a bateria é honesta sobre isso: rodando numa sessão'
\echo '--     só, ela NÃO exercita concorrência de verdade. O caso 6 prova a guarda; este'
\echo '--     0.3 prova que existe o lock que torna a guarda confiável sob corrida.'
SELECT CASE WHEN prosrc ~* 'FOR UPDATE' THEN 'OK — SELECT ... FOR UPDATE presente'
            ELSE 'FALHOU — sem FOR UPDATE: dois reivindicantes do mesmo CPF viram corrida' END AS resultado
FROM pg_proc WHERE proname = 'registrar_email_do_proprio_cadastro';

\echo ''
\echo '-- 0.4 A trilha existe, com RLS ligada'
SELECT CASE WHEN c.relrowsecurity THEN 'OK — log_email_autoinformado com RLS ligada'
            ELSE 'FALHOU — RLS DESLIGADA: qualquer autenticado leria a trilha' END AS resultado
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'log_email_autoinformado';

\echo ''
\echo '-- 0.5 A FK da trilha é SET NULL (não CASCADE): apagar o cadastro não apaga a prova'
SELECT CASE WHEN confdeltype = 'n' THEN 'OK — ON DELETE SET NULL'
            ELSE 'FALHOU — confdeltype=' || confdeltype::text || ' (c=CASCADE apagaria a trilha junto)' END AS resultado
FROM pg_constraint
WHERE conrelid = 'public.log_email_autoinformado'::regclass AND contype = 'f';

\echo ''
\echo '-- 0.6 A função que lista os admins também é fechada ao PostgREST'
SELECT CASE
         WHEN NOT has_function_privilege('anon', 'public.emails_dos_admins()', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.emails_dos_admins()', 'EXECUTE')
           THEN 'OK — emails_dos_admins fechada para anon/authenticated'
         ELSE 'FALHOU — a lista de e-mails de admin está exposta' END AS resultado;

\echo ''
\echo '-- 0.7 Há fixture: cadastro em estado A SEM e-mail, e outro COM e-mail'
SELECT CASE WHEN (SELECT count(*) FROM public.colaboradores
                   WHERE user_id IS NULL AND (colab_email IS NULL OR btrim(colab_email) = '')) >= 2
             AND (SELECT count(*) FROM public.colaboradores WHERE colab_email IS NOT NULL) >= 1
            THEN 'OK — há fixture de sobra'
            ELSE 'FALHOU — falta cadastro sem e-mail' END AS resultado;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. 🟢 CONTROLE POSITIVO — o caso legítimo passa E deixa trilha        ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_alvo uuid; v_cpf text; v_ret_id uuid; v_ret_nome text;
  v_email text := 'bateria.autoinf.caso1@exemplo.test';
  v_gravado text; v_logs int;
BEGIN
  SELECT id, colab_cpf INTO v_alvo, v_cpf FROM public.colaboradores
   WHERE user_id IS NULL AND (colab_email IS NULL OR btrim(colab_email) = '') LIMIT 1;
  IF v_alvo IS NULL THEN RAISE NOTICE 'CASO 1: PULADO — sem fixture'; RETURN; END IF;

  SELECT colaborador_id, nome INTO v_ret_id, v_ret_nome
    FROM public.registrar_email_do_proprio_cadastro(v_cpf, v_email, 'auth', '203.0.113.7');

  SELECT colab_email INTO v_gravado FROM public.colaboradores WHERE id = v_alvo;
  SELECT count(*) INTO v_logs FROM public.log_email_autoinformado WHERE colaborador_id = v_alvo;

  IF v_gravado = v_email AND v_ret_id = v_alvo AND v_ret_nome IS NOT NULL AND v_logs = 1 THEN
    RAISE NOTICE 'CASO 1: OK — e-mail gravado, nome devolvido, 1 linha de trilha';
  ELSE
    RAISE NOTICE 'CASO 1: FALHOU — gravado=% id=% nome=% logs=%', v_gravado, v_ret_id, v_ret_nome, v_logs;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '-- 1b. O CPF chega com pontuação (é o que a pessoa digita) e mesmo assim casa'
BEGIN;
DO $$
DECLARE
  v_alvo uuid; v_cpf text; v_mascarado text; v_gravado text;
BEGIN
  SELECT id, colab_cpf INTO v_alvo, v_cpf FROM public.colaboradores
   WHERE user_id IS NULL AND (colab_email IS NULL OR btrim(colab_email) = '') LIMIT 1;
  IF v_alvo IS NULL THEN RAISE NOTICE 'CASO 1b: PULADO — sem fixture'; RETURN; END IF;

  v_mascarado := substr(v_cpf,1,3) || '.' || substr(v_cpf,4,3) || '.' || substr(v_cpf,7,3) || '-' || substr(v_cpf,10,2);
  PERFORM public.registrar_email_do_proprio_cadastro(v_mascarado, 'bateria.autoinf.caso1b@exemplo.test');

  SELECT colab_email INTO v_gravado FROM public.colaboradores WHERE id = v_alvo;
  IF v_gravado = 'bateria.autoinf.caso1b@exemplo.test' THEN
    RAISE NOTICE 'CASO 1b: OK — CPF mascarado normalizado e casado';
  ELSE
    RAISE NOTICE 'CASO 1b: FALHOU — gravado=%', v_gravado;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. 🔴 A GUARDA QUE SEPARA 243 DE 821 — e-mail existente NÃO se troca  ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Sem esta guarda, a porta deixaria de ser "o cadastro sem e-mail ganha um" e'
\echo '-- passaria a ser "qualquer cadastro muda de dono com um CPF".'

BEGIN;
DO $$
DECLARE
  v_alvo uuid; v_cpf text; v_antes text; v_depois text; v_erro text; v_logs int;
BEGIN
  SELECT id, colab_cpf, colab_email INTO v_alvo, v_cpf, v_antes
    FROM public.colaboradores WHERE colab_email IS NOT NULL AND btrim(colab_email) <> '' LIMIT 1;
  IF v_alvo IS NULL THEN RAISE NOTICE 'CASO 2: PULADO — sem fixture'; RETURN; END IF;

  BEGIN
    PERFORM public.registrar_email_do_proprio_cadastro(v_cpf, 'bateria.autoinf.caso2@exemplo.test');
    RAISE NOTICE 'CASO 2: FALHOU — o banco ACEITOU trocar o e-mail de um cadastro que já tinha';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    SELECT colab_email INTO v_depois FROM public.colaboradores WHERE id = v_alvo;
    SELECT count(*) INTO v_logs FROM public.log_email_autoinformado WHERE colaborador_id = v_alvo;
    -- ⚠️ A recusa é METADE: a outra é o e-mail antigo continuar intacto e a trilha vazia.
    IF v_depois = v_antes AND v_logs = 0 THEN
      RAISE NOTICE 'CASO 2: OK — recusado ("%"), e-mail antigo intacto, nada na trilha', v_erro;
    ELSE
      RAISE NOTICE 'CASO 2: FALHOU — recusou mas mexeu: antes=% depois=% logs=%', v_antes, v_depois, v_logs;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. Cadastro JÁ VINCULADO a uma conta é recusado                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- ⚠️ A fixture precisa ZERAR o e-mail antes, senão o caso 2 barra primeiro e este'
\echo '-- caso vira fantasma: passaria verde sem exercitar a guarda que diz exercitar.'

BEGIN;
DO $$
DECLARE
  v_alvo uuid; v_cpf text; v_erro text; v_depois text;
BEGIN
  SELECT id, colab_cpf INTO v_alvo, v_cpf FROM public.colaboradores WHERE user_id IS NOT NULL LIMIT 1;
  IF v_alvo IS NULL THEN RAISE NOTICE 'CASO 3: PULADO — sem fixture'; RETURN; END IF;

  UPDATE public.colaboradores SET colab_email = NULL WHERE id = v_alvo;

  BEGIN
    PERFORM public.registrar_email_do_proprio_cadastro(v_cpf, 'bateria.autoinf.caso3@exemplo.test');
    RAISE NOTICE 'CASO 3: FALHOU — cadastro vinculado aceitou e-mail novo pela porta pública';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    SELECT colab_email INTO v_depois FROM public.colaboradores WHERE id = v_alvo;
    IF v_depois IS NULL AND v_erro ILIKE '%já tem acesso%' THEN
      RAISE NOTICE 'CASO 3: OK — recusado pela guarda do vínculo ("%")', v_erro;
    ELSE
      RAISE NOTICE 'CASO 3: FALHOU (ou OFUSCADO) — erro="%" depois=%', v_erro, v_depois;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. E-mail de OUTRO colaborador é recusado                             ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE
  v_alvo uuid; v_cpf text; v_email_alheio text; v_erro text; v_depois text;
BEGIN
  SELECT id, colab_cpf INTO v_alvo, v_cpf FROM public.colaboradores
   WHERE user_id IS NULL AND (colab_email IS NULL OR btrim(colab_email) = '') LIMIT 1;
  SELECT colab_email INTO v_email_alheio FROM public.colaboradores
   WHERE colab_email IS NOT NULL AND btrim(colab_email) <> '' AND id <> v_alvo LIMIT 1;
  IF v_alvo IS NULL OR v_email_alheio IS NULL THEN RAISE NOTICE 'CASO 4: PULADO — sem fixture'; RETURN; END IF;

  BEGIN
    PERFORM public.registrar_email_do_proprio_cadastro(v_cpf, v_email_alheio);
    RAISE NOTICE 'CASO 4: FALHOU — dois cadastros ficariam com o mesmo e-mail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    SELECT colab_email INTO v_depois FROM public.colaboradores WHERE id = v_alvo;
    IF v_depois IS NULL AND v_erro ILIKE '%Não é possível usar este e-mail%' THEN
      RAISE NOTICE 'CASO 4: OK — recusado e traduzido ("%")', v_erro;
    ELSE
      RAISE NOTICE 'CASO 4: FALHOU — erro="%" depois=%', v_erro, v_depois;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '-- 4b. E QUEM barrou? A RPC traduz a mensagem, o que esconde o nome. Este caso vai'
\echo '--     ao UPDATE cru para provar que por trás está o índice funcional, e não outra'
\echo '--     regra que por acaso também recusaria (CLAUDE.md §8: leia o NOME de quem barrou).'
BEGIN;
DO $$
DECLARE
  v_alvo uuid; v_email_alheio text; v_constraint text;
BEGIN
  SELECT id INTO v_alvo FROM public.colaboradores
   WHERE user_id IS NULL AND (colab_email IS NULL OR btrim(colab_email) = '') LIMIT 1;
  SELECT colab_email INTO v_email_alheio FROM public.colaboradores
   WHERE colab_email IS NOT NULL AND btrim(colab_email) <> '' AND id <> v_alvo LIMIT 1;
  IF v_alvo IS NULL OR v_email_alheio IS NULL THEN RAISE NOTICE 'CASO 4b: PULADO — sem fixture'; RETURN; END IF;

  BEGIN
    UPDATE public.colaboradores SET colab_email = v_email_alheio WHERE id = v_alvo;
    RAISE NOTICE 'CASO 4b: FALHOU — o UPDATE cru passou; a unicidade do e-mail não existe';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'colaboradores_colab_email_key' THEN
      RAISE NOTICE 'CASO 4b: OK — quem barra é %, o índice funcional', v_constraint;
    ELSE
      RAISE NOTICE 'CASO 4b: FALHOU (OFUSCADO) — barrou, mas foi "%"', v_constraint;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 5. CPF inexistente e CPF malformado                                   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

BEGIN;
DO $$
DECLARE v_e1 text; v_e2 text; v_ok1 boolean := false; v_ok2 boolean := false;
BEGIN
  BEGIN
    PERFORM public.registrar_email_do_proprio_cadastro('00000000191', 'bateria.autoinf.caso5@exemplo.test');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_e1 = MESSAGE_TEXT; v_ok1 := v_e1 ILIKE '%Não encontramos%';
  END;
  BEGIN
    PERFORM public.registrar_email_do_proprio_cadastro('123', 'bateria.autoinf.caso5@exemplo.test');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_e2 = MESSAGE_TEXT; v_ok2 := v_e2 ILIKE '%CPF inválido%';
  END;

  IF v_ok1 AND v_ok2 THEN
    RAISE NOTICE 'CASO 5: OK — CPF inexistente e CPF curto recusados, cada um com a sua mensagem';
  ELSE
    RAISE NOTICE 'CASO 5: FALHOU — inexistente="%" curto="%"', v_e1, v_e2;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 6. "PRIMEIRO A CHEGAR LEVA" — a segunda chamada no mesmo CPF é barrada ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- É o comportamento, não um defeito: depois do primeiro registro o cadastro tem'
\echo '-- e-mail e a porta se fecha. ⚠️ Aqui é SEQUENCIAL — a concorrência de verdade quem'
\echo '-- sustenta é o FOR UPDATE, conferido estruturalmente no 0.3.'

BEGIN;
DO $$
DECLARE v_alvo uuid; v_cpf text; v_erro text; v_gravado text; v_logs int;
BEGIN
  SELECT id, colab_cpf INTO v_alvo, v_cpf FROM public.colaboradores
   WHERE user_id IS NULL AND (colab_email IS NULL OR btrim(colab_email) = '') LIMIT 1;
  IF v_alvo IS NULL THEN RAISE NOTICE 'CASO 6: PULADO — sem fixture'; RETURN; END IF;

  PERFORM public.registrar_email_do_proprio_cadastro(v_cpf, 'bateria.autoinf.primeiro@exemplo.test');

  BEGIN
    PERFORM public.registrar_email_do_proprio_cadastro(v_cpf, 'bateria.autoinf.segundo@exemplo.test');
    RAISE NOTICE 'CASO 6: FALHOU — o segundo sobrescreveu o primeiro';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    SELECT colab_email INTO v_gravado FROM public.colaboradores WHERE id = v_alvo;
    SELECT count(*) INTO v_logs FROM public.log_email_autoinformado WHERE colaborador_id = v_alvo;
    IF v_gravado = 'bateria.autoinf.primeiro@exemplo.test' AND v_logs = 1 THEN
      RAISE NOTICE 'CASO 6: OK — o primeiro prevalece, 1 trilha só ("%")', v_erro;
    ELSE
      RAISE NOTICE 'CASO 6: FALHOU — gravado=% logs=%', v_gravado, v_logs;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 7. A trilha é visível ao ADMIN e invisível ao resto                   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- A trilha guarda e-mail de gente real. Se qualquer autenticado a lesse, ela'
\echo '-- própria viraria um vazamento — e é o tipo de policy que já nasceu errada aqui.'

BEGIN;
DO $$
DECLARE
  v_admin uuid; v_comum uuid; v_alvo uuid; v_como_admin int; v_como_comum int;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT r.user_id INTO v_comum FROM public.user_roles r
   WHERE r.role = 'colaborador'
     AND NOT EXISTS (SELECT 1 FROM public.user_roles a
                      WHERE a.user_id = r.user_id AND a.role IN ('admin','superadmin'))
   LIMIT 1;
  SELECT id INTO v_alvo FROM public.colaboradores LIMIT 1;
  IF v_admin IS NULL OR v_comum IS NULL THEN RAISE NOTICE 'CASO 7: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO public.log_email_autoinformado (colaborador_id, colab_nome, email_informado, origem)
  VALUES (v_alvo, 'Fulano de Teste', 'bateria.autoinf.caso7@exemplo.test', 'auth');

  SET LOCAL ROLE authenticated;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_como_admin FROM public.log_email_autoinformado;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_comum, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_como_comum FROM public.log_email_autoinformado;

  RESET ROLE;

  IF v_como_admin >= 1 AND v_como_comum = 0 THEN
    RAISE NOTICE 'CASO 7: OK — admin vê % linha(s), colaborador comum vê 0', v_como_admin;
  ELSE
    RAISE NOTICE 'CASO 7: FALHOU — admin=% comum=%', v_como_admin, v_como_comum;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 8. E-mail que JÁ TEM CONTA no Auth é recusado — e com a MESMA frase   ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- A guarda mora na RPC, não na Edge Function: vale para psql e PostgREST, é atômica'
\echo '-- com a escrita e usa a comparação exata (o `?filter=` do GoTrue é busca parcial).'
\echo '-- ⚠️ E a mensagem é IGUAL à do caso 4 de propósito: distingui-las faria desta porta'
\echo '-- um oráculo de "quem tem conta no sistema", que a recuperar-senha se recusa a ser.'

BEGIN;
DO $$
DECLARE
  v_alvo uuid; v_cpf text; v_conta uuid := gen_random_uuid();
  v_email text := 'bateria.autoinf.caso8@exemplo.test';
  v_erro text; v_depois text;
BEGIN
  SELECT id, colab_cpf INTO v_alvo, v_cpf FROM public.colaboradores
   WHERE user_id IS NULL AND (colab_email IS NULL OR btrim(colab_email) = '') LIMIT 1;
  IF v_alvo IS NULL THEN RAISE NOTICE 'CASO 8: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO auth.users (id, email, aud, role, created_at)
  VALUES (v_conta, v_email, 'authenticated', 'authenticated', now());

  BEGIN
    PERFORM public.registrar_email_do_proprio_cadastro(v_cpf, v_email);
    RAISE NOTICE 'CASO 8: FALHOU — o cadastro foi apontado para um e-mail que já tem conta';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    SELECT colab_email INTO v_depois FROM public.colaboradores WHERE id = v_alvo;
    IF v_depois IS NULL AND v_erro ILIKE '%Não é possível usar este e-mail%' THEN
      RAISE NOTICE 'CASO 8: OK — recusado, e com a frase colapsada ("%")', v_erro;
    ELSE
      RAISE NOTICE 'CASO 8: FALHOU — erro="%" depois=%', v_erro, v_depois;
    END IF;
  END;
END $$;
ROLLBACK;

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 9. Apagar o cadastro NÃO apaga a trilha (e ela continua legível)      ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo '-- Trilha de segurança que some quando alguém apaga o cadastro não é trilha: apagar'
\echo '-- viraria o modo de encobrir. É por isso que a FK é SET NULL e o nome é snapshot.'

BEGIN;
DO $$
DECLARE v_alvo uuid; v_log uuid; v_colab_depois uuid; v_nome_depois text; v_existe boolean;
BEGIN
  SELECT id INTO v_alvo FROM public.colaboradores
   WHERE user_id IS NULL AND (colab_email IS NULL OR btrim(colab_email) = '') LIMIT 1;
  IF v_alvo IS NULL THEN RAISE NOTICE 'CASO 9: PULADO — sem fixture'; RETURN; END IF;

  INSERT INTO public.log_email_autoinformado (colaborador_id, colab_nome, email_informado, origem)
  VALUES (v_alvo, 'Fulano de Teste', 'bateria.autoinf.caso9@exemplo.test', 'auth')
  RETURNING id INTO v_log;

  -- ⚠️ A exclusão pode esbarrar noutras FKs (RESTRICT de participação). Se esbarrar, o
  -- caso PULA em vez de mentir que passou.
  BEGIN
    DELETE FROM public.colaboradores WHERE id = v_alvo;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CASO 9: PULADO — o colaborador tem histórico e não se exclui (outra regra)';
    RETURN;
  END;

  SELECT colaborador_id, colab_nome, true INTO v_colab_depois, v_nome_depois, v_existe
    FROM public.log_email_autoinformado WHERE id = v_log;

  IF v_existe AND v_colab_depois IS NULL AND v_nome_depois = 'Fulano de Teste' THEN
    RAISE NOTICE 'CASO 9: OK — trilha sobreviveu, com o nome legível no snapshot';
  ELSE
    RAISE NOTICE 'CASO 9: FALHOU — existe=% colaborador_id=% nome=%', v_existe, v_colab_depois, v_nome_depois;
  END IF;
END $$;
ROLLBACK;

\echo ''
\echo '-- FIM. Nenhuma linha sobreviveu: tudo rodou em transação com ROLLBACK.'
\echo ''
