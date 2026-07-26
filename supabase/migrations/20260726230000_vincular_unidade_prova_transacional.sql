-- Vincular e desvincular uma unidade de uma prova eram sequências de passos soltos.
--
-- VINCULAR, em `useProvaUnidades.addUnidadeMutation`, eram 3 passos: insere em
-- `prova_unidades`, lê as salas da unidade em `sala_prova`, insere as cópias em
-- `salas_prova_distribuidas`. Falhar no 3º deixava a **unidade vinculada sem sala
-- nenhuma** — e a tela não distingue esse estado de "unidade que não tem salas
-- cadastradas", então o erro ficava invisível até alguém tentar distribuir fiscais.
--
-- DESVINCULAR tinha o mesmo defeito na ordem inversa: lê o `unidade_id`, apaga as salas
-- distribuídas, apaga o vínculo. Falhar no último passo produzia exatamente o mesmo
-- estado corrompido: vínculo vivo, zero salas.
--
-- As duas viram uma função só cada. Corpo de função PL/pgSQL roda em transação: qualquer
-- exceção desfaz tudo o que veio antes. É a mesma forma da RPC `revogar_coordenador`
-- (migration 20260726160000), que fechou o mesmo padrão na revogação de coordenador.
--
-- AUTORIZAÇÃO: `has_role(auth.uid(), 'admin')`, espelhando exatamente as policies de
-- INSERT/DELETE das duas tabelas — não afrouxa nada. Via `has_role` e não por SELECT
-- literal em `user_roles`, porque a hierarquia (superadmin ⇒ admin) mora dentro daquela
-- função desde a migration 20260725195530; consultar a tabela direto já bloqueou o
-- superadmin três vezes neste repo.
--
-- `prova_id` NÃO é parâmetro em `desvincular`: sai da própria linha. Passá-lo de fora
-- abriria a chance de o cliente mandar um `prova_id` que não corresponde ao vínculo, e
-- apagar salas distribuídas de outra prova.

CREATE OR REPLACE FUNCTION public.vincular_unidade_a_prova(
  p_prova_id uuid,
  p_unidade_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prova_unidade_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem vincular unidades a uma prova.';
  END IF;

  INSERT INTO prova_unidades (prova_id, unidade_id, created_by)
  VALUES (p_prova_id, p_unidade_id, auth.uid())
  RETURNING id INTO v_prova_unidade_id;

  -- Cópia das salas da unidade para esta prova. `sala_andar` e `sala_descricao` vêm
  -- junto; o número é o mesmo, e o índice único de 20260726220000 garante que não haja
  -- repetição dentro da mesma prova+unidade.
  INSERT INTO salas_prova_distribuidas
    (prova_id, sala_fk_unidade, sala_numero, sala_descricao, sala_capacidade, sala_andar, created_by)
  SELECT p_prova_id, s.sala_fk_unidade, s.sala_numero, s.sala_descricao,
         s.sala_capacidade, s.sala_andar, auth.uid()
  FROM sala_prova s
  WHERE s.sala_fk_unidade = p_unidade_id;

  RETURN v_prova_unidade_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.desvincular_unidade_da_prova(
  p_prova_unidade_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prova_id uuid;
  v_unidade_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem desvincular unidades de uma prova.';
  END IF;

  SELECT prova_id, unidade_id INTO v_prova_id, v_unidade_id
  FROM prova_unidades WHERE id = p_prova_unidade_id;

  IF v_prova_id IS NULL THEN
    RAISE EXCEPTION 'Vínculo de unidade não encontrado.';
  END IF;

  DELETE FROM salas_prova_distribuidas
  WHERE prova_id = v_prova_id AND sala_fk_unidade = v_unidade_id;

  DELETE FROM prova_unidades WHERE id = p_prova_unidade_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.vincular_unidade_a_prova(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.desvincular_unidade_da_prova(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vincular_unidade_a_prova(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desvincular_unidade_da_prova(uuid) TO authenticated;
