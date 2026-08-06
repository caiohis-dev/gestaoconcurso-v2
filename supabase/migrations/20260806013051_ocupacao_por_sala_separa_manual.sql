-- `contar_alocados_por_sala` passa a separar o que é MANUAL do total.
--
-- 🔴 POR QUE: a tela de planejamento estava deixando montar planos que o banco recusa.
--
-- Reproduzido com o dado real (2026-08-05), unidade CGV, 16 salas × 30 = 480 vagas:
--   bloco GEOGRAFIA (322)  → salas 1–11 (10 cheias + 22 na 11ª), sobram  8 ociosas
--   bloco L. INGLESA PCD (6) → sala 12 (6 de 30),                sobram 24 ociosas
--   bloco DOCENTE II (152) → restam salas 13–16 = 120 vagas       ❌ AL004
-- A UI oferecia 480 − 328 = 152; o banco tinha 120. A diferença são as 32 vagas ociosas
-- que a regra "cada bloco abre sala nova" cria — e que a tela não modelava.
--
-- Para simular o mesmo empacotamento, a tela precisa das salas UMA A UMA com quanto resta
-- em cada, e o que "resta" no rascunho é a capacidade menos as alocações MANUAIS (as
-- automáticas são apagadas pelo próprio Aplicar). Daí a coluna nova.
--
-- ⚠️ `total` continua existindo e é o que os cards de sala mostram — quem consome aquele
-- número quer a ocupação REAL, não a base do rascunho. São dois números diferentes e não
-- podem virar um só.

DROP FUNCTION IF EXISTS public.contar_alocados_por_sala(uuid);

CREATE FUNCTION public.contar_alocados_por_sala(p_prova_id uuid)
RETURNS TABLE (sala_id uuid, total bigint, manuais bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT a.sala_id,
         count(*) AS total,
         count(*) FILTER (WHERE a.origem = 'manual') AS manuais
    FROM candidatos_alocacao a
   WHERE a.prova_id = p_prova_id
   GROUP BY a.sala_id;
$$;

COMMENT ON FUNCTION public.contar_alocados_por_sala(uuid) IS
  'Ocupacao por sala: `total` (o que os cards mostram) e `manuais` (a base do rascunho de '
  'arrasto, porque aplicar o plano apaga as automaticas). A tela precisa das salas UMA A '
  'UMA para simular o empacotamento do banco — sem isso ela oferece vagas que a regra '
  '"cada bloco abre sala nova" ja gastou em ociosidade.';

REVOKE ALL ON FUNCTION public.contar_alocados_por_sala(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contar_alocados_por_sala(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.contar_alocados_por_sala(uuid) TO authenticated;
