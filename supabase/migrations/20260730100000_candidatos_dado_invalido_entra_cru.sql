-- ─────────────────────────────────────────────────────────────────────────────────────
-- Dado inválido do candidato passa a ENTRAR como veio, em vez de virar NULL
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- DECISÃO DO USUÁRIO, 2026-07-30: "Candidato com dados considerado inválido. Candidato e
-- dados entram. Candidato e dados são citados no relatório."
--
-- ⚠️ ISTO INVERTE O QUE A MIGRATION 20260727000000 DOCUMENTA. Aquela migration está
-- aplicada e não se edita, então o registro correto passa a ser ESTE arquivo. Os
-- comentários de coluna de lá — "O importador grava NULL e ACUSA no relatório" (cpf),
-- "NULL + aviso, não descarte" (email) — descrevem o comportamento ANTIGO. Quem for ler
-- a origem da regra, leia aqui.
--
-- ── O que muda, e por quê ────────────────────────────────────────────────────────────
--
-- ANTES: o cliente anulava o valor impossível ANTES de enviar. Consequência silenciosa —
-- as CHECKs abaixo NUNCA dispararam em produção: elas guardavam uma porta que o
-- importador já fechava sozinho. O custo era o dado da origem: um CPF com a letra O
-- (`1O778817709`) desaparecia, e ninguém depois conseguia saber o que a pessoa digitou.
--
-- DEPOIS: o texto da origem é gravado como está. O relatório de importação continua
-- citando cada caso, com o MESMO formato de aviso — o que muda é que o dado sobrevive
-- para alguém poder corrigi-lo na origem sabendo o que estava lá.
--
-- ── 🔴 O QUE ESTA MIGRATION CUSTA, dito por extenso ──────────────────────────────────
--
-- A garantia de formato cai para TODO caminho de escrita, não só para o importador:
-- PostgREST direto, Edge Function e script passam a poder gravar CPF, CEP, e-mail e raça
-- em qualquer forma. Isto foi levantado como risco alto antes da decisão e escolhido
-- assim mesmo, com o risco à vista: nesta tabela a origem é a autoridade sobre o dado do
-- cidadão, e o repo prefere guardar o que a origem afirma a guardar um vazio arrumado.
--
-- ⚠️ A consequência prática, para quem for escrever regra nova aqui: `candidatos` deixa
-- de ter opinião sobre o formato desses quatro campos. Quem precisar de CPF válido
-- (relatório, cruzamento com `colaboradores`) tem de validar na LEITURA — não pode
-- presumir, como podia até 29/07, que o que está na coluna passou por uma CHECK.
--
-- ── Os dois ALTER de tipo, que não são afrouxamento de regra e sim de TIPO ───────────
--
-- `raca smallint` e `data_nascimento date` não têm CHECK a remover: o valor cru
-- fisicamente não cabe neles. Uma `date` não guarda '31/02/1990' e uma `smallint` não
-- guarda 'Z'. Para o dado entrar como veio, os dois viram `text`.
--
-- Medido antes: nenhum índice, nenhuma coluna gerada e nenhuma policy referencia estas
-- duas colunas (os índices de `candidatos` são sobre edital/nome, cpf e a chave natural),
-- então o ALTER não arrasta dependência nenhuma.
--
-- ⚠️ O que se perde com `data_nascimento` text: ordenação e comparação por data no banco.
-- Hoje ninguém faz nenhuma das duas — `useCandidatos` ordena só por `nome` —, então o
-- custo é futuro, não presente. Quem for construir filtro por faixa etária vai precisar
-- de `to_date(...)` com o dado sujo dentro, e é justamente o dado sujo que motivou isto.
--
-- ── O que NÃO muda ───────────────────────────────────────────────────────────────────
--
-- As duas CHECKs de identidade continuam de pé, e a classe "erro" da importação também:
-- inscrição, nome e cargo vazios seguem DESCARTANDO a linha. Não é a mesma coisa que
-- dado inválido — uma linha sem inscrição não tem o que identificar, e a decisão de
-- 2026-07-30 é sobre o valor impossível, não sobre a linha sem identidade.
-- ─────────────────────────────────────────────────────────────────────────────────────

-- ── 1. As quatro CHECKs de formato saem ──────────────────────────────────────────────
ALTER TABLE public.candidatos
  DROP CONSTRAINT IF EXISTS chk_candidato_cpf_formato,
  DROP CONSTRAINT IF EXISTS chk_candidato_cep_formato,
  DROP CONSTRAINT IF EXISTS chk_candidato_email_formato,
  DROP CONSTRAINT IF EXISTS chk_candidato_raca_valida;

-- ── 2. Os dois tipos que não comportam o dado cru ────────────────────────────────────
-- O USING preserva o que já estiver gravado. `to_char` devolve NULL para NULL, e o
-- formato ISO é o mesmo que `parseDataBr` produz no cliente — então uma data que já era
-- válida continua com exatamente o mesmo texto que teria se fosse importada hoje.
ALTER TABLE public.candidatos
  ALTER COLUMN data_nascimento TYPE text USING to_char(data_nascimento, 'YYYY-MM-DD');

ALTER TABLE public.candidatos
  ALTER COLUMN raca TYPE text USING raca::text;

-- ── 3. Os comentários de coluna, que são onde alguém vai procurar ────────────────────
COMMENT ON COLUMN public.candidatos.cpf IS
  'O CPF COMO A ORIGEM AFIRMA. Sem CHECK de formato desde 2026-07-30: valor impossível '
  '(o arquivo real traz 8631309761, com 10 dígitos, e 1O778817709, com a letra O) é '
  'gravado cru e acusado no relatório de importação, em vez de virar NULL. NULL aqui '
  'significa célula VAZIA na planilha, não valor rejeitado. Quem precisar de CPF válido '
  'valida na leitura.';

COMMENT ON COLUMN public.candidatos.email IS
  'O e-mail COMO A ORIGEM AFIRMA. Sem CHECK de formato desde 2026-07-30 — o arquivo real '
  'traz andi.gmail, marcia2manoel@ gmail.com e dois endereços no mesmo campo. Gravado cru '
  'e acusado no relatório.';

COMMENT ON COLUMN public.candidatos.cep IS
  'O CEP COMO A ORIGEM AFIRMA. Sem CHECK de formato desde 2026-07-30. TEXT também por '
  'causa do zero à esquerda.';

COMMENT ON COLUMN public.candidatos.raca IS
  'TEXT desde 2026-07-30, não smallint: o código que a origem manda pode não ser código. '
  'Os valores conhecidos são os de RACA_MAP (src/lib/constants.ts): 1, 2, 4, 6, 8, 9 — o '
  'arquivo medido só usa o 2. Qualquer outra coisa é gravada como veio e acusada no '
  'relatório, então NÃO presuma que dá para converter para número.';

COMMENT ON COLUMN public.candidatos.data_nascimento IS
  'TEXT desde 2026-07-30, não date: data irreconhecível é gravada como veio e acusada no '
  'relatório, em vez de virar NULL. Quando a origem é reconhecível o formato é ISO '
  '(YYYY-MM-DD), o mesmo que parseDataBr produz — mas NÃO é garantido, então ordenar ou '
  'comparar por data exige converter, com o dado sujo dentro. Ano impossível (1193, '
  '1780, 2975 aparecem no arquivo real) sempre foi aceito e continua sendo: é a data que '
  'a pessoa digitou na inscrição.';
