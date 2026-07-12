-- Atualizar valores NULL existentes para string vazia antes de aplicar NOT NULL
UPDATE public.colaboradores 
SET colab_nome_completo = '' 
WHERE colab_nome_completo IS NULL;

-- Tornar o campo nome completo obrigatório
ALTER TABLE public.colaboradores 
ALTER COLUMN colab_nome_completo SET NOT NULL;