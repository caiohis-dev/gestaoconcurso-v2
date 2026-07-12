
ALTER TABLE public.prova_unidades
  ADD COLUMN IF NOT EXISTS unidade_finalizada_by UUID REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.finalizar_prova_unidade(p_prova_unidade_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prova_id UUID;
  v_created_by UUID;
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
    OR v_created_by = p_user_id
    OR public.is_coordenador_prova(p_user_id, v_prova_id)
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para finalizar esta unidade.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.prova_unidades
     SET unidade_finalizada = TRUE,
         unidade_finalizada_at = NOW(),
         unidade_finalizada_by = p_user_id
   WHERE id = p_prova_unidade_id;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reabrir_prova_unidade(p_prova_unidade_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_finalized_by UUID;
BEGIN
  SELECT unidade_finalizada_by
    INTO v_finalized_by
  FROM public.prova_unidades
  WHERE id = p_prova_unidade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade de prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(p_user_id, 'superadmin'::app_role)
    OR (v_finalized_by IS NOT NULL AND v_finalized_by = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Apenas o usuário que finalizou esta unidade pode reabri-la.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.prova_unidades
     SET unidade_finalizada = FALSE,
         unidade_finalizada_at = NULL,
         unidade_finalizada_by = NULL
   WHERE id = p_prova_unidade_id;

  RETURN TRUE;
END;
$function$;
