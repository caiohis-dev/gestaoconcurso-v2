-- Tema "Editais como entidade" (roadmap: my_rules/analises/roadmap-editais.yaml), etapa 1.
-- SCHEMA apenas. O backfill dos dados — criar um edital por prova_edital distinto e
-- ligar as provas existentes — vive em supabase/seed.pos.sql: regra do projeto (migration
-- não alcança dado que entra pelo dump, e o seed.pos roda DEPOIS das migrations no reset).
--
-- Por isso provas.edital_id nasce NULLABLE (D5): um NOT NULL seria validado no momento da
-- migration, antes do backfill do seed, e quebraria o `db reset`. A obrigatoriedade é
-- garantida no app (o form de Prova exige escolher um edital). A FK + ON DELETE RESTRICT
-- (D6) dão a integridade referencial de verdade.

-- ── Tabela editais ───────────────────────────────────────────────────────────────────
CREATE TABLE public.editais (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  n_candidatos      integer,
  cabecalho_linha1  text DEFAULT 'FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA',
  cabecalho_linha2  text DEFAULT 'Coordenação de Concursos e Processos Seletivos',
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id)
);

-- Nome único por caixa/espaço (D7): mesmo padrão funcional do colab_email. Aposenta o
-- antigo CHAR(30) de prova_edital, cujo padding era a origem dos .trim() no front.
CREATE UNIQUE INDEX editais_nome_key ON public.editais (lower(btrim(nome)));

-- A tabela herda os GRANTs de ALTER DEFAULT PRIVILEGES (migration 20260712010000):
-- criada por `postgres`, nasce com GRANT para anon/authenticated/service_role, o que só
-- permite o PostgREST CHEGAR a avaliar a RLS abaixo. Quem barra é a RLS.
ALTER TABLE public.editais ENABLE ROW LEVEL SECURITY;

-- Espelha exatamente a política de `provas`: todos os autenticados leem; só admin escreve.
CREATE POLICY "Authenticated users can view editais"
  ON public.editais FOR SELECT USING (true);

CREATE POLICY "Admins can insert editais"
  ON public.editais FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update editais"
  ON public.editais FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete editais"
  ON public.editais FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_editais_updated_at
  BEFORE UPDATE ON public.editais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── FK na prova ──────────────────────────────────────────────────────────────────────
-- NULLABLE de propósito (ver cabeçalho). ON DELETE RESTRICT: não se apaga um edital que
-- ainda tem provas.
ALTER TABLE public.provas
  ADD COLUMN edital_id uuid REFERENCES public.editais(id) ON DELETE RESTRICT;

-- prova_edital (CHAR(30)) PERMANECE por ora: o backfill do seed.pos lê dela para criar os
-- editais e preencher edital_id. Só será dropada num passo posterior, depois de o backfill
-- ter rodado (ver o risco de ordem no roadmap).
