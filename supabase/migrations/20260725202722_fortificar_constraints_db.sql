-- Espelha no banco as regras de negócio que só existiam no Zod do frontend.
--
-- POR QUÊ
-- As validações ricas vivem em `react-hook-form` + Zod, e uma chamada direta ao
-- PostgREST as ignora inteiras. Exemplo real do que era aceito antes desta migration:
-- `unid_andares = -5`, `unid_nome = '   '`, e — o pior — um CPF com letras, porque o
-- Zod usa `.length(11)`, que conta CARACTERES, e a coluna é `CHAR(11)`. Nenhuma das
-- duas camadas exigia dígito.
--
-- MÉTODO (etapa 1 do roadmap-db-constraints.yaml)
-- Cada regra abaixo foi medida contra os dados reais antes de virar constraint. O mapa
-- completo, com a contagem por regra, está em analises/db-constraints-mapeamento.md.
-- Todas as 17 tinham ZERO violações no momento da escrita — exceto `colab_email`, que
-- tinha 24 e exigiu saneamento prévio no dump (ver o bloco sobre e-mail, no fim).
--
-- O QUE NÃO ESTÁ AQUI, DE PROPÓSITO
--   * Teto de `sala_andar`: o Zod limita ao `unid_andares` da unidade DAQUELA sala —
--     regra entre tabelas, que CHECK não expressa. Um CHECK com função consultando
--     outra tabela seria pior: o Postgres aceita, mas NÃO reavalia quando a outra
--     tabela muda, e a constraint passa a mentir. Fica no frontend, ou vira trigger.
--   * Dígito verificador de CPF: é algoritmo, não formato. Outro escopo.
--   * Teto de 99 andares (`unid_andares <= 99`): decisão do usuário em 2026-07-25 —
--     entra só o piso. O teto é número redondo de formulário, não limite de prédio, e
--     barraria um cadastro legítimo no dia da prova se um dia houver unidade maior.
--
-- CONVENÇÃO: toda constraint tem nome explícito (`chk_*`). Nome gerado pelo Postgres
-- é impossível de referenciar depois.

-- ─────────────────────────────────────────────────────────────────────────────
-- unidades_prova
-- ─────────────────────────────────────────────────────────────────────────────
-- `unid_sigla` é CHAR(10): o Postgres preenche com espaços até 10, então
-- `length(unid_sigla)` é SEMPRE 10 e não diz nada. Só `length(trim(...))` informa.
-- O mesmo vale para `prova_edital` (CHAR(30)) mais abaixo.
ALTER TABLE public.unidades_prova
  ADD CONSTRAINT chk_unid_nome_preenchido   CHECK (length(trim(unid_nome))  > 0),
  ADD CONSTRAINT chk_unid_sigla_preenchida  CHECK (length(trim(unid_sigla)) > 0),
  ADD CONSTRAINT chk_unid_andares_min       CHECK (unid_andares >= 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- sala_prova
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sala_prova
  ADD CONSTRAINT chk_sala_capacidade_positiva CHECK (sala_capacidade > 0),
  ADD CONSTRAINT chk_sala_numero_positivo     CHECK (sala_numero > 0),
  -- `sala_andar` é opcional; quando informado, é piso 1 ou acima. O teto fica de fora
  -- (ver cabeçalho).
  ADD CONSTRAINT chk_sala_andar_min           CHECK (sala_andar IS NULL OR sala_andar >= 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- provas
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.provas
  ADD CONSTRAINT chk_prova_edital_preenchido     CHECK (length(trim(prova_edital)) > 0),
  ADD CONSTRAINT chk_prova_n_candidatos_positivo CHECK (prova_n_candidatos IS NULL OR prova_n_candidatos > 0),
  -- Aqui o banco fica MAIS RÍGIDO que o formulário, por decisão do usuário: o Zod
  -- declara os horários como `z.string().optional()` e não confere formato NEM ordem,
  -- então hoje é possível salvar uma prova que termina antes de começar. O tipo `time`
  -- já barra o formato; esta constraint barra a ordem. Só se aplica quando os dois
  -- existem — cada um é opcional por conta própria.
  ADD CONSTRAINT chk_prova_horario_ordem         CHECK (
    prova_hora_inicio IS NULL
    OR prova_hora_final IS NULL
    OR prova_hora_final > prova_hora_inicio
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- editais
-- ─────────────────────────────────────────────────────────────────────────────
-- `nome` é TEXT sem limite superior — nem no banco nem no Zod. Só o piso entra.
ALTER TABLE public.editais
  ADD CONSTRAINT chk_edital_nome_preenchido       CHECK (length(trim(nome)) > 0),
  ADD CONSTRAINT chk_edital_n_candidatos_positivo CHECK (n_candidatos IS NULL OR n_candidatos > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- funcoes_colaboradores
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.funcoes_colaboradores
  ADD CONSTRAINT chk_cargo_nome_preenchido CHECK (length(trim(cargo_nome)) > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- colaboradores
-- ─────────────────────────────────────────────────────────────────────────────
-- Os campos bancários (codigo_banco, agencia, agencia_dv, conta, conta_dv,
-- tipo_conta) e `tipo_chave_pix` JÁ tinham CHECK de trabalho anterior — não são
-- tocados aqui.
ALTER TABLE public.colaboradores
  ADD CONSTRAINT chk_colab_nome_preenchido        CHECK (length(trim(colab_nome_completo)) > 0),
  -- O achado central do tema: `.length(11)` do Zod aceita 11 caracteres QUAISQUER
  -- ('abcdefghijk' passava), e CHAR(11) também. Nenhuma camada exigia dígito.
  ADD CONSTRAINT chk_colab_cpf_numerico           CHECK (colab_cpf ~ '^[0-9]{11}$'),
  ADD CONSTRAINT chk_colab_telefone_positivo      CHECK (colab_telefone IS NULL OR colab_telefone > 0),
  ADD CONSTRAINT chk_colab_numero_casa_nao_negativo CHECK (colab_numero_casa IS NULL OR colab_numero_casa >= 0);

-- E-mail: ausência é NULL, nunca string vazia.
--
-- Verificado antes de apertar: são 254 NULLs e ZERO strings vazias, e a RPC
-- `update_meu_colaborador` já grava `NULLIF(p_email, '')` — nenhum caminho de código
-- produz `''`. Por isso a constraint pode ser estrita sem quebrar fluxo existente.
--
-- ⚠️ ESTA CONSTRAINT EXIGIU SANEAMENTO DE DADO, e o saneamento teve de acontecer NO
-- DUMP (`seed.local.sql`), não aqui e não no `seed.pos.sql`. O motivo é a ordem do
-- `db reset`: migrations rodam ANTES da carga do dump, então a constraint já existe
-- quando o INSERT sujo chega — corrigir depois, no seed.pos.sql, chegaria tarde e o
-- reset quebraria. Some-se a isso que o seed.pos.sql é versionado e não pode conter
-- PII. Detalhe da correção (22 e-mails com espaço nas pontas, 1 typo de domínio, 1
-- valor sem '@' anulado) em transversais/desenvolvimento-local.md — é a TERCEIRA
-- correção manual que o dump carrega, e um dump novo precisa recebê-la de novo.
--
-- A regex é deliberadamente frouxa (algo@algo.algo, sem espaços): validar e-mail por
-- expressão regular "de verdade" é um poço sem fundo, e o objetivo aqui é barrar o
-- absurdo — não recusar endereço exótico porém válido.
ALTER TABLE public.colaboradores
  ADD CONSTRAINT chk_colab_email_formato CHECK (
    colab_email IS NULL
    OR colab_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  );
