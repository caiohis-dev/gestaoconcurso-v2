# Módulo: Candidatos

> **Contrato do módulo.** Este arquivo deve bastar para implementar ou refatorar o módulo Candidatos sem reler o codebase. Se faltou algo, o defeito é deste doc — corrija-o junto com o código. Ver [`../../00-indice.md`](../../00-indice.md).

## Identidade

| | |
|---|---|
| **`id`** em `src/lib/modulos.ts` | `candidatos` |
| **Nome na UI** | Candidatos |
| **Papéis com acesso** | `superadmin`, `admin` — **não** coordenador |
| **Rota de entrada** | `/candidatos` (fixa, sem variação por papel) |
| **`prefixosRota`** | `['/candidatos']` — cobre `/candidatos/importar` pela regra prefixo + `/` |
| **`navLinks`** | Candidatos → `/candidatos` · Importar → `/candidatos/importar` · **Cargos → `/candidatos/cargos`** (os três `showFor: ['admin','superadmin']`) |
| **Ícone** | `Users` (lucide) |

Módulo criado em **2026-07-27**, a partir do arquivo real de inscritos do concurso 002-2026-SMA (7.416 linhas, em `docs/temp/`).

## O que o módulo é

O **candidato** é o **inscrito** num edital: a pessoa que vai **fazer** a prova. É a contraparte do *colaborador*, que é quem **aplica** a prova. Essa distinção é a razão de o módulo existir separado — ver a fronteira no fim.

**O ponto que governa tudo aqui: candidato NÃO se cadastra à mão. Ele sempre chega por importação de planilha** (decisão do usuário na criação do módulo). Não existe formulário de criação nem de edição; a ficha do candidato é somente leitura. Corrigir um candidato significa corrigir a planilha na origem e reimportar.

Duas consequências que precisam sobreviver a qualquer refatoração:

1. 🔵 **Importar é TROCAR A LISTA INTEIRA do edital** desde 2026-07-30 — apaga todos os candidatos daquele edital e insere os da planilha, numa transação só. A planilha é a fonte de verdade, sempre completa, nunca de adição (premissa confirmada pelo usuário). ⚠️ Até 29/07 era **upsert** sobre a chave natural; a mudança está em [`../../../analises/roadmap-importacao-troca-total.yaml`](../../../analises/roadmap-importacao-troca-total.yaml).
2. **Reimportar é o fluxo normal, não a exceção.** Toda mensagem de erro da importação deve terminar em "corrija e importe de novo" — é sempre seguro. ⚠️ **O motivo MUDOU:** antes era a idempotência do upsert; agora é que a troca só acontece inteira. Falha no meio deixa a lista **intacta**, não pela metade.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/candidatos-import.ts` (699 l.) | **O cérebro do módulo.** Puro, sem React nem Supabase: campos disponíveis, rótulos de coluna, auto-pareamento, conversores (data/hora/CPF/e-mail), a distinção erro-vs-aviso, deduplicação, os **cargos da planilha** e a tradução de erro do Postgres |
| `src/lib/candidatos-import.test.ts` (71 testes) | A bateria da lógica acima. **Todos os casos de dado sujo são medidos no arquivo real**, não inventados |
| `src/hooks/useCandidatos.test.tsx` (28 testes) | Bateria dos hooks: paginação e o `count` do servidor, o `onConflict` da chave natural, o **join do cargo canônico** e o **recorte por cargo**, a divisão em blocos, o parar, a tradução de erro |
| `src/hooks/useCargos.test.tsx` (26 testes) | Bateria dos cargos: a **assimetria dos dois upserts**, o `isLoading` distinguível de lista vazia, nome repetido que vira associação |
| `src/pages/Candidatos.ui.test.tsx` (34 testes) | Bateria da listagem: total do servidor, data sem o bug de fuso, badges, busca, **o cargo canônico e o filtro por cargo**, paginação e **as duas exclusões com barreiras diferentes** |
| `src/pages/CandidatosImportar.ui.test.tsx` (38 testes) | Bateria do assistente. Monta um `.xlsx` de verdade (com as duas colunas `NOME`) e o lê pelo caminho real da página; guarda o **impedimento quando o cargo não é pareado** |
| `src/pages/Candidatos.tsx` (553 l.) | Listagem: escolha do edital por card, busca, **filtro por cargo**, paginação, ficha em diálogo, exclusão de um e "limpar edital" |
| `src/pages/CandidatosImportar.tsx` (1.155 l.) | O assistente de **5 passos**: arquivo → pareamento → **cargos** → importação → relatório |
| `src/hooks/useCandidatos.tsx` | React Query: `useCandidatos` (paginada, com o cargo embutido e o recorte por cargo), `useContagemCandidatosPorEdital`, `useImportarCandidatos` (**preparo em blocos + a RPC de troca**), `useExcluirCandidatos` |
| `supabase/migrations/20260730120000_*` e `20260730130000_*` | A tabela de preparo `candidatos_importacao` e a RPC `trocar_candidatos_do_edital`, com as três guardas |
| `docs/bateria-troca-total-candidatos.sql` | A bateria da troca, 10 casos — inclui a prova de ATOMICIDADE, que roda fora de transação de propósito |
| `src/hooks/useCargos.tsx` | React Query dos cargos: catálogo (com e sem contagem de uso), apelidos, criação, **renomeação e exclusão** — ver [`cargos.md`](./cargos.md) |
| `src/pages/Cargos.tsx` + `src/components/CargoDialog.tsx` | 🔵 A gestão do catálogo em `/candidatos/cargos` (30/07): listar com o uso, criar, renomear, excluir |
| `src/pages/Cargos.ui.test.tsx` (11) + `CargoDialog.test.ts` (6) | Bateria do CRUD e o contrato do schema |
| `supabase/migrations/20260727000000_create_candidatos.sql` | O schema da tabela — coluna gerada, índices, 6 CHECKs, RLS, trigger e a RPC de contagem. ⚠️ **Os comentários de coluna dela sobre CPF e e-mail descrevem o comportamento ANTIGO** (gravar `NULL`); a `20260730100000` é que manda |
| `supabase/migrations/20260727200000_candidatos_chave_cpf_cargo_inscricao.sql` | A chave natural ganhou o CPF, com `NULLS NOT DISTINCT` |
| `supabase/migrations/20260728100000_candidatos_chave_cargo_id.sql` | A chave trocou o TEXTO do cargo pela REFERÊNCIA; `cargo_chave` dropada |
| `supabase/migrations/20260728110000_candidatos_recusa_reapontar_cargo.sql` | ❌ Criou o trigger `RC001` — **dropado em 30/07** por `20260730140000`; a troca total o tornou incapaz de disparar |
| `supabase/migrations/20260727210000_create_cargos.sql` | `cargos` e `cargo_apelidos` + `candidatos.cargo_id` — ver [`cargos.md`](./cargos.md) |
| `supabase/migrations/20260730100000_candidatos_dado_invalido_entra_cru.sql` | 🔵 As 4 CHECKs de formato saíram e `raca`/`data_nascimento` viraram `text`: **dado inválido entra como veio** |
| `supabase/migrations/20260730110000_candidatos_hora_nascimento_text.sql` | `hora_nascimento` virou `text` pela mesma regra — era o único campo secundário que anulava **sem nem avisar** |

Não há Edge Function neste módulo. A única RPC é `contar_candidatos_por_edital`, e ela é **SECURITY INVOKER** de propósito.

**197 testes ao todo** (medidos em 2026-07-29), o que faz de Candidatos o módulo mais coberto do sistema. ⚠️ **Mas a suíte mocka o Supabase:** ela não exercita RLS, CHECK, índice único nem a coluna gerada. A tabela de permissões, a idempotência do upsert e as regras de `cargos` foram verificadas **à mão** contra o banco local — [`../../../../docs/bateria-cargos.sql`](../../../../docs/bateria-cargos.sql) e as consultas de [`../../transversais/invariantes.md`](../../transversais/invariantes.md). Quem mexer no schema refaz assim.

> **Uma feature deste módulo tem doc própria:** [`cargos.md`](./cargos.md) — o cargo do candidato como entidade, o passo "Cargos" do assistente e a exibição na listagem. **Tema completo em 2026-07-29** (etapas 1 a 6); só a 7, a página `/cargos`, segue não planejada.

## Modelo de dados

> **Duas tabelas do módulo vivem em doc próprio:** `cargos` e `cargo_apelidos`, em [`cargos.md`](./cargos.md). Desde **2026-07-28** elas são parte da identidade do candidato: `candidatos.cargo_id` entrou na chave natural no lugar do texto, e o passo "Cargos" do assistente é quem o preenche.

```
candidatos
  id                    uuid PK
  edital_id             uuid NOT NULL → editais(id) ON DELETE RESTRICT
  n_inscricao           varchar(8) NOT NULL     -- string(8): pedido explícito do usuário; chave
  cargo                 text                     -- texto CRU da planilha; PROCEDÊNCIA (D2), fora da chave
  cargo_id              uuid → cargos(id) ON DELETE RESTRICT   -- ⭐ COMPÕE A CHAVE NATURAL
  nome                  text NOT NULL
  cpf                   text        -- SEM CHECK desde 30/07: valor impossível entra CRU; compõe a chave desde 27/07
  identidade_numero / identidade_orgao / identidade_uf(2) / identidade_emissao(date)
  email / telefone / celular         -- os três TEXT
  logradouro / numero / complemento / bairro / cidade / uf(2) / cep
  data_nascimento       text         -- ⚠️ TEXT desde 30/07 (era date): data irreconhecível entra CRUA
  hora_nascimento       text         -- ⚠️ TEXT desde 30/07 (era time): hora irreconhecível entra CRUA
                                     --    e é critério LEGAL de desempate — ver o aviso na migration
  sexo                  text         -- '0'/'1' na origem, guardado cru
  raca                  text         -- ⚠️ TEXT desde 30/07 (era smallint): código desconhecido entra CRU
  portador_deficiencia  boolean NOT NULL DEFAULT false
  confirmado            boolean NOT NULL DEFAULT false
  concurso_id_origem    text         -- rastro da procedência ('242')
  created_at / updated_at / created_by
```

### ⭐ A chave natural

**A unicidade é `(edital_id, cpf, cargo_id, n_inscricao)`** — índice `candidatos_cpf_cargo_id_inscricao_key`, `NULLS NOT DISTINCT`, migration `20260728100000`.

🔴 **`cargo_id` NÃO é redundante: é ele que garante a unicidade.** A inscrição vem do `ID` da planilha, que **repete** para quem concorre a mais de um cargo — 7.020 valores distintos em 7.416 linhas. Sem o cargo na chave, as **396 inscrições excedentes colidiriam** e sumiriam em silêncio. ⚠️ **Não simplifique para `(edital_id, n_inscricao)`** — já foi proposto aqui, com base em medição mal interpretada, e destrói dado.

⭐ **O cargo entra por REFERÊNCIA, não por texto** (etapa 5 do roadmap de cargos, 28/07). É isso que torna renomear cargo inofensivo para a lista: com o texto na identidade, corrigir `DOCENTE I ¿ HISTÓRIA` para `DOCENTE I — HISTÓRIA` criava **481 registros novos**; com `cargo_id` é um `UPDATE` numa linha de `cargos`. Verificado pelo PostgREST. (⚠️ Renomear cargo **em uso** é outra história — a `CG001` o proíbe; ver [`cargos.md`](./cargos.md).)

⚠️ **`NULLS NOT DISTINCT` guarda a célula VAZIA.** No padrão do Postgres dois `NULL` não colidem, então linha com CPF em branco se reinseriria a cada importação. Desde 30/07 o CPF **impossível** entra cru — o índice protege o vazio, não o inválido. **Vazio ≠ impossível.**

### 🔴 A coluna `N_INSCRICAO` da planilha é o CONTADOR do export

**Medido: `1, 2, 3 … 7416`, sem um gap.** A inscrição está na coluna **`ID`**. A pessoa de CPF `05261923727` aparece na linha 9 e na linha 5208 — se a coluna 0 fosse inscrição, seriam dois números a 5.199 de distância.

📌 **Quem escolhe a coluna é o USUÁRIO, no passo 2 do assistente** — `autoMapear` apenas **sugere**, e sugere a coluna 0 porque o cabeçalho tem esse nome. Por decisão do usuário (31/07) a sugestão fica como está e **não há alerta automático** de contador.

⚠️ **Consequência operacional: a conferência do mapeamento no passo 2 é parte do fluxo, não um remendo.** É o único ponto onde o erro é evitável, e aceitar a sugestão sem conferir grava a posição da linha como número de inscrição — sem erro, sem aviso.

🧪 Os dois caminhos têm teste em `candidatos-import.test.ts` (o sugerido e o corrigido à mão).

> 📁 **A história disto — três reviravoltas entre 27 e 31/07, e o erro de inferência que as causou — está em [`../../../analises/concluidos/candidatos-chave-natural-e-a-coluna-0.md`](../../../analises/concluidos/candidatos-chave-natural-e-a-coluna-0.md).** Leia se for mexer na chave ou no auto-pareamento; a regra para usar o módulo está toda acima.


### O que precisa concordar com a chave

⚠️ **A coluna gerada `cargo_chave` NÃO existe mais** — foi dropada em 28/07 junto com a troca da chave (D3 do roadmap de cargos). Ela existia porque o upsert do PostgREST (`?on_conflict=a,b,c`) só sabe nomear **colunas**, nunca expressões, e o texto do cargo precisava ser normalizado *dentro da chave*. Com `cargo_id` na chave não há mais o que normalizar ali. Deixá-la no schema seria uma coluna terminada em `_chave` sem chave nenhuma apontando para ela. O texto cru segue em `cargo`, como procedência.

⚠️ **A normalização do texto do cargo continua existindo, mas em outros lugares** — `cargo_apelidos.texto_chave` (coluna gerada) e `chaveDeCargo()` em `candidatos-import.ts`. **Os dois têm de produzir o mesmo resultado**: se divergirem, o pré-preenchimento do passo Cargos para de casar com o apelido memorizado e o usuário reassocia à mão o que já estava resolvido.

> 🔵 **Corrigido em 2026-07-31.** Esta frase listava **três** lugares, incluindo *"o trigger `candidatos_recusa_reapontar_cargo`, que a calcula inline"*, e dizia que **os três** tinham de concordar. Aquele trigger **foi removido em 30/07** (migration `20260730140000`) — o banco não tem nenhum com esse nome. A parte sobre "a guarda do reapontamento afrouxa em silêncio" caiu junto: não há mais guarda a afrouxar. Achado pela verificação da Camada 1 (`npm run docs:conferir`), não por leitura.

⚠️ **E por que o CPF NÃO ganhou coluna gerada.** A assimetria era deliberada: o cargo precisava de coluna porque precisava ser *normalizado*. O CPF não precisava de normalização nenhuma — `chk_candidato_cpf_formato` o obrigava a ser exatamente 11 dígitos ou `NULL` —, então uma `cpf_chave` seria só uma cópia da coluna ocupando espaço. O único problema dele era o `NULL`, e quem resolve isso é o `NULLS NOT DISTINCT` do índice.

> ⚠️ **A CHECK citada acima NÃO EXISTE MAIS** (removida em 30/07). A conclusão — não criar `cpf_chave` — segue valendo, mas por outro motivo: a normalização passou a morar no `converterLinha`, que grava só os dígitos no caminho feliz e o texto cru quando não cabe. **Uma coluna gerada aqui seria pior que inútil**, porque normalizar um CPF impossível é justamente o que a decisão de 30/07 proíbe.

**As QUATRO coisas que precisam concordar entre si** (eram três até 28/07; o dedup entrou), sob pena de a importação falhar o bloco de 500 inteiro com *"ON CONFLICT DO UPDATE command cannot affect row a second time"*:

1. o índice `candidatos_cpf_cargo_id_inscricao_key`;
2. o `onConflict` de `useImportarCandidatos` (`"edital_id,cpf,cargo_id,n_inscricao"`);
3. a `chaveNatural()` de `candidatos-import.ts`, que deduplica o lote antes do envio;
4. a **ordem do pipeline** — o dedup roda **depois** de resolver o cargo.

Mexeu em uma, mexa nas quatro. A quarta é a única que não depende de disciplina: `deduplicar()` só aceita `LinhaResolvida[]`, que só sai de `resolverLinhas()`, então inverter a ordem é **erro de compilação** — verificado em 28/07, não presumido.

### As constraints, e por que estas e não outras

Todas foram **contadas contra as 7.416 linhas antes de existir** (regra 5 de [`../../transversais/invariantes.md`](../../transversais/invariantes.md)):

| CHECK | O que barra |
|---|---|
| `chk_candidato_n_inscricao_preenchido` / `chk_candidato_nome_preenchido` | branco no que identifica |
| ~~`chk_candidato_cpf_formato`~~ | ❌ **REMOVIDA em 30/07** — CPF que não fosse 11 dígitos |
| ~~`chk_candidato_cep_formato`~~ | ❌ **REMOVIDA em 30/07** — CEP que não fosse 8 dígitos |
| ~~`chk_candidato_email_formato`~~ | ❌ **REMOVIDA em 30/07** — e-mail sem `@`/domínio |
| ~~`chk_candidato_raca_valida`~~ | ❌ **REMOVIDA em 30/07** — código fora de `RACA_MAP` |

🔴 **Sobraram DUAS, e a diferença importa.** Desde a migration `20260730100000` (decisão do usuário: dado inválido entra cru), `candidatos` **não tem opinião sobre o formato** de CPF, e-mail, CEP e raça — para nenhum caminho de escrita, não só para o importador. Quem precisar de CPF válido **valida na leitura**; não dá mais para presumir, como dava até 29/07, que o que está na coluna passou por uma CHECK. As duas que restaram são as de **identidade**, e essas seguem barrando.

⚠️ **O que foi deixado de fora, e é decisão, não esquecimento:**

- **Não há faixa em `data_nascimento`.** 15 linhas reais trazem 1193, 1780, 2975. É a data que a pessoa digitou na inscrição; um CHECK rejeitaria a carga, e "corrigir" seria inventar dado.
- **Não há lista de UFs.** `identidade_uf` tem 36 valores distintos no arquivo real, incluindo `BR`, `UF` e `13`. São 2 caracteres e cabem.
- **Não há dicionário de `sexo`.** A origem manda `'0'`/`'1'` sem legenda. Traduzir para `'M'`/`'F'` aqui seria afirmar um significado que ninguém confirmou.

**Três colunas do arquivo NÃO viraram campo**: `REGISTRO_ORGAO` e `TIPOPROVA` (100% vazias nas 7.416 linhas) e **`SENHA`** — senha de terceiro não se importa para lugar nenhum, mesmo vindo vazia.

## Permissões

| Operação | RLS |
|---|---|
| SELECT / INSERT / UPDATE / DELETE | `has_role(auth.uid(), 'admin')` — **as quatro** |

⚠️ **A LEITURA é fechada em admin, e isso é escolha deliberada — não copie a política de `editais`.** `editais` usa `SELECT USING (true)` porque nome de edital não é dado de ninguém. Aqui **cada linha é CPF, e-mail, endereço e telefone de um cidadão**. A auditoria de 2026-07-26 fechou quatro tabelas operacionais que estavam em `USING (true)` exatamente por isso; esta nasceu fechada em vez de repetir o caminho.

O coordenador não tem uso para a lista de inscritos: ele opera **colaboradores**, não candidatos.

**Verificado no banco local em 2026-07-27**, com as 7.416 linhas carregadas:

| Quem | SELECT | INSERT |
|---|---|---|
| admin | 7416 | ok |
| superadmin | 7416 (a hierarquia mora no `has_role`) | ok |
| coordenador | **0** | **recusado pela RLS** |
| anon | **0** | — |

A tabela herda os `GRANT`s do `ALTER DEFAULT PRIVILEGES` da migration `20260712010000` — sem eles o PostgREST nem chegaria a avaliar a RLS.

🔴 **Mas a herança traz junto o que não se quer, e aqui dói mais que nas outras tabelas.** Verificado em 2026-07-27: `anon` recebeu também `TRUNCATE`, `INSERT`, `UPDATE`, `DELETE` e `REFERENCES`. A RLS neutraliza todos **menos `TRUNCATE`, que não passa por RLS** — confirmado no banco local, um `TRUNCATE candidatos` como `anon` **funciona**. O que segura na prática é o PostgREST não expor TRUNCATE pela API, ou seja, um detalhe de implementação de terceiro.

Isso é o item *"Enxugar os grants de `anon`/`authenticated`"* do [`backlog.md`](../../../backlog.md), que é sistêmico e anterior a este módulo. **O que muda com Candidatos é a aposta:** as outras tabelas guardam dado operacional; esta guarda CPF, e-mail, telefone e endereço de milhares de cidadãos. Ao mexer naquele item, comece por aqui.

## As telas

Duas: a **listagem** (`/candidatos`) e o **assistente de importação** (`/candidatos/importar`). Não há tela de criação nem de edição, por decisão — ver o começo deste doc.

A listagem é: escolher o edital por card → filtrar → ver a página de 50 → abrir a ficha, excluir um, ou limpar o edital. O que dela não se adivinha:

| | |
|---|---|
| **O cargo exibido é o CANÔNICO** (`cargos.nome`, via join), não o texto da planilha. O cru só aparece na ficha, rotulado como procedência. Detalhe e a medição do join em [`cargos.md`](./cargos.md) | desde 2026-07-29 |
| **Busca e filtro de cargo vão ao servidor**, e é isso que mantém o contador e a paginação honestos. Filtrar no cliente é o defeito a não introduzir | — |
| **Os contadores da tela são TRÊS coisas diferentes**: o card diz `contagem[edital]` (a RPC, sem filtro); o cabeçalho diz o `count` da consulta **filtrada**; `editais.n_candidatos` é previsão digitada à mão e não entra na tela | ⚠️ confundi-los já causou defeito — ver Pontos frágeis |
| **Os quatro vazios são mensagens diferentes** (`mensagemDoVazio`): edital vazio, busca sem resultado, cargo sem inscrito, e os dois juntos | — |

## A importação — as regras que não são óbvias

### Os cinco passos do assistente

```
1. Arquivo  →  2. Pareamento  →  3. CARGOS  →  4. Importação  →  5. Relatório
```

O passo **Cargos** entrou em 2026-07-27 e tem doc própria: [`cargos.md`](./cargos.md). Ele mostra os cargos distintos lidos da planilha e obriga a associar cada um a um cargo cadastrado (ou criar um novo, redigitando o nome para sanitizá-lo).

⚠️ **Importação e Relatório eram 3 e 4; hoje são 4 e 5.** A renumeração vive em **três** lugares — a trilha, os blocos `{passo === n}` e as transições. Errar um deixa um passo inalcançável, sem erro nenhum na tela; há teste cobrindo os cinco.

### ⭐ Erro vs. aviso: o que descarta a linha e o que entra com o dado cru

**A identidade do candidato é o NÚMERO DE INSCRIÇÃO** — mais o CPF e o cargo —, não o CPF sozinho (ao contrário do colaborador, que loga com o CPF). Daí a regra:

- falta o que **identifica** (inscrição, nome, **cargo**) → **ERRO**, a linha não entra;
- campo secundário impossível (CPF de 10 dígitos, e-mail sem `@`, data irreconhecível) → **AVISO**, a linha entra **com o valor como a origem mandou** e o relatório diz qual foi.

⚠️ **O cargo entrou na primeira lista em 2026-07-27** (decisão D9 do roadmap de cargos): ele compõe a identidade, e uma linha sem ele não tem o que associar no passo "Cargos". Medido: **0 das 7.416 linhas** do arquivo real caem aqui, então a regra é preventiva. **O CPF continua na segunda lista** — CPF impossível entra cru e o inscrito entra, porque perder o inscrito é pior.

**Por quê:** descartar o inscrito inteiro por causa do e-mail dele deixaria a **lista de inscritos incompleta**, que é o único jeito de esta tabela estar de fato errada. No arquivo real isso salva 29 inscritos: 2 com CPF impossível (`' 8631309761'` com 10 dígitos, `'1O778817709'` com a letra O no lugar do zero) e 27 com e-mail impossível (`'andi.gmail'`, `'marcia2manoel@ gmail.com'`, dois endereços no mesmo campo).

#### 🔵 O aviso deixou de ANULAR o campo em 2026-07-30 — decisão do usuário

Até 29/07 o campo impossível virava `NULL`: o inscrito entrava, mas o que a origem afirmou sumia, e ninguém depois conseguia saber o que a pessoa tinha digitado para corrigir na fonte. **Agora o valor é gravado como veio** (migration `20260730100000`, que soltou as quatro CHECKs de formato e trocou `raca` e `data_nascimento` para `text`). O relatório continua igual em forma e lugar; o que mudou é que ele passou a apontar um dado que ainda existe.

⚠️ **O texto do aviso mudou de "gravado sem CPF" para "gravado como veio"** — a frase antiga descreveria o oposto do que acontece.

🔴 **A mudança CORRIGIU um defeito que ninguém tinha visto, e é a parte que vale lembrar.** Os 2 CPFs impossíveis do arquivo real são **valores distintos**. Com os dois virando `NULL`, a chave natural ficava idêntica e o `deduplicar()` **fundia os dois inscritos num só** — um deles sumia da lista, exatamente o erro que a regra de aviso existe para evitar. Havia um teste **afirmando essa fusão como correta**. Gravar o cru desfaz o empate: verificado contra o PostgREST em 30/07, dois CPFs impossíveis diferentes agora são duas linhas.

⚠️ **Uma regressão silenciosa saiu junto:** a guarda antiga do CPF lia `soDigitos`, que devolve `null` quando não sobra dígito nenhum — então um campo como `'abc'` era anulado **sem aviso**. Perda calada dentro da regra criada para não perder calado. Hoje o aviso lê o valor bruto.

⚠️ **O `NULLS NOT DISTINCT` do índice NÃO perdeu a razão de existir, só mudou de dono:** ele agora guarda a célula **vazia** (que continua virando `NULL`), não mais a impossível. **Vazio ≠ impossível** — um não tem dado, o outro tem dado errado.

#### 🔵 Três regras novas em 2026-07-30, todas medidas antes de existir

Segunda leva do mesmo tema, no mesmo dia. **Todas são AVISO** — nenhuma descarta linha, pelo mesmo motivo de sempre.

| Regra | Atinge | O que ela pega de verdade |
|---|---|---|
| **Nome com caractere estranho** | **10** de 7.416 | `SALVAD0` (zero por O) · `SANT¿ ANA` (mojibake, o mesmo do cargo) · `VITO&#769;RIA` (entidade HTML) · `D\'AVILA` (**escape de apóstrofo vazado da exportação**, 3 casos) · `LIMA3131` · um ID concatenado · `}` solto |
| **Nome de uma palavra só** | **10** de 7.416 | `TESTEPAULO` ×3 e um `A` — **registro de teste que vazou para a lista de inscritos**. Também pega nome legítimo só com prenome, daí ser aviso |
| **Nome com palavra de mock** | **3** de 7.416 | `TESTEPAULO`. Lista em `PALAVRAS_DE_MOCK` (`teste`, `test`), busca por **substring**, case-insensitive |
| **Hora de nascimento irreconhecível** | **2** de 3.089 preenchidas | `'88888888'` e `'Não sei'` |

⚠️ **O que conta como "caractere estranho", e por que este parágrafo é o mais importante dos três.** Aceitos: **letra (com acento), espaço, apóstrofo, hífen e PONTO**. O regex é `/[\p{L}\s'.-]/u` em `CARACTERE_ACEITO_NO_NOME`.

- **`\p{L}` cobre letra acentuada de propósito.** **1.527 dos 7.416 nomes têm acento** — acusá-los faria a regra apontar um quinto da lista e ninguém leria o relatório. Há **controle negativo** guardando isto.
- **O ponto ficou de fora por decisão do usuário.** `MÁRCIA A. MALAQUIAS` é nome bem escrito; acusar os 6 nomes com ponto seria gastar atenção em falso positivo. Foi o que levou a regra de 16 para 10.

⚠️ **A regra de mock busca por SUBSTRING, e isso é decisão, não descuido.** `TESTEPAULO` é uma palavra só — busca por palavra inteira não o pegaria. **O preço é falso positivo em português:** `TESTA` é sobrenome legítimo de origem italiana e seria acusado (medido: **0 no arquivo real**, então o custo hoje é zero). Que o risco é real, prova o campo **e-mail**: `soumatestemunhadodeusvivente@gmail.com` traz *"testemunha"*, que contém `test`. 🔴 **Quem acrescentar palavra a `PALAVRAS_DE_MOCK` mede antes** — em português, palavra curta vira substring de palavra comum com facilidade.

⚠️ **A ordem de `PALAVRAS_DE_MOCK` é significativa** (`['teste', 'test']`, da mais específica para a mais genérica): o `find` para na primeira, e é ela que aparece na mensagem. Invertida, `TESTEPAULO` seria acusado de conter *"test"* quando o que ele contém é *"teste"*. Há teste guardando isso.

📌 **Hoje esta regra não acrescenta nenhuma linha ao relatório** — as 3 `TESTEPAULO` já caem na regra de uma palavra só. Ela existe pelo caso que as outras duas **não** pegam: `TESTE DA SILVA` tem três palavras e só letras, e passaria calado. É o caso coberto pelo teste marcado ⭐.

🔴 **A hora era o buraco maior, e não estava em lista nenhuma.** Ela é o **único campo secundário que anulava sem sequer avisar** — não havia `avisos.push` para ela. Os 2 valores sumiam e nem o relatório denunciava. Segunda vez que o padrão "perda silenciosa" aparece no mesmo dia (a primeira foi o CPF sem dígito nenhum).

⚠️ **Hora de nascimento é critério LEGAL de desempate em concurso.** Com a coluna em `text`, quem for calcular desempate por SQL precisa converter — e decidir o que fazer com o valor sujo. Está anotado na migration `20260730110000`.

⚠️ **Armadilha de implementação, já paga:** o regex de caractere aceito **não pode ter a flag `g`**. Um regex global de módulo usado com `.test()` guarda `lastIndex` entre chamadas e alterna o resultado na mesma entrada — aqui produziria aviso em dia sim, dia não.

> **Efeito colateral na suíte:** 7 testes usavam `"F"` ou `"FULANO"` como nome de fixture e passaram a receber o aviso de uma palavra só. Trocados por `"FULANO SOUZA"`. **Eram fixtures, não regressão** — mas é o sinal de que a regra pega o que promete.

### ⚠️ A planilha é lida em ARRAY, nunca em objeto

`XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })`. As duas opções são obrigatórias:

- **`header: 1` (array)** porque o arquivo real tem **duas colunas chamadas `NOME`**: a **C** (nome da pessoa) e a **AC** (o cargo, `'DOCENTE II'`). No modo objeto a segunda sobrescreve a primeira e **todo mundo passa a se chamar 'DOCENTE II'**. `CadastroLote.tsx` lê em modo objeto — não copie de lá.
- **`raw: false` (texto)** porque em modo cru o CPF `'05176390760'` viraria o número `5176390760` e perderia o zero à esquerda — o CPF de outra pessoa.

Por isso **o pareamento é por índice de coluna**, e o rótulo mostrado carrega a letra (`NOME (coluna AC)`) quando o cabeçalho se repete ou está vazio.

⚠️ **Cada campo do pareamento precisa continuar com `htmlFor`/`id` ligando o `<label>` ao `SelectTrigger`.** São 25 comboboxes idênticos numa tela só: sem a associação, um leitor de tela anuncia 25 vezes "combobox" e a tela fica inoperável para quem depende dele — foi assim que ela nasceu, e foi corrigido em 2026-07-27. Funciona porque `<button>` é elemento rotulável. O asterisco dos obrigatórios é `aria-hidden` (decoração); quem informa a obrigatoriedade é o `required` do `Select`, que o Radix transforma em `aria-required` no gatilho. Duas regressões em `CandidatosImportar.ui.test.tsx` guardam isso.

### ⚠️ O cargo NÃO é auto-pareado, de propósito

`'tipoprova'` foi **removido** dos sinônimos de `cargo`. No arquivo real o cargo está na segunda coluna `NOME`, enquanto `TIPOPROVA` existe e está **100% vazia**. Adivinhar `TIPOPROVA` *pareceria acertar* e deixaria o cargo nulo em todas as linhas — e como **o cargo compõe a chave natural**, as 382 inscrições repetidas colidiriam entre si e **396 inscritos sumiriam sem erro nenhum**.

Palpite que erra em silêncio é pior que palpite nenhum.

⭐ **Desde 2026-07-27 o cargo é OBRIGATÓRIO (D4), e a proteção mudou de natureza:** antes o passo 2 *alertava em vermelho* e o usuário podia ignorar; hoje ele **impede** avançar. A perda dos 396 deixou de ser improvável e passou a ser impossível.

⚠️ **Obrigatório NÃO é adivinhado, e a distinção é o ponto:** `'tipoprova'` continua fora dos sinônimos, e o auto-pareamento continua deixando o cargo em branco neste arquivo. A pessoa **precisa** escolher a coluna — só que agora não consegue seguir sem escolher. O alerta continua dizendo **onde o cargo costuma estar**: barrar sem orientar apenas troca um problema por outro.

O auto-pareamento em geral é mais rígido que o de `CadastroLote`: casa por **igualdade exata** do cabeçalho normalizado contra sinônimos, não por `includes` nos dois sentidos (que casa `'cidade'` com `'id'`). Cabeçalho ambíguo fica em branco esperando o usuário.

### ⚠️ Deduplicar dentro do arquivo é obrigatório, não zelo

O Postgres recusa o lote se a mesma chave aparecer duas vezes. Sem `deduplicar()`, **um arquivo com uma linha duplicada não importa nada**, e a pessoa não tem como saber por quê. Mantém-se a **última** ocorrência (quem corrige uma linha costuma reescrevê-la abaixo).

⚠️ **Com a troca total o custo de errar isto SUBIU:** o INSERT deixou de ser um bloco de 500 e passou a ser a lista INTEIRA, dentro da transação da RPC. Uma duplicata no arquivo agora derruba a troca toda — o que é seguro (nada é apagado), mas significa que `deduplicar()` deixou de ser conveniência e virou pré-requisito.

⚠️ **`chaveNatural()` tem de espelhar o índice, campo a campo** — é ela que a deduplicação usa. Hoje isso inclui o `cpf ?? ''`, que reproduz em JS o `NULLS NOT DISTINCT` do banco: sem ele, duas linhas sem CPF passariam pela deduplicação como distintas e o banco recusaria o bloco.

### Gravação em blocos

`TAMANHO_BLOCO = 500`, no `useCandidatos.tsx`. Uma requisição por linha — como faz `CadastroLote` — daria 7.416 idas ao servidor. Em blocos são 15. **Medido: 7.416 candidatos em 0,4 s.**

Cada bloco é uma transação sua: um bloco que falha não desfaz os anteriores, e por isso o relatório mostra quantos entraram.

## Fronteira do módulo — o que NÃO é daqui

**Candidato ≠ colaborador.** O colaborador (fiscal, coordenador, apoio) é quem **aplica** a prova, tem conta de login, CPF como identidade e vive no módulo [Aplicação de Provas](../aplicacao-provas/colaboradores.md). O candidato **não tem conta**, não loga, não é alocado em sala e não recebe pagamento. Nenhuma das duas tabelas referencia a outra.

**Nada em `candidatos` liga a `provas`.** O vínculo é com o **edital**. Se um dia for preciso saber em que sala cada candidato faz prova, isso é feature nova e provavelmente tabela nova — não é para pendurar `prova_id`/`sala_id` aqui sem desenho.

**O edital é do módulo [Editais](../editais/00-modulo.md).** Este módulo só o consome: lê a lista para escolher o destino da importação e para os cards da listagem.

⚠️ **Mas criou uma dependência de volta que precisa ser lembrada:** `candidatos.edital_id` é `ON DELETE RESTRICT`, então **`editais` agora tem DOIS dependentes que barram exclusão** (`provas` e `candidatos`) — e candidatos é o que mais barra, porque um edital tem milhares de inscritos e poucas provas. `useEditais.tsx` distingue os dois casos na mensagem de erro; culpar "provas vinculadas" quando quem barrou foram os inscritos manda o usuário procurar no lugar errado. É a armadilha do **RESTRICT indireto** descrita em [`../../transversais/invariantes.md`](../../transversais/invariantes.md).

**`editais.n_candidatos` continua sendo um número digitado à mão** e **não** é alimentado por este módulo. São coisas diferentes: aquele é a previsão do edital, este é a lista real de inscritos. Quem for unificar precisa decidir qual manda — hoje ninguém sincroniza os dois, e o card da listagem mostra a contagem real vinda da RPC, não `n_candidatos`.

## Acessibilidade — o que foi corrigido, e por que não pode voltar

As duas telas nasceram com defeitos de nome acessível, achados em 2026-07-27 **porque a bateria de UI precisou contorná-los** — quando um teste só consegue alcançar algo por posição no DOM, é sinal de que aquilo não tem nome. Ambos corrigidos, com regressão guardando cada um.

| Onde | Era | Ficou |
|---|---|---|
| Passo 2 do assistente | 25 `<label>` sem `htmlFor` — leitor de tela anunciava 25 "combobox" indistinguíveis | `htmlFor`/`id` ligando cada rótulo ao `SelectTrigger`; o `*` virou `aria-hidden` e a obrigatoriedade viaja no `required` do `Select` (Radix → `aria-required`) |
| Linha da listagem | botão de excluir só com o ícone de lixeira, **sem nome nenhum**; o de ver dizia só "Ver" | `aria-label` nomeando **o inscrito**: `Excluir <nome>` e `Ver ficha de <nome>` |

Três coisas que precisam sobreviver a qualquer refatoração dessas telas:

1. **`<button>` é elemento rotulável**, e é por isso que o `<label htmlFor>` funciona sobre o gatilho do Radix Select. Não troque por texto solto ao lado do campo.
2. **O nome da ação inclui em QUEM ela age.** São até 50 linhas por página; "Excluir" repetido 50 vezes não diz nada a quem navega por leitor de tela. O mesmo raciocínio vale para qualquer tabela de ações que venha depois.
3. **`Ver ficha de …` começa com a palavra visível ("Ver")**, o que a WCAG 2.5.3 (*Label in Name*) exige de quem tem texto na tela — quem usa comando de voz fala o que enxerga. Ao criar `aria-label` sobre um botão com texto, **comece pelo texto visível**.

## Pontos frágeis conhecidos

- ✅ **O acento quebrado do arquivo de origem deixou de aparecer na tela.** O texto vem `'DOCENTE I ¿ LÍNGUA INGLESA'` (o `¿` é um travessão em cp1252 lido como latin-1) e `candidatos.cargo` **continua guardando como veio**, porque é a procedência do dado — mas quem a lista e a ficha exibem é `cargos.nome`, o nome canônico do catálogo. O tema **Cargos** fechou isso em 2026-07-29: o cargo é referência a uma linha de `cargos`, o nome canônico é editável sem duplicar ninguém, e a etapa 6 fez o ganho aparecer. Ver [`cargos.md`](./cargos.md).
- **A exclusão de um candidato não pede senha; "limpar edital" pede.** Proposital: a primeira atinge uma linha e é reversível por reimportação, a segunda atinge milhares. Pedir senha nas duas ensinaria a digitá-la no piloto automático.
- 🔴 **"Limpar edital" já anunciou o número errado, e isso é a armadilha a lembrar.** A ação apaga por `edital_id` — o edital **inteiro** —, mas a confirmação exibia o `count` da consulta **filtrada**: com uma busca ligada, prometia remover 12 e removia 7.416. Corrigido em 2026-07-29 (passou a usar a contagem da RPC, e avisa quando há filtro ligado), com regressão guardando. ⚠️ **A regra geral: ao acrescentar filtro a uma tela, revise toda ação que age sobre o conjunto inteiro.** Contador filtrado ao lado de botão não-filtrado é promessa errada — e aqui a promessa errada estava atrás da barreira de senha, que é onde ela menos podia estar.
- **Não há paginação no relatório de problemas** — ele sai em arquivo, que é onde a pessoa vai trabalhar.

## O passo 5 entrega DOIS relatórios, e eles não são o mesmo arquivo em dois formatos

| Botão | Formato | Forma | Para quê |
|---|---|---|---|
| Baixar Planilha (XLS) | `.xlsx`, duas abas (`Problemas` + `Cargos`) | lista plana, uma queixa por linha | trabalhar no Excel: filtrar, ordenar, marcar o que já corrigiu |
| Baixar Documento (PDF) | A4 paisagem, timbrado | **agrupado por campo**, uma tabela por campo | anexar a processo e imprimir; corrigir é trabalho por coluna |

**A parte que decide o conteúdo é pura e é a mesma para os dois:** `montarProblemasDoRelatorio()` e `agruparProblemasPorCampo()`, em [`src/lib/candidatos-import.ts`](../../../../src/lib/candidatos-import.ts), com bateria sem mock. Ela viveu **duplicada verbatim dentro do componente**, uma cópia em cada botão, até 2026-08-01 — e o custo desse arranjo era que corrigir a classificação de um campo num export deixava o outro mentindo, sem nada quebrar.

⚠️ **`classificarQueixa` casa por PREFIXO do texto da mensagem**, e nada liga esse prefixo ao que `converterLinha` escreve. Mexer no texto de um aviso joga a queixa no balde "Geral" em silêncio. Ao acrescentar aviso novo, acrescente o prefixo em `PREFIXOS_POR_CAMPO` no mesmo passe.

🔴 **A coluna Detalhe do PDF usa `overflow: "linebreak"`, não `"hidden"`.** Com `hidden` ela era cortada na largura da célula, sem reticências e sem aviso — e o detalhe é a única coisa que o relatório existe para entregar. Relatório de erro que corta a mensagem do erro é perda silenciosa.

O timbre, o logo e a numeração vêm de [`src/lib/pdf-timbre.ts`](../../../../src/lib/pdf-timbre.ts), compartilhado com os PDFs de Aplicação de Provas — ver [`../aplicacao-provas/documentos-e-relatorios.md`](../aplicacao-provas/documentos-e-relatorios.md).
