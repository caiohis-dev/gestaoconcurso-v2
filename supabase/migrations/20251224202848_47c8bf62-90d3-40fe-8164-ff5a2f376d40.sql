-- Create table to relate salas_prova_distribuidas with colaboradores (fiscais)
CREATE TABLE public.sala_colaboradores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sala_distribuida_id UUID NOT NULL REFERENCES public.salas_prova_distribuidas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID,
  UNIQUE(sala_distribuida_id, colaborador_id)
);

-- Enable RLS
ALTER TABLE public.sala_colaboradores ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view sala_colaboradores"
ON public.sala_colaboradores
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert sala_colaboradores"
ON public.sala_colaboradores
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sala_colaboradores"
ON public.sala_colaboradores
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete sala_colaboradores"
ON public.sala_colaboradores
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));