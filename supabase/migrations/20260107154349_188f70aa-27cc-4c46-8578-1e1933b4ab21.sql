-- Create table to store target number of collaborators per function per prova_unidade
CREATE TABLE public.meta_colaboradores_unidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prova_unidade_id UUID NOT NULL REFERENCES public.prova_unidades(id) ON DELETE CASCADE,
  funcao_id UUID NOT NULL REFERENCES public.funcoes_colaboradores(id) ON DELETE CASCADE,
  quantidade_meta INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(prova_unidade_id, funcao_id)
);

-- Enable Row Level Security
ALTER TABLE public.meta_colaboradores_unidade ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view meta_colaboradores_unidade"
ON public.meta_colaboradores_unidade
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert meta_colaboradores_unidade"
ON public.meta_colaboradores_unidade
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update meta_colaboradores_unidade"
ON public.meta_colaboradores_unidade
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete meta_colaboradores_unidade"
ON public.meta_colaboradores_unidade
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_meta_colaboradores_unidade_updated_at
BEFORE UPDATE ON public.meta_colaboradores_unidade
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();