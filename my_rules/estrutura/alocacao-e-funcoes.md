# Funções, Valores e Alocação de Colaboradores

> Ver [`00-indice.md`](./00-indice.md). Pressupõe o modelo de `provas`/`prova_unidades` descrito em [`provas-e-unidades.md`](./provas-e-unidades.md), e conecta com a concessão de acesso de coordenador em [`auth-e-permissoes.md`](./auth-e-permissoes.md).

## `funcoes_colaboradores` — catálogo de funções/cargos

`useFuncoesColaboradores.tsx`: CRUD simples (`cargo_nome` único, `cargo_descricao`, `cargo_cbo`, `cargo_editavel`). Gerido em `/funcoes-colaboradores`.

### ⚠️ IDs hardcoded de funções de coordenação

`src/hooks/useCoordenadoresProva.tsx` define:

```ts
const FUNCOES_COORDENACAO = [
  "11a310e5-0fce-46f2-8ad7-769a5e5d7f89", // Coordenador Geral
  "8d36ef0f-becb-45f3-837b-04eea15489fb", // Auxiliar de Coordenação
];
```

Esses UUIDs literais identificam quais linhas de `funcoes_colaboradores` contam como "função de coordenação" para fins de elegibilidade de acesso de coordenador. **Isso é frágil por construção**: se essas duas linhas forem excluídas e recriadas (mesmo com nome idêntico), ganham novo UUID e o vínculo quebra silenciosamente — não há lookup por `cargo_nome` nesse ponto do código. Se for mexer em seeds/migrations que tocam `funcoes_colaboradores`, verifique se esses IDs específicos ainda existem antes de assumir que a elegibilidade de coordenador continua funcionando.

### `useFuncoesAssociadas.tsx` — proteção contra exclusão de função em uso

Verifica se uma função está referenciada em qualquer uma de três tabelas (`valores_funcao_prova`, `colaboradores_prova`, `meta_colaboradores_unidade`) e expõe `isFuncaoAssociada(funcaoId)`. Usado pela UI de `/funcoes-colaboradores` para impedir exclusão/edição de funções já em uso — ao adicionar uma quarta tabela que referencia `funcao_id`, essa função precisa ser atualizada também, senão a checagem fica incompleta.

## `valores_funcao_prova` — valor de pagamento por função, por prova

`useValoresFuncaoProva.tsx`: upsert simples (`funcaoId` + `valorPagamento`) por prova. Gerido no dialog `ValoresFuncaoProvaDialog` a partir de `GerenciarProva.tsx` — inclusive abre automaticamente se a prova ainda não tem nenhum valor cadastrado (`useEffect` em `GerenciarProva.tsx` checando `valoresFuncao.length === 0`).

## `meta_colaboradores_unidade` — meta de headcount por função, por unidade da prova

`useMetaColaboradoresUnidade.tsx`: upsert com `onConflict: "prova_unidade_id,funcao_id"` — ou seja, uma meta é única por combinação unidade-da-prova + função (não por prova inteira). Usado para acompanhar se a quantidade alocada bate com a meta planejada.

## `colaboradores_prova` — a tabela de alocação real

`useColaboradoresProva.tsx`: liga `colaborador_id` + `prova_unidade_id` + `funcao_id`, com um **`valor_pagamento` próprio, copiado no momento da alocação** — não é um lookup ao vivo em `valores_funcao_prova`. Consequência prática: mudar o valor de uma função em `valores_funcao_prova` **não** atualiza retroativamente colaboradores já alocados; é preciso editar cada `colaboradores_prova` manualmente (ou reatribuir) se o valor mudou depois da alocação.

Regras de negócio observadas:
- **Um colaborador só pode estar alocado em uma unidade por prova** — a inserção falha no banco com mensagem contendo "já está alocado", capturada e traduzida no hook (`createMutation`).
- **Exclusão bloqueada se o colaborador tiver acesso de coordenador vinculado** (`coordenadores_prova.colaborador_prova_id`) — é preciso remover o acesso de coordenador antes de desalocar.
- A query `colaboradoresAlocadosQuery` retorna todos os colaboradores já alocados em **qualquer** unidade da mesma prova (não só a unidade atual) com a sigla da unidade onde estão — usado pela UI para desabilitar/anotar colaboradores já ocupados em outro lugar da mesma prova ao montar o combobox de adição.

## Acesso de coordenador (`coordenadores_prova`)

`useCoordenadoresProva.tsx` só considera "elegível" para virar coordenador um `colaboradores_prova` cuja `funcao_id` esteja em `FUNCOES_COORDENACAO` (acima). A concessão de acesso em si (inserir em `coordenadores_prova` + role `coordenador` em `user_roles`) tem dois caminhos possíveis no código com precondições diferentes — detalhado em [`auth-e-permissoes.md`](./auth-e-permissoes.md), não duplicado aqui.

Remover o acesso de um coordenador (`deleteMutation`) também remove a role `coordenador` de `user_roles` **se** essa era a última prova em que o usuário tinha acesso de coordenador (checagem de `otherAssignments` antes de remover a role).
