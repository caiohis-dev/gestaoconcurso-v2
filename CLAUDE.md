# CLAUDE.md — como trabalhar neste repositório

> ## 🔴 Abertura de sessão NÃO lê código
>
> **Ao abrir uma sessão, leia apenas documentação. Nenhum arquivo de `src/`, `supabase/functions/` ou `supabase/migrations/`.**
>
> **A primeira leitura de código é orientada pelo primeiro prompt** — é ele que diz qual módulo, qual regra, quais símbolos. Antes dele não há o que orientar, e qualquer leitura é chute caro.
>
> Isto vale inclusive para "só me situar": abrir `App.tsx`, varrer `src/pages/` ou listar hooks **antes de saber a tarefa** é exatamente o custo que este arquivo existe para eliminar. Para se situar, bastam `my_rules/estrutura/00-indice.md` e o `00-modulo.md` do módulo em questão — **quando** souber qual é.
>
> **A ordem, então, é:** prompt → doc da linha correspondente na §1 → **só então** o código, e só os símbolos que vai tocar.

> **A regra que governa o resto: o doc vem antes do código.** Diante de um pedido, abra o documento da linha correspondente na tabela abaixo e só então vá ao código **conferir os símbolos específicos que vai tocar**.
>
> **Varrer o codebase para "entender primeiro" é o caminho errado neste repo.** `my_rules/` existe para tornar isso desnecessário, e foi auditada inteira contra o código em 2026-07-26. Se o doc do módulo não bastou, isso é um **defeito do doc** — tape-o na mesma unidade de trabalho.

---

## 0. 🔴 O que NÃO ler por padrão

```
my_rules/analises/concluidos/**     3.913 linhas   temas entregues, roadmaps executados
my_rules/historico/**                             código aposentado
docs/bateria-*.sql                  ~1.400 linhas  ferramentas de verificação, não leitura
```

**O histórico é 3.934 linhas — mais que toda a documentação viva junta (2.966).** Carregá-lo para responder "o que o sistema é" ou "o que falta" é caro e piora a resposta: são verbos no presente descrevendo um mundo que já mudou.

**Só abra essas pastas quando o pedido for explicitamente sobre o passado:** *"por que ficou assim?"*, *"o que já se tentou?"*, *"reabrir o tema X"*, *"que alternativa foi rejeitada?"*. Fora disso, a resposta certa está em `estrutura/` (o que é) e `backlog.md` (o que falta).

As **baterias SQL** (`docs/bateria-*.sql`) são um caso à parte: não são histórico, são **ferramentas que se executam**. Abra quando for verificar uma regra de banco ou escrever caso novo — não para entender o sistema.

### ⚠️ Isto NÃO vale para anotação histórica pontual

Dentro de uma doc viva, um `⚠️` marcando que *aquela frase específica* mudou (*"até 30/07 era CASCADE"*, *"este caso afirmava o oposto"*) **fica e se lê**. Ele existe exatamente no ponto onde alguém leria a afirmação errada — apagá-lo não deixa a doc mais limpa, deixa a próxima pessoa enganada.

| Tipo de histórico | Onde vive | Lê por padrão? |
|---|---|---|
| **Bloco** — tema inteiro, decisão, roadmap entregue | `analises/concluidos/`, `historico/` | ❌ só sob pedido |
| **Ponto** — um `⚠️` marcando que esta frase mudou | inline, na doc viva | ✅ sempre |

---

## 1. Qual doc ler, por tipo de pedido

| Pediram… | Abra PRIMEIRO | Não faça |
|---|---|---|
| Mexer em / entender um **módulo** | `my_rules/estrutura/modulos/<id>/00-modulo.md` — o contrato | Não comece por `arquitetura-geral.md`, nem por grep |
| **Autorização**, papéis, login, RLS, guard de rota | `estrutura/transversais/auth-e-permissoes.md` **+** `src/pages/guards.test.tsx` (a matriz executável) | Não deduza papel lendo página por página |
| Implementar/mexer numa **regra de negócio**, constraint, exclusão | `estrutura/transversais/invariantes.md` — o mapa + a lista de 6 perguntas | ⚠️ Não implemente regra num `if` do hook: ela não vale para PostgREST, EF nem script |
| Escrever **teste** | `estrutura/transversais/testes.md` — as **8 armadilhas** | Não escreva antes de lê-las; várias já custaram retrabalho |
| **E-mail**, Edge Functions | `estrutura/transversais/integracoes-externas.md` | — |
| **Banco local**, migrations, seed, dump | `estrutura/transversais/desenvolvimento-local.md` | Não presuma a ordem de carga: migration ≠ `seed.pos.sql` ≠ dump |
| **Constraint** / regra no banco | `analises/concluidos/roadmap-db-constraints.yaml` + o módulo dono da tabela | Não crie CHECK sem **medir o dado existente** antes |
| Stack, rotas, o **hub/módulos** | `estrutura/transversais/arquitetura-geral.md` §6 | — |
| **O que falta fazer** | `my_rules/backlog.md` | — |
| **O que já foi feito** e por quê | `my_rules/analises/concluidos/backlog-itens-concluidos.md` | ⚠️ **Nunca como plano** — é histórico |
| **Por que é assim** / alternativa rejeitada | `my_rules/analises/` — leia o `README.md` dela antes | ⚠️ **Nunca como plano:** `concluidos/` é histórico |
| **Deploy / produção** | `my_rules/banco-producao.md` | Não confie em número escrito ali; confira na hora |

Mapa completo e a seção "Como manter": `my_rules/estrutura/00-indice.md`.

### Três avisos que valem mais que o mapa

1. **Doc é snapshot, não introspecção.** Antes de agir sobre algo que só o doc afirma, confirme que o arquivo/função/tabela existe. **Contagens envelhecem mais rápido que o resto** — trate como ordem de grandeza.

2. ⚠️ **Aviso envelhecido é pior que aviso nenhum** — ele tem autoridade. Na auditoria de 2026-07-26, quase toda afirmação falsa encontrada estava dentro de um bloco `⚠️` ou de um "princípio". **Ao consertar algo que um `⚠️` descreve, procure o aviso no mesmo passe.**

3. **Em `analises/concluidos/`, distinga dois erros diferentes:** *"era verdade e mudou"* e *"**nunca chegou a ser verdade**"*. O segundo costuma ser proposta que a implementação **rejeitou com motivo** — e é o que faz alguém "restaurar o plano original" e quebrar coisa.

### 🔴 O padrão que mais se repete: item de backlog com premissa errada

Aconteceu **quatro vezes**: guards lendo papéis de `modulos.ts` (teria **afrouxado** o acesso), papel `coordenador` sem vínculo ser "inofensivo", "dois `useEffect`" que eram **três**, e `anon` "cair em default deny" quando **8 policies o deixavam ler dado real**.

**Conferir a premissa no código antes de executar o item é obrigatório.** Na última vez, foi a diferença entre revogar um TRUNCATE e achar dado legível sem login.

---

## 2. Onde mora uma regra de negócio

**Se a regra é um `if` no hook, ela ainda não existe.** Pergunte sempre: o que acontece por `psql`, PostgREST direto, Edge Function com `service_role` ou script?

| Natureza da regra | Onde vai |
|---|---|
| Formato de campo | `CHECK` |
| Integridade entre tabelas | FK **`RESTRICT`** — nunca CASCADE por omissão |
| Cruza tabelas ou níveis | **trigger** (FK não expressa) |
| Vários passos | **RPC**, que roda em transação |

- **Barreira ≠ conveniência.** Botão desabilitado é sempre conveniência; só o banco é garantia.
- **A mensagem do banco tem de chegar ao usuário**, nomeando o que fazer. Já foi dívida duas vezes aqui.
- **Meça antes de apertar.** Se houver violação no dado existente, o saneamento vem antes — e mora no **dump**, não no `seed.pos.sql`.
- 🔴 **Teste com CONTROLE POSITIVO.** Provar que passou a recusar é **metade**; a outra é provar que continua permitindo o caso legítimo. Foi ele que pegou a semântica errada (`existe linha` vs `> 0`) na meta órfã.

**Por que este repo produz esse padrão:** o schema veio do dashboard do Lovable (CASCADE por omissão), quase toda escrita é PostgREST sem RPC no meio, e a RLS responde *"quem pode"*, não *"o que é coerente"*.

---

## 3. Schema, dado e seed — a divisão de três vias

**Correção de DADO não vai em migration. Só schema vai.**

| Onde | O que vai | Versionado? |
|---|---|---|
| `supabase/migrations/` | **schema** (coluna, índice, enum, constraint, RLS, função) | sim |
| `supabase/seed.pos.sql` | **dado exprimível como regra genérica** | sim |
| `supabase/seed.local.sql` (o dump) | **dado que é cirurgia em linhas específicas** (tem PII) | **não** |

**Por quê:** uma migration de correção de dados roda contra a tabela **ainda vazia** (no-op), e o seed logo em seguida reintroduz o problema. Em produção é pior: o bootstrap faz `db push` e **só depois** carrega o dump.

- ⚠️ **`seed.pos.sql` NÃO serve para satisfazer constraint** — ele roda *depois* do dump, e constraints vêm das migrations, que rodam *antes*. Dado que precisa caber numa CHECK tem de estar limpo **no dump**.
- Tudo no `seed.pos.sql` precisa ser **idempotente** e **seguro contra base vazia**.
- Em produção ele **não roda sozinho** — é passo manual do bootstrap. Esquecê-lo é falha **silenciosa**: schema certo, dado errado.
- Ao editar o dump, edite **posicionalmente pela coluna**, nunca por busca/substituição de texto: o mesmo valor aparece em colunas diferentes (uma colaboradora tem o e-mail gravado também como `colab_chave_pix`) e em tabelas de log histórico, que não se tocam.

### Migrations

- **Nunca edite uma migration já aplicada.** Isso é absoluto — integridade do histórico. Para remover algo, escreva uma migration nova de `DROP`.
- Use `npx supabase migration new <slug>` para o timestamp no padrão do projeto.
- Atualize o doc de `estrutura/` afetado **no mesmo passe**.

---

## 4. Ambiente local

O banco local carrega o **dump de produção**: PII real e hashes reais (logins de prod funcionam localmente). **Trate o banco local com cuidado de produção.**

🔴 **`sg docker -c '...'` é obrigatório.** O shell recebe `permission denied` em `/var/run/docker.sock` mesmo com o usuário no grupo `docker` — a sessão de login é anterior à inclusão no grupo. O erro *parece* daemon fora do ar e não é.

```bash
sg docker -c 'npx supabase status'      # chaves e URLs
sg docker -c 'npx supabase db reset'    # aplica migrations + os 3 seeds
```

- Gerenciador é **npm** (não bun). `npm run dev` sobe na porta 8080.
- Vite lê `.env` só no boot — reinicie o dev server depois de mexer nele.
- 🔵 **`deno` ESTÁ instalado desde 2026-08-02** (2.9.4, em `~/.deno/bin`) e os testes de Edge Function rodam com **`npm run test:ef`**. ⚠️ Ele **não** é dependência do projeto e **não** entra no `package.json` — o script só o localiza e falha com instrução se faltar. `npm test` (Vitest) **continua sem alcançar** essa camada. Ver `estrutura/transversais/testes.md`.

---

## 5. Verificação — o que rodar antes de fechar um tema

**Não há CI.** Nada roda a suíte sozinho; cada tema fechado depende de alguém lembrar. É o item de maior alavancagem do backlog, adiado por decisão do usuário.

```bash
npm test                                  # 1019 testes em 53 arquivos
npx tsc --noEmit -p tsconfig.app.json     # tem de sair limpo
npm run build
npm run lint                              # baseline 120 (66 erros, 54 avisos)
npm run docs:conferir                     # docs × código/banco — tem de sair sem divergência
```

**O lint tem 120 problemas pré-existentes.** Só importa se **subir** — meça o baseline com `git stash` antes de atribuir um número novo ao seu trabalho.

### `npm run docs:conferir` — o que ele pega, e o que não pega

Extrai a verdade estrutural (510 fatos do banco + o `App.tsx`) e confere as docs vivas contra ela: **arquivo citado existe · tabela existe · identificador de banco existe · contagem bate · a matriz de rota × papéis do doc bate com o `RequireAcesso` do `App.tsx`**.

🔴 **A checagem de guards é a mais importante, e pega os DOIS sentidos** — doc que envelheceu *e* **guard removido do código**. Foi falsificada nas duas direções antes de ser aceita. Ela existe porque em 31/07 um doc afirmava que *"guard é escrito à mão, um por arquivo"* e mandava copiar o par bounce-por-login + bounce-por-papel — o padrão que já falhou **3 vezes** e que a centralização de 26/07 eliminou. **Doc errada sobre guard ensina a reabrir buraco de autorização.**

⚠️ **O que ele NÃO pega: afirmação sobre COMPORTAMENTO.** Símbolo certo, contagem certa, e a frase mentindo sobre o que o código faz — foi assim que passaram o truncamento silencioso do `CadastroLote` e a inversão da coluna `N_INSCRICAO`. Para essas, só releitura dirigida ao código.

⚠️ **Ele ignora linha de anotação histórica de propósito** (uma lista de ~35 marcadores: `🔵`, `~~`, "removido", "dropada", "da época"…). Isso mantém o ruído baixo, mas **cada marcador pode mascarar um achado real** — funciona porque este repo marca história com disciplina.

### 🔴 O que a suíte NÃO cobre

Ela **mocka o Supabase**. Não exercita RLS, GRANT, CHECK, índice único, coluna gerada, FK, trigger, JOIN nem transação — um teste ali afirmaria o mock. **Regra de banco se verifica com bateria SQL** contra o banco local, em `docs/bateria-*.sql`, sempre em transação com `ROLLBACK` e com controle positivo.

Os 1018 testes ficaram verdes durante **e depois** de um vazamento que deixava `anon` ler dado real sem login.

### ⚠️ Teste verde pode estar guardando um defeito

É a **armadilha 8** de `testes.md`, e já apareceu várias vezes — inclusive numa asserção que afirmava, como correto, o identificador errado no campo de inscrição. **Ao mudar uma regra de negócio, os testes que caem não são obstáculo: são a pergunta.**

---

## 6. Git e produção

- **`main` está CONGELADA em `v1.0.0`** até a v2 ir ao ar. `git checkout main` acontece **só no dia do deploy**.
- **`dev` é a branch de integração.** Branches de tema (`feat/*`, `fix/*`, `db/*`) saem de `dev` e voltam para `dev`.
- 🔴 **Empurrar `dev` é decisão do usuário — NÃO pergunte, NÃO faça sozinho.** `dev` à frente de `origin/dev` por N commits é o estado normal de repouso, não algo a sinalizar. (Empurrar quando pedido explicitamente é normal.)
- Commit e push só quando pedido.

### Banco de produção

- 🔴 **O repo fica DESLINKADO por padrão** — é o estado correto, não um descuido. Sem link, `db push` e `db reset --linked` não têm alvo: o link é o que arma a arma.
- `supabase link` só no momento de um deploy consciente, com `prod:unlink` logo depois.
- **Prod só é atualizada em release estável tagueada** — nunca por migration, nunca por merge. Migrations **acumulam em `dev`**.
- Não ofereça linkar "só para conferir", nem rodar `prod:diff` por curiosidade.
- ⚠️ **Produção foi construída pelo dashboard do Lovable**, então as migrations não a reproduzem fielmente. Suspeite de drift quando prod funciona e um reset local não.

---

## 7. Estrutura da documentação

```
my_rules/
├── backlog.md            ← o que FALTA (concluído sai daqui)
├── banco-producao.md     ← roteiro de deploy
├── versionamento.md      ← branches, commits, tags
├── estrutura/            ← o que o sistema É
│   ├── 00-indice.md
│   ├── transversais/     arquitetura-geral · auth-e-permissoes · integracoes-externas
│   │                     desenvolvimento-local · testes · invariantes
│   └── modulos/<id>/     00-modulo.md (contrato) + docs por feature
├── analises/             ← o PORQUÊ. README.md explica vivo vs. concluidos/
│   └── concluidos/       roadmaps entregues + backlog-itens-concluidos.md
└── historico/            ← código aposentado
```

Fora de `my_rules/`: **`docs/`** guarda as baterias de teste manual (`bateria-*.sql`) e roteiros de teste de frontend.

**Módulos** são os de `src/lib/modulos.ts` — a fonte de verdade. Hoje: `aplicacao-provas`, `editais`, `candidatos`. Módulo novo lá = pasta nova em `estrutura/modulos/`.

⚠️ **O registro de módulos é UX e NÃO alimenta os guards.** Ler papéis de lá para autorizar afrouxaria 7 rotas — proposta já rejeitada, está em `concluidos/roadmap-modulos.yaml`.

### Manter a doc atualizada faz parte do tema

**Depois de mexer, atualize o doc daquele módulo *antes* de fechar.** Vale para feature nova e para refatoração. O doc de um módulo deve bastar para implementá-lo ou refatorá-lo **sem reler o codebase**.

---

## 8. Armadilhas específicas deste repo

- ⚠️ **O NOME mente antes do código.** Oito policies chamavam-se *"Authenticated users can view …"* e não checavam autenticação nenhuma; uma bateria afirmava "CASCADE" quando a FK já era RESTRICT. **Auditar por leitura de nome não vale — meça.**
- ⚠️ **Superadmin não bate em muro:** a hierarquia mora dentro do `has_role`. `SELECT` literal em `user_roles` já quebrou isso **3 vezes**, a última bloqueando o superadmin.
- ⚠️ **"Vazio enquanto carrega"** e **"vários passos sem transação"** são os dois padrões de defeito que mais se repetiram aqui.
- ⚠️ **Perda silenciosa** é o formato de erro que este repo mais teme: não dá erro, some dado — *parece* ter funcionado. Ao mexer numa regra de "não perder calado", **varra os campos irmãos**.
- ⚠️ **Ao acrescentar filtro a uma tela, revise toda ação que age sobre o conjunto inteiro.** Uma confirmação de "limpar edital" já prometeu remover 12 inscritos e removia 7.416.
- ⚠️ **`verify_jwt` NÃO é autorização** — a anon key é um JWT válido e público. A mesma falha já apareceu 2× (`send-email`, `create-admin`).

---

## 9. Medir muda o desenho, não só o número

É o hábito mais valioso aqui, e vale citar os casos: um payload de 5,40 MB inviabilizou um RPC monolítico e **obrigou uma tabela de preparo**; 1.527 nomes com acento definiram o critério de "caractere estranho"; medir 7.416 contra 7.020 valores distintos revelou que a coluna lida como "inscrição" era a da **pessoa**.

**Meça contra o arquivo ou o banco real, antes de desenhar.** Não estime.
