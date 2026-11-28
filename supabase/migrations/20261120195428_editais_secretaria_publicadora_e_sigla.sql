-- ═══════════════════════════════════════════════════════════════════════════════════════
-- A secretaria que PUBLICA o edital, e a sigla dela
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Consertos E2 + melhoria M11 do módulo Editais (my_rules/analises/roadmap-editais-*.yaml).
--
-- ── MEDIDO nos publicados (my_rules/modulo_editais/) ──────────────────────────────────
--
--   Edital 002 · cabeçalho:  MUNICÍPIO DE V0LTA REDONDA
--                            SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO        ← secretaria_publicadora
--                            CONCURSO PÚBLICO PARA A SECRETARIA MUNICIPAL DE EDUCAÇÃO
--                            Edital Nº. 002/2026-SMA                      ← secretaria_sigla
--   Edital 003 · cabeçalho:  o mesmo SEM a linha da secretaria, e com o "-SMA" no número.
--
-- A sigla do número e o nome da segunda linha são o MESMO fato (quem publica), dito de
-- duas formas — decisão do usuário em 2026-11-20: os dois campos andam juntos, lado a lado
-- no Preâmbulo. Cada um é opcional por si: o 003 é exatamente "sigla sem nome".
--
-- ⚠️ NÃO é o órgão DEMANDANTE (`orgao_demandante`, "Secretaria Municipal de Educação" no
-- 002): este é quem pede o concurso; aquele é quem o publica.
--
-- ── ANULÁVEIS e SEM CHECK, de propósito ───────────────────────────────────────────────
--
-- Mesmo motivo das outras colunas de metadados (20260916173801, 20260918103305): os
-- editais existentes não conhecem estes valores e o dump carrega DEPOIS das migrations; e
-- `numero_edital` já é text sem CHECK ("dado inválido entra cru; valide na LEITURA").
-- Quem compõe e cobra é o código: `comporNumeroDoEdital` (src/lib/edital-campos.ts) e o
-- cabeçalho de `edital-documento.ts`, que vira pendência no portão da exportação.

ALTER TABLE public.editais
  ADD COLUMN secretaria_publicadora text,
  ADD COLUMN secretaria_sigla text;

COMMENT ON COLUMN public.editais.secretaria_publicadora IS
  'Secretaria que publica o edital (2ª linha do cabeçalho). Opcional: sem ela, a linha não sai.';
COMMENT ON COLUMN public.editais.secretaria_sigla IS
  'Sigla da secretaria que publica — o sufixo do número: 004 + 2026 + SMA → 004/2026-SMA.';
