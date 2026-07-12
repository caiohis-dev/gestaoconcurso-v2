-- Change colab_cpf from bigint to CHAR(11)
ALTER TABLE public.colaboradores 
ALTER COLUMN colab_cpf TYPE CHAR(11) USING LPAD(colab_cpf::text, 11, '0');

-- Update the verify password function to work with CHAR(11)
CREATE OR REPLACE FUNCTION public.verify_colaborador_password(p_cpf text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  colaborador_id uuid;
  stored_hash text;
BEGIN
  SELECT id, colab_senha INTO colaborador_id, stored_hash
  FROM public.colaboradores
  WHERE colab_cpf = LPAD(p_cpf, 11, '0');
  
  IF colaborador_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF stored_hash IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF stored_hash = extensions.crypt(p_password, stored_hash) THEN
    RETURN colaborador_id;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Update check password function
CREATE OR REPLACE FUNCTION public.check_colaborador_has_password(p_cpf text)
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
  WHERE colab_cpf = LPAD(p_cpf, 11, '0');
  
  RETURN COALESCE(has_password, false);
END;
$$;