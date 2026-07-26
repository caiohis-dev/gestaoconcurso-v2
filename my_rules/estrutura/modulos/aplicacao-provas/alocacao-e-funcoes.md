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

### ✅ Excluir uma função em uso é recusado PELO BANCO (desde 2026-07-26)

As três FKs que apontam para `funcoes_colaboradores` eram **destrutivas, não protetivas** — `SET NULL` em `colaboradores_prova`, `CASCADE` nas outras duas. Excluir uma função em uso **não dava erro**: apagava metas e valores de pagamento de várias provas em silêncio, e deixava alocações de provas já realizadas sem função. A única barreira era o cliente, então uma chamada direta ao PostgREST por um admin passava reto.

A migration `20260726190000_funcoes_colaboradores_on_delete_restrict.sql` trocou as três por **`ON DELETE RESTRICT`**:

| Tabela | Antes | Agora |
|---|---|---|
| `colaboradores_prova` | SET NULL | **RESTRICT** |
| `meta_colaboradores_unidade` | CASCADE | **RESTRICT** |
| `valores_funcao_prova` | CASCADE | **RESTRICT** |

**Por que RESTRICT e não soft delete:** cogitou-se que o `SET NULL` fosse deliberado, para permitir *aposentar* uma função sem travar em histórico antigo. O usuário decidiu em 26/07 que **não existe função aposentada** — o bloqueio que a UI de `/funcoes-colaboradores` já fazia é o comportamento correto, e a migration só o move para onde não pode ser contornado.

Medido antes de apertar: **0 linhas** de `colaboradores_prova` com `funcao_id` nulo (de 554), ou seja o `SET NULL` nunca chegou a disparar em produção. A troca não exigiu saneamento.

**O erro chega à UI traduzido.** `mensagemErroExclusaoFuncao` (em `useFuncoesColaboradores.tsx`) converte o `23503` numa instrução que **nomeia qual uso bloqueia** — alocação, meta ou valor —, porque as três pedem providências diferentes. ⚠️ Duas sutilezas com teste guardando: casar por `/colaboradores/` em vez de `/colaboradores_prova/` faria `meta_colaboradores_unidade` cair no ramo errado; e o Postgres reporta só a **primeira** violação, então a frase diz "ainda há" — resolvida uma, a próxima tentativa pode esbarrar em outra tabela.

### ⚠️ Há uma SEGUNDA barreira no banco, mais antiga, e ela dispara primeiro

O trigger `check_system_funcao_changes` (`BEFORE DELETE OR UPDATE`, função `prevent_system_funcao_changes()`, `SECURITY DEFINER`) recusa, para linhas com **`cargo_editavel = false`**:

- **excluir** → *"Não é permitido excluir funções básicas do sistema."*
- **renomear** → *"Não é permitido alterar o nome de funções básicas do sistema."*
- **tornar editável** (`false → true`) → *"Não é permitido tornar funções do sistema editáveis."*

São as 7 funções básicas marcadas por UUID nas migrations originais (ver [`../../transversais/desenvolvimento-local.md`](../../transversais/desenvolvimento-local.md)). Consequência prática ao depurar: **tentar excluir uma função do sistema levanta `P0001`, não `23503`** — o trigger corre antes da checagem de FK. Para exercitar o RESTRICT é preciso uma função **editável** e em uso.

### `useFuncoesAssociadas.tsx` — proteção contra exclusão de função em uso

Verifica se uma função está referenciada em qualquer uma de três tabelas (`valores_funcao_prova`, `colaboradores_prova`, `meta_colaboradores_unidade`) e expõe `isFuncaoAssociada(funcaoId)`. Usado pela UI de `/funcoes-colaboradores` para desabilitar o botão de exclusão de funções já em uso.

**Ele deixou de ser a rede de segurança e passou a ser conveniência** — quem recusa agora é o banco (RESTRICT, acima). Isso rebaixou duas fragilidades que antes eram graves, e vale saber que elas continuam ali:

1. **`isFuncaoAssociada` devolve `false` enquanto carrega.** Antes, essa janela permitia apagar dado; hoje ela só permite *tentar*, e a pessoa leva a mensagem traduzida em vez do botão desabilitado. Ainda assim, quem reusar o hook em outro lugar deve gatear pelo `isLoading` — `FuncoesColaboradores.tsx` já faz isso.
2. **Uma quarta tabela que referencie `funcao_id` precisa entrar nas três consultas do hook** — senão o botão fica habilitado indevidamente. E a FK dela deve nascer `RESTRICT`: `mensagemErroExclusaoFuncao` tem um ramo genérico justamente para esse caso, mas a instrução sai vaga até alguém nomear a tabela nova ali.

## `valores_funcao_prova` — valor de pagamento por função, por prova

`useValoresFuncaoProva.tsx`: upsert simples (`funcaoId` + `valorPagamento`) por prova. Gerido no dialog `ValoresFuncaoProvaDialog` a partir de `GerenciarProva.tsx` — inclusive abre automaticamente se a prova ainda não tem nenhum valor cadastrado (`useEffect` em `GerenciarProva.tsx` checando `valoresFuncao.length === 0`).

## `meta_colaboradores_unidade` — meta de headcount por função, por unidade da prova

`useMetaColaboradoresUnidade.tsx`: upsert com `onConflict: "prova_unidade_id,funcao_id"` — ou seja, uma meta é única por combinação unidade-da-prova + função (não por prova inteira). Usado para acompanhar se a quantidade alocada bate com a meta planejada.

### ✅ Apagar o valor de uma função não deixa mais a meta órfã

`upsertMetas` é upsert puro e **nunca apaga**. Como o `MetaColaboradoresDialog` só lista funções que têm valor nesta prova, apagar o valor fazia a função sumir do diálogo enquanto a linha em `meta_colaboradores_unidade` continuava no banco, com a quantidade que alguém digitou.

**O dano não era abstrato:** `ProvaCard` lê a tabela direto e filtra `meta > 0`, então a meta órfã **continuava aparecendo no card da prova** como função faltando gente — e ninguém conseguia zerá-la, porque sem valor ela não aparecia mais no diálogo. Demanda fantasma: visível onde se lê, inalcançável onde se edita.

A migration `20260726200000_impedir_remover_valor_com_meta.sql` criou o trigger **`check_valor_sem_meta`** (`BEFORE DELETE` em `valores_funcao_prova`), que recusa remover o valor enquanto houver **meta > 0** daquela função na prova.

Três escolhas de desenho que precisam sobreviver a refatoração:

1. **Trigger, não FK.** A meta é chaveada por `(prova_unidade_id, funcao_id)` e o valor por `(prova_id, funcao_id)`: a dependência cruza um nível (unidade → prova), e **nenhuma FK expressa isso**.
2. **`quantidade_meta > 0`, não "existe linha".** O diálogo só faz upsert — não há como remover a linha pela tela, só zerá-la. Bloquear pela existência da linha criaria impasse; zerar é o gesto disponível, então é ele que destrava. Verificado com dado real: uma função com **8 linhas de meta, todas zero**, teve o valor removido normalmente.
3. **`SECURITY DEFINER`.** Sem isso as consultas do trigger rodariam sob a RLS de quem chama, e um coordenador que enxerga só as próprias unidades não veria as metas das outras — a barreira ficaria porosa justamente para o usuário mais restrito.

**Decisão do usuário (26/07):** bloquear, e **não** zerar as metas junto. Zerar seria um clique só, mas perderia em silêncio o número planejado. O atrito do bloqueio aparece só quando a exclusão é duvidosa: se ninguém planejou aquela função, as metas já são 0 e nada é bloqueado.

⚠️ **`useValoresFuncaoProva.deleteValor` descartava a mensagem do banco** e mostrava "Erro ao remover valor" para tudo — a mesma classe já paga uma vez aqui (a mensagem da Edge Function jogada fora). Agora passa adiante via `mensagemErroRemocaoValor`. Sem isso o bloqueio seria pior que o bug: a pessoa levaria um genérico sem saber que o obstáculo é uma meta que ela nem enxerga.

## `colaboradores_prova` — a tabela de alocação real

> 🧪 **O caminho do dinheiro tem bateria de interação desde 2026-07-26** — `ValoresFuncaoProvaDialog.ui.test.tsx` (20) e `MetaColaboradoresDialog.ui.test.tsx` (13). O acoplamento que elas fixam: **a meta só existe para função que já tem valor cadastrado nesta prova**. Dois consertos saíram dali no mesmo dia — o banco passou a recusar valor negativo (`chk_valor_pagamento_nao_negativo`, que o cliente agora barra antes com mensagem) e excluir um valor passou a **pedir confirmação**. ✅ **A meta órfã fechou em 2026-07-26** — ver a seção em `meta_colaboradores_unidade`, acima.

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
> ✅ **Isso tornava crítica a ordem de `useUsers.updateRole` ao revogar** — ele apagava o papel primeiro e os vínculos depois, em dois passos sem transação, e falhar no segundo **tirava o papel e mantinha o acesso**. Corrigido em 2026-07-26: virou a RPC transacional `revogar_coordenador`, que apaga os dois numa transação só.
>
> ✅ **2. A fabricação de alocação para preencher a FK — REMOVIDA por inteiro em 2026-07-26.** `coordenadores_prova.colaborador_prova_id` é `NOT NULL`; quando a unidade não tinha alocação nenhuma, pegava-se **qualquer colaborador** (`.limit(1)`, sem ordenação) e criava-se uma linha em `colaboradores_prova` sem função e sem valor. Como esta é a tabela de alocação real (base de relatório e pagamento), era dado inventado indistinguível do verdadeiro.
>
> Havia **duas cópias**, e as duas caíram no mesmo dia: `useUsers.addCoordenadorAccess` (com a concessão pela UI de `/gerenciar-usuarios`) e `createCoordenadorAccess`, na EF `create-admin`. **A EF passou a recusar `role: "coordenador"` com 400** em vez de ignorar o papel — porque o papel sozinho não é inofensivo: o `RequireAcesso` deriva `isCoordenador` de `user_roles`, então quem só o recebesse **passaria pelos guards** das rotas de coordenação e entraria para ver listas vazias. Rebaixar em silêncio para `user` seria pior ainda: papel errado, sem sinal.
>
> ⚠️ **Não há teste automatizado guardando isso** — a EF roda em Deno, fora do alcance do Vitest, e o teste `⚠️ DEFEITO` que acusava a fabricação saiu junto com o hook. A verificação foi manual, contra o runtime local: os dois corpos com `coordenador` devolveram 400, o caminho `admin` devolveu 200, e `colaboradores_prova`/`coordenadores_prova` ficaram em 554/9 antes e depois. **Quem mexer na `create-admin` refaz isso à mão.**
>
> Sobra a raiz, que é de modelagem: **coordenar uma prova não é trabalhar numa sala dela**, mas o acesso está amarrado a uma alocação. Tornar a coluna nullable segue sendo o conserto de fundo, caso o fluxo de três passos não se sustente na operação.

`useCoordenadoresProva.tsx` só considera "elegível" para virar coordenador um `colaboradores_prova` cuja `funcao_id` esteja em `FUNCOES_COORDENACAO` (acima). A concessão de acesso em si (inserir em `coordenadores_prova` + role `coordenador` em `user_roles`) tem **um caminho só** desde 2026-07-26, e ele exige alocação elegível — detalhado em [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md), não duplicado aqui.

Remover o acesso de um coordenador (`deleteMutation`) também remove a role `coordenador` de `user_roles` **se** essa era a última prova em que o usuário tinha acesso de coordenador (checagem de `otherAssignments` antes de remover a role).
