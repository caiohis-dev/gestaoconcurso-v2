-- Criar tabela salas_prova_distribuidas
CREATE TABLE public.salas_prova_distribuidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prova_id uuid NOT NULL REFERENCES public.provas(id) ON DELETE CASCADE,
  sala_fk_unidade uuid NOT NULL REFERENCES public.unidades_prova(id) ON DELETE CASCADE,
  sala_numero integer NOT NULL,
  sala_descricao varchar,
  sala_arcondicionado boolean DEFAULT false,
  sala_capacidade smallint NOT NULL,
  sala_andar smallint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

-- Enable Row Level Security
ALTER TABLE public.salas_prova_distribuidas ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view salas_prova_distribuidas" 
ON public.salas_prova_distribuidas 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert salas_prova_distribuidas" 
ON public.salas_prova_distribuidas 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update salas_prova_distribuidas" 
ON public.salas_prova_distribuidas 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete salas_prova_distribuidas" 
ON public.salas_prova_distribuidas 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_salas_prova_distribuidas_updated_at
BEFORE UPDATE ON public.salas_prova_distribuidas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();