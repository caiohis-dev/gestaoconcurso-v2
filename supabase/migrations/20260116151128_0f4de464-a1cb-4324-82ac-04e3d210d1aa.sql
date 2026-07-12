-- Add header line fields to provas table
ALTER TABLE public.provas 
ADD COLUMN prova_cabecalho_linha1 TEXT DEFAULT 'FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA',
ADD COLUMN prova_cabecalho_linha2 TEXT DEFAULT 'Coordenação de Concursos e Processos Seletivos';