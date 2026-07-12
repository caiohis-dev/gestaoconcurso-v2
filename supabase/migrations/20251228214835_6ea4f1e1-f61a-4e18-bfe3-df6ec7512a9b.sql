-- Add email and chave_pix columns to colaboradores table
ALTER TABLE public.colaboradores
ADD COLUMN colab_email character varying(255),
ADD COLUMN colab_chave_pix character varying(255);