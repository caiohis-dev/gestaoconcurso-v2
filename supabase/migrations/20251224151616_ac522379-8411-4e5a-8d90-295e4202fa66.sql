-- Make most columns nullable, keeping only CPF, data_nascimento and senha as NOT NULL
ALTER TABLE public.colaboradores 
  ALTER COLUMN colab_matricula DROP NOT NULL,
  ALTER COLUMN colab_nome_completo DROP NOT NULL,
  ALTER COLUMN colab_nacionalidade DROP NOT NULL,
  ALTER COLUMN colab_pis DROP NOT NULL,
  ALTER COLUMN colab_rua DROP NOT NULL,
  ALTER COLUMN colab_numero_casa DROP NOT NULL,
  ALTER COLUMN colab_bairro DROP NOT NULL,
  ALTER COLUMN colab_cidade DROP NOT NULL,
  ALTER COLUMN colab_cep DROP NOT NULL,
  ALTER COLUMN colab_estado_civil DROP NOT NULL,
  ALTER COLUMN colab_raca DROP NOT NULL,
  ALTER COLUMN colab_grau_instrucao DROP NOT NULL,
  ALTER COLUMN colab_telefone DROP NOT NULL;

-- Make data_nascimento NOT NULL (it was nullable before)
-- First update any NULL values to a placeholder
UPDATE public.colaboradores SET colab_data_nascimento = '1900-01-01' WHERE colab_data_nascimento IS NULL;
ALTER TABLE public.colaboradores ALTER COLUMN colab_data_nascimento SET NOT NULL;

-- Update the get_colaborador_full_data function to handle nullable fields
CREATE OR REPLACE FUNCTION public.get_colaborador_full_data(p_colaborador_id UUID)
RETURNS TABLE(
  id UUID,
  colab_matricula TEXT,
  colab_nome_completo TEXT,
  colab_cpf TEXT,
  colab_nacionalidade TEXT,
  colab_pis TEXT,
  colab_rua TEXT,
  colab_numero_casa INTEGER,
  colab_complemento_endereco TEXT,
  colab_bairro TEXT,
  colab_cidade TEXT,
  colab_cep BIGINT,
  colab_telefone BIGINT,
  colab_grau_instrucao SMALLINT,
  colab_estado_civil SMALLINT,
  colab_raca SMALLINT,
  colab_deficiente BOOLEAN,
  colab_data_nascimento DATE
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    COALESCE(c.colab_matricula, '')::TEXT,
    COALESCE(c.colab_nome_completo, '')::TEXT,
    c.colab_cpf::TEXT,
    COALESCE(c.colab_nacionalidade, '')::TEXT,
    COALESCE(c.colab_pis, '')::TEXT,
    COALESCE(c.colab_rua, '')::TEXT,
    COALESCE(c.colab_numero_casa, 0),
    COALESCE(c.colab_complemento_endereco, '')::TEXT,
    COALESCE(c.colab_bairro, '')::TEXT,
    COALESCE(c.colab_cidade, '')::TEXT,
    COALESCE(c.colab_cep, 0),
    COALESCE(c.colab_telefone, 0),
    COALESCE(c.colab_grau_instrucao, 0),
    COALESCE(c.colab_estado_civil, 0),
    COALESCE(c.colab_raca, 0),
    c.colab_deficiente,
    c.colab_data_nascimento
  FROM colaboradores c
  WHERE c.id = p_colaborador_id;
END;
$$;

-- Update the update_colaborador_data function to handle nullable fields
CREATE OR REPLACE FUNCTION public.update_colaborador_data(
  p_colaborador_id UUID,
  p_matricula TEXT,
  p_pis TEXT,
  p_rua TEXT,
  p_numero_casa INTEGER,
  p_complemento TEXT,
  p_bairro TEXT,
  p_cidade TEXT,
  p_cep BIGINT,
  p_telefone BIGINT,
  p_grau_instrucao SMALLINT,
  p_estado_civil SMALLINT,
  p_raca SMALLINT,
  p_deficiente BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE colaboradores
  SET 
    colab_matricula = NULLIF(p_matricula, ''),
    colab_pis = NULLIF(p_pis, ''),
    colab_rua = NULLIF(p_rua, ''),
    colab_numero_casa = NULLIF(p_numero_casa, 0),
    colab_complemento_endereco = NULLIF(p_complemento, ''),
    colab_bairro = NULLIF(p_bairro, ''),
    colab_cidade = NULLIF(p_cidade, ''),
    colab_cep = NULLIF(p_cep, 0),
    colab_telefone = NULLIF(p_telefone, 0),
    colab_grau_instrucao = NULLIF(p_grau_instrucao, 0),
    colab_estado_civil = NULLIF(p_estado_civil, 0),
    colab_raca = NULLIF(p_raca, 0),
    colab_deficiente = p_deficiente,
    updated_at = NOW()
  WHERE id = p_colaborador_id;
  
  RETURN FOUND;
END;
$$;