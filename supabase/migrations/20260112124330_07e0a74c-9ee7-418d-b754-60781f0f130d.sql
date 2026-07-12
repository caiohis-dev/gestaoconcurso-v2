-- Add 'coordenador' to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'coordenador';

-- Create table to link coordenadores (colaboradores) to provas they coordinate
CREATE TABLE public.coordenadores_prova (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_prova_id UUID NOT NULL REFERENCES public.colaboradores_prova(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prova_id UUID NOT NULL REFERENCES public.provas(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(colaborador_prova_id),
  UNIQUE(user_id, prova_id)
);

-- Enable RLS
ALTER TABLE public.coordenadores_prova ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view coordenadores_prova"
  ON public.coordenadores_prova
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert coordenadores_prova"
  ON public.coordenadores_prova
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update coordenadores_prova"
  ON public.coordenadores_prova
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete coordenadores_prova"
  ON public.coordenadores_prova
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to check if user is coordenador for a specific prova
CREATE OR REPLACE FUNCTION public.is_coordenador_prova(p_user_id UUID, p_prova_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coordenadores_prova
    WHERE user_id = p_user_id
      AND prova_id = p_prova_id
  )
$$;

-- Function to get all prova_ids for a coordenador
CREATE OR REPLACE FUNCTION public.get_coordenador_prova_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT prova_id
  FROM public.coordenadores_prova
  WHERE user_id = p_user_id
$$;

-- Function to get colaboradores created by coordenador or assigned to their provas
CREATE OR REPLACE FUNCTION public.get_coordenador_colaboradores(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT c.id
  FROM public.colaboradores c
  WHERE c.created_by = p_user_id
  UNION
  SELECT DISTINCT cp.colaborador_id
  FROM public.colaboradores_prova cp
  JOIN public.prova_unidades pu ON cp.prova_unidade_id = pu.id
  JOIN public.coordenadores_prova coord ON coord.prova_id = pu.prova_id AND coord.user_id = p_user_id
$$;