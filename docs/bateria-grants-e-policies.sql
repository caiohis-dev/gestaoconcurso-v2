-- Bateria: privilégios de tabela de `anon`/`authenticated` e alcance das policies
-- Migration coberta: 20260731110000_enxugar_grants_anon_e_fechar_policies_to_public.sql
-- Escrita em 2026-07-31, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-grants-e-policies.sql
--
-- ⚠️ PRÉ-CONDIÇÃO: nenhuma. Roda em qualquer estado do banco — não depende de
-- fixture nem de dado carregado. Tudo que cria, cria dentro da transação.
--
-- ⚠️ O QUE ESTA BATERIA **NÃO** ALCANÇA, e por que ela não basta sozinha:
-- ela fala com o Postgres direto, e o vazamento que motivou a migration acontecia
-- pelo **PostgREST**. Os casos 1 e 2 provam o privilégio; provar que a API recusa
-- exige a bateria de curl no fim do arquivo, que é MANUAL. Rode as duas.

\set ON_ERROR_STOP off
BEGIN;

-- ============================================================================
-- CASO 1 — `anon` não tem privilégio nenhum em `public`
-- ============================================================================
-- Esperado: zero linhas.
SELECT 'CASO 1' AS caso,
       CASE WHEN count(*) = 0 THEN 'OK — anon sem grants'
            ELSE 'FALHOU — anon ainda tem ' || count(*) || ' grants' END AS resultado
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon';

-- ============================================================================
-- CASO 2 — `authenticated` mantém só o DML
-- ============================================================================
-- Esperado: SELECT/INSERT/UPDATE/DELETE e mais nada. TRUNCATE não passa por RLS;
-- REFERENCES e TRIGGER são DDL, que cliente de API não exerce.
SELECT 'CASO 2' AS caso,
       CASE WHEN count(*) = 0 THEN 'OK — sem TRUNCATE/REFERENCES/TRIGGER'
            ELSE 'FALHOU — ' || string_agg(DISTINCT privilege_type, ',') END AS resultado
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'authenticated'
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');

-- ============================================================================
-- CASO 3 — o TRUNCATE que abriu o item do backlog
-- ============================================================================
-- `TRUNCATE` NÃO passa por RLS. Enquanto o GRANT existiu, o que impedia esvaziar
-- `candidatos` — CPF, e-mail, telefone e endereço de milhares de pessoas — era o
-- PostgREST não expor o verbo, ou seja, um detalhe de terceiro.
SET LOCAL ROLE anon;
DO $$ BEGIN
  TRUNCATE public.candidatos;
  RAISE NOTICE 'CASO 3: FALHOU -- anon truncou candidatos';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'CASO 3: OK -- anon recusado no TRUNCATE';
END $$;
RESET ROLE;

-- ============================================================================
-- CASO 4 — nenhuma policy de `public` alcança mais `anon`
-- ============================================================================
-- As 46 nasceram `TO public`, e `public` INCLUI `anon`. Oito ainda tinham
-- `USING (true)` apesar de se chamarem "Authenticated users can view ...".
-- Esperado: zero.
SELECT 'CASO 4' AS caso,
       CASE WHEN count(*) = 0 THEN 'OK — nenhuma policy TO public'
            ELSE 'FALHOU — ' || count(*) || ' policies ainda TO public' END AS resultado
FROM pg_policies
WHERE schemaname = 'public' AND roles::text[] = ARRAY['public'];

-- ============================================================================
-- CASO 5 — 🔴 O MAIS IMPORTANTE: tabela NOVA nasce enxuta
-- ============================================================================
-- Sem o `ALTER DEFAULT PRIVILEGES`, os casos 1 e 2 são temporários: a migration
-- `20260712010000` concedia ALL por default, e é por isso que `candidatos` nasceu
-- com TRUNCATE para `anon`. Quem revogar tabela a tabela e esquecer isto vê a
-- bateria verde hoje e o buraco de volta na próxima tabela criada.
CREATE TABLE public.zz_bateria_grants (id int);

SELECT 'CASO 5a' AS caso,
       CASE WHEN count(*) = 0 THEN 'OK — tabela nova sem grants de anon'
            ELSE 'FALHOU — anon nasceu com ' || string_agg(privilege_type, ',') END AS resultado
FROM information_schema.role_table_grants
WHERE table_name = 'zz_bateria_grants' AND grantee = 'anon';

SELECT 'CASO 5b' AS caso,
       CASE WHEN count(*) = 0 THEN 'OK — tabela nova sem TRUNCATE/REFERENCES/TRIGGER'
            ELSE 'FALHOU — ' || string_agg(privilege_type, ',') END AS resultado
FROM information_schema.role_table_grants
WHERE table_name = 'zz_bateria_grants' AND grantee = 'authenticated'
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');

-- CONTROLE POSITIVO: provar que a tabela nova continua USÁVEL pela API.
-- Sem isto, "sem grants" poderia significar que quebramos o acesso de todo mundo
-- — que é exatamente o bug que a migration 20260712010000 existiu para consertar
-- (PostgREST devolve 42501 ANTES da RLS, e o login trava sem erro na tela).
SELECT 'CASO 5c (CP)' AS caso,
       CASE WHEN string_agg(privilege_type, ',' ORDER BY privilege_type)
                 = 'DELETE,INSERT,SELECT,UPDATE'
            THEN 'OK — authenticated nasce com o DML completo'
            ELSE 'FALHOU — ' || coalesce(string_agg(privilege_type, ','), '(nenhum)') END AS resultado
FROM information_schema.role_table_grants
WHERE table_name = 'zz_bateria_grants' AND grantee = 'authenticated';

ROLLBACK;

-- ============================================================================
-- A PARTE MANUAL — é ela que fala pelo caminho real
-- ============================================================================
-- O Postgres acima prova o privilégio; só o PostgREST prova o que o mundo vê.
-- Pegue a chave em `npx supabase status` (PUBLISHABLE_KEY).
--
--   ANON="sb_publishable_..."
--   for t in editais provas bancos funcoes_colaboradores prova_unidades \
--            sala_prova coordenadores_prova prova_edit_locks candidatos; do
--     printf "%-24s " "$t"
--     curl -s "http://127.0.0.1:54321/rest/v1/$t?select=*&limit=1" -H "apikey: $ANON"
--     echo
--   done
--
-- Esperado em TODAS: {"code":"42501", ...}. Antes de 31/07 as sete primeiras
-- devolviam dado real sem login (`prova_edit_locks` devolvia `[]` só por estar
-- vazia — a policy dela era igualmente permissiva).
--
-- 🔴 CONTROLE POSITIVO, e não pule: repita com um JWT de `authenticated` e as
-- leituras têm de VOLTAR. "Ninguém lê" é metade da prova; a outra metade é que
-- quem deve ler continua lendo. Para forjar o JWT (o dump traz hashes de produção
-- e ninguém sabe as senhas), assine com o JWT_SECRET do `npx supabase status`:
--
--   node -e '
--     const c=require("crypto"), S="super-secret-jwt-token-with-at-least-32-characters-long";
--     const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
--     const h=b({alg:"HS256",typ:"JWT"});
--     const p=b({sub:process.argv[1],role:"authenticated",aud:"authenticated",
--                iss:"supabase",exp:Math.floor(Date.now()/1e3)+3600});
--     console.log(`${h}.${p}.`+c.createHmac("sha256",S).update(`${h}.${p}`).digest("base64url"));
--   ' <UUID_DE_UM_ADMIN>
--
-- O UUID sai de: select user_id from public.user_roles where role='admin' limit 1;
-- Verificado assim em 2026-07-31: anon 42501 em 9 tabelas; admin lê editais,
-- provas e bancos normalmente.
