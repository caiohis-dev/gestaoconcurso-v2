-- Fecha o alcance do `anon` às funções de `public` por RPC.
--
-- É a continuação direta da `20260731110000_enxugar_grants_anon_e_fechar_policies_to_public.sql`,
-- que zerou os grants de TABELA do `anon` e converteu 46 policies `{public}` para
-- `authenticated`. Ela não cobriu FUNÇÃO — e função era o buraco que sobrou.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE FOI MEDIDO (2026-09-08, contra o banco local, que reproduz produção)
-- ─────────────────────────────────────────────────────────────────────────────
-- Dois fatos que se somam:
--   1. `anon` tem `GRANT USAGE ON SCHEMA public` (20260712010000) — nunca revogado.
--   2. O Postgres concede `EXECUTE` a `PUBLIC` (que INCLUI `anon`) em TODA função criada,
--      e os revokes deste repo eram caso a caso.
--
-- Resultado medido: das 53 funções de `public`, **38** eram executáveis por `anon`; tirando
-- as 14 de trigger (que o PostgREST não expõe), sobravam **24 chamáveis por RPC** com a
-- chave publishable — que é PÚBLICA, vai no bundle do frontend.
--
-- As `SECURITY INVOKER` estavam protegidas pelos grants de tabela (a 20260731110000 fez seu
-- trabalho): `contar_candidatos_por_edital` respondia `permission denied for table candidatos`.
-- 🔴 **O problema eram as 20 `SECURITY DEFINER`, que rodam como o dono e IGNORAM esse revoke.**
--
-- Confirmado por HTTP com a anon key, não por leitura:
--   · `finalizar_prova` distingue `P0001` (prova não existe) de `P0002` (existe) para um
--     anônimo — oráculo de existência de provas.
--   · `get_coordenador_colaboradores` devolvia 40 UUIDs de colaborador a um anônimo.
--     (São identificadores internos, NÃO PII — o susto inicial era maior que o fato.)
--   · `has_role` respondia 200.
--
-- ⚠️ DOIS ALARMES QUE CAÍRAM AO MEDIR, e ficam registrados para ninguém "reabrir o plano":
--   · `assign_coordenador_role` NÃO era escalada de privilégio: a guarda
--     `IF NOT has_role(auth.uid(),'admin')` FUNCIONA mesmo com `auth.uid()` nulo, porque
--     `has_role` usa `SELECT EXISTS(...)`, que devolve `false` — nunca `NULL`.
--   · `salvar_salas_distribuidas` tem guarda real de admin.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tirar o default de PUBLIC — é ele que alcança o `anon`
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ Revogar de `anon` SOZINHO não adiantaria nada: o acesso dele não vem de um grant
-- próprio, vem de ser membro de PUBLIC. O Postgres não "subtrai" de PUBLIC.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Devolver a quem legitimamente chama
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 MEDIDO ANTES DE ESCREVER, e é o que torna o GRANT em bloco seguro: hoje existe
-- **UMA ÚNICA** função que `authenticated` não pode executar (`registrar_batida_saude`).
-- Todas as outras já lhe eram acessíveis via PUBLIC, então devolver em bloco **não afrouxa
-- nada** — apenas preserva o estado atual para quem está logado, enquanto o `anon` sai.
--
-- Estreitar `authenticated` função a função é desejável, mas é OUTRO tema: exigiria
-- conferir cada uma das 23 RPCs que o app chama, mais as que policies e outras funções
-- invocam. Misturar isso aqui transformaria um conserto de segurança verificável numa
-- refatoração ampla — e é assim que se quebra coisa.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- O bloco acima acabou de reconceder a `registrar_batida_saude` a `authenticated`. Ela é
-- do keep-alive e só a `service_role` deve chamá-la (ver 20260908225513).
REVOKE ALL ON FUNCTION public.registrar_batida_saude() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_batida_saude() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Impedir que o problema RENASÇA na próxima função criada
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem isto o conserto dura até a próxima migration: toda função nova nasceria de novo com
-- EXECUTE para PUBLIC. É o espelho do que a 20260731110000 fez para TABELAS.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Derrubar a `verify_user_password` — quebrada E órfã
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 Ela NUNCA conferiu senha nenhuma: o parâmetro `p_password` não é lido em lugar algum
-- do corpo. O que ela fazia era:
--
--     IF v_user_id IS NULL OR v_user_id != auth.uid() THEN RETURN FALSE; END IF;
--     RETURN TRUE;
--
-- Para um chamador ANÔNIMO, `auth.uid()` é NULL, e `v_user_id != NULL` avalia como **NULL**
-- em SQL — não como verdadeiro. O `IF` não dispara e a função cai em `RETURN TRUE`.
--
-- Medido por HTTP: e-mail existente + senha errada → `true`; e-mail inexistente → `false`.
-- Isso é um **oráculo de enumeração de contas** exposto à internet com a chave pública.
--
-- É `DROP` e não conserto porque ela é ÓRFÃ: nenhuma chamada em `src/` nem em
-- `supabase/functions/` — só aparece no `types.ts` gerado. Manter uma função de
-- autenticação que não autentica é convite a alguém passar a confiar nela.
--
-- ⚠️ O `types.ts` é gerado do schema; regenerá-lo tira a entrada de lá.
DROP FUNCTION IF EXISTS public.verify_user_password(text, text);
