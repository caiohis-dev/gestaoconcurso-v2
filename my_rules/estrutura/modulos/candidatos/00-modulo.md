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
| **`navLinks`** | Candidatos → `/candidatos` · Importar → `/candidatos/importar` (ambos `showFor: ['admin','superadmin']`) |
| **Ícone** | `Users` (lucide) |

Módulo criado em **2026-07-27**, a partir do arquivo real de inscritos do concurso 002-2026-SMA (7.416 linhas, em `docs/temp/`).

## O que o módulo é

O **candidato** é o **inscrito** num edital: a pessoa que vai **fazer** a prova. É a contraparte do *colaborador*, que é quem **aplica** a prova. Essa distinção é a razão de o módulo existir separado — ver a fronteira no fim.

**O ponto que governa tudo aqui: candidato NÃO se cadastra à mão. Ele sempre chega por importação de planilha** (decisão do usuário na criação do módulo). Não existe formulário de criação nem de edição; a ficha do candidato é somente leitura. Corrigir um candidato significa corrigir a planilha na origem e reimportar.

Duas consequências que precisam sobreviver a qualquer refatoração:

1. **A tabela precisa de uma chave natural**, senão "sempre importado" vira "duplica a cada importação". É o índice `candidatos_cpf_cargo_id_inscricao_key`, e o app faz **UPSERT** sobre ele.
2. **Reimportar é o fluxo normal, não a exceção.** Toda mensagem de erro da importação deve terminar em "corrija e importe de novo" — é sempre seguro, porque o upsert é idempotente (verificado: reimportar as 7.416 linhas mantém 7.416).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/candidatos-import.ts` (699 l.) | **O cérebro do módulo.** Puro, sem React nem Supabase: campos disponíveis, rótulos de coluna, auto-pareamento, conversores (data/hora/CPF/e-mail), a distinção erro-vs-aviso, deduplicação, os **cargos da planilha** e a tradução de erro do Postgres |
| `src/lib/candidatos-import.test.ts` (71 testes) | A bateria da lógica acima. **Todos os casos de dado sujo são medidos no arquivo real**, não inventados |
| `src/hooks/useCandidatos.test.tsx` (24 testes) | Bateria dos hooks: paginação e o `count` do servidor, o `onConflict` da chave natural, a divisão em blocos, o parar, a tradução de erro |
| `src/hooks/useCargos.test.tsx` (26 testes) | Bateria dos cargos: a **assimetria dos dois upserts**, o `isLoading` distinguível de lista vazia, nome repetido que vira associação |
| `src/pages/Candidatos.ui.test.tsx` (23 testes) | Bateria da listagem: total do servidor, data sem o bug de fuso, badges, busca, paginação e **as duas exclusões com barreiras diferentes** |
| `src/pages/CandidatosImportar.ui.test.tsx` (38 testes) | Bateria do assistente. Monta um `.xlsx` de verdade (com as duas colunas `NOME`) e o lê pelo caminho real da página; guarda o **impedimento quando o cargo não é pareado** |
| `src/pages/Candidatos.tsx` (424 l.) | Listagem: escolha do edital por card, busca, paginação, ficha em diálogo, exclusão de um e "limpar edital" |
| `src/pages/CandidatosImportar.tsx` (1.155 l.) | O assistente de **5 passos**: arquivo → pareamento → **cargos** → importação → relatório |
| `src/hooks/useCandidatos.tsx` (273 l.) | React Query: `useCandidatos` (paginada), `useContagemCandidatosPorEdital`, `useImportarCandidatos` (upsert em blocos), `useExcluirCandidatos` |
| `src/hooks/useCargos.tsx` (258 l.) | React Query dos cargos: catálogo, apelidos, criação e gravação da memória — ver [`cargos.md`](./cargos.md) |
| `supabase/migrations/20260727000000_create_candidatos.sql` | O schema da tabela — coluna gerada, índices, 6 CHECKs, RLS, trigger e a RPC de contagem |
| `supabase/migrations/20260727200000_candidatos_chave_cpf_cargo_inscricao.sql` | A chave natural ganhou o CPF, com `NULLS NOT DISTINCT` |
| `supabase/migrations/20260728100000_candidatos_chave_cargo_id.sql` | A chave trocou o TEXTO do cargo pela REFERÊNCIA; `cargo_chave` dropada |
| `supabase/migrations/20260728110000_candidatos_recusa_reapontar_cargo.sql` | Trigger que recusa reapontar cargo de linha já importada (D11) |
| `supabase/migrations/20260727210000_create_cargos.sql` | `cargos` e `cargo_apelidos` + `candidatos.cargo_id` — ver [`cargos.md`](./cargos.md) |

Não há Edge Function neste módulo. A única RPC é `contar_candidatos_por_edital`, e ela é **SECURITY INVOKER** de propósito.

**182 testes ao todo** (medidos em 2026-07-28), o que faz de Candidatos o módulo mais coberto do sistema. ⚠️ **Mas a suíte mocka o Supabase:** ela não exercita RLS, CHECK, índice único nem a coluna gerada. A tabela de permissões, a idempotência do upsert e as regras de `cargos` foram verificadas **à mão** contra o banco local — [`../../../../docs/bateria-cargos.sql`](../../../../docs/bateria-cargos.sql) e as consultas de [`../../transversais/invariantes.md`](../../transversais/invariantes.md). Quem mexer no schema refaz assim.

> **Uma feature deste módulo tem doc própria:** [`cargos.md`](./cargos.md) — o cargo do candidato como entidade, o passo "Cargos" do assistente e o roadmap (etapas 1–5 e 5b concluídas; falta só a 6, cosmética).

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
  cpf                   text        -- 11 dígitos ou NULL; compõe a chave desde 27/07
  identidade_numero / identidade_orgao / identidade_uf(2) / identidade_emissao(date)
  email / telefone / celular         -- os três TEXT
  logradouro / numero / complemento / bairro / cidade / uf(2) / cep
  data_nascimento       date
  hora_nascimento       time         -- desempate legal em concurso
  sexo                  text         -- '0'/'1' na origem, guardado cru
  raca                  smallint     -- códigos de RACA_MAP
  portador_deficiencia  boolean NOT NULL DEFAULT false
  confirmado            boolean NOT NULL DEFAULT false
  concurso_id_origem    text         -- rastro da procedência ('242')
  created_at / updated_at / created_by
```

### ⚠️ A revisão foi ABERTA E FECHADA em 2026-07-27 — a chave mudou, mas o arquivo não

> **Tudo neste bloco aconteceu no mesmo dia**, 2026-07-27: o módulo nasceu de manhã, a revisão da chave abriu à tarde e a decisão saiu à noite. Se alguma frase parecer descrever dias diferentes, é a mesma jornada.

O usuário decidiu em **2026-07-27**: a chave natural passa a incluir o CPF (migration `20260727200000`). ⚠️ **Em 2026-07-28 ela mudou de novo**, trocando `cargo_chave` por `cargo_id` (migration `20260728100000`) — a chave em vigor é **`(edital_id, cpf, cargo_id, n_inscricao)`**. O que segue nesta seção é o histórico da revisão de 27/07, que continua valendo porque as medições que a motivaram continuam valendo.

**A planilha de origem foi remedida no fim do dia e NÃO corrigiu o que abriu a revisão** — ver "O arquivo dito corrigido" logo abaixo. Portanto:

- **Todas as medições citadas aqui seguem descrevendo o arquivo original**, porque a versão "corrigida" não mudou nenhum dos números: as 7.416 linhas, as 382 inscrições repetidas, os 2 CPFs impossíveis, os 27 e-mails, as 15 datas fora de faixa, os 36 valores de `identidade_uf`. As constraints foram dimensionadas por elas. **Se um arquivo de fato diferente chegar, remeça do zero** (regra 5 de [`../../transversais/invariantes.md`](../../transversais/invariantes.md)).
- **A instabilidade do texto do cargo não foi resolvida, e agora o CPF entrou junto** — corrigir qualquer um dos três campos da chave e reimportar cria registro novo em vez de atualizar. As duas saídas desenhadas (modelo / reconciliação) seguem sem implementação.

#### 🔴 O arquivo dito corrigido (medido em 2026-07-27) — a armadilha PIOROU

O arquivo em `docs/temp/todos inscritos concurso 002-2026-SMA cabeçalho.xls` foi mexido, mas **só ganhou um cabeçalho novo**:

- A **coluna 0 agora se chama `N_INSCRICAO`** — e continua sendo **o contador de linha do export** (verificado: é exatamente 1, 2, 3… 7416). A inscrição real segue na coluna `ID`.
- **Isso quebra o auto-pareamento.** `normalizarTexto('N_INSCRICAO')` → `ninscricao`, que é o **primeiro sinônimo** do campo `n_inscricao` em `CAMPOS_CANDIDATO`. Antes a coluna 0 era anônima e era pulada, então o palpite acertava a `ID`. Agora ele casa com o contador — e **nada acusa**, porque o contador é perfeitamente único: importaria 7.416 candidatos numerados de 1 a 7416.
- As inscrições repetidas **continuam existindo**: 7.020 `ID` distintas em 7.416 linhas. A origem **não** passou a emitir uma inscrição por cargo.

⚠️ **Quem for importar precisa conferir à mão que o campo "Nº de Inscrição" aponta para a coluna `ID`, não para a `N_INSCRICAO`.** Está no backlog como item próprio.

#### O que foi medido e vale independentemente da correção

Verificado no arquivo, com o cuidado de usar a coluna certa (⚠️ a coluna 0 é apenas o número da linha do export, 1, 2, 3…, hoje disfarçada sob o cabeçalho `N_INSCRICAO`; a inscrição é a coluna `ID` — confundir as duas dá um resultado falso e tranquilizador, e foi o que aconteceu na primeira tentativa):

| Fato | Número |
|---|---|
| Linhas | 7.416 |
| Inscrições distintas | 7.020 |
| CPFs distintos | 7.020 |
| Inscrições com mais de um CPF | **0** |
| CPFs com mais de uma inscrição | **0** |

⚠️ **Esta tabela mede a coluna `ID`, e o rótulo dela estava errado** — ver a CORREÇÃO de 28/07 mais abaixo. O que ela mostra é que **`ID` e CPF são a mesma informação** (um determina o outro): são os dois identificadores da PESSOA. A **inscrição** de verdade é a coluna `N_INSCRICAO`, e essa é única por linha (7.416).

A distribuição: 6.638 **pessoas** com 1 cargo, 369 com 2, 12 com 3 e 1 com 4. Os 396 excedentes (7.416 − 7.020) são as inscrições adicionais de quem concorre a mais de um cargo — por exemplo o `ID` `213946`, CPF `99528037704`, em `DOCENTE II`, `DOCENTE I ¿ LÍNGUA INGLESA` e `DOCENTE I ¿ HISTÓRIA`, **com três números de inscrição diferentes**.

#### ⚠️ SOMAR o CPF à chave (feito) ≠ TROCAR o cargo pelo CPF (recusado)

A distinção é a coisa mais fácil de errar aqui, e as duas propostas se parecem no enunciado:

| Chave | Linhas únicas | Colapsam | Status |
|---|---|---|---|
| `(ID, cargo)` | 7.416 | 0 | vigorou até 27/07 — lido como "inscrição" na época |
| **`(cpf, cargo, ID)`** | **7.416** | **0** | ✅ virou a chave em 27/07 |
| `(ID, cpf)` — trocar | 7.020 | **396** | ❌ recusada |
| `(ID)` sozinha | 7.020 | 396 | ❌ recusada |
| `(n_inscricao)` — a coluna certa | **7.416** | **0** | ⚠️ nunca foi avaliada; ver a CORREÇÃO |

**Somar não podia perder ninguém, e não perdeu:** acrescentar coluna a uma chave única só é capaz de *separar* linhas, nunca de fundi-las — a chave nova contém a antiga. **Trocar** o cargo pelo CPF é que colapsaria 396 inscritos em silêncio (o `deduplicar()` mantém a última ocorrência e descarta as anteriores sem erro), porque o CPF é redundante com a inscrição neste arquivo: a troca equivale a usar só a inscrição. **Não ressuscite a troca sem remedir.**

O que somar o CPF **custa**, e está aceito: o CPF entra na identidade, então corrigir um CPF errado e reimportar cria um segundo registro. É o mesmo defeito que o texto do cargo já tinha, agora valendo para três campos. E abre um afrouxamento: duas linhas com a mesma inscrição e o mesmo cargo passam a coexistir se tiverem CPF diferente — não ocorre no arquivo medido, mas passa a ser possível.

⚠️ **Os 2 CPFs impossíveis viram `NULL`, e no padrão do Postgres `NULL` não colide com `NULL`** — essas linhas se inseririam de novo a cada reimportação. É por isso que o índice é `NULLS NOT DISTINCT`, e não um índice comum. Ver a migration `20260727200000`, e o espelho disso em `chaveNatural()`.

#### O problema que originou a revisão, e que continua valendo

O texto do cargo é instável (o `¿` é um travessão mal codificado em cp1252) e **faz parte da identidade**. Verificado no banco: mudar caixa ou espaços atualiza a linha, mas **corrigir o texto cria um segundo registro e deixa o antigo** — a doc promete "corrija a planilha e reimporte", e essa promessa **não vale para os campos da chave**. As saídas discutidas, nenhuma implementada:

1. **Modelo:** `candidatos` único por `(edital, inscrição)` e cargo numa tabela filha. Realiza a intenção sem perder linha, e a identidade deixa de depender de texto instável. Muda o importador e a tela (a pessoa vira uma linha com N cargos).
2. **Reconciliação:** manter a chave e, ao fim da importação, listar os candidatos daquele edital que **não vieram no arquivo**, para remoção. Conserta o sintoma de forma geral — inclusive quem desistiu — sem tocar na identidade.

### ⭐ A chave natural — o achado que decidiu o desenho

**A unicidade é `(edital_id, cpf, cargo_id, n_inscricao)`** — índice `candidatos_cpf_cargo_id_inscricao_key`, `NULLS NOT DISTINCT`, migration `20260728100000`. O `cpf` entrou em 27/07; em **28/07** o cargo deixou de entrar pelo TEXTO e passou a entrar por **referência** (etapa 5 do roadmap de cargos). ⚠️ **A justificativa histórica de o cargo estar na chave caiu em 28/07** — ver a CORREÇÃO abaixo. A chave segue correta; o que mudou é o motivo.

⭐ **É a troca por referência que torna renomear cargo inofensivo.** Com o texto na identidade, corrigir `DOCENTE I ¿ HISTÓRIA` para `DOCENTE I — HISTÓRIA` criava **481 registros novos**; com `cargo_id`, é um `UPDATE` numa linha de `cargos` e nenhum candidato duplica. Verificado pelo PostgREST em 28/07.

### 🔴 CORREÇÃO DE 2026-07-28 — a coluna lida como "inscrição" era a errada

**Informado pelo usuário e remedido no arquivo real.** Tudo que este doc dizia sobre "382 inscrições que se repetem" partia de ler a inscrição na coluna **`ID`**. Está errado, e a correção muda a *justificativa* de várias decisões (embora, felizmente, não o schema).

| Coluna | Distintos em 7.416 linhas | O que é DE VERDADE |
|---|---|---|
| `N_INSCRICAO` (coluna 0) | **7.416** | ⭐ **a inscrição** — uma por linha |
| `ID` | 7.020 | **a pessoa** no sistema de origem |
| `CPF` | 7.020 | bate exatamente com o `ID` |

Os **382** `ID` que aparecem em mais de uma linha têm **todos** o mesmo CPF e **todos** cargos distintos. A leitura correta é: `ID` identifica a **pessoa**, `N_INSCRICAO` identifica a **inscrição** — uma por pessoa-por-cargo. As **396** linhas excedentes (7.416 − 7.020) são as inscrições adicionais de quem concorre a mais de um cargo, **cada uma com seu próprio número**.

**O que isso derruba:**

- ❌ *"382 números de inscrição se repetem"* — **não se repetem**. O que se repete é o `ID`/CPF.
- ❌ *"o cargo é indispensável na chave, senão 396 inscritos são descartados"* — **falso**. `(edital_id, n_inscricao)` sozinho já é único nas 7.416 linhas e não perde ninguém.
- ❌ *"a coluna 0 é o contador do export"* — ela **é** a inscrição; o auto-pareamento estava **certo** ao casá-la (ver o backlog, item removido em 28/07).

**O que NÃO muda, e é o alívio:**

- A chave em vigor `(edital_id, cpf, cargo_id, n_inscricao)` **continua correta e única**. Somar colunas a uma chave única só separa linhas; com `n_inscricao` já único, as outras três são redundantes para a unicidade — **redundante não é errado**, e ninguém se perde.
- Nada precisa ser remigrado. As migrations aplicadas seguem válidas; o que ficou desatualizado são os **comentários** de justificativa dentro delas (`20260727000000`, `20260727200000`, `20260728100000`, `20260728110000`). Como não se edita migration aplicada, a correção vale a partir daqui.

**O que isso ABRE, e ainda não foi decidido:**

1. **A chave poderia ser `(edital_id, n_inscricao)`** — mais simples, e resolveria de graça o custo aceito de hoje (corrigir CPF ou cargo na planilha passaria a **atualizar** em vez de criar registro novo). É a saída "modelo" que estava desenhada e engavetada, e esta correção a torna barata. ⚠️ Mas apoiar a identidade numa propriedade de **um** export é aposta: se outro edital repetir numeração, funde gente. Decidir com medição, não por elegância.
2. **A condição do trigger `candidatos_recusa_reapontar_cargo` pode ser ALARGADA** — ver [`cargos.md`](./cargos.md).

**O que a correção JÁ mudou no código (2026-07-28):**

- 🔴 **Texto de tela corrigido.** O alerta do passo 2 afirmava que sem o cargo pareado "quem concorre a mais de um cargo com a mesma inscrição vira um registro só e desaparece da lista". **Medido: perda ZERO** — sem parear o cargo, as 7.416 linhas seguem 7.416, porque a inscrição já separa. A regra D4 continua de pé, mas o texto agora dá o motivo real (sem cargo a lista não responde "quantos inscritos por cargo") em vez de uma perda que não acontece.
- Comentários de `candidatos-import.ts`, `CandidatosImportar.tsx` e `candidatos-import.test.ts` corrigidos no mesmo passe.

**Pendências que a correção deixou, e que NÃO foram feitas:**

1. ⚠️ **O fixture `CABECALHO_REAL` dos testes é o cabeçalho ANTIGO** (coluna 0 sem título). Com o arquivo atual, `autoMapear` casaria `n_inscricao` com a coluna **0**, e não com a **1** — que é o comportamento certo. Atualizar mexe em 3 asserções, e a de "coluna sem título" precisa de fixture próprio para não perder cobertura.
2. Os comentários **dentro das 4 migrations aplicadas** guardam a justificativa velha. Não se edita migration aplicada — a correção vale a partir daqui.

⚠️ **A coluna gerada `cargo_chave` NÃO existe mais** — foi dropada em 28/07 junto com a troca da chave (D3 do roadmap de cargos). Ela existia porque o upsert do PostgREST (`?on_conflict=a,b,c`) só sabe nomear **colunas**, nunca expressões, e o texto do cargo precisava ser normalizado *dentro da chave*. Com `cargo_id` na chave não há mais o que normalizar ali. Deixá-la no schema seria uma coluna terminada em `_chave` sem chave nenhuma apontando para ela. O texto cru segue em `cargo`, como procedência.

⚠️ **A normalização do texto do cargo continua existindo, mas em outros lugares** — `cargo_apelidos.texto_chave` (coluna gerada), `chaveDeCargo()` em `candidatos-import.ts` e o trigger `candidatos_recusa_reapontar_cargo`, que a calcula inline. **Os três têm de produzir o mesmo resultado**: se divergirem, o pré-preenchimento do passo Cargos para de casar e a guarda do reapontamento afrouxa em silêncio.

⚠️ **E por que o CPF NÃO ganhou coluna gerada.** A assimetria era deliberada: o cargo precisava de coluna porque precisava ser *normalizado*. O CPF não precisa de normalização nenhuma — `chk_candidato_cpf_formato` já o obriga a ser exatamente 11 dígitos ou `NULL` —, então uma `cpf_chave` seria só uma cópia da coluna ocupando espaço. O único problema dele era o `NULL`, e quem resolve isso é o `NULLS NOT DISTINCT` do índice.

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
| `chk_candidato_cpf_formato` | CPF que não seja 11 dígitos (ou NULL) |
| `chk_candidato_cep_formato` | CEP que não seja 8 dígitos (ou NULL) |
| `chk_candidato_email_formato` | e-mail sem `@`/domínio (formato mínimo, frouxo de propósito) |
| `chk_candidato_raca_valida` | código fora de `RACA_MAP` (1, 2, 4, 6, 8, 9) |

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

## A importação — as regras que não são óbvias

### Os cinco passos do assistente

```
1. Arquivo  →  2. Pareamento  →  3. CARGOS  →  4. Importação  →  5. Relatório
```

O passo **Cargos** entrou em 2026-07-27 e tem doc própria: [`cargos.md`](./cargos.md). Ele mostra os cargos distintos lidos da planilha e obriga a associar cada um a um cargo cadastrado (ou criar um novo, redigitando o nome para sanitizá-lo).

⚠️ **Importação e Relatório eram 3 e 4; hoje são 4 e 5.** A renumeração vive em **três** lugares — a trilha, os blocos `{passo === n}` e as transições. Errar um deixa um passo inalcançável, sem erro nenhum na tela; há teste cobrindo os cinco.

### ⭐ Erro vs. aviso: o que descarta a linha e o que só limpa um campo

**A identidade do candidato é o NÚMERO DE INSCRIÇÃO** — mais o CPF e o cargo —, não o CPF sozinho (ao contrário do colaborador, que loga com o CPF). Daí a regra:

- falta o que **identifica** (inscrição, nome, **cargo**) → **ERRO**, a linha não entra;
- campo secundário impossível (CPF de 10 dígitos, e-mail sem `@`, data irreconhecível) → **AVISO**, a linha entra com aquele campo em `NULL` e o relatório diz qual foi.

⚠️ **O cargo entrou na primeira lista em 2026-07-27** (decisão D9 do roadmap de cargos): ele compõe a identidade, e uma linha sem ele não tem o que associar no passo "Cargos". Medido: **0 das 7.416 linhas** do arquivo real caem aqui, então a regra é preventiva. **O CPF continua na segunda lista** — CPF impossível vira `NULL` e o inscrito entra, porque perder o inscrito é pior.

**Por quê:** descartar o inscrito inteiro por causa do e-mail dele deixaria a **lista de inscritos incompleta**, que é o único jeito de esta tabela estar de fato errada. No arquivo real isso salva 29 inscritos: 2 com CPF impossível (`' 8631309761'` com 10 dígitos, `'1O778817709'` com a letra O no lugar do zero) e 27 com e-mail impossível (`'andi.gmail'`, `'marcia2manoel@ gmail.com'`, dois endereços no mesmo campo).

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

O Postgres recusa o lote inteiro com *"ON CONFLICT DO UPDATE command cannot affect row a second time"* se a mesma chave aparecer duas vezes no mesmo upsert. Sem `deduplicar()`, **um arquivo com uma linha duplicada não importa nada** — falha o bloco de 500 inteiro e a pessoa não tem como saber por quê. Mantém-se a **última** ocorrência (quem corrige uma linha costuma reescrevê-la abaixo).

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

- **O acento do arquivo de origem vem quebrado** (`'DOCENTE I ¿ LÍNGUA INGLESA'` — o `¿` é um travessão mal codificado em cp1252). `candidatos.cargo` continua guardando como veio, porque é a procedência do dado. ⚠️ **Isto deixou de ser só uma inconveniência estética:** o texto compõe a identidade, então corrigi-lo e reimportar cria registro novo. É o problema que o tema **Cargos** resolve — o cargo vira referência a uma linha de `cargos`, e o nome canônico passa a ser editável sem duplicar ninguém. **Ainda não está fechado:** falta a etapa 5, ver [`cargos.md`](./cargos.md).
- **A exclusão de um candidato não pede senha; "limpar edital" pede.** Proposital: a primeira atinge uma linha e é reversível por reimportação, a segunda atinge milhares. Pedir senha nas duas ensinaria a digitá-la no piloto automático.
- **Não há paginação no relatório de problemas** — ele sai em `.xlsx`, que é onde a pessoa vai trabalhar.
