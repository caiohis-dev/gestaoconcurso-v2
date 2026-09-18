-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Os cinco dados variáveis do documento que não tinham onde morar
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Rodada 0 do tema "Edital padrão": o marcador `{{campo:chave}}` (src/lib/edital-campos.ts)
-- resolve valor dentro do texto corrido. A maioria dos valores já tem dono — datas vêm de
-- `cronograma_etapas`, taxa e vencimento de `edital_cargos`, canais de
-- `edital_canais_atendimento`. Estes cinco não tinham.
--
-- ── MEDIDO no Edital 004/2026 antes de criar coluna (regra da casa) ────────────────────
--
--   endereço da sede da FEVRE .......... 7 ocorrências, em capítulos diferentes
--   site do certame .................... 9 URLs, um domínio só
--   nome de quem assina ................ 1 (o fecho)
--   cargo de quem assina ............... 1 (o fecho)
--   data de publicação ................. 0 — e é justamente o ponto: o documento publicado
--                                        traz "Volta Redonda, ___ de ________ de 2026",
--                                        com a lacuna manuscrita. Vinda de um campo,
--                                        "vazio" passa a ser estado que o linter acusa.
--
-- 🔴 POR QUE ESTES CINCO NUMA MIGRATION SÓ, e não um por rodada de capítulo: os dois
-- primeiros são TRANSVERSAIS. A sede aparece em 7 lugares e o site em 9, espalhados por
-- capítulos diferentes — qual rodada seria "a dona" é arbitrário, e fatiá-los só
-- multiplicaria migrations e `db reset` para o mesmo resultado.
--
-- ⚠️ A regra para admitir um campo novo daqui em diante, escrita em edital-campos.ts:
-- ele varia entre editais E (repete-se em mais de um lugar OU é data/valor). Um endereço
-- citado uma vez é texto do documento, não campo. O modelo é um documento, não um
-- formulário.
--
-- ── TODAS ANULÁVEIS, e isso não é descuido ────────────────────────────────────────────
--
-- Produção tem 3 editais que não conhecem nenhum destes valores, e o dump carrega DEPOIS
-- das migrations. Um NOT NULL aqui quebraria todo `db reset` e o bootstrap de produção.
-- Quem cobra o preenchimento é o linter (`campo-sem-valor`), na hora de publicar — e ele
-- diz em que capítulo ir preencher.
--
-- ⚠️ SEM CHECK de formato em `site_oficial`, de propósito. Este repo removeu 4 CHECKs de
-- formato em 2026-08-01 ("dado inválido entra cru; valide na LEITURA"), e `numero_edital`
-- já é text sem CHECK pelo mesmo motivo. O mundo real escreve URL de muitas formas, e uma
-- CHECK aqui recusaria edital válido para ganhar nada.
-- ═══════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.editais
  ADD COLUMN IF NOT EXISTS site_oficial       TEXT,
  ADD COLUMN IF NOT EXISTS executora_endereco TEXT,
  ADD COLUMN IF NOT EXISTS signatario_nome    TEXT,
  ADD COLUMN IF NOT EXISTS signatario_cargo   TEXT,
  ADD COLUMN IF NOT EXISTS data_publicacao    DATE;

COMMENT ON COLUMN public.editais.site_oficial IS
  'Endereço eletrônico do certame. Resolve {{campo:site_oficial}} — 9 ocorrências no Edital 004.';
COMMENT ON COLUMN public.editais.executora_endereco IS
  'Endereço da entidade executora. Resolve {{campo:executora_endereco}} — 7 ocorrências no Edital 004.';
COMMENT ON COLUMN public.editais.signatario_nome IS
  'Quem assina o edital. Resolve {{campo:signatario_nome}}.';
COMMENT ON COLUMN public.editais.signatario_cargo IS
  'Cargo de quem assina. Resolve {{campo:signatario_cargo}}.';
COMMENT ON COLUMN public.editais.data_publicacao IS
  'Data de publicação. Resolve {{campo:data_publicacao}}, por extenso no fecho do documento.';

-- Nenhuma policy nova: `editais` já tem SELECT para qualquer autenticado e escrita só de
-- admin (`has_role`). Coluna nova herda a policy da tabela — e é o que se quer aqui.
