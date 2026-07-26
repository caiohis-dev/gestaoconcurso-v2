-- A numeração de sala era calculada no cliente, sem unicidade no banco.
--
-- `useSalasProva.createMultipleMutation` lê o maior `sala_numero` do andar e insere
-- `max + 1`, `max + 2`, … É o padrão "leio e então gravo": duas sessões criando salas na
-- mesma unidade ao mesmo tempo leem o mesmo `max` e gravam os MESMOS números. Nada
-- acusava — `sala_prova` não tinha índice único nenhum além da PK.
--
-- Sala é identificada por número pela equipe em campo ("fiscal da 203"). Número repetido
-- na mesma unidade não é inconsistência abstrata: é gente indo para o lugar errado.
--
-- O UNIQUE não conserta a corrida — ele a torna VISÍVEL. Em vez de duas salas 203, a
-- segunda inserção falha com 23505, que o cliente traduz pedindo para tentar de novo.
-- Perder a inserção e avisar é melhor que aceitar as duas em silêncio.
--
-- MEDIDO ANTES (2026-07-26): 42 salas em `sala_prova` e 58 em `salas_prova_distribuidas`,
-- **0 duplicatas** nas duas. Dívida preventiva; nada a sanear.
--
-- `salas_prova_distribuidas` entra junto, com a chave incluindo `prova_id`: ela é a
-- CÓPIA das salas por prova, então o mesmo número existe legitimamente em provas
-- diferentes — o que não pode repetir é dentro da mesma prova e unidade. Era a única
-- tabela do schema com zero unique, zero check e zero trigger.

CREATE UNIQUE INDEX IF NOT EXISTS sala_prova_unidade_numero_key
  ON public.sala_prova (sala_fk_unidade, sala_numero);

CREATE UNIQUE INDEX IF NOT EXISTS salas_prova_distribuidas_prova_unidade_numero_key
  ON public.salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero);
