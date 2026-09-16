# Provas, Unidades e Salas

> Documento de área do módulo **Aplicação de Provas** — comece pelo contrato em [`00-modulo.md`](./00-modulo.md). A alocação de pessoas dentro de uma prova/unidade fica em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md); ocorrências durante a prova em [`ocorrencias.md`](./ocorrencias.md); documentos gerados a partir de uma prova finalizada em [`documentos-e-relatorios.md`](./documentos-e-relatorios.md).


## Entidades e relação entre elas

- **`editais`** — **entidade de outro módulo.** O CRUD, o schema, a unicidade do nome e o modelo "edital é template" estão em [`../editais/00-modulo.md`](../editais/00-modulo.md); não duplicado aqui. O que interessa deste lado: a prova **referencia** um edital e **herda dele apenas sugestões, na criação**.
- **`provas`** (`useProvas.tsx`) — uma prova pertence a um edital via **`edital_id`** (FK, **1 edital → N provas**, `ON DELETE RESTRICT`). Tem data, horários, e os SEUS próprios `prova_cabecalho_linha1/2` (herdados do edital como sugestão na criação, mas editáveis e independentes depois), além do flag de ciclo de vida `prova_finalizada` (+ `finalizada_at`). 🔵 **`prova_n_candidatos` saiu em 02/08** — a coluna existe no banco, mas nenhum código lê ou escreve nela, e ela está fora das interfaces de `useProvas.tsx` de propósito (ver abaixo). O **nome do edital** exibido/usado vem do join (`prova.editais.nome`), não de uma coluna da prova.
  - **O `ProvaDialog` trava a criação se não existir nenhum edital**, mostrando um link "Cadastrar Edital" para `/editais`. Como Editais é módulo só de admin, **um coordenador não consegue destravar isso sozinho**.
  - 🔴 **O edital de uma prova é IMUTÁVEL depois de definido (`PE001`, 02/08).** O vínculo se escolhe na **criação** e nunca mais muda — decisão do usuário. Na edição (o botão **"Parâmetros Gerais"** de `/gerenciar-prova`, que abre este mesmo `ProvaDialog`) o edital aparece em **bloco de leitura**, com o nome visível e a explicação de que não muda.
    - **A garantia é o trigger `check_prova_edital_imutavel`** (migration `20260802045221`), não a tela: a escrita de `provas` é PostgREST direto, e um `PATCH` com `edital_id` novo passaria pela RLS. Bateria: [`../../../../docs/bateria-prova-edital-imutavel.sql`](../../../../docs/bateria-prova-edital-imutavel.sql).
    - 🔴 **A condição do trigger é `edital_id JÁ TINHA valor E mudou`, não `mudou`.** Trava cega quebraria **todo `db reset`**: o backfill do `seed.pos.sql` faz `UPDATE provas SET edital_id = … WHERE edital_id IS NULL` **depois** das migrations. Atribuir pela primeira vez não é modificar. O caminho de volta (`valor → NULL`) também é recusado — senão a trava teria porta dos fundos em dois passos.
    - ⚠️ **Na edição o payload nem carrega `edital_id`/`prova_edital`.** É mais forte que desabilitar o campo: sem valor viajando, nem um bug de estado do formulário vira uma tentativa de troca — que o trigger recusaria, virando toast vermelho para quem não pediu nada.
    - ⚠️ **A cópia denormalizada `prova_edital` ficou FORA da regra**, de propósito: é dívida de transição que o `seed.pos.sql` ainda lê, e amarrá-la criaria uma segunda regra sobre uma coluna que deve sumir. Ela pode divergir do nome real — o que já era verdade e já é o motivo de nenhum código novo poder lê-la.
  - **Dívida de transição:** a coluna antiga `prova_edital` (CHAR(30)) ainda existe e é escrita como cópia denormalizada pelo `ProvaDialog` — `(edital?.nome ?? "").slice(0, 30)`, só para satisfazer seu `NOT NULL`. Não foi dropada porque o backfill em `seed.pos.sql` lê dela para reconstruir os editais a cada `db reset` do dump do v1. **Nenhum código novo deve ler `prova_edital`**: além de duplicar, ela trunca em 30 caracteres, então pode divergir do nome real. `edital_id` é `NULLABLE` no banco (a ordem migration→seed impede `NOT NULL`) e **obrigatório no app** (`z.string().min(1, "Selecione um edital")`). Migration `20260724170000_*`.
- **`unidades_prova`** (`useUnidadesProva.tsx`) — cadastro de locais físicos (escolas, universidades): **nome e sigla, só**. É um **catálogo reutilizável entre provas**, não específico de uma prova.

  > 🔴 **`unid_andares` foi DROPADA em 2026-08-03** (migration `20260804001559` — o timestamp é UTC, a sessão foi na noite de 03/08), decisão do usuário. O cadastro pedia o número de andares do prédio e esse número virava **teto** para criar salas: não se podia cadastrar sala num andar que a unidade "não tinha". Como o formulário nascia com `1` e ninguém revisava, **7 das 11 unidades** ficaram com um andar — e o campo de andar de `/salas-prova` recusava tudo acima do térreo. **A unidade não declara mais andares: andar é atributo da SALA.** A CHECK `chk_unid_andares_min` caiu junto com a coluna.
- **`sala_prova`** (`useSalasProva.tsx`) — salas cadastradas por unidade, também um **template reutilizável**: número (`sala_numero` = andar×100 + sequência, ex. 101 = andar 1, sala 1), capacidade e andar. 🔵 **A criação em lote pede uma FAIXA de andares desde 2026-08-03** (`De`/`Até`), e a quantidade vale **por andar** — ver a seção própria abaixo.

  🔵 **`sala_arcondicionado` foi DROPADA em 2026-08-03** (migration `20260803234944`), decisão do usuário. Medido antes: as salas todas tinham `false`, e a coluna nunca existiu em `salas_prova_distribuidas` — o valor jamais chegava a uma prova. Se aparecer em migration antiga ou em roteiro, é história.

  🧪 **Coberto desde 2026-07-26** (`useSalasProva.test.tsx`), e vale saber três coisas, porque a numeração é calculada **no cliente** — não há `SEQUENCE` no banco:
  - continua do **maior número daquele andar**, não da contagem: sala excluída deixa buraco, e o buraco **não** é reaproveitado (número repetido confundiria lista já impressa);
  - salas de outros andares não empurram a contagem;
  - o esquema comporta **99 salas por andar**, e passar disso é **recusado antes de escrever** desde 03/08.

    > ⚠️ **Este item dizia o contrário até 2026-08-03**, e a frase antiga era: *"com a sala 199 existente, a próxima do andar 1 vira 200 — o número do andar 2 — e nada avisa. Caso extremo…"*. Não era caso extremo nem silencioso: o 200 **colide** com o índice único `(unidade, número)` do andar 2, e o 23505 chegava traduzido como *"provavelmente outra pessoa criou salas ao mesmo tempo"* — mandando repetir uma ação que nunca ia funcionar. Hoje `numerosDoLote` recusa nomeando o andar e quantas ainda cabem.
- **`prova_unidades`** (`useProvaUnidades.tsx`) — associação prova↔unidade. **Ao vincular uma unidade a uma prova, todas as salas daquela unidade em `sala_prova` são copiadas para `salas_prova_distribuidas`** (ver abaixo). Também carrega os flags de encerramento de ocorrências (`ocorrencias_encerradas*`, ver [`ocorrencias.md`](./ocorrencias.md)).
- **`salas_prova_distribuidas`** (`useSalasDistribuidas.tsx`) — **cópia editável das salas, específica de uma prova**. É aqui que se atribuem fiscais de sala (`sala_fiscal_1`, `sala_fiscal_2`) e se ajusta capacidade/descrição para aquela prova especificamente, sem alterar o template em `sala_prova`. Também é possível adicionar salas extras que só existem para aquela prova (`addSala`), sem tocar no template.

**Por que essa duplicação existe:** desacopla o catálogo permanente de infraestrutura (unidade/sala física) do uso pontual em uma prova específica — uma prova pode ter salas customizadas (capacidade diferente, sala extra) sem afetar o cadastro base nem outras provas que usem a mesma unidade. Ao adicionar uma feature que lida com "salas", primeiro identifique se ela deveria mexer no template (`sala_prova`) ou no snapshot da prova (`salas_prova_distribuidas`) — são coisas diferentes e a confusão entre as duas é o erro mais fácil de cometer aqui.

Remover uma unidade de uma prova (`removeUnidadeMutation`) deleta em cascata as `salas_prova_distribuidas` daquela unidade+prova antes de deletar o vínculo em `prova_unidades`.

### ✅ As duas operações são transacionais desde 2026-07-26

**Isto era o contrário até 26/07, e o aviso antigo está aposentado de propósito.** `addUnidade` e `removeUnidade` eram três requisições soltas do supabase-js, sem transação: um toast de erro não significava "nada aconteceu", significava que parou no meio.

- **Adicionar** falhando no passo 3 deixava a unidade **vinculada e sem sala nenhuma** — estado que a tela não distingue de "unidade sem salas cadastradas".
- **Remover** falhando no passo 3 apagava o snapshot e mantinha o vínculo. Era o pior dos dois, porque o snapshot podia estar customizado (salas extras, capacidades ajustadas, fiscais) e recriar pelo template não devolve o que foi editado.

Viraram as RPCs **`vincular_unidade_a_prova(p_prova_id, p_unidade_id)`** e **`desvincular_unidade_da_prova(p_prova_unidade_id)`** (migration `20260726230000`). Corpo de função PL/pgSQL roda em transação: qualquer exceção desfaz o que veio antes. Verificado sabotando a cópia com um `CHECK ... NOT VALID` — o vínculo não sobra.

Três coisas a preservar em refatoração:

- **`prova_id` NÃO é parâmetro do desvincular** — sai da própria linha. Recebê-lo de fora abriria a chance de o cliente mandar um que não corresponde ao vínculo e apagar o snapshot de **outra prova**. (O antigo delete do cliente filtrava por `prova_id` E `sala_fk_unidade` justamente por isso; agora o problema não existe.)
- **Autorização por `has_role(auth.uid(),'admin')`** dentro das RPCs, espelhando as policies das duas tabelas — não afrouxa nada. Via `has_role`, nunca `SELECT` literal em `user_roles`.
- **Desvincular pode falhar por um motivo indireto:** `colaboradores_prova` cascateia de `prova_unidades`, e o `RESTRICT` de `coordenadores_prova` (migration `20260726250000`) faz a cascata esbarrar quando há **coordenador alocado** naquela unidade. É o comportamento certo — desvincular não deve revogar coordenação em silêncio — e `useProvaUnidades` traduz o erro apontando a tela de *Acesso dos Coordenadores*.

### ⛔ A prova NÃO pode ser excluída (desde 2026-07-26)

`provas` era a raiz de **sete cascatas**: `prova_unidades` (que por sua vez leva alocações, metas e ocorrências), `valores_funcao_prova`, `coordenadores_prova`, `salas_prova_distribuidas`, `email_atualizacao_log` e `ocorrencias_colaborador` (a sétima era `prova_edit_locks`, que deixou de pendurar em `provas` em 2026-09-16 — hoje é `prova_unidade_edit_locks` e cascateia de `prova_unidades`). Medido na prova principal: apagá-la levaria **531 alocações, as 19 ocorrências do banco, 17 valores de pagamento, 172 metas, 42 salas e 10 acessos de coordenador**.

Havia confirmação por senha (`PasswordConfirmDialog`). A decisão do usuário foi que **nem isso basta** — o registro de uma prova é permanente.

Em duas camadas, de propósito (migration `20260726240000`):
1. a **policy de DELETE foi removida** → sem policy, a RLS nega por padrão, o que cobre PostgREST e cliente;
2. o trigger **`check_prova_nao_excluivel`** recusa → pega quem passa **por cima** da RLS, isto é `service_role`, que é como rodam as Edge Functions.

No cliente não sobrou nada: `useProvas` não expõe `delete`, a página não tem o diálogo e o `ProvaCard` não tem botão nem prop `onDelete`. **Consequência assumida:** prova criada por engano também não se apaga; se isso incomodar, a saída é um conceito de arquivada, não reabrir o DELETE.

**A unidade do catálogo (`unidades_prova`) só se exclui sem nenhum uso:** `prova_unidades` e `salas_prova_distribuidas` viraram `RESTRICT`. `sala_prova` continua `CASCADE` de propósito — as salas cadastradas são parte da unidade, não uso dela.

### O snapshot em si: `useSalasDistribuidas`

Fixado por teste em `useSalasDistribuidas.test.tsx`:

- ✅ **Salvar em lote é transacional desde 2026-08-03** — ver a seção abaixo. Era um `UPDATE` por sala em `Promise.all`.
- ✅ **Sala sem `id` não some mais em silêncio.** Era `if (!sala.id) return null`, sem erro e sem aviso; hoje ela viaja no lote e a RPC recusa o conjunto inteiro comparando pedidas × encontradas. Para sala nova o caminho continua sendo `addSala`.
- **`addSala` não carimba `created_by`**, ao contrário de `useProvas`, `useProvaUnidades` e `useOcorrencias`, que leem `auth.getUser()`. A sala extra nasce sem autoria. Não quebra nada hoje (a coluna é nullable), mas ninguém sabe quem a acrescentou à mão.

### ✅ Renumerar salas — a RPC `salvar_salas_distribuidas` (2026-08-03)

**Trocar o número de duas salas era impossível**, e é a operação mais banal de `/gerenciar-salas-distribuidas`. O índice único `(prova_id, sala_fk_unidade, sala_numero)` é verificado **linha a linha**, e o salvamento disparava um `UPDATE` por sala em paralelo: a primeira escrita encontrava a irmã ainda no número antigo e estourava `23505`. Três defeitos de uma vez — a troca recusada, a mensagem em jargão do Postgres, e a outra sala **já gravada**, porque não havia transação.

Hoje o lote inteiro vai numa chamada só à RPC (migration `20260803001556`), que:

1. **renumera em dois passos** — passo 1 tira os números do lote de circulação (valores negativos, um por linha), passo 2 grava os finais. É isso que faz a troca passar sem afrouxar a regra;
2. **recusa o lote inteiro** se alguma sala não for encontrada, em vez de gravar o subconjunto e dizer "Alterações salvas";
3. autoriza com `has_role(auth.uid(), 'admin')`, espelhando a policy de UPDATE (é SECURITY DEFINER, então a RLS não roda).

⚠️ **A alternativa canônica foi REJEITADA por medição, não por gosto.** Tornar a chave `DEFERRABLE` (o jeito clássico de trocar dois valores de chave única) **quebra o `db reset`**: o dump insere toda linha com `ON CONFLICT DO NOTHING` sem alvo, e o Postgres recusa constraint deferrable como árbitro — `SQLSTATE 55000`. Vale também para o bootstrap de produção, que carrega o mesmo dump. Um grep em `src/` e nas migrations não pegaria; foi o reset que pegou. **Não reabra esse caminho.**

⚠️ **O passo 1 grava número negativo transitório.** Se algum dia entrar uma CHECK de sinal em `sala_numero`, ela precisa tolerar isso — ou a renumeração quebra.

A mensagem de número repetido é traduzida no cliente por **`mensagemErroSalvarSalas`** (função pura, com teste), que nomeia a sala quando o `DETAIL` do Postgres traz o número. **É a exceção à regra da casa de repassar a mensagem do banco:** a regra existe para não trocar explicação por genérico, e `duplicate key value violates unique constraint "salas_prova_..."` não explica nada a quem renumera salas. Todo o resto — inclusive as mensagens que a própria RPC escreve, já em português — passa adiante intacto.

> 🧪 **A verificação real é `docs/bateria-salas-renumeracao.sql`**, não a suíte: o Vitest mocka o Supabase e não alcança índice único, transação nem SECURITY DEFINER. A bateria cobre a troca, a colisão legítima com sala de fora do lote, a atomicidade, o resíduo negativo, e a autorização — inclusive o **superadmin puro**, fabricado dentro da transação. Falsificada removendo o passo 1: a troca volta a estourar `23505`.

E um contraste que vale conhecer: **`useSalasDistribuidasCapacidade` trata lista vazia de unidades como "nada a perguntar"** — o `enabled` exige `unidadeIds.length > 0` e a `queryFn` ainda devolve `{}` antes de montar consulta. É o **oposto** do que `useOcorrencias` faz com a mesma situação, onde lista vazia vira "sem restrição" e devolve a prova inteira (defeito no [`backlog.md`](../../../backlog.md)). Mesma entrada, decisões opostas no mesmo módulo: ao mexer em qualquer um dos dois, alinhe-os.

## Capacidade agregada — são DUAS, e a fonte muda com a pergunta

> ⚠️ **Até 03/08 esta seção dizia que a capacidade sai "sempre do snapshot, não do template".** Deixou de ser verdade quando o seletor de unidades passou a mostrar a capacidade do cadastro; a frase fica registrada porque era ela que autorizava alguém a reusar o hook errado.

| Hook | Soma | Responde |
|---|---|---|
| `useUnidadeCapacidade.tsx` e `useSalasDistribuidasCapacidade` (em `useSalasDistribuidas.tsx`) | `salas_prova_distribuidas` — o **snapshot** | quantos lugares a unidade tem **nesta prova** |
| 🔵 `useCapacidadeTemplateUnidades` (em `useSalasProva.tsx`, 03/08) | `sala_prova` — o **template** | quantos lugares a unidade tem **no cadastro** |

Os dois números divergem de propósito, e não pouco: medido em 03/08, a **CGV** tem **480** no cadastro e **960** somando as duas provas do dump.

🔵 **Desde 2026-08-04 `/unidades-prova` é o TERCEIRO consumidor do template** — a listagem do catálogo ganhou a coluna **Vagas** por unidade e um **totalizador** no topo. Ali a escolha da fonte nem é escolha: a tela não tem prova no contexto, e o snapshot mostraria zero para toda unidade não vinculada. Os textos saem de `textoVagasDaUnidade` e `resumoDeVagas` (`src/lib/unidades.ts`, puras, com bateria), e a tela tem teste próprio (`UnidadesProva.ui.test.tsx`, 6 casos) que guarda os três estados — falsificado forçando `capacidadesProntas = true`, o que derruba exatamente os dois casos da consulta falhada.

- ⚠️ **O totalizador soma as unidades EXIBIDAS**, não o mapa inteiro de `sala_prova`. Hoje dá o mesmo número; passa a divergir no dia em que a lista ganhar filtro — é o defeito do *"limpar edital"* (contador filtrado ao lado de ação sobre o conjunto todo).
- ⚠️ **O hook fica no topo do componente**, antes do `return` condicional por `authLoading` — a mesma armadilha de ordem de hooks que `GerenciarProva` já pagou.
- 🔵 **A coerência de cache sai de graça:** as três mutations de `useSalasProva` já invalidam `["sala_prova_capacidade"]`, então criar/editar/excluir sala em `/salas-prova` corrige o número desta tela sozinho.

🔴 **`GerenciarProva.tsx` usa os dois, na mesma tela** — é onde a troca é mais fácil e mais silenciosa. A coluna **"Capacidade"** da tabela de unidades vinculadas é o snapshot; o **rótulo do seletor de "adicionar unidade"** é o cadastro. Um teste de página guarda a distinção com números diferentes no fixture (a unidade disponível tem 350 no cadastro e **nada** no snapshot), justamente para que ler a fonte errada apareça como falha.

O hook novo traz o catálogo inteiro numa consulta (52 linhas em 03/08) e agrega no cliente, como o antigo. ⚠️ **Acima de 1.000 linhas o limite padrão do PostgREST trunca** e a soma fica calada a menos — nesse dia isto vira RPC de agregação. As três mutations de `useSalasProva` invalidam `["sala_prova_capacidade"]` junto com a lista da unidade, senão mexer numa sala não corrigiria o número exibido na outra tela.

### 🔵 O seletor de unidades diz o tamanho da unidade (2026-08-03)

O seletor de "adicionar unidade" de `/gerenciar-prova` listava só o nome — e quem vincula uma unidade está decidindo onde caberão os inscritos. Para saber o tamanho era preciso sair da página, ir a `/unidades-prova` → `/salas-prova/:id` e somar as salas na cabeça. O rótulo agora é `SIGLA - Nome (capacidade: N)`.

O texto sai de **`rotuloUnidadeDisponivel`** (`src/lib/unidades.ts`, função pura com teste), e o que ela existe para garantir são **três estados distintos**, não a formatação:

| capacidade | quando | rótulo |
|---|---|---|
| `null` | carregando **ou consulta falhou** | só `SIGLA - Nome`, sem afirmar número |
| `0` | unidade sem sala cadastrada | `(sem salas cadastradas)` |
| `> 0` | soma do cadastro | `(capacidade: 350)` |

- ⚠️ **O zero não é borda: é o caso comum.** Medido em 03/08, **7 das 11 unidades** não têm sala cadastrada. `(capacidade: 0)` seria verdade e não ajudaria; a frase manda a pessoa para o lugar certo.
- 🔴 **Carregando e falhou dão o mesmo `{}`** que "nenhuma sala", e por isso `useCapacidadeTemplateUnidades` **expõe `error`**: sem ele, um `42501` faria a tela acusar de vazias todas as unidades da lista, com cara de informação correta. É o "vazio enquanto carrega" com uma segunda porta de entrada.
- Soma zero **é** ausência de salas porque a CHECK `chk_sala_capacidade_positiva` não deixa existir sala com capacidade 0. Se essa constraint cair, o texto passa a mentir.
- ⚠️ **O rótulo repete a sigla quando ela já está no nome** — a `UGB-II` sai como `UGB-II - UGB - Bloco II (capacidade: 350)`. É o formato `sigla - nome` que já existia; não foi mexido.

### 🔴 O painel "Total de Inscritos / Alocados / Não Alocados" (mudou em 2026-08-02)

A conta vive em **`src/lib/alocacao.ts`** (`resumoAlocacao`, com testes próprios), e não no meio do componente — porque a **fonte** dela mudou e é o tipo de semântica que regride calada:

> 🔵 **São DUAS baterias, com objetos diferentes** (02/08): `lib/alocacao.test.ts` prova a **aritmética** (função pura), e `pages/GerenciarProva.ui.test.tsx` (12 casos) prova a **ligação** — que a página pega o edital certo, entrega os números certos à função e respeita quem pode ver o painel. Falsificada nas duas direções: ler a contagem do edital errado derruba 4 casos, e tirar o `isAdmin` derruba exatamente o do coordenador. Os **4 últimos casos são de outro assunto** (02/08): guardam que a página NÃO abre o dialog de valores sozinha — ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).

| | Antes | Desde 02/08 |
|---|---|---|
| Total | `prova.prova_n_candidatos` (digitado à mão) | `count(candidatos)` do **edital da prova**, via `useContagemCandidatosPorEdital` |

Media-se **200** numa prova cujo edital tinha **7.231** inscritos: `naoAlocados = 200 − alocados` dizia que a prova estava coberta faltando **7.031** lugares, sem erro nenhum na tela.

O que a função existe para garantir:

- **Nenhum estado vira "0".** Carregando diz que está contando; sem lista importada diz que não há lista (com link para importar); prova sem `edital_id` (a coluna é NULLABLE) diz isso, e não culpa a importação.
- **`naoAlocados` negativo é legítimo** — significa mais lugares que inscritos. Só `> 0` pinta de vermelho; um `Math.max(0, …)` "consertando" isso apagaria a distinção (há caso de teste guardando).
- ⚠️ **O painel é `isAdmin &&`, e isso é parte da regra.** A RLS de `candidatos` é só de admin e a RPC é SECURITY INVOKER: para coordenador a contagem volta **vazia sem erro**, e a tela diria "nenhum inscrito importado" a quem tem lista.
- ⚠️ **O hook fica no topo do componente**, junto dos outros: abaixo há `return` condicional por `authLoading`, e chamar hook depois dele quebra a ordem de hooks do React (a suíte pegou exatamente isso ao escrever a mudança).

### 🔴 Prova ou unidade FINALIZADA congela as salas (`PF001`, 2026-08-03)

Até 03/08 o único obstáculo a editar as salas de uma prova encerrada era **a ausência do link**: a visão de prova finalizada em `GerenciarProva` não mostra o botão que leva a `/gerenciar-salas-distribuidas`. A rota nunca olhou `prova_finalizada`, e o banco também não — URL na mão, aba aberta antes da finalização, PostgREST direto ou script gravavam normalmente. No dump, **as 2 provas estão finalizadas**, ou seja, isso alcançava todas as 58 salas.

A barreira é o trigger **`check_sala_de_prova_finalizada`** (`BEFORE INSERT OR UPDATE OR DELETE`, migration `20260803003152`), que recusa com SQLSTATE `PF001` e mensagem que **nomeia a prova e diz o que fazer** ("Reabra a prova para editar"). A tela faz a outra metade: banner *"Salas somente leitura"* com o motivo, campos desabilitados e os botões de salvar/adicionar fora do caminho.

**São dois níveis, e congelam os dois** — decisão do usuário em 03/08:

| nível | coluna | quem aciona |
|---|---|---|
| prova | `provas.prova_finalizada` | criador da prova **ou superadmin**, via `finalizar_prova` |
| unidade | `prova_unidades.unidade_finalizada` | **também o coordenador**, via `finalizar_prova_unidade` |

> 🔵 **A linha "ou superadmin" da prova só passou a ser VERDADE em 2026-09-12.** Até então `finalizar_prova`/`reabrir_prova` exigiam ser o criador, e ponto — nem superadmin passava; a doc afirmava o contrário desde antes. O conserto (migration `20260912191749`) alinhou o código à doc por decisão do usuário, e não o inverso: o motivo é operacional e medido — as provas do banco foram criadas por uma admin que não é superadmin, então ninguém mais conseguiria finalizá-las se ela saísse.
>
> ⚠️ **As quatro RPCs liam `p_user_id`, enviado pelo cliente, em vez de `auth.uid()`** — qualquer autenticado finalizava prova alheia sabendo o `created_by`. O parâmetro saiu da assinatura. Detalhe em [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md); a prova, em `docs/bateria-finalizacao-autorizacao.sql`.

⚠️ **Consequências que precisam ser ditas, as duas assumidas:**

1. **Coordenador passa a bloquear admin.** Fechando a unidade dele, o admin não edita mais aquelas salas até alguém chamar `reabrir_prova_unidade`.
2. **Desvincular unidade de prova finalizada passa a ser recusado**, porque `desvincular_unidade_da_prova` apaga as salas do snapshot. Chega com mensagem legível; o caminho de volta é reabrir.

⚠️ **O trigger NÃO tem exceção por role** — nem `service_role`. O que mantém o `db reset` de pé é o **próprio dump**, que abre com `SET session_replication_role = replica` e o devolve a `origin` no fim. Um carve-out por superusuário chegou a ser escrito e foi removido: em Supabase o role `postgres` **não é superusuário** (`usesuper = f`), então ele nunca dispararia — era ilusão de proteção.

> 🧪 Seção 4 de [`../../../../docs/bateria-salas-renumeracao.sql`](../../../../docs/bateria-salas-renumeracao.sql): recusa no nível da prova e no da unidade, em UPDATE, INSERT e DELETE, mais os controles positivos de **reabrir** (volta a salvar) e de `session_replication_role` (com ele passa, sem ele não). A tela tem bateria própria em `pages/GerenciarSalasDistribuidas.ui.test.tsx` (4 casos) — que prova o AVISO, nunca a barreira.

### ✅ Edição não salva deixou de ser sobrescrita pelo refetch (2026-08-03)

A tabela de `/gerenciar-salas-distribuidas` é editada num estado local (`editableSalas`), copiado de `salas` por um `useEffect`. Esse efeito rodava **a cada mudança de referência da query** — e o `QueryClient` do `App.tsx` nasce sem defaults, então `refetchOnWindowFocus` está ligado. Bastava outra pessoa salvar naquela unidade e você voltar para a aba: **o que estava digitado sumia, sem aviso e sem confirmação**.

⚠️ **Por que sobreviveu tanto tempo:** com dado **idêntico** o *structural sharing* do react-query preserva a referência, e a edição ficava de pé — no uso comum nada acontecia. O defeito só mordia quando o dado tinha mudado de verdade, que é justamente quando perder o trabalho custa mais. Os dois cenários foram medidos antes da correção.

Hoje, havendo edição pendente, o dado novo **não entra**: a tela avisa ("Estas salas mudaram no servidor enquanto você editava"), mantém o que a pessoa digitou e oferece **"Descartar as minhas e recarregar"**. Perder trabalho digitado virou escolha de quem digitou.

- O flag de "há edição pendente" mora num **`ref`**, não em estado: em estado ele entraria nas deps do efeito e o próprio ato de começar a editar acusaria "o servidor mudou".
- Um `aplicarEdicao(id, patch)` centralizou as seis edições de célula — é o único ponto que marca o flag, para o sétimo handler não nascer sem ele.
- Salvar limpa o flag (via `onSuccess` da própria chamada), senão a tela ficaria presa no aviso depois de um save bem-sucedido.

🔴 **O guarda `if (salas.length > 0)` que existia ali escondia DOIS problemas.** O visível: lista voltando vazia não limpava a tabela, e as linhas da carga anterior ficavam na tela. O escondido: `useSalasDistribuidas` devolvia `query.data ?? []` — **array novo a cada render** —, então sem aquele guarda o efeito se realimentava num **laço infinito**. Ao removê-lo, o worker do Vitest morreu por falta de memória em segundos. A saída foi a constante de módulo `SEM_SALAS` no hook. **Todo hook deste repo que devolve `?? []` tem essa bomba armada para quem puser a lista em deps de efeito.**

> 🧪 4 casos em `pages/GerenciarSalasDistribuidas.ui.test.tsx`, com o refetch disparado pelo `focusManager` do react-query (o `dispatchEvent("focus")` não basta no jsdom). Falsificada nas duas direções: voltar a sobrescrever derruba 2, e travar a tela para sempre derruba os 8 do arquivo.

### ✅ Os três campos numéricos aceitam ficar vazios enquanto se digita (2026-08-03)

`handleCapacidadeChange` e `handleNumeroChange` faziam `return` quando o valor não era número. Apagar o conteúdo produz `""` → `NaN` → o estado não mudava → e, como o input é **controlado**, o React repunha o valor antigo: **não dava para apagar dígito a dígito**, só selecionar tudo e digitar por cima. `handleAndarChange` fazia o oposto (vazio virava `null`). Três campos, duas regras, nenhuma escrita.

A regra agora é uma só, em `src/lib/salas.ts` (`numeroDigitado`), com três respostas: **vazio → `null`** (estado de digitação, entra no estado), **tecla que não vira número → ignorada**, **negativo → recusado** (não saturado em zero — é a decisão do `ValoresFuncaoProvaDialog`: 0 é capacidade válida).

Onde a exigência mora mudou de lugar, e foi **medido no banco**:

| coluna | no banco | vazio na tela |
|---|---|---|
| `sala_numero` | **NOT NULL** | só enquanto digita — salvar em branco é recusado |
| `sala_capacidade` | **NOT NULL** | idem |
| `sala_andar` | **NULLABLE** | valor final legítimo, vai como `null` |

⚠️ **A recusa de campo em branco roda ANTES da checagem de duplicata**, e a ordem não é estética: com dois números vazios, a checagem antiga veria `null === null` e acusaria *"número duplicado"* — mandando corrigir a coisa errada.

### 🧹 Limpezas do mesmo dia

- **`sala_andar_texto` saiu do tipo `SalaDistribuida`: a coluna NÃO EXISTE na tabela.** As 12 colunas reais são as que a interface declara. Por ser opcional (`?:`), o `tsc` nunca reclamou e o `select("*")` nunca a trouxe — quem confiasse nela leria `undefined` para sempre.
- `GerenciarSalasDistribuidas` desestruturava `user` e `isAdmin` de `useAuth` sem usar nenhum dos dois: quem autoriza a rota é o `RequireAcesso papeis={["admin"]}` do `App.tsx`.

## 🔵 Criar salas em lote — a faixa de andares (2026-08-03)

O formulário de `/salas-prova` ("Novas Salas") pedia **um** andar, e o lote inteiro caía nele. Hoje pede `De`/`Até`, e **`quantidade` é por andar**: o total é `quantidade × (até − de + 1)`. `De 2 Até 2` continua atendendo um andar só — foi por isso que a faixa venceu a alternativa "quantidade de andares a partir do 1º", que tornaria impossível acrescentar salas a um andar específico.

A numeração saiu da mutation e virou **`numerosDoLote`** em [`../../../../src/lib/salas.ts`](../../../../src/lib/salas.ts) — função pura, com bateria própria. Ela responde `{ andares, total, erro }`:

- sequência de cada andar continua do **maior número daquele andar**;
- **recusa o lote inteiro** se algum andar da faixa estourar as 99 salas, nomeando o andar e quantas cabem — antes de qualquer escrita;
- ⚠️ **não é união discriminada** (`{ok:true} | {ok:false}`) porque o projeto compila com `strict: false`: sem `strictNullChecks` o TS não estreita pelo discriminante booleano, e todo consumidor quebraria.

A tela mostra a **prévia** (`Serão criadas 30 salas: 101–110, 201–210, 301–310`) e o toast de sucesso repete os números — sem isso, "30 salas criadas" não diz onde elas foram parar.

### 🔴 O que fazia o campo parecer quebrado — e as DUAS causas

O sintoma era um só: digitar um andar e clicar em Criar não produzia reação nenhuma. As causas eram duas, empilhadas, e caíram em passes separados da mesma sessão (2026-08-03).

1. **A mensagem não aparecia.** Os inputs tinham `min`/`max` **nativos**: o navegador barrava o submit com um balão próprio, e a mensagem em português do Zod nunca chegava à tela — armadilha 7 de [`../../transversais/testes.md`](../../transversais/testes.md). Os `min`/`max` nativos saíram; quem recusa é o schema, e ele fala.
2. **O teto não fazia sentido.** Mesmo falando, a recusa continuava sendo "esta unidade só tem 1 andar" em 7 das 11 unidades. `unid_andares` foi dropada: **não existe mais andar que a unidade não tem**.

> ⚠️ **Horas antes, nesta mesma sessão, esta seção terminava dizendo o oposto:** *"o teto continuar vindo do cadastro da unidade foi decisão do usuário — o registro do prédio é a verdade"*. Era verdade por algumas horas. A decisão mudou quando ficou claro que o cadastro de andares não servia a nada além do teto — e o teto só atrapalhava.

🔵 **O que morreu junto com o teto:** o `maxAndaresEdicao` (que mantinha editável a sala num andar acima do cadastro) e a frase que explicava o limite com link para `/unidades-prova`. Os dois eram remendo **em cima** do teto; sem ele, não sobrou o que remendar. É o desfecho preferível: a classe de defeito deixou de existir em vez de ganhar mais uma proteção.

### As recusas que ganharam voz, e o que o banco garante agora

| | Onde |
|---|---|
| faixa invertida · lote > 50 por andar · andar acima de `ANDAR_MAXIMO` | schema do `SalaProvaDialog` |
| estouro de 99 salas num andar | `numerosDoLote`, antes de escrever |
| **`sala_numero` = andar × 100 + (1..99)** | 🔵 **CHECK `chk_sala_numero_casa_com_andar`** |

⚠️ **`ANDAR_MAXIMO` (99) não é o teto de volta com outro nome.** É limite de **formato**, não do prédio: a numeração é `andar × 100 + sequência`, então do andar 100 em diante a sala passa a ter 5 dígitos (10001) e muda a cara de toda lista impressa. Não consulta o cadastro de nada.

A CHECK (migration `20260803234944`) fecha o buraco de a edição trocar **só** o número (ou **só** o andar) e deixar os dois divergentes — a tabela mostrando uma coisa e a numeração contando outra. Medido antes de apertar: **0 violações**, nenhuma sequência 0, nenhum andar nulo — nas 42 salas do template e 58 distribuídas da base recém-resetada, e também nas 52/68 da base com resíduo de teste que estava na máquina. `sala_andar IS NULL` segue aceito, porque a coluna é NULLABLE e a edição permite apagar o andar.

⚠️ **A CHECK está só em `sala_prova`, e isso é deliberado.** Em `salas_prova_distribuidas` a RPC `salvar_salas_distribuidas` renumera em dois passos com um valor transitório fora da faixa — é o que permite **trocar o número de duas salas**. Uma CHECK equivalente ali mataria essa operação, e nenhum valor transitório poderia satisfazê-la. No catálogo o caso não existe: nada renumera em lote.

> 🧪 A verificação real é [`../../../../docs/bateria-salas-cadastro.sql`](../../../../docs/bateria-salas-cadastro.sql) — 5 recusas (INSERT divergente, UPDATE só do andar, UPDATE só do número, sequência 0, negativo) e 4 controles positivos (sala coerente, andar nulo, mudar número **e** andar juntos, a sequência 99). A §4 prova que a CHECK **não** vazou para o snapshot. O Vitest não alcança nada disso.

### ⚠️ Dropar coluna exige cirurgia no dump — o passo que quebra o `db reset`

Os 42 `INSERT` de `sala_prova` no dump **nomeiam as colunas**, e o dump carrega **depois** das migrations. `DROP COLUMN sala_arcondicionado` sozinho quebraria todo `db reset` e o bootstrap de produção. A edição do dump foi **posicional pela coluna** (acha o índice do nome, remove o valor da mesma posição), como manda o `CLAUDE.md` — e o controle de que a posição estava certa é que **o único valor removido nas 42 linhas foi `'false'`**.

Verificado sem reset, em transação: `DROP` + CHECK + `DELETE FROM sala_prova` + replay das 42 linhas do dump editado → **42 linhas, 1.260 lugares, nenhuma recusa** → `ROLLBACK`.

## Ciclo de vida de uma prova

0. **Pré-requisito:** o edital existe em `/editais` (`useEditais.create`). Sem edital cadastrado não se cria prova.
1. Criada em `/provas` (`useProvas.create`), sob um edital escolhido no seletor.
2. Unidades vinculadas em `/gerenciar-prova/:provaId` (copia salas para o snapshot, como descrito acima).
3. Salas ajustadas/fiscais atribuídos em `/gerenciar-salas-distribuidas/:provaId/:unidadeId`.
4. Colaboradores alocados (ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md)) e ocorrências registradas durante a aplicação (ver [`ocorrencias.md`](./ocorrencias.md)).
5. **Finalização** — RPCs `finalizar_prova`/`finalizar_prova_unidade` (e reversão via `reabrir_prova`/`reabrir_prova_unidade`). Só depois de `prova_finalizada = true` é possível acessar `/documentos-impressao/:provaId` (a página redireciona para `/gerenciar-prova/:provaId` se a prova ainda não estiver finalizada).

## A listagem `/provas` não consulta nada (2026-09-10)

`Provas.tsx` renderiza **um `ProvaCard` por prova, sem paginação**. Até 10/09 cada cartão
fazia **três** consultas ao montar — `prova_unidades`, `meta_colaboradores_unidade`,
`colaboradores_prova` — e somava no cliente para exibir os totalizadores.

**Medido no banco local (cópia de produção), na maior das 2 provas — 11 unidades, 531
alocações:** 122.418 bytes em 3 requisições **por cartão**, a cada abertura da tela *e* a
cada volta de foco da janela (o `QueryClient` do `App.tsx` nasce sem `staleTime`). Como
provas nunca são apagadas — são o histórico operacional —, o custo da listagem crescia
com a vida inteira do sistema.

Hoje o cartão mostra só título, data, hora e "criado por", tudo vindo da prop `prova`, e
os totais moram em `ProvaTotaisDialog`, atrás de um botão de **lanterna** à esquerda da
engrenagem. A consulta é atrasada por `enabled: open` e a soma é feita no banco.

| | cru | gzip | requisições | quando |
|---|---|---|---|---|
| Antes | 122.418 | 3.771 | 3 | **em todo load, por cartão** |
| Depois | 43.665 | 2.246 | 1 | só no clique |

⚠️ **Note o que o ganho NÃO é.** Comprimido, a economia por abertura é modesta (1,7×) —
a RPC repete o nome da unidade em cada uma das 172 linhas, e JSON assim comprime bem. **O
ganho é a tela deixar de consultar**: de `N × 3` requisições no load para zero.

🔴 **`p_prova_unidade_ids` NÃO é redundante com a RLS, e isso foi medido, não deduzido.**
As duas policies envolvidas recortam em granularidades diferentes:

| Tabela | Recorte | O coordenador de 1 das 11 unidades vê |
|---|---|---|
| `meta_colaboradores_unidade` | por **unidade** | meta em **1** unidade |
| `colaboradores_prova` | por **prova** (`is_coordenador_prova(uid, pu.prova_id)`) | ocupação em **11** |
| `prova_unidades` | `USING (true)` | o nome das 11 |

Ou seja: sem o parâmetro, o coordenador veria a **ocupação de unidades que não coordena**
— a RLS não impede isso, e nunca impediu; quem impedia era o filtro client-side que a
tela já fazia. O parâmetro preserva esse recorte. ⚠️ `NULL` = sem recorte (admin); array
**vazio** = nenhuma unidade. Trocar um pelo outro faria um coordenador sem unidade ver a
prova inteira. A bateria `docs/bateria-totais-da-prova.sql` afirma os três casos.

⚠️ **Função com gente alocada e SEM meta cadastrada continua invisível.** A RPC devolve a
linha (`meta = 0`), e o descarte é da UI (`.filter(f => f.meta > 0)`) — comportamento
preexistente, preservado de propósito para a refatoração não mudar nada visível.

## Acesso restrito de coordenador

`GerenciarProva.tsx` filtra a lista de `prova_unidades` visíveis (`filteredProvaUnidades`) usando `useCoordenadorUnidades()` quando o usuário logado é `coordenador` — só vê as unidades daquela prova às quais foi explicitamente vinculado (ver [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md)). Essa filtragem é client-side; a proteção real de dados está nas RPCs/policies.

## Lock de edição concorrente (`useProvaUnidadeLock.tsx`)

Lock otimista por **unidade de prova**, para não deixar duas pessoas editando a mesma unidade em `/gerenciar-colaboradores-prova/:provaUnidadeId`:

- Adquire via RPC `acquire_prova_unidade_lock` — **parâmetro único: `p_prova_unidade_id`**. Quem é o dono e que nome os outros veem saem de `auth.uid()` dentro da função.
- Heartbeat a cada 30 segundos (`HEARTBEAT_INTERVAL`) por `update_prova_unidade_lock_activity`.
- Libera com `release_prova_unidade_lock` (desmonte e saída da página).
- O hook recebe só `{ provaUnidadeId, enabled }`. **Não devolva `userId`/`userName`** — ver a seção da identidade abaixo.
- Tabela `prova_unidade_edit_locks`, com `prova_unidade_id` **UNIQUE** e FK para `prova_unidades(id)`. Timeout de 10 minutos dentro da própria RPC (`v_lock_timeout INTERVAL := '10 minutes'`), migration `20260916100732`.
- **Quando não há lock a adquirir** (falta `provaUnidadeId`/`userId`/`userName`, ou `enabled: false`), o efeito de mount **resolve `isLoading` para `false` no `else`** em vez de chamar a RPC. Isso é contrato, não detalhe: quem consome o hook renderiza spinner enquanto `isLoading`, e sem esse `else` o estado inicial (`isLoading: true`) nunca seria resolvido. A guarda equivalente que existe *dentro* de `acquireLock` **é inalcançável pelo mount** — a condição do efeito já barra a chamada —, então não a tome por suficiente. Corrigido em 2026-07-25, depois de travar a tela de alocação num spinner sem erro nem saída; há teste de regressão para os quatro casos.

### 🔴 O lock NUNCA funcionou, de 2026-01 a 2026-09-16

⚠️ **Até 2026-09-16 esta seção descrevia um mecanismo que não existia.** Ela dizia "lock por prova", com a RPC `acquire_prova_lock` e a tabela `prova_edit_locks` — e tudo isso era verdade *no papel*. O que não era: `GerenciarColaboradoresProva` passava o `prova_unidades.id` da rota no parâmetro `p_prova_id`, e a coluna tinha FK para `provas(id)`. **Todo** pedido de lock morria em `23503`:

```
insert or update on table "prova_edit_locks" violates foreign key constraint
"prova_edit_locks_prova_id_fkey"
Key (prova_id)=(…) is not present in table "provas".
```

Mais de **500 ocorrências em 24h** no log de produção — uma por abertura da tela. `git log -L` mostra a linha nascendo assim no commit inicial: nunca funcionou, nem local, nem em produção.

**Por que ninguém viu em 8 meses:** falhava calado. No erro o hook devolve `hasAccess:false, isLocked:false, error:"…"`, e o portão da tela testa `isLocked && !hasAccess` — falso. A página abria normalmente, e o campo `error` não era renderizado em lugar nenhum. A ausência de reclamação não era sinal de que ninguém precisava do lock: **não havia como notar**.

**Por que o conserto foi mudar a granularidade, e não o id.** Passar o `provaId` de verdade seria regressão: o coordenador se vincula à prova por uma alocação (`coordenadores_prova.colaborador_prova_id` → `colaboradores_prova`, que pertence a uma `prova_unidade`), então coordenadores diferentes trabalham em **unidades diferentes da mesma prova** e um barraria o outro. As três mensagens da tela já diziam *unidade*.

**O que mudou junto, e por quê:**

| Mudança | Motivo |
|---|---|
| `useProvaLock` → `useProvaUnidadeLock`, `provaId` → `provaUnidadeId` | o nome errado é o que permitiu o id errado |
| tabela e RPCs recriadas com nome `*_prova_unidade_*` | neste repo o **nome mente antes do código**; renomear só a coluna deixaria o resto mentindo |
| `check_prova_lock` **dropada** | nunca teve um único consumidor |
| o `error` do lock virou **aviso visível** na tela | era o defeito de verdade: a proteção sumir sem avisar |
| caíram os três `(supabase.rpc as any)` | o `types.ts` foi regerado no mesmo passe; o cast era resíduo desde 31/07 |

⚠️ **A FK é `ON DELETE CASCADE`, contra a regra geral de RESTRICT do §2.** Um lock não é registro, é estado efêmero de 10 minutos: com RESTRICT, uma aba esquecida bloquearia o desvínculo da unidade.

**O aviso de falha NÃO bloqueia a tela**, de propósito. O lock é conveniência — a coerência do dado é barrada por trigger (`check_colaborador_prova_unique_trigger`) —, e tirar a operação do ar por uma falha transitória custaria mais do que avisa.

**Como se verifica:** `docs/bateria-lock-edicao-unidade.sql`, contra o banco local, em transação com ROLLBACK. Os 22 casos cobrem aquisição, recusa por id de prova (a regressão deste defeito, nomeando a constraint que barrou), **segunda pessoa em outra unidade da mesma prova** (o caso que decidiu o desenho), o nome gravado vindo de `profiles`, expiração aos 11 min com controle positivo aos 9, **release e heartbeat de lock alheio**, ausência de sessão, e o CASCADE. A sessão é simulada com `set_config('request.jwt.claims', …, true)`, como em `bateria-finalizacao-autorizacao.sql`. Falsificada: devolvendo o `release` sem conferir o dono, o CASO 8 reprova. ⚠️ A suíte Vitest **não alcança nada disso** — ela mocka o Supabase, onde qualquer string passa por uuid. O que ela cobre é a **ligação**, em `GerenciarColaboradoresProva.ui.test.tsx`: qual id a página entrega ao hook.

### 🔴 A identidade vem de `auth.uid()`, não do cliente (2026-09-16)

Migration `20260916102407`, no mesmo dia e logo depois da que trouxe o lock por unidade. As três RPCs recebiam `p_user_id uuid` e decidiam **de quem é o lock** sobre um parâmetro que o próprio chamador envia. `SECURITY DEFINER` não cobre isso: o DEFINER garante que a função escreve, não que quem pediu tinha direito. Qualquer usuário autenticado, chamando o PostgREST direto, podia:

- **liberar o lock de outra pessoa** e tomar a unidade;
- **manter vivo o lock alheio**, impedindo que os 10 minutos expirassem;
- **adquirir o lock em nome de outra pessoa** — e a tela dos demais culparia o inocente.

É a mesma falha que `20260912191749` fechou nas quatro RPCs de finalização, e o conserto segue aquele padrão de propósito.

⚠️ **`p_user_name` saiu junto, e não é estética.** Ele é o nome que as *outras* pessoas veem ("Fulano está editando esta unidade") e era string livre do cliente: dava para trancar uma unidade assinando com o nome de qualquer um. Identidade exibida é identidade. Agora sai de `profiles` (`full_name` → `email` do perfil → e-mail da conta → `'Usuário'`), pelo `auth.uid()`.

**Os dois parâmetros foram REMOVIDOS da assinatura, não ignorados.** Manter um argumento que parece identificar e não identifica é a armadilha do §8. Quem chamar na forma antiga recebe `42883` — erro barulhento, que é o que se quer.

🔵 **Efeito colateral bem-vindo na tela:** sumiu de `GerenciarColaboradoresProva` a consulta a `profiles` que existia só para alimentar o lock — e com ela a corrente `userNameCarregado` → `enabled`, que foi justamente a que travou esta tela num spinner sem saída em 25/07. O `enabled` continua exigindo `!!user`: sem sessão, `auth.uid()` é nulo e a RPC recusa com `P0002`.

🔴 **`auth.uid()` é NULL fora de uma sessão de usuário.** Conferido em 16/09: as três só são chamadas pelo front, com sessão — nenhuma Edge Function, nenhum script. Se uma automação precisar delas, o caminho é função própria com guarda explícita, **não** devolver o parâmetro. O `acquire` levanta exceção sem sessão; o heartbeat e o release devolvem `false` em silêncio, porque rodam em caminhos (intervalo e `pagehide`) onde não há a quem reportar.

⚠️ **São duas migrations no mesmo dia para o mesmo tema** (`…100732` e `…102407`) porque migration aplicada não se edita (§3) — a primeira já tinha rodado localmente quando a identidade entrou em pauta.

### Sair da página devolve o lock (corrigido em 2026-07-25)

**A armadilha que existia:** o handler de `beforeunload` liberava o lock com `navigator.sendBeacon`, e o **`sendBeacon` não permite definir header nenhum** — a requisição saía sem `apikey` e sem `Authorization`, que o PostgREST exige. Nunca liberava nada; quem devolvia a unidade era o timeout de 10 minutos. O código *parecia* correto, e é por isso que vale o registro: **não volte para `sendBeacon`** em nenhuma limpeza de unload que precise de auth.

⚠️ Note, com o de 2026-09-16 na mão, que este conserto de 25/07 foi feito sobre um lock que **jamais era adquirido**: `hasLockRef` nunca virava `true`, então nem o release nem o heartbeat chegavam a rodar. As três peças abaixo só passaram a valer de verdade em 16/09.

O desenho atual tem três peças que se sustentam mutuamente:

1. **`fetch` com `keepalive: true`**, no lugar do beacon — sobrevive ao unload **e** aceita headers.
2. **Evento `pagehide`**, no lugar de `beforeunload` — cobre tudo que ele cobria, mais o mobile mandando a aba para segundo plano, e a navegação que entra no bfcache. Um `hasLockRef.current = false` no início do handler impede envio duplo.
3. **`pageshow` com `event.persisted` readquire o lock.** Esta é a peça não óbvia: voltar do bfcache restaura uma tela que *acha* que tem o lock, mas o servidor já não tem a linha. **O heartbeat não conserta** — `update_prova_unidade_lock_activity` é um `UPDATE`, e não recria linha apagada (CASO 8b da bateria). Sem readquirir, dois navegadores editariam a mesma unidade achando cada um que é o dono.

O token de acesso é espelhado num `accessTokenRef` (alimentado por `getSession` + `onAuthStateChange`) porque o handler de saída é **síncrono**: não dá para esperar um `getSession()` enquanto a aba fecha.

