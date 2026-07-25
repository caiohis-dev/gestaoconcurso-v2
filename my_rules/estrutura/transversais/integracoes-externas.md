# Integrações Externas

> Ver [`00-indice.md`](../00-indice.md).

## n8n — removido em 2026-07-11

Havia um client HTTP genérico (`src/services/n8nService.ts`) para webhooks n8n, configurado via `VITE_N8N_BASE_URL`. Foi removido por decisão explícita do usuário, junto com seu único caso de uso real: o fluxo de "Esqueci minha senha" do admin (`RecuperarSenhaAdmin.tsx`, rota `/recuperar-senha-admin`, linkada em `AuthAdmin.tsx`), que chamava `/auth/reset-init` e `/auth/reset-confirm` via n8n.

**Consequência (2A, revista em 2026-07-20):** o fluxo n8n morreu e a recuperação de senha **voltou**. Ela foi nativa (`supabase.auth.resetPasswordForEmail`) até 2026-07-20, quando passou para a EF **`recuperar-senha`**: o nativo é composto e enviado pelo SMTP do **próprio GoTrue** — local, o Mailpit; em produção, o serviço embutido do Supabase, fortemente limitado — e portanto **não passava pela `send-email`**, sem o visual da FEVRE e sem a Hostinger. A porta única `/auth` mantém o "esqueci minha senha", com destino em `/redefinir-senha` (`/auth-admin` redireciona para `/auth`). Vale para admin e colaborador. Ver [`auth-e-permissoes.md`](./auth-e-permissoes.md).

## E-mail transacional

**Regra (2026-07-20): todo e-mail do sistema sai pela `send-email`.** É o único ponto de saída, e por isso é onde ficam o SMTP da Hostinger e o visual da FEVRE.

- Edge Function **`send-email`** (`supabase/functions/send-email/index.ts`) — SMTP via `denomailer`, recebe `{ to, subject, html }` e envia. Não gera o HTML, apenas despacha — quem monta o corpo é o caller. Callers: o helper `_shared/enviar-link-acesso.ts` (link de acesso da reivindicação, cadastro público e correção de e-mail) e a EF `recuperar-senha`. O antigo caller `buildEmailHtml` do `PainelDadosColaboradores.tsx` foi removido na 2D (e-mail em massa aposentado).
- **Só aceita `service_role`** (fechado em 2026-07-20). O `verify_jwt` padrão **não basta**: a anon key é um JWT válido e é pública — vai no bundle do frontend. Sem a checagem, qualquer um dispara e-mail arbitrário **pelo servidor da FEVRE**, passando por SPF/DKIM, o que é um vetor de phishing contra os próprios colaboradores. Nenhum código do frontend chama a `send-email`; quem chama são as EFs. **Se alguma tela precisar enviar e-mail, o caminho é uma EF nova, não afrouxar esta.**
- **`SMTP_HOST` é `smtp.hostinger.com`.** Já esteve como `mtp.` (typo), o que produzia `failed to lookup address information` — falha de **DNS**, facilmente confundida com "SMTP não funciona local". Porta `465` com `tls: true` (TLS implícito); `587` exigiria STARTTLS e **não** funciona com a configuração atual do código.
- Templates React/TSX em `supabase/functions/_shared/transactional-email-templates/`: sobrou `atualizacao-dados.tsx` (aviso de atualização cadastral). O `codigo-acesso.tsx` era órfão (código de acesso aposentado em 2A–2C) e **foi removido na 2D**; o e-mail de acesso agora é o HTML da FEVRE em `_shared/enviar-link-acesso.ts`.

## Edge Functions administrativas

Todas em `supabase/functions/`, CORS liberado (`Access-Control-Allow-Origin: *`) e usam a service role key quando precisam de privilégio elevado no Supabase Auth:

| Function | Propósito |
|---|---|
| `create-admin` | Cria usuário no Supabase Auth + atribui role (admin/coordenador/superadmin) — usado por `useUsers.createUser` |
| `create-coordenador` | Fluxo específico de criação de coordenador (usa `serve` do `deno.land/std`, padrão ligeiramente diferente das demais que usam `Deno.serve` direto — histórico de escrita em momentos diferentes, não um problema funcional) |
| `check-cpf-colaborador` | Checa existência de CPF — devolve só `{exists}` (endurecida na 2B; antes vazava o e-mail). Usada em `/cadastro-publico` para decidir cadastrar-ou-reivindicar |
| `reivindicar-acesso` | Caminho do **CPF** na porta única (2B): CPF → `{existe, ja_vinculado, email_mascarado}`, e dispara o link de acesso. Rate limit por IP (`reivindicacao_rate_limit`), **compartilhado com a `recuperar-senha`** — separados, o atacante somaria 5 + 5 |
| `public-create-colaborador` | Cadastro público (reescrito na 2C): insere a linha e dispara o link de acesso. Não pede mais código de 4 dígitos; e-mail obrigatório |
| `corrigir-email-acesso` | Correção do e-mail de acesso em linha vinculada-pendente (estado B): **renomeia** a conta, não apaga. Modos `consultar`/`corrigir`; só `admin`/`coordenador` |
| `recuperar-senha` | Caminho do **e-mail** na porta única (2026-07-20), no lugar do `resetPasswordForEmail` nativo. Pública. Manda `recovery` se a conta existe e **`invite` se o e-mail bate com cadastro em estado A**. Repõe à mão o que o nativo dava de graça: **anti-enumeração** (resposta genérica sempre, inclusive no cooldown) e **cooldown de 2 min por conta** — sem tabela nova, lido dos **três** carimbos do Auth (`recovery_sent_at`, `confirmation_sent_at`, `invited_at`; o invite deixa o primeiro NULL) — mais o **teto por IP compartilhado** com a `reivindicar-acesso` |
| `_shared/enviar-link-acesso.ts` | Helper (não é function): generateLink + HTML da FEVRE + `send-email`. Usado por `reivindicar-acesso`, `public-create-colaborador`, `corrigir-email-acesso` e `recuperar-senha`. O parâmetro `contexto` (`primeiro-acesso`/`redefinir`) muda o texto e **não** coincide com o `tipo` do link: a correção de e-mail usa link `recovery` por razão técnica, mas para a pessoa é primeiro acesso |
| `send-email` | Ver seção acima — **só `service_role`** |

**`reset-codigo-acesso` não existe mais.** Servia ao "esqueci meu código", morto desde a 2A; foi **removida do repo** na 2D (2026-07-15), junto com o DROP da coluna `colab_codigo_acesso`. As 8 acima são as que existem hoje em `supabase/functions/`.

`supabase/config.toml` só configura explicitamente `verify_jwt = false` para `create-coordenador` — as demais seguem o padrão default do Supabase. **Atenção:** esse default (`verify_jwt = true`) aceita a **anon key**, que é pública. Ele impede chamada anônima crua, mas **não** é controle de acesso; onde importa quem chama, a checagem é no corpo da function (como na `send-email`).

### `export-seed` — removida em 2026-07-12

Existiu brevemente uma sétima function, `export-seed`, que gerava o dump SQL completo da produção (com o schema `auth`, portanto com os hashes de senha) e o enviava por e-mail. Era a única forma de extrair a base do Lovable Cloud, que não expõe connection string. Cumprido o papel, foi removida: uma function que exporta a base inteira a um request de distância não deve ficar deployada.

Removida **do código e do projeto remoto** em 2026-07-12 — a rota `/functions/v1/export-seed` responde 404 em produção. Código e contexto preservados em [`../historico/export-seed/`](../../historico/export-seed/); o dump que ela gerou é o `supabase/seed.local.sql` (ver [`desenvolvimento-local.md`](./desenvolvimento-local.md)).
