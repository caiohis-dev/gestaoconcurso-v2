-- As metas eram legíveis por QUALQUER autenticado.
--
-- A policy de SELECT de `meta_colaboradores_unidade` era `USING (true)`. O recorte por
-- unidade existia só na UI: `GerenciarProva` filtra por `filteredProvaUnidades` ("Sua
-- Unidade de Prova") e `Provas` passa `allowedProvaUnidadeIds` ao `ProvaCard`. Nenhum
-- dos dois é barreira — bastava chamar o PostgREST direto para ler as 186 metas de todas
-- as unidades de todas as provas.
--
-- Quem tem conta neste sistema inclui COLABORADOR (a pessoa que trabalha na prova), que
-- não tem nada a ver com planejamento de headcount. `USING (true)` dava a ela o mesmo
-- acesso de leitura que um admin.
--
-- A policy nova espelha exatamente o que a UI já pratica:
--   • admin  -> tudo (e superadmin junto: a hierarquia mora dentro do `has_role`, ver
--               migration 20260725195530 — NUNCA usar SELECT literal em user_roles aqui)
--   • coordenador -> só as unidades em que ele próprio está alocado, via a função
--                    `get_coordenador_prova_unidade_ids`, que já existia e é usada pelo
--                    front pelo mesmo critério
--   • qualquer outro -> nada
--
-- ⚠️ NÍVEL DE RECORTE: por UNIDADE, não por prova. É deliberado e segue a UI — o
-- coordenador coordena uma unidade específica dentro da prova. Note que
-- `ocorrencias_colaborador` usa recorte por PROVA (`is_coordenador_prova`): a diferença é
-- real e não é descuido, mas quem for uniformizar precisa decidir qual é o correto para
-- cada tabela, não copiar um para o outro.
--
-- As policies de escrita NÃO mudam: continuam admin-only. Coordenador lê a meta da sua
-- unidade e não a edita.

DROP POLICY IF EXISTS "Authenticated users can view meta_colaboradores_unidade"
  ON public.meta_colaboradores_unidade;

CREATE POLICY "Admins e coordenadores da unidade veem as metas"
  ON public.meta_colaboradores_unidade
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin')
    OR prova_unidade_id IN (
      SELECT get_coordenador_prova_unidade_ids(auth.uid())
    )
  );
