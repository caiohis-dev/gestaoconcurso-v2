-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 4 — ações afirmativas e condições especiais
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-16, à tarde (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-acoes-afirmativas.yaml
-- Capítulos [8] PCD, [9] cotas raciais e [11] condições especiais de prova.
--
-- 🔴 TODO PARÂMETRO AQUI É ORTOGONAL. Os três editais de referência DISCORDAM entre si
-- nos mesmos campos, e é essa discordância que o modelo precisa acomodar sem caso
-- especial no código:
--
--   parâmetro                    | 002              | 003        | 004
--   -----------------------------|------------------|------------|------------------
--   compensação de lactante      | SEM compensação  | até 30 min | até 30 min
--   validade do laudo PCD        | 6 meses          | 6 meses    | INDETERMINADA p/
--                                |                  |            | irreversível/TEA/Down
--
-- Nenhum desses é propriedade da carreira. Um edital de ACS pode adotar a regra do 002.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 A DATA DE CORTE DA LACTANTE NÃO É COLUNA — E ISSO SAIU DE UM DEFEITO REAL
-- ─────────────────────────────────────────────────────────────────────────────
-- O roadmap previa `data_limite_nascimento_lactente` como campo. Ao medir o Edital 003
-- publicado, apareceu por que isso é perigoso:
--
--   Cronograma (Quadro final) ...... Prova Objetiva: 20/09/2026
--   Item 10.10 ..................... "na data de realização da prova (16 de setembro de
--                                     2026)", com corte em "16 de março de 2026"
--
-- 16/09 é a data do COMPROVANTE DE LOCAL DE PROVA, não da prova. A data foi derivada à
-- mão, a prova mudou (ou foi copiada errada), e o item 10.10 ficou para trás.
--
-- 🔴 A consequência é concreta e adjudicável: com a prova em 20/09, o corte correto é
-- 20 de março. Uma candidata cujo bebê nasceu em 18/03 seria recusada por engano.
--
-- Por isso a data de corte **não se guarda**: guarda-se `idade_maxima_lactente_meses`, e
-- a data sai da etapa `prova_objetiva` do cronograma, na renderização. É o mesmo
-- princípio da numeração de capítulo — o que é derivado não se persiste, senão
-- envelhece em silêncio.

-- ── [8] PCD ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regras_pcd (
  edital_id UUID NOT NULL PRIMARY KEY REFERENCES public.editais(id) ON DELETE RESTRICT,
  percentual_reserva NUMERIC(5,2),
  leis_base TEXT,
  -- Flag do Edital 004: Leis Estaduais RJ 9.425/2021 e 10.186/2023 aceitam laudo com
  -- validade indeterminada para deficiência irreversível, TEA e Síndrome de Down.
  aceita_laudo_indeterminado BOOLEAN,
  validade_meses_laudo_temporario INTEGER,
  -- Rigor formal do 004: falta de rubrica numa única página gera indeferimento.
  -- ⚠️ É regra de PROCEDIMENTO da banca, não validação de sistema. O texto do edital a
  -- descreve; quem confere rubrica é gente.
  obriga_rubrica_todas_folhas BOOLEAN,
  local_pericia TEXT,
  -- ⚠️ As DATAS de perícia NÃO moram aqui: são uma etapa do tipo ALTERNATIVAS em
  -- `cronograma_etapas` (fatia 3). Duplicá-las aqui criaria duas fontes para a mesma
  -- informação, e uma delas envelheceria.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_pcd_percentual CHECK (percentual_reserva IS NULL OR (percentual_reserva > 0 AND percentual_reserva <= 100)),
  CONSTRAINT chk_pcd_validade CHECK (validade_meses_laudo_temporario IS NULL OR validade_meses_laudo_temporario > 0)
);

-- ── [9] Cotas raciais ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regras_cotas_raciais (
  edital_id UUID NOT NULL PRIMARY KEY REFERENCES public.editais(id) ON DELETE RESTRICT,
  percentual_reserva NUMERIC(5,2),
  lei_base TEXT,
  exige_autodeclaracao_datada_assinada BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_cotas_percentual CHECK (percentual_reserva IS NULL OR (percentual_reserva > 0 AND percentual_reserva <= 100))
);

-- ── [11] Condições especiais: lactantes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regras_lactantes (
  edital_id UUID NOT NULL PRIMARY KEY REFERENCES public.editais(id) ON DELETE RESTRICT,
  idade_maxima_lactente_meses INTEGER,
  -- 🔴 NÃO há `data_limite_nascimento`: ela é DERIVADA da data da prova. Ver o cabeçalho.
  permite_compensacao_tempo BOOLEAN,
  tempo_maximo_compensacao_minutos INTEGER,
  intervalos_permitidos INTEGER,
  exige_acompanhante_maior BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_lactante_idade CHECK (idade_maxima_lactente_meses IS NULL OR idade_maxima_lactente_meses > 0),
  CONSTRAINT chk_lactante_tempo CHECK (tempo_maximo_compensacao_minutos IS NULL OR tempo_maximo_compensacao_minutos > 0),
  -- 🔴 Tempo de compensação declarado COM a compensação desligada é incoerência que a
  -- tela renderizaria sem erro: o edital diria "não há compensação" e, adiante, "até 30
  -- minutos". É o Edital 002 misturado com o 003 — a contaminação que este módulo existe
  -- para impedir.
  CONSTRAINT chk_lactante_tempo_coerente CHECK (
    permite_compensacao_tempo IS NOT FALSE OR tempo_maximo_compensacao_minutos IS NULL)
);

-- ── RLS e grants: o padrão do módulo, nas três ───────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['regras_pcd','regras_cotas_raciais','regras_lactantes'] LOOP
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
