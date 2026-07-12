-- Add last_access column to colaboradores table to persist last access even after logout
ALTER TABLE public.colaboradores 
ADD COLUMN IF NOT EXISTS colab_ultimo_acesso timestamp with time zone DEFAULT NULL;

-- Update the register_colaborador_session function to also update colaboradores.colab_ultimo_acesso
CREATE OR REPLACE FUNCTION public.register_colaborador_session(p_colaborador_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update last access on colaboradores table (persists after logout)
  UPDATE public.colaboradores
  SET colab_ultimo_acesso = NOW()
  WHERE id = p_colaborador_id;

  -- Insert or update session
  INSERT INTO public.colaborador_sessions (colaborador_id, last_activity)
  VALUES (p_colaborador_id, NOW())
  ON CONFLICT (colaborador_id) 
  DO UPDATE SET last_activity = NOW();
END;
$function$;

-- Update the activity update function to also update colaboradores.colab_ultimo_acesso
CREATE OR REPLACE FUNCTION public.update_colaborador_session_activity(p_colaborador_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update last access on colaboradores table
  UPDATE public.colaboradores
  SET colab_ultimo_acesso = NOW()
  WHERE id = p_colaborador_id;

  -- Update session activity
  UPDATE public.colaborador_sessions
  SET last_activity = NOW()
  WHERE colaborador_id = p_colaborador_id;
END;
$function$;