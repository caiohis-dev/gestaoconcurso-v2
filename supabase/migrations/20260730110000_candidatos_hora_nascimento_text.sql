-- ─────────────────────────────────────────────────────────────────────────────────────
-- `hora_nascimento` vira TEXT: hora irreconhecível entra como veio
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Continuação direta da 20260730100000, e pela mesma decisão do usuário: dado inválido
-- entra e é citado no relatório. Este campo tinha ficado de fora, e o motivo de entrar
-- agora é o que a medição mostrou.
--
-- ── 🔴 O buraco que a medição achou ──────────────────────────────────────────────────
--
-- Medido no arquivo real (7.416 linhas) em 2026-07-30: `HORA_NASCIMENTO` está preenchida
-- em 3.089 linhas, e o `parseHora` do cliente reconhece 3.087 delas. As 2 que sobram são
-- '88888888' e 'Não sei'.
--
-- ⚠️ Essas 2 viravam NULL **SEM AVISO NENHUM** — este campo nunca teve aviso, ao
-- contrário do CPF e do e-mail. Era a mesma perda silenciosa corrigida ontem no CPF, só
-- que sem nem o relatório para denunciá-la. É a segunda vez que o padrão aparece.
--
-- ── Por que TEXT, e não um formato mais permissivo ───────────────────────────────────
--
-- Não há formato a acrescentar: '88888888' e 'Não sei' não são hora nenhuma. Alargar o
-- `parseHora` não as alcançaria. Como a decisão de 30/07 é que o dado impossível ENTRA, a
-- coluna precisa comportá-lo — e uma `time` não guarda 'Não sei', igual a uma `date` não
-- guardava '31/02/1990'.
--
-- Alternativa DESCARTADA pelo usuário: manter `time` e só acrescentar o aviso. Fecharia a
-- perda silenciosa, mas faria de `hora_nascimento` o único campo em que "inválido" ainda
-- significa anular — uma exceção à regra, e exceção é o que ninguém lembra depois.
--
-- ⚠️ O que se perde: comparação e ordenação por hora no banco. Hoje ninguém faz nenhuma
-- das duas. ⚠️ MAS ESTE CAMPO É DIFERENTE DOS OUTROS: hora de nascimento é **critério
-- legal de desempate em concurso**. Se um dia o desempate for calculado por SQL, vai
-- precisar converter com o dado sujo dentro — e o dado sujo é justamente o que motivou
-- isto. Quem for implementar desempate: leia este parágrafo antes.
--
-- Medido antes: nenhum índice, coluna gerada ou policy referencia `hora_nascimento`.
-- ─────────────────────────────────────────────────────────────────────────────────────

-- O USING preserva o que já estiver gravado. 'HH24:MI:SS' é exatamente o formato que
-- `parseHora` produz no cliente, então uma hora que já era válida continua com o mesmo
-- texto que teria se fosse importada hoje.
ALTER TABLE public.candidatos
  ALTER COLUMN hora_nascimento TYPE text USING to_char(hora_nascimento, 'HH24:MI:SS');

COMMENT ON COLUMN public.candidatos.hora_nascimento IS
  'TEXT desde 2026-07-30, não time: hora irreconhecível é gravada como veio e acusada no '
  'relatório de importação, em vez de virar NULL. Quando a origem é reconhecível o '
  'formato é HH:MM:SS, o mesmo que parseHora produz — mas NÃO é garantido. '
  '⚠️ Hora de nascimento é critério legal de desempate em concurso: quem for calcular '
  'desempate por SQL precisa converter, e precisa decidir o que fazer com o valor sujo.';
