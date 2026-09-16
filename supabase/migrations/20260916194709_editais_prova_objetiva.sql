-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 5 — a matriz da prova objetiva
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-16, à tarde (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-prova-objetiva.yaml
-- Capítulos [12] prova objetiva e [13] recursos e vista da folha de respostas.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A COMPOSIÇÃO VARIA POR CARGO, e isso foi medido
-- ─────────────────────────────────────────────────────────────────────────────
--   Edital 002, Docente I .... 50 = 10 Português + 15 Pedagógicos + 25 Específicos
--   Edital 003, Enfermeiro ... 70 = 10 Português + 10 Legislação SUS + 50 Específicos
--   Edital 004, ACS .......... 50 = 10 Português + 10 Matemática + 30 Específicos
--
-- Os editais dizem "A Prova Objetiva PARA OS CANDIDATOS ÀS VAGAS DE <cargo> constará
-- de…", então a configuração pende de `edital_cargos`, não do edital.
--
-- 🔴 Se alguma das três composições exigir caso especial no código, o modelo está errado.
-- Os três são o controle positivo em `src/lib/edital-prova.test.ts`.
--
-- ⚠️ CONFERIDO, e eu tinha errado antes de conferir: os TRÊS editais exigem "sem contudo
-- zerar em qualquer uma das áreas". Cheguei a afirmar que o 004 não tinha a cláusula —
-- era linha truncada no meu grep. `permite_zerar_disciplina` continua sendo parâmetro
-- (é regra que pode variar), mas hoje os três concordam.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A VISTA DA FOLHA DE RESPOSTAS É PARÂMETRO ORTOGONAL
-- ─────────────────────────────────────────────────────────────────────────────
-- O 002 não tem o rito; o 003 e o 004 têm, com e-mail próprio, interstício e termo
-- assinado. ⚠️ Não é propriedade da carreira — qualquer edital pode adotá-lo.

CREATE TABLE IF NOT EXISTS public.provas_objetivas_config (
  edital_cargo_id UUID NOT NULL PRIMARY KEY REFERENCES public.edital_cargos(id) ON DELETE RESTRICT,
  total_questoes INTEGER,
  duracao_minutos INTEGER,
  tempo_minimo_permanencia_minutos INTEGER,
  tempo_minimo_levar_caderno_minutos INTEGER,
  nota_corte_percentual NUMERIC(5,2),
  permite_zerar_disciplina BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_prova_total_questoes CHECK (total_questoes IS NULL OR total_questoes > 0),
  CONSTRAINT chk_prova_duracao CHECK (duracao_minutos IS NULL OR duracao_minutos > 0),
  CONSTRAINT chk_prova_corte CHECK (nota_corte_percentual IS NULL
    OR (nota_corte_percentual > 0 AND nota_corte_percentual <= 100)),
  -- 🔴 Levar o caderno depois do fim da prova é regra que ninguém consegue cumprir. E
  -- permanecer menos que zero, idem. Incoerências que a tela renderizaria sem erro.
  CONSTRAINT chk_prova_caderno_dentro_da_duracao CHECK (
    tempo_minimo_levar_caderno_minutos IS NULL OR duracao_minutos IS NULL
    OR tempo_minimo_levar_caderno_minutos <= duracao_minutos),
  CONSTRAINT chk_prova_permanencia_dentro_da_duracao CHECK (
    tempo_minimo_permanencia_minutos IS NULL OR duracao_minutos IS NULL
    OR tempo_minimo_permanencia_minutos <= duracao_minutos)
);

CREATE TABLE IF NOT EXISTS public.provas_disciplinas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_cargo_id UUID NOT NULL REFERENCES public.edital_cargos(id) ON DELETE RESTRICT,
  nome_disciplina TEXT NOT NULL,
  quantidade_questoes INTEGER NOT NULL,
  peso_por_questao NUMERIC(6,2) NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_disciplina_nome CHECK (btrim(nome_disciplina) <> ''),
  CONSTRAINT chk_disciplina_quantidade CHECK (quantidade_questoes > 0),
  CONSTRAINT chk_disciplina_peso CHECK (peso_por_questao > 0),
  -- ⚠️ A mesma disciplina duas vezes no mesmo cargo é engano de digitação que dobraria a
  -- contagem sem ninguém ver. O nome é normalizado no índice abaixo.
  CONSTRAINT chk_disciplina_ordem CHECK (ordem >= 0)
);

-- Unicidade case/space-insensitive, no padrão de `editais_nome_key` e `cargos_nome_chave`.
CREATE UNIQUE INDEX IF NOT EXISTS provas_disciplinas_cargo_nome_key
  ON public.provas_disciplinas (edital_cargo_id, lower(btrim(nome_disciplina)));

CREATE INDEX IF NOT EXISTS idx_provas_disciplinas_cargo
  ON public.provas_disciplinas (edital_cargo_id);

-- ⚠️ A SOMA das disciplinas × o total declarado NÃO é CHECK. Não dá para expressar
-- agregação de outra tabela numa CHECK, e um trigger recusaria a digitação no meio do
-- caminho — quem monta a matriz preenche uma disciplina de cada vez, e o estado
-- intermediário é legítimo. Quem confere é o linter, em `src/lib/edital-prova.ts`, e é
-- a validação que o `UI e UX.md` marca como bloqueante para AVANÇAR, não para gravar.

CREATE TABLE IF NOT EXISTS public.regras_vista_prova (
  edital_id UUID NOT NULL PRIMARY KEY REFERENCES public.editais(id) ON DELETE RESTRICT,
  tipo_procedimento TEXT,
  email_solicitacao TEXT,
  intersticio_minimo_horas INTEGER,
  exige_termo_visita_assinado BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_vista_tipo CHECK (tipo_procedimento IS NULL
    OR tipo_procedimento IN ('APENAS_RECURSO_ONLINE','VISTA_PRESENCIAL_ASSISTIDA')),
  -- 🔴 Vista presencial SEM e-mail de agendamento é um rito que o candidato não consegue
  -- iniciar. O 003 publica `visto_fr@fevre.com.br`; sem ele o capítulo fica órfão.
  CONSTRAINT chk_vista_presencial_tem_email CHECK (
    tipo_procedimento <> 'VISTA_PRESENCIAL_ASSISTIDA'
    OR email_solicitacao IS NULL OR btrim(email_solicitacao) <> '')
);

-- ── RLS e grants: o padrão do módulo ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['provas_objetivas_config','provas_disciplinas','regras_vista_prova'] LOOP
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
