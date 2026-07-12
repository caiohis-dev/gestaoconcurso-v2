-- Create sala_prova table
CREATE TABLE public.sala_prova (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_fk_unidade UUID NOT NULL REFERENCES public.unidades_prova(id) ON DELETE CASCADE,
  sala_numero INTEGER NOT NULL,
  sala_descricao VARCHAR(50),
  sala_arcondicionado BOOLEAN DEFAULT false,
  sala_capacidade SMALLINT NOT NULL,
  sala_andar SMALLINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.sala_prova ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view sala_prova"
ON public.sala_prova FOR SELECT
USING (true);

CREATE POLICY "Admins can insert sala_prova"
ON public.sala_prova FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sala_prova"
ON public.sala_prova FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete sala_prova"
ON public.sala_prova FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_sala_prova_updated_at
BEFORE UPDATE ON public.sala_prova
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();