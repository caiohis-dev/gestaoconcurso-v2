-- Atualizar políticas de colaboradores_prova para permitir coordenadores

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can insert colaboradores_prova" ON public.colaboradores_prova;
DROP POLICY IF EXISTS "Admins can update colaboradores_prova" ON public.colaboradores_prova;
DROP POLICY IF EXISTS "Admins can delete colaboradores_prova" ON public.colaboradores_prova;

-- Create new policies that allow admins and coordinators

-- INSERT: Admins podem inserir em qualquer lugar, coordenadores apenas nas suas prova_unidades
CREATE POLICY "Admins and coordinators can insert colaboradores_prova" 
ON public.colaboradores_prova 
FOR INSERT 
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') 
  OR (
    public.has_role(auth.uid(), 'coordenador') 
    AND prova_unidade_id IN (SELECT public.get_coordenador_prova_unidade_ids(auth.uid()))
  )
);

-- UPDATE: Admins podem atualizar qualquer registro, coordenadores apenas nas suas prova_unidades
CREATE POLICY "Admins and coordinators can update colaboradores_prova" 
ON public.colaboradores_prova 
FOR UPDATE 
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR (
    public.has_role(auth.uid(), 'coordenador') 
    AND prova_unidade_id IN (SELECT public.get_coordenador_prova_unidade_ids(auth.uid()))
  )
);

-- DELETE: Admins podem deletar qualquer registro, coordenadores apenas nas suas prova_unidades
CREATE POLICY "Admins and coordinators can delete colaboradores_prova" 
ON public.colaboradores_prova 
FOR DELETE 
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR (
    public.has_role(auth.uid(), 'coordenador') 
    AND prova_unidade_id IN (SELECT public.get_coordenador_prova_unidade_ids(auth.uid()))
  )
);