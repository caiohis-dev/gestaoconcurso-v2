-- Create provas table
CREATE TABLE public.provas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prova_edital CHAR(15) NOT NULL,
  prova_data DATE,
  prova_hora_inicio TIME,
  prova_hora_final TIME,
  prova_n_candidatos INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.provas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view provas"
ON public.provas
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert provas"
ON public.provas
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update provas"
ON public.provas
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete provas"
ON public.provas
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_provas_updated_at
BEFORE UPDATE ON public.provas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();