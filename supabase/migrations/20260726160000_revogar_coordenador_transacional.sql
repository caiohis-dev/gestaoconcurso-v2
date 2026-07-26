-- Revogação de coordenador em UMA transação.
--
-- O DEFEITO QUE ISTO FECHA
-- `useUsers.updateRole` (action 'remove') fazia dois DELETEs soltos, nesta ordem:
--   1. `user_roles`         — tira o papel
--   2. `coordenadores_prova` — tira os vínculos com as provas
--
-- Falhar no passo 2 deixava o pior estado possível: o papel some da tela e **o acesso
-- real continua**. Não é cosmético, porque `is_coordenador_prova(uid, prova_id)` —
-- usada na policy de `ocorrencias_colaborador` e nas RPCs `finalizar_prova_unidade` e
-- `encerrar_ocorrencias_unidade` — consulta **apenas `coordenadores_prova`** e NUNCA
-- olha `user_roles`. A pessoa sumia da lista de coordenadores e seguia entrando nas
-- provas dela. O toast de erro aparecia, mas descrevia o contrário do que acontecera.
--
-- Achado ao escrever teste do `useUsers` em 2026-07-25; o teste marcava `⚠️ ATENÇÃO` e,
-- por engano, não abriu item no backlog — corrigido junto com esta migration.
--
-- POR QUE RPC, E NÃO "arrumar a ordem"
-- Inverter os DELETEs só troca qual metade sobra: falhar no 2º passo deixaria o vínculo
-- apagado e o papel de pé — melhor que o inverso, mas ainda inconsistente. O corpo de
-- uma função roda **dentro de uma única transação**, então uma falha em qualquer DELETE
-- desfaz o outro. É a saída que este repo já tinha identificado para as operações de
-- vários passos.
--
-- AUTORIZAÇÃO — a superfície NÃO muda
-- Como é SECURITY DEFINER (necessário para a atomicidade não depender de duas policies),
-- a checagem tem de ser explícita. Exige `admin` via `has_role`, que é exatamente o que
-- as policies substituídas exigiam ("Admins can manage roles" e "Admins can delete
-- coordenadores_prova"). E é `has_role`, não SELECT em `user_roles`: a hierarquia
-- (superadmin ⇒ admin) mora lá dentro — a mesma regra que já falhou três vezes aqui.

CREATE OR REPLACE FUNCTION public.revogar_coordenador(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem revogar acesso de coordenador'
      USING ERRCODE = '42501';
  END IF;

  -- O acesso real sai primeiro. Dentro da transação a ordem não muda o resultado, mas
  -- deixa a intenção explícita: o que controla acesso é `coordenadores_prova`.
  DELETE FROM public.coordenadores_prova WHERE user_id = p_user_id;

  DELETE FROM public.user_roles
   WHERE user_id = p_user_id
     AND role = 'coordenador'::app_role;
END;
$$;

-- Fecha para `anon`: revogar papel é operação de gestão, exige sessão.
REVOKE ALL ON FUNCTION public.revogar_coordenador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revogar_coordenador(uuid) TO authenticated;
