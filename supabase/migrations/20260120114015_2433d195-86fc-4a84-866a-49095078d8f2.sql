-- Add RLS policy to allow coordinators to view sessions
CREATE POLICY "Coordinators can view sessions" 
ON public.colaborador_sessions 
FOR SELECT 
USING (has_role(auth.uid(), 'coordenador'::app_role));