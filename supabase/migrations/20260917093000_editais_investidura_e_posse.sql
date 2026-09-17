-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 8 — investidura e posse
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-17 (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-investidura.yaml
-- Capítulo [16]. Itens 15.8 (002 e 004) e 14.8 (003).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🎯 É AQUI QUE O DEFEITO DE ABERTURA DO MÓDULO MORRE
-- ─────────────────────────────────────────────────────────────────────────────
-- O item 15.8-L do Edital 004 JÁ PUBLICADO exige "Certidão Nada Consta do COREN" de
-- Agente Comunitário de Saúde — cargo de nível médio, sem conselho de classe.
--
-- 🔴 E A MEDIÇÃO MOSTROU DE ONDE VEIO, o que confirma o diagnóstico de copia-e-cola: o
-- Edital 003 (Enfermagem) tem DOIS documentos de COREN —
--
--     K) Registro Ativo e regular com anuidade paga no COREN
--     N) Certidão Nada Consta do COREN (Certidão Única Atualizada)
--
-- — e o 004 herdou SÓ O SEGUNDO, com o mesmo texto entre parênteses. Não é erro
-- sistemático de geração: é uma linha copiada à mão de um documento para o outro.
--
-- ⚠️ O material de referência propunha "os documentos do COREN ficam DESABILITADOS ou
-- OCULTOS". Desabilitado ainda é oferecido, e vira habilitado no dia em que alguém
-- "melhorar" a UX. A regra aqui é mais forte, e em duas camadas:
--
--   1. O documento de conselho tem COLUNA PRÓPRIA (`conselho_exigido`), e o TRIGGER
--      abaixo o recusa se nenhum cargo do edital exigir aquele conselho. Barreira de
--      banco, não `if` de hook (CLAUDE.md §2) — vale por psql, PostgREST e script.
--   2. O linter varre o TEXTO LIVRE de `nome_documento` atrás de sigla de conselho que o
--      edital não exige. É a rede para quem colar a linha à mão sem usar a coluna.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE FOI MEDIDO NOS TRÊS CHECKLISTS
-- ─────────────────────────────────────────────────────────────────────────────
-- Núcleo comum aos três (10 documentos): comprovante de votação · identificação com foto
-- · comprovante de residência (3 meses) · CPF · PIS/PASEP · certidão de nascimento ou
-- casamento · certidão de nascimento de filhos menores de 14 anos · foto 3x4 ·
-- certificado de reservista (homem) · declaração de IR, caso declare.
--
-- Variam:
--   · a QUANTIDADE de fotos (002 pede uma; 003 e 004 pedem duas);
--   · o ASO aparece como documento só no 002 — nos outros dois está no texto de abertura;
--   · o diploma é por CARGO: o 002 diz "do Curso exigido para o cargo a que concorre"
--     (genérico), o 003 lista "Diploma de Enfermeiro" e "Diploma de Técnico em
--     Enfermagem" (um por cargo), e o 004 diz "Diploma do Ensino Médio".
--
-- 🔴 P1 DO ROADMAP RESPONDIDA, E A RESPOSTA É "NÃO CRIAR A COLUNA".
-- Ele perguntava se `aplica_apenas_sexo` (AMBOS | MASCULINO) merecia existir. Medido: o
-- reservista é o ÚNICO item condicionado a sexo nos três editais — mas ele não é o único
-- CONDICIONAL. A mesma lista tem "de filhos menores de 14 anos" e "caso declare", e os
-- três exprimem a condição DENTRO DO PRÓPRIO TEXTO do documento: "(homem)", "menores de
-- 14 anos", "caso declare".
--
-- Ou seja: o formato real do dado já carrega a condição, e uma coluna de sexo serviria a
-- 1 linha de ~12 enquanto as outras duas condições continuariam em texto. Seria a terceira
-- coluna inventada que a medição derruba nesta v3, depois de `limite_itens_aceitos`
-- (fatia 6) e `numero_inicial`/`numero_final` (fatia 7).

CREATE TABLE IF NOT EXISTS public.documentos_investidura (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  -- NULL = vale para todos os cargos. ⚠️ E `aplica_a_todos_os_cargos` existe JUSTAMENTE
  -- para que esse nulo não seja ambíguo: nulo também é o valor de quem esqueceu de
  -- escolher, e sem a distinção o linter não consegue acusar documento órfão. A CHECK
  -- biconditional obriga a UI a uma escolha explícita.
  cargo_id UUID REFERENCES public.cargos(id) ON DELETE RESTRICT,
  aplica_a_todos_os_cargos BOOLEAN NOT NULL DEFAULT false,
  nome_documento TEXT NOT NULL,
  -- 🔴 A coluna que torna o erro do COREN impossível pelo caminho legítimo. Domínio igual
  -- ao de `cargos.conselho_classe_obrigatorio`, SEM o 'NENHUM' — que ali significa
  -- "declarado, e não tem", e aqui não teria sentido.
  conselho_exigido TEXT,
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_doc_inv_nome CHECK (btrim(nome_documento) <> ''),
  CONSTRAINT chk_doc_inv_ordem CHECK (ordem >= 0),
  CONSTRAINT chk_doc_inv_escopo CHECK ((cargo_id IS NULL) = aplica_a_todos_os_cargos),
  CONSTRAINT chk_doc_inv_conselho CHECK (conselho_exigido IS NULL OR conselho_exigido IN (
    'COREN','CRM','CREF','OAB','CRO','CRF','CRP','CRN','CREA','CRC','CRESS','CRMV','CRB','CRFa'))
);

CREATE INDEX IF NOT EXISTS idx_doc_inv_edital ON public.documentos_investidura (edital_id, ordem);

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 IN001 — o documento de conselho só existe se algum CARGO DO EDITAL o exigir
-- ─────────────────────────────────────────────────────────────────────────────
-- Cruza `documentos_investidura` → `edital_cargos` → `cargos`. FK não expressa isso, e
-- CHECK não enxerga outra tabela: é TRIGGER, pelo §2 do CLAUDE.md.
--
-- ⚠️ Repara no que ele NÃO faz: não olha o cargo do próprio documento. Um edital com
-- Enfermeiro e ACS pode exigir o COREN num documento que vale para todos — é o que o
-- Edital 003 faz, listando o registro do COREN uma vez para os dois cargos de enfermagem.
-- A pergunta é sobre o EDITAL, não sobre a linha.
CREATE OR REPLACE FUNCTION public.check_documento_conselho_pertence_ao_edital()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.conselho_exigido IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.edital_cargos ec
      JOIN public.cargos c ON c.id = ec.cargo_id
     WHERE ec.edital_id = NEW.edital_id
       AND c.conselho_classe_obrigatorio = NEW.conselho_exigido
  ) THEN
    RAISE EXCEPTION
      'IN001: nenhum cargo deste edital exige registro no %. Foi assim que a "Certidão Nada Consta do COREN" chegou ao Edital 004/2026, num concurso de Agente Comunitário de Saúde.',
      NEW.conselho_exigido
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_documento_conselho ON public.documentos_investidura;
CREATE TRIGGER check_documento_conselho
  BEFORE INSERT OR UPDATE OF conselho_exigido, edital_id ON public.documentos_investidura
  FOR EACH ROW EXECUTE FUNCTION public.check_documento_conselho_pertence_ao_edital();

-- ⚠️ O QUE ESTE TRIGGER NÃO ALCANÇA, e por isso o linter existe: alguém pode digitar
-- "Certidão Nada Consta do COREN" em `nome_documento` deixando `conselho_exigido` nulo.
-- Barrar isso no banco exigiria casar TEXTO LIVRE contra siglas — e nome de documento
-- varia demais ("COREN", "Coren-RJ", "Conselho Regional de Enfermagem") para virar
-- barreira sem recusar o legítimo. Quem varre o texto é `src/lib/edital-investidura.ts`.
--
-- 🔴 E a outra ponta: se NENHUM cargo do edital tiver conselho DECLARADO (a coluna é
-- anulável e nasce nula), a regra degrada para "não oferece nada" — que é seguro, mas
-- silencioso. O linter acusa cargo com conselho NÃO DECLARADO, distinguindo-o de
-- 'NENHUM', que é declaração de que não há.

-- ── RLS e grants: o padrão do módulo ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documentos_investidura'] LOOP
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

COMMENT ON TABLE public.documentos_investidura IS
  'v3 fatia 8 - o checklist de documentos da posse. O documento de conselho de classe so entra se algum cargo do edital exigir aquele conselho (trigger IN001) - e a Certidao Nada Consta do COREN no Edital 004 e o defeito que motivou isso.';
COMMENT ON COLUMN public.documentos_investidura.aplica_a_todos_os_cargos IS
  'Existe para desambiguar o cargo_id nulo: sem ele, "vale para todos" e "esqueci de escolher" seriam o mesmo estado, e o linter nao conseguiria acusar documento orfao.';
COMMENT ON COLUMN public.documentos_investidura.conselho_exigido IS
  'Dominio igual ao de cargos.conselho_classe_obrigatorio, sem o NENHUM. O trigger check_documento_conselho recusa valor que nenhum cargo do edital exija.';
