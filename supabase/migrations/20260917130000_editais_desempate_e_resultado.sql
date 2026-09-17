-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 11 — critérios de desempate e resultado final
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-17 (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-desempate-e-resultado.yaml
-- Capítulo [15]. Itens 14.1–14.8 (002 e 004) e 13.1–13.8 (003).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AS TRÊS LISTAS REAIS, medidas
-- ─────────────────────────────────────────────────────────────────────────────
--                    002 (Docente I e II)   003 (Enf. e Téc.)     004 (ACS e ACE)
--   1º   Conhecimentos Específicos   Conhecimentos Específicos   Conh. Específicos
--   2º   Conhecimentos Pedagógicos   Legislação do SUS           Língua Portuguesa
--   3º   Língua Portuguesa           Língua Portuguesa           Matemática
--   4º   Prova de Títulos            Maior Idade                 Maior Idade
--   5º   Maior Idade                 —                           —
--
-- E ANTES da lista, os três têm as MESMAS duas preferências legais:
--   · idade igual ou superior a 60 anos (Lei 10.741/2003, art. 27 § único)
--   · exercício da função de jurado (CPP, art. 440)
--
-- E DEPOIS, uma lista separada só para PCD, idêntica nos três (Leis Municipais
-- 3.113/94 e 3.221/95): arrimo de família · mais dependentes até 21 anos · sem
-- nenhuma fonte de renda.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 UMA TABELA, com discriminador — e não duas
-- ─────────────────────────────────────────────────────────────────────────────
-- O esboço propunha `criterios_desempate` e `criterios_desempate_pcd` separadas. São a
-- mesma coisa: uma LISTA ORDENADA de critérios de um edital. Duas tabelas duplicariam
-- RLS, índices, a regra de ordem e a tela — e a única diferença real é QUAIS tipos cada
-- uma admite, que é exatamente o que uma CHECK expressa melhor que um nome de tabela.
--
-- ⚠️ E o item 14.8 do Edital 002 mostra que as duas listas se encadeiam: "esgotados os
-- critérios estabelecidos para as pessoas com deficiência, serão adotados os mesmos
-- critérios para os candidatos à ampla concorrência". São dois trechos de um mesmo
-- procedimento, não dois assuntos.

CREATE TABLE IF NOT EXISTS public.criterios_desempate (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  -- Os três editais publicam UMA lista para todos os cargos ("Candidatos aos cargos de
  -- Docente I e Docente II"). ⚠️ Mas a numeração do próprio documento — 14.5.**1** —
  -- antecipa um 14.5.2, e o padrão de escopo já existe nas fatias 8 e 10. Fica coberto
  -- sem custo: nos três editais reais é uma linha com `cargo_id` nulo.
  cargo_id UUID REFERENCES public.cargos(id) ON DELETE RESTRICT,
  aplica_a_todos_os_cargos BOOLEAN NOT NULL DEFAULT false,
  lista TEXT NOT NULL,
  ordem_prioridade INTEGER NOT NULL,
  criterio_tipo TEXT NOT NULL,
  -- 🔴 O nome da disciplina, como em `conteudo_programatico` e pela mesma razão: uma FK
  -- para `provas_disciplinas` pende de `edital_cargo_id`, e o critério vale para todos os
  -- cargos. Quem cruza os nomes é o linter — ver `src/lib/edital-desempate.ts`.
  disciplina_referencia TEXT,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT chk_desempate_lista CHECK (lista IN ('GERAL','PCD')),
  CONSTRAINT chk_desempate_ordem CHECK (ordem_prioridade >= 1),
  CONSTRAINT chk_desempate_escopo CHECK ((cargo_id IS NULL) = aplica_a_todos_os_cargos),

  -- 🔴 O TIPO TEM DE PERTENCER À LISTA. "Arrimo de família" na lista geral seria a regra
  -- de PCD aplicada a todo mundo — e ninguém notaria, porque as duas saem publicadas em
  -- parágrafos diferentes do mesmo capítulo.
  CONSTRAINT chk_desempate_tipo_da_lista CHECK (
    (lista = 'GERAL' AND criterio_tipo IN (
      'IDADE_60_MAIS','FUNCAO_JURADO','PONTUACAO_DISCIPLINA','MAIOR_PONTOS_TITULOS','MAIOR_IDADE'))
    OR
    (lista = 'PCD' AND criterio_tipo IN (
      'ARRIMO_FAMILIA','MAIS_DEPENDENTES_ATE_21','SEM_FONTE_DE_RENDA'))
  ),

  -- 🔴 A ARMADILHA QUE O ROADMAP APONTOU, e ela vira CHECK e não validação de tela:
  -- critério "maior pontuação em <disciplina>" sem dizer QUAL disciplina é critério
  -- impossível de aplicar — e sairia publicado como um item em branco na ordem.
  -- ⚠️ BICONDICIONAL: disciplina preenchida num critério que não é de disciplina também
  -- é incoerente. Mesmo padrão de `chk_edital_item_quadro` na fatia 1.
  CONSTRAINT chk_desempate_disciplina CHECK (
    (criterio_tipo = 'PONTUACAO_DISCIPLINA') = (disciplina_referencia IS NOT NULL))
);

-- 🔴 DOIS índices parciais, pela mesma razão da fatia 10: em Postgres nulos são
-- DISTINTOS, então um `UNIQUE (edital_id, lista, cargo_id, ordem)` deixaria passar dois
-- critérios na MESMA posição quando ambos valem para todos os cargos — que é o caso dos
-- três editais reais. Um desempate que empata é o defeito que esta tabela não pode ter.
CREATE UNIQUE INDEX IF NOT EXISTS criterios_desempate_geral_ordem_key
  ON public.criterios_desempate (edital_id, lista, ordem_prioridade)
  WHERE cargo_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS criterios_desempate_cargo_ordem_key
  ON public.criterios_desempate (edital_id, lista, cargo_id, ordem_prioridade)
  WHERE cargo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_desempate_edital
  ON public.criterios_desempate (edital_id, lista, ordem_prioridade);

-- ⚠️ O QUE NÃO VIROU COLUNA, e é o R3 do roadmap atendido: a HORA DE NASCIMENTO.
-- Os três editais têm a mesma regra de último recurso — o candidato é convocado a
-- apresentar a certidão, e quem não a apresentar "terá considerada como hora de
-- nascimento, 23 horas 59 minutos e 59 segundos". É regra TEXTUAL:
--   · o dado (a hora de nascimento do candidato) o sistema não tem e não vai ter;
--   · e o parâmetro (as 23:59:59) é IDÊNTICO nos três — uma coluna que ninguém varia é
--     uma coluna em que alguém confia sem motivo.
-- Fica como artigo do capítulo, escrito à mão. Não se modela campo que não se preenche.

-- ── RLS e grants: o padrão do módulo ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['criterios_desempate'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Authenticated users can view %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can insert %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins can insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can update %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins can update %s" ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can delete %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins can delete %s" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))', t, t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', t);
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.criterios_desempate IS
  'v3 fatia 11 - a lista ordenada de desempate. UMA tabela com discriminador lista (GERAL|PCD), nao duas: o item 14.8 do Edital 002 encadeia as duas ("esgotados os criterios para PCD, serao adotados os mesmos para ampla concorrencia"). O sistema DESCREVE o criterio; quem desempata e a correcao, que e outro modulo.';
COMMENT ON COLUMN public.criterios_desempate.disciplina_referencia IS
  'Nome da disciplina, TEXTO e nao FK - provas_disciplinas pende de edital_cargo_id e o criterio vale para todos os cargos. Quem cruza os nomes contra a matriz e o linter.';
