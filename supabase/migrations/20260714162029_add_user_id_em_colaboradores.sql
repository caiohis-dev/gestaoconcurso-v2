-- Cria o elo entre `colaboradores` e `auth.users`, que hoje não existe: o único
-- vínculo entre as duas tabelas é a coincidência de texto do e-mail. É esta coluna que
-- permite ao auth.uid() ancorar RLS e RPCs nas etapas seguintes da refatoração
-- (my_rules/analises/roadmap-auth-colaborador.md).
--
-- NULA POR PADRÃO, E ASSIM FICA
-- A premissa não é "todo colaborador vira usuário", e sim "todo colaborador PODE virar
-- usuário", por auto-cadastro. Quem nunca se cadastrar segue existindo normalmente
-- como linha de dados, com user_id NULL — hoje, isso é a base inteira (771 linhas).
--
-- UNIQUE
-- Impede que uma mesma pessoa acabe dona de dois registros de colaborador — risco real,
-- porque a base tinha e-mails repetidos entre pares de colaboradores. Em Postgres,
-- UNIQUE admite múltiplos NULLs, que é exatamente o que precisamos: no máximo um
-- vínculo, nenhum obrigatório. Junto com a regra "só reivindica quem está com user_id
-- NULL", é o que impede a reivindicação de ser uma operação repetível.
--
-- ON DELETE SET NULL
-- Apagar a conta de acesso NÃO pode apagar a pessoa: a linha de `colaboradores` é o
-- cadastro funcional (dados bancários, alocações, histórico de provas) e precisa
-- sobreviver ao fim do usuário. CASCADE aqui destruiria folha de pagamento; RESTRICT
-- travaria a exclusão de usuários no dashboard. Com SET NULL, o registro apenas volta
-- a ficar não-vinculado — e, portanto, reivindicável de novo.

ALTER TABLE public.colaboradores
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.colaboradores
  ADD CONSTRAINT colaboradores_user_id_key UNIQUE (user_id);

COMMENT ON COLUMN public.colaboradores.user_id IS
  'Usuário do Supabase Auth que reivindicou este cadastro. NULL enquanto ninguém reivindicou; a reivindicação só é permitida quando NULL.';
