-- Create unidades_prova table
CREATE TABLE public.unidades_prova (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unid_nome VARCHAR(30) NOT NULL UNIQUE,
  unid_sigla CHAR(10) NOT NULL UNIQUE,
  unid_andares SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.unidades_prova ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view unidades_prova"
ON public.unidades_prova
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert unidades_prova"
ON public.unidades_prova
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update unidades_prova"
ON public.unidades_prova
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete unidades_prova"
ON public.unidades_prova
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_unidades_prova_updated_at
BEFORE UPDATE ON public.unidades_prova
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();