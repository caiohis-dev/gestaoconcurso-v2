-- Create table for storing payment values per function per prova
CREATE TABLE public.valores_funcao_prova (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prova_id UUID NOT NULL REFERENCES public.provas(id) ON DELETE CASCADE,
  funcao_id UUID NOT NULL REFERENCES public.funcoes_colaboradores(id) ON DELETE CASCADE,
  valor_pagamento NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(prova_id, funcao_id)
);

-- Enable RLS
ALTER TABLE public.valores_funcao_prova ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view valores_funcao_prova"
  ON public.valores_funcao_prova
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert valores_funcao_prova"
  ON public.valores_funcao_prova
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update valores_funcao_prova"
  ON public.valores_funcao_prova
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete valores_funcao_prova"
  ON public.valores_funcao_prova
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_valores_funcao_prova_updated_at
  BEFORE UPDATE ON public.valores_funcao_prova
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();