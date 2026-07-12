-- Remove unique constraint from colab_matricula to allow duplicates
ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_colab_matricula_key;