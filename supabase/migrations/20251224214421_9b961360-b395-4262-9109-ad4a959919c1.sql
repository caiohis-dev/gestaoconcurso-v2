-- Drop the existing update policy and recreate it correctly
DROP POLICY IF EXISTS "Admins can update colaboradores if not logged in" ON public.colaboradores;

-- Create corrected update policy for authenticated users only
CREATE POLICY "Admins can update colaboradores if not logged in" 
ON public.colaboradores 
FOR UPDATE 
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND NOT is_colaborador_logged_in(id)
);

-- Also update the is_colaborador_logged_in function to use 15 minutes instead of 10
-- This gives more margin for the session check
CREATE OR REPLACE FUNCTION public.is_colaborador_logged_in(p_colaborador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaborador_sessions
    WHERE colaborador_id = p_colaborador_id
      -- Session is considered active if last activity was within 15 minutes
      AND last_activity > NOW() - INTERVAL '15 minutes'
  )
$$;