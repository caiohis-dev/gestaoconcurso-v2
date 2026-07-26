# Provas, Unidades e Salas

> Documento de área do módulo **Aplicação de Provas** — comece pelo contrato em [`00-modulo.md`](./00-modulo.md). A alocação de pessoas dentro de uma prova/unidade fica em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md); ocorrências durante a prova em [`ocorrencias.md`](./ocorrencias.md); documentos gerados a partir de uma prova finalizada em [`documentos-e-relatorios.md`](./documentos-e-relatorios.md).

## Entidades e relação entre elas

- **`editais`** — **entidade de outro módulo.** O CRUD, o schema, a unicidade do nome e o modelo "edital é template" estão em [`../editais/00-modulo.md`](../editais/00-modulo.md); não duplicado aqui. O que interessa deste lado: a prova **referencia** um edital e **herda dele apenas sugestões, na criação**.
- **`provas`** (`useProvas.tsx`) — uma prova pertence a um edital via **`edital_id`** (FK, **1 edital → N provas**, `ON DELETE RESTRICT`). Tem data, horários, e os SEUS próprios `prova_n_candidatos` e `prova_cabecalho_linha1/2` (herdados do edital como sugestão na criação, mas editáveis e independentes depois), além do flag de ciclo de vida `prova_finalizada` (+ `finalizada_at`). O **nome do edital** exibido/usado vem do join (`prova.editais.nome`), não de uma coluna da prova.
  - **O `ProvaDialog` trava a criação se não existir nenhum edital**, mostrando um link "Cadastrar Edital" para `/editais`. Como Editais é módulo só de admin, **um coordenador não consegue destravar isso sozinho**.
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

### ⚠️ As duas operações têm três passos e NÃO são transacionais

Vale para `addUnidade` e `removeUnidade`: cada passo é uma requisição própria do supabase-js, sem transação em volta. **Um toast de erro não significa "nada aconteceu"** — significa que parou no meio. Fixado por teste em `useProvaUnidades.test.tsx`.

**Adicionar** — (1) grava o vínculo → (2) lê as salas do template → (3) copia para o snapshot. Falhando no passo 3, a unidade fica **vinculada e sem sala nenhuma**. É recuperável pela própria UI: remover e adicionar de novo refaz a cópia.

**Remover** — (1) lê o vínculo para descobrir a unidade → (2) apaga o snapshot → (3) apaga o vínculo. Falhando no passo 3, as salas **já foram apagadas** e a unidade continua vinculada, com zero salas. **Este é o pior dos dois**, porque o snapshot podia estar customizado (salas extras do `SalaExtraDialog`, capacidades ajustadas, fiscais atribuídos) e nada disso existe no template — recriar pelo template não devolve o que foi editado.

Dois detalhes que parecem menores e não são:

- O delete do snapshot filtra por **`prova_id` E `sala_fk_unidade`**. Sem o `prova_id`, apagaria as salas daquela unidade em **todas** as provas.
- Se o passo 1 da remoção falhar, nada é apagado — falha fechada, e é o comportamento certo: sem saber a unidade, um delete só por `prova_id` varreria o snapshot inteiro da prova.

Se um dia isso precisar ser atômico, o caminho é uma RPC — não dá para resolver encadeando chamadas no cliente.

### O snapshot em si: `useSalasDistribuidas`

Três coisas fixadas por teste em `useSalasDistribuidas.test.tsx`:

- **Salvar em lote também não é transacional.** `updateSalas` dispara **um `UPDATE` por sala**, em paralelo (`Promise.all`). Se um falhar, os outros já foram — o usuário vê "Erro ao salvar" e conclui que nada foi gravado, mas parte da edição está no banco. Mesma classe do problema acima, mesma saída (RPC).
- **Sala sem `id` é ignorada em silêncio** (`if (!sala.id) return null`) — sem erro, sem aviso. Para sala nova o caminho é `addSala`; se um formulário passar a mandar linha nova pelo lote, ela some sem ninguém notar.
- **`addSala` não carimba `created_by`**, ao contrário de `useProvas`, `useProvaUnidades` e `useOcorrencias`, que leem `auth.getUser()`. A sala extra nasce sem autoria. Não quebra nada hoje (a coluna é nullable), mas ninguém sabe quem a acrescentou à mão.

E um contraste que vale conhecer: **`useSalasDistribuidasCapacidade` trata lista vazia de unidades como "nada a perguntar"** — o `enabled` exige `unidadeIds.length > 0` e a `queryFn` ainda devolve `{}` antes de montar consulta. É o **oposto** do que `useOcorrencias` faz com a mesma situação, onde lista vazia vira "sem restrição" e devolve a prova inteira (defeito no [`backlog.md`](../../../backlog.md)). Mesma entrada, decisões opostas no mesmo módulo: ao mexer em qualquer um dos dois, alinhe-os.

## Capacidade agregada

`useUnidadeCapacidade.tsx` e `useSalasDistribuidasCapacidade` (em `useSalasDistribuidas.tsx`) calculam a soma de `sala_capacidade` por unidade a partir de `salas_prova_distribuidas` — ou seja, sempre a partir do snapshot da prova, não do template. Usado em `GerenciarProva.tsx` para mostrar quantos candidatos cabem por unidade.

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
