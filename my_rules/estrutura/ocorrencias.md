# Ocorrências

> Ver [`00-indice.md`](./00-indice.md). Depende do modelo de alocação descrito em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).

## Entidade `ocorrencias_colaborador`

`useOcorrencias.tsx` (página `OcorrenciasProva.tsx`, rota `/ocorrencias-prova/:provaId`): registra um incidente ligado a um `colaborador_id`, dentro de uma `prova_id`/`prova_unidade_id`, com `descricao`, `tipo_ocorrencia`, `data_ocorrencia`, e um flag `substituido` + `substituto_id` (FK para outro colaborador que o substituiu).

## Regra não óbvia: quem aparece no combobox de "Nova Ocorrência"

O combobox de seleção de colaborador em `OcorrenciasProva.tsx` só lista **colaboradores com vínculo em `colaboradores_prova` para alguma unidade da prova atual** (habilitados) ou de outra unidade da mesma prova (mostrados desabilitados, com a sigla da unidade). Um colaborador sem nenhuma alocação em `colaboradores_prova` — para essa prova ou qualquer outra — simplesmente não aparece na lista, nem habilitado nem desabilitado. Isso não é um bug: é decorrência direta de a ocorrência precisar de um `colaborador_id` que faça sentido no contexto da prova. Se alguém reportar "colaborador X não aparece para registrar ocorrência", a causa raiz mais provável é falta de alocação em `colaboradores_prova`, não um problema na query de ocorrências em si.

## Encerramento e reabertura por unidade

`prova_unidades` tem os campos `ocorrencias_encerradas`, `ocorrencias_encerradas_at`, `ocorrencias_encerradas_by`. A RPC `encerrar_ocorrencias_unidade(p_prova_unidade_id, p_user_id)`:
- Verifica permissão manualmente: `superadmin`, `admin`, o `created_by` da prova, ou um coordenador vinculado àquela prova (`is_coordenador_prova`) — qualquer outro perfil recebe erro `P0002`.
- Marca a unidade como encerrada; a migration mais recente do repositório (`20260707114551_*.sql`) não expõe uma RPC de reabertura simétrica para ocorrências especificamente — a reabertura geral de prova/unidade (`reabrir_prova`/`reabrir_prova_unidade`, ver [`provas-e-unidades.md`](./provas-e-unidades.md)) é uma RPC separada; confirme no SQL se ela também reverte `ocorrencias_encerradas` antes de assumir que sim.

Uma vez encerrada, a expectativa é que a unidade não aceite mais novos registros de ocorrência — a validação de "encerrada" deve ser conferida no componente/RPC de criação antes de assumir que a UI barra isso preventivamente.

## Exportação

A página gera PDF (jsPDF + `jspdf-autotable`) da lista de ocorrências, no mesmo padrão client-side usado em [`documentos-e-relatorios.md`](./documentos-e-relatorios.md).
