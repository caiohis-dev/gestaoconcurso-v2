-- O vínculo colaborador↔conta deixa de depender do NASCIMENTO da conta.
--
-- O QUE ESTAVA QUEBRADO
-- Até aqui, o único lugar que preenchia `colaboradores.user_id` e concedia o papel
-- `colaborador` era o trigger `on_auth_user_created` → `handle_new_user()`, que só
-- dispara no INSERT de `auth.users`. Quem já tinha conta nunca se vinculava por
-- caminho nenhum: o `generateLink('invite')` falha (a conta existe), a
-- `reivindicar-acesso` descartava esse erro e respondia sucesso, e a pessoa entrava
-- por "esqueci minha senha" com `user_id` NULL e SEM o papel — logada e invisível
-- como colaboradora. É perda silenciosa, e é o mesmo defeito que aposentou a EF
-- `create-coordenador` (migration 20260912165246).
--
-- O QUE MUDA
--   1. O miolo do vínculo vira função própria, `vincular_colaborador_a_conta`.
--   2. `handle_new_user` passa a chamá-la — comportamento IDÊNTICO (é o controle
--      positivo da bateria).
--   3. Um segundo gatilho, `on_auth_user_signin`, chama a mesma função quando a
--      conta LOGA (ou confirma o e-mail). Entrar com a própria senha é a prova de
--      posse da caixa — o mesmo princípio que a `corrigir-email-acesso` já adota ao
--      renomear a conta com `email_confirm: false`.
--
-- POR QUE NO BANCO, E NÃO NA EDGE FUNCTION (CLAUDE.md §2)
-- Vínculo feito num `if` da EF não vale para psql, PostgREST nem script, concede
-- papel sem posse provada, e repete UPDATE + INSERT de papel sem transação.
--
-- MEDIDO no banco local em 2026-09-19, antes de escrever: 821 colaboradores, 769 em
-- estado A, 526 deles já com e-mail, e ZERO em estado A cujo `colab_email` já tenha
-- conta no Auth. O risco é prospectivo — nasce quando alguém digita o e-mail à mão
-- no "Editar Colaborador". Não há dado a sanear aqui (e se houvesse, iria ao dump,
-- não a uma migration — §3).
--
-- Verificação: docs/bateria-vinculo-colaborador.sql (10 casos, com controle positivo).

-- ---------------------------------------------------------------------------
-- 1. A função: o vínculo, num lugar só.
--
-- 🔴 A guarda do `NOT EXISTS` é o que impede DERRUBAR LOGIN. Existe
-- `colaboradores_user_id_key UNIQUE (user_id)`: se a conta que está logando já
-- estiver vinculada a OUTRA linha, o UPDATE levantaria 23505 dentro da transação de
-- login do GoTrue, e a pessoa não entraria. No `handle_new_user` esse caso é
-- inalcançável (o user_id acabou de nascer); no gatilho de login, não é.
--
-- Por que é seguro: `colab_email` tem índice único funcional sobre lower(trim(...)),
-- então no máximo uma linha casa; o vínculo só ocorre com `user_id IS NULL`; e nada
-- vem do cliente — o e-mail é o de `auth.users`, que o próprio Auth controla.
CREATE OR REPLACE FUNCTION public.vincular_colaborador_a_conta(
  p_user_id uuid,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_colab_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN NULL;
  END IF;

  UPDATE public.colaboradores
     SET user_id = p_user_id
   WHERE user_id IS NULL
     AND lower(trim(colab_email)) = lower(trim(p_email))
     AND NOT EXISTS (
       SELECT 1 FROM public.colaboradores c2 WHERE c2.user_id = p_user_id
     )
  RETURNING id INTO v_colab_id;

  IF v_colab_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'colaborador')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- A auditoria mínima que não existia: sem isto, um vínculo por e-mail digitado
  -- errado não deixa rastro em lugar nenhum.
  RAISE LOG 'vincular_colaborador_a_conta: colaborador % vinculado a conta %',
    v_colab_id, p_user_id;

  RETURN v_colab_id;
END;
$$;

-- 🔴 SECURITY DEFINER que escreve em `user_roles` NÃO pode ficar ao alcance do
-- PostgREST: chamá-la com o próprio user_id e o e-mail de um colaborador seria
-- escalada de privilégio direta. O padrão do Postgres é EXECUTE para PUBLIC — é
-- preciso revogar. (Os dois triggers a alcançam por serem SECURITY DEFINER do dono.)
REVOKE ALL ON FUNCTION public.vincular_colaborador_a_conta(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vincular_colaborador_a_conta(uuid, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. `handle_new_user` passa a delegar. Comportamento idêntico ao de
--    20260714201650 — é isso que a bateria confere como controle positivo.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  -- O vínculo com o cadastro de colaborador, quando houver um casando pelo e-mail.
  PERFORM public.vincular_colaborador_a_conta(NEW.id, NEW.email);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. O gatilho de login — a conta que JÁ existia.
--
-- ⚠️ O `EXCEPTION` aqui engole erro, e isso é deliberado: esta função roda DENTRO da
-- transação de login do GoTrue. Qualquer exceção não tratada impediria a pessoa de
-- entrar. Engolir em silêncio é a perda silenciosa que o CLAUDE.md §8 teme — o
-- contrapeso é o RAISE WARNING, que vai para o log do Postgres, e o caso 6 da
-- bateria, que prova que o login sobrevive.
CREATE OR REPLACE FUNCTION public.vincular_colaborador_no_signin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.vincular_colaborador_a_conta(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'vincular_colaborador_no_signin: falhou para a conta % (%) — login preservado',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- `last_sign_in_at` é o sinal certo, e foi medido: das 58 contas, as 52 confirmadas
-- JÁ têm `email_confirmed_at`. Uma conta que já existe — o caso alvo — nunca mais
-- muda esse carimbo, então um gatilho só nele jamais dispararia para ela. O
-- `last_sign_in_at` é carimbado a CADA login. As duas colunas juntas cobrem também a
-- conta pendente que confirma o e-mail sem abrir sessão.
--
-- O `WHEN` filtra antes de entrar na função, e a busca casa a expressão do índice
-- único funcional `colaboradores_colab_email_key` (index scan, conferido no EXPLAIN):
-- uma sondagem por login, no-op na imensa maioria.
DROP TRIGGER IF EXISTS on_auth_user_signin ON auth.users;
CREATE TRIGGER on_auth_user_signin
  AFTER UPDATE OF last_sign_in_at, email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (
    NEW.email IS NOT NULL
    AND (
      NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
      OR NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at
    )
  )
  EXECUTE FUNCTION public.vincular_colaborador_no_signin();

COMMENT ON FUNCTION public.vincular_colaborador_a_conta(uuid, text) IS
  'Vincula o cadastro de colaborador de mesmo e-mail à conta e concede o papel colaborador. Chamada pelos triggers on_auth_user_created (nascimento) e on_auth_user_signin (login/confirmação). Não é para o PostgREST: o EXECUTE é revogado de PUBLIC.';
