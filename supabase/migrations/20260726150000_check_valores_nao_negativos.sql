-- Piso zero para os dois números do caminho do dinheiro.
--
-- POR QUÊ
-- A migration 20260725202722 espelhou 17 regras do Zod no banco, mas cobriu FORMATOS
-- (CPF, e-mail, chave PIX, nome preenchido) e um piso de capacidade. Os dois números que
-- formam a base de pagamento ficaram de fora, e ficaram sem barreira em NENHUMA camada:
--
--   * `valores_funcao_prova.valor_pagamento` — o `ValoresFuncaoProvaDialog` tem `min="0"`
--     no input, mas isso só vale para a validação NATIVA do navegador, que exige submit
--     de <form>. O diálogo não tem form: o clique chama `handleAdd` direto, o
--     `parseFloat("-150")` devolve -150, e o valor negativo entrava na base de pagamento.
--     Achado ao escrever o teste de interação daquele diálogo, em 2026-07-26.
--
--   * `meta_colaboradores_unidade.quantidade_meta` — aqui o cliente PROTEGE
--     (`Math.max(0, …)` no handleChange do MetaColaboradoresDialog), então o furo é só
--     para chamada direta ao PostgREST. Entra junto porque é a mesma regra e a mesma
--     tabela de decisão: meta negativa não significa nada.
--
-- MEDIDO ANTES, como manda o método da migration anterior: no banco local (cópia de
-- produção) havia 24 linhas em `valores_funcao_prova` (mínimo 70) e 186 em
-- `meta_colaboradores_unidade` (mínimo 0). ZERO violações — nenhum saneamento de dado
-- necessário.
--
-- PISO, NÃO TETO — e o piso é `>= 0`, não `> 0`:
--   * `quantidade_meta = 0` é estado legítimo e usado: é como se ZERA uma meta. O
--     MetaColaboradoresDialog manda todas as funções no upsert, inclusive as com zero,
--     justamente para permitir isso.
--   * `valor_pagamento = 0` fica permitido de propósito: função voluntária ou não
--     remunerada é decisão de negócio, não erro de digitação. O que não se defende é
--     valor NEGATIVO, que só pode ser engano.
--
-- CONVENÇÃO: nome explícito (`chk_*`), como na migration anterior — nome gerado pelo
-- Postgres é impossível de referenciar depois.

ALTER TABLE public.valores_funcao_prova
  ADD CONSTRAINT chk_valor_pagamento_nao_negativo CHECK (valor_pagamento >= 0);

ALTER TABLE public.meta_colaboradores_unidade
  ADD CONSTRAINT chk_quantidade_meta_nao_negativa CHECK (quantidade_meta >= 0);
