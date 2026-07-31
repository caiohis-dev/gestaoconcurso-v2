# Cargos — o cargo do candidato como entidade

> **Doc de feature do módulo Candidatos.** Deve bastar para implementar ou refatorar os cargos sem reler o codebase. Contrato do módulo: [`00-modulo.md`](./00-modulo.md). Roadmap da implementação, **arquivado** porque o tema fechou: [`../../../analises/concluidos/roadmap-cargos.yaml`](../../../analises/concluidos/roadmap-cargos.yaml) — histórico do raciocínio, **não é plano**.

## Estado: **TEMA COMPLETO** — as 6 etapas concluídas (2026-07-29)

> 🔵 **Acrescentado em 2026-07-30:** a página de gestão `/candidatos/cargos` (CRUD do catálogo). Ela executa parte da "etapa 7", que a decisão **D7** havia deixado como não planejada — o usuário pediu depois. Ver a seção própria abaixo.
>
> 🔴 **REGRA NOVA EM 2026-07-31, e ela REVERTE o ganho central deste tema: cargo com QUALQUER menção em outra tabela é IMUTÁVEL** — não se altera nem se exclui (migration `20260731100000`, SQLSTATE `CG001`). ⚠️ Toda afirmação abaixo de que "renomear é livre" ou "renomear é cosmético" **deixou de valer**. Ver a seção "Cargo com menção é imutável".

| Etapa | O que é | Estado |
|---|---|---|
| 1 | Schema: `cargos`, `cargo_apelidos`, `candidatos.cargo_id` | ✅ **feita** — migration `20260727210000` |
| 2 | Lib pura: extrair cargos da planilha, resolver | ✅ **feita** — `candidatos-import.ts` |
| 3 | Hook `useCargos` | ✅ **feita** — `src/hooks/useCargos.tsx` |
| 4 | UI: o passo 3 "Cargos" no assistente | ✅ **feita** — `CandidatosImportar.tsx` |
| 5 | A chave natural passa a usar `cargo_id` | ✅ **feita** — migration `20260728100000` |
| 5b | Trigger que recusa reapontar cargo já importado | ✅ **feita** — migration `20260728110000` |
| 6 | Lista e ficha mostram o cargo canônico + filtro por cargo | ✅ **feita** — `Candidatos.tsx` (2026-07-29) |
| 7 | (opcional) página `/cargos` | **não planejada** — ver D7 |

⭐ **O sintoma que motivou o tema acabou.** `candidatos.cargo_id` é identidade: a chave natural é `(edital_id, cpf, cargo_id, n_inscricao)`. **Renomear um cargo virou um `UPDATE` numa linha e não duplica ninguém** — verificado pelo PostgREST em 28/07 (3 inscritos antes, 3 depois, nome novo aparecendo no join). Antes, a mesma correção criava 481 registros.

✅ **E desde a etapa 6 o ganho APARECE:** renomear o cargo muda o que a tela mostra, porque a lista e a ficha leem `cargos.nome`, não mais o texto da planilha.

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

### A verificação da etapa 6 é PELO POSTGREST, e não cabe em SQL

O embed e o recorte são coisas que o **PostgREST** faz; `psql` passaria mesmo com o app quebrado, e a suíte só prova que o hook *manda* a string. O que foi rodado em 2026-07-29, com JWT de admin forjado com o `JWT_SECRET` do `supabase status` (mesmo método da bateria de `create-admin`), 3 inscritos de teste — um deles com `cargo_id` nulo — inseridos e **apagados depois** (o banco local voltou a 0 candidatos e 0 cargos):

```bash
# 1. o select do hook, tal como ele o manda — 3 linhas, a terceira com "cargos": null
GET /rest/v1/candidatos?select=*,cargos%20(%20id,%20nome%20)&edital_id=eq.<E>   # 0-2/3
# 2. o recorte por cargo — 1 linha, e o count é o do RECORTE
GET /rest/v1/candidatos?select=*,cargos(id,nome)&edital_id=eq.<E>&cargo_id=eq.<C>   # 0-0/1
# 3. CONTROLE NEGATIVO — !inner some com o inscrito sem cargo E derruba o count
GET /rest/v1/candidatos?select=n_inscricao,cargos!inner(id,nome)&edital_id=eq.<E>   # 0-1/2
```

O caso 3 é o que dá autoridade ao aviso do código: a diferença entre o join certo e o errado é **um inscrito sumindo em silêncio**, com o contador concordando com o erro.

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

> ❌ **ESTE TRIGGER NÃO EXISTE MAIS — removido em 2026-07-30** (migration `20260730140000`).
> A importação virou **troca total**: a RPC apaga a lista do edital e reinsere, na mesma
> transação. Quando o `INSERT` roda, o `DELETE` já rodou — o trigger não tinha mais o que
> encontrar, e virou guarda incapaz de disparar. **E o gesto que ele barrava deixou de ser
> perigoso:** reapontar cargo hoje converge para uma linha só, verificado no caso 7.4 de
> `docs/bateria-cargos.sql`.
>
> ⚠️ **Os dois são acoplados:** se a importação um dia voltar ao upsert, este trigger tem
> de voltar JUNTO — senão o defeito de 28/07 reaparece sem guarda nenhuma.
>
> O texto abaixo fica como registro do que ele era e de por que existiu.

Trigger `BEFORE INSERT` em `candidatos`, migration `20260728110000`, SQLSTATE **`RC001`**. Recusava gravar quando **já existia** linha com o mesmo `(edital_id, cpf, n_inscricao)` **e o mesmo texto de cargo**, apontando para um `cargo_id` **diferente**.

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
| ~~Renomear `cargos.nome`~~ | ❌ **NÃO é mais livre desde 2026-07-31**: cargo com menção é imutável (`CG001`). Era o ganho central do tema; ver a seção da regra nova |
| Criar cargo novo | livre — é `INSERT` em `cargos` |
| Apagar cargo em uso | já recusado pelo `ON DELETE RESTRICT` da etapa 1 |
| Reimportar a mesma linha com o mesmo cargo | é o caminho feliz, vira `UPDATE` |

⚠️ **A mensagem orienta, não só barra** (lição da etapa 4): nomeia o texto, o cargo a que ele já está associado, e a saída. Ela **passa inteira** ao usuário — `mensagemErroImportacao` não tem ramo próprio para `RC001`, e o fallback já devolve o texto do banco. **Não tente casar pelo código:** verificado pelo PostgREST, o `RC001` chega em `error.code`, nunca dentro de `error.message`.

**O certo, que não coube:** o reapontamento deveria **mover** os inscritos de um cargo para o outro, não duplicá-los — mudar de ideia deveria simplesmente funcionar. Isso é a fusão de cargos da etapa 7 (RPC transacional). Bloquear é o downgrade barato: converte perda silenciosa em "ainda não dá" explícito.

## A página de gestão (2026-07-30) — `/candidatos/cargos`

**A rota é `/candidatos/cargos`, e a URL não é acidente:** ela cai no prefixo `/candidatos` do módulo, então `prefixosRota` não mudou e o invariante de `modulos.test.ts` ("todo navLink resolve para o próprio módulo") continua valendo sem ajuste. Uma rota de topo `/cargos` exigiria um prefixo novo — e esquecê-lo faria `moduloDaRota` devolver `null`, tirando o realce do header e quebrando aquele teste.

| Arquivo | Papel |
|---|---|
| `src/pages/Cargos.tsx` | A tela: tabela com **nome · inscritos · textos memorizados · ações** |
| `src/components/CargoDialog.tsx` | Um diálogo só, para criar E renomear — `isEditing = !!cargo` governa tudo |
| `src/components/CargoDialog.test.ts` | O contrato do schema Zod |
| `src/pages/Cargos.ui.test.tsx` | 11 testes do CRUD |

**Hooks novos em `useCargos.tsx`:** `useCargosComUso`, `useAtualizarCargo`, `useExcluirCargo`.

### ⭐ A contagem de uso vem numa requisição só

`cargos?select=...,candidatos(count),cargo_apelidos(count)` — o embed de agregação do PostgREST resolve no servidor. **Foi medido em 30/07 ANTES de o código existir**, porque o fallback seria uma RPC e mudaria o escopo. O índice `idx_candidatos_cargo` (etapa 1) é o que torna isso barato.

⚠️ Cargo sem uso volta `[{ count: 0 }]`, **não** array vazio. O `?.[0]?.count ?? 0` cobre os dois, para o hook não depender dessa observação continuar valendo.

⚠️ A queryKey é `["cargos", "com-uso"]` e **não precisa de invalidação própria**: `invalidateQueries({ queryKey: ["cargos"] })` casa por PREFIXO e alcança as duas. Não acrescente uma segunda achando que falta.

### 🔴 Renomear invalida DUAS queries

`useAtualizarCargo` invalida `["cargos"]` **e** `["candidatos"]`. Desde a etapa 6 a listagem e a ficha exibem `cargos.nome` por join embutido — sem a segunda, o usuário renomeia, volta para a lista, vê o nome **antigo** e conclui que não funcionou. Mesmo motivo pelo qual `useEditais` invalida `provas`. **Há teste guardando, e ele foi falsificado.**

### 🔴 Excluir leva os apelidos junto, e o diálogo TEM de dizer isso

`cargo_apelidos.cargo_id` é `ON DELETE CASCADE`: apagar o cargo apaga em silêncio a memória de "texto sujo → cargo". É perda real e invisível — na próxima importação aqueles textos voltam a aparecer sem associação. O `AlertDialog` mostra a contagem e avisa; **há teste próprio para o aviso**, senão ele some na primeira refatoração.

**Não há pré-check de uso no cliente, de propósito.** "Leio e então decido" é uma corrida, e a recusa do banco (`candidatos_cargo_id_fkey`, RESTRICT) nomeia o obstáculo melhor. A contagem na tela **informa**; quem barra é a FK.

⚠️ **A confirmação NÃO pede senha**, ao contrário de "limpar edital". Lá não há rede nenhuma; aqui o banco é a rede. É o mesmo critério do módulo: excluir um inscrito usa `AlertDialog`.

### `mensagemErroCargo` ganhou o ramo de nome duplicado

`cargos_nome_chave_key` ficou **fora** dela até 30/07, com bom motivo: só o `criarCargo` escrevia, e ele transforma duplicata em sucesso (D10). **O renomear mudou a premissa** — renomear para um nome existente viola o mesmo índice e não tem para onde escapar. ⚠️ Havia um teste afirmando *"NÃO traduz a violação de nome único"*; ele foi **reescrito**, não removido.

### 🔴 Cargo com menção é IMUTÁVEL (2026-07-31)

**Decisão do usuário:** *"Cargos que tenham menção em qualquer outra tabela não podem ser modificados nem deletados."*

| Barreira | O quê |
|---|---|
| Trigger `check_cargo_nao_alteravel_em_uso` (`CG001`) | Recusa **qualquer UPDATE** em cargo com inscritos **ou** apelidos. É sobre a LINHA, não sobre a coluna — trocar `ativo` também é recusado |
| `candidatos_cargo_id_fkey` RESTRICT | Já existia: inscrito barra a exclusão |
| `cargo_apelidos_cargo_id_fkey` **RESTRICT** | ⚠️ **Era CASCADE.** O apelido deixou de ser apagado junto e passou a **barrar** |

⚠️ **A assimetria "apelido é atalho, candidato é gente" caiu.** Ela era deliberada e está documentada acima em "Modelo de dados"; a regra nova não admite a distinção — menção é menção.

#### 🔴 O que isso custa, medido

Este tema existiu porque **7 dos 9 cargos chegam com `¿`** da origem, e a etapa 5 tornou o rename inofensivo justamente para permitir a limpeza. **Os 9 cargos do arquivo real têm candidatos** (195 a 3.756). Portanto: **depois da primeira importação, nenhum poderá ser renomeado, e os 7 `¿` ficam permanentes.**

Isso foi apresentado ao usuário com esses números e escolhido assim mesmo. **A janela para corrigir um nome é ANTES da primeira importação que o use** — na prática, no próprio passo 3 do assistente, onde o cargo é criado.

#### O que a regra apagou de código

- **O aviso de CASCADE no diálogo de exclusão** virou inalcançável: o apelido agora barra em vez de ser levado. Saiu, com três testes junto.
- **O ramo "N inscritos vão barrar"** do mesmo diálogo também: o botão Excluir não aparece mais para cargo com menção. O diálogo só abre para cargo com zero menções.
- A tela mostra **"Em uso — não editável"** com cadeado no lugar dos botões. Botão cinza e mudo deixaria o usuário procurando o que fazer.

### O que a página deliberadamente NÃO faz

- **Desativar (`cargos.ativo`)** — a coluna existe desde a etapa 1 e segue **sem consumidor**. Para "inativo" significar algo, o passo Cargos do assistente teria de parar de oferecer os inativos, e isso é mudança no fluxo de importação.
- **Fundir cargos duplicados** — reapontar candidatos e apelidos e só então apagar é operação em três tabelas e exige **RPC transacional**. Três chamadas soltas do cliente deixariam estado pela metade. Segue desenhada na etapa 7 do roadmap.

---

## A exibição (etapa 6) — `Candidatos.tsx` e `useCandidatos.tsx`

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

### 🔴 A etapa achou um defeito que já existia: "limpar edital" anunciava o total ERRADO

`excluirDoEdital` apaga por `edital_id` — o edital **inteiro**. Mas a confirmação (a que pede senha) anunciava `total`, que é o count da consulta **filtrada**. Com uma busca ligada ela prometia remover 12 inscritos e removia 7.416.

**Já era defeito com a busca**, desde o nascimento da tela; o filtro por cargo só o tornaria fácil de encontrar. Corrigido: o número vem de `totalDoEdital` (a RPC de contagem, que ignora filtros), e com filtro ligado o texto diz "inclusive os que os filtros atuais escondem". O mesmo vale para a **visibilidade** do botão, que passou a olhar o total do edital — antes, uma busca sem resultado escondia o "limpar edital" de um edital com milhares de linhas. Há regressão guardando os dois em `Candidatos.ui.test.tsx`.

> **A lição, que vale além desta tela:** ao acrescentar um filtro, procure toda ação da tela que age sobre o conjunto **inteiro**. Um contador filtrado ao lado de um botão não filtrado é uma promessa errada, e aqui a promessa errada estava justamente atrás da barreira de senha.

### Efeito colateral bem-vindo no lint

Extrair `camposDaFicha()` e `mensagemDoVazio()` para fora do componente derrubou a complexidade da função `Candidatos` de **40 para 25** (a regra `complexity` do eslint, máximo 15). O helper `ou()` existe porque 20 `?? "—"` inline eram contados como 20 ramos numa lista que não decide nada.
