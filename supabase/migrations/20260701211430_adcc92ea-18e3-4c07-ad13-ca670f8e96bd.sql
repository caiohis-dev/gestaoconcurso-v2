CREATE TABLE public.colaboradores_backup_20260701 (LIKE public.colaboradores INCLUDING ALL);
INSERT INTO public.colaboradores_backup_20260701 SELECT * FROM public.colaboradores;
ALTER TABLE public.colaboradores_backup_20260701 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.colaboradores_backup_20260701 TO service_role;