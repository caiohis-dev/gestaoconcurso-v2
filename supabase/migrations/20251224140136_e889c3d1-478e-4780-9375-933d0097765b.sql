-- Create function to check if colaborador has password set
CREATE OR REPLACE FUNCTION public.check_colaborador_has_password(p_cpf bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_password boolean;
BEGIN
  SELECT colab_senha IS NOT NULL INTO has_password
  FROM public.colaboradores
  WHERE colab_cpf = p_cpf;
  
  RETURN COALESCE(has_password, false);
END;
$$;