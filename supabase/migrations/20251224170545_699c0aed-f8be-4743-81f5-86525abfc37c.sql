-- Alterar o tamanho do campo prova_edital de 15 para 30 caracteres
ALTER TABLE public.provas
ALTER COLUMN prova_edital TYPE character(30);