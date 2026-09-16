-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 1 — o edital vira DOCUMENTO: metadados e capítulos
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-16, à tarde (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-espinha-do-documento.yaml
-- Índice e decisões transversais: my_rules/modulo_editais/00-Plano-v3.md
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE MUDA DE CONCEITO
-- ─────────────────────────────────────────────────────────────────────────────
-- Até aqui o edital era um RÓTULO: `nome` mais duas linhas de cabeçalho que a prova
-- herda ao nascer. A partir desta migration ele é o DOCUMENTO NORMATIVO do certame,
-- montado por capítulos.
--
-- 🔴 O QUE NÃO MUDA, e não pode mudar: a herança edital → prova continua sendo só de
-- UI. Nenhum trigger, view ou default propaga valor do edital para a prova; o vínculo
-- segue imutável (`check_prova_edital_imutavel`, PE001); e PDF de prova já emitida não
-- muda retroativamente. Ver estrutura/modulos/editais/00-modulo.md.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE `numero` NÃO É COLUNA
-- ─────────────────────────────────────────────────────────────────────────────
-- Capítulo condicional que não entra NÃO OCUPA NÚMERO, e todos abaixo sobem. Medido
-- nos três editais reais da FEVRE em 2026-09-16, contra o catálogo de 17 capítulos
-- numerados:
--
--   Edital 002 → 16 capítulos (sem territorialidade)          PCD cai em 7
--   Edital 003 → 15 capítulos (sem territorialidade nem títulos) PCD cai em 7
--   Edital 004 → 16 capítulos (COM territorialidade, sem títulos) PCD cai em 8
--
-- O mesmo capítulo em três posições diferentes. Persistir o número seria congelar uma
-- das três — e é exatamente o defeito que já está publicado no Edital 002, que carrega
-- uma linha solta "10. e seus subitens" dentro do capítulo 7: referência cruzada que
-- envelheceu quando a numeração mudou.
--
-- O número é CALCULADO na renderização, a partir dos capítulos incluídos
-- (`src/lib/edital-numeracao.ts`). Referência cruzada aponta para a `chave`, nunca
-- para o número.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE NÃO HÁ RPC DE CRIAÇÃO, E POR QUE A LINHA É OPCIONAL
-- ─────────────────────────────────────────────────────────────────────────────
-- O roadmap previa uma RPC `criar_edital_com_capitulos` que semeasse os 19 capítulos
-- numa transação. Ela foi DESCARTADA na implementação, e o motivo vale registro:
--
-- O catálogo dos capítulos vive em CÓDIGO (`src/lib/edital-capitulos.ts`), versionado
-- e testável. Se a RPC também conhecesse a lista, o catálogo existiria em DOIS lugares
-- — e divergiriam no dia em que um capítulo novo entrasse.
--
-- A saída: a linha em `edital_capitulos` é um OVERRIDE, não um registro obrigatório.
-- Capítulo sem linha vale pelo padrão do catálogo. A linha só nasce quando alguém
-- desliga o capítulo, reordena ou escreve texto — um UPSERT, operação de um passo só.
-- Some a semeadura, some a transação de vários passos, e some o estado pela metade.
--
-- 🔵 Efeito colateral bom: os 3 editais que já existem em produção passam a ter
-- estrutura de documento sem backfill nenhum. E capítulo novo no catálogo vale para
-- todos os editais existentes, também sem migration de dados.

-- ── 1. `editais` ganha os metadados do certame ───────────────────────────────
--
-- ⚠️ TODAS ANULÁVEIS. Produção tem 3 editais sem nenhum desses dados, e o seed carrega
-- DEPOIS das migrations — um NOT NULL aqui quebraria o `db reset`. É a mesma armadilha
-- que deixou `provas.edital_id` nullable.
ALTER TABLE public.editais
  ADD COLUMN IF NOT EXISTS numero_edital       TEXT,
  ADD COLUMN IF NOT EXISTS ano                 INTEGER,
  ADD COLUMN IF NOT EXISTS natureza_juridica   TEXT,
  ADD COLUMN IF NOT EXISTS orgao_demandante    TEXT,
  ADD COLUMN IF NOT EXISTS entidade_executora  TEXT,
  ADD COLUMN IF NOT EXISTS decreto_autorizador TEXT,
  ADD COLUMN IF NOT EXISTS regime_trabalho     TEXT,
  ADD COLUMN IF NOT EXISTS prazo_validade_anos INTEGER,
  ADD COLUMN IF NOT EXISTS prorrogavel         BOOLEAN;

-- ⚠️ `numero_edital` é TEXT SEM CHECK de formato, de propósito. Este repo removeu 4
-- CHECKs de formato em 2026-08-01 ("dado inválido entra cru; valide na LEITURA"), e
-- "002/2026" tem variação real no mundo ("002/2026-SMA" aparece no próprio Edital 002).
-- O formato é validado na tela e apontado pelo linter, não barrado pelo banco.

-- Domínio fechado é outra coisa — segue o precedente de `colaboradores.tipo_chave_pix`.
ALTER TABLE public.editais
  DROP CONSTRAINT IF EXISTS chk_edital_natureza_juridica;
ALTER TABLE public.editais
  ADD CONSTRAINT chk_edital_natureza_juridica
  CHECK (natureza_juridica IS NULL
         OR natureza_juridica IN ('CONCURSO_PUBLICO', 'PROCESSO_SELETIVO'));

ALTER TABLE public.editais
  DROP CONSTRAINT IF EXISTS chk_edital_prazo_validade_positivo;
ALTER TABLE public.editais
  ADD CONSTRAINT chk_edital_prazo_validade_positivo
  CHECK (prazo_validade_anos IS NULL OR prazo_validade_anos > 0);

-- ── 2. `edital_capitulos` — o override por capítulo ──────────────────────────
CREATE TABLE IF NOT EXISTS public.edital_capitulos (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id  UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  chave      TEXT NOT NULL,
  -- Posição no documento. Nasce do catálogo; fica aqui para que reordenar seja possível
  -- sem migration. ⚠️ A UI da fatia 1 NÃO oferece reordenar — os três editais reais
  -- seguem a mesma ordem, e reordenar capítulo de edital contraria a convenção jurídica.
  ordem      INTEGER NOT NULL,
  incluido   BOOLEAN NOT NULL,
  -- Texto do capítulo. Nesta fatia é redação livre; as fatias seguintes trocam capítulo
  -- a capítulo por parâmetros estruturados que GERAM o texto.
  texto      TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT edital_capitulos_edital_chave_key UNIQUE (edital_id, chave),
  CONSTRAINT chk_edital_capitulo_chave_preenchida CHECK (btrim(chave) <> ''),
  CONSTRAINT chk_edital_capitulo_ordem_positiva CHECK (ordem >= 0)
);

-- 🔴 FK RESTRICT, não CASCADE (CLAUDE.md §2). O capítulo carrega TEXTO REDIGIDO — é
-- conteúdo com valor próprio, não anotação descartável. Apagar um edital levando junto
-- o documento inteiro em silêncio é o oposto do que este módulo existe para garantir.
-- `editais` já tem dois dependentes RESTRICT (provas e candidatos); este é o terceiro.

CREATE INDEX IF NOT EXISTS idx_edital_capitulos_edital
  ON public.edital_capitulos (edital_id);

DROP TRIGGER IF EXISTS update_edital_capitulos_updated_at ON public.edital_capitulos;
CREATE TRIGGER update_edital_capitulos_updated_at
  BEFORE UPDATE ON public.edital_capitulos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3. RLS — espelha `editais` exatamente ────────────────────────────────────
ALTER TABLE public.edital_capitulos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view edital_capitulos" ON public.edital_capitulos;
CREATE POLICY "Authenticated users can view edital_capitulos"
  ON public.edital_capitulos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert edital_capitulos" ON public.edital_capitulos;
CREATE POLICY "Admins can insert edital_capitulos"
  ON public.edital_capitulos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update edital_capitulos" ON public.edital_capitulos;
CREATE POLICY "Admins can update edital_capitulos"
  ON public.edital_capitulos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete edital_capitulos" ON public.edital_capitulos;
CREATE POLICY "Admins can delete edital_capitulos"
  ON public.edital_capitulos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ⚠️ A autorização mora no `has_role`, NUNCA em SELECT literal de `user_roles`: a
-- hierarquia superadmin ⇒ admin vive dentro da função, e ignorá-la já quebrou 3 vezes
-- neste repo, a última bloqueando o superadmin.

-- `anon` não recebe nada em tabela nova (default privileges de public, como ficaram em
-- 20260731110000), mas o REVOKE é explícito para não depender de conhecer o default.
REVOKE ALL ON TABLE public.edital_capitulos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.edital_capitulos
  TO authenticated, service_role;
