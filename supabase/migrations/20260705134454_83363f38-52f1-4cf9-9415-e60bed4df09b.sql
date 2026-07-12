CREATE TABLE public.ocorrencias_colaborador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  prova_id UUID NOT NULL REFERENCES public.provas(id) ON DELETE CASCADE,
  prova_unidade_id UUID NOT NULL REFERENCES public.prova_unidades(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tipo_ocorrencia TEXT,
  data_ocorrencia TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocorrencias_colaborador TO authenticated;
GRANT ALL ON public.ocorrencias_colaborador TO service_role;

ALTER TABLE public.ocorrencias_colaborador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e superadmins gerenciam todas as ocorrências"
ON public.ocorrencias_colaborador
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Coordenadores gerenciam ocorrências de suas provas"
ON public.ocorrencias_colaborador
FOR ALL
TO authenticated
USING (public.is_coordenador_prova(auth.uid(), prova_id))
WITH CHECK (public.is_coordenador_prova(auth.uid(), prova_id));

CREATE TRIGGER update_ocorrencias_colaborador_updated_at
BEFORE UPDATE ON public.ocorrencias_colaborador
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();