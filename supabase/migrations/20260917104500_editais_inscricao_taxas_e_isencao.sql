-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 9 — inscrição, taxas, isenção e canais
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-17 (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-inscricao-taxas-isencao.yaml
-- Capítulos [6] (inscrição e pagamento) e [7] (isenção da taxa).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 R2 RESPONDIDO: A TAXA É POR CARGO, e vira COLUNA, não tabela
-- ─────────────────────────────────────────────────────────────────────────────
-- O roadmap perguntava se o recorte da taxa é por nível de escolaridade ou por cargo, e
-- avisava que errar isso remodela o capítulo inteiro. Medido, os 6 valores publicados:
--
--   002  Docente I ................. R$ 100,00     003  Enfermeiro ............ R$ 100,00
--   002  Docente II ...............  R$  80,00     003  Téc. em Enfermagem ...  R$  80,00
--   004  Agente Comunitário .......  R$  80,00     004  Agente de Endemias ...  R$  80,00
--
-- Os três editais publicam POR CARGO, numa lista nominal ("A) Docente I – R$ 100,00").
--
-- ⚠️ E existe uma correlação perfeita com a escolaridade: R$ 100 para superior, R$ 80 para
-- médio/técnico — inclusive no caso que quase a derruba, o Docente II, cuja habilitação
-- mínima é "Curso Normal de Nível MÉDIO". Mesmo assim o recorte NÃO é por escolaridade:
--   · o documento publica por cargo, nas 6 linhas;
--   · são 6 pontos com 2 valores distintos — correlação, não regra declarada;
--   · modelar por escolaridade obrigaria o edital a obedecer a uma regra que ele nunca
--     escreveu, e quebraria no dia em que dois cargos de nível superior tiverem taxas
--     diferentes.
-- ➜ A correlação vira SUGESTÃO e AVISO em `src/lib/edital-inscricao.ts`, no mesmo desenho
--   de `sugerirCotas`: o sistema propõe, o usuário decide, e o linter acusa divergência
--   entre cargos de mesma escolaridade.
--
-- 🔵 E é COLUNA em `edital_cargos`, não tabela nova: a relação é 1:1 com o cargo do
-- edital, e `edital_cargos` já carrega `vencimento_base` e as vagas. Uma tabela
-- `taxas_inscricao` com duas colunas seria uma junção a mais para sempre.
ALTER TABLE public.edital_cargos
  ADD COLUMN IF NOT EXISTS taxa_inscricao NUMERIC(10,2);

-- ⚠️ `numeric`, nunca `float` — é dinheiro. O `float` não representa 0,10 exatamente, e
-- somar centavos errado num boleto é o tipo de defeito que só aparece no extrato.
ALTER TABLE public.edital_cargos
  DROP CONSTRAINT IF EXISTS chk_edital_cargo_taxa;
ALTER TABLE public.edital_cargos
  ADD CONSTRAINT chk_edital_cargo_taxa
  CHECK (taxa_inscricao IS NULL OR taxa_inscricao >= 0);
-- 🔵 `>= 0` e não `> 0`: taxa zero é concurso sem taxa, que é decisão legítima. Quem
-- acusa taxa não declarada é o linter, porque nulo aqui é "ainda não preenchido".

COMMENT ON COLUMN public.edital_cargos.taxa_inscricao IS
  'v3 fatia 9 - o valor do boleto, POR CARGO. Medido nos tres editais: eles publicam uma lista nominal por cargo. A correlacao com escolaridade (100 superior / 80 medio) e sugestao do sistema, nao regra do documento.';

-- ─────────────────────────────────────────────────────────────────────────────
-- A ISENÇÃO — três critérios, e os TRÊS EDITAIS OS ESCREVEM IGUAIS
-- ─────────────────────────────────────────────────────────────────────────────
-- Medido, palavra por palavra nos três:
--
--   A) CadÚnico + família de baixa renda (Lei 8.112/90 art. 11, Dec. 6.593/2008,
--      Dec. 11.016/2022)
--   B) Doador regular de sangue OU cadastrado no REDOME (Lei Municipal 5.989/2022)
--   C) Prestou serviço eleitoral (Lei Municipal 6.359/2024)
--
-- 🔴 O ESBOÇO PROPUNHA QUATRO CRITÉRIOS, separando DOADOR_SANGUE de DOADOR_MEDULA_REDOME.
-- São TRÊS: o item B junta as duas situações sob UMA lei municipal e UM requerimento — o
-- 003 chega a dizer "de acordo com sua opção (REDOME ou Doador de Sangue)". Separá-los
-- criaria dois critérios com a mesma `lei_referencia`, e o edital publicaria uma alínea
-- que ele não tem.
CREATE TABLE IF NOT EXISTS public.regras_isencao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  tipo_criterio TEXT NOT NULL,
  lei_referencia TEXT,
  -- ⚠️ Parâmetros do critério B, nulos nos outros dois. Medidos:
  --   · 3 doações em 12 meses — IGUAL nos três editais;
  --   · "carteira emitida no ano vigente" — só no 003 e no 004; o 002 NÃO exige.
  --     É o parâmetro que de fato VARIA, e por isso é coluna e não constante.
  minimo_doacoes_sangue_12m INTEGER,
  redome_exige_ano_vigente BOOLEAN,
  observacao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_isencao_tipo CHECK (tipo_criterio IN (
    'CADUNICO','DOADOR_SANGUE_OU_MEDULA','SERVICO_ELEITORAL')),
  CONSTRAINT chk_isencao_doacoes CHECK (
    minimo_doacoes_sangue_12m IS NULL OR minimo_doacoes_sangue_12m > 0),
  CONSTRAINT chk_isencao_ordem CHECK (ordem >= 0),
  -- O mesmo critério duas vezes no mesmo edital sairia como duas alíneas idênticas.
  CONSTRAINT regras_isencao_edital_tipo_key UNIQUE (edital_id, tipo_criterio)
);

-- 🔴 O QUE NÃO VIROU COLUNA, e a razão é a mesma das fatias 6, 7 e 8:
-- `meses_atualizacao_cadunico` (o esboço dizia "CadÚnico atualizado nos últimos 24 meses").
-- MEDIDO: "24 meses" tem ZERO ocorrências nos três editais, e não há nenhuma exigência de
-- prazo de atualização do CadÚnico em nenhum deles. A premissa do roadmap era falsa — é a
-- quarta coluna proposta que a medição derruba nesta v3.

-- ─────────────────────────────────────────────────────────────────────────────
-- OS PARÂMETROS DE INSCRIÇÃO QUE SÃO DO EDITAL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inscricao_config (
  edital_id UUID NOT NULL PRIMARY KEY REFERENCES public.editais(id) ON DELETE RESTRICT,
  -- 🔴 PARÂMETRO REAL, e ele DIVERGE entre os editais: o 003 (item 6.10) e o 004 exigem
  -- "procedimentos independentes para cada pedido, com envelopes distintos"; o 002 NÃO
  -- tem a cláusula. Ver o desvio no roadmap: o esboço chamava isso de "um envelope por
  -- cargo", e os três dizem "um envelope por CANDIDATO" — são regras diferentes, e a que
  -- varia é esta.
  documentacao_isencao_vale_para_um_cargo BOOLEAN,
  limite_envelopes_por_candidato INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_inscricao_envelopes CHECK (
    limite_envelopes_por_candidato IS NULL OR limite_envelopes_por_candidato > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- OS CANAIS DE ATENDIMENTO — e o R1, que já se materializou
-- ─────────────────────────────────────────────────────────────────────────────
-- Medido nos três: UM endereço presencial (Sede Administrativa da FEVRE, Rua 154 nº 783,
-- Laranjal, das 9h às 16h) e DOIS e-mails (gabinete.fevre@smevr.com.br e
-- visto_fr@fevre.com.br). O endereço se repete QUATRO vezes só no Edital 002 — entrega de
-- isenção, de laudo PCD, de autodeclaração e de títulos. É duplicação real no documento
-- publicado, e cada repetição é uma chance de divergir. É isso que paga esta tabela.
--
-- 🔴 O `tipo_canal` é o MEIO, não a finalidade. O esboço propunha
-- `EMAIL_IMPUGNACAO | EMAIL_VISTA_PROVA | POSTO_PRESENCIAL | PORTAL_WEB`, misturando as
-- duas coisas — e o dado mostra por que não dá: o MESMO posto serve a quatro finalidades.
-- A finalidade vai em `rotulo`, texto livre, e um canal pode ser citado por N capítulos.
CREATE TABLE IF NOT EXISTS public.edital_canais_atendimento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  tipo_canal TEXT NOT NULL,
  rotulo TEXT NOT NULL,
  endereco TEXT,
  horario_funcionamento TEXT,
  observacao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_canal_tipo CHECK (tipo_canal IN (
    'PORTAL_WEB','EMAIL','TELEFONE','POSTO_PRESENCIAL')),
  CONSTRAINT chk_canal_rotulo CHECK (btrim(rotulo) <> ''),
  CONSTRAINT chk_canal_ordem CHECK (ordem >= 0)
);

-- ⚠️ SEM CHECK de formato em `endereco`, inclusive para e-mail. É a decisão de 01/08
-- ("dado inválido entra cru; valide na leitura"), que removeu 4 CHECKs de formato deste
-- repo. Quem confere o formato é o linter.
--
-- 🔴 R1 SE MATERIALIZOU, e fica registrado em vez de escondido: o roadmap avisava que, se
-- a fatia 5 viesse antes desta, ela criaria `regras_vista_prova.email_solicitacao` solto —
-- e foi o que aconteceu. A coluna NÃO foi migrada para cá:
--   · ela tem uma CHECK própria (`chk_vista_presencial_tem_email`) que garante e-mail
--     quando o rito é presencial, e movê-la exigiria converter essa CHECK em trigger;
--   · é tabela já entregue, e remodelá-la custa mais do que a duplicação de um campo.
-- ➜ A mitigação é o linter: `edital-inscricao.ts` acusa quando o e-mail da vista de prova
--   não está entre os canais do edital. A duplicação passa a ser VISÍVEL, não silenciosa.

CREATE INDEX IF NOT EXISTS idx_canais_edital ON public.edital_canais_atendimento (edital_id, ordem);
CREATE INDEX IF NOT EXISTS idx_isencao_edital ON public.regras_isencao (edital_id, ordem);

-- ── RLS e grants: o padrão do módulo ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['regras_isencao','inscricao_config','edital_canais_atendimento'] LOOP
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

COMMENT ON TABLE public.regras_isencao IS
  'v3 fatia 9 - os criterios de isencao, um por linha. Sao TRES nos tres editais (CadUnico, doador de sangue OU medula, servico eleitoral) - o esboco propunha quatro, separando sangue de medula, e o documento os junta sob uma lei so.';
COMMENT ON TABLE public.edital_canais_atendimento IS
  'v3 fatia 9 - canal cadastrado uma vez e citado por varios capitulos. O tipo e o MEIO (portal, e-mail, telefone, posto), nunca a finalidade: o mesmo posto da FEVRE serve a quatro finalidades no Edital 002.';
COMMENT ON TABLE public.inscricao_config IS
  'v3 fatia 9 - parametros de inscricao do EDITAL. documentacao_isencao_vale_para_um_cargo diverge de verdade entre os tres: o 003 e o 004 exigem procedimentos independentes por cargo, o 002 nao.';
