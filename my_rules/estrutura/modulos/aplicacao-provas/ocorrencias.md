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

## Entidade `ocorrencias_colaborador`

`useOcorrencias.tsx` (página `OcorrenciasProva.tsx`, rota `/ocorrencias-prova/:provaId`): registra um incidente ligado a um `colaborador_id`, dentro de uma `prova_id`/`prova_unidade_id`, com `descricao`, `tipo_ocorrencia`, `data_ocorrencia`, e um flag `substituido` + `substituto_id` (FK para outro colaborador que o substituiu).

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

A página gera PDF (jsPDF + `jspdf-autotable`) da lista de ocorrências, no mesmo padrão client-side usado em [`documentos-e-relatorios.md`](./documentos-e-relatorios.md).
