DROP POLICY IF EXISTS "Admins can update colaboradores if not logged in" ON public.colaboradores;

CREATE POLICY "Admins and coordenadores can update colaboradores if not logged in"
ON public.colaboradores
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  AND NOT is_colaborador_logged_in(id)
);