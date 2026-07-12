ALTER TABLE public.ocorrencias_colaborador
  ADD COLUMN IF NOT EXISTS substituido smallint NOT NULL DEFAULT 0
  CHECK (substituido IN (0, 1));