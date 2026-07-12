-- Create table to track active collaborator sessions
CREATE TABLE public.colaborador_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  last_activity timestamp with time zone DEFAULT now(),
  UNIQUE(colaborador_id)
);

-- Enable RLS
ALTER TABLE public.colaborador_sessions ENABLE ROW LEVEL SECURITY;

-- Allow public insert (for login)
CREATE POLICY "Anyone can insert sessions" 
ON public.colaborador_sessions 
FOR INSERT 
WITH CHECK (true);

-- Allow public delete (for logout)
CREATE POLICY "Anyone can delete sessions" 
ON public.colaborador_sessions 
FOR DELETE 
USING (true);

-- Allow public select (to check active sessions)
CREATE POLICY "Anyone can view sessions" 
ON public.colaborador_sessions 
FOR SELECT 
USING (true);

-- Allow public update (for activity tracking)
CREATE POLICY "Anyone can update sessions" 
ON public.colaborador_sessions 
FOR UPDATE 
USING (true);

-- Function to check if a collaborator has an active session
CREATE OR REPLACE FUNCTION public.is_colaborador_logged_in(p_colaborador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaborador_sessions
    WHERE colaborador_id = p_colaborador_id
      -- Session is considered active if last activity was within 10 minutes
      AND last_activity > NOW() - INTERVAL '10 minutes'
  )
$$;

-- Function to register a collaborator session
CREATE OR REPLACE FUNCTION public.register_colaborador_session(p_colaborador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.colaborador_sessions (colaborador_id, last_activity)
  VALUES (p_colaborador_id, NOW())
  ON CONFLICT (colaborador_id) 
  DO UPDATE SET last_activity = NOW();
END;
$$;

-- Function to unregister a collaborator session
CREATE OR REPLACE FUNCTION public.unregister_colaborador_session(p_colaborador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.colaborador_sessions
  WHERE colaborador_id = p_colaborador_id;
END;
$$;

-- Function to update session activity
CREATE OR REPLACE FUNCTION public.update_colaborador_session_activity(p_colaborador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.colaborador_sessions
  SET last_activity = NOW()
  WHERE colaborador_id = p_colaborador_id;
END;
$$;

-- Update the admin update policy to check for active sessions
DROP POLICY IF EXISTS "Admins can update colaboradores" ON public.colaboradores;

CREATE POLICY "Admins can update colaboradores if not logged in" 
ON public.colaboradores 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND NOT is_colaborador_logged_in(id)
);