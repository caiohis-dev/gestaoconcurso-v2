# Banco de Produção — Regras de Transição e Operação

Regras para o banco de **produção da v2**: um projeto novo no supabase.com, criado em 2026-07-12, que substitui o projeto da era Lovable (`dqslqfzqukcahogkieet`).

Leia junto com [`versionamento.md`](./versionamento.md) (a regra de nunca editar migration aplicada vale aqui em dobro) e [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md).

---

## O contexto que define tudo

Três fatos, e cada regra abaixo decorre deles:

1. **O banco antigo está congelado.** O site do Lovable não existe mais e o projeto está temporariamente fora do ar. Ninguém escreve no banco antigo — logo, o dump que temos **não envelhece**, e não há corrida contra dados novos.
2. **O banco novo é continuidade do antigo**, não um recomeço. Mesmo schema, mesmos dados, mesmos usuários (inclusive os hashes de senha — os logins de produção continuam valendo).
3. **A fonte da verdade é o banco local.** Não o banco antigo, não o dashboard. O banco local é reproduzível: `supabase db reset` aplica todas as migrations + os seeds e chega exatamente no estado que queremos em produção. É essa reprodutibilidade que torna o `db push` seguro.

## As duas regras combinadas (2026-07-12)

Estas duas vêm antes de qualquer procedimento deste arquivo. Elas existem para que **nada chegue em produção por acidente ou por inércia** — o banco de produção não acompanha o desenvolvimento, ele recebe entregas.

### 1. O repositório fica DESLINKADO por padrão

**Só se linka no momento de colocar em produção.** Fora desse momento, `supabase link` não é rodado — e depois do push, `npm run prod:unlink` devolve o repo ao estado desligado.

Por quê: enquanto não há link, **os comandos destrutivos não têm alvo**. `supabase db reset --linked` e `supabase db push` simplesmente não sabem em qual banco escrever, e falham em vez de estragar. O link é o que arma a arma; ele fica desarmado o tempo todo, menos nos minutos em que a gente conscientemente vai subir algo.

Consequência prática: o dia a dia (migration nova, `db reset`, dev local) **nunca precisa de link**. Se você se pegou linkando para fazer algo rotineiro, pare — provavelmente é o comando errado.

### 2. Produção só é atualizada em versões estáveis

**`prod:push` acontece em versões consideradas estáveis, nunca a cada migration ou a cada merge em `dev`.** A unidade de entrega ao banco é a **release tagueada** (`v2.x.y`, ver [`versionamento.md`](./versionamento.md)), não o commit.

Migrations, portanto, **se acumulam em `dev`** entre uma release e outra — isso é esperado, não é dívida. Quando a versão é declarada estável, elas sobem **em lote**, de uma vez, no mesmo evento em que `dev` é mesclada em `main`. É por isso que o `prod:push:dry` do passo de release pode listar várias migrations: leia a lista inteira, ela é a mudança de schema da versão.

Corolário incômodo, mas que é o preço da regra: entre releases, **o schema de produção fica atrás do local**. O código em produção precisa continuar compatível com o schema de produção — o que significa que **código novo e migration nova sobem juntos, na mesma release**. Nunca faça deploy do frontend de uma versão cujo schema ainda não subiu.

---

## A regra fundamental

> **Só migration chega em produção.**

`supabase db push` aplica **apenas** `supabase/migrations/`. Ele **não** roda `seed.sql` — seed só existe no `db reset` local.

Consequência prática, e este projeto já quase pagou por ela: **dado de referência do qual o código depende vai em migration, nunca em seed.** Os 7 cargos "básicos do sistema" viveram só no seed até 2026-07-12; um banco de produção novo nasceria sem eles, e a lista de elegíveis a coordenador (`FUNCOES_COORDENACAO` em `src/hooks/useCoordenadoresProva.tsx`, que hardcoda dois desses UUIDs) ficaria permanentemente vazia — sem erro visível em lugar nenhum. Viraram a migration `20260712134220_seed_funcoes_basicas_sistema.sql`.

Pergunta a fazer sempre que for inserir uma linha: *se este registro não existir, o código quebra?* Se sim, é migration.

## Os três comandos perigosos

| Comando | O que faz | Regra |
|---|---|---|
| `supabase db reset --linked` | **APAGA o banco remoto** e reaplica tudo do zero | **Nunca.** Só existe uma flag de distância do reset local. Perda total de dados de produção. |
| `supabase config push` | Sobrescreve a config de auth do projeto remoto com o `config.toml` | **Nunca.** O `config.toml` é de dev: signup aberto, confirmação de e-mail desligada, `site_url` em `127.0.0.1`. Em prod isso é regressão de segurança. |
| `supabase db push` | Aplica as migrations pendentes no remoto | Só em release estável, precedido de `npm run prod:push:dry`. |

Por isso os scripts do `package.json` são explícitos: tudo que toca o remoto tem o prefixo **`prod:`** (`prod:diff`, `prod:push:dry`, `prod:push`, `prod:unlink`). Um comando `supabase` solto na linha de comando é o caminho do acidente; use os scripts.

Note que os dois primeiros só funcionam **se houver link** — e é justamente por isso que o padrão é ficar deslinkado.

## Bootstrap do banco novo (na primeira subida a produção)

Este é o roteiro da **primeira vez** que a v2 for ao ar. Ele não é para agora: enquanto a v2 estiver em desenvolvimento, o banco de produção fica intocado e o repo, deslinkado.

Ordem importa. Não pule o passo 2.

1. **Linkar** o repo ao projeto novo: `npx supabase link --project-ref <REF_DO_PROJETO_NOVO>`.

   ⚠️ Não se assuste com o `project_id = "dqslqfzqukcahogkieet"` no `config.toml`: ele é herança do projeto Lovable e serve **só** para nomear os containers Docker locais (`supabase_db_dqslqfzqukcahogkieet`) — não é ele que define o projeto remoto. Quem faz isso é o `link`, que grava a ref em `supabase/.temp/`. Mudar o `project_id` renomearia os containers e recriaria o banco local à toa; deixe como está.
2. **Conferir antes de escrever:** `npm run prod:push:dry`. O banco novo está vazio, então o dry-run deve listar **todas** as migrations do repo — confira o total com `ls supabase/migrations/*.sql | wc -l` na hora (eram **85** em 2026-07-26). Se listar menos, pare: significa que o banco não é o que pensamos. **Não confie no número escrito aqui** — ele envelhece a cada migration nova, e o comando não.
3. **Aplicar o schema:** `npm run prod:push`. Isso cria tudo, inclusive os GRANTs da `20260712010000_grant_api_roles_table_privileges.sql` (sem eles o login autentica mas a UI nunca avança) e os 7 cargos básicos.
4. **Carregar os dados** de produção, uma vez, a partir do dump: `supabase/seed.local.sql` (gitignored). Ele traz `public.*` mais `auth.users` e `auth.identities` — é o que faz os logins antigos continuarem funcionando. Todos os INSERTs têm `ON CONFLICT`, então recarregar não quebra. Carregue com `psql` na connection string do projeto novo, **não** via `db push`. ⚠️ **O dump precisa carregar as duas correções manuais** (e-mails duplicados zerados + coluna `colab_codigo_acesso` removida dos INSERTs) — senão o passo quebra (a segunda com `column "colab_codigo_acesso" does not exist`, porque as migrations do passo 3 já dropam a coluna). Detalhes em [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md). O dump local desta máquina já as tem; um dump **novo** (via `export-seed`) nasce sem elas.
5. **Rodar o `supabase/seed.pos.sql`** (versionado), com `psql`, na mesma connection string — **depois** da carga do passo 4 e **nunca antes**. Ele contém as operações de dados que só fazem sentido com o dump já carregado; hoje, o backfill que vincula os 12 colaboradores que já são usuários (a cúpula: 2 admins + 10 coordenadores) às contas do Auth. **Pular este passo faz a cúpula nascer sem `user_id` e sem o papel `colaborador`** — eles continuariam entrando como admin/coordenador, mas ficariam sem acesso aos próprios dados de colaborador, e o erro é silencioso. É idempotente: rodar duas vezes não faz efeito. Por que não é migration: `db push` aplicaria o backfill **antes** do passo 4, contra tabelas vazias, casando zero linhas — e migration não roda duas vezes. Ver [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md).
6. **Configurar o auth no dashboard** — isto **não** vem do `config.toml` e é fácil esquecer: confirmação de e-mail **ligada**, `site_url` do domínio real, e **redirect URLs incluindo as rotas internas do domínio** (ex.: `https://SEU_DOMINIO/**`) — sem isso, os links de recuperação de senha e o invite da reivindicação (subetapa 2B) caem no `site_url` em vez de `/redefinir-senha`, e o fluxo trava. Signup fechado se o cadastro for só por convite. **Verifique também os Rate Limits nativos do Auth** (limite de e-mails transacionais e requisições de token), ajustando-os conforme as cotas do plano para evitar bloqueios de login em dias de pico. O `additional_redirect_urls` do `config.toml` cobre só o dev local; produção é configurada aqui.
7. **Publicar as edge functions:** `npx supabase functions deploy` (as **8** de `supabase/functions/` — o nono diretório é `_shared` e não é function) e cadastrar os secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` **e `SITE_URL`**. `db push` não publica function nenhuma.

   🔴 **`SITE_URL` faltava nesta lista até 2026-08-06, e a omissão é do tipo que não denuncia.** `supabase/functions/_shared/enviar-link-acesso.ts` faz `Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:8080'` e usa o valor em `redirectTo: ${siteUrl}/redefinir-senha`. Sem o secret, o fallback entra calado e **todo convite e toda recuperação de senha nasce apontando para `localhost`** — a função responde sucesso, o e-mail chega, e só o destinatário descobre. O valor tem de ser o domínio real, e o `${SITE_URL}/redefinir-senha` precisa estar nas redirect URLs do passo 6.

   ⚠️ **Não cadastre `SUPABASE_URL`, `SUPABASE_ANON_KEY` nem `SUPABASE_SERVICE_ROLE_KEY`** — a plataforma os injeta. (`JWT_SECRET` aparece só em `_shared/test-utils.ts`; é de teste local, não de produção.) ⚠️ **A `recuperar-senha` é obrigatória desde 2026-07-20:** o "esqueci minha senha" deixou de ser o fluxo nativo e passou a depender dela. Se ela não subir, **a recuperação de senha simplesmente não funciona em produção** — e a tela não denuncia, porque a resposta é genérica por desenho (anti-enumeração). `SMTP_HOST` é `smtp.hostinger.com` (já esteve com typo `mtp.`) na porta `465`.
8. **Apontar o frontend:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do build de produção passam a ser os do projeto novo.
9. **Deslinkar:** `npm run prod:unlink`. Terminou a subida, o repo volta ao estado desarmado.

Não há buckets de storage hoje — nenhuma migration cria bucket e o app não usa. Se isso mudar, storage vira um passo a mais aqui, porque também não viaja no `db push`.

## O fluxo do dia a dia (repo deslinkado, produção intocada)

Este é o fluxo de **99% dos dias**. Nenhum passo aqui toca produção, e nenhum precisa de link:

1. Mudança de schema → **arquivo novo** em `supabase/migrations/` (`npx supabase migration new <slug>`).
2. Validar local: `npm run supabase:reset` (aplica tudo do zero — é o teste de que a migration reproduz o estado esperado, e não só de que roda).
3. Commitar a migration (tipo `db:`, ver [`versionamento.md`](./versionamento.md)) na branch de trabalho, e mesclar em **`dev`** — nunca em `main`, que fica congelada até a subida da v2.

E acabou. A migration fica **acumulada em `dev`**, esperando a próxima release. Não se faz push para produção aqui.

## O fluxo da release (a única vez que produção é tocada)

Quando uma versão é declarada **estável** e vai ao ar:

1. `dev` está consistente, buildando, com todas as migrations da versão já validadas por um `supabase db reset` do zero.
2. **Mesclar `dev` em `main`** e taguear a versão nesse commit: `git tag -a v2.x.y -m "..."` (ver [`versionamento.md`](./versionamento.md)). Merge, push do banco e tag são o **mesmo evento** — é o único dia em que `main` se move.
3. **Linkar:** `npx supabase link --project-ref <REF>`.
4. `npm run prod:push:dry` → **ler a lista inteira.** Ela contém todas as migrations acumuladas desde a última release. Se aparecer alguma que você não reconhece, pare.
5. `npm run prod:push` — intencionalmente, sabendo o que vai subir.
6. Publicar o frontend da mesma versão, e as edge functions se mudaram (`npx supabase functions deploy`).
7. **`npm run prod:unlink`** — desarma o repo de novo.

O passo 7 não é opcional nem cerimônia: é ele que garante que, no dia seguinte, um `db reset` distraído não tenha como alcançar a produção.

O que **nunca** se faz: alterar schema pelo dashboard do supabase.com. Foi exatamente isso que a era Lovable fez, e é a origem de todo o drift documentado (GRANTs ausentes, os 7 cargos fantasma). Mudança feita no dashboard não existe em migration nenhuma, e o próximo banco nasce sem ela.

## Dados: o banco local merece o mesmo cuidado que produção

O `seed.local.sql` e o banco local carregam **dados reais**: CPF, PIS, conta bancária, chave PIX e hashes de senha de pessoas de verdade. Isso não é dado de teste. Nada disso é versionado ([`.gitignore`](../.gitignore)), e um vazamento é incidente de dados pessoais.

Fluxo de dados aceito: **produção → local** (dump, para desenvolver contra o real). O caminho inverso, **local → produção**, é aceito uma única vez: o bootstrap do passo 4 acima. Depois disso, produção passa a ser a dona dos dados, e local nunca mais escreve nela.
