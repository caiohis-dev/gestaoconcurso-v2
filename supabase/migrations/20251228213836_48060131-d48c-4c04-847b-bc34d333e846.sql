-- Add CBO field to funcoes_colaboradores table
ALTER TABLE public.funcoes_colaboradores
ADD COLUMN cargo_cbo character varying(7);