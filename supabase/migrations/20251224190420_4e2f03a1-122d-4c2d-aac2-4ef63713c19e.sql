-- Criar tabela de relacionamento entre provas e unidades
CREATE TABLE public.prova_unidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prova_id UUID NOT NULL REFERENCES public.provas(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES public.unidades_prova(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(prova_id, unidade_id)
);

-- Enable RLS
ALTER TABLE public.prova_unidades ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view prova_unidades"
ON public.prova_unidades FOR SELECT
USING (true);

CREATE POLICY "Admins can insert prova_unidades"
ON public.prova_unidades FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update prova_unidades"
ON public.prova_unidades FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete prova_unidades"
ON public.prova_unidades FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));