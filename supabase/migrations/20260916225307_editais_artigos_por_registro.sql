-- ============================================================================
-- MÓDULO EDITAIS, v3 — o ARTIGO vira registro próprio
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-16, à noite (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-artigos-por-registro.yaml
-- Índice e decisões transversais: my_rules/modulo_editais/00-Plano-v3.md
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE MUDA: O GRÃO, NÃO A REGRA
-- ─────────────────────────────────────────────────────────────────────────────
-- Até aqui o capítulo era UMA CAIXA DE TEXTO: `edital_capitulos.texto` guardava o
-- capítulo inteiro escrito como lista Markdown, e o parser o quebrava em itens
-- numerados na renderização. A numeração calculada estava certa e NÃO muda.
--
-- O que estava errado era o grão do armazenamento. Como o artigo não era um registro:
--
--   · o banco não podia garantir nada sobre ele — âncora duplicada era regra de linter,
--     e "se a regra é um if no hook, ela ainda não existe" (CLAUDE.md §2);
--   · o linter apontava o CAPÍTULO, não o artigo. No Edital 004/2026 o "dia XX/xx/2026"
--     está nos itens 12.4 e 14.9, e a mensagem dizia só "o capítulo Do Cronograma tem
--     data não preenchida";
--   · reordenar, recuar ou apagar um artigo era edição de texto com indentação sensível;
--   · e nenhum artigo podia ser outra coisa além de prosa.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 POR QUE EXISTE `tipo = 'quadro'` — a medição que decidiu o desenho
-- ─────────────────────────────────────────────────────────────────────────────
-- O usuário levantou que "alguns artigos têm tabela na formatação final". Levantadas
-- TODAS as tabelas dos três editais de referência em 2026-09-16:
--
--   Quadro I (cargos/vagas/habilitação/CH/vencimento)  002,003,004 → edital_cargos
--   Quadro II de provas (composição da prova)          002,004     → provas_disciplinas
--   Quadros III e IV (títulos por cargo)               002         → fatia 6
--   Quadros II e III (vagas ACS/ACE por UBSF)          004         → fatia 7
--   Anexo II (963 linhas de ruas por área)             004         → fatia 7
--   Cronograma                                         os três     → cronograma_etapas
--   Anexo I (conteúdo programático)                    os três     → fatia 10
--
-- NENHUMA tabela de forma livre. E o Edital 002, no item 2.1, mostra a forma:
--
--   "2.1. QUADRO I: DOS CARGOS, N.º DE VAGAS, HABILITAÇÃO, CARGA HORÁRIA E VENCIMENTOS"
--
-- A tabela OCUPA A POSIÇÃO DE UM ARTIGO NUMERADO, e os outros a referenciam por nome
-- ("conforme estabelecido no Quadro II deste Edital", item 10.1 do mesmo edital).
--
-- Decisão: o artigo não CONTÉM tabela — ele APONTA para qual dado estruturado renderiza
-- ali (`quadro_fonte`). Uma grade digitável reintroduziria exatamente a classe de
-- defeito que este módulo existe para matar: a "Certidão Nada Consta do COREN" exigida
-- de Agente Comunitário de Saúde no Edital 004 é copia-e-cola de tabela.
-- Tabela nova = `quadro_fonte` novo + fatia nova, nunca digitação.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CUSTO DE MIGRAÇÃO DE DADO: ZERO (medido em 2026-09-16)
-- ─────────────────────────────────────────────────────────────────────────────
-- Produção está na v2.5.0 e NÃO TEM nenhuma tabela da v3 — as 5 migrations anteriores
-- existem só em `dev`. O banco local tem 1 linha em `edital_capitulos` com 0 textos. E
-- `edital_capitulos` não aparece no dump (`supabase/seed.local.sql`).
--
-- Não há artigo escrito em lugar nenhum para converter, e é por isso que o DROP COLUMN
-- do fim deste arquivo dispensa a cirurgia posicional no dump exigida pelo §3.

-- ── 1. `edital_itens` — um registro por artigo ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.edital_itens (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id      UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,

  -- 🔴 TEXT, e NÃO uma FK composta para `edital_capitulos(edital_id, chave)`.
  -- A linha em `edital_capitulos` é um OVERRIDE OPCIONAL: capítulo sem linha vale pelo
  -- padrão do catálogo em código, e foi essa escolha que dispensou a RPC de semeadura e
  -- o backfill dos 3 editais de produção. Uma FK aqui FORÇARIA a linha a existir e
  -- desfaria isso em silêncio. A `chave` é validada contra o catálogo em código —
  -- exatamente como `edital_capitulos.chave` já é.
  capitulo_chave TEXT NOT NULL,

  -- Posição entre os irmãos do capítulo. Reescrita em bloco pela RPC de reordenação.
  ordem          INTEGER NOT NULL,

  -- 0 = item (7.1) · 1 = subitem (7.1.2) · 2 = alínea (a). Os três níveis medidos nos
  -- editais reais; nenhum deles vai além.
  nivel          SMALLINT NOT NULL DEFAULT 0,

  -- 'item'   → numerado
  -- 'prosa'  → parágrafo sem número (existe nos editais: ver o trecho entre 6.6 e 6.7
  --            do Edital 002, "O envelope deverá ser entregue na Fundação…")
  -- 'quadro' → a tabela gerada a partir de `quadro_fonte`; `texto` vira a legenda
  tipo           TEXT NOT NULL DEFAULT 'item',

  texto          TEXT,
  ancora         TEXT,
  quadro_fonte   TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT chk_edital_item_capitulo_preenchido CHECK (btrim(capitulo_chave) <> ''),
  CONSTRAINT chk_edital_item_ordem CHECK (ordem >= 0),
  CONSTRAINT chk_edital_item_nivel CHECK (nivel BETWEEN 0 AND 2),
  CONSTRAINT chk_edital_item_tipo CHECK (tipo IN ('item', 'prosa', 'quadro')),

  -- Bicondicional de propósito: quadro SEM fonte não renderiza nada, e fonte em artigo
  -- de texto seria dado morto que um dia alguém passa a acreditar.
  CONSTRAINT chk_edital_item_quadro CHECK ((tipo = 'quadro') = (quadro_fonte IS NOT NULL)),

  -- Domínio fechado, como `editais.natureza_juridica` e `colaboradores.tipo_chave_pix`.
  -- ⚠️ 'titulos' e 'vagas_por_area' ainda NÃO têm tabela (fatias 6 e 7): entram aqui
  -- desde já porque o artigo que os referencia pode ser escrito antes, e o linter acusa
  -- o quadro sem dado. Ligar a fatia não exige tocar nesta CHECK.
  CONSTRAINT chk_edital_item_quadro_fonte CHECK (
    quadro_fonte IS NULL
    OR quadro_fonte IN ('cargos', 'disciplinas', 'titulos', 'vagas_por_area', 'cronograma')
  ),

  -- Âncora é identificador, e identificador tem forma. ⚠️ Isto NÃO contraria a decisão
  -- de 01/08 ("dado inválido entra cru; valide na leitura"), que tratava de dado do
  -- mundo — CPF, telefone. A âncora nasce dentro do sistema e é consumida por regex.
  CONSTRAINT chk_edital_item_ancora_formato CHECK (ancora IS NULL OR ancora ~ '^[a-z0-9_]+$')
);

-- 🔴 FK RESTRICT, não CASCADE (CLAUDE.md §2), pela mesma razão de `edital_capitulos`:
-- o artigo é TEXTO REDIGIDO, conteúdo com valor próprio. `editais` passa a ter quatro
-- dependentes RESTRICT (provas, candidatos, edital_capitulos, edital_itens).

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE DELIBERADAMENTE NÃO TEM CONSTRAINT, e por quê
-- ─────────────────────────────────────────────────────────────────────────────
-- · `texto` NÃO-VAZIO. "Adicionar artigo" cria a linha e o campo nasce em branco; uma
--   CHECK obrigaria a UI a inventar um texto-placeholder, que é o inimigo declarado
--   deste módulo ("dia XX/xx/2026"). Artigo vazio é achado do LINTER.
--
-- · UNIQUE em (edital_id, capitulo_chave, ordem). Empate resolve-se por `created_at`,
--   como o catálogo já desempata por posição. A alternativa DEFERRABLE já foi REPROVADA
--   pelo `db reset` neste repo em 03/08 e não se reabre.
--
-- · Nível que "pula" (alínea sem subitem acima). O parser sempre foi tolerante de
--   propósito — "quem redige não deve perder um item por ter dado um espaço a mais" — e
--   o nível errado aparece no preview na hora. Vira AVISO do linter, não recusa.

-- Âncora duplicada deixa de ser DETECTADA e passa a ser IMPOSSÍVEL.
-- ⚠️ Mudança de comportamento: o linter só olhava capítulos INCLUÍDOS; este índice é por
-- edital. Repetir a âncora entre um capítulo ligado e um desligado passa a ser recusado
-- — aceito, porque âncora é identificador e duplicá-la nunca é intenção.
CREATE UNIQUE INDEX IF NOT EXISTS edital_itens_ancora_key
  ON public.edital_itens (edital_id, ancora) WHERE ancora IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_edital_itens_capitulo
  ON public.edital_itens (edital_id, capitulo_chave, ordem);

DROP TRIGGER IF EXISTS update_edital_itens_updated_at ON public.edital_itens;
CREATE TRIGGER update_edital_itens_updated_at
  BEFORE UPDATE ON public.edital_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. RLS — espelha `edital_capitulos` exatamente ───────────────────────────
ALTER TABLE public.edital_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view edital_itens" ON public.edital_itens;
CREATE POLICY "Authenticated users can view edital_itens"
  ON public.edital_itens FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert edital_itens" ON public.edital_itens;
CREATE POLICY "Admins can insert edital_itens"
  ON public.edital_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update edital_itens" ON public.edital_itens;
CREATE POLICY "Admins can update edital_itens"
  ON public.edital_itens FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete edital_itens" ON public.edital_itens;
CREATE POLICY "Admins can delete edital_itens"
  ON public.edital_itens FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ⚠️ A autorização mora no `has_role`, NUNCA em SELECT literal de `user_roles`: a
-- hierarquia superadmin ⇒ admin vive dentro da função, e ignorá-la já quebrou 3 vezes.

REVOKE ALL ON TABLE public.edital_itens FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.edital_itens
  TO authenticated, service_role;

-- ── 3. RPC de reordenação ────────────────────────────────────────────────────
--
-- Mover um artigo reescreve a `ordem` de vários: são vários passos, logo transação
-- (CLAUDE.md §2). Duas atualizações soltas do cliente deixariam, na falha do meio, um
-- capítulo com a ordem pela metade.
--
-- 🔴 SECURITY INVOKER, e é escolha: a autorização já são as policies acima. Um DEFINER
-- aqui criaria uma SEGUNDA cópia da regra de quem pode escrever — o padrão que já
-- quebrou o superadmin três vezes neste repo.
CREATE OR REPLACE FUNCTION public.reordenar_itens_do_capitulo(
  p_edital_id      UUID,
  p_capitulo_chave TEXT,
  p_ids            UUID[]
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_intrusos INTEGER;
  v_faltando INTEGER;
BEGIN
  -- EI001 — id que não pertence a este capítulo deste edital. Sem esta guarda, um id de
  -- outro edital seria silenciosamente renumerado para dentro deste.
  SELECT count(*) INTO v_intrusos
  FROM unnest(p_ids) AS t(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.edital_itens i
    WHERE i.id = t.id
      AND i.edital_id = p_edital_id
      AND i.capitulo_chave = p_capitulo_chave
  );

  IF v_intrusos > 0 THEN
    RAISE EXCEPTION
      'EI001: % artigo(s) da lista de reordenação não pertencem ao capítulo "%" deste edital.',
      v_intrusos, p_capitulo_chave
      USING ERRCODE = 'check_violation';
  END IF;

  -- EI002 — artigo do capítulo ausente da lista. Renumerar só parte deixaria buraco, e
  -- o artigo esquecido reapareceria em posição arbitrária.
  SELECT count(*) INTO v_faltando
  FROM public.edital_itens i
  WHERE i.edital_id = p_edital_id
    AND i.capitulo_chave = p_capitulo_chave
    AND NOT (i.id = ANY(p_ids));

  IF v_faltando > 0 THEN
    RAISE EXCEPTION
      'EI002: a lista de reordenação não inclui % artigo(s) do capítulo "%".',
      v_faltando, p_capitulo_chave
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reescreve contíguo, 0..n-1, na ordem do array.
  UPDATE public.edital_itens i
     SET ordem = nova.pos - 1
    FROM unnest(p_ids) WITH ORDINALITY AS nova(id, pos)
   WHERE i.id = nova.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reordenar_itens_do_capitulo(UUID, TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reordenar_itens_do_capitulo(UUID, TEXT, UUID[])
  TO authenticated, service_role;

-- ── 4. `edital_capitulos.texto` sai ──────────────────────────────────────────
--
-- É o campo que este refactor substitui: o texto do capítulo agora são os registros de
-- `edital_itens`. Mantê-lo deixaria duas fontes para a mesma coisa, e a que nunca é
-- lida é a que um dia volta a ser escrita.
--
-- ⚠️ DROP COLUMN normalmente exige cirurgia posicional no dump (§3) — o dump nomeia as
-- colunas em cada INSERT e carrega DEPOIS das migrations. Aqui não exige, e foi medido:
-- `edital_capitulos` não aparece em `supabase/seed.local.sql` (a tabela não existe em
-- produção, de onde o dump veio). A prova é o `db reset` completo, não este comentário.
ALTER TABLE public.edital_capitulos DROP COLUMN IF EXISTS texto;
