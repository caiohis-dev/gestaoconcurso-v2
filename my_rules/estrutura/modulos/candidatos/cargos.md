# Cargos — o cargo do candidato como entidade

> **Doc de feature do módulo Candidatos.** Deve bastar para implementar ou refatorar os cargos sem reler o codebase. Contrato do módulo: [`00-modulo.md`](./00-modulo.md). Roadmap da implementação: [`../../../analises/roadmap-cargos.yaml`](../../../analises/roadmap-cargos.yaml).

## Estado: **o tema ENTREGOU** — etapas 1 a 5b concluídas (2026-07-28)

| Etapa | O que é | Estado |
|---|---|---|
| 1 | Schema: `cargos`, `cargo_apelidos`, `candidatos.cargo_id` | ✅ **feita** — migration `20260727210000` |
| 2 | Lib pura: extrair cargos da planilha, resolver | ✅ **feita** — `candidatos-import.ts` |
| 3 | Hook `useCargos` | ✅ **feita** — `src/hooks/useCargos.tsx` |
| 4 | UI: o passo 3 "Cargos" no assistente | ✅ **feita** — `CandidatosImportar.tsx` |
| 5 | A chave natural passa a usar `cargo_id` | ✅ **feita** — migration `20260728100000` |
| 5b | Trigger que recusa reapontar cargo já importado | ✅ **feita** — migration `20260728110000` |
| 6 | Lista e ficha mostram o cargo canônico | pendente — cosmética, ver o fim |

⭐ **O sintoma que motivou o tema acabou.** `candidatos.cargo_id` é identidade: a chave natural é `(edital_id, cpf, cargo_id, n_inscricao)`. **Renomear um cargo virou um `UPDATE` numa linha e não duplica ninguém** — verificado pelo PostgREST em 28/07 (3 inscritos antes, 3 depois, nome novo aparecendo no join). Antes, a mesma correção criava 481 registros.

⚠️ **A etapa 6 é a única que falta, e é cosmética:** a lista e a ficha ainda mostram o texto CRU da planilha (`candidatos.cargo`), não o nome canônico do catálogo. Nada quebra por causa disso — o dado está certo, só a exibição é que ainda é a da procedência.

### ⭐ A etapa 5 INVERTEU qual erro é fatal — leia antes de mexer em qualquer coisa aqui

| | antes (chave = texto) | agora (chave = `cargo_id`) |
|---|---|---|
| a origem muda a grafia do cargo | 🔴 **duplicava** | ✅ o usuário re-resolve → mesma chave → UPDATE |
| o usuário reaponta um texto para outro cargo | ✅ `cargo_id` fora da chave → UPDATE | 🔴 duplicaria e deixaria as antigas **órfãs** |

A coluna da direita é a razão de existir a **etapa 5b**. Sem ela, mudar de ideia sobre "ARTE" depois da primeira importação criaria 195 linhas novas e deixaria 195 órfãs, **sem nada acusar** — e mudar de ideia sobre ARTE é o gesto *esperado* do passo Cargos, não o desviante.

## O problema

O cargo chega da origem com o texto quebrado. **Medido no arquivo real (7.416 linhas): 9 cargos distintos, 7 deles sujos.**

```
 3.756  DOCENTE II
   730  DOCENTE I ¿ EDUCAÇÃO FÍSICA     ← o ¿ é um travessão (em dash)
   650  DOCENTE I ¿ MATEMÁTICA             escrito em cp1252 e lido como latin-1
   639  DOCENTE I ¿ LÍNGUA PORTUGUESA
   481  DOCENTE I ¿ HISTÓRIA
   386  DOCENTE I ¿ CIÊNCIAS
   331  DOCENTE I ¿ GEOGRAFIA
   248  DOCENTE I ¿ LÍNGUA INGLESA
   195  ARTE                            ← foge do padrão dos outros sete
```

Como o cargo compõe a **identidade** do candidato, corrigir esse texto e reimportar **cria um segundo registro** em vez de atualizar o antigo — 481 registros novos, no caso de `DOCENTE I ¿ HISTÓRIA`. É o problema que abriu a revisão da chave natural, e que somar o CPF a ela **não** resolveu.

### Por que a limpeza não pode ser automática

Três medições, e cada uma fecha uma saída fácil:

1. **Normalizar por caixa e espaço deixa 9 distintos — não colapsa nenhum.** Não existe normalização que resolva; a sujeira está no meio da palavra, não nas bordas.
2. **Trocar `¿` por `—` acertaria nestes 7 casos, mas é um palpite** sobre o que a origem quis dizer. Nada garante que o próximo arquivo quebre o mesmo caractere do mesmo jeito.
3. **`ARTE` prova a necessidade de julgamento humano.** É `DOCENTE I — ARTE` escrito de outro jeito? É um cargo diferente? Nenhuma regra sabe; o usuário sabe.

⚠️ **É a mesma classe de armadilha do `TIPOPROVA`** (ver [`00-modulo.md`](./00-modulo.md)): palpite que erra em silêncio é pior que palpite nenhum. Por isso a sanitização é um passo **manual** do assistente, e não um algoritmo.

## Modelo de dados

```
cargos                                    -- o catálogo canônico
  id          uuid PK
  nome        text NOT NULL               -- o nome LIMPO, digitado pelo usuário
  nome_chave  text GENERATED STORED       -- lower(btrim(nome)); UNIQUE
  ativo       boolean NOT NULL DEFAULT true
  created_at / updated_at / created_by
  CHECK btrim(nome) <> ''

cargo_apelidos                            -- "este texto sujo significa aquele cargo"
  id            uuid PK
  texto_origem  text NOT NULL             -- o texto CRU, com o ¿ e tudo
  texto_chave   text GENERATED STORED     -- lower(btrim(texto_origem)); UNIQUE
  cargo_id      uuid NOT NULL → cargos(id) ON DELETE CASCADE
  created_at / created_by
  CHECK btrim(texto_origem) <> ''

candidatos (alterada)
  + cargo_id  uuid → cargos(id) ON DELETE RESTRICT      -- NULLABLE, e continua
```

### As decisões que não devem ser revertidas

**Catálogo GLOBAL, sem `edital_id`** (decisão do usuário). `DOCENTE II` é o mesmo cargo em qualquer concurso, e um catálogo por edital obrigaria a recriar os 9 cargos a cada vez — matando o ganho do `cargo_apelidos`, que só compensa se atravessar importações. Risco aceito: dois editais que usem o mesmo nome para cargos diferentes ficariam fundidos. Se vier a ocorrer, acrescentar `edital_id` é aditivo e não perde dado.

**`candidatos.cargo` (texto cru) PERMANECE** ao lado de `cargo_id`. É procedência, o mesmo papel de `concurso_id_origem`: permite refazer o mapeamento depois, auditar de onde veio cada linha e reconstruir os apelidos a partir do dado.

**CASCADE nos apelidos, RESTRICT nos candidatos — opostos de propósito.** Apelido é atalho de digitação: apagar o cargo deve levá-lo junto, porque um apelido apontando para nada não serve a ninguém. Candidato é gente: apagar um cargo não pode sumir com inscrito.

**`cargo_id` é NULLABLE no banco, obrigatório no app** — o mesmo desenho de `provas.edital_id`. A ordem `migrations → dado` impede um NOT NULL honesto (a coluna nasce vazia e é a UI que a preenche). A obrigatoriedade real virá de dois outros lugares: o passo 3 do assistente (etapa 4) e a colisão do índice único (etapa 5).

⚠️ **Por que as colunas geradas existem.** `nome_chave` e `texto_chave` seguem o padrão de `candidatos.cargo_chave`: a normalização precisa morar em **coluna**, não em índice funcional como `editais_nome_key`, porque o upsert do PostgREST (`?on_conflict=a,b`) só sabe nomear colunas. Sendo `GENERATED`, o banco as mantém sozinho — não há como o app esquecer de atualizá-las ao renomear. **Não trocar por coluna comum preenchida no app.**

### ⭐ Os dois índices de apoio a FK, que são fáceis de esquecer

`idx_candidatos_cargo` e `idx_cargo_apelidos_cargo` existem porque **o Postgres não cria índice no lado que referencia** — só no referenciado. Sem eles, todo `DELETE` em `cargos` faria seq scan em `candidatos` (milhares de linhas) para resolver o RESTRICT.

⚠️ **O índice único da chave natural NÃO serve para isso:** ele começa por `edital_id`, e a pergunta aqui é *"quem usa ESTE cargo?"*, sem edital. Verificado com `EXPLAIN`: os dois viram Index Scan.

## ⚠️ `cargos` NÃO é `funcoes_colaboradores`

O vocabulário colide — `funcoes_colaboradores` tem uma coluna chamada **`cargo_editavel`** — e as entidades são opostas:

| | `funcoes_colaboradores` | `cargos` |
|---|---|---|
| De quem | **Colaborador** — quem **aplica** a prova | **Candidato** — quem **faz** a prova |
| Exemplos | fiscal, coordenador | DOCENTE II, ARTE |
| Tem pagamento? | sim (`valores_funcao_prova`) | não |
| Tem meta por unidade? | sim | não |
| Tem alocação? | sim (`colaboradores_prova`) | não |

**Nunca unificar. Nunca reaproveitar `funcoes_colaboradores` "porque já existe uma tabela de cargos".** O aviso está também no `COMMENT ON TABLE`, que é onde quem abre o schema vai ler.

## Permissões

| | `anon` | `authenticated` (não-admin) | admin / superadmin |
|---|---|---|---|
| Ler | ❌ (sem GRANT) | ✅ | ✅ |
| Escrever | ❌ | ❌ (RLS) | ✅ |

**Leitura aberta a autenticado, e isto é escolha.** Nome de cargo não é dado de ninguém — é como `editais`, não como `candidatos` (fechada em admin nas 4 operações porque cada linha ali é CPF, endereço e telefone de um cidadão). O join da listagem roda com o papel de quem já pode ler candidatos, então não há vazamento por transitividade.

`has_role(auth.uid(), 'admin')` cobre o superadmin: a hierarquia mora **dentro** da função. ⚠️ **Nunca trocar por `SELECT` literal em `user_roles`** — é a falha que já bloqueou o superadmin três vezes neste repo.

### ⭐ Estas são as primeiras tabelas do repo com GRANTS enxutos

A migration `20260712010000` deixou um `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated, service_role`. **Toda tabela nova de `public` nasce com o pacote completo para `anon` — inclusive TRUNCATE, que NÃO passa por RLS.** Foi assim que `candidatos` nasceu podendo ser esvaziada por `anon` (verificado: funciona; o que segura é o PostgREST não expor TRUNCATE).

A migration destas duas tabelas revoga na hora:

```sql
REVOKE ALL ON public.cargos, public.cargo_apelidos FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ... FROM authenticated;
```

Sobra para `authenticated` só o DML — o mínimo para o PostgREST **chegar** a avaliar a RLS, que é quem barra de verdade. `service_role` fica intacto.

Isso **conversa** com a `20260712010000` em vez de brigar: aquela registrou o estado herdado, esta revoga pontualmente no que é novo. O enxugamento sistêmico das outras 23 tabelas segue no [`backlog`](../../../backlog.md).

## Verificação

⚠️ **Nada disto tem teste automatizado, e é decisão registrada:** a suíte mocka o Supabase e não exercita RLS, CHECK, índice único, coluna gerada, FK nem trigger — um teste lá afirmaria o mock.

A verificação real é [`../../../../docs/bateria-cargos.sql`](../../../../docs/bateria-cargos.sql), **rodada e verde em 2026-07-27**. Cada caso em transação com `ROLLBACK`, e **toda recusa acompanhada do controle positivo**. O que ela cobre:

| Bloco | Prova |
|---|---|
| Estrutura | as 2 tabelas com RLS ativa; `cargo_id` nullable; os 4 índices; CASCADE vs. RESTRICT |
| **Grants** | `anon` com **0 privilégios**; `authenticated` só com DML; TRUNCATE recusado nas duas — **e o contraste com `candidatos`, que ainda tem o pacote herdado**, provando que a revogação pegou |
| Unicidade | `'DOCENTE II'` vs `' docente ii '` colide; a gerada acompanha o rename sozinha; controle positivo com nome de fato diferente |
| FKs | apagar cargo leva os apelidos; apagar cargo com candidato é recusado; controle positivo (cargo sem uso é excluível); `EXPLAIN` confirmando Index Scan |
| **RLS** | admin escreve; **superadmin PURO escreve** — o teste fabrica um superadmin sem linha `admin` dentro da transação, porque a conta local tem as duas e usá-la não provaria nada; coordenador lê mas é recusado ao escrever; `anon` barrado já no GRANT |
| Trigger | `updated_at` se move sozinho |

⚠️ **Ao mexer no schema destas tabelas, refaça a bateria à mão.** Os UUIDs de papel embutidos nela são do banco local e podem mudar num `db reset` com dump novo — conferir com a consulta 5.1, que existe para isso.

## A lib (etapa 2) — `src/lib/candidatos-import.ts`

Três funções puras, sem React e sem Supabase, com bateria própria em `candidatos-import.test.ts` (**66 testes no arquivo**, 22 deles de cargos). É o que separa este fluxo do `CadastroLote`, onde a mesma classe de lógica vive dentro de um componente de 1.100 linhas e não tem como ser exercitada.

### `cargosDaPlanilha(linhas: LinhaConvertida[]): ResumoCargo[]`

Agrupa os cargos distintos, devolvendo `{ textoOrigem, textoChave, linhas, exemplos }` **ordenado por contagem decrescente** — o usuário resolve o que pesa antes, e se parar no meio já cobriu a maior parte do arquivo.

**Opera sobre as linhas já convertidas, não sobre a planilha crua**, e isso dá dois invariantes que os testes checam: linha descartada por erro não conta para cargo nenhum, e **a soma das contagens bate com o total de linhas importáveis**. Contar sobre o arquivo cru mostraria ao usuário um número que a importação não vai entregar.

- `textoChave` é `lower(btrim(...))` — a **mesma** normalização de `cargo_apelidos.texto_chave`. Se as duas divergirem, o pré-preenchimento da importação seguinte erra o alvo.
- `textoOrigem` é o texto da **primeira ocorrência**, não o normalizado: o usuário precisa reconhecer o que está na planilha dele, e `docente ii` minúsculo não é o que ele vê no Excel.
- `exemplos` traz até 3 nomes de inscritos, sem repetir. Existe por causa do `ARTE`: o rótulo sozinho não diz se é o mesmo cargo escrito diferente, e ver três inscritos é a informação barata que ajuda a decidir.

⚠️ **Cargo vazio NÃO vira grupo.** Campo não pareado → lista vazia, em vez de um grupo `(em branco)` com milhares de linhas. A diferença importa: aquele grupo convidaria o usuário a apontar um cargo para linhas que ele não viu — decisão em massa às cegas. Célula vazia é problema da **linha** (decisão D9, subetapa 4c), não um cargo a resolver.

### `pareceSujo(texto): boolean`

Detecta `¿` (em dash de cp1252 lido como latin-1) e `�` (U+FFFD), para a tela **destacar**.

⚠️ **Ela sinaliza e devolve a decisão a quem pode tomá-la — nunca corrige.** Um teste guarda isso explicitamente: se alguém a transformar num sanitizador, a assinatura muda e o teste cai. E **acento legítimo não é sujeira** — `CIÊNCIAS` e `EDUCAÇÃO FÍSICA` são limpos. Marcar todos os acentuados faria o usuário parar de olhar para o aviso, que é o modo de uma marca visual morrer.

### `aplicarResolucoes(candidatos, resolucoes): CandidatoResolvido[]`

Carimba o `cargo_id` decidido, casando pelo `textoChave`. Resolução faltante **marca a linha com `cargo_id: null`** — não lança (perderia o lote inteiro) e não silencia (gravaria milhares de linhas com a chave incompleta). Quem decide o que fazer com a marca é a tela, e por D4 ela **bloqueia** a importação.

⭐ **`CandidatoResolvido` é um tipo separado, não um campo opcional em `CandidatoImportado`.** A separação faz o TypeScript recusar um lote não-resolvido onde se espera um resolvido — higidez por assinatura, em vez de disciplina de quem escreve a chamada. **Verificado**: `resolvido → importado` compila, `importado → resolvido` dá `TS2322`.

### ⚠️ A ordem do pipeline é contrato — e desde a etapa 5 quem a garante é o TYPE CHECKER

```
converterLinha → resolverLinhas → deduplicar → blocos de 500
```

Até a etapa 4 a página deduplicava **antes** de resolver, e isso estava **correto** enquanto a chave natural era o texto. Com `cargo_id` na chave virou defeito: dois textos sujos apontando para o mesmo cargo são a **mesma** chave no banco, e um dedup sobre o texto os deixaria passar como distintos — o Postgres recusaria o bloco de 500 inteiro com *"cannot affect row a second time"*.

⭐ **A ordem não depende mais de disciplina.** `deduplicar()` só aceita `LinhaResolvida[]`, que só sai de `resolverLinhas()`. **Verificado em 28/07, não presumido:** trocar a chamada de volta para `deduplicar(convertidas)` dá `TS2345` — é erro de compilação, não defeito silencioso.

⚠️ **Duas consequências que a mudança de ordem trouxe para a tela:**

- **O passo 2 não pode mais anunciar o número final.** Sem cargo resolvido todos os `cargo_id` são `null`, e as inscrições da mesma pessoa em cargos diferentes colapsariam — o passo 2 prometeria 396 inscritos a menos do que vai importar. Por isso ele mostra **"N linha(s) lida(s)"** (`linhasValidas`, um fato do arquivo) e o número de verdade só é afirmado no passo 3, já resolvido.
- **`repetidas` mudou de significado.** Agora inclui duas *grafias* do mesmo cargo unificadas pela associação, e não só repetição literal na planilha. O aviso vive no passo 3 e **diz isso explicitamente** — sem a frase, a pessoa procura na planilha uma repetição que não está escrita lá.

## Os hooks (etapa 3) — `src/hooks/useCargos.tsx`

Quatro exportações, com bateria em `useCargos.test.tsx` (**26 testes**).

| | O que faz |
|---|---|
| `useCargos()` | O catálogo, ordenado por nome. Lista **tudo**, inclusive `ativo = false` |
| `useCargoApelidos()` | O mapa `texto_chave → cargo_id`, pronto para o pré-preenchimento |
| `useCriarCargo()` | Cria — ou devolve o que já existe com aquele nome |
| `useSalvarApelidos()` | Grava a memória ao fim do passo, em lote |

Mais `mensagemErroCargo()`, que traduz `candidatos_cargo_id_fkey` ("em uso por candidatos", nomeando o obstáculo como `mensagemErroExclusaoFuncao` faz) e o bloqueio de RLS.

### ⭐ A assimetria dos dois upserts — medida, não estilo

`useCriarCargo` usa `ignoreDuplicates: true`; `useSalvarApelidos` usa o padrão (`merge-duplicates`). Parece inconsistência e **não é**:

> **Medido contra o banco real em 2026-07-27, via PostgREST:** com `merge-duplicates` em `cargos`, criar `"docente ii"` quando existe `"DOCENTE II"` faz o `ON CONFLICT DO UPDATE` **renomear a linha existente** — a resposta volta com `nome: "docente ii"` e o catálogo inteiro passa a exibir a grafia nova. O usuário quis *criar* e acabou *renomeando* o cargo de milhares de inscritos, sem nada na tela indicando isso.
>
> Com `ignore-duplicates`, o nome existente é **preservado** e a resposta volta `[]`.

⚠️ **Isto corrige o que o roadmap propunha.** A decisão D10 dizia `ignoreDuplicates: false`; a medição mostrou o efeito colateral e a implementação inverteu. Em `cargo_apelidos` o `merge` continua certo, porque ali sobrescrever é justamente o desejado — reassociar uma grafia a outro cargo é a decisão nova vencendo a antiga.

**Daí os dois passos de `criarCargo`:** o upsert com `DO NOTHING` devolve `[]` quando já existia, e então se busca o dono do nome por `nome_chave`. Os dois passos também resolvem a corrida de dois admins importando ao mesmo tempo (D10): quem perde recebe `[]` e passa a usar a linha de quem ganhou. Duplicata é impossível — o índice único não deixa.

### Armadilhas que os testes guardam

- **`isLoading` distinguível de lista vazia**, nas duas queries. O padrão de defeito mais repetido deste repo (3 ocorrências em 26/07). Aqui a consequência seria a tela do passo 3 mostrar o catálogo como vazio enquanto carrega, todo cargo aparecer como não-associado, e o usuário criar duplicata do que já existe.
- **Mensagem do banco passa adiante**; texto próprio é fallback, nunca substituto.
- **Violação de `cargos_nome_chave_key` não é traduzida de propósito** — `criarCargo` a transforma em sucesso. Um teste guarda isso: se aquela mensagem chegar ao usuário, é sinal de que o caminho de D10 quebrou.

⭐ **As três asserções centrais foram falsificadas antes de aceitas.** Sabotando o hook (`ignoreDuplicates` → `false`; `onConflict` dos apelidos → `texto_origem`; remoção do fallback de busca), caem exatamente os testes esperados — 1, 1 e 2 respectivamente. Sem isso, um teste sobre mock só afirma o mock.

## O passo "Cargos" (etapa 4) — `CandidatosImportar.tsx`

O assistente passou de **4 para 5 passos**: Arquivo → Pareamento → **Cargos** → Importação → Relatório.

⚠️ A renumeração toca **três** lugares — a trilha, os blocos `{passo === n}` e as transições. Errar um deixa um passo inalcançável sem erro nenhum na tela; há teste cobrindo os cinco.

### A tela

Uma tabela de uma linha por cargo distinto (**9 no arquivo real**, então sem paginação nem busca):

| Texto na planilha | Linhas | Exemplos | Cargo do sistema |
|---|---|---|---|
| DOCENTE II | 3.756 | AGATHA, SARAH, … | `[Select]` |
| DOCENTE I <mark>¿</mark> HISTÓRIA | 481 | … | `[— selecione —]` ⚠ |

- **O caractere quebrado aparece destacado** (`TextoDoCargo` + `pareceSujo`). O `¿` some no meio de uma frase em caixa alta, e é justamente ele que explica por que a pergunta está sendo feita. Destacar é o oposto de corrigir.
- **Exemplos de inscritos** por cargo — é o que ajuda a decidir o caso `ARTE`.
- **"Criar novo…"** abre um input **já preenchido com o texto da planilha**, para o usuário editar. Campo em branco obrigaria a redigitar tudo; partir do texto sujo transforma a tarefa em "conserte o que está errado". Enter confirma, Esc cancela.
- **Pré-preenchimento, nesta ordem:** (1) apelido guardado → selo **"lembrado"**; (2) casamento exato por nome contra o catálogo; (3) nada casou → **vazio, nunca um palpite**. O selo importa: sem ele, discordar da sugestão exige confiar que ela veio de algum lugar sensato.
- **Aviso de unificação** quando duas grafias apontam para o mesmo cargo — é o efeito pretendido, mas precisa ser visto **antes** de importar, porque na etapa 5 essas inscrições passam a compartilhar a chave.
- **O botão desabilitado diz por quê** ("Resolva N cargo(s) para importar"), em vez de ficar cinza e mudo.
- **Voltar ao pareamento preserva as associações**; trocar o **arquivo** zera tudo.

### O que a etapa 4 mudou fora do passo 3

**D4 — o cargo virou obrigatório.** `CAMPOS_CANDIDATO` marca `cargo` como `obrigatorio: true`, então `mapeamentoCompleto()` passa a exigi-lo e o passo 2 não avança sem ele. ⚠️ **Obrigatório não é adivinhado:** `'tipoprova'` continua fora dos sinônimos, e o auto-pareamento continua deixando o cargo em branco de propósito.

> ⭐ **A proteção mudou de natureza, e isso reescreveu o teste mais importante do módulo.** Antes, cargo sem parear era um *alerta vermelho ignorável*, e ignorá-lo fazia 396 inscritos sumirem com a importação terminando em verde. Agora é *impedimento*: a perda deixou de ser improvável e passou a ser impossível. O teste ⭐⭐ mede o impedimento — mas continua exigindo que a tela **explique** e diga onde o cargo costuma estar. Barrar sem orientar só troca um problema por outro.

**D9 — célula de cargo vazia descarta a linha**, como inscrição e nome. 0 das 7.416 linhas reais caem aqui; a regra é preventiva.

⚠️ **Efeito colateral de D4 que valeu remoção de código:** com o cargo obrigatório, a prévia do passo 2 só aparece *depois* de ele estar pareado — então o antigo aviso "cargo não foi pareado" que morava **dentro** da prévia virou código morto. Ele subiu para o nível do passo 2. Pela mesma razão, o ramo "nenhum cargo lido" do passo 3 foi **removido**: desde D9, candidato sem cargo não existe, logo `cargosLidos` só é vazio quando `candidatos` também é — e o passo 2 já barra esse caso. Guarda que não pode disparar é armadilha, não segurança.

**O relatório** ganhou o resumo de cargos ("N cargos: X lembrados, Y definidos agora") e uma **aba `Cargos`** no xlsx com o de-para completo — o registro auditável de que texto virou que cargo naquela importação.

### O guarda de tipo já pegou algo

`useImportarCandidatos` passou a exigir `CandidatoResolvido[]`. A mudança de assinatura **quebrou o helper de `useCandidatos.test.tsx` na hora** — a prova de que a separação de tipo funciona fora do arquivo onde foi desenhada, e não só em teoria.

## A guarda do reapontamento (etapa 5b) — `candidatos_recusa_reapontar_cargo`

Trigger `BEFORE INSERT` em `candidatos`, migration `20260728110000`, SQLSTATE **`RC001`**. Recusa gravar quando **já existe** linha com o mesmo `(edital_id, cpf, n_inscricao)` **e o mesmo texto de cargo**, apontando para um `cargo_id` **diferente**.

### ⚠️ Por que a guarda NÃO fica em `cargo_apelidos`

É o alvo intuitivo e é o **errado**. As três razões foram verificadas no código:

1. **O apelido não é o caminho do dado**, é a memória de pré-preenchimento. Quem decide o `cargo_id` do lote é `resolverLinhas(convertidas, resolucoes)`, e `resolucoes` é **estado da UI**.
2. **`salvarApelidos` manda os ~9 pares num upsert único e atômico.** Barrar um par derrubaria os nove.
3. **O chamador engole o erro de propósito** (`.catch(() => undefined)`) — apelido é conveniência, a importação é o objetivo. A guarda falharia **em silêncio** e a importação seguiria gravando o `cargo_id` novo.

### 🔴 A condição é ESTREITA — e a razão disso CAIU em 2026-07-28

**A justificativa original era:** exigir o texto do cargo igual porque *"382 pessoas concorrem a mais de um cargo com a mesma inscrição"*, e uma condição mais larga as bloquearia.

**Isso estava errado.** A inscrição foi lida na coluna `ID`, que é a **pessoa**; a inscrição de verdade é a coluna `N_INSCRICAO`, e ela é **única por linha** (7.416 em 7.416). Ninguém compartilha número de inscrição. Ver a "CORREÇÃO DE 2026-07-28" em [`00-modulo.md`](./00-modulo.md).

**O que a condição estreita continua sendo:** correta, porém **mais restrita do que precisa**. Ela não bloqueia nada de legítimo — só deixa passar mais do que deveria.

⚠️ **O buraco que a estreiteza abre.** Se a origem mudar a **grafia** do cargo e o usuário reclassificar no mesmo gesto, o texto difere, o trigger não dispara e os inscritos antigos ficam **órfãos em silêncio** — exatamente o que a etapa 5b existe para impedir. Antes eu registrei isso como *"irredutível, porque o arquivo não tem identificador por cargo"*. **Não é irredutível:** com `n_inscricao` único, `(edital_id, cpf, n_inscricao)` já identifica a linha, e a comparação do texto pode simplesmente sair da condição.

**O conserto proposto (não feito):** remover do trigger a linha

```sql
AND lower(btrim(coalesce(c.cargo,''))) = lower(btrim(coalesce(NEW.cargo,'')))
```

⚠️ **Antes de fazer isso, MEDIR:** o alargamento só é seguro enquanto `n_inscricao` for único por linha. Se algum edital repetir numeração entre cargos, a condição larga passa a bloquear inscrito legítimo — que é precisamente o risco que a versão estreita foi desenhada para evitar, ainda que pelo motivo errado. E o **CONTROLE POSITIVO 1** da bateria (`docs/bateria-cargos.sql`, caso 7.5) **vai falhar** com a condição larga, porque ele foi escrito com CPF e inscrição iguais nos dois cargos — ele precisa ser reescrito com inscrições diferentes, que é o dado real.

Enquanto isso não for decidido, quem pegaria o resíduo é a **reconciliação**, ainda não implementada.

### O que a guarda deliberadamente NÃO bloqueia

| | |
|---|---|
| Renomear `cargos.nome` | **livre** — pós-etapa 5 é cosmético, e é o ganho central do tema |
| Criar cargo novo | livre — é `INSERT` em `cargos` |
| Apagar cargo em uso | já recusado pelo `ON DELETE RESTRICT` da etapa 1 |
| Reimportar a mesma linha com o mesmo cargo | é o caminho feliz, vira `UPDATE` |

⚠️ **A mensagem orienta, não só barra** (lição da etapa 4): nomeia o texto, o cargo a que ele já está associado, e a saída. Ela **passa inteira** ao usuário — `mensagemErroImportacao` não tem ramo próprio para `RC001`, e o fallback já devolve o texto do banco. **Não tente casar pelo código:** verificado pelo PostgREST, o `RC001` chega em `error.code`, nunca dentro de `error.message`.

**O certo, que não coube:** o reapontamento deveria **mover** os inscritos de um cargo para o outro, não duplicá-los — mudar de ideia deveria simplesmente funcionar. Isso é a fusão de cargos da etapa 7 (RPC transacional). Bloquear é o downgrade barato: converte perda silenciosa em "ainda não dá" explícito.

## O que vem a seguir

A **etapa 6**, cosmética: a lista e a ficha passam a mostrar o nome canônico do catálogo (hoje mostram o texto cru), com o texto da planilha como informação secundária de procedência, e um filtro por cargo no cabeçalho. Ver o roadmap.
