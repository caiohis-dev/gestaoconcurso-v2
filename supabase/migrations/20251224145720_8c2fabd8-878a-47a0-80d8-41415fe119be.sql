-- Add colab_senha column to colaboradores table
ALTER TABLE public.colaboradores 
ADD COLUMN IF NOT EXISTS colab_senha TEXT;

-- Drop the bigint overload functions that are causing conflicts
DROP FUNCTION IF EXISTS public.check_colaborador_has_password(bigint);
DROP FUNCTION IF EXISTS public.verify_colaborador_password(bigint, text);

-- Recreate set_colaborador_password to handle errors better
CREATE OR REPLACE FUNCTION public.set_colaborador_password(p_colaborador_id UUID, p_password TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  colaborador_exists boolean;
BEGIN
  -- Check if colaborador exists
  SELECT EXISTS(SELECT 1 FROM public.colaboradores WHERE id = p_colaborador_id) INTO colaborador_exists;
  
  IF NOT colaborador_exists THEN
    RAISE EXCEPTION 'COLABORADOR_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  
  -- Update password
  UPDATE public.colaboradores
  SET colab_senha = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = p_colaborador_id;
  
  RETURN FOUND;
END;
$$;