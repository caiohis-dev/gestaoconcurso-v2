-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 7 — territorialidade e lotação
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-17 (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-territorialidade-e-lotacao.yaml
-- Capítulo [5] e o Anexo I do Edital 004/2026.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- P1 RESPONDIDA POR MEDIÇÃO: catálogo SEPARADO de `unidades_prova`
-- ─────────────────────────────────────────────────────────────────────────────
-- A pergunta do roadmap supunha que os dois catálogos "podem apontar para os MESMOS
-- prédios". Medido em 2026-09-17: a interseção é ZERO.
--
--   `unidades_prova`, 12 linhas em produção .... escolas, faculdade e a sede da FEVRE
--   Quadro II do Edital 004, 39 linhas ......... UBS e UBSF
--
-- E há dois motivos além da medição: `unidades_prova` tem só nome e sigla — nem endereço
-- —, e carrega `sala_prova` (salas, capacidade), que não significa nada para um posto de
-- saúde. Um discriminador `tipo` obrigaria toda consulta das duas famílias a filtrar,
-- para sempre, sob pena de misturar.
--
-- ⚠️ SE um prédio um dia servir às duas coisas, serão DUAS linhas, uma em cada catálogo.
-- Aceito: é mais barato que o discriminador, e hoje não ocorre nenhuma vez.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 DUAS PREMISSAS DO ROADMAP CAÍRAM NA MEDIÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. "Anexo II (004) — ruas por área de abrangência, 963 linhas". ERRADO nas duas pontas:
--    no Edital 004 as ruas estão no ANEXO I (o Anexo II é conteúdo programático, que é o
--    inverso do 002 e do 003), e são 843 logradouros, não 963.
--
-- 2. "`numero_inicial`, `numero_final`". NÃO EXISTEM no documento. O Anexo I lista nome de
--    logradouro e nada mais. Das 843 linhas, 104 têm algo que PARECE faixa — e cada uma é
--    de um tipo diferente:
--
--      TRAV. VISCONDE DO RIO BRANCO (ALAMEDAS 1 A 7)       <- alamedas, não porta
--      RODOVIA LÚCIO MEIRA KM 7501 A 8500                  <- quilometragem
--      RUA VEREADOR ACACIO DA ROCHA (DO N 03 ATÉ O N 9201) <- aí sim, número de porta
--      RUA 1, 2, 3 e 4 (CONDOMÍNIO VISTA BELA)             <- quatro ruas numa linha
--      RUA 552                                             <- só o nome da rua
--
--    🔴 Por isso `logradouro` é TEXT e guarda o que foi publicado, SEM parsing. Quebrar
--    isso em inteiros seria adivinhar, e o repo já decidiu em 01/08 que "dado inválido
--    entra cru; valide na leitura" — foram 4 CHECKs de formato removidas naquele dia.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- E A ABRANGÊNCIA É POR EDITAL, não do prédio
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 A unidade é um fato do município e vive no catálogo global. A DELIMITAÇÃO é o que
-- aquele edital publicou, e limite territorial muda com o tempo. Guardá-la no catálogo
-- faria um edital novo reescrever, em silêncio, o anexo de um edital já publicado.
-- É o mesmo corte de `cargos` (catálogo) e `edital_cargos` (o que este edital declara).

CREATE TABLE IF NOT EXISTS public.unidades_lotacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  sigla TEXT,
  endereco TEXT,
  bairro TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT chk_unidade_lotacao_nome CHECK (btrim(nome) <> '')
);

-- Unicidade funcional, no padrão de `editais_nome_key` e `cargos_nome_chave_key`.
-- ⚠️ Normaliza caixa e espaço, NÃO acento — mesmo limite conhecido daqueles dois.
CREATE UNIQUE INDEX IF NOT EXISTS unidades_lotacao_nome_key
  ON public.unidades_lotacao (lower(btrim(nome)));

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUADRO II: a distribuição de vagas por unidade
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 É um nível ABAIXO do cargo, como `provas_disciplinas` e `titulos_itens`. E TEM de
-- ser: `edital_cargos` tem UNIQUE (edital_id, cargo_id), então o ACS só cabe uma vez lá —
-- as 39 unidades não caberiam como 39 linhas de cargo.
--
-- ⚠️ Cada unidade tem CÓDIGO DE INSCRIÇÃO próprio (DN-1 a DN-39). Para o ACS, a opção de
-- inscrição É a unidade: o candidato não se inscreve para "ACS", se inscreve para "ACS na
-- UBSF Belmonte". É por isso que a cota é calculada POR UNIDADE — ver `edital-cotas.ts`.
CREATE TABLE IF NOT EXISTS public.edital_cargo_unidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_cargo_id UUID NOT NULL REFERENCES public.edital_cargos(id) ON DELETE RESTRICT,
  unidade_lotacao_id UUID NOT NULL REFERENCES public.unidades_lotacao(id) ON DELETE RESTRICT,
  codigo_inscricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  vagas_ampla_concorrencia INTEGER NOT NULL DEFAULT 0,
  vagas_pcd INTEGER NOT NULL DEFAULT 0,
  vagas_negros INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_ecu_ordem CHECK (ordem >= 0),
  CONSTRAINT chk_ecu_vagas_nao_negativas CHECK (
    vagas_ampla_concorrencia >= 0 AND vagas_pcd >= 0 AND vagas_negros >= 0),
  -- 🔴 A mesma unidade duas vezes no mesmo cargo dobraria as vagas sem ninguém ver, e o
  -- total publicado sairia errado. É engano de digitação, nunca intenção.
  CONSTRAINT edital_cargo_unidades_par_key UNIQUE (edital_cargo_id, unidade_lotacao_id)
);

-- ⚠️ SEM unicidade em `codigo_inscricao`. Ele é TEXT livre, como `numero_edital` (§3 do
-- CLAUDE.md, "dado inválido entra cru"), e a coerência dele é do linter. Um índice aqui
-- barraria a digitação no meio do caminho, quando metade dos 39 códigos ainda é NULL.

CREATE INDEX IF NOT EXISTS idx_ecu_cargo ON public.edital_cargo_unidades (edital_cargo_id);
CREATE INDEX IF NOT EXISTS idx_ecu_unidade ON public.edital_cargo_unidades (unidade_lotacao_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- O ANEXO I: a delimitação territorial, como publicada
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.territorialidade_abrangencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  unidade_lotacao_id UUID NOT NULL REFERENCES public.unidades_lotacao(id) ON DELETE RESTRICT,
  -- ⚠️ ANULÁVEL, e isso é o documento falando: das 28 seções do Anexo I, 12 listam as
  -- ruas DIRETO sob a unidade e as outras desdobram por bairro. Exigir bairro obrigaria a
  -- inventar um para metade das linhas.
  bairro TEXT,
  -- 🔴 COMO PUBLICADO, sem parsing. Ver o bloco de premissas no topo.
  logradouro TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_abrangencia_logradouro CHECK (btrim(logradouro) <> ''),
  CONSTRAINT chk_abrangencia_ordem CHECK (ordem >= 0)
);

-- 🔴 ÍNDICE DESDE O INÍCIO, e o motivo é a única leitura que existe: "todas as ruas desta
-- unidade, neste edital". São 843 linhas só no Edital 004.
CREATE INDEX IF NOT EXISTS idx_abrangencia_edital_unidade
  ON public.territorialidade_abrangencia (edital_id, unidade_lotacao_id, ordem);

-- ⚠️ E O TETO DO POSTGREST É O RISCO REAL DESTA TABELA: 843 linhas num edital só, 84% do
-- `max_rows` de 1000, que CORTA SEM ERRO. Toda leitura completa passa por
-- `src/lib/buscar-em-fatias.ts`. Já mordeu este repo duas vezes (colaboradores, 771
-- linhas; e o painel de dados). Aqui o sintoma seria uma RUA SUMINDO do anexo publicado.

-- ── RLS e grants: o padrão do módulo ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['unidades_lotacao','edital_cargo_unidades','territorialidade_abrangencia'] LOOP
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

COMMENT ON TABLE public.unidades_lotacao IS
  'v3 fatia 7 - catalogo GLOBAL de locais de trabalho (UBS/UBSF). Separado de unidades_prova: medido em 2026-09-17, a intersecao entre os dois e zero.';
COMMENT ON TABLE public.edital_cargo_unidades IS
  'v3 fatia 7 - o Quadro II: vagas por unidade, um nivel abaixo do cargo. Cada unidade tem codigo de inscricao proprio, e a cota e calculada POR unidade.';
COMMENT ON TABLE public.territorialidade_abrangencia IS
  'v3 fatia 7 - o Anexo I do Edital 004: logradouros por unidade, COMO PUBLICADOS. 843 linhas num edital: toda leitura completa passa por buscar-em-fatias.';
COMMENT ON COLUMN public.territorialidade_abrangencia.logradouro IS
  'Texto publicado, sem parsing. As faixas do documento sao heterogeneas (km, alamedas, numeros de porta, varias ruas numa linha) e quebra-las em inteiros seria adivinhar.';
