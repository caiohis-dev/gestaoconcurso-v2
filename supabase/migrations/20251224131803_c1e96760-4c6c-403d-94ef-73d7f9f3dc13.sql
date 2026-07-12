-- Add birth date column to colaboradores table
ALTER TABLE public.colaboradores 
ADD COLUMN colab_data_nascimento date;