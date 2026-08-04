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

`provas` era a raiz de **sete cascatas**: `prova_unidades` (que por sua vez leva alocações, metas e ocorrências), `valores_funcao_prova`, `coordenadores_prova`, `salas_prova_distribuidas`, `email_atualizacao_log`, `ocorrencias_colaborador` e `prova_edit_locks`. Medido na prova principal: apagá-la levaria **531 alocações, as 19 ocorrências do banco, 17 valores de pagamento, 172 metas, 42 salas e 10 acessos de coordenador**.

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
| prova | `provas.prova_finalizada` | criador da prova (ou superadmin), via `finalizar_prova` |
| unidade | `prova_unidades.unidade_finalizada` | **também o coordenador**, via `finalizar_prova_unidade` |

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

## Acesso restrito de coordenador

`GerenciarProva.tsx` filtra a lista de `prova_unidades` visíveis (`filteredProvaUnidades`) usando `useCoordenadorUnidades()` quando o usuário logado é `coordenador` — só vê as unidades daquela prova às quais foi explicitamente vinculado (ver [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md)). Essa filtragem é client-side; a proteção real de dados está nas RPCs/policies.

## Lock de edição concorrente (`useProvaLock.tsx`)

Lock otimista por prova para evitar duas pessoas editando a mesma prova ao mesmo tempo:
- Adquire lock via RPC `acquire_prova_lock` (params: `p_prova_id`, `p_user_id`, `p_user_name`).
- Envia heartbeat a cada 30 segundos (`HEARTBEAT_INTERVAL`) via `update_prova_lock_activity` para manter o lock vivo.
- Libera com `release_prova_lock` (ao desmontar/sair da tela).
- Suportado pela tabela `prova_edit_locks`. Timeout confirmado direto na RPC `acquire_prova_lock` (`supabase/migrations/20260122123358_19ffec24-*.sql`): `v_lock_timeout INTERVAL := '10 minutes'`.
- **Quando não há lock a adquirir** (falta `provaId`/`userId`/`userName`, ou `enabled: false`), o efeito de mount **resolve `isLoading` para `false` no `else`** em vez de chamar a RPC. Isso é contrato, não detalhe: quem consome o hook renderiza spinner enquanto `isLoading`, e sem esse `else` o estado inicial (`isLoading: true`) nunca seria resolvido. A guarda equivalente que existe *dentro* de `acquireLock` **é inalcançável pelo mount** — a condição do efeito já barra a chamada —, então não a tome por suficiente. Corrigido em 2026-07-25, depois de travar a tela de alocação num spinner sem erro nem saída; há teste de regressão para os quatro casos.

### Sair da página devolve o lock (corrigido em 2026-07-25)

**A armadilha que existia:** o handler de `beforeunload` liberava o lock com `navigator.sendBeacon`, e o **`sendBeacon` não permite definir header nenhum** — a requisição saía sem `apikey` e sem `Authorization`, que o PostgREST exige. Nunca liberava nada; quem devolvia a prova era o timeout de 10 minutos. O código *parecia* correto, e é por isso que vale o registro: **não volte para `sendBeacon`** em nenhuma limpeza de unload que precise de auth.

O desenho atual tem três peças que se sustentam mutuamente:

1. **`fetch` com `keepalive: true`**, no lugar do beacon — sobrevive ao unload **e** aceita headers.
2. **Evento `pagehide`**, no lugar de `beforeunload` — cobre tudo que ele cobria, mais o mobile mandando a aba para segundo plano e a navegação que entra no bfcache. Um `hasLockRef.current = false` no início do handler impede envio duplo.
3. **`pageshow` com `event.persisted` readquire o lock.** Esta é a peça não óbvia: voltar do bfcache restaura uma tela que *acha* que tem o lock, mas o servidor já não tem a linha. **O heartbeat não conserta** — `update_prova_lock_activity` é um `UPDATE`, e não recria linha apagada. Sem readquirir, dois navegadores editariam a mesma prova achando cada um que é o dono.

O token de acesso é espelhado num `accessTokenRef` (alimentado por `getSession` + `onAuthStateChange`) porque o handler de saída é **síncrono**: não dá para esperar um `getSession()` enquanto a aba fecha.

**Detalhe de tipagem:** as três RPCs de lock são chamadas com cast `(supabase.rpc as any)` porque **não constam do `types.ts` gerado**. Regenerar os tipos não é o conserto óbvio — vale checar antes se elas existem no banco de produção ou se são mais um caso do drift schema-vs-migrations.
