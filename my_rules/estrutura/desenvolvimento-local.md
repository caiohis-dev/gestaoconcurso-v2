# Ambiente de Desenvolvimento Local (Supabase via Docker)

> Ver [`00-indice.md`](./00-indice.md). Complementa [`arquitetura-geral.md`](./arquitetura-geral.md) (não há backend próprio — tudo aqui é sobre rodar o próprio Supabase localmente) e [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md) (o gotcha do seed de funções).

## Pré-requisitos (não incluídos neste repo)

- **Docker** (Engine + Compose) — o stack local do Supabase (Postgres, Auth/GoTrue, PostgREST, Realtime, Storage, Studio, Kong, servidor de e-mail de teste, runtime de Edge Functions) roda inteiramente em containers. Instalação exige privilégio de root/sudo interativo — não é algo que deva ser automatizado a partir de uma sessão de agente; instale manualmente (`https://docs.docker.com/engine/install/ubuntu/` no caso de Ubuntu) e garanta que `docker info` funciona sem erro antes de prosseguir.
- **Supabase CLI** — já adicionado como devDependency em `package.json` (`supabase`). Depois de `npm install`, o CLI fica disponível via os scripts abaixo. Alternativamente, qualquer comando pode ser rodado ad-hoc com `npx supabase@2.109.1 <comando>` sem instalar nada global. (O projeto tinha `bun.lock`/`bun.lockb` herdados do scaffold inicial, mas o fluxo real é npm — os lockfiles do bun foram removidos em 2026-07-11; `package-lock.json` é a única fonte da verdade agora.)

## Scripts adicionados ao `package.json`

| Script | O que faz |
|---|---|
| `npm run supabase:start` | Sobe o stack local (Docker) |
| `npm run supabase:stop` | Derruba o stack local |
| `npm run supabase:status` | Mostra URLs/chaves do stack local em execução |
| `npm run supabase:reset` | Recria o banco local do zero: roda todas as migrations de `supabase/migrations/` + `supabase/seed.sql` + `supabase/seed.local.sql` (este último não versionado — ver seção própria) |
| `npm run supabase:link` | Vincula o projeto local ao projeto remoto (`dqslqfzqukcahogkieet`) — necessário para `db pull`/`db diff` contra produção |
| `npm run supabase:diff` | Gera uma nova migration a partir da diferença entre o schema local e o banco local em execução |
| `npm run supabase:functions:serve` | Roda as Edge Functions localmente, lendo secrets de `supabase/functions/.env` |

## Passo a passo

1. Instalar e iniciar o Docker (fora do escopo deste repo — feito manualmente).
2. `npm install` (para trazer o `supabase` CLI listado em devDependencies).
3. Login (interativo, via browser — não tem script no `package.json` por não fazer sentido automatizar): `npx supabase login`.
4. `npm run supabase:link` (opcional, só necessário para sincronizar com o remoto via `db pull`/`db diff`; **não é necessário só para rodar migrations locais**, que já estão todas versionadas em `supabase/migrations/`).
5. `npm run supabase:start` — primeira execução baixa as imagens Docker (pode demorar) e ao final imprime `API URL`, `anon key`, `service_role key`, `Studio URL`, etc.
6. `npm run supabase:reset` — aplica as ~67 migrations existentes + `supabase/seed.sql` + `supabase/seed.local.sql` numa base zerada. O `seed.local.sql` **não vem no repositório** (é o dump de produção, com PII — ver seção própria abaixo): se ele não existir na sua máquina, este passo falha, e você precisa removê-lo de `sql_paths` no `config.toml` ou gerar um dump novo (ver seção própria abaixo).
7. Copiar a `anon key` impressa no passo 5 (ou via `npm run supabase:status`) para `VITE_SUPABASE_PUBLISHABLE_KEY` em `.env.local` (arquivo já criado na raiz, gitignored). O Vite carrega `.env.local` com prioridade sobre `.env` automaticamente — nenhuma outra mudança de config é necessária para alternar entre local e produção; basta esse arquivo existir ou não.
8. `npm run dev` — a partir daqui o frontend fala com o Supabase local (Postgres real em `127.0.0.1:54322`, Studio em `127.0.0.1:54323`, e-mails de teste em `127.0.0.1:54324`).
9. Para desenvolver Edge Functions localmente: copiar `supabase/functions/.env.example` para `supabase/functions/.env`, preencher credenciais de teste (não as de produção), e rodar `npm run supabase:functions:serve` em paralelo ao stack principal.

## Gotcha (resolvido em 2026-07-12): `funcoes_colaboradores` básicas

Histórico, porque explica a forma da solução: as migrations originais só tinham um `UPDATE ... WHERE id IN (...)` marcando 7 UUIDs de `funcoes_colaboradores` como "básicos do sistema" (`cargo_editavel = false`) — nunca um `INSERT`. Esses 7 registros (Coordenador Geral, Auxiliar de Coordenação, Coordenador de Pagamento, Enfermeiro, Equipe de Apoio, Fiscal, Motorista) foram criados à mão no banco remoto, pelo dashboard, fora do fluxo de migrations.

Dois desses UUIDs estão **hardcoded no frontend** (`FUNCOES_COORDENACAO` em `src/hooks/useCoordenadoresProva.tsx`, ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md)). Sem esses registros, o fluxo de elegibilidade/concessão de acesso de coordenador fica silenciosamente quebrado (lista de elegíveis sempre vazia, sem erro).

Eles moraram no `seed.sql` até 2026-07-12, quando viraram a migration **`20260712134220_seed_funcoes_basicas_sistema.sql`** (`INSERT ... ON CONFLICT (id) DO NOTHING`, com os CBOs reais de produção). O motivo da mudança é a regra central de [`../banco-producao.md`](../banco-producao.md): **seed não roda em `supabase db push`** — só migration chega em produção. Enquanto viviam no seed, o banco de produção da v2 nasceria sem eles.

A lição generalizável: **dado de referência do qual o código depende é migration, não seed.** Seed é só dado de exemplo de dev.

A tabela `bancos` (catálogo de bancos para dados de pagamento) já é populada via migration própria (`INSERT ... ON CONFLICT DO NOTHING`), não precisa de seed adicional.

O `seed.sql` versionado não popula `colaboradores`, `provas`, `unidades_prova` etc. — sozinho, ele deixa dev local vazio nessas tabelas. Para dados reais, ver a seção seguinte.

## `seed.local.sql` — dump de produção (não versionado)

`[db.seed]` no `config.toml` carrega, além do `seed.sql`, um segundo arquivo: `supabase/seed.local.sql`. Ele é o dump completo da produção, gerado uma única vez em 2026-07-12 pela Edge Function `export-seed`, e existe para permitir desenvolver contra dados reais — 771 colaboradores, 2 provas, alocações, metas, ocorrências.

A `export-seed` **não existe mais** no projeto: era um canal de exfiltração da base inteira e foi aposentada assim que cumpriu o papel. O código dela está guardado em [`../historico/export-seed/`](../historico/export-seed/), com as instruções de como ressuscitá-la caso um dump novo seja necessário.

**Ele é `.gitignore`d e deve continuar assim.** Contém CPF, PIS, endereço, conta bancária e chave PIX de colaboradores reais, além dos hashes de senha de `auth.users`. Commitá-lo põe a base inteira no histórico do git, de onde não sai. O `.gitignore` cobre tanto `supabase/seed.local.sql` quanto o padrão `seed_*.sql` (nome com que a `export-seed` entrega o arquivo por e-mail).

Consequências práticas:

- **O arquivo não vem do repositório.** Num clone novo, `supabase db reset` **falha** enquanto `seed.local.sql` não existir. Ou remova o caminho de `sql_paths` no `config.toml` para rodar só com o `seed.sql` versionado, ou gere um dump novo redeployando a `export-seed` a partir de [`../historico/`](../historico/) (e removendo-a de novo em seguida).
- **A ordem em `sql_paths` importa**: `seed.sql` antes de `seed.local.sql`.
- O dump preserva os **UUIDs e os hashes de senha de produção**, então os logins reais funcionam em dev local. Isso é útil e perigoso na mesma medida — trate o banco local como se fosse produção.
- Todo `INSERT` do dump tem `ON CONFLICT DO NOTHING`, e o arquivo é envelopado em `SET session_replication_role = replica` para desligar triggers durante a carga (senão `on_auth_user_created` duplicaria `profiles`/`user_roles`).

## Gotcha importante: GRANTs não vinham das migrations (corrigido em 2026-07-12)

Sintoma, quando existia: você digitava e-mail e senha corretos, o login **não dava erro e não avançava** — a tela ficava parada. Senha errada, porém, dava erro de senha normalmente.

A causa era um drift entre produção e as migrations. Em produção o schema foi criado pelo dashboard do Lovable/Supabase, cujo DDL roda como `supabase_admin`; o *default privilege* desse role em `public` concede DML completo a `anon`/`authenticated`/`service_role`, então as tabelas nasceram acessíveis pela API — **mas esses `GRANT`s nunca foram registrados em migration nenhuma**. Localmente, `supabase db reset` aplica as migrations como `postgres`, cujo default privilege concede apenas `TRUNCATE`/`REFERENCES`/`TRIGGER`. Mesmas migrations, resultado diferente: 15 das 18 tabelas nasciam sem `SELECT`.

O sintoma enganava porque o PostgREST devolve `42501 permission denied` **antes** de avaliar a RLS. Então `useAuth.fetchUserRole` voltava vazio, `role` ficava `null`, e `AuthAdmin` — que só navega quando `user && role !== null` (`src/pages/AuthAdmin.tsx`) — parava sem erro. O login em si funcionava; era o passo seguinte que morria em silêncio.

Corrigido pela migration `20260712010000_grant_api_roles_table_privileges.sql`, que concede os privilégios e — importante — define `ALTER DEFAULT PRIVILEGES FOR ROLE postgres`, para que **tabelas criadas por migrations futuras não reintroduzam o bug**. Em produção a migration é um no-op.

Se um dia uma tabela nova voltar a dar 403/42501 pela API, é aqui que se olha: `RLS ativa + policy correta ainda não basta se o role não tiver GRANT na tabela`.

## Versão do Postgres

`config.toml` define `major_version = 17` (default do template atual do CLI). Isso **deve bater com a versão do Postgres do projeto remoto** — confirme no dashboard do Supabase (Settings > Database) ou rodando `SHOW server_version;` contra o banco remoto antes de assumir que está correto; não foi possível confirmar isso durante esta configuração por falta de acesso ao projeto remoto.

## O que ainda depende de ação manual do usuário (não automatizável por um agente)

- Instalação do Docker (sudo interativo).
- `supabase login` (fluxo OAuth via browser).

(Status em 2026-07-11: usuário confirmou que Docker/CLI já foram instalados e configurados do lado dele; `npm install` já foi rodado com sucesso nesta sessão também.)
