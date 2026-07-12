
-- Função para obter a prova_unidade_id do coordenador
CREATE OR REPLACE FUNCTION public.get_coordenador_prova_unidade_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT colp.prova_unidade_id
  FROM coordenadores_prova cp
  JOIN colaboradores_prova colp ON cp.colaborador_prova_id = colp.id
  WHERE cp.user_id = p_user_id
$$;

-- Atualizar função para retornar apenas colaboradores da unidade específica do coordenador
CREATE OR REPLACE FUNCTION public.get_coordenador_colaboradores(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Colaboradores cadastrados por este coordenador
  SELECT DISTINCT c.id
  FROM public.colaboradores c
  WHERE c.created_by = p_user_id
  UNION
  -- Colaboradores vinculados à mesma prova_unidade do coordenador
  SELECT DISTINCT cp.colaborador_id
  FROM public.colaboradores_prova cp
  WHERE cp.prova_unidade_id IN (
    SELECT colp.prova_unidade_id
    FROM public.coordenadores_prova coord
    JOIN public.colaboradores_prova colp ON coord.colaborador_prova_id = colp.id
    WHERE coord.user_id = p_user_id
  )
$$;
