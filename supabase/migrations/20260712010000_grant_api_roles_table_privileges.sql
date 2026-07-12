-- Concede a `anon`, `authenticated` e `service_role` os privilégios de tabela em
-- `public` que a API precisa. Corrige um drift silencioso entre produção e as
-- migrations, que quebrava por completo qualquer banco criado do zero.
--
-- O QUE ESTAVA ACONTECENDO
-- Em produção o schema foi criado pelo dashboard do Lovable/Supabase, cujo DDL roda
-- como `supabase_admin`. O default privilege de `supabase_admin` em `public` concede
-- DML completo (SELECT/INSERT/UPDATE/DELETE) a anon/authenticated/service_role, então
-- as tabelas nasceram acessíveis lá — mas esses GRANTs nunca foram registrados em
-- nenhuma migration.
--
-- Localmente, `supabase db reset` aplica as migrations como `postgres`, e o default
-- privilege de `postgres` concede apenas TRUNCATE/REFERENCES/TRIGGER — nada de DML.
-- Mesmas migrations, resultado diferente: 15 das 18 tabelas nasciam sem acesso pela
-- API. (As 3 exceções — bancos, email_atualizacao_log, ocorrencias_colaborador — são
-- justamente as que receberam um GRANT explícito em alguma migration.)
--
-- O sintoma era traiçoeiro: o PostgREST devolvia 42501 (permission denied) ANTES de
-- avaliar a RLS, então `useAuth.fetchUserRole` voltava vazio, `role` ficava `null`, e
-- `AuthAdmin` — que só navega quando `user && role !== null` — parava sem erro nenhum
-- na tela. Login "bem-sucedido" que não sai do lugar.
--
-- SEGURANÇA
-- Isto não expõe dado algum. A RLS está ATIVA nas 18 tabelas de `public`, todas com
-- policies. O GRANT apenas permite que o PostgREST chegue a avaliar a policy; quem
-- decide o que cada role enxerga continua sendo a RLS. É o modelo padrão do Supabase.
--
-- Em produção esta migration é um no-op: os grants já existem lá.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- Sem isto, toda tabela criada por uma migration FUTURA (que roda como `postgres`)
-- reintroduz exatamente o mesmo bug, e de novo só se descobre em dev local.
-- Não há sequences em `public` (todas as PKs são uuid), por isso só TABLES aqui.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
