-- Create funcoes_colaboradores table
CREATE TABLE public.funcoes_colaboradores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cargo_nome VARCHAR(35) NOT NULL UNIQUE,
  cargo_descricao VARCHAR(1000),
  cargo_editavel BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.funcoes_colaboradores ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view funcoes_colaboradores"
ON public.funcoes_colaboradores
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert funcoes_colaboradores"
ON public.funcoes_colaboradores
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update funcoes_colaboradores"
ON public.funcoes_colaboradores
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete funcoes_colaboradores"
ON public.funcoes_colaboradores
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_funcoes_colaboradores_updated_at
BEFORE UPDATE ON public.funcoes_colaboradores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();