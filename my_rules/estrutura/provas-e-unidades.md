# Provas, Unidades e Salas

> Ver [`00-indice.md`](./00-indice.md). A alocação de pessoas dentro de uma prova/unidade fica em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md); ocorrências durante a prova em [`ocorrencias.md`](./ocorrencias.md); documentos gerados a partir de uma prova finalizada em [`documentos-e-relatorios.md`](./documentos-e-relatorios.md).

## Entidades e relação entre elas

- **`provas`** (`useProvas.tsx`) — uma prova/concurso vinculada a um edital (`prova_edital`), com data, horários, número de candidatos, cabeçalho customizável para documentos (`prova_cabecalho_linha1/2`), e um flag de ciclo de vida `prova_finalizada` (+ `finalizada_at`).
- **`unidades_prova`** (`useUnidadesProva.tsx`) — cadastro de locais físicos (escolas, universidades): nome, sigla, número de andares. É um **catálogo reutilizável entre provas**, não específico de uma prova.
- **`sala_prova`** (`useSalasProva.tsx`) — salas cadastradas por unidade, também um **template reutilizável**: número (`sala_numero` = andar×100 + sequência, ex. 101 = andar 1, sala 1), capacidade, andar, ar-condicionado. Criação em lote (`createMultiple`) calcula a próxima sequência disponível no andar automaticamente.
- **`prova_unidades`** (`useProvaUnidades.tsx`) — associação prova↔unidade. **Ao vincular uma unidade a uma prova, todas as salas daquela unidade em `sala_prova` são copiadas para `salas_prova_distribuidas`** (ver abaixo). Também carrega os flags de encerramento de ocorrências (`ocorrencias_encerradas*`, ver [`ocorrencias.md`](./ocorrencias.md)).
- **`salas_prova_distribuidas`** (`useSalasDistribuidas.tsx`) — **cópia editável das salas, específica de uma prova**. É aqui que se atribuem fiscais de sala (`sala_fiscal_1`, `sala_fiscal_2`) e se ajusta capacidade/descrição para aquela prova especificamente, sem alterar o template em `sala_prova`. Também é possível adicionar salas extras que só existem para aquela prova (`addSala`), sem tocar no template.

**Por que essa duplicação existe:** desacopla o catálogo permanente de infraestrutura (unidade/sala física) do uso pontual em uma prova específica — uma prova pode ter salas customizadas (capacidade diferente, sala extra) sem afetar o cadastro base nem outras provas que usem a mesma unidade. Ao adicionar uma feature que lida com "salas", primeiro identifique se ela deveria mexer no template (`sala_prova`) ou no snapshot da prova (`salas_prova_distribuidas`) — são coisas diferentes e a confusão entre as duas é o erro mais fácil de cometer aqui.

Remover uma unidade de uma prova (`removeUnidadeMutation`) deleta em cascata as `salas_prova_distribuidas` daquela unidade+prova antes de deletar o vínculo em `prova_unidades`.

## Capacidade agregada

`useUnidadeCapacidade.tsx` e `useSalasDistribuidasCapacidade` (em `useSalasDistribuidas.tsx`) calculam a soma de `sala_capacidade` por unidade a partir de `salas_prova_distribuidas` — ou seja, sempre a partir do snapshot da prova, não do template. Usado em `GerenciarProva.tsx` para mostrar quantos candidatos cabem por unidade.

## Ciclo de vida de uma prova

1. Criada em `/provas` (`useProvas.create`).
2. Unidades vinculadas em `/gerenciar-prova/:provaId` (copia salas para o snapshot, como descrito acima).
3. Salas ajustadas/fiscais atribuídos em `/gerenciar-salas-distribuidas/:provaId/:unidadeId`.
4. Colaboradores alocados (ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md)) e ocorrências registradas durante a aplicação (ver [`ocorrencias.md`](./ocorrencias.md)).
5. **Finalização** — RPCs `finalizar_prova`/`finalizar_prova_unidade` (e reversão via `reabrir_prova`/`reabrir_prova_unidade`). Só depois de `prova_finalizada = true` é possível acessar `/documentos-impressao/:provaId` (a página redireciona para `/gerenciar-prova/:provaId` se a prova ainda não estiver finalizada).

## Acesso restrito de coordenador

`GerenciarProva.tsx` filtra a lista de `prova_unidades` visíveis (`filteredProvaUnidades`) usando `useCoordenadorUnidades()` quando o usuário logado é `coordenador` — só vê as unidades daquela prova às quais foi explicitamente vinculado (ver [`auth-e-permissoes.md`](./auth-e-permissoes.md)). Essa filtragem é client-side; a proteção real de dados está nas RPCs/policies.

## Lock de edição concorrente (`useProvaLock.tsx`)

Lock otimista por prova para evitar duas pessoas editando a mesma prova ao mesmo tempo:
- Adquire lock via RPC `acquire_prova_lock` (params: `p_prova_id`, `p_user_id`, `p_user_name`).
- Envia heartbeat a cada 30 segundos (`HEARTBEAT_INTERVAL`) via `update_prova_lock_activity` para manter o lock vivo.
- Libera com `release_prova_lock` (ao desmontar/sair da tela).
- Suportado pela tabela `prova_edit_locks`. Timeout confirmado direto na RPC `acquire_prova_lock` (`supabase/migrations/20260122123358_19ffec24-*.sql`): `v_lock_timeout INTERVAL := '10 minutes'`.
