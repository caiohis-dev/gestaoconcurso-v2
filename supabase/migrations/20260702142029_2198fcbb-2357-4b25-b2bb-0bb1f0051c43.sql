
CREATE TABLE public.email_atualizacao_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prova_id UUID NOT NULL REFERENCES public.provas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sucesso','falha')),
  error_message TEXT,
  sent_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_atualizacao_log_prova ON public.email_atualizacao_log(prova_id);
CREATE INDEX idx_email_atualizacao_log_colab ON public.email_atualizacao_log(colaborador_id);

GRANT SELECT, INSERT ON public.email_atualizacao_log TO authenticated;
GRANT ALL ON public.email_atualizacao_log TO service_role;

ALTER TABLE public.email_atualizacao_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver logs de email"
  ON public.email_atualizacao_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins podem inserir logs de email"
  ON public.email_atualizacao_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
