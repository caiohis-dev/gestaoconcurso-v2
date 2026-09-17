-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 6 — a prova de títulos
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-16, à noite (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-prova-de-titulos.yaml
-- Capítulo [14] do `Estrutura de Edital.md`, item 13 do Edital 002/2026.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE FOI MEDIDO — só o Edital 002 tem esta etapa entre os três
-- ─────────────────────────────────────────────────────────────────────────────
-- Os Quadros III e IV publicados, item a item:
--
--   QUADRO III — Docente I (Arte, Ciências, Ed. Física, Geografia, História,
--                           Língua Inglesa, Língua Portuguesa e Matemática)
--     Mestrado Profissional na Área do Componente Curricular ........ 5 / 5
--     Lato sensu, Tecnologias Digitais na Educação, 360h ............ 4 / 4
--     Lato sensu, Educação Inclusiva, 360h .......................... 3 / 3
--                                                            TOTAL  12 / 12
--
--   QUADRO IV — Docente II (Educação Infantil, Ensino Fundamental 1º ao 5º e
--                           anos iniciais da EJA)
--     Mestrado Profissional na Área de Docência na Educação Básica .. 5 / 5
--     Lato sensu, Alfabetização e Letramento em Educação Infantil ... 4 / 4
--     Lato sensu, Educação Inclusiva, 360h .......................... 3 / 3
--                                                            TOTAL  12 / 12
--
-- 🔴 AS DUAS COLUNAS DE PONTOS SÃO DO DOCUMENTO, não invenção minha. A tabela publicada
-- tem "Pontuação Mínima por Título" e "Pontuação Máxima por Título" lado a lado, e a
-- tabela gerada tem de reproduzi-las. ⚠️ Nos 6 itens reais as duas são IGUAIS, então a
-- diferença entre elas NÃO é exercitada por nenhum dado que temos — é fronteira
-- registrada, não regra provada.
--
-- 🔴 O QUE O ESBOÇO PROPUNHA E A MEDIÇÃO DERRUBOU: `limite_itens_aceitos` e
-- `pontos_por_item`. Nenhum dos dois aparece no documento — não há conceito de
-- quantidade de títulos por categoria no Edital 002. Modelá-los seria inventar um
-- parâmetro que ninguém preenche, e todo campo que ninguém preenche vira, com o tempo,
-- um campo em que alguém confia.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE O TETO PENDE DO EDITAL E A CATEGORIA PENDE DO CARGO
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ Difere da fatia 5 de propósito, e o motivo está no documento. Lá cada edital diz
-- "A Prova Objetiva PARA OS CANDIDATOS ÀS VAGAS DE <cargo> constará de…", então a
-- configuração inteira pende do cargo. Aqui o item 13.4 declara o teto UMA vez, para os
-- dois quadros: "cuja pontuação máxima não deverá ultrapassar 12 (doze) pontos".
--
-- 🔵 E a APLICABILIDADE fica implícita, sem coluna para ela: o item 13.2 restringe os
-- títulos a Docente I e Docente II, e é o que acontece sozinho quando um cargo não tem
-- nenhuma linha em `titulos_itens`. Uma coluna `tem_titulos` seria um segundo lugar
-- dizendo a mesma coisa, livre para divergir.

CREATE TABLE IF NOT EXISTS public.titulos_config (
  edital_id UUID NOT NULL PRIMARY KEY REFERENCES public.editais(id) ON DELETE RESTRICT,
  teto_maximo_pontos NUMERIC(6,2),
  -- 13.1 "A avaliação de títulos tem caráter apenas classificatório."
  -- ⚠️ É PARÂMETRO, não constante: os três editais não divergem porque só um tem títulos.
  -- Um edital eliminatório por títulos é raro, não impossível.
  carater_classificatorio BOOLEAN,
  -- 13.5 exige histórico escolar com a carga horária; 13.7 exige CNE/MEC.
  exige_historico_escolar BOOLEAN,
  exige_reconhecimento_mec_cne BOOLEAN,
  -- 13.17 "concluídos até 30 dias antes do prazo previsto no subitem 5.4" — e o 5.4 é o
  -- fim das inscrições. 🔴 GUARDA-SE O INTERVALO, NUNCA A DATA: a data é derivada do
  -- cronograma (fatia 3), e gravá-la aqui criaria a segunda cópia que envelhece calada —
  -- que é o defeito do `"dia XX/xx/2026"` que este módulo inteiro existe para matar.
  dias_conclusao_antes_fim_inscricoes INTEGER,
  exige_traducao_juramentada BOOLEAN,
  exige_revalidacao_diploma_estrangeiro BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_titulos_teto CHECK (teto_maximo_pontos IS NULL OR teto_maximo_pontos > 0),
  CONSTRAINT chk_titulos_dias CHECK (
    dias_conclusao_antes_fim_inscricoes IS NULL OR dias_conclusao_antes_fim_inscricoes >= 0)
);

CREATE TABLE IF NOT EXISTS public.titulos_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Uma linha por CARGO, no precedente da fatia 5. ⚠️ Decisão do usuário em 2026-09-16,
  -- perguntada e respondida: NÃO se agrupa cargo. O Quadro III publicado junta os 8
  -- Docente I numa linha só; o gerado sai com uma linha por cargo. É divergência
  -- ESCOLHIDA, não descuido — e está registrada no doc do módulo.
  edital_cargo_id UUID NOT NULL REFERENCES public.edital_cargos(id) ON DELETE RESTRICT,
  ordem INTEGER NOT NULL DEFAULT 0,
  nivel TEXT NOT NULL,
  -- A coluna "Títulos Aferíveis" do quadro publicado: o texto que sai no edital.
  descricao TEXT NOT NULL,
  area_exigida TEXT,
  carga_horaria_minima_horas INTEGER,
  pontos_minimo NUMERIC(6,2) NOT NULL,
  pontos_maximo NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Domínio fechado, no precedente de `colaboradores.tipo_chave_pix` e de
  -- `edital_itens.quadro_fonte`. ⚠️ DOUTORADO e MESTRADO_ACADEMICO não aparecem em
  -- nenhum dos três editais — entram porque recusá-los seria barrar título corriqueiro,
  -- e o custo de um valor a mais no domínio é zero.
  CONSTRAINT chk_titulo_nivel CHECK (nivel IN (
    'DOUTORADO','MESTRADO_ACADEMICO','MESTRADO_PROFISSIONAL','ESPECIALIZACAO_LATO_SENSU')),
  CONSTRAINT chk_titulo_descricao CHECK (btrim(descricao) <> ''),
  CONSTRAINT chk_titulo_ordem CHECK (ordem >= 0),
  CONSTRAINT chk_titulo_carga_horaria CHECK (
    carga_horaria_minima_horas IS NULL OR carga_horaria_minima_horas > 0),
  -- 🔴 Título que vale zero ponto não é título: é linha que ocupa espaço no quadro
  -- publicado e não pontua ninguém.
  CONSTRAINT chk_titulo_pontos_positivos CHECK (pontos_minimo > 0 AND pontos_maximo > 0),
  -- 🔴 Mínimo acima do máximo é o par invertido, e a tela renderizaria os dois sem erro.
  CONSTRAINT chk_titulo_pontos_coerentes CHECK (pontos_minimo <= pontos_maximo)
);

CREATE INDEX IF NOT EXISTS idx_titulos_itens_cargo
  ON public.titulos_itens (edital_cargo_id);

-- ⚠️ A SOMA dos `pontos_maximo` contra o teto NÃO é CHECK, pela mesma razão da fatia 5:
-- agregação de outra tabela não cabe numa CHECK, e um trigger recusaria a digitação no
-- meio do caminho — quem monta o quadro preenche um título por vez, e 5 pontos num teto
-- de 12 é estado intermediário legítimo. Quem confere é `src/lib/edital-titulos.ts`.

-- ── RLS e grants: o padrão do módulo ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['titulos_config','titulos_itens'] LOOP
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

COMMENT ON TABLE public.titulos_config IS
  'v3 fatia 6 — as regras gerais da prova de títulos, por EDITAL. O teto é declarado uma vez (item 13.4 do Edital 002), diferente da fatia 5, em que a configuração pende do cargo.';
COMMENT ON TABLE public.titulos_itens IS
  'v3 fatia 6 — os Quadros III e IV: um título aferível por linha, por cargo. A aplicabilidade do capítulo é implícita — cargo sem linha não tem títulos (item 13.2).';
COMMENT ON COLUMN public.titulos_config.dias_conclusao_antes_fim_inscricoes IS
  'INTERVALO, nunca data: a data é derivada do fim das inscrições (fatia 3). Gravar a data criaria a segunda cópia que envelhece calada.';
