
-- Drop the old sala_colaboradores table
DROP TABLE IF EXISTS public.sala_colaboradores;

-- Create the new colaboradores_prova table
CREATE TABLE public.colaboradores_prova (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prova_unidade_id UUID NOT NULL REFERENCES public.prova_unidades(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  funcao_id UUID REFERENCES public.funcoes_colaboradores(id) ON DELETE SET NULL,
  valor_pagamento DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Each colaborador can only appear once per prova (not per unidade)
  -- We need to ensure uniqueness at the prova level, so we'll use a trigger
  CONSTRAINT unique_colaborador_prova_unidade UNIQUE (prova_unidade_id, colaborador_id)
);

-- Create a function to check if colaborador is already assigned to the same prova
CREATE OR REPLACE FUNCTION check_colaborador_prova_unique()
RETURNS TRIGGER AS $$
DECLARE
  v_prova_id UUID;
  existing_count INTEGER;
BEGIN
  -- Get the prova_id from the prova_unidade being inserted
  SELECT prova_id INTO v_prova_id
  FROM public.prova_unidades
  WHERE id = NEW.prova_unidade_id;
  
  -- Check if this colaborador is already assigned to any unit of the same prova
  SELECT COUNT(*) INTO existing_count
  FROM public.colaboradores_prova cp
  JOIN public.prova_unidades pu ON cp.prova_unidade_id = pu.id
  WHERE pu.prova_id = v_prova_id
    AND cp.colaborador_id = NEW.colaborador_id
    AND cp.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');
  
  IF existing_count > 0 THEN
    RAISE EXCEPTION 'Este colaborador já está alocado em outra unidade desta prova.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
CREATE TRIGGER check_colaborador_prova_unique_trigger
  BEFORE INSERT OR UPDATE ON public.colaboradores_prova
  FOR EACH ROW
  EXECUTE FUNCTION check_colaborador_prova_unique();

-- Enable RLS
ALTER TABLE public.colaboradores_prova ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view colaboradores_prova"
  ON public.colaboradores_prova
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert colaboradores_prova"
  ON public.colaboradores_prova
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update colaboradores_prova"
  ON public.colaboradores_prova
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete colaboradores_prova"
  ON public.colaboradores_prova
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
