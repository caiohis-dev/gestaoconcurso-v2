-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 10 — conteúdo programático (o Anexo de ementas)
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-17 (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-conteudo-programatico.yaml
--
-- ⚠️ E O ANEXO NÃO TEM O MESMO NÚMERO NOS TRÊS: é o Anexo I no 002 e no 003, e o
-- Anexo II no 004 — que inverte, porque lá o Anexo I são as áreas de abrangência.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🎯 O DEFEITO REAL QUE ESTA FATIA DETECTA, e ele está publicado
-- ─────────────────────────────────────────────────────────────────────────────
-- No Edital 003/2026:
--
--     corpo (itens 11.2, 11.3 e 13.5.1) .... "Legislação do SUS"        3 ocorrências
--     Anexo I .............................. "LESGISLAÇÃO DO SUS"       2 ocorrências
--
-- A prova cobra uma disciplina e o anexo descreve outra, de nome diferente. E o erro
-- aparece DUAS vezes no anexo porque o bloco foi copiado de um cargo para o outro — o
-- mesmo mecanismo do COREN na fatia 8, agora num nome de disciplina.
--
-- 🔴 É POR ISSO que a regra central desta fatia é o CRUZAMENTO com `provas_disciplinas`:
-- disciplina na matriz sem ementa no anexo, e ementa no anexo sem disciplina na matriz.
-- Ver `src/lib/edital-conteudo.ts`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE `nome_disciplina` É TEXTO, e não FK
-- ─────────────────────────────────────────────────────────────────────────────
-- O roadmap pedia que a ementa "REFERENCIE a disciplina, não a renomeie". Uma FK para
-- `provas_disciplinas` não serve, e a razão é do dado:
--   · `provas_disciplinas` pende de `edital_cargo_id` — cada cargo tem a SUA linha de
--     "Língua Portuguesa". Uma FK obrigaria toda ementa a pertencer a um cargo;
--   · e a ementa comum NÃO pertence a um cargo: o Edital 002 escreve, no título,
--     "LÍNGUA PORTUGUESA (COMUM A TODOS OS CARGOS)".
-- Criar um catálogo de disciplinas por edital resolveria — ao custo de migrar a fatia 5,
-- que já está entregue. É o mesmo cálculo do R1 da fatia 9, e a mesma conclusão:
-- ➜ texto, com o LINTER cruzando os nomes. É ele que acha o "LESGISLAÇÃO".

CREATE TABLE IF NOT EXISTS public.conteudo_programatico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  -- Mesmo par da fatia 8, e pela mesma razão: sem `aplica_a_todos_os_cargos`, o nulo de
  -- "vale para todos" seria indistinguível do nulo de "esqueci de escolher", e o linter
  -- não conseguiria acusar ementa órfã. A armadilha estava escrita no roadmap.
  cargo_id UUID REFERENCES public.cargos(id) ON DELETE RESTRICT,
  aplica_a_todos_os_cargos BOOLEAN NOT NULL DEFAULT false,
  nome_disciplina TEXT NOT NULL,
  -- 🔵 A ementa é TEXTO CORRIDO, em parágrafos — medido nos três. NÃO é lista numerada,
  -- então não usa o mecanismo de itens da fatia 1 e não inventa uma segunda sintaxe de
  -- lista. Era a pergunta aberta `o_que_a_fatia_1_ja_resolveu` do roadmap.
  texto_ementa TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_conteudo_disciplina CHECK (btrim(nome_disciplina) <> ''),
  CONSTRAINT chk_conteudo_ementa CHECK (btrim(texto_ementa) <> ''),
  CONSTRAINT chk_conteudo_ordem CHECK (ordem >= 0),
  CONSTRAINT chk_conteudo_escopo CHECK ((cargo_id IS NULL) = aplica_a_todos_os_cargos)
);

-- 🔴 DOIS índices únicos parciais, não um só. Em Postgres nulos são DISTINTOS entre si,
-- então um `UNIQUE (edital_id, cargo_id, nome)` deixaria passar duas ementas de "Língua
-- Portuguesa" marcadas como "comum a todos" — que é justamente o caso mais provável de
-- digitação duplicada. É o mesmo padrão do índice de âncora da migration 20260916225307.
CREATE UNIQUE INDEX IF NOT EXISTS conteudo_programatico_comum_key
  ON public.conteudo_programatico (edital_id, lower(btrim(nome_disciplina)))
  WHERE cargo_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conteudo_programatico_por_cargo_key
  ON public.conteudo_programatico (edital_id, cargo_id, lower(btrim(nome_disciplina)))
  WHERE cargo_id IS NOT NULL;

-- ⚠️ Normaliza caixa e espaço, NÃO acento — mesmo limite conhecido de
-- `provas_disciplinas_cargo_nome_key` e de `cargos_nome_chave_key`. Aqui ele é ainda
-- menos grave: quem confere a grafia contra a matriz é o linter, e ele compara sem acento.

CREATE INDEX IF NOT EXISTS idx_conteudo_edital ON public.conteudo_programatico (edital_id, ordem);

-- ⚠️ O R2 DO ROADMAP NÃO SE CONFIRMOU. Ele mandava "conferir o teto de 1.000 linhas do
-- PostgREST na listagem, como na fatia 7". Medido: as ementas são POUCAS e LONGAS, não
-- muitas e curtas — o Anexo I do Edital 002 tem ~11 ementas em 190 linhas de documento, e
-- o do 003 tem 6. Duas ordens de grandeza abaixo do teto. Não há `buscar-em-fatias` aqui,
-- e acrescentá-lo seria cerimônia sobre um risco que a medição não sustenta.

-- ── RLS e grants: o padrão do módulo ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conteudo_programatico'] LOOP
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

COMMENT ON TABLE public.conteudo_programatico IS
  'v3 fatia 10 - as ementas do Anexo. nome_disciplina e TEXTO e nao FK: a ementa comum nao pertence a cargo nenhum, e provas_disciplinas pende de edital_cargo_id. Quem cruza os nomes e o linter - foi ele que achou o LESGISLACAO DO SUS do Edital 003.';
COMMENT ON COLUMN public.conteudo_programatico.texto_ementa IS
  'Texto corrido em paragrafos, medido nos tres editais. NAO e lista numerada: nao usa o mecanismo de itens da fatia 1 nem inventa uma segunda sintaxe de lista.';
