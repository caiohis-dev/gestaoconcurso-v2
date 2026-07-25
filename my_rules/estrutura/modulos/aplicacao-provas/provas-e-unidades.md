# Provas, Unidades e Salas

> Documento de área do módulo **Aplicação de Provas** — comece pelo contrato em [`00-modulo.md`](./00-modulo.md). A alocação de pessoas dentro de uma prova/unidade fica em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md); ocorrências durante a prova em [`ocorrencias.md`](./ocorrencias.md); documentos gerados a partir de uma prova finalizada em [`documentos-e-relatorios.md`](./documentos-e-relatorios.md).

## Entidades e relação entre elas

- **`editais`** — **entidade de outro módulo.** O CRUD, o schema, a unicidade do nome e o modelo "edital é template" estão em [`../editais/00-modulo.md`](../editais/00-modulo.md); não duplicado aqui. O que interessa deste lado: a prova **referencia** um edital e **herda dele apenas sugestões, na criação**.
- **`provas`** (`useProvas.tsx`) — uma prova pertence a um edital via **`edital_id`** (FK, **1 edital → N provas**, `ON DELETE RESTRICT`). Tem data, horários, e os SEUS próprios `prova_n_candidatos` e `prova_cabecalho_linha1/2` (herdados do edital como sugestão na criação, mas editáveis e independentes depois), além do flag de ciclo de vida `prova_finalizada` (+ `finalizada_at`). O **nome do edital** exibido/usado vem do join (`prova.editais.nome`), não de uma coluna da prova.
  - **O `ProvaDialog` trava a criação se não existir nenhum edital**, mostrando um link "Cadastrar Edital" para `/editais`. Como Editais é módulo só de admin, **um coordenador não consegue destravar isso sozinho**.
  - **Dívida de transição:** a coluna antiga `prova_edital` (CHAR(30)) ainda existe e é escrita como cópia denormalizada pelo `ProvaDialog` — `(edital?.nome ?? "").slice(0, 30)`, só para satisfazer seu `NOT NULL`. Não foi dropada porque o backfill em `seed.pos.sql` lê dela para reconstruir os editais a cada `db reset` do dump do v1. **Nenhum código novo deve ler `prova_edital`**: além de duplicar, ela trunca em 30 caracteres, então pode divergir do nome real. `edital_id` é `NULLABLE` no banco (a ordem migration→seed impede `NOT NULL`) e **obrigatório no app** (`z.string().min(1, "Selecione um edital")`). Migration `20260724170000_*`.
- **`unidades_prova`** (`useUnidadesProva.tsx`) — cadastro de locais físicos (escolas, universidades): nome, sigla, número de andares. É um **catálogo reutilizável entre provas**, não específico de uma prova.
- **`sala_prova`** (`useSalasProva.tsx`) — salas cadastradas por unidade, também um **template reutilizável**: número (`sala_numero` = andar×100 + sequência, ex. 101 = andar 1, sala 1), capacidade, andar, ar-condicionado. Criação em lote (`createMultiple`) calcula a próxima sequência disponível no andar automaticamente.
- **`prova_unidades`** (`useProvaUnidades.tsx`) — associação prova↔unidade. **Ao vincular uma unidade a uma prova, todas as salas daquela unidade em `sala_prova` são copiadas para `salas_prova_distribuidas`** (ver abaixo). Também carrega os flags de encerramento de ocorrências (`ocorrencias_encerradas*`, ver [`ocorrencias.md`](./ocorrencias.md)).
- **`salas_prova_distribuidas`** (`useSalasDistribuidas.tsx`) — **cópia editável das salas, específica de uma prova**. É aqui que se atribuem fiscais de sala (`sala_fiscal_1`, `sala_fiscal_2`) e se ajusta capacidade/descrição para aquela prova especificamente, sem alterar o template em `sala_prova`. Também é possível adicionar salas extras que só existem para aquela prova (`addSala`), sem tocar no template.

**Por que essa duplicação existe:** desacopla o catálogo permanente de infraestrutura (unidade/sala física) do uso pontual em uma prova específica — uma prova pode ter salas customizadas (capacidade diferente, sala extra) sem afetar o cadastro base nem outras provas que usem a mesma unidade. Ao adicionar uma feature que lida com "salas", primeiro identifique se ela deveria mexer no template (`sala_prova`) ou no snapshot da prova (`salas_prova_distribuidas`) — são coisas diferentes e a confusão entre as duas é o erro mais fácil de cometer aqui.

Remover uma unidade de uma prova (`removeUnidadeMutation`) deleta em cascata as `salas_prova_distribuidas` daquela unidade+prova antes de deletar o vínculo em `prova_unidades`.

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

⚠️ **A liberação no fechamento da aba não funciona como está.** O handler de `beforeunload` (`useProvaLock.tsx:159-177`) tenta liberar o lock com `navigator.sendBeacon` apontando para `${VITE_SUPABASE_URL}/rest/v1/rpc/release_prova_lock`. **O `sendBeacon` não permite definir header nenhum** — logo a requisição sai sem `apikey` e sem `Authorization`, que o PostgREST exige. Quem devolve a prova na prática é o **timeout de 10 minutos**. *(Conclusão de leitura do código, não testada em runtime.)* Ao refatorar, não presuma que a limpeza no unload funciona hoje; se quiser que funcione, o caminho é uma rota que aceite auth no corpo (ou um `fetch` com `keepalive`, que aceita headers).

**Detalhe de tipagem:** as três RPCs de lock são chamadas com cast `(supabase.rpc as any)` porque **não constam do `types.ts` gerado**. Regenerar os tipos não é o conserto óbvio — vale checar antes se elas existem no banco de produção ou se são mais um caso do drift schema-vs-migrations.
