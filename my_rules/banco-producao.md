# Banco de Produção — Regras de Transição e Operação

Regras para o banco de **produção da v2**: o projeto **`zugigdpuxbpogoepdawm`** no supabase.com (us-west-2, PG 17.6.1.155, plano Free), que substitui o projeto da era Lovable (`dqslqfzqukcahogkieet`).

> 🟢 **Ele EXISTE desde 2026-08-08 e está provado por login real desde 2026-08-10** — schema, dados, edge functions e Auth. O bootstrap não é mais pendência; ver a seção [Bootstrap](#bootstrap-do-banco-novo-na-primeira-subida-a-produção) e o registro em [`analises/concluidos/roadmap-bootstrap-banco-producao.yaml`](./analises/concluidos/roadmap-bootstrap-banco-producao.yaml).
>
> ⚠️ **Esta linha dizia "um projeto novo, criado em 2026-07-12".** Aquele projeto foi **descartado** (nunca recebeu schema nem dado, e recriar permitia escolher a região); o de produção é outro, criado em 08/08.

Leia junto com [`versionamento.md`](./versionamento.md) (a regra de nunca editar migration aplicada vale aqui em dobro) e [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md).

---

## O contexto que define tudo

Três fatos, e cada regra abaixo decorre deles:

1. **O banco antigo está congelado.** O site do Lovable não existe mais e **nada do sistema antigo responde** — ninguém escreve no banco antigo, logo o dump que temos **não envelhece** e não há corrida contra dados novos. ⚠️ **Esta frase dizia "e o projeto está temporariamente fora do ar", o que deixou de valer em 2026-08-13:** a **v2 está no ar** em `https://fevre.online`, falando com o banco novo. O congelamento é do **antigo**, e a partir daqui quem acumula dado novo é a produção da v2 — que **não tem backup nenhum**.
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

## O plano é o GRATUITO — o que isso muda

Decidido em 2026-08-08: o projeto de produção da v2 nasce no **plano Free** do supabase.com. As cotas foram medidas contra o banco local no mesmo dia, e **cabem com folga que não volta a ser pergunta**:

| Cota do Free | Limite | Nosso número (medido 2026-08-08) |
|---|---|---|
| Tamanho do banco | 500 MB | **26 MB** o local inteiro; produção nasceu com **13 MB** (medido 08/08 depois da carga) |
| Usuários ativos/mês | 50.000 | **15** em `auth.users` |
| Storage de arquivos | 1 GB | **0** — nenhuma migration cria bucket, o app não usa |
| Egress | 5 GB/mês | folgado nesta escala |

⚠️ **O dump não traz os candidatos.** O banco local tem 26 MB porque carrega 7.591 candidatos importados por planilha — mas não há `INSERT INTO public.candidatos` no `seed.local.sql`. Produção nasce **sem candidato nenhum**, e eles entram pela importação, com o sistema já no ar. Ao validar o bootstrap, `/candidatos` vazia é o **resultado correto**, não falha de carga.

🔵 **Esta tabela dizia "produção nasce com ~5 MB" — o medido depois da carga foi 13 MB.** A previsão estimou por linhas do dump e ignorou o custo fixo de 26 tabelas com índices, constraints e catálogos, que existe **com tabela vazia**. Não muda decisão nenhuma (13 MB são 2,6% do limite), mas a folga real é ~38×, não ~100× — e a lição é a do §9 do CLAUDE.md: **contagem de linhas não prediz tamanho de banco.**

🔵 **O limite de e-mail do Free não atinge este sistema, e isso não é óbvio.** O SMTP embutido do Supabase é 2 mensagens/hora e **só entrega para endereços de membros do time** — o que seria fatal para um sistema que convida fiscais por e-mail. Mas nenhum fluxo daqui depende dele: `_shared/enviar-link-acesso.ts` usa `auth.admin.generateLink`, que **gera o link sem enviar nada**, e o envio vai pela Edge Function `send-email` → SMTP da Hostinger. `create-admin` e `create-coordenador` criam a conta com `email_confirm: true` (nenhum e-mail). O único caminho nativo, `supabase.auth.signUp` em `src/hooks/useAuth.tsx`, **nunca é chamado**. Ainda assim, cadastre o SMTP da Hostinger como *Custom SMTP* no dashboard (passo 6): é grátis, e cobre convite disparado pelo próprio dashboard.

### 🔴 As duas lacunas do Free

Ficam **documentadas, não mitigadas** (decisão do usuário em 2026-08-08). Não há procedimento para elas; há o custo, que precisa estar consciente:

- **O projeto pausa após 1 semana de inatividade.** O perfil de uso deste sistema é exatamente o que dispara isso: rajada perto da prova, meses de silêncio depois. Despausar é manual, pelo dashboard. ⚠️ Abrir o dashboard **não** conta como atividade; o que conta é requisição ao projeto. 🔵 **E pausa não é o único jeito de sair do ar** — ver [O segundo modo de falha](#o-segundo-modo-de-falha-site-no-ar-dado-morto-2026-09-10), cujo sintoma é quase o oposto.

  🔴 **ACONTECEU em 2026-09-08** — deixou de ser hipótese. O sistema saiu do ar e o projeto foi despausado à mão. Ver a seção [O keep-alive](#o-keep-alive--como-a-pausa-passou-a-ser-mitigada) logo abaixo, que é a mitigação que nasceu daí.

  🔵 **E o sintoma descrito aqui estava ERRADO.** Esta linha dizia que projeto pausado dá *"o **mesmo sintoma** do bundle apontado para o Supabase errado — a página carrega, o login aparece, tudo falha —, o que torna o diagnóstico confuso"*. **É o contrário: o sintoma é distinto e diagnostica na hora.** O hostname do projeto some do DNS e passa a dar **NXDOMAIN autoritativo** (medido contra `1.1.1.1` e `8.8.8.8`, com SOA do próprio `supabase.co`), então o navegador **nem chega a fazer requisição** — o erro é *"Network error when attempting to fetch resource"*. Bundle apontado para o Supabase errado é o oposto: o nome **resolve** e a falha vem depois. Um `dig` separa os dois casos em segundos.

  ⚠️ **Restore não é instantâneo, e a ordem importa.** Medido em 08/09: o **DNS voltou em ~4min15**; o Auth só respondeu 200 aos **90s** seguintes (antes, 502) e o PostgREST aos **150s** (521 → 404 com o schema cache carregando → 401). Ou seja: ver o DNS voltar **não** é ver o sistema voltar. Espere os serviços.

  🔴 **A armadilha que sobra depois do restore: cache negativo de DNS.** O SOA de `supabase.co` publica TTL negativo de **30s**, então resolvedores que respeitam o padrão se curam sozinhos em meio minuto — mas **roteadores domésticos frequentemente ignoram o TTL**. Em 08/09 o roteador do usuário segurou o NXDOMAIN muito além disso, e o site seguiu quebrado **só para ele** enquanto já funcionava para o resto. Diagnóstico: comparar `dig @1.1.1.1 <ref>.supabase.co` com `dig @<ip-do-roteador> …`. Conserto: trocar o DNS da máquina, ou reiniciar o roteador.
- **Não há backup nenhum** — nem diário, nem PITR, nem download. Isso tensiona a regra "produção passa a ser a dona dos dados": o `seed.local.sql` cobre só o estado de 03/08, e tudo cadastrado depois existe em um lugar só. ⚠️ E este é um banco onde `DELETE` em massa é operação **normal** de negócio (a importação de candidatos é troca total). Se um dia entrar no escopo, a saída é `pg_dump` periódico — mas um dump novo nasce sem as três correções manuais, então a rotina precisa ser desenhada, não improvisada.

⚠️ **O Free admite 2 projetos ativos por organização.** Antes de criar o projeto da v2, confira o que ocupa as vagas (o projeto do Lovable e o criado em 2026-07-12) e apague o que não serve — senão a criação é recusada no meio do roteiro. 🔴 **Não apague o projeto do Lovable antes de confirmar que o dump abre**: ele não é versionado e passa a ser a única cópia dos dados de 771 colaboradores com PII real.

## O keep-alive — como a pausa passou a ser mitigada

Criado em **2026-09-08**, depois da pausa que tirou o sistema do ar. Três peças, e a terceira **não mora neste repositório**:

| Peça | Onde | O quê |
|---|---|---|
| Tabela `public.saude_banco` | `supabase/migrations/20260908225513_criar_saude_banco.sql` | uma linha **por dia** (upsert, com contador `batidas`), RLS de leitura fechada em admin |
| Função `registrar_batida_saude()` | mesma migration | faz o upsert numa operação atômica. `EXECUTE` **revogado** de `PUBLIC`/`anon`/`authenticated`, concedido só à `service_role` |
| Edge Function `keep-alive` | `supabase/functions/keep-alive/index.ts` | chama a RPC com a `service_role` **injetada pela plataforma** |
| **O cron diário** | 🔴 **fora daqui** — servidor Ubuntu / `configura_server_gestaoconcurso` | é o gatilho; sem ele nada disso bate |

**Por que o gatilho é externo:** um agendador dentro do banco (`pg_cron`) morreria junto com o que deveria prevenir — projeto pausado não roda cron nenhum. (E `pg_cron` nem está habilitado: nenhuma migration cria extensão.) O servidor que já serve o `fevre.online` está sempre ligado e é independente do Supabase.

**Por que Edge Function e não RPC chamado direto pelo cron:** um RPC alcançável de fora exigiria `GRANT EXECUTE … TO anon`, reabrindo a superfície do `anon` — a mesma família do vazamento de 31/07. A EF escreve com `service_role` sem conceder nada ao `anon` **e sem guardar a chave poderosa no servidor**.

```
17 4 * * *  curl -fsS -X POST https://<ref>.supabase.co/functions/v1/keep-alive \
  -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $PUBLISHABLE_KEY" \
  -H "x-keep-alive-token: $KEEP_ALIVE_TOKEN" >> /var/log/keep-alive.log 2>&1
```

Diário, não semanal: o limite é 7 dias, então uma batida por dia dá margem de **7×** — várias podem falhar sem consequência. O `-f` faz o curl sair com erro em status não-2xx, para a falha **aparecer no log** em vez de passar batida.

🔴 **O secret `KEEP_ALIVE_TOKEN` precisa ser cadastrado** (`supabase secrets set`). Sem ele a função responde **503 e recusa** — deliberadamente o **inverso** do defeito do `SITE_URL`, que caía num default silencioso e respondia sucesso. Aqui a ausência do secret é barulhenta.

⚠️ **O que isto NÃO prova:** que a pausa foi evitada. Uma escrita real disparada de fora é o mais próximo que dá para construir do critério *"requisição ao projeto"*, mas a confirmação é **empírica** — passar mais de 7 dias sem uso e o projeto seguir ativo. **O detector é a própria tabela: se a linha mais recente tiver mais de 2 dias, o keep-alive está quebrado** — e nada mais avisa, porque o cron vive fora daqui.

## O segundo modo de falha: site no ar, dado morto (2026-09-10)

Até 08/09 este doc conhecia **um** jeito de o sistema sair do ar: a pausa por inatividade. Em 10/09 apareceu outro, com sintoma **quase oposto** — e confundir os dois manda consertar a coisa errada.

**O que se viu:** `fevre.online` respondendo `200` normalmente, o hostname do projeto resolvendo no DNS, e **toda** requisição de dado morrendo. No dashboard, o próprio SQL Editor devolvia `Connection terminated due to connection timeout` — nem de dentro dava para consultar.

🔴 **O sinal que fecha o diagnóstico é o `PGRST002`.** Uma consulta real à API devolve:

```
{"code":"PGRST002","message":"Could not query the database for the schema cache. Retrying."}
```

Isso é o **PostgREST do próprio Supabase**, hospedado ao lado do banco, dizendo que não alcança o Postgres. Nenhuma configuração nossa pode causar nem consertar isso.

⚠️ **Foi incidente da plataforma, e a classe afetada era a nossa.** O `status.supabase.com` registrava *"Unresponsive Projects — **Nano** projects becoming unresponsive after a period of time, typically hours"*, impacto `major`, componente `Database`. Plano Free = instância **Nano**. **Antes de investigar qualquer coisa, confira o status da plataforma** — custa uma requisição:

```bash
curl -s https://status.supabase.com/api/v2/incidents/unresolved.json | grep -o '"name":"[^"]*"'
```

### Como separar os três modos em segundos

| Sintoma | DNS do projeto | Site | Consulta de dado | É |
|---|---|---|---|---|
| `Network error when attempting to fetch` | **NXDOMAIN** | fora | nem sai | **projeto PAUSADO** (08/09) |
| Site carrega, dado falha, `PGRST002` | resolve | `200` | timeout / `503` | **banco inacessível** — incidente ou sobrecarga (10/09) |
| Site carrega, dado falha, erro de auth | resolve | `200` | `401`/`404` coerente | **bundle apontando para o Supabase errado** |

A sonda que produz a linha do meio, sem `supabase link` e 100% leitura:

```bash
set -a; . ./.env.production; set +a
curl -s -H "apikey: $(echo $VITE_SUPABASE_PUBLISHABLE_KEY | tr -d '"')" \
  "$(echo $VITE_SUPABASE_URL | tr -d '"')/rest/v1/saude_banco?select=dia&limit=1"
```

🔴 **Leia o CORPO, não só o código HTTP — e o `401` sozinho NÃO prova nada.** `GET /rest/v1/` **sem** `apikey` devolve `401` em 0,1s mesmo com o banco morto: quem responde é a borda, que nunca toca o Postgres. Durante todo o incidente essa sonda esteve verde. O que prova banco vivo é o corpo trazer **SQLSTATE do Postgres**:

- `{"code":"42501","message":"permission denied for table saude_banco"}` → **o Postgres executou e negou** (o `anon` não tem grant nesta tabela, de propósito). Banco vivo.
- `{"code":"PGRST002",...}` → PostgREST não alcança o banco. Banco fora.
- `{"message":"No API key found in request"}` → você esqueceu a chave; a borda respondeu e nada foi medido.

### O desfecho de 10/09 — quem restabeleceu foi o RESTART, não o rollout

| Momento (UTC) | Fato |
|---|---|
| 15:26 | Supabase abre o incidente (`investigating`) |
| 15:46 | `identified`, mitigação em implantação |
| 17:59 | *"rollouts bem-sucedidos nas primeiras regiões, prosseguindo globalmente"* |
| ~19:01 | o usuário percebe o sistema fora |
| 19:23 | medido daqui: 3× timeout de 30s e `503` com `PGRST002` |
| **19:41** | **Supabase: *"fix em todas as regiões… **Users still affected are encouraged to restart their projects**"*** |
| 23:37 | restart manual pelo dashboard |
| 23:38–23:40 | serviços subindo: `521` → `502` → `521` |
| **23:41:43** | **`42501` — banco vivo.** ~4h40 fora, contadas da primeira observação |

🔴 **A lição operacional está no update das 19:41: o fix previne RECORRÊNCIA, não ressuscita quem já travou.** Um projeto preso continua preso até alguém clicar em **Project Settings → General → Restart project**. Esperar não resolve — foram 3h45 de sondagem contínua, 180 tentativas, todas `000`, entre o rollout global e o restart.

⚠️ **E o erro de leitura que causou essa espera:** *"fix rolled out across all regions"* soa como fim, e a instrução para os afetados vinha **na mesma frase, depois**. **Leia o último update inteiro antes de decidir esperar** — a instrução acionável pode chegar depois do anúncio que parece encerrar o caso.

🔵 **A assinatura da volta é reconhecível** e vale como referência: `000` → `521` → `502` → `521` → `401`, em ~4 minutos. Bate com o padrão medido no restore de 08/09 (`521` → `404` com o schema cache carregando → `401`). **Ver o primeiro `521` não é ter voltado; é ter começado a voltar.** Espere o corpo trazer SQLSTATE.

### O beco sem saída que custou tempo

Junto veio um segundo aviso do dashboard — *"seu projeto está prestes a esgotar o Orçamento de E/S de Disco"* — e o assistente de IA do Supabase produziu um texto longo sobre `CONNECTION TERMINATED DUE TO CONNECTION TIMEOUT` (arquivado em `docs/errors/`). Ele lista string de conexão, modo de pooler (porta 6543), `connection_limit`, `pool_timeout`, `connect_timeout` — **tudo inaplicável aqui**: é resposta escrita para um cenário Prisma/serverless, e este sistema não tem pool próprio, nem servidor de aplicação, nem Prisma. O front é bundle estático falando PostgREST.

🔴 **A lição é sobre a FORMA do texto, não sobre o Supabase.** Resposta genérica de assistente enumera causas plausíveis **sem medir nenhuma**, e lida com pressa vira roteiro de mudanças em produção que não tinham o que consertar. O `PGRST002` e a página de status responderam em **duas requisições** o que aquele documento não responderia nunca.

### O aviso de E/S: metade respondida, metade perdida para sempre

Medido depois da volta, com `docs/diagnostico-io-banco-producao.sql` (100% leitura, SQL Editor, sem `link`):

🟢 **Leitura está descartada como causa, e isso é estrutural.** B5 deu `cache_pct` **99,92%**, `shared_buffers` de **224 MB** (28672 × 8 kB) e banco de **14 MB** — cabe **~16×** no cache. Depois do aquecimento, o disco não é mais tocado para ler. Vale hoje e vale sempre, enquanto o banco for deste tamanho.

🔴 **A metade da escrita é IRRECUPERÁVEL, e a culpa é do próprio conserto.** O restart que trouxe o banco de volta descartou as estatísticas cumulativas, então B1 e B2 perderam a janela do estouro. **O ato de restabelecer o serviço destrói a evidência de por que ele caiu** — e não há como ter os dois. Se acontecer de novo e a causa importar mais que o minuto de indisponibilidade, **colete B1/B2 ANTES de reiniciar**; se o banco não responder nem para isso, aceite que a resposta se perdeu.

⚠️ Sobra, sem prova: o aviso pode ter sido causa independente ou **sintoma do mesmo defeito da plataforma nos Nano**. Não houve importação no período — a única operação deste sistema que move E/S de verdade — e `candidatos` estava (e está) em zero, o que enfraquece a hipótese de escrita nossa. **Pergunta aberta, não causa conhecida.**

## Bootstrap do banco novo (na primeira subida a produção)

> 🟢 **ESTE ROTEIRO JÁ FOI EXECUTADO — 2026-08-08 (passos 0 a 5, 7 a 9) e 2026-08-10 (passo 6 + o login real).** O banco de produção da v2 existe em **`zugigdpuxbpogoepdawm`** (us-west-2, PG 17.6.1.155, plano Free), com as 122 migrations, os dados carregados (controle positivo 12/12), as 8 edge functions com secrets, o Auth parametrizado e o **login real aprovado**. O repo terminou **deslinkado**.
>
> 🔵 **Desde então, produção recebeu mais dois lotes**, ambos pelo ritual de release: as **2** migrations do keep-alive em **2026-09-09** (`v2.0.0`) e as **2** de `colab_nome_busca` + `totais_da_prova` em **2026-09-10** (`v2.1.0`). São **126** migrations hoje — ⚠️ **não confie neste número**, ele envelhece a cada release; confira com `ls supabase/migrations/*.sql | wc -l` e com o `prod:push:dry`, que é quem sabe o que falta lá.
>
> ⚠️ **Ele fica aqui como roteiro, não como pendência.** Vale para uma eventual recriação do banco — e os passos que dependem de estado (0, 1, 2) só se repetem nesse caso. O registro do que foi medido e do que deu errado na execução está em [`analises/concluidos/roadmap-bootstrap-banco-producao.yaml`](./analises/concluidos/roadmap-bootstrap-banco-producao.yaml).
>
> 🔴 **O dia a dia agora é outro:** produção **existe** e é dona dos dados. A regra do topo deste arquivo passa a ter dente — migrations acumulam em `dev` e só sobem em release estável tagueada, com `prod:push:dry` antes.

Ordem importa. Não pule o passo 2.

0. **Criar o projeto** no supabase.com, plano Free — a região não se muda depois sem recriar o projeto. Guarde a senha do Postgres (ela só aparece uma vez) e confira que o Postgres é o **17**, o `major_version` do `config.toml`. Leia antes a seção do plano gratuito acima: o limite de 2 projetos ativos pode recusar a criação.

   ⚠️ **Este passo pedia São Paulo (`sa-east-1`) e a execução saiu em `us-west-2` (Oregon)** — decisão consciente do usuário em 2026-08-08, com o custo apresentado antes: usuários no Brasil pagam ~180 ms de ida e volta contra ~15 ms, empilhados nas telas que consultam em sequência (importação de candidatos, alocação por arrasto). **Não é erro a corrigir**; é a decisão D5 do roadmap. Se um dia a latência incomodar, mudar de região custa este roteiro inteiro de novo — mais o dado que produção já tiver acumulado.

1. **Linkar** o repo ao projeto novo: `npx supabase link --project-ref <REF_DO_PROJETO_NOVO>`.

   ⚠️ Não se assuste com o `project_id = "dqslqfzqukcahogkieet"` no `config.toml`: ele é herança do projeto Lovable e serve **só** para nomear os containers Docker locais (`supabase_db_dqslqfzqukcahogkieet`) — não é ele que define o projeto remoto. Quem faz isso é o `link`, que grava a ref em `supabase/.temp/`. Mudar o `project_id` renomearia os containers e recriaria o banco local à toa; deixe como está.
2. **Conferir antes de escrever:** `npm run prod:push:dry`. O banco novo está vazio, então o dry-run deve listar **todas** as migrations do repo — confira o total com `ls supabase/migrations/*.sql | wc -l` na hora (eram **122** em 2026-08-08). Se listar menos, pare: significa que o banco não é o que pensamos. **Não confie no número escrito aqui** — ele envelhece a cada migration nova, e o comando não.
3. **Aplicar o schema:** `npm run prod:push`. Isso cria tudo, inclusive os GRANTs da `20260712010000_grant_api_roles_table_privileges.sql` (sem eles o login autentica mas a UI nunca avança) e os **7 registros de `funcoes_colaboradores`** (`20260712134220_seed_funcoes_basicas_sistema.sql`). ⚠️ Esta linha dizia *"os 7 cargos básicos"*, e a palavra estava errada: **não é `public.cargos`**, que é do módulo Candidatos e que **nenhuma migration semeia**. Em 10/09 a confusão custou tempo — ver `cargos = 0` em produção parece perda de dado e não é.
4. **Carregar os dados** de produção, uma vez, a partir do dump: `supabase/seed.local.sql` (gitignored). Ele traz `public.*` mais `auth.users` e `auth.identities` — é o que faz os logins antigos continuarem funcionando. Todos os INSERTs têm `ON CONFLICT`, então recarregar não quebra. Carregue com `psql` na connection string do projeto novo, **não** via `db push`. 🔵 **O dump NÃO traz candidatos** — nem `candidatos`, nem `candidatos_alocacao`, nem `cargos` (medido no dump de 03/08: 771 `colaboradores`, 554 `colaboradores_prova`, 42 `sala_prova`, e **zero** das três). Logo **produção nasce e permanece com esses três em zero até a primeira importação**, que é operação de véspera de prova. Confirmado em 10/09 por `count(*)`: 774/576/42 povoadas, as três em 0. **Isso é o esperado, não perda.** ⚠️ **O dump precisa carregar as duas correções manuais** (e-mails duplicados zerados + coluna `colab_codigo_acesso` removida dos INSERTs) — senão o passo quebra (a segunda com `column "colab_codigo_acesso" does not exist`, porque as migrations do passo 3 já dropam a coluna). Detalhes em [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md). O dump local desta máquina já as tem; um dump **novo** (via `export-seed`) nasce sem elas.
5. **Rodar o `supabase/seed.pos.sql`** (versionado), com `psql`, na mesma connection string — **depois** da carga do passo 4 e **nunca antes**. Ele contém as operações de dados que só fazem sentido com o dump já carregado; hoje, o backfill que vincula os 12 colaboradores que já são usuários (a cúpula: 2 admins + 10 coordenadores) às contas do Auth. **Pular este passo faz a cúpula nascer sem `user_id` e sem o papel `colaborador`** — eles continuariam entrando como admin/coordenador, mas ficariam sem acesso aos próprios dados de colaborador, e o erro é silencioso. É idempotente: rodar duas vezes não faz efeito. Por que não é migration: `db push` aplicaria o backfill **antes** do passo 4, contra tabelas vazias, casando zero linhas — e migration não roda duas vezes. Ver [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md).
6. **Configurar o auth no dashboard** — isto **não** vem do `config.toml` e é fácil esquecer: confirmação de e-mail **ligada**, `site_url` do domínio real, e **redirect URLs incluindo as rotas internas do domínio** (ex.: `https://SEU_DOMINIO/**`) — sem isso, os links de recuperação de senha e o invite da reivindicação (subetapa 2B) caem no `site_url` em vez de `/redefinir-senha`, e o fluxo trava. Signup fechado se o cadastro for só por convite. **Cadastre o SMTP da Hostinger como Custom SMTP** (`smtp.hostinger.com`:465, as mesmas credenciais do passo 7) — o app não passa por ele, mas sem isso o SMTP embutido entrega 2 mensagens/hora e só para endereços do time. **Verifique também os Rate Limits nativos do Auth** (limite de e-mails transacionais e requisições de token), ajustando-os conforme as cotas do plano para evitar bloqueios de login em dias de pico; com Custom SMTP o padrão de e-mail sobe de 2 para 30 por hora. O `additional_redirect_urls` do `config.toml` cobre só o dev local; produção é configurada aqui.
7. **Publicar as edge functions:** `npx supabase functions deploy` (as **8** de `supabase/functions/` — o nono diretório é `_shared` e não é function) e cadastrar os secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` **e `SITE_URL`**. `db push` não publica function nenhuma.

   🔴 **`SITE_URL` faltava nesta lista até 2026-08-06, e a omissão é do tipo que não denuncia.** `supabase/functions/_shared/enviar-link-acesso.ts` faz `Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:8080'` e usa o valor em `redirectTo: ${siteUrl}/redefinir-senha`. Sem o secret, o fallback entra calado e **todo convite e toda recuperação de senha nasce apontando para `localhost`** — a função responde sucesso, o e-mail chega, e só o destinatário descobre. O valor tem de ser o domínio real, e o `${SITE_URL}/redefinir-senha` precisa estar nas redirect URLs do passo 6.

   ⚠️ **Não cadastre `SUPABASE_URL`, `SUPABASE_ANON_KEY` nem `SUPABASE_SERVICE_ROLE_KEY`** — a plataforma os injeta. (`JWT_SECRET` aparece só em `_shared/test-utils.ts`; é de teste local, não de produção.) ⚠️ **A `recuperar-senha` é obrigatória desde 2026-07-20:** o "esqueci minha senha" deixou de ser o fluxo nativo e passou a depender dela. Se ela não subir, **a recuperação de senha simplesmente não funciona em produção** — e a tela não denuncia, porque a resposta é genérica por desenho (anti-enumeração). `SMTP_HOST` é `smtp.hostinger.com` (já esteve com typo `mtp.`) na porta `465`.
8. **Apontar o frontend:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do build de produção passam a ser os do projeto novo. O lugar disso é um **`.env.production`** na raiz do repo (gitignored).

   🔴 **Não basta editar o `.env`.** O Vite tem precedência entre arquivos, e o `.env.local` desta máquina aponta para o Docker local. Medido em 2026-08-08: sem `.env.production`, o build sai com `http://127.0.0.1:54321` **7 vezes** e com a chave anon local **11 vezes** — e o site publicado carrega, mostra o login e falha em toda requisição, sem erro nenhum no deploy. **`.env.production` vence o `.env.local`** (medido; é o contrário do que a intuição sugere), e não precisa de `--mode production`. O `deploy.sh` do ferramental confere o **bundle** e recusa publicar se achar a URL ou a chave locais. Ver [`hospedagem-e-deploy.md`](./hospedagem-e-deploy.md).
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
6. Publicar o frontend da mesma versão, e as edge functions se mudaram (`npx supabase functions deploy`). O frontend tem roteiro próprio em [`hospedagem-e-deploy.md`](./hospedagem-e-deploy.md) — **banco primeiro, site depois**, nunca o inverso.
7. **`npm run prod:unlink`** — desarma o repo de novo.

O passo 7 não é opcional nem cerimônia: é ele que garante que, no dia seguinte, um `db reset` distraído não tenha como alcançar a produção.

O que **nunca** se faz: alterar schema pelo dashboard do supabase.com. Foi exatamente isso que a era Lovable fez, e é a origem de todo o drift documentado (GRANTs ausentes, os 7 cargos fantasma). Mudança feita no dashboard não existe em migration nenhuma, e o próximo banco nasce sem ela.

## Dados: o banco local merece o mesmo cuidado que produção

O `seed.local.sql` e o banco local carregam **dados reais**: CPF, PIS, conta bancária, chave PIX e hashes de senha de pessoas de verdade. Isso não é dado de teste. Nada disso é versionado ([`.gitignore`](../.gitignore)), e um vazamento é incidente de dados pessoais.

Fluxo de dados aceito: **produção → local** (dump, para desenvolver contra o real). O caminho inverso, **local → produção**, é aceito uma única vez: o bootstrap do passo 4 acima. Depois disso, produção passa a ser a dona dos dados, e local nunca mais escreve nela.
