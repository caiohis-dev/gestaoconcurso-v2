-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 3 — o cronograma do certame
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-16, à tarde (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-cronograma-e-prazos.yaml
--
-- 🎯 É AQUI QUE O SEGUNDO DEFEITO DO EDITAL 004 MORRE. Os `"dia XX/xx/2026"` publicados
-- nos itens 12.4 e 14.9 eram datas de cronograma nunca preenchidas. Enquanto a data é
-- texto corrido dentro de um parágrafo, "vazio" não é estado — é só uma string que parece
-- preenchida. Vindo desta tabela, campo vazio VIRA ESTADO DETECTÁVEL, e o linter o acusa
-- antes da publicação.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 TRÊS FORMAS DE DATA, E ISSO FOI MEDIDO
-- ─────────────────────────────────────────────────────────────────────────────
-- O roadmap propunha `data_inicio` + `data_fim`. O cronograma real do Edital 003 tem
-- TRÊS formas, e duas colunas não dão conta:
--
--   Inscrições ........................... 29/06/2026 a 27/07/2026     → INTERVALO
--   Prova Objetiva ....................... 20/09/2026                  → DATA_UNICA
--   Retirada do Atestado Médico .......... 06/07, 09/07, 13/07,
--                                          16/07 ou 20/07/2026         → ALTERNATIVAS
--   Entrega do Atestado na FEVRE ......... 27/07 ou 28/07/2026         → ALTERNATIVAS
--
-- 🔴 Espremer as ALTERNATIVAS num intervalo seria publicar um edital FALSO: o candidato
-- leria que pode ir de 06/07 a 20/07, quando só 5 dias específicos são oferecidos. Não é
-- imprecisão de modelo, é erro de fato no documento.
--
-- Daí `tipo` + `datas date[]`: uma data para DATA_UNICA, duas para INTERVALO, N para
-- ALTERNATIVAS. A CHECK abaixo garante que a cardinalidade combina com o tipo.
--
-- 🔵 Efeito colateral bom: as "datas de perícia disponíveis" que a fatia 4 (PCD) precisa
-- são exatamente uma etapa do tipo ALTERNATIVAS. A fatia 4 reaproveita, não recria.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE NÃO HÁ CALENDÁRIO DE FERIADOS
-- ─────────────────────────────────────────────────────────────────────────────
-- O roadmap marcava como bloqueante: "de onde vem a lista de feriados municipais?",
-- supondo que o sistema teria de CALCULAR "1 dia útil". Medido nos editais: a data é
-- ESCRITA, e "1 dia útil" é texto descritivo ao lado dela —
--
--   Edital 003, item 12.2: "terá 01 (um) dia útil (21/09/2026) para recorrer"
--
-- O sistema CONFERE, não calcula, e nenhuma conferência precisa de feriado: precedência é
-- comparação de datas, e fim de semana sai do dia da semana. Das 16 datas do Edital 003,
-- exatamente UMA cai em fim de semana — 20/09/2026, domingo — e é o dia da prova, que é
-- justamente a exceção da regra.
--
-- ⚠️ Se um dia alguém quiser que o sistema PROPONHA a data, aí o calendário volta a ser
-- necessário. Não é o caso, e construí-lo agora seria inventar trabalho.

CREATE TABLE IF NOT EXISTS public.cronograma_etapas (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id   UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  -- Slug da etapa padrão (`inscricoes`, `prova_objetiva`, …) quando houver; nulo quando
  -- a etapa for própria daquele certame. É por ela que o linter e as outras fatias
  -- referenciam uma etapa sem depender do texto do nome.
  chave       TEXT,
  nome_evento TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'DATA_UNICA',
  -- ⚠️ Pode ser vazio: etapa declarada e ainda sem data é ESTADO VÁLIDO durante a
  -- redação. É o linter que acusa antes de publicar — é esse par (permitir gravar,
  -- recusar publicar) que impede tanto o trabalho travado quanto o `XX/xx` no Diário.
  datas       DATE[] NOT NULL DEFAULT '{}',
  horario_limite TIME,
  permite_prorrogacao BOOLEAN,
  ordem       INTEGER NOT NULL DEFAULT 0,
  observacao  TEXT,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  CONSTRAINT chk_cronograma_nome_preenchido CHECK (btrim(nome_evento) <> ''),
  CONSTRAINT chk_cronograma_ordem_positiva CHECK (ordem >= 0),
  CONSTRAINT chk_cronograma_tipo CHECK (tipo IN ('DATA_UNICA','INTERVALO','ALTERNATIVAS')),
  -- A cardinalidade combina com o tipo. Vazio é sempre permitido (ainda não preenchido).
  -- 🔴 INTERVALO com 3 datas ou DATA_UNICA com 2 é um cronograma que a tela renderizaria
  -- errado sem dar erro — o tipo de incoerência que só aparece no documento publicado.
  CONSTRAINT chk_cronograma_cardinalidade CHECK (
    array_length(datas, 1) IS NULL
    OR (tipo = 'DATA_UNICA'   AND array_length(datas, 1) = 1)
    OR (tipo = 'INTERVALO'    AND array_length(datas, 1) = 2)
    OR (tipo = 'ALTERNATIVAS' AND array_length(datas, 1) >= 1)),
  -- Intervalo que termina antes de começar.
  CONSTRAINT chk_cronograma_intervalo_ordenado CHECK (
    tipo <> 'INTERVALO' OR array_length(datas, 1) IS NULL OR datas[1] <= datas[2])
);

CREATE INDEX IF NOT EXISTS idx_cronograma_etapas_edital ON public.cronograma_etapas (edital_id);

DROP TRIGGER IF EXISTS update_cronograma_etapas_updated_at ON public.cronograma_etapas;
CREATE TRIGGER update_cronograma_etapas_updated_at
  BEFORE UPDATE ON public.cronograma_etapas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: espelha `editais`, como as demais tabelas do módulo ─────────────────
ALTER TABLE public.cronograma_etapas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view cronograma_etapas" ON public.cronograma_etapas;
CREATE POLICY "Authenticated users can view cronograma_etapas"
  ON public.cronograma_etapas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert cronograma_etapas" ON public.cronograma_etapas;
CREATE POLICY "Admins can insert cronograma_etapas"
  ON public.cronograma_etapas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update cronograma_etapas" ON public.cronograma_etapas;
CREATE POLICY "Admins can update cronograma_etapas"
  ON public.cronograma_etapas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete cronograma_etapas" ON public.cronograma_etapas;
CREATE POLICY "Admins can delete cronograma_etapas"
  ON public.cronograma_etapas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON TABLE public.cronograma_etapas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cronograma_etapas
  TO authenticated, service_role;
