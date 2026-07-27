-- Fecha as três últimas tabelas operacionais com `SELECT ... USING (true)`.
--
-- Continuação da migration 20260726260000, que fechou `meta_colaboradores_unidade`.
-- Estas três deixavam QUALQUER autenticado ler tudo — inclusive o colaborador, que é a
-- pessoa que trabalha na prova e tem conta no sistema. Nenhuma tela de colaborador lê
-- estas tabelas: as dele passam por RPCs `SECURITY DEFINER` (`get_meu_colaborador` etc.),
-- que ignoram RLS. Ou seja, o `USING (true)` não servia a ninguém — era só exposição.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O NÍVEL DE RECORTE: por PROVA aqui, e não por unidade. Diferente das metas.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- As metas (20260726260000) foram recortadas por UNIDADE porque nenhum leitor precisa
-- das metas de outra unidade. Aqui não é assim, e forçar o mesmo nível quebraria tela:
--
--   • `OcorrenciasProva` é acessível a coordenador e consulta `colaboradores_prova`
--     filtrando por `prova_unidades.prova_id` — a prova INTEIRA, para montar a lista de
--     quem pode receber ocorrência e de quem pode substituir.
--   • A RLS de `ocorrencias_colaborador` já é por prova (`is_coordenador_prova`). Recortar
--     `colaboradores_prova` por unidade criaria um DESENCONTRO: o coordenador enxergaria
--     a ocorrência de outra unidade e não a alocação por trás dela — que é a receita do
--     "some o nome na tela" que este repo já viu.
--
-- Então o critério aqui é `is_coordenador_prova(auth.uid(), <prova>)`, o MESMO das
-- ocorrências. Fica coerente com o que já existe, e ainda assim fecha o buraco: quem não
-- é admin nem coordenador daquela prova não lê nada.
--
-- Apertar depois para unidade é possível, mas exige antes decidir se o coordenador deve
-- registrar ocorrência de outra unidade da prova dele. É decisão de operação, não de
-- schema — registrada no doc de invariantes.
--
-- As policies de ESCRITA não mudam em nenhuma das três (admin, e coordenador também em
-- `colaboradores_prova`, que é o que permite a substituição pela tela de ocorrências).
--
-- `has_role(auth.uid(),'admin')` cobre superadmin: a hierarquia mora dentro da função
-- (20260725195530). Nunca SELECT literal em `user_roles` numa policy.

-- ── 1. valores_funcao_prova — são VALORES DE PAGAMENTO ───────────────────────
DROP POLICY IF EXISTS "Authenticated users can view valores_funcao_prova"
  ON public.valores_funcao_prova;

CREATE POLICY "Admins e coordenadores da prova veem os valores"
  ON public.valores_funcao_prova
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin')
    OR is_coordenador_prova(auth.uid(), prova_id)
  );

-- ── 2. colaboradores_prova — a alocação real ─────────────────────────────────
-- A tabela não tem `prova_id`: chega-se a ele por `prova_unidades`. O EXISTS é a forma
-- que não multiplica linhas, ao contrário de um JOIN dentro da policy.
DROP POLICY IF EXISTS "Authenticated users can view colaboradores_prova"
  ON public.colaboradores_prova;

CREATE POLICY "Admins e coordenadores da prova veem as alocacoes"
  ON public.colaboradores_prova
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM prova_unidades pu
      WHERE pu.id = colaboradores_prova.prova_unidade_id
        AND is_coordenador_prova(auth.uid(), pu.prova_id)
    )
  );

-- ── 3. salas_prova_distribuidas — distribuição de salas e fiscais ────────────
DROP POLICY IF EXISTS "Authenticated users can view salas_prova_distribuidas"
  ON public.salas_prova_distribuidas;

CREATE POLICY "Admins e coordenadores da prova veem as salas distribuidas"
  ON public.salas_prova_distribuidas
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin')
    OR is_coordenador_prova(auth.uid(), prova_id)
  );
