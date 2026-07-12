
-- Add columns to track ocorrencias registration closure per prova_unidade
ALTER TABLE public.prova_unidades
  ADD COLUMN IF NOT EXISTS ocorrencias_encerradas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocorrencias_encerradas_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ocorrencias_encerradas_by uuid NULL;

-- RPC to close ocorrencias registration for a prova_unidade (no reopen)
CREATE OR REPLACE FUNCTION public.encerrar_ocorrencias_unidade(
  p_prova_unidade_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prova_id uuid;
  v_created_by uuid;
BEGIN
  SELECT pu.prova_id, p.created_by
    INTO v_prova_id, v_created_by
  FROM public.prova_unidades pu
  JOIN public.provas p ON p.id = pu.prova_id
  WHERE pu.id = p_prova_unidade_id;

  IF v_prova_id IS NULL THEN
    RAISE EXCEPTION 'Unidade de prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(p_user_id, 'superadmin'::app_role)
    OR public.has_role(p_user_id, 'admin'::app_role)
    OR v_created_by = p_user_id
    OR public.is_coordenador_prova(p_user_id, v_prova_id)
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para encerrar o registro desta unidade.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.prova_unidades
     SET ocorrencias_encerradas = TRUE,
         ocorrencias_encerradas_at = NOW(),
         ocorrencias_encerradas_by = p_user_id
   WHERE id = p_prova_unidade_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.encerrar_ocorrencias_unidade(uuid, uuid) TO authenticated;
