-- Atualizar políticas de colaboradores para permitir coordenadores inserir

-- Drop existing insert policy
DROP POLICY IF EXISTS "Admins can insert colaboradores" ON public.colaboradores;

-- Create new insert policy that allows admins and coordinators
CREATE POLICY "Admins and coordinators can insert colaboradores" 
ON public.colaboradores 
FOR INSERT 
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'coordenador')
);