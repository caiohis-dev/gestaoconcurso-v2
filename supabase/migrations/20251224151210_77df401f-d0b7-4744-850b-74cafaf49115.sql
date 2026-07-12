-- Update the function to include PIS and Matricula fields
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
    colab_matricula = p_matricula,
    colab_pis = p_pis,
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