# Funções, Valores e Alocação de Colaboradores

> Documento de área do módulo **Aplicação de Provas** — comece pelo contrato em [`00-modulo.md`](./00-modulo.md). Pressupõe o modelo de `provas`/`prova_unidades` descrito em [`provas-e-unidades.md`](./provas-e-unidades.md), e conecta com a concessão de acesso de coordenador em [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

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

**E há uma segunda tela acoplada a estas linhas, por outro caminho:** `useFiscaisSala` (em `useSalasDistribuidas.tsx`) identifica o fiscal pelo **nome**, com `includes("fiscal") && includes("sala")`. Renomear a função esvazia aquela lista sem erro. Duas telas, dois acoplamentos diferentes, ambos silenciosos — ver o ponto frágil 1 do [contrato do módulo](./00-modulo.md).

### ⚠️⚠️ Excluir uma função NÃO é bloqueado pelo banco — ele apaga em cascata

Verificado no banco em 2026-07-25. As três FKs que apontam para `funcoes_colaboradores` são **destrutivas, não protetivas**:

| Tabela | `ON DELETE` | O que acontece ao excluir a função |
|---|---|---|
| `colaboradores_prova` | **SET NULL** | toda alocação que usava a função fica **sem função** — inclusive em provas já realizadas |
| `meta_colaboradores_unidade` | **CASCADE** | as metas daquela função **somem** |
| `valores_funcao_prova` | **CASCADE** | os valores de pagamento **somem** |

Ou seja: excluir uma função em uso **não dá erro**. Ela apaga dados de várias provas em silêncio, incluindo registro financeiro.

**A única barreira é o cliente:** `useFuncoesAssociadas` pergunta às três tabelas se a função está em uso e a página desabilita o botão. Duas consequências que precisam sobreviver a refatoração:

1. **`isFuncaoAssociada` devolve `false` enquanto carrega.** Hoje isso não morde porque `FuncoesColaboradores.tsx` só renderiza a tabela depois de `isLoadingAssociacoes` virar `false`. **Quem reusar o hook em outro lugar precisa gatear pelo `isLoading` também** — confiar só no booleano reabre a janela.
2. **Se uma tabela nova passar a referenciar `funcao_id`, ela tem de entrar nas três consultas do hook** — senão a exclusão volta a ser liberada para funções em uso, sem nada acusar.

Fechar isso de verdade é trabalho de banco (trigger que recusa, ou `ON DELETE RESTRICT`) — item no [`backlog.md`](../../../backlog.md).

### `useFuncoesAssociadas.tsx` — proteção contra exclusão de função em uso

Verifica se uma função está referenciada em qualquer uma de três tabelas (`valores_funcao_prova`, `colaboradores_prova`, `meta_colaboradores_unidade`) e expõe `isFuncaoAssociada(funcaoId)`. Usado pela UI de `/funcoes-colaboradores` para impedir exclusão/edição de funções já em uso — ao adicionar uma quarta tabela que referencia `funcao_id`, essa função precisa ser atualizada também, senão a checagem fica incompleta.

## `valores_funcao_prova` — valor de pagamento por função, por prova

`useValoresFuncaoProva.tsx`: upsert simples (`funcaoId` + `valorPagamento`) por prova. Gerido no dialog `ValoresFuncaoProvaDialog` a partir de `GerenciarProva.tsx` — inclusive abre automaticamente se a prova ainda não tem nenhum valor cadastrado (`useEffect` em `GerenciarProva.tsx` checando `valoresFuncao.length === 0`).

## `meta_colaboradores_unidade` — meta de headcount por função, por unidade da prova

`useMetaColaboradoresUnidade.tsx`: upsert com `onConflict: "prova_unidade_id,funcao_id"` — ou seja, uma meta é única por combinação unidade-da-prova + função (não por prova inteira). Usado para acompanhar se a quantidade alocada bate com a meta planejada.

## `colaboradores_prova` — a tabela de alocação real

> 🧪 **O caminho do dinheiro tem bateria de interação desde 2026-07-26** — `ValoresFuncaoProvaDialog.ui.test.tsx` (20) e `MetaColaboradoresDialog.ui.test.tsx` (13). O acoplamento que elas fixam: **a meta só existe para função que já tem valor cadastrado nesta prova**. Dois consertos saíram dali no mesmo dia — o banco passou a recusar valor negativo (`chk_valor_pagamento_nao_negativo`, que o cliente agora barra antes com mensagem) e excluir um valor passou a **pedir confirmação**. Ficou aberto que apagar o valor deixa a **meta órfã** no banco, porque o upsert nunca apaga (item no [`backlog.md`](../../../backlog.md)).

`useColaboradoresProva.tsx`: liga `colaborador_id` + `prova_unidade_id` + `funcao_id`, com um **`valor_pagamento` próprio, copiado no momento da alocação** — não é um lookup ao vivo em `valores_funcao_prova`. Consequência prática: mudar o valor de uma função em `valores_funcao_prova` **não** atualiza retroativamente colaboradores já alocados; é preciso editar cada `colaboradores_prova` manualmente (ou reatribuir) se o valor mudou depois da alocação.

Regras de negócio observadas:
- **Um colaborador só pode estar alocado em uma unidade por prova** — a inserção falha no banco com mensagem contendo "já está alocado", capturada e traduzida no hook (`createMutation`).
- **Exclusão bloqueada se o colaborador tiver acesso de coordenador vinculado** (`coordenadores_prova.colaborador_prova_id`) — é preciso remover o acesso de coordenador antes de desalocar.
- A query `colaboradoresAlocadosQuery` retorna todos os colaboradores já alocados em **qualquer** unidade da mesma prova (não só a unidade atual) com a sigla da unidade onde estão — usado pela UI para desabilitar/anotar colaboradores já ocupados em outro lugar da mesma prova ao montar o combobox de adição.

## Acesso de coordenador (`coordenadores_prova`)

> ### ⚠️ Duas coisas achadas em 2026-07-25 que precisam ser lidas antes de mexer aqui
>
> **1. `is_coordenador_prova` NÃO olha o papel — só esta tabela.** A função é um `EXISTS` em `coordenadores_prova` por `(user_id, prova_id)`. Ela é usada na policy de `ocorrencias_colaborador` e nas RPCs `finalizar_prova_unidade` e `encerrar_ocorrencias_unidade`. Logo, **linha aqui = acesso real**, mesmo que a pessoa não tenha o papel `coordenador` em `user_roles`.
>
> Isso torna crítica a ordem de `useUsers.updateRole` ao revogar: ele apaga (1) o papel e (2) os vínculos desta tabela, em dois passos sem transação. **Falhar no passo 2 tira o papel e mantém o acesso** — a tela mostra alguém sem coordenação, e o banco continua deixando essa pessoa mexer nas ocorrências daquelas provas.
>
> **2. `addCoordenadorAccess` fabrica alocação para preencher a FK.** `coordenadores_prova.colaborador_prova_id` é obrigatório; quando a unidade da prova não tem nenhuma alocação, o hook pega **qualquer colaborador** (`.limit(1)`, sem ordenação) e cria uma linha em `colaboradores_prova` só para satisfazer a FK — sem função e sem valor. Como `colaboradores_prova` é a alocação real (base de relatório e pagamento), isso é dado inventado indistinguível do verdadeiro.
>
> A raiz é de modelagem: **coordenar uma prova não é trabalhar numa sala dela**, mas o acesso está amarrado a uma alocação. Item no [`backlog.md`](../../../backlog.md).

`useCoordenadoresProva.tsx` só considera "elegível" para virar coordenador um `colaboradores_prova` cuja `funcao_id` esteja em `FUNCOES_COORDENACAO` (acima). A concessão de acesso em si (inserir em `coordenadores_prova` + role `coordenador` em `user_roles`) tem dois caminhos possíveis no código com precondições diferentes — detalhado em [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md), não duplicado aqui.

Remover o acesso de um coordenador (`deleteMutation`) também remove a role `coordenador` de `user_roles` **se** essa era a última prova em que o usuário tinha acesso de coordenador (checagem de `otherAssignments` antes de remover a role).
