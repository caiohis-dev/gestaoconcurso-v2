-- Drop existing permissive policies
DROP POLICY IF EXISTS "Anyone can insert sessions" ON public.colaborador_sessions;
DROP POLICY IF EXISTS "Anyone can delete sessions" ON public.colaborador_sessions;
DROP POLICY IF EXISTS "Anyone can view sessions" ON public.colaborador_sessions;
DROP POLICY IF EXISTS "Anyone can update sessions" ON public.colaborador_sessions;

-- Create restrictive policies
-- Only admins can view sessions (to see which collaborators are online)
CREATE POLICY "Admins can view sessions"
ON public.colaborador_sessions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Direct INSERT is denied - use register_colaborador_session() function instead
-- The function is SECURITY DEFINER and bypasses RLS
CREATE POLICY "No direct insert - use function"
ON public.colaborador_sessions
FOR INSERT
WITH CHECK (false);

-- Direct UPDATE is denied - use update_colaborador_session_activity() function instead
CREATE POLICY "No direct update - use function"
ON public.colaborador_sessions
FOR UPDATE
USING (false);

-- Direct DELETE is denied - use unregister_colaborador_session() function instead
CREATE POLICY "No direct delete - use function"
ON public.colaborador_sessions
FOR DELETE
USING (false);