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
- **`unidades_prova`** (`useUnidadesProva.tsx`) — cadastro de locais físicos (escolas, universidades): nome, sigla, número de andares. É um **catálogo reutilizável entre provas**, não específico de uma prova.
- **`sala_prova`** (`useSalasProva.tsx`) — salas cadastradas por unidade, também um **template reutilizável**: número (`sala_numero` = andar×100 + sequência, ex. 101 = andar 1, sala 1), capacidade, andar, ar-condicionado. Criação em lote (`createMultiple`) calcula a próxima sequência disponível no andar automaticamente.

  🧪 **Coberto desde 2026-07-26** (`useSalasProva.test.tsx`), e vale saber três coisas que o teste fixa, porque a numeração é calculada **no cliente** — não há `SEQUENCE` no banco:
  - continua do **maior número daquele andar**, não da contagem: sala excluída deixa buraco, e o buraco **não** é reaproveitado (número repetido confundiria lista já impressa);
  - salas de outros andares não empurram a contagem;
  - ⚠️ o esquema comporta **99 salas por andar**. Com a sala 199 existente, a próxima do andar 1 vira **200** — o número do andar 2 — e nada avisa. Caso extremo, mas é limite do esquema, não bug pontual: quem mexer na numeração precisa saber.
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

Três coisas fixadas por teste em `useSalasDistribuidas.test.tsx`:

- **Salvar em lote também não é transacional.** `updateSalas` dispara **um `UPDATE` por sala**, em paralelo (`Promise.all`). Se um falhar, os outros já foram — o usuário vê "Erro ao salvar" e conclui que nada foi gravado, mas parte da edição está no banco. Mesma classe do problema acima, mesma saída (RPC).
- **Sala sem `id` é ignorada em silêncio** (`if (!sala.id) return null`) — sem erro, sem aviso. Para sala nova o caminho é `addSala`; se um formulário passar a mandar linha nova pelo lote, ela some sem ninguém notar.
- **`addSala` não carimba `created_by`**, ao contrário de `useProvas`, `useProvaUnidades` e `useOcorrencias`, que leem `auth.getUser()`. A sala extra nasce sem autoria. Não quebra nada hoje (a coluna é nullable), mas ninguém sabe quem a acrescentou à mão.

E um contraste que vale conhecer: **`useSalasDistribuidasCapacidade` trata lista vazia de unidades como "nada a perguntar"** — o `enabled` exige `unidadeIds.length > 0` e a `queryFn` ainda devolve `{}` antes de montar consulta. É o **oposto** do que `useOcorrencias` faz com a mesma situação, onde lista vazia vira "sem restrição" e devolve a prova inteira (defeito no [`backlog.md`](../../../backlog.md)). Mesma entrada, decisões opostas no mesmo módulo: ao mexer em qualquer um dos dois, alinhe-os.

## Capacidade agregada

`useUnidadeCapacidade.tsx` e `useSalasDistribuidasCapacidade` (em `useSalasDistribuidas.tsx`) calculam a soma de `sala_capacidade` por unidade a partir de `salas_prova_distribuidas` — ou seja, sempre a partir do snapshot da prova, não do template. Usado em `GerenciarProva.tsx` para mostrar quantos candidatos cabem por unidade.

### 🔴 O painel "Total de Inscritos / Alocados / Não Alocados" (mudou em 2026-08-02)

A conta vive em **`src/lib/alocacao.ts`** (`resumoAlocacao`, com testes próprios), e não no meio do componente — porque a **fonte** dela mudou e é o tipo de semântica que regride calada:

> 🔵 **São DUAS baterias, com objetos diferentes** (02/08): `lib/alocacao.test.ts` prova a **aritmética** (função pura), e `pages/GerenciarProva.ui.test.tsx` (8 casos) prova a **ligação** — que a página pega o edital certo, entrega os números certos à função e respeita quem pode ver o painel. Falsificada nas duas direções: ler a contagem do edital errado derruba 4 casos, e tirar o `isAdmin` derruba exatamente o do coordenador.

| | Antes | Desde 02/08 |
|---|---|---|
| Total | `prova.prova_n_candidatos` (digitado à mão) | `count(candidatos)` do **edital da prova**, via `useContagemCandidatosPorEdital` |

Media-se **200** numa prova cujo edital tinha **7.231** inscritos: `naoAlocados = 200 − alocados` dizia que a prova estava coberta faltando **7.031** lugares, sem erro nenhum na tela.

O que a função existe para garantir:

- **Nenhum estado vira "0".** Carregando diz que está contando; sem lista importada diz que não há lista (com link para importar); prova sem `edital_id` (a coluna é NULLABLE) diz isso, e não culpa a importação.
- **`naoAlocados` negativo é legítimo** — significa mais lugares que inscritos. Só `> 0` pinta de vermelho; um `Math.max(0, …)` "consertando" isso apagaria a distinção (há caso de teste guardando).
- ⚠️ **O painel é `isAdmin &&`, e isso é parte da regra.** A RLS de `candidatos` é só de admin e a RPC é SECURITY INVOKER: para coordenador a contagem volta **vazia sem erro**, e a tela diria "nenhum inscrito importado" a quem tem lista.
- ⚠️ **O hook fica no topo do componente**, junto dos outros: abaixo há `return` condicional por `authLoading`, e chamar hook depois dele quebra a ordem de hooks do React (a suíte pegou exatamente isso ao escrever a mudança).

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
