-- Create function to hash password using extensions schema
CREATE OR REPLACE FUNCTION public.hash_password(password text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.crypt(password, extensions.gen_salt('bf', 10))
$$;

-- Create function to verify password
CREATE OR REPLACE FUNCTION public.verify_colaborador_password(p_cpf bigint, p_password text)
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
  WHERE colab_cpf = p_cpf;
  
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

-- Create function to set colaborador password
CREATE OR REPLACE FUNCTION public.set_colaborador_password(p_colaborador_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.colaboradores
  SET colab_senha = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = p_colaborador_id;
  
  RETURN FOUND;
END;
$$;