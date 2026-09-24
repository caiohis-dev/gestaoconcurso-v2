# Integrações Externas

> Ver [`00-indice.md`](../00-indice.md).

## n8n — removido em 2026-07-11

Havia um client HTTP genérico (`src/services/n8nService.ts`) para webhooks n8n, configurado via `VITE_N8N_BASE_URL`. Foi removido por decisão explícita do usuário, junto com seu único caso de uso real: o fluxo de "Esqueci minha senha" do admin (`RecuperarSenhaAdmin.tsx`, rota `/recuperar-senha-admin`, linkada em `AuthAdmin.tsx`), que chamava `/auth/reset-init` e `/auth/reset-confirm` via n8n.

**Consequência (2A, revista em 2026-07-20):** o fluxo n8n morreu e a recuperação de senha **voltou**. Ela foi nativa (`supabase.auth.resetPasswordForEmail`) até 2026-07-20, quando passou para a EF **`recuperar-senha`**: o nativo é composto e enviado pelo SMTP do **próprio GoTrue** — local, o Mailpit; em produção, o serviço embutido do Supabase, fortemente limitado — e portanto **não passava pela `send-email`**, sem o visual da FEVRE e sem a Hostinger. A porta única `/auth` mantém o "esqueci minha senha", com destino em `/redefinir-senha` (`/auth-admin` redireciona para `/auth`). Vale para admin e colaborador. Ver [`auth-e-permissoes.md`](./auth-e-permissoes.md).

## E-mail transacional

**Regra (2026-07-20): todo e-mail do sistema sai pela `send-email`.** É o único ponto de saída, e por isso é onde ficam o SMTP da Hostinger e o visual da FEVRE.

- Edge Function **`send-email`** (`supabase/functions/send-email/index.ts`) — SMTP via **`_shared/smtp.ts`, módulo próprio** (o `denomailer` foi aposentado em 2026-09-09, ver abaixo), recebe `{ to, subject, html }` e envia.

  🔴 **Por que o `denomailer` saiu: ele quebrava o e-mail, e o defeito estava no ASSUNTO.** Com assunto acentuado e longo — o de produção é *"Redefinição de senha — Sistema de Cadastro de Colaboradores FEVRE"* — o `denomailer@1.6.0` emitia um encoded-word gigante e o partia com `=` + nova linha, deixando a continuação (`res FEVRE?=`) **começando na coluna 0**. Continuação de cabeçalho precisa começar com espaço; sem isso o parser lê como cabeçalho novo inválido, **encerra o bloco de cabeçalhos ali**, e o `Content-Type: multipart/…` vira corpo. Medido reproduzindo: `is_multipart() == False`. O Gmail (e outro cliente) exibiram a mensagem inteira como texto, com as tags HTML à mostra — e o link de recuperação de senha copiado dali vinha com `=3d` no meio e não abria. `1.6.0` é a **última** versão publicada: não havia upgrade.

  ⚠️ **Assunto CURTO não reproduz o defeito** — foi o que despistou o primeiro diagnóstico, que chegou a acusar (erradamente) o `boundary` e o corpo. O corpo sempre esteve correto. **Ao testar e-mail, use o assunto real de produção.**

  🔵 O módulo novo usa **base64** no corpo e no assunto: base64 não tem regra de caixa, nem limite de caractere imprimível, nem espaço no fim de linha — as armadilhas do quoted-printable deixam de ser possíveis em vez de dependerem de escapar certo. Regressão coberta por `_shared/smtp.test.ts` (`npm run test:ef`), com a asserção que pega exatamente a linha `res FEVRE?=`. Não gera o HTML, apenas despacha — quem monta o corpo é o caller. Callers: o helper `_shared/enviar-link-acesso.ts` (link de acesso da reivindicação, cadastro público e correção de e-mail) e a EF `recuperar-senha`. O antigo caller `buildEmailHtml` do `PainelDadosColaboradores.tsx` foi removido na 2D (e-mail em massa aposentado).
- **Só aceita `service_role`** (fechado em 2026-07-20). O `verify_jwt` padrão **não basta**: a anon key é um JWT válido e é pública — vai no bundle do frontend. Sem a checagem, qualquer um dispara e-mail arbitrário **pelo servidor da FEVRE**, passando por SPF/DKIM, o que é um vetor de phishing contra os próprios colaboradores. Nenhum código do frontend chama a `send-email`; quem chama são as EFs. **Se alguma tela precisar enviar e-mail, o caminho é uma EF nova, não afrouxar esta.**
- **`SMTP_HOST` é `smtp.hostinger.com`.** Já esteve como `mtp.` (typo), o que produzia `failed to lookup address information` — falha de **DNS**, facilmente confundida com "SMTP não funciona local". Porta `465` com `tls: true` (TLS implícito); `587` exigiria STARTTLS e **não** funciona com a configuração atual do código.
- Templates React/TSX em `supabase/functions/_shared/transactional-email-templates/`: sobrou `atualizacao-dados.tsx` (aviso de atualização cadastral). O `codigo-acesso.tsx` era órfão (código de acesso aposentado em 2A–2C) e **foi removido na 2D**; o e-mail de acesso agora é o HTML da FEVRE em `_shared/enviar-link-acesso.ts`.

## Edge Functions administrativas

Todas em `supabase/functions/`, CORS liberado (`Access-Control-Allow-Origin: *`) e usam a service role key quando precisam de privilégio elevado no Supabase Auth:

| Function | Propósito |
|---|---|
| `conceder-papel-sistema` | 🔵 **2026-09-24, substituiu a `create-admin`.** Concede `superadmin`/`admin`/`financeiro` a um **colaborador** — usado por `useUsers.concederPapelSistema`. Recebe `{ colaborador_id, role }` e **nunca senha nem e-mail**: o e-mail sai do cadastro, no servidor. Vinculado → só o papel. Sem conta → `enviarLinkAcesso` (`'auto'`): o `invite` **cria a conta na hora**, o trigger vincula, e o papel entra na mesma chamada. Sem e-mail → 400 nomeando a providência. Exige **superadmin** (via `has_role`); **recusa `coordenador` com 400**. Teste: `index.test.ts` (`npm run test:ef`) |
| `check-cpf-colaborador` | Checa existência de CPF — devolve só `{exists}` (endurecida na 2B; antes vazava o e-mail). Usada em `/cadastro-publico` para decidir cadastrar-ou-reivindicar |
| `reivindicar-acesso` | Caminho do **CPF** na porta única (2B): CPF → `{existe, ja_vinculado, email_mascarado}`, e dispara o link de acesso. Rate limit por IP (`reivindicacao_rate_limit`), **compartilhado com a `recuperar-senha`** — separados, o atacante somaria 5 + 5 |
| `public-create-colaborador` | Cadastro público (reescrito na 2C): insere a linha e dispara o link de acesso. Não pede mais código de 4 dígitos; e-mail obrigatório |
| `corrigir-email-acesso` | Correção do e-mail de acesso em linha vinculada-pendente (estado B): **renomeia** a conta, não apaga. Modos `consultar`/`corrigir`; só `admin`/`coordenador` |
| `recuperar-senha` | Caminho do **e-mail** na porta única (2026-07-20), no lugar do `resetPasswordForEmail` nativo. Pública. Manda `recovery` se a conta existe e **`invite` se o e-mail bate com cadastro em estado A**. Repõe à mão o que o nativo dava de graça: **anti-enumeração** (resposta genérica sempre, inclusive no cooldown) e **cooldown de 2 min por conta** — sem tabela nova, lido dos **três** carimbos do Auth (`recovery_sent_at`, `confirmation_sent_at`, `invited_at`; o invite deixa o primeiro NULL) — mais o **teto por IP compartilhado** com a `reivindicar-acesso` |
| `keep-alive` | **Sinal de vida do banco** (2026-09-08). Não manda e-mail nem toca em PII: chama a RPC `registrar_batida_saude()`, que faz upsert do dia em `public.saude_banco`. Existe para impedir a **pausa por inatividade** do plano Free — ver [`banco-producao.md`](../../banco-producao.md). Exige o header `x-keep-alive-token` conferido contra o secret `KEEP_ALIVE_TOKEN`, e 🔴 **falha FECHADA se o secret não existir** (503), o inverso deliberado do `SITE_URL`. Quem chama é um **cron diário no servidor**, não o frontend |
| `_shared/enviar-link-acesso.ts` | Helper (não é function): generateLink + HTML da FEVRE + `send-email`. Usado por `reivindicar-acesso`, `public-create-colaborador`, `corrigir-email-acesso`, `recuperar-senha` ⚠️ **e `incluir-email-cadastro`, que faltava nesta linha desde 19/09** — e, desde 2026-09-24, `conceder-papel-sistema` (⚠️ cada chamador novo exige a origem dele na CHECK `log_envio_link_acesso_origem_check`, senão a trilha falha calada: é best-effort). 🔵 **Desde 2026-09-19 o `tipo` padrão é `'auto'`**: consulta o Auth por `_shared/auth-lookup.ts` e manda `recovery` quando o e-mail já tem conta — mais um **retry** quando o GoTrue recusa o invite com `email_exists` (HTTP 422). Antes o padrão era `invite` fixo, e o e-mail se perdia em silêncio. O parâmetro `contexto` (`primeiro-acesso`/`redefinir`) muda o texto e **não** coincide com o `tipo` do link: a correção de e-mail usa link `recovery` por razão técnica, mas para a pessoa é primeiro acesso. 🔵 **Desde 2026-09-20 grava a trilha em `log_envio_link_acesso`** (migration `20260921005259_trilha_envio_link_acesso.sql`), num ponto único, independente de quem chamou — ver `auth-e-permissoes.md` |
| `incluir-email-cadastro` | 🔴 **Porta pública que ESCREVE PII (2026-09-19).** O colaborador sem `colab_email` informa o próprio, com **CPF + e-mail e nada mais** — sem prova de posse, por decisão explícita. Chama a RPC `registrar_email_do_proprio_cadastro` (todas as guardas no banco), dispara o link e **avisa os admins por e-mail**, que é a única detecção que a porta tem. Dois tetos: `inclusao-email` por IP e `inclusao-email-global` de chave fixa. ⚠️ **Leia `analises/dividas-auth-colaborador.md` §5 antes de mexer** |
| `_shared/auth-lookup.ts` | Helper (2026-09-19): `buscarContaPorEmail` — a pergunta "este e-mail já tem conta?", extraída da `recuperar-senha`. ⚠️ O `?filter=` do GoTrue é busca **parcial** (`ana@x.com` casa `mariana@x.com`), e a conferência exata mora aqui dentro. Devolve **três** estados: `encontrada`, `ausente` e `indisponivel` — "não consegui perguntar" não é "não existe", e quem chama cai no `invite`, que é o comportamento de sempre |
| `send-email` | Ver seção acima — **só `service_role`** |

**`reset-codigo-acesso` não existe mais.** Servia ao "esqueci meu código", morto desde a 2A; foi **removida do repo** na 2D (2026-07-15), junto com o DROP da coluna `colab_codigo_acesso`. As 8 acima são as que existem hoje em `supabase/functions/` (eram 8 até 2026-09-08, quando entrou a `keep-alive`, chegando a 9; voltaram a 8 em 2026-09-12 com a saída da `create-coordenador`).

🔵 **`create-coordenador` foi REMOVIDA em 2026-09-12.** Ela criava a conta do coordenador a partir de e-mail e senha digitados no diálogo — o fluxo de antes da v2. A concessão virou a RPC `conceder_coordenador`, que usa a conta que o colaborador já tem; ver [`auth-e-permissoes.md`](./auth-e-permissoes.md). 🟢 **Também não existe em produção** — conferido em 2026-09-24 por `supabase functions list --project-ref zugigdpuxbpogoepdawm` (9 funções, todas presentes no repo, e ela não é uma delas) e por POST direto (**404**). ⚠️ Esta linha afirmava, até essa data, que ela *"segue chamável por um admin"* até ser apagada lá: não seguia — em algum momento entre 12/09 e 24/09 ela saiu, sem registro de quando. O princípio continua valendo (**remover do repo não remove de produção**); o caso concreto é que não.

🔵 **Toda porta pública passa pelo rate limit desde 2026-09-12.** O helper `_shared/rate-limit.ts` chama a RPC `registrar_tentativa` e devolve 429 — as quatro EFs alcançáveis sem sessão (`reivindicar-acesso`, `recuperar-senha`, `public-create-colaborador`, `check-cpf-colaborador`) o usam, e **duas delas não tinham teto nenhum** até então. Detalhe e tetos em [`auth-e-permissoes.md`](./auth-e-permissoes.md).

`supabase/config.toml` **não configura `verify_jwt` para nenhuma function** — todas seguem o padrão do Supabase. Até 2026-09-12 havia uma exceção, `verify_jwt = false` na `create-coordenador`, que saiu com ela. **Atenção:** o default (`verify_jwt = true`) aceita a **anon key**, que é pública. Ele impede chamada anônima crua, mas **não** é controle de acesso; onde importa quem chama, a checagem é no corpo da function (como na `send-email`).

### 🔵 `create-admin` → `conceder-papel-sistema` (2026-09-24)

A `create-admin` foi **removida do repo** e substituída. Ela tinha dois defeitos que a autorização de 25/07 (abaixo) não tocava:

1. **Senha escolhida pelo admin** e `email_confirm: true` — conta confirmada sem prova de posse da caixa, e a senha repassada por fora. Era o fluxo de antes da v2, o mesmo que derrubou a `create-coordenador` em 12/09.
2. 🔴 **Com e-mail que já tinha conta, ela SOBRESCREVIA A SENHA da pessoa** (`updateUserById(..., { password })`). Fazê-lo com um colaborador real trocava a senha dele sem aviso. E a busca da conta era `listUsers()` **sem paginação** (50 por página): com ~280 contas em produção o mais provável era não achar e responder 500 — o defeito 3 da `create-coordenador`, sobrevivendo na irmã.

A substituta parte do **colaborador**, não de um e-mail digitado (decisão do usuário): o e-mail vem do cadastro, como a conta vem do cadastro na `conceder_coordenador`. ⚠️ **Não há rollback de conta**: se o convite criou a conta e o e-mail não saiu, o papel fica concedido e a resposta diz `convite-falhou` — `deleteUser` apagaria `profiles`/`user_roles` em CASCADE. ⚠️ **Consequência aceita:** deixa de existir caminho no app para criar conta de sistema que **não** seja colaborador.

🟢 **No ar desde a v3.7.0 (2026-09-24), e a `create-admin` foi APAGADA de produção no mesmo passe** — conferido: responde **404**. A ordem importou: migration `20260924112512` (a origem nova na CHECK da trilha, senão os convites saem sem registro) → EF nova → site → só então o `delete`, porque o bundle anterior ainda chamava a velha. 🔵 A `create-coordenador` também **não** está lá (conferido no mesmo dia pela lista oficial — ver a nota dela acima); a frase que dizia o contrário estava errada.

### `create-admin` — fechada em 2026-07-25 (era o buraco mais grave do sistema)

> 🔵 Seção histórica: a função foi substituída em 2026-09-24 (acima). A lição de autorização vale igual para a sucessora, que copia o bloco de checagem do chamador.

**O que era:** a função ia **direto do `req.json()` para `auth.admin.createUser`** com `service_role`, sem nenhuma checagem de autorização. Aceitava `role` do corpo, validando só que o valor estava na lista — e `"superadmin"` estava na lista. Some-se a isso que `useUsers.createUser` mandava **a própria anon key** no `Authorization`: a função nem teria como identificar o chamador. **Qualquer pessoa com a anon key criava uma conta `superadmin`.**

Era a mesma falha da `send-email`, fechada em 2026-07-20, com consequência maior — aquela dava phishing, esta dava o sistema.

**Como ficou**, nos dois lados:

1. **Frontend** (`useUsers.createUser`) manda `session.access_token` no `Authorization` — o JWT que identifica a pessoa. A `apikey` continua sendo a pública, porque o papel dela é outro: identificar o **projeto** no gateway.
2. **A function** monta um client com o header do chamador, faz `auth.getUser()` e **exige `superadmin`** via `has_role`. Sem sessão → 401; sem o papel → 403.

Por que **superadmin** e não admin: a única porta é a página `/gerenciar-usuarios`, cujo guard já é `isSuperAdmin` — a regra espelha a UI em vez de afrouxá-la. E é o mínimo defensável, porque quem cria conta aqui pode criar outro superadmin, ou seja, **pode se replicar**.

⚠️ **A verificação em `has_role` é por RPC, não por `SELECT` em `user_roles`** — a hierarquia (superadmin ⇒ admin) vive dentro daquela função desde a migration `20260725195530`, e consultar a tabela direto contorna a regra. A `corrigir-email-acesso` foi ajustada no mesmo passe pelo mesmo motivo: ela consultava a tabela e um comentário dela afirmava que `has_role` era "match literal, sem hierarquia" — verdade até 25/07, falsa depois.

**A lição que generaliza:** `verify_jwt` não é autorização. Toda EF que usa `service_role` para algo privilegiado precisa decidir explicitamente quem pode chamá-la — ou exigindo `service_role` (se só o servidor chama, como a `send-email`), ou validando o usuário (se o frontend chama, como a `corrigir-email-acesso` e a `conceder-papel-sistema`). Não há terceira opção segura.

⚠️ **Continua pendente:** verificar se o **projeto Supabase v1** ainda tem a versão vulnerável publicada — uma EF é chamável pela URL do projeto mesmo com o frontend fora do ar. Mesmo raciocínio do item da `send-email` no [`backlog.md`](../../backlog.md).

> 🔵 **Indício forte de 2026-08-13, que não fecha o item mas encurta muito:** `npx supabase projects list` devolveu **dois** projetos na organização — `zugigdpuxbpogoepdawm` (a produção da v2) e `rockjfrubizaxqpamygv` (*log.fevre.online*, criado em 12/07, **ACTIVE_HEALTHY**). O projeto da era Lovable (`dqslqfzqukcahogkieet`) **não aparece**: se foi apagado, não há EF vulnerável a chamar e o item morre. ⚠️ É leitura de listagem, não prova — pode estar em outra organização.
>
> ⚠️ **E apareceu uma superfície que ninguém estava olhando:** o projeto de **12/07** está **ativo**, apesar de ter sido descartado em favor do de 08/08. Ele ocupa uma das 2 vagas de projeto ativo do plano Free e, **se alguma Edge Function chegou a ser publicada nele naquela tentativa, é exatamente a mesma classe de risco deste item.** Conferir o que está publicado lá antes de decidir apagá-lo.

### `export-seed` — removida em 2026-07-12

Existiu brevemente uma sétima function, `export-seed`, que gerava o dump SQL completo da produção (com o schema `auth`, portanto com os hashes de senha) e o enviava por e-mail. Era a única forma de extrair a base do Lovable Cloud, que não expõe connection string. Cumprido o papel, foi removida: uma function que exporta a base inteira a um request de distância não deve ficar deployada.

Removida **do código e do projeto remoto** em 2026-07-12 — a rota `/functions/v1/export-seed` responde 404 em produção. Código e contexto preservados em [`../historico/export-seed/`](../../historico/export-seed/); o dump que ela gerou é o `supabase/seed.local.sql` (ver [`desenvolvimento-local.md`](./desenvolvimento-local.md)).

## Erro de EF no cliente: quem usa `functions.invoke` precisa desembrulhar

As EFs recusam com status **não-2xx** e o motivo no corpo, e essas mensagens são escritas para o usuário final. Mas o `supabase.functions.invoke` **não entrega esse corpo em `data`**: numa resposta não-2xx ele devolve `{ data: null, error: FunctionsHttpError }`, com o corpo em **`error.context.body`, como string**.

Consequência: o padrão ingênuo `data?.error || "<genérica>"` cai **sempre** na genérica. Foi defeito real no `CorrigirEmailAcessoDialog` até 2026-07-26 — o servidor explicava, o cliente jogava fora, e o admin ficava sem saber o que corrigir (inclusive no caso provável de o e-mail já pertencer a outro cadastro).

**Use `mensagemDeErroDaFuncao`** (`src/lib/edge-function-error.ts`, com teste próprio). Ele tenta, nesta ordem: o `error` do corpo → o `error` de `data` (algumas EFs respondem 200 com erro no corpo) → a `message` do erro de transporte → o padrão.

**Só se aplica a quem usa `functions.invoke`** — hoje `CoordenadoresProvaDialog` e `CorrigirEmailAcessoDialog`. As outras cinco EFs são chamadas com **`fetch` cru** (`conceder-papel-sistema`, `recuperar-senha`, `reivindicar-acesso`, `public-create-colaborador`, `check-cpf-colaborador`), que lê `response.json()` e já enxerga o `error` do corpo — por isso nunca tiveram o problema.
