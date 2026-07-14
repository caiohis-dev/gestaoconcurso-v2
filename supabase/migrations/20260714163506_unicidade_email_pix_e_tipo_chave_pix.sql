-- Unicidade de `colab_email` e `colab_chave_pix`, e a coluna `tipo_chave_pix`.
--
-- POR QUE ÍNDICE FUNCIONAL, E NÃO `UNIQUE (coluna)`
-- Um UNIQUE comum é case-sensitive e sensível a espaço. Ele deixaria conviver
-- 'Joao@x.com' e 'joao@x.com' — que o Supabase Auth trata como o MESMO usuário, o que
-- reabriria exatamente o problema que a limpeza dos e-mails duplicados fechou (a
-- reivindicação de cadastro usa o e-mail como prova de identidade; ver
-- my_rules/analises/roadmap-auth-colaborador.md). Indexando lower(trim(...)), a
-- comparação normaliza na hora, sem precisar reescrever os dados: hoje há 12 e-mails
-- gravados com maiúscula e 22 com espaço em volta, e eles continuam como estão.
--
-- MÚLTIPLOS NULOS CONTINUAM PERMITIDOS
-- lower(trim(NULL)) é NULL, e o Postgres não considera NULLs iguais entre si num índice
-- único. Os 254 colaboradores sem e-mail e os 206 sem chave PIX seguem convivendo. Não
-- há string vazia na base, e não pode haver: todos os caminhos de escrita convertem ''
-- em NULL (ColaboradorDialog e public-create-colaborador no código; a RPC
-- update_colaborador_data_full via NULLIF). Se algum caminho novo gravar '', duas linhas
-- vazias colidirão aqui — converta para NULL na origem, não afrouxe este índice.
--
-- O QUE ESTE ÍNDICE *NÃO* RESOLVE (dívida consciente)
-- A mesma chave PIX escrita em formatos diferentes ainda passa: '127.139.687-47' e
-- '12713968747' são a mesma chave para o banco central e valores distintos para cá. Das
-- 565 chaves preenchidas, 94 estão em formatos mistos (CPF pontuado, telefone com
-- parênteses) e uma tem 21 dígitos — não é chave válida de tipo nenhum. Normalizar isso
-- é mexer em dado bancário de 565 pessoas e ficou deliberadamente de fora.

CREATE UNIQUE INDEX colaboradores_colab_email_key
  ON public.colaboradores (lower(trim(colab_email)));

CREATE UNIQUE INDEX colaboradores_colab_chave_pix_key
  ON public.colaboradores (lower(trim(colab_chave_pix)));

-- `tipo_chave_pix`: os 5 tipos de chave do arranjo PIX (BACEN). Texto minúsculo validado
-- por CHECK, no mesmo formato que `tipo_conta` ('corrente'/'poupanca') já usa nesta
-- tabela — legível direto em query, sem depender de um mapa no frontend.
--
-- ANULÁVEL, E NASCE NULA NAS 771 LINHAS
-- Não há como inferir o tipo com segurança a partir do que está gravado: 397 chaves têm
-- 11 dígitos, e 11 dígitos é ao mesmo tempo o formato de CPF e o de celular com DDD.
-- (Cruzando com os dados da própria pessoa: 193 batem com o CPF dela, 188 com o telefone
-- dela — e o resto não bate com nenhum dos dois.) Adivinhar o tipo errado de uma chave
-- PIX é errar o destino de um pagamento, então a coluna começa vazia e é preenchida
-- quando alguém confirmar o tipo — não por heurística.
--
-- Não há CHECK amarrando `tipo_chave_pix` a `colab_chave_pix` (do tipo "se tem chave,
-- tem tipo"): isso invalidaria de imediato as 565 linhas que já têm chave e não têm
-- tipo. Enquanto a base não estiver preenchida, essa amarração não pode existir.

ALTER TABLE public.colaboradores
  ADD COLUMN tipo_chave_pix text
  CHECK (tipo_chave_pix IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'));

COMMENT ON COLUMN public.colaboradores.tipo_chave_pix IS
  'Tipo da chave em colab_chave_pix: cpf | cnpj | email | telefone | aleatoria. NULL enquanto não confirmado — o tipo não é inferível do valor (CPF e celular têm 11 dígitos).';
