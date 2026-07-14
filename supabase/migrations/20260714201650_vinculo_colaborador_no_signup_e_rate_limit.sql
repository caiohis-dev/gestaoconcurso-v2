-- Subetapa 2B da refatoração do acesso do colaborador: a reivindicação.
--
-- Duas peças de banco:
--   1. O vínculo automático no signup — o mecanismo que generaliza o backfill.
--   2. A tabela de rate limit que a Edge Function reivindicar-acesso consulta.
--
-- Ver my_rules/analises/roadmap-auth-colaborador.md.

-- ---------------------------------------------------------------------------
-- 1. Vínculo automático no nascimento da conta.
--
-- handle_new_user() já roda no trigger on_auth_user_created (cria o profiles e o
-- papel 'user'). Aqui ele passa a também: se o e-mail da conta nova casa com um
-- colaborador AINDA NÃO VINCULADO, preenche user_id e concede 'colaborador'.
--
-- É o backfill dos 12, agora contínuo: qualquer conta cujo e-mail bata com um
-- colaborador de user_id NULL se vincula sozinha — seja por reivindicação, por
-- cadastro público (2C) ou por um admin criando a conta. Um mecanismo só.
--
-- Por que é seguro: colab_email tem índice único funcional sobre lower(trim(...)),
-- então no máximo uma linha casa. O vínculo só ocorre com user_id IS NULL (a mesma
-- invariante da reivindicação). E nada disso vem do cliente — o casamento é por
-- auth.users.email, que o próprio Auth controla.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_colab_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  -- O vínculo com o cadastro de colaborador, quando houver um casando pelo e-mail.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.colaboradores
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(trim(colab_email)) = lower(trim(NEW.email))
    RETURNING id INTO v_colab_id;

    IF v_colab_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'colaborador')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Rate limit da reivindicação.
--
-- A Edge Function reivindicar-acesso revela se um CPF existe (concessão já aceita no
-- desenho — quem persegue os dados já conhece o CPF do alvo). Sem um teto, isso vira
-- um oráculo de enumeração em massa e um canal de disparo de e-mails. A função
-- registra cada tentativa por IP aqui e recusa acima do teto numa janela curta.
--
-- Escrita/leitura só pelo service_role (a função). Nunca exposta ao cliente:
-- nenhum GRANT a anon/authenticated, e RLS ligada sem policy = ninguém entra.
CREATE TABLE public.reivindicacao_rate_limit (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reivindicacao_rate_limit_ip_data
  ON public.reivindicacao_rate_limit (ip, created_at DESC);

ALTER TABLE public.reivindicacao_rate_limit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reivindicacao_rate_limit FROM anon, authenticated;
