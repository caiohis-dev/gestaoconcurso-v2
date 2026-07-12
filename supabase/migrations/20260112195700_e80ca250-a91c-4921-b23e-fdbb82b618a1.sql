-- Create a function to assign coordenador role (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.assign_coordenador_role(p_user_id uuid, p_prova_id uuid, p_colaborador_prova_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coordenador_id uuid;
BEGIN
  -- Only allow if the calling user is an admin
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can assign coordenador roles';
  END IF;

  -- Insert or update the user role to coordenador (ignore if already exists)
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, 'coordenador')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Create the coordenadores_prova record
  INSERT INTO coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  VALUES (p_colaborador_prova_id, p_user_id, p_prova_id, auth.uid())
  RETURNING id INTO v_coordenador_id;

  RETURN v_coordenador_id;
END;
$$;