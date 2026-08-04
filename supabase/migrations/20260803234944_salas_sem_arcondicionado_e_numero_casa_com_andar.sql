-- Salas do catálogo (`sala_prova`), 2026-08-03. Duas mudanças independentes, no mesmo
-- tema de `/salas-prova`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `sala_arcondicionado` sai: coluna morta.
-- ─────────────────────────────────────────────────────────────────────────────
-- Decisão do usuário ("é lixo, não existe mais"). Medido antes: as 52 salas do banco
-- local têm `false` — ninguém nunca marcou uma. A coluna também NUNCA existiu em
-- `salas_prova_distribuidas`, ou seja, o valor jamais chegava a uma prova; era um campo
-- que só alimentava um ícone na listagem do cadastro.
--
-- ⚠️ Ela também era um defeito ativo: o `editFormSchema` do `SalaProvaDialog` declarava
-- `sala_arcondicionado: z.boolean().default(false)` e o formulário NÃO exibia o campo —
-- então editar qualquer sala gravava `false` por cima do que estivesse lá, em silêncio.
--
-- 🔴 O dump (`supabase/seed.local.sql`) nomeia esta coluna nos 42 INSERT de `sala_prova`,
-- e ele carrega DEPOIS das migrations. O DROP e a edição do dump andam juntos: um sem o
-- outro quebra todo `db reset` (e o bootstrap de produção, que carrega o mesmo dump).
ALTER TABLE public.sala_prova DROP COLUMN sala_arcondicionado;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O número da sala passa a ter de casar com o andar.
-- ─────────────────────────────────────────────────────────────────────────────
-- O esquema `sala_numero = sala_andar × 100 + sequência` é a convenção do projeto inteiro
-- (é dela que sai "101 = andar 1, sala 1"), mas vivia só no cliente: `psql`, PostgREST
-- direto ou script gravavam qualquer número, e a EDIÇÃO de uma sala aceitava trocar o
-- número para 305 mantendo `sala_andar = 1` — a tabela passava a mostrar uma coisa e a
-- numeração a contar outra.
--
-- Medido antes de apertar, em 2026-08-03: **0 violações** em 52 salas do template e 68
-- distribuídas; nenhuma linha com sequência 0 (o `100`, o `200`); nenhum `sala_andar`
-- nulo. Entra sem saneamento.
--
-- `sala_andar IS NULL` continua aceito: a coluna é NULLABLE, há o caminho de apagar o
-- andar na edição, e sem andar não há o que conferir.
--
-- ⚠️ **Só em `sala_prova`, de propósito.** Em `salas_prova_distribuidas` a RPC
-- `salvar_salas_distribuidas` (2026-08-03) renumera em dois passos e grava um valor
-- transitório fora da faixa dentro da transação — é o que permite TROCAR o número de duas
-- salas sem afrouxar o índice único. Uma CHECK equivalente ali quebraria essa operação, e
-- nenhum valor transitório poderia satisfazê-la. No catálogo o caso não existe: nada
-- renumera em lote, e negativo não faz sentido nenhum aqui.
ALTER TABLE public.sala_prova
  ADD CONSTRAINT chk_sala_numero_casa_com_andar
  CHECK (
    sala_andar IS NULL
    OR (sala_numero / 100 = sala_andar AND sala_numero % 100 > 0)
  );

COMMENT ON CONSTRAINT chk_sala_numero_casa_com_andar ON public.sala_prova IS
  'sala_numero = sala_andar * 100 + sequencia (1..99). Ver lib/salas.ts (numerosDoLote).';
