-- Create a function to verify colaborador for first access (runs with definer privileges)
CREATE OR REPLACE FUNCTION public.verify_colaborador_first_access(
  p_cpf TEXT,
  p_data_nascimento DATE
)
RETURNS TABLE(id UUID, nome_completo TEXT, cpf TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.colab_nome_completo::TEXT,
    c.colab_cpf::TEXT
  FROM colaboradores c
  WHERE c.colab_cpf = LPAD(p_cpf, 11, '0')
    AND c.colab_data_nascimento = p_data_nascimento;
END;
$$;