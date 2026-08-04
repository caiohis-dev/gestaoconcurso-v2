-- Renumerar salas trocando dois números era IMPOSSÍVEL — e falhava pela metade.
--
-- `/gerenciar-salas-distribuidas` salvava o lote com um UPDATE por sala, em paralelo
-- (`Promise.all` em `useSalasDistribuidas.updateSalasMutation`). Trocar a sala 101 pela
-- 102 é a operação mais banal daquela tela e não tinha como dar certo: o índice único
-- `salas_prova_distribuidas_prova_unidade_numero_key` (migration 20260726220000) é
-- verificado A CADA LINHA, então uma das duas escritas encontrava a outra ainda no número
-- antigo e estourava 23505.
--
-- Três defeitos empilhados, e o terceiro é o que este repo mais teme:
--
--   1. a troca legítima era recusada;
--   2. a mensagem que chegava ao admin era `duplicate key value violates unique
--      constraint "salas_prova_distribuidas_prova_unidade_numero_key"` — jargão que não
--      diz o que fazer (a tradução está em `mensagemErroSalvarSalas`, no cliente);
--   3. **sem transação, a outra sala JÁ FOI**. O toast dizia "Erro ao salvar" e parte da
--      edição estava gravada. Perda silenciosa ao contrário: escrita silenciosa.
--
-- MEDIDO ANTES (banco local): **zero** duplicatas de
-- (prova_id, sala_fk_unidade, sala_numero). Nada a sanear.
--
-- ⚠️ A primeira medição deste tema disse "74 salas em 3 unidades" e estava lida de uma
-- base DERIVADA — o `db reset` seguinte devolveu **58 salas em 4 pares (prova, unidade)**,
-- que é o dump de verdade. Medir contra o banco local só vale se ele estiver recém-carregado.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ALTERNATIVA REJEITADA — e o motivo, para ninguém tentar de novo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A saída canônica para "trocar dois valores de uma chave única" é uma constraint
-- `DEFERRABLE`, checada no fim da transação. Cheguei a escrevê-la (DROP INDEX + ADD
-- CONSTRAINT ... DEFERRABLE INITIALLY IMMEDIATE) e **o `db reset` reprovou na hora**:
--
--     failed to send batch: ERROR: ON CONFLICT does not support deferrable unique
--     constraints/exclusion constraints as arbiters (SQLSTATE 55000)
--
-- O dump (`seed.local.sql`) insere TODA linha com `ON CONFLICT DO NOTHING` sem alvo
-- explícito, e nessa forma o Postgres considera todos os índices únicos como árbitros —
-- e recusa os deferráveis. Ou seja: tornar a chave deferrável quebra a carga do banco
-- local **e o bootstrap de produção**, que carrega o mesmo dump. Um grep em `src/` e
-- `supabase/migrations/` não pegaria isso; foi o reset que pegou.
--
-- Por isso a unicidade continua sendo um ÍNDICE ÚNICO comum, imediato para todo mundo. A
-- troca é resolvida DENTRO da transação da RPC, em dois passos.

-- ─────────────────────────────────────────────────────────────────────────────
-- O lote inteiro numa transação, com a renumeração em dois passos
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Mesma forma das RPCs de 20260726230000 (`vincular_unidade_a_prova`) e 20260726160000
-- (`revogar_coordenador`): corpo PL/pgSQL roda em transação, qualquer exceção desfaz o
-- que veio antes.
--
-- 🔴 OS DOIS PASSOS SÃO A REGRA, NÃO UM TRUQUE. O passo 1 tira os números das salas do
-- lote de circulação (valores NEGATIVOS, um por linha), e só o passo 2 grava os finais.
-- Assim nenhuma linha do lote esbarra numa irmã que ainda não se moveu, e a troca 101↔102
-- passa. Negativo é seguro porque número de sala em uso é sempre positivo (`sala_numero`
-- vem de andar×100 + sequência) e a tabela não tem CHECK de sinal — se alguém acrescentar
-- uma, ela precisa aceitar o negativo transitório ou este passo quebra.
--
-- O que continua sendo recusado, e deve continuar: colidir com uma sala de FORA do lote.
-- Aí o 23505 é legítimo — a pessoa está mandando duas salas para o mesmo número.
--
-- AUTORIZAÇÃO: `has_role(auth.uid(), 'admin')`, espelhando a policy de UPDATE da tabela
-- ("Admins can update salas_prova_distribuidas"). Não afrouxa nada — a função é SECURITY
-- DEFINER, então a RLS não roda, e a checagem explícita é o que a substitui. Via
-- `has_role` e nunca por SELECT literal em `user_roles`: a hierarquia superadmin ⇒ admin
-- mora dentro daquela função (20260725195530) e já bloqueou o superadmin três vezes aqui.
--
-- 🔴 O `RAISE` quando a contagem não bate NÃO é preciosismo. O cliente ignorava em
-- silêncio qualquer sala sem `id` (`if (!sala.id) return null`), e um id que não existe
-- mais no banco também sumia sem ruído: a pessoa via "Alterações salvas" e a edição não
-- estava lá. Numa transação, a alternativa a avisar é gravar um subconjunto e chamar de
-- sucesso.

CREATE OR REPLACE FUNCTION public.salvar_salas_distribuidas(p_salas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedidas integer;
  v_atualizadas integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar as salas distribuídas.';
  END IF;

  IF p_salas IS NULL OR jsonb_typeof(p_salas) <> 'array' THEN
    RAISE EXCEPTION 'A lista de salas não chegou no formato esperado.';
  END IF;

  SELECT count(*) INTO v_pedidas FROM jsonb_array_elements(p_salas);

  IF v_pedidas = 0 THEN
    RETURN 0;
  END IF;

  CREATE TEMP TABLE entrada_salas ON COMMIT DROP AS
  SELECT row_number() OVER () AS ord, *
    FROM jsonb_to_recordset(p_salas) AS x(
      id              uuid,
      sala_numero     integer,
      sala_capacidade integer,
      sala_descricao  text,
      sala_andar      integer,
      sala_fiscal_1   uuid,
      sala_fiscal_2   uuid
    );

  -- Passo 1: os números do lote saem de circulação. Sem isto, a linha que se move
  -- primeiro encontra a irmã ainda no número antigo — que é o defeito original.
  UPDATE salas_prova_distribuidas s
     SET sala_numero = -1 * e.ord
    FROM entrada_salas e
   WHERE s.id = e.id;

  -- Passo 2: grava o estado final, já sem ninguém ocupando os números de destino.
  WITH gravadas AS (
    UPDATE salas_prova_distribuidas s
       SET sala_numero     = e.sala_numero,
           sala_capacidade = e.sala_capacidade,
           sala_descricao  = e.sala_descricao,
           sala_andar      = e.sala_andar,
           sala_fiscal_1   = e.sala_fiscal_1,
           sala_fiscal_2   = e.sala_fiscal_2
      FROM entrada_salas e
     WHERE s.id = e.id
    RETURNING s.id
  )
  SELECT count(*) INTO v_atualizadas FROM gravadas;

  IF v_atualizadas <> v_pedidas THEN
    RAISE EXCEPTION
      'Nenhuma alteração foi salva: % de % salas não foram encontradas. Recarregue a página e tente de novo.',
      v_pedidas - v_atualizadas, v_pedidas;
  END IF;

  DROP TABLE entrada_salas;

  RETURN v_atualizadas;
END;
$function$;

COMMENT ON FUNCTION public.salvar_salas_distribuidas(jsonb) IS
  'Salva o lote de salas distribuidas em UMA transacao, renumerando em dois passos — e o que permite trocar o numero de duas salas. Recusa o lote inteiro se alguma sala nao for encontrada.';
