# Integrações Externas

> Ver [`00-indice.md`](./00-indice.md).

## n8n — removido em 2026-07-11

Havia um client HTTP genérico (`src/services/n8nService.ts`) para webhooks n8n, configurado via `VITE_N8N_BASE_URL`. Foi removido por decisão explícita do usuário, junto com seu único caso de uso real: o fluxo de "Esqueci minha senha" do admin (`RecuperarSenhaAdmin.tsx`, rota `/recuperar-senha-admin`, linkada em `AuthAdmin.tsx`), que chamava `/auth/reset-init` e `/auth/reset-confirm` via n8n.

**Consequência (atualizada na subetapa 2A):** o fluxo n8n morreu, mas a recuperação de senha **voltou** — agora nativa. A porta única `/auth` tem "esqueci minha senha" via `supabase.auth.resetPasswordForEmail`, com destino em `/redefinir-senha` (`/auth-admin` redireciona para `/auth`). Vale para admin e colaborador, sem nenhuma dependência de n8n. Ver [`auth-e-permissoes.md`](./auth-e-permissoes.md).

## E-mail transacional

- Edge Function **`send-email`** (`supabase/functions/send-email/index.ts`) — SMTP via `denomailer`, recebe `{ to, subject, html }` e envia. Não gera o HTML, apenas despacha — quem monta o corpo é o caller (ex.: `buildEmailHtml` em `PainelDadosColaboradores.tsx`, ver [`documentos-e-relatorios.md`](./documentos-e-relatorios.md)).
- Templates React/TSX em `supabase/functions/_shared/transactional-email-templates/`: `codigo-acesso.tsx` e `atualizacao-dados.tsx`. **`codigo-acesso.tsx` está morto** — o código de acesso foi aposentado (2A–2C); o e-mail de acesso agora é o HTML da FEVRE em `_shared/enviar-link-acesso.ts`. Limpeza desses templates órfãos é 2D. O `atualizacao-dados.tsx` (aviso de atualização cadastral) ainda faz sentido.

## Edge Functions administrativas

Todas em `supabase/functions/`, CORS liberado (`Access-Control-Allow-Origin: *`) e usam a service role key quando precisam de privilégio elevado no Supabase Auth:

| Function | Propósito |
|---|---|
| `create-admin` | Cria usuário no Supabase Auth + atribui role (admin/coordenador/superadmin) — usado por `useUsers.createUser` |
| `create-coordenador` | Fluxo específico de criação de coordenador (usa `serve` do `deno.land/std`, padrão ligeiramente diferente das demais que usam `Deno.serve` direto — histórico de escrita em momentos diferentes, não um problema funcional) |
| `check-cpf-colaborador` | Checa existência de CPF — devolve só `{exists}` (endurecida na 2B; antes vazava o e-mail). Usada em `/cadastro-publico` para decidir cadastrar-ou-reivindicar |
| `reivindicar-acesso` | Reivindicação (2B): CPF → `{existe, ja_vinculado, email_mascarado}`, e dispara o link de acesso. Rate limit por IP (`reivindicacao_rate_limit`) |
| `public-create-colaborador` | Cadastro público (reescrito na 2C): insere a linha e dispara o link de acesso. Não pede mais código de 4 dígitos; e-mail obrigatório |
| `reset-codigo-acesso` | **Morta no fluxo** desde a 2A (o "esqueci código" foi aposentado). Ainda no repo; DROP é limpeza da etapa 3/2D |
| `_shared/enviar-link-acesso.ts` | Helper (não é function): generateLink invite + HTML da FEVRE + `send-email`. Usado por `reivindicar-acesso` e `public-create-colaborador` |
| `send-email` | Ver seção acima |

`supabase/config.toml` só configura explicitamente `verify_jwt = false` para `create-coordenador` — as demais seguem o padrão default do Supabase (a menos que sobrescrito em outro lugar não revisado aqui).

### `export-seed` — removida em 2026-07-12

Existiu brevemente uma sétima function, `export-seed`, que gerava o dump SQL completo da produção (com o schema `auth`, portanto com os hashes de senha) e o enviava por e-mail. Era a única forma de extrair a base do Lovable Cloud, que não expõe connection string. Cumprido o papel, foi removida: uma function que exporta a base inteira a um request de distância não deve ficar deployada.

Removida **do código e do projeto remoto** em 2026-07-12 — a rota `/functions/v1/export-seed` responde 404 em produção. Código e contexto preservados em [`../historico/export-seed/`](../historico/export-seed/); o dump que ela gerou é o `supabase/seed.local.sql` (ver [`desenvolvimento-local.md`](./desenvolvimento-local.md)).
