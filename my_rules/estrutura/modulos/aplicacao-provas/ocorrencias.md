# Ocorrências

> Documento de área do módulo **Aplicação de Provas** — comece pelo contrato em [`00-modulo.md`](./00-modulo.md). Depende do modelo de alocação descrito em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).

## O recorte por unidade é client-side — e `[]` não é `undefined`

A policy de `ocorrencias_colaborador` é `is_coordenador_prova(auth.uid(), prova_id)`: autoriza por **prova**, não por unidade. O recorte por unidade existe **só no cliente**, no segundo argumento de `useOcorrencias` — então aquele filtro é a única barreira.

⚠️ **Os dois valores significam coisas opostas, e até 2026-07-26 caíam no mesmo ramo:**

| Valor | Significado | Comportamento |
|---|---|---|
| `undefined` | admin: sem restrição | nenhum filtro |
| `[]` | coordenador sem unidade visível | **zero linhas** (`.in(coluna, [])`) |

A guarda era `if (ids && ids.length > 0)`, então `[]` não aplicava filtro e devolvia a **prova inteira**. Não era teórico: `useCoordenadorUnidades` devolve `[]` enquanto carrega, então todo carregamento da página por um coordenador tinha uma janela mostrando ocorrência de unidade que não era dele.

**Corrigido nas duas pontas:** o hook distingue os casos (falha fechado), e a página passou a **esperar** o escopo do coordenador resolver — senão o "nenhuma ocorrência" que aparece na janela seria mentira.

## Falta: um terceiro estado que também remove da lista, sem substituto

🔵 **Desde 2026-09-23** o campo antes chamado "Substituído" (0/1) virou um seletor de três
opções na tela: *Não* / *Sim, substituído* / *Falta — remover da lista, sem substituto*.
Registrar falta faz **a mesma coisa que a substituição faz com o colaborador original**
— sai de `colaboradores_prova` daquela unidade —, só que sem inserir substituto nenhum.
Como `colaboradores_prova` tem `UNIQUE (prova_unidade_id, colaborador_id)` e o trigger
`check_colaborador_prova_unique` impede alocação em mais de uma unidade da mesma prova,
sair da única linha que a pessoa tinha ali É sair da lista de trabalhadores **da prova**,
não só daquela unidade.

**Os dois efeitos (substituição e falta) e a criação/exclusão da ocorrência viram uma
única transação**, no RPC `registrar_ocorrencia_colaborador` / `excluir_ocorrencia_colaborador`
(migration `20260923232343_falta_remove_colaborador_da_prova`). Antes, a substituição
fazia SELECT + INSERT + DELETE soltos, direto em `OcorrenciasProva.tsx` — se o DELETE
falhasse (por exemplo, o colaborador que sai também é coordenador vinculado, RESTRICT de
`20260726250000`), o substituto já tinha sido inserido e a ocorrência nunca chegava a ser
criada: estado inconsistente, sem transação para desfazer o INSERT. Virar RPC fecha isso.

⚠️ **A autorização dos dois RPCs é POR UNIDADE** (`get_coordenador_prova_unidade_ids`),
não por prova inteira como a policy de leitura/escrita de `ocorrencias_colaborador`
(`is_coordenador_prova`). Isso não estreita o que a tela já oferece: `allowedUnidades` em
`OcorrenciasProva.tsx` já vem de `useCoordenadorUnidades`, que chama a mesma
`get_coordenador_prova_unidade_ids` — o RPC só formaliza no banco o que o combobox de
unidade já restringia no cliente.

**Congelamento:** `ocorrencias_colaborador` ganhou `funcao_id_congelada` e
`valor_pagamento_congelado`, preenchidas no momento da remoção (substituição OU falta) e
usadas para reinstalar o colaborador se a ocorrência for excluída depois. **Não são
relidas de outra linha na hora da reversão** — o defeito que isso evita: a reversão de uma
substituição antiga lia função/valor da linha do SUBSTITUTO no momento da exclusão; se o
substituto tivesse mudado de função nesse meio-tempo (editado em `GerenciarColaboradoresProva`),
o original voltava com o valor errado.

🔴 `funcao_id_congelada` é **RESTRICT**, não `SET NULL` — mesma decisão de
`20260726210000_colaborador_com_historico_nao_se_exclui` para `substituto_id`: ser citada
numa ocorrência (mesmo congelada) é histórico. Com RESTRICT, uma função só referenciada
por uma ocorrência congelada não pode ser excluída do catálogo, e a coluna só é `NULL`
quando a alocação original de fato não tinha função — sem ambiguidade a resolver na
reversão (ver bateria abaixo, caso 8).

O CHECK `chk_ocorrencia_falta_substituicao_mutuamente_exclusivas` garante que
`substituido = 1` e `falta = true` nunca coexistem na mesma linha.

⚠️ **`GRANT EXECUTE ... TO authenticated` sozinho NÃO basta.** Medido ao escrever esta
migration: uma função nova, criada como `postgres` depois de
`20260908231620_revogar_execute_de_anon_em_funcoes.sql` (que devia ter fechado isso para
sempre via `ALTER DEFAULT PRIVILEGES`), nasceu com `anon` podendo executá-la mesmo assim.
Os dois RPCs novos levam `REVOKE ALL ... FROM PUBLIC` explícito, e qualquer RPC nova
`SECURITY DEFINER` neste repo precisa do mesmo — ver
[`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

🧪 `docs/bateria-falta-e-substituicao-ocorrencia.sql` — 12 casos: os dois controles
positivos (falta e reversão), dois negativos de autorização (unidade errada; titular do
vínculo de coordenação), a substituição como regressão (criar e reverter, com o
congelamento provado pelo caso 6), o CHECK de exclusividade, a RESTRICT da função
congelada, admin sem vínculo, `efeito = 'nenhum'` como regressão mínima, `p_efeito`
inválido recusado por nome, e exclusão fora de escopo recusada.

## Entidade `ocorrencias_colaborador`

> 🔵 **O picker "Selecionar Substituto" busca NO SERVIDOR desde 2026-09-12.** Ele abria com duas consultas sem teto — todos os colaboradores (771) mais todas as alocações da prova — e filtrava em memória; o PostgREST corta em `max_rows` (1000) **sem erro**, então um colaborador sumiria da lista calado. Hoje usa a RPC `buscar_colaboradores_para_alocacao` (a mesma do picker de alocação), sem `p_excluir_prova_unidade_id`: aqui se vê todo mundo, e quem já está alocado aparece com a sigla e o botão desabilitado. Ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).

`useOcorrencias.tsx` (página `OcorrenciasProva.tsx`, rota `/ocorrencias-prova/:provaId`): registra um incidente ligado a um `colaborador_id`, dentro de uma `prova_id`/`prova_unidade_id`, com `descricao`, `tipo_ocorrencia`, `data_ocorrencia`, um flag `substituido` + `substituto_id` (FK para outro colaborador que o substituiu), um flag `falta` (🔵 2026-09-23 — remove o colaborador da lista SEM substituto) e `funcao_id_congelada`/`valor_pagamento_congelado` (o estado da alocação no momento da remoção, usado para reinstalar se a ocorrência for excluída — ver seção "Falta" acima). `create`/`remove` do hook não inserem/apagam a linha direto: chamam os RPCs `registrar_ocorrencia_colaborador`/`excluir_ocorrencia_colaborador`.

## Regra não óbvia: quem aparece no combobox de "Nova Ocorrência"

O combobox de seleção de colaborador em `OcorrenciasProva.tsx` só lista **colaboradores com vínculo em `colaboradores_prova` para alguma unidade da prova atual** (habilitados) ou de outra unidade da mesma prova (mostrados desabilitados, com a sigla da unidade). Um colaborador sem nenhuma alocação em `colaboradores_prova` — para essa prova ou qualquer outra — simplesmente não aparece na lista, nem habilitado nem desabilitado. Isso não é um bug: é decorrência direta de a ocorrência precisar de um `colaborador_id` que faça sentido no contexto da prova. Se alguém reportar "colaborador X não aparece para registrar ocorrência", a causa raiz mais provável é falta de alocação em `colaboradores_prova`, não um problema na query de ocorrências em si.

## Encerramento por unidade — e por que não há reabertura

`prova_unidades` tem os campos `ocorrencias_encerradas`, `ocorrencias_encerradas_at`, `ocorrencias_encerradas_by`. A RPC `encerrar_ocorrencias_unidade(p_prova_unidade_id, p_user_id)` (migration `20260707114551_*`):
- Verifica permissão manualmente: `superadmin`, `admin`, o `created_by` da prova, ou um coordenador vinculado àquela prova (`is_coordenador_prova`) — qualquer outro perfil recebe erro `P0002`.
- Marca a unidade como encerrada.

⚠️ **O encerramento é irreversível pelo app — verificado em 2026-07-25.** `ocorrencias_encerradas = TRUE` é escrito em **um único lugar** em todas as migrations (a RPC acima) e **nada devolve o campo a `FALSE`**. Em particular, **`reabrir_prova_unidade` não toca nesses campos**: ela reverte apenas `unidade_finalizada`, `unidade_finalizada_at` e `unidade_finalizada_by`. São dois eixos independentes — reabrir a unidade **não** reabre as ocorrências dela.

Consequência prática: encerrar ocorrências por engano só se desfaz com `UPDATE` manual no banco. Se algum dia isso precisar de caminho no app, o simétrico terá de ser criado do zero, com autorização própria — note que `reabrir_prova_unidade` é mais restrita que a finalização: só `superadmin` **ou** quem finalizou.

✅ **A irreversibilidade é decisão, não pendência** (confirmada pelo usuário em 2026-07-25). E a UI **já é honesta sobre ela**: o `PasswordConfirmDialog` de "Encerrar Registro de Ocorrências" (`OcorrenciasProva.tsx:908-919`) diz, em negrito, que a unidade "**não poderá ser reaberta**", e ainda exige a senha para confirmar. Não há trabalho aberto aqui — só não introduza reabertura sem revisitar a decisão.

**A UI barra na origem, sim.** `OcorrenciasProva.tsx:99` filtra as unidades selecionáveis com `!pu.ocorrencias_encerradas` — uma unidade encerrada some do seletor, então não há por onde registrar ocorrência nela. Mas a barreira é **client-side**: a criação não revalida o flag, então uma chamada direta ao PostgREST ainda inseriria.

## ⚠️ O recorte por unidade é client-side — e a RLS não o reforça

Regra que precisa sobreviver a qualquer refatoração daqui: a policy de `ocorrencias_colaborador` é **`is_coordenador_prova(auth.uid(), prova_id)`** — autoriza **por prova, não por unidade** (verificado no banco em 2026-07-25). Um coordenador de uma prova pode ler, pela API, **todas** as ocorrências dela, inclusive de unidades que não coordena.

Logo, o recorte por unidade existe **só no cliente**, no `provaUnidadeIds` de `useOcorrencias`. Duas consequências:

1. **Não trate esse filtro como segurança.** Ele é UX. Se o recorte por unidade precisar virar garantia, tem de descer para a policy (ou para uma RPC), e isso é trabalho de banco, não de front.
2. **Hoje ele tem um furo aberto:** lista **vazia** de unidades não filtra nada, e `useCoordenadorUnidades` devolve `[]` enquanto carrega — então toda abertura da página por um coordenador tem uma janela sem filtro. Detalhe e conserto no [`backlog.md`](../../../backlog.md); há teste marcando o defeito em `useOcorrencias.test.tsx`.

## Exportação

A página gera PDF (jsPDF + `jspdf-autotable`) da lista de ocorrências, com o timbre compartilhado de `src/lib/pdf-timbre.ts` — ver [`documentos-e-relatorios.md`](./documentos-e-relatorios.md). ⚠️ Timbra só a **página 1**, e numera sem total; as duas coisas são comportamento anterior preservado, não descuido.
