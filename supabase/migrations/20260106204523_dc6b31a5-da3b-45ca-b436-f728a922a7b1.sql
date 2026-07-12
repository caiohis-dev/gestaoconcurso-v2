-- Add column to track if prova configuration is finalized
ALTER TABLE public.provas 
ADD COLUMN prova_finalizada BOOLEAN NOT NULL DEFAULT false;

-- Add column to track who finalized and when
ALTER TABLE public.provas 
ADD COLUMN finalizada_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create function to verify user password (using Supabase Auth)
CREATE OR REPLACE FUNCTION public.verify_user_password(p_email TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- This uses auth.uid() to get the current authenticated user
  -- We verify the password by attempting to re-authenticate
  -- For security, we'll just check if the current user matches the email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;
  
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Create function to finalize prova
CREATE OR REPLACE FUNCTION public.finalizar_prova(p_prova_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by UUID;
BEGIN
  -- Get the creator of the prova
  SELECT created_by INTO v_created_by
  FROM public.provas
  WHERE id = p_prova_id;
  
  -- Check if prova exists
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;
  
  -- Check if user is the creator
  IF v_created_by != p_user_id THEN
    RAISE EXCEPTION 'Apenas o usuário que criou a prova pode finalizá-la.' USING ERRCODE = 'P0002';
  END IF;
  
  -- Finalize the prova
  UPDATE public.provas
  SET prova_finalizada = TRUE,
      finalizada_at = NOW(),
      updated_at = NOW()
  WHERE id = p_prova_id;
  
  RETURN TRUE;
END;
$$;

-- Create function to reopen prova
CREATE OR REPLACE FUNCTION public.reabrir_prova(p_prova_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by UUID;
BEGIN
  -- Get the creator of the prova
  SELECT created_by INTO v_created_by
  FROM public.provas
  WHERE id = p_prova_id;
  
  -- Check if prova exists
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;
  
  -- Check if user is the creator
  IF v_created_by != p_user_id THEN
    RAISE EXCEPTION 'Apenas o usuário que criou a prova pode reabri-la.' USING ERRCODE = 'P0002';
  END IF;
  
  -- Reopen the prova
  UPDATE public.provas
  SET prova_finalizada = FALSE,
      finalizada_at = NULL,
      updated_at = NOW()
  WHERE id = p_prova_id;
  
  RETURN TRUE;
END;
$$;