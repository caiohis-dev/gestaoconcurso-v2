# Cargos — o cargo do candidato como entidade

> **Doc de feature do módulo Candidatos.** Deve bastar para implementar ou refatorar os cargos sem reler o codebase. Contrato do módulo: [`00-modulo.md`](./00-modulo.md). Roadmap da implementação, **arquivado** porque o tema fechou: [`../../../analises/concluidos/roadmap-cargos.yaml`](../../../analises/concluidos/roadmap-cargos.yaml) — histórico do raciocínio, **não é plano**.

## O que vale hoje

🔴 **Cargo com INSCRITO em algum edital é IMUTÁVEL** — não se altera nem se exclui (migration `20260801103940`, SQLSTATE `CG001`). **Apelido NÃO tranca**: cargo com textos memorizados e nenhum inscrito é renomeável e excluível.

⭐ **`candidatos.cargo_id` entra por REFERÊNCIA, não por texto** — e é isso que impede a lista de duplicar: renomear é um `UPDATE` numa linha de `cargos`, onde antes a mesma correção criava **481 registros**. A lista e a ficha leem `cargos.nome`, então o nome corrigido aparece na tela.

> ⚠️ **`cargo_id` NÃO é mais identidade desde 2026-08-01.** Esta linha dizia *"é identidade — a chave natural é `(edital_id, cpf, cargo_id, n_inscricao)`"*. A chave passou a ser `(edital_id, n_inscricao)` (migration `20260801193530`): o cargo virou **atributo**. O ganho da referência continua inteiro — ele nunca dependeu de o cargo estar na chave, e sim de o **texto** não estar.

**A janela para corrigir um nome vai até a primeira importação que o use** — na prática, o passo 3 do assistente. Enquanto o cargo não tiver inscrito, renomear é livre e inofensivo.

> ⚠️ **Entre 31/07 e 01/08 vigorou uma regra mais larga** (`20260731100000`): qualquer menção trancava, inclusive apelido. Como o assistente grava os apelidos no **fim do passo 3**, o cargo ficava imutável **antes de existir um único inscrito** — a janela fechava dentro do passo que deveria abri-la. Foi estreitada por decisão do usuário. **Qualquer frase deste doc que diga "menção é menção" é dessa janela e não vale mais.**

> 📁 As **6 etapas**, seus estados e o raciocínio de cada uma estão em [`roadmap-cargos.yaml`](../../../analises/concluidos/roadmap-cargos.yaml) (`etapas:`), arquivado. Este doc descreve o que os cargos **são**; o roadmap, como chegaram aqui. ⚠️ A "etapa 7" de lá foi **parcialmente executada** — o CRUD existe; ver "A página de gestão".

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

Enquanto o **texto** do cargo compunha a identidade do candidato, corrigir esse texto e reimportar **criava um segundo registro** em vez de atualizar o antigo — 481 registros novos, no caso de `DOCENTE I ¿ HISTÓRIA`. É o problema que abriu a revisão da chave natural, e que somar o CPF a ela **não** resolveu. (Resolveu trocar o texto pela referência em 28/07; desde 01/08 o cargo saiu de vez da chave.)

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
  cargo_id      uuid NOT NULL → cargos(id) ON DELETE CASCADE   -- RESTRICT só de 31/07 a 01/08
  created_at / created_by
  CHECK btrim(texto_origem) <> ''

candidatos (alterada)
  + cargo_id  uuid → cargos(id) ON DELETE RESTRICT      -- NULLABLE, e continua
```

### As decisões que não devem ser revertidas

**Catálogo GLOBAL, sem `edital_id`** (decisão do usuário). `DOCENTE II` é o mesmo cargo em qualquer concurso, e um catálogo por edital obrigaria a recriar os 9 cargos a cada vez — matando o ganho do `cargo_apelidos`, que só compensa se atravessar importações. Risco aceito: dois editais que usem o mesmo nome para cargos diferentes ficariam fundidos. Se vier a ocorrer, acrescentar `edital_id` é aditivo e não perde dado.

**`candidatos.cargo` (texto cru) PERMANECE** ao lado de `cargo_id`. É procedência, o mesmo papel de `concurso_id_origem`: permite refazer o mapeamento depois, auditar de onde veio cada linha e reconstruir os apelidos a partir do dado.

**CASCADE nos apelidos, RESTRICT nos candidatos — opostos de propósito.** Apelido é atalho de digitação: apagar o cargo deve levá-lo junto, porque um apelido apontando para nada não serve a ninguém. Candidato é gente: apagar um cargo não pode sumir com inscrito.

> ⚠️ **Esta assimetria caiu em 31/07 e voltou em 01/08.** A regra larga fez as duas FKs virarem RESTRICT; o estreitamento devolveu o CASCADE. 🔴 **O CASCADE é escolha, não omissão** — `cargo_apelidos.cargo_id` é `NOT NULL`, então permitir o DELETE de cargo só-com-apelido obriga o apelido a ir junto. Não "conserte" para RESTRICT ao ver a palavra CASCADE numa auditoria; o aviso está no cabeçalho da migration `20260801103940`.

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

A verificação real é [`../../../../docs/bateria-cargos.sql`](../../../../docs/bateria-cargos.sql) — o próprio arquivo diz o que cobre, e é ele que se mantém atualizado. ⚠️ **Ao mexer no schema destas tabelas, refaça a bateria à mão.** Os UUIDs de papel embutidos nela são do banco local e podem mudar num `db reset` com dump novo — confira com a consulta 5.1, que existe para isso.

### ⭐ O que `psql` NÃO consegue verificar

O **embed** de `cargos` na listagem e o **recorte por cargo** são coisas que o *PostgREST* faz. Uma bateria SQL passaria mesmo com o app quebrado, e a suíte só prova que o hook **manda** a string — nenhuma das duas prova que o dado volta certo.

🔴 **O caso que dá autoridade ao aviso do código:** trocar o join por `cargos!inner` faz **o inscrito sem cargo sumir em silêncio**, e o contador concorda com o erro. É por isso que o join tem de ser à **esquerda**, e por isso a verificação desta parte é por requisição HTTP com JWT forjado, não por SQL.

## A lib — `src/lib/candidatos-import.ts`

Três funções puras, sem React e sem Supabase, com bateria própria em `candidatos-import.test.ts` (**83 testes no arquivo**, 22 deles de cargos). É o que separa este fluxo do `CadastroLote`, onde a mesma classe de lógica vive dentro de um componente de 1.100 linhas e não tem como ser exercitada.

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
converterLinha → resolverLinhas → deduplicar → blocos de 1.000
```

Até a etapa 4 a página deduplicava **antes** de resolver, e isso estava **correto** enquanto a chave natural era o texto. Com `cargo_id` na chave virou defeito: dois textos sujos apontando para o mesmo cargo são a **mesma** chave no banco, e um dedup sobre o texto os deixaria passar como distintos.

> 🔵 **Desde 2026-08-01 a ordem já não é o que protege isso** — o cargo saiu da chave, então deduplicar antes ou depois de resolver dá o mesmo resultado. O dedup continua rodando depois por outro motivo: o que sai dele é o que vai ser gravado, e a gravação precisa do `cargo_id`. Quem impede a inversão continua sendo o **tipo** (`LinhaResolvida` só sai de `resolverLinhas`).
>
> ⚠️ A recusa citada aqui (*"o Postgres recusaria o bloco de 1.000 com cannot affect row a second time"*) descreve o **upsert**, que não existe desde a troca total de 30/07. Hoje os blocos de 1.000 vão para `candidatos_importacao`, que não tem índice único, e a recusa vem depois — no `INSERT` da RPC, derrubando a troca inteira.

⭐ **A ordem não depende mais de disciplina.** `deduplicar()` só aceita `LinhaResolvida[]`, que só sai de `resolverLinhas()`. **Verificado em 28/07, não presumido:** trocar a chamada de volta para `deduplicar(convertidas)` dá `TS2345` — é erro de compilação, não defeito silencioso.

⚠️ **Duas consequências que a mudança de ordem trouxe para a tela:**

- **O passo 2 não pode mais anunciar o número final.** Sem cargo resolvido todos os `cargo_id` são `null`, e as inscrições da mesma pessoa em cargos diferentes colapsariam — o passo 2 prometeria 396 inscritos a menos do que vai importar. Por isso ele mostra **"N linha(s) lida(s)"** (`linhasValidas`, um fato do arquivo) e o número de verdade só é afirmado no passo 3, já resolvido.
- **`repetidas` mudou de significado.** Agora inclui duas *grafias* do mesmo cargo unificadas pela associação, e não só repetição literal na planilha. O aviso vive no passo 3 e **diz isso explicitamente** — sem a frase, a pessoa procura na planilha uma repetição que não está escrita lá.

## Os hooks — `src/hooks/useCargos.tsx`

Quatro exportações, com bateria em `useCargos.test.tsx` (**38 testes**).

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

## O passo "Cargos" — `CandidatosImportar.tsx`

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

### As regras que o passo Cargos impõe FORA dele

**D4 — o cargo virou obrigatório.** `CAMPOS_CANDIDATO` marca `cargo` como `obrigatorio: true`, então `mapeamentoCompleto()` passa a exigi-lo e o passo 2 não avança sem ele. ⚠️ **Obrigatório não é adivinhado:** `'tipoprova'` continua fora dos sinônimos, e o auto-pareamento continua deixando o cargo em branco de propósito.

> ⭐ **A proteção mudou de natureza, e isso reescreveu o teste mais importante do módulo.** Antes, cargo sem parear era um *alerta vermelho ignorável*, e ignorá-lo fazia 396 inscritos sumirem com a importação terminando em verde. Agora é *impedimento*: a perda deixou de ser improvável e passou a ser impossível. O teste ⭐⭐ mede o impedimento — mas continua exigindo que a tela **explique** e diga onde o cargo costuma estar. Barrar sem orientar só troca um problema por outro.

**D9 — célula de cargo vazia descarta a linha**, como inscrição e nome. 0 das 7.416 linhas reais caem aqui; a regra é preventiva.

⚠️ **Efeito colateral de D4 que valeu remoção de código:** com o cargo obrigatório, a prévia do passo 2 só aparece *depois* de ele estar pareado — então o antigo aviso "cargo não foi pareado" que morava **dentro** da prévia virou código morto. Ele subiu para o nível do passo 2. Pela mesma razão, o ramo "nenhum cargo lido" do passo 3 foi **removido**: desde D9, candidato sem cargo não existe, logo `cargosLidos` só é vazio quando `candidatos` também é — e o passo 2 já barra esse caso. Guarda que não pode disparar é armadilha, não segurança.

**O relatório** ganhou o resumo de cargos ("N cargos: X lembrados, Y definidos agora") e uma **aba `Cargos`** no xlsx com o de-para completo — o registro auditável de que texto virou que cargo naquela importação.

## A guarda do reapontamento — REMOVIDA

O trigger `candidatos_recusa_reapontar_cargo` (`RC001`) **não existe desde 2026-07-30** (migration `20260730140000`). A importação virou **troca total**: o `DELETE` roda antes do `INSERT`, então ele não tinha mais o que encontrar — e o gesto que ele barrava deixou de ser perigoso, porque reapontar cargo agora converge para uma linha só (caso 7.4 de `docs/bateria-cargos.sql`).

⚠️ **O acoplamento é o que precisa sobreviver: se a importação voltar ao upsert, este trigger tem de voltar JUNTO** — senão o defeito de 28/07 reaparece sem guarda nenhuma.

> 📁 O que ele era, por que não ficava em `cargo_apelidos` e o buraco que a condição estreita abria estão no [apêndice do histórico](../../../analises/concluidos/candidatos-chave-natural-e-a-coluna-0.md).

## A página de gestão (2026-07-30) — `/candidatos/cargos`

**A rota é `/candidatos/cargos`, e a URL não é acidente:** ela cai no prefixo `/candidatos` do módulo, então `prefixosRota` não mudou e o invariante de `modulos.test.ts` ("todo navLink resolve para o próprio módulo") continua valendo sem ajuste. Uma rota de topo `/cargos` exigiria um prefixo novo — e esquecê-lo faria `moduloDaRota` devolver `null`, tirando o realce do header e quebrando aquele teste.

| Arquivo | Papel |
|---|---|
| `src/pages/Cargos.tsx` | A tela: tabela com **nome · inscritos · textos memorizados · ações** |
| `src/components/CargoDialog.tsx` | Um diálogo só, para criar E renomear — `isEditing = !!cargo` governa tudo |
| `src/components/CargoDialog.test.ts` | O contrato do schema Zod |
| `src/pages/Cargos.ui.test.tsx` | 13 testes do CRUD |

**Hooks novos em `useCargos.tsx`:** `useCargosComUso`, `useAtualizarCargo`, `useExcluirCargo`.

### ⭐ A contagem de uso vem numa requisição só

`cargos?select=...,candidatos(count),cargo_apelidos(count)` — o embed de agregação do PostgREST resolve no servidor. **Foi medido em 30/07 ANTES de o código existir**, porque o fallback seria uma RPC e mudaria o escopo. O índice `idx_candidatos_cargo` (etapa 1) é o que torna isso barato.

⚠️ Cargo sem uso volta `[{ count: 0 }]`, **não** array vazio. O `?.[0]?.count ?? 0` cobre os dois, para o hook não depender dessa observação continuar valendo.

⚠️ A queryKey é `["cargos", "com-uso"]` e **não precisa de invalidação própria**: `invalidateQueries({ queryKey: ["cargos"] })` casa por PREFIXO e alcança as duas. Não acrescente uma segunda achando que falta.

### 🔴 Renomear invalida DUAS queries

`useAtualizarCargo` invalida `["cargos"]` **e** `["candidatos"]`. Desde a etapa 6 a listagem e a ficha exibem `cargos.nome` por join embutido — sem a segunda, o usuário renomeia, volta para a lista, vê o nome **antigo** e conclui que não funcionou. Mesmo motivo pelo qual `useEditais` invalida `provas`. **Há teste guardando, e ele foi falsificado.**

### Excluir leva os apelidos junto, e o diálogo TEM de dizer isso

`candidatos.cargo_id` é **RESTRICT** (inscrito barra) e `cargo_apelidos.cargo_id` é **CASCADE** (apelido vai junto). O diálogo de exclusão só abre para cargo **sem inscrito** — mas ele pode ter apelidos, e é aí que mora o risco.

🔴 **O aviso no `AlertDialog` não pode sumir.** Excluir apaga em silêncio a memória de "texto sujo → cargo" que pré-preenche as próximas importações: nada dá erro, e o usuário reassocia tudo de novo sem saber por quê. **Há teste próprio para o aviso**, e ele foi falsificado — matar o bloco derruba exatamente 1 teste.

⚠️ **Não existe ramo "N inscritos vão barrar"** neste diálogo, e não deve voltar: o botão Excluir não aparece para cargo com inscrito, então seria guarda que não pode disparar.

> ⚠️ **Esta seção afirmou o oposto entre 31/07 e 01/08**, quando as duas FKs eram RESTRICT: ela se chamava *"Excluir cargo com QUALQUER menção é recusado"* e o aviso tinha sido removido do código por ser inalcançável. Com o estreitamento da `CG001`, o aviso e dois testes voltaram.

**Não há pré-check de uso no cliente, de propósito.** "Leio e então decido" é uma corrida, e a recusa do banco (`candidatos_cargo_id_fkey`, RESTRICT) nomeia o obstáculo melhor. A contagem na tela **informa**; quem barra é a FK.

⚠️ **A confirmação NÃO pede senha**, ao contrário de "limpar edital". Lá não há rede nenhuma; aqui o banco é a rede. É o mesmo critério do módulo: excluir um inscrito usa `AlertDialog`.

⚠️ **`mensagemErroCargo` NÃO traduz `cargo_apelidos_cargo_id_fkey`**, e a ausência é deliberada: com CASCADE aquela FK nunca recusa nada. Havia um ramo entre 31/07 e 01/08. Há teste guardando a ausência, para ninguém "restaurar" o que parece faltando.

### `mensagemErroCargo` ganhou o ramo de nome duplicado

`cargos_nome_chave_key` ficou **fora** dela até 30/07, com bom motivo: só o `criarCargo` escrevia, e ele transforma duplicata em sucesso (D10). **O renomear mudou a premissa** — renomear para um nome existente viola o mesmo índice e não tem para onde escapar. ⚠️ Havia um teste afirmando *"NÃO traduz a violação de nome único"*; ele foi **reescrito**, não removido.

### 🔴 Cargo com INSCRITO é IMUTÁVEL (2026-08-01)

**Decisão do usuário:** *"A regra de bloqueio deve corresponder somente a condições de haver candidatos associados a esse cargo em algum edital."*

| Barreira | O quê |
|---|---|
| Trigger `check_cargo_nao_alteravel_com_inscritos` (`CG001`) | Recusa **qualquer UPDATE** em cargo com inscritos. É sobre a LINHA, não sobre a coluna — trocar `ativo` também é recusado |
| `candidatos_cargo_id_fkey` RESTRICT | Inscrito barra a exclusão. É a **única** barreira |
| `cargo_apelidos_cargo_id_fkey` CASCADE | **Não barra**: o apelido é apagado junto. A tela avisa antes |

**Apelido não é menção para efeito de bloqueio.** Cargo com 5 textos memorizados e nenhum inscrito é renomeável e excluível.

#### 🔴 O que isso destrava — o defeito da regra larga era de MOMENTO

`salvarApelidos` grava a memória no **fim do passo 3** (`CandidatosImportar.tsx`), e só o **passo 4** escreve os inscritos. Sob a regra larga, o apelido recém-gravado **já tornava o cargo imutável** — antes de existir um único inscrito. A janela que este doc promete ("vai até o passo 3") fechava **dentro** do passo 3, pela mão do próprio assistente, e os 7 nomes com `¿` congelavam sem ninguém ter importado nada.

⚠️ **Observado no banco local em 01/08**, no estado deixado por uma execução do passo 3: 9 cargos, 9 apelidos, **0 candidatos** — os 9 imutáveis. **Esse estado não sobrevive a `db reset`:** o dump não traz cargo, apelido nem candidato, e as três tabelas voltam vazias. Para reproduzir, rode o passo 3.

**Agora a janela é a prometida: vai até a primeira importação que USE o cargo.** Depois disso o nome congela, e aí por um motivo real — há inscritos apontando para ele.

#### O que voltou de código

- **O aviso de CASCADE no diálogo de exclusão**, com 2 testes. Tinha saído em 31/07 por ser inalcançável; com a FK de volta a CASCADE, a perda voltou a ser possível.
- **`cargoTemMencao` virou `cargoTemInscritos`.** O nome importa: uma função chamada "menção" que ignora apelidos é a próxima leitura errada — é a armadilha nº 1 deste repo.
- A tela mostra **"Em uso por inscritos — não editável"** com cadeado. O rótulo genérico ficaria ambíguo agora que uma linha pode exibir "Textos memorizados: 5" **e** os dois botões.

⚠️ **O ramo "N inscritos vão barrar" continua fora**, e deve continuar: o botão Excluir não aparece para cargo com inscrito.

### O que a página deliberadamente NÃO faz

- **Desativar (`cargos.ativo`)** — a coluna existe desde a etapa 1 e segue **sem consumidor**. Para "inativo" significar algo, o passo Cargos do assistente teria de parar de oferecer os inativos, e isso é mudança no fluxo de importação.
- **Fundir cargos duplicados** — reapontar candidatos e apelidos e só então apagar é operação em três tabelas e exige **RPC transacional**. Três chamadas soltas do cliente deixariam estado pela metade. Segue desenhada na etapa 7 do roadmap.

---

## A exibição — `Candidatos.tsx` e `useCandidatos.tsx`

O que a etapa fez, em uma frase: **quem responde "qual é o cargo deste inscrito" passou a ser o catálogo, e não a planilha.** Concluída em 2026-07-29.

| Onde | Antes | Agora |
|---|---|---|
| Coluna *Cargo* da lista | `candidatos.cargo` (texto cru, com `¿`) | `cargos.nome` (canônico); sem `cargo_id`, um `—` |
| Ficha | só o texto cru, rotulado "Cargo" | *Cargo* = canônico **+** *Cargo como veio na planilha*, e a segunda linha só aparece quando os dois textos diferem |
| Cabeçalho | busca por nome/inscrição/CPF | ganhou um **filtro por cargo**, recortado no servidor |

### ⭐ O join tem de ser à ESQUERDA — medido, não presumido

O `select` da listagem é `"*, cargos ( id, nome )"`, uma constante em `useCandidatos.tsx`. Uma requisição, sem N+1, e o `count: "exact"` continua sendo o do servidor.

⚠️ **Trocar por `cargos!inner` faz inscrito desaparecer da lista.** Medido pelo PostgREST em 2026-07-29 com 3 inscritos, um deles com `cargo_id` nulo: o embed padrão devolve **3 linhas** (a terceira com `"cargos": null`) e `Content-Range: 0-2/3`; com `!inner` devolve **2** e `0-1/2`. O count cai junto, então a tela mentiria *e* esconderia gente. `cargo_id` é NULLABLE no banco de propósito — o `!inner` parece uma otimização e é uma perda silenciosa.

### O filtro por cargo vai ao SERVIDOR

`.eq("cargo_id", …)` na consulta, `cargoId` na `queryKey`, catálogo vindo do `useCargos()`. Verificado pelo PostgREST: `cargo_id=eq.<id>` devolve 1 de 3 linhas e `Content-Range: 0-0/1` — **o count é o do recorte**, que é a razão de o filtro não poder ser feito no cliente. Filtrando as 50 linhas da página, o contador continuaria descrevendo o edital inteiro e a paginação passaria a mentir; é o mesmo modo de falha que o teste do `count` já guardava.

Cinco decisões da tela que não são óbvias:

- **O catálogo é GLOBAL (D1), então o filtro oferece cargo que talvez não exista no edital.** Aceito: são 9 cargos, e o vazio filtrado **nomeia o cargo** ("Nenhum inscrito deste edital está no cargo X"). São quatro vazios diferentes e cada um manda fazer outra coisa — daí `mensagemDoVazio()` ser função própria. ⚠️ Dizer "Nenhum inscrito neste edital" com filtro ligado faria o usuário concluir que a importação falhou e reimportar 7.416 linhas à toa.
- **Trocar de edital SOLTA o filtro de cargo.** Filtro herdado num edital onde aquele cargo não existe produz lista vazia que se parece com importação falhada.
- **O contador vira "X de Y" com filtro ligado.** Um número solto menor que o do card do edital se lê como inscrito perdido na importação.
- **O nome do cargo NÃO entrou na busca textual.** Filtrar coluna de tabela embutida tem sintaxe própria no PostgREST e não cabe no mesmo `.or()`; e o filtro exato já responde a pergunta. **Não improvisar isso no cliente** — quebraria o `count`.
- **O `isLoading` do `useCargos` é lido**, e o Select fica `disabled` enquanto o catálogo não chega: array vazio é indistinguível de "ainda não sei", e o filtro apareceria com uma opção só como se não existisse cargo nenhum. ⚠️ **Sem `placeholder` no `SelectValue`**, porque `value` nunca é vazio (o sentinela `"todos"` sempre vale) — o Radix nunca o exibiria. Era adorno morto, e adorno morto é primo da guarda que não pode disparar. Não há teste de página cobrindo esse instante (o mock resolve imediato); quem cobre a distinção é `useCargos.test.tsx`, no nível do hook.

### 🔴 "Limpar edital" apaga o edital INTEIRO — o contador não pode ser o filtrado

`excluirDoEdital` apaga por `edital_id` — o edital **inteiro**. Mas a confirmação (a que pede senha) anunciava `total`, que é o count da consulta **filtrada**. Com uma busca ligada ela prometia remover 12 inscritos e removia 7.416.

**Já era defeito com a busca**, desde o nascimento da tela; o filtro por cargo só o tornaria fácil de encontrar. Corrigido: o número vem de `totalDoEdital` (a RPC de contagem, que ignora filtros), e com filtro ligado o texto diz "inclusive os que os filtros atuais escondem". O mesmo vale para a **visibilidade** do botão, que passou a olhar o total do edital — antes, uma busca sem resultado escondia o "limpar edital" de um edital com milhares de linhas. Há regressão guardando os dois em `Candidatos.ui.test.tsx`.

> **A lição, que vale além desta tela:** ao acrescentar um filtro, procure toda ação da tela que age sobre o conjunto **inteiro**. Um contador filtrado ao lado de um botão não filtrado é uma promessa errada, e aqui a promessa errada estava justamente atrás da barreira de senha.
