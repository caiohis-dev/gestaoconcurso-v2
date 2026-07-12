-- Adicionar coluna código de acesso (4 dígitos, não criptografado)
ALTER TABLE public.colaboradores 
ADD COLUMN IF NOT EXISTS colab_codigo_acesso character(4);

-- Atualizar colaboradores existentes com códigos aleatórios
UPDATE public.colaboradores 
SET colab_codigo_acesso = LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0')
WHERE colab_codigo_acesso IS NULL;

-- Criar função para gerar código de acesso automaticamente
CREATE OR REPLACE FUNCTION public.generate_codigo_acesso()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.colab_codigo_acesso IS NULL THEN
    NEW.colab_codigo_acesso := LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para gerar código automaticamente ao inserir
DROP TRIGGER IF EXISTS generate_codigo_acesso_trigger ON public.colaboradores;
CREATE TRIGGER generate_codigo_acesso_trigger
  BEFORE INSERT ON public.colaboradores
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_codigo_acesso();

-- Criar função para verificar código de acesso do colaborador (substitui verify_colaborador_password)
CREATE OR REPLACE FUNCTION public.verify_colaborador_codigo_acesso(p_cpf text, p_codigo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colaborador_id uuid;
BEGIN
  SELECT id INTO v_colaborador_id
  FROM colaboradores
  WHERE colab_cpf = p_cpf
    AND colab_codigo_acesso = p_codigo;
  
  RETURN v_colaborador_id;
END;
$$;

-- Manter função antiga para compatibilidade mas marcar como deprecated
-- (não removemos para não quebrar código existente durante a transição)