-- ============================================================================
-- MÓDULO EDITAIS, v3 fatia 2 — o Quadro I: cargos, vagas e remuneração
-- ============================================================================
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-16, à tarde (horário local).
--
-- Roadmap: my_rules/analises/roadmap-editais-cargos-vagas-remuneracao.yaml
--
-- 🔴 ESTA É A ÚNICA FATIA QUE ENCOSTA NUMA TABELA DE OUTRO MÓDULO EM PRODUÇÃO.
-- `cargos` é do módulo Candidatos, é a chave da importação de inscritos, e a decisão D2
-- do usuário foi explícita: ela É a fonte de verdade e NÃO se duplica.
--
-- Linha de base tirada antes (etapa 0, commit 6f36647): `docs/bateria-cargos.sql` estava
-- QUEBRADA há seis semanas, em três pontos. Foi consertada e está verde — é contra ela
-- que esta migration será conferida.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A CG001 PASSA A OLHAR O NOME, E SÓ ELE
-- ─────────────────────────────────────────────────────────────────────────────
-- O trigger `cargos_recusa_alterar_com_inscritos` barrava QUALQUER UPDATE num cargo com
-- inscritos, sem olhar que coluna mudou. Com as colunas novas abaixo, isso significaria:
-- **o autor do edital não consegue definir o conselho de classe de nenhum cargo que já
-- tenha um inscrito.** Hoje não morde (`cargos` está vazia em produção e o edital é
-- redigido antes da importação); morde no ano seguinte, quando "Enfermeiro" já carrega
-- os inscritos do certame anterior e alguém precisa corrigir o conselho.
--
-- O que a CG001 realmente protege é a IDENTIDADE: renomear um cargo com inscritos muda o
-- significado do vínculo que os inscritos já têm. Escolaridade e conselho de classe não
-- tocam nisso.
--
-- ⚠️ É a SEGUNDA vez que a CG001 é estreitada. A primeira foi em 2026-08-01
-- (`20260801193530`), tirando `cargo_apelidos` da contagem — a regra larga travava o
-- cargo já no passo 3 do assistente de importação. O padrão se repete: a regra nasceu
-- larga demais e se estreita conforme o uso mostra onde ela realmente precisa morder.
--
-- 🔴 A bateria tem casos que afirmam a regra LARGA (4b.1 e 7.2a renomeiam, e devem
-- continuar recusando; mas qualquer caso que altere OUTRA coluna passa a ser aceito).
-- Ao rodá-la, caso que cai é a pergunta, não obstáculo — armadilha 8 de testes.md.

CREATE OR REPLACE FUNCTION public.cargos_recusa_alterar_com_inscritos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidatos integer;
BEGIN
  -- 🔵 2026-09-16: só o NOME tranca. A versão anterior barrava qualquer UPDATE, e isso
  -- impediria o módulo Editais de parametrizar escolaridade e conselho de classe.
  -- ⚠️ `nome_chave` é coluna GERADA de `nome` — comparar `nome` já cobre as duas.
  IF NEW.nome IS NOT DISTINCT FROM OLD.nome THEN
    RETURN NEW;
  END IF;

  -- Usa `idx_candidatos_cargo`. Sem ele isto seria seq scan em `candidatos` — milhares
  -- de linhas — a cada UPDATE.
  --
  -- ⚠️ `cargo_apelidos` NÃO é contado, e é o ponto da migration 20260801193530.
  SELECT count(*) INTO v_candidatos FROM candidatos WHERE cargo_id = OLD.id;

  IF v_candidatos > 0 THEN
    -- Barrar sem orientar só troca um problema por outro: a mensagem diz O QUE prende,
    -- QUANTO, e qual é a única saída.
    RAISE EXCEPTION
      'O cargo "%" tem % inscrito(s) em algum edital e não pode ser RENOMEADO. Só cargo sem nenhum inscrito pode mudar de nome.',
      OLD.nome, v_candidatos
      USING ERRCODE = 'CG001';
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `cargos` GANHA O QUE É PROPRIEDADE DO CATÁLOGO
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ Só o que NÃO varia entre editais. Medido: o código de inscrição varia ("MT 22" no
-- 002, "EF 4" no 003, "AG 1" no 004), então ele vai para `edital_cargos`, abaixo.
--
-- 🔴 NÃO criar `titulo_cargo`: é o `nome` que já existe. E não tocar em `nome_chave`,
-- que é coluna gerada, nem no UNIQUE que a usa.
ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS escolaridade_minima         TEXT,
  ADD COLUMN IF NOT EXISTS conselho_classe_obrigatorio TEXT;

ALTER TABLE public.cargos DROP CONSTRAINT IF EXISTS chk_cargo_escolaridade_minima;
ALTER TABLE public.cargos
  ADD CONSTRAINT chk_cargo_escolaridade_minima
  CHECK (escolaridade_minima IS NULL
         OR escolaridade_minima IN ('FUNDAMENTAL', 'MEDIO', 'TECNICO', 'SUPERIOR'));

-- Domínio fechado, e é ele que a fatia 8 usa para impedir o erro do COREN: o checklist
-- de investidura só oferece conselho que ALGUM cargo do edital exige.
-- ⚠️ 'NENHUM' é valor explícito, diferente de NULL: "não exige conselho" é uma afirmação,
-- "ninguém preencheu" é outra. O linter precisa distinguir as duas.
ALTER TABLE public.cargos DROP CONSTRAINT IF EXISTS chk_cargo_conselho_classe;
ALTER TABLE public.cargos
  ADD CONSTRAINT chk_cargo_conselho_classe
  CHECK (conselho_classe_obrigatorio IS NULL
         OR conselho_classe_obrigatorio IN
            ('NENHUM','COREN','CRM','CREF','OAB','CRO','CRF','CRP','CRN','CREA','CRC','CRESS','CRMV','CRB','CRFa'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. `edital_cargos` — a parametrização do cargo DENTRO de um edital
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edital_cargos (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  edital_id  UUID NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,
  -- 🔴 RESTRICT também aqui: um cargo usado por um edital publicado não some do catálogo.
  cargo_id   UUID NOT NULL REFERENCES public.cargos(id)  ON DELETE RESTRICT,
  codigo_inscricao TEXT,            -- "MT 22", "EF 4", "AG 1" — varia por edital (medido)
  habilitacao      TEXT,            -- o texto do Quadro I ("Licenciatura Plena em...")
  carga_horaria_valor   NUMERIC(8,2),
  carga_horaria_unidade TEXT,
  regime_plantao_permitido BOOLEAN,
  vencimento_base  NUMERIC(12,2),
  -- As vagas. 🔴 O TOTAL é o que a pessoa digita; AC/PD/CN são calculados e gravados.
  -- Medido em 11 cargos dos editais 002 e 003, 22 valores, 100% consistentes:
  --   PD = arredonda(total × 0,10) · CN = arredonda(total × 0,20) · AC = total − PD − CN
  -- Arredondamento COMUM (meio para cima), base no TOTAL e não no AC, sem piso de 1.
  -- ⚠️ A conta mora em `src/lib/edital-cotas.ts`, testada com os 22 valores reais. Aqui
  -- o banco guarda o resultado: o edital publica NÚMEROS, e recalcular na leitura faria
  -- um edital antigo mudar se a regra mudasse.
  vagas_total NUMERIC(8,0),
  vagas_ampla_concorrencia NUMERIC(8,0),
  vagas_pcd   NUMERIC(8,0),
  vagas_negros NUMERIC(8,0),
  cadastro_reserva BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT edital_cargos_edital_cargo_key UNIQUE (edital_id, cargo_id),
  CONSTRAINT chk_edital_cargo_carga_unidade CHECK (
    carga_horaria_unidade IS NULL
    OR carga_horaria_unidade IN ('HORAS_AULA_SEMANAIS','HORAS_SEMANAIS','HORAS_MENSAIS')),
  CONSTRAINT chk_edital_cargo_vagas_nao_negativas CHECK (
    coalesce(vagas_total, 0) >= 0 AND coalesce(vagas_ampla_concorrencia, 0) >= 0
    AND coalesce(vagas_pcd, 0) >= 0 AND coalesce(vagas_negros, 0) >= 0),
  -- 🔴 A soma TEM de fechar. É a barreira que impede o Quadro I de publicar um total que
  -- não é a soma das partes — o tipo de erro que só aparece quando alguém soma à mão.
  -- Anulável inteiro: enquanto o autor não preencheu as vagas, nada a conferir.
  CONSTRAINT chk_edital_cargo_vagas_somam CHECK (
    vagas_total IS NULL
    OR vagas_total = coalesce(vagas_ampla_concorrencia,0) + coalesce(vagas_pcd,0) + coalesce(vagas_negros,0))
);

CREATE INDEX IF NOT EXISTS idx_edital_cargos_edital ON public.edital_cargos (edital_id);
CREATE INDEX IF NOT EXISTS idx_edital_cargos_cargo  ON public.edital_cargos (cargo_id);

DROP TRIGGER IF EXISTS update_edital_cargos_updated_at ON public.edital_cargos;
CREATE TRIGGER update_edital_cargos_updated_at
  BEFORE UPDATE ON public.edital_cargos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: espelha `editais` e `edital_capitulos` ──────────────────────────────
ALTER TABLE public.edital_cargos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view edital_cargos" ON public.edital_cargos;
CREATE POLICY "Authenticated users can view edital_cargos"
  ON public.edital_cargos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert edital_cargos" ON public.edital_cargos;
CREATE POLICY "Admins can insert edital_cargos"
  ON public.edital_cargos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update edital_cargos" ON public.edital_cargos;
CREATE POLICY "Admins can update edital_cargos"
  ON public.edital_cargos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete edital_cargos" ON public.edital_cargos;
CREATE POLICY "Admins can delete edital_cargos"
  ON public.edital_cargos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON TABLE public.edital_cargos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.edital_cargos
  TO authenticated, service_role;
