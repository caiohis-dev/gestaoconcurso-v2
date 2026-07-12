# Integrações Externas

> Ver [`00-indice.md`](./00-indice.md).

## n8n — removido em 2026-07-11

Havia um client HTTP genérico (`src/services/n8nService.ts`) para webhooks n8n, configurado via `VITE_N8N_BASE_URL`. Foi removido por decisão explícita do usuário, junto com seu único caso de uso real: o fluxo de "Esqueci minha senha" do admin (`RecuperarSenhaAdmin.tsx`, rota `/recuperar-senha-admin`, linkada em `AuthAdmin.tsx`), que chamava `/auth/reset-init` e `/auth/reset-confirm` via n8n.

**Consequência:** o login administrativo (`/auth-admin`) não tem mais nenhum fluxo de recuperação de senha próprio — só resta o login direto. Se for reintroduzir recuperação de senha para admins, o caminho natural é `supabase.auth.resetPasswordForEmail` (nativo do Supabase Auth, já usado como base de `useAuth.tsx`), não recriar a dependência de n8n.

## E-mail transacional

- Edge Function **`send-email`** (`supabase/functions/send-email/index.ts`) — SMTP via `denomailer`, recebe `{ to, subject, html }` e envia. Não gera o HTML, apenas despacha — quem monta o corpo é o caller (ex.: `buildEmailHtml` em `PainelDadosColaboradores.tsx`, ver [`documentos-e-relatorios.md`](./documentos-e-relatorios.md)).
- Templates React/TSX prontos em `supabase/functions/_shared/transactional-email-templates/`: `codigo-acesso.tsx` (envio do código de acesso no cadastro) e `atualizacao-dados.tsx` (aviso de atualização cadastral). Note que esses são templates *server-side* (rodam em Deno), separados do HTML montado inline no frontend em `PainelDadosColaboradores.tsx` — ao mudar o visual de um e-mail, confira se a mudança precisa ser replicada nos dois lugares (o template compartilhado da Edge Function vs. o HTML construído ad-hoc no painel).

## Edge Functions administrativas

Todas em `supabase/functions/`, CORS liberado (`Access-Control-Allow-Origin: *`) e usam a service role key quando precisam de privilégio elevado no Supabase Auth:

| Function | Propósito |
|---|---|
| `create-admin` | Cria usuário no Supabase Auth + atribui role (admin/coordenador/superadmin) — usado por `useUsers.createUser` |
| `create-coordenador` | Fluxo específico de criação de coordenador (usa `serve` do `deno.land/std`, padrão ligeiramente diferente das demais que usam `Deno.serve` direto — histórico de escrita em momentos diferentes, não um problema funcional) |
| `check-cpf-colaborador` | Checa existência de CPF sem expor a tabela `colaboradores` publicamente — usado em `/cadastro-publico`, valida entrada com Zod |
| `public-create-colaborador` | Insere colaborador a partir do fluxo público (sem sessão), valida payload extensivamente com Zod (limites de tamanho por campo, replicando as constraints de `colaboradores`) |
| `reset-codigo-acesso` | Fluxo de "esqueci meu código de acesso", valida `cpf` (+ `email` opcional) com Zod |
| `send-email` | Ver seção acima |

`supabase/config.toml` só configura explicitamente `verify_jwt = false` para `create-coordenador` — as demais seguem o padrão default do Supabase (a menos que sobrescrito em outro lugar não revisado aqui).

### `export-seed` — removida em 2026-07-12

Existiu brevemente uma sétima function, `export-seed`, que gerava o dump SQL completo da produção (com o schema `auth`, portanto com os hashes de senha) e o enviava por e-mail. Era a única forma de extrair a base do Lovable Cloud, que não expõe connection string. Cumprido o papel, foi removida: uma function que exporta a base inteira a um request de distância não deve ficar deployada.

Removida **do código e do projeto remoto** em 2026-07-12 — a rota `/functions/v1/export-seed` responde 404 em produção. Código e contexto preservados em [`../historico/export-seed/`](../historico/export-seed/); o dump que ela gerou é o `supabase/seed.local.sql` (ver [`desenvolvimento-local.md`](./desenvolvimento-local.md)).
