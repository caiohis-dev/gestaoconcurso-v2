-- Totais de meta × ocupação de uma prova, agregados NO BANCO.
--
-- ⚠️ O timestamp deste arquivo é UTC: foi criado em 2026-09-10, à noite (horário local).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
-- `/provas` renderiza um card por prova, sem paginação, e cada card fazia TRÊS consultas
-- ao montar (`prova_unidades`, `meta_colaboradores_unidade`, `colaboradores_prova`) para
-- somar tudo no cliente.
--
-- MEDIDO em 2026-09-10 contra o banco local (cópia de produção), na maior das 2 provas —
-- 11 unidades, 531 alocações:
--     prova_unidades .............. 1.772 bytes
--     meta_colaboradores_unidade .. 33.234 bytes
--     colaboradores_prova ......... 87.412 bytes
--     TOTAL ...................... 122.418 bytes, em 3 requisições — POR CARD
--
-- 122 kB para exibir ~20 números. E provas não se apagam (são o histórico operacional),
-- então o custo da listagem cresce sem teto. Esta função devolve o resultado já somado:
-- uma linha por (unidade × função), na casa das dezenas.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SEGURANÇA: `SECURITY INVOKER` (o padrão) — NÃO `DEFINER`
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 Marcar esta função como `SECURITY DEFINER` transformaria um recorte de tela em
-- vazamento: ela lê justamente as tabelas cujo recorte por coordenador mora na RLS.
-- Em INVOKER, a policy continua valendo e o coordenador só soma o que já podia ler.
--
-- 🔴 MAS A RLS NÃO REPRODUZ O RECORTE DA TELA, e é por isso que o parâmetro existe.
--    Medido em 2026-09-10 (`pg_policies` + a bateria, com JWT forjado) — e o resultado
--    NÃO foi o esperado: **as duas policies recortam em granularidades diferentes.**
--
--      · `meta_colaboradores_unidade` → por UNIDADE
--          prova_unidade_id IN (SELECT get_coordenador_prova_unidade_ids(auth.uid()))
--      · `colaboradores_prova`        → por PROVA
--          EXISTS (... is_coordenador_prova(auth.uid(), pu.prova_id))
--      · `prova_unidades`, `unidades_prova`, `funcoes_colaboradores` → `USING (true)`
--
--    Consequência medida, para um coordenador de 1 das 11 unidades da prova: ele alcança
--    as 11 unidades, vê META em 1 — e **OCUPAÇÃO nas 11**. Ou seja, a RLS esconde a meta
--    alheia e **não** esconde a ocupação alheia. Isso não é defeito: é o que a policy de
--    `colaboradores_prova` diz, em letras, desde a `20260726270000`.
--
--    ⚠️ Portanto `p_prova_unidade_ids` NÃO é redundante com a RLS — é ele que mantém o
--    comportamento que a tela já tinha, quando filtrava do lado do cliente. Tirá-lo
--    passaria a mostrar ao coordenador a ocupação de unidades que ele não coordena.
--    🔵 `NULL` = sem recorte, que é o caso do admin. ⚠️ Array VAZIO ≠ NULL: vazio devolve
--       zero linhas (verificado na bateria, bloco 6.2), e confundir os dois faria um
--       coordenador sem unidade ver a prova inteira.

CREATE OR REPLACE FUNCTION public.totais_da_prova(
  p_prova_id uuid,
  p_prova_unidade_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  prova_unidade_id uuid,
  unid_nome text,
  unid_sigla text,
  unidade_finalizada boolean,
  funcao_id uuid,
  funcao_nome text,
  meta integer,
  ocupadas bigint
)
LANGUAGE sql
STABLE
AS $$
  -- ⚠️ TODA referência é qualificada por alias de propósito: em `LANGUAGE sql` com
  -- `RETURNS TABLE`, os nomes das colunas de saída também ficam em escopo, e uma
  -- referência nua a `funcao_id` seria ambígua.
  WITH unidades AS (
    SELECT pu.id                 AS pu_id,
           pu.unidade_finalizada AS pu_finalizada,
           up.unid_nome          AS up_nome,
           up.unid_sigla         AS up_sigla
    FROM public.prova_unidades pu
    JOIN public.unidades_prova up ON up.id = pu.unidade_id
    WHERE pu.prova_id = p_prova_id
      AND (p_prova_unidade_ids IS NULL OR pu.id = ANY (p_prova_unidade_ids))
  )
  SELECT u.pu_id,
         u.up_nome,
         u.up_sigla,
         u.pu_finalizada,
         f.f_id,
         fc.cargo_nome,
         COALESCE(m.quantidade_meta, 0) AS meta,
         COALESCE(o.qtd, 0)             AS ocupadas
  FROM unidades u
  -- As funções que a unidade conhece: as que têm meta E as que têm gente alocada. O
  -- UNION é o que faz a segunda aparecer mesmo sem meta — ver a nota sobre `meta = 0`.
  CROSS JOIN LATERAL (
    SELECT mm.funcao_id AS f_id
    FROM public.meta_colaboradores_unidade mm
    WHERE mm.prova_unidade_id = u.pu_id AND mm.funcao_id IS NOT NULL
    UNION
    SELECT cc.funcao_id
    FROM public.colaboradores_prova cc
    WHERE cc.prova_unidade_id = u.pu_id AND cc.funcao_id IS NOT NULL
  ) f
  JOIN public.funcoes_colaboradores fc ON fc.id = f.f_id
  -- `UNIQUE (prova_unidade_id, funcao_id)` em meta_colaboradores_unidade (medido: zero
  -- duplicata), então este LEFT JOIN não multiplica linha.
  LEFT JOIN public.meta_colaboradores_unidade m
    ON m.prova_unidade_id = u.pu_id AND m.funcao_id = f.f_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS qtd
    FROM public.colaboradores_prova cp
    WHERE cp.prova_unidade_id = u.pu_id AND cp.funcao_id = f.f_id
  ) o ON true
  ORDER BY u.up_nome, fc.cargo_nome;
$$;

-- ⚠️ A função devolve TAMBÉM as linhas com `meta = 0` (função com gente alocada e sem
-- meta cadastrada). A tela de hoje descarta essas linhas (`.filter(f => f.meta > 0)`), e
-- o filtro CONTINUA na UI de propósito: mudar isso aqui alteraria em silêncio o que o
-- usuário vê. O dado fica disponível para quem quiser exibi-lo um dia — hoje, alocação em
-- função sem meta é invisível no card, e isso é comportamento preexistente, não decisão
-- desta migration.

COMMENT ON FUNCTION public.totais_da_prova(uuid, uuid[]) IS
  'Totais de meta x ocupacao de uma prova, uma linha por (unidade, funcao), ja somados '
  'no banco. Usada pelo modal da lanterna em /provas. SECURITY INVOKER de proposito: a '
  'RLS de meta_colaboradores_unidade e colaboradores_prova continua recortando por '
  'coordenador. p_prova_unidade_ids recorta as unidades, porque prova_unidades tem '
  'policy USING (true) e nao recorta sozinha. NULL = sem recorte (admin).';

-- 🔴 Toda função nasce com EXECUTE para PUBLIC (o que inclui `anon`, que tem USAGE no
-- schema public desde 20260712010000). `service_role` PRECISA constar: sem ele, toda
-- leitura pela chave de serviço morre com `42501 permission denied for function`, e a
-- mensagem não diz o que faltou.
REVOKE ALL ON FUNCTION public.totais_da_prova(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totais_da_prova(uuid, uuid[]) TO authenticated, service_role;
