-- Create a function to get colaborador details after password verification (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_colaborador_by_id(p_colaborador_id UUID)
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
  WHERE c.id = p_colaborador_id;
END;
$$;