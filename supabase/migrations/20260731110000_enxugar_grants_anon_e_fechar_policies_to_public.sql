-- Enxuga os privilégios de tabela de `anon`/`authenticated` em `public` e fecha as
-- policies que estavam abertas a `anon` sem que ninguém tivesse percebido.
--
-- ============================================================================
-- A PREMISSA DO BACKLOG ESTAVA ERRADA — é o que motiva a segunda metade daqui
-- ============================================================================
-- O item "Enxugar os grants de tabela" dizia: «hoje só a RLS impede o estrago:
-- `anon` não tem policy, então SELECT/INSERT/UPDATE/DELETE caem em default deny.
-- Mas `TRUNCATE` não passa por RLS».
--
-- A primeira metade é FALSA. As 46 policies de `public` foram criadas `TO public`,
-- e no Postgres o papel `public` INCLUI `anon`. Oito delas ainda usavam
-- `USING (true)`, apesar de se chamarem "Authenticated users can view ...":
--
--   bancos · coordenadores_prova · editais · funcoes_colaboradores
--   prova_edit_locks · prova_unidades · provas · sala_prova
--
-- Medido em 2026-07-31 contra o PostgREST local, com a anon key e SEM login:
-- as sete primeiras devolviam DADO REAL (`prova_edit_locks` devolveu `[]` só
-- porque está vazia — a policy dela é igualmente permissiva).
--
-- O que NÃO vazava, e é o que salvou o pior: `candidatos`, `colaboradores` e
-- `user_roles` recusavam, porque as policies delas checam `has_role(auth.uid(), ...)`
-- e `auth.uid()` é nulo para `anon`. Nenhuma policy de INSERT/UPDATE/DELETE é
-- permissiva — um POST anônimo em `editais` recusa com 42501. Era vazamento de
-- LEITURA, não de escrita.
--
-- ============================================================================
-- POR QUE `anon` PODE PERDER TUDO
-- ============================================================================
-- Verificado antes de revogar: NENHUM fluxo público lê tabela com a anon key.
-- `/cadastro-publico` fala só com Edge Function (que usa `service_role`), e as
-- páginas alcançáveis deslogado (`/`, `/auth`, `/redefinir-senha`, `NotFound`)
-- não têm `.from(...)`, `.rpc(...)` nem `invoke(...)` sobre tabela. `useBancos` —
-- a única leitura de uma tabela cujo nome sugere ser pública — é consumida apenas
-- pelo `ColaboradorDialog` e pelo `PerfilColaborador`, ambos autenticados. E
-- `useAuth.fetchUserRoles(userId)` recebe um id, ou seja, só roda com sessão.

-- ----------------------------------------------------------------------------
-- 1. `anon` não precisa de acesso a tabela nenhuma de `public`
-- ----------------------------------------------------------------------------
-- Isto inclui o TRUNCATE que abriu o item: `TRUNCATE` não passa por RLS, então
-- em `candidatos` — que guarda CPF, e-mail, telefone e endereço de milhares de
-- cidadãos — o que impedia o esvaziamento era o PostgREST não expor o verbo, ou
-- seja, um detalhe de implementação de terceiro. Agora o privilégio não existe.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- ----------------------------------------------------------------------------
-- 2. `authenticated` mantém o DML (quem decide é a RLS) e perde o resto
-- ----------------------------------------------------------------------------
-- TRUNCATE não passa por RLS; REFERENCES e TRIGGER são privilégios de DDL que
-- cliente de API não tem por que exercer.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

-- ----------------------------------------------------------------------------
-- 3. Tabela NOVA para de nascer com eles
-- ----------------------------------------------------------------------------
-- Sem isto a revogação acima é temporária: a migration `20260712010000` deixou um
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated`, e é
-- ele que faz cada tabela criada por migration futura renascer com o pacote
-- completo. É a razão de `candidatos` ter nascido com TRUNCATE para `anon`.
--
-- Não brigamos com aquela migration: ela existe porque, sem GRANT de DML, o
-- PostgREST devolve 42501 ANTES de avaliar a RLS e o login "funciona" sem sair da
-- tela. O DML de `authenticated` continua concedido por ela; aqui só se tira o que
-- nunca foi preciso.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- ----------------------------------------------------------------------------
-- 4. As policies deixam de alcançar `anon`
-- ----------------------------------------------------------------------------
-- O passo 1 já basta para fechar o vazamento (sem GRANT de SELECT não se lê nada,
-- policy nenhuma salva). Isto aqui é a segunda camada, e é a que sobrevive a
-- alguém reconceder um GRANT no futuro: com `TO authenticated`, uma policy
-- `USING (true)` escrita por engano não alcança mais quem não fez login.
--
-- Vão TODAS as 46, não só as 8 permissivas. As outras 38 já eram inofensivas para
-- `anon` (checam `has_role(auth.uid(), ...)`, e `auth.uid()` é nulo sem sessão),
-- mas deixá-las `TO public` mantém a armadilha de pé: a próxima policy copiada de
-- uma vizinha herda o `TO public`, e basta o `USING` ser `true` para reabrir o
-- buraco. O modo de falhar passa a ser "ninguém vê" em vez de "todo mundo vê".
--
-- É seguro para carga de dados: `postgres` e `service_role` têm BYPASSRLS
-- (conferido em 31/07), então seed, dump e Edge Function não passam por policy.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text[] = ARRAY['public']
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO authenticated',
      p.policyname, p.schemaname, p.tablename
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 5. Duas policies mentiam no nome, e o nome é o que a próxima pessoa lê
-- ----------------------------------------------------------------------------
-- "Authenticated users can view ..." descrevia o que o autor quis, não o que a
-- policy fazia. Agora descreve — mas `bancos` merece registro à parte, porque o
-- nome dela afirmava uma intenção de fato pública.
COMMENT ON TABLE public.bancos IS
  'Lista de bancos para os campos de conta do colaborador. A policy chamava-se '
  '"Bancos são visíveis publicamente" e era, de fato, legível sem login. Passou a '
  'exigir sessão em 31/07: o único consumidor (useBancos) é usado por '
  'ColaboradorDialog e PerfilColaborador, ambos autenticados. Se algum dia uma '
  'tela pública precisar da lista, o caminho é uma Edge Function, não reabrir anon.';
