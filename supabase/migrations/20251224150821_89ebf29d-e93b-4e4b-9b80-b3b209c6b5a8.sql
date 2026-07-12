-- Create a function to get full colaborador data by ID (bypasses RLS for colaborador self-access)
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
    c.colab_matricula::TEXT,
    c.colab_nome_completo::TEXT,
    c.colab_cpf::TEXT,
    c.colab_nacionalidade::TEXT,
    c.colab_pis::TEXT,
    c.colab_rua::TEXT,
    c.colab_numero_casa,
    c.colab_complemento_endereco::TEXT,
    c.colab_bairro::TEXT,
    c.colab_cidade::TEXT,
    c.colab_cep,
    c.colab_telefone,
    c.colab_grau_instrucao,
    c.colab_estado_civil,
    c.colab_raca,
    c.colab_deficiente,
    c.colab_data_nascimento
  FROM colaboradores c
  WHERE c.id = p_colaborador_id;
END;
$$;

-- Create a function to update colaborador data (bypasses RLS for colaborador self-update)
CREATE OR REPLACE FUNCTION public.update_colaborador_data(
  p_colaborador_id UUID,
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
    colab_rua = p_rua,
    colab_numero_casa = p_numero_casa,
    colab_complemento_endereco = NULLIF(p_complemento, ''),
    colab_bairro = p_bairro,
    colab_cidade = p_cidade,
    colab_cep = p_cep,
    colab_telefone = p_telefone,
    colab_grau_instrucao = p_grau_instrucao,
    colab_estado_civil = p_estado_civil,
    colab_raca = p_raca,
    colab_deficiente = p_deficiente,
    updated_at = NOW()
  WHERE id = p_colaborador_id;
  
  RETURN FOUND;
END;
$$;