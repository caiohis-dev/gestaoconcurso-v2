ALTER TABLE public.colaboradores
  ADD CONSTRAINT colab_codigo_acesso_format
  CHECK (colab_codigo_acesso IS NULL OR colab_codigo_acesso ~ '^[0-9]{4}$');