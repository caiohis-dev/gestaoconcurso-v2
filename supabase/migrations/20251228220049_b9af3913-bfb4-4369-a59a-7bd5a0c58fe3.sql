-- Remove sala_arcondicionado column
ALTER TABLE public.salas_prova_distribuidas DROP COLUMN IF EXISTS sala_arcondicionado;

-- Add sala_fiscal_1 and sala_fiscal_2 columns with foreign key to colaboradores_prova
ALTER TABLE public.salas_prova_distribuidas 
ADD COLUMN sala_fiscal_1 uuid REFERENCES public.colaboradores_prova(id) ON DELETE SET NULL,
ADD COLUMN sala_fiscal_2 uuid REFERENCES public.colaboradores_prova(id) ON DELETE SET NULL;