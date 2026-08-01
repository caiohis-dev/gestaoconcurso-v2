# Histórico

> 📁 **HISTÓRICO — não leia por padrão.** Este arquivo registra um tema já entregue.
> Abra só quando o pedido for sobre o passado (*por que ficou assim? o que se tentou?
> que alternativa foi rejeitada?*). **Não é plano** — nada aqui é lista de tarefas.
> Para o que o sistema É, veja `my_rules/estrutura/`; para o que FALTA, `my_rules/backlog.md`.

Código que **não está mais em produção nem é deployado**, guardado por valor de referência: resolveu um problema específico, pode voltar a ser útil, e o raciocínio dentro dele custa caro para reconstruir do zero.

Nada aqui é executado. Arquivos nesta pasta estão fora de `supabase/functions/`, de `src/` e de qualquer build — mover algo para cá é, na prática, aposentá-lo.

| Item | O que era | Aposentado em |
|---|---|---|
| [`export-seed/`](./export-seed/) | Edge Function que gerava o dump SQL completo da produção (incluindo schema `auth`) e enviava por e-mail | 2026-07-12 |

## `export-seed/`

Edge Function usada uma única vez, em 2026-07-12, para extrair a base de produção do Lovable Cloud.

**O problema que ela resolvia.** O banco de produção roda no Lovable Cloud, que não expõe connection string nem aceita conexão externa — `psql` e `supabase db dump` não chegam nele. Uma Edge Function, porém, roda *dentro* da infra e recebe `SUPABASE_DB_URL` como secret padrão, o que dá uma conexão Postgres direta e, com ela, acesso ao schema `auth`. Esse era o ponto: a Admin API não devolve `auth.users.encrypted_password`, então essa era a única via capaz de preservar **as senhas e os UUIDs** dos usuários. Preservar os UUIDs não era opcional — `profiles.id`, `user_roles.user_id`, `provas.created_by` e `coordenadores_prova.user_id` são FKs para `auth.users(id)`.

**O que ela produziu.** O dump que hoje é `supabase/seed.local.sql` (não versionado, ver [`../estrutura/transversais/desenvolvimento-local.md`](../estrutura/transversais/desenvolvimento-local.md)): 2.028 linhas em 18 tabelas, envelopado em `SET session_replication_role = replica` e com `ON CONFLICT DO NOTHING` em todo INSERT, portanto idempotente.

**Por que foi removida.** A função é, por construção, um canal de exfiltração da base inteira: um request autenticado como superadmin e todo o CPF, PIS, endereço, conta bancária, chave PIX e hash de senha da produção sai por e-mail. Ela mitigava isso exigindo role `superadmin` e fixando o destinatário no código (nunca aceitando `to` do request), mas a mitigação certa, terminada a migração, é não existir. O próprio cabeçalho do arquivo já pedia a remoção.

**Se precisar de novo.** Copie `index.ts` de volta para `supabase/functions/export-seed/`, faça o deploy, rode, pegue o e-mail e **remova outra vez** — não deixe deployada. Ela depende dos secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (os mesmos da `send-email`) e do `SUPABASE_DB_URL` (injetado automaticamente pela plataforma). A lista de tabelas em `TABLES` está ordenada por dependência de FK e precisa ser revisada se o schema tiver mudado desde então.
