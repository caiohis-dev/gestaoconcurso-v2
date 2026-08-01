# Roadmap: Migração de Upsert para Delete + Insert (Limpeza e Reinserção Total)

> 📁 **HISTÓRICO — não leia por padrão.** Este arquivo registra um tema já entregue.
> Abra só quando o pedido for sobre o passado (*por que ficou assim? o que se tentou?
> que alternativa foi rejeitada?*). **Não é plano** — nada aqui é lista de tarefas.
> Para o que o sistema É, veja `my_rules/estrutura/`; para o que FALTA, `my_rules/backlog.md`.

> 🔴 **LEIA ISTO ANTES DO RESTO — o texto abaixo está no TEMPO VERBAL ERRADO.**
>
> Ele foi escrito **antes** da implementação e fala da troca total como *"a proposta avaliada aqui"*,
> dizendo que o sistema *"atualmente utiliza upsert"*. **Isso deixou de valer em 2026-07-30:** a troca
> total foi implementada e é o comportamento em vigor. Movido de `docs/temp/` para cá em 2026-07-31.
>
> **Todo risco que este documento levanta foi endereçado** — e é por isso que ele vale como registro:
>
> | Risco levantado aqui | Como ficou |
> |---|---|
> | Cascade apagaria dados relacionados | Medido: **0 FKs** apontam para `candidatos`. É o que torna a troca segura — e o gatilho para **reabrir o tema** se algum dia `candidatos` guardar nota, alocação ou presença |
> | Estado inconsistente se cair no meio | Resolvido: **tabela de preparo** + RPC transacional. Falha agora deixa a lista **INTACTA**, não pela metade |
> | Payload estouraria o limite REST | **Medido: 5,40 MB** contra o limite de 5 MB do Kong. Foi essa medição que **inviabilizou o RPC monolítico** e obrigou a tabela de preparo |
> | (não previsto aqui) | As guardas `IM001`/`IM002`/`IM003`, que nasceram depois — inclusive de uma pergunta do usuário |
>
> O roadmap que **executou** o tema é [`roadmap-importacao-troca-total.yaml`](./roadmap-importacao-troca-total.yaml).
> ⚠️ Ele registra que a alternativa que **eu recomendei** (upsert + exclusão do resíduo) foi **preterida** pelo
> usuário em favor da troca total — não é um "plano original" a restaurar.

Este documento descreve os passos e as implicações de alterar o fluxo de importação de candidatos do módulo "Candidatos". Atualmente, o sistema utiliza uma abordagem de **Upsert** (atualiza se existir, insere se não existir). A proposta avaliada aqui é a de **Limpeza Total e Reinserção** (apagar todos os inscritos do edital e inserir novamente a partir da planilha).

---

## 1. Avaliação de Risco e Impacto (Crítico)

Antes de alterar o código, é crucial entender as consequências dessa mudança arquitetural.

### Perda de Dados Relacionados (Cascade)
* Se a tabela `candidatos` possui ou possuirá relações com outras tabelas (ex: notas, recursos, isenções, alocação de salas), um `DELETE` limpará o candidato e **apagará em cascata** todos os dados ligados a ele.
* **Problema:** Se o usuário reimportar a planilha apenas para corrigir um erro de digitação no nome de um candidato, ele acidentalmente apagará as notas ou alocações de todos os 7.000 inscritos.

### Risco de Estado Inconsistente (Falha no meio do processo)
* A importação atual envia os dados em blocos de 500 para não dar *timeout*.
* **Problema:** Se o processo for *Delete All* seguido de blocos de *Insert*, e a conexão de internet do cliente cair no 3º bloco, o edital ficará corrompido (com 1.000 candidatos inseridos e os outros 6.000 apagados).
* **Solução necessária:** A abordagem de Limpeza Total exigiria uma única transação no banco de dados para garantir que, se falhar, o *rollback* restaura os dados antigos. Enviar milhares de registros via REST em uma única chamada pode estourar limites de payload.

---

## 2. Passos de Implementação (Roadmap)

Caso a decisão de negócio exija seguir com a Limpeza Total, as seguintes alterações deverão ser feitas:

### Passo 1: Criação de RPC Transacional no Supabase (Recomendado)
Para evitar que o edital fique vazio se a importação falhar no meio:
1. Criar uma Stored Procedure (RPC) no PostgreSQL/Supabase que receba o `edital_id` e um JSON contendo todos os candidatos a serem importados.
2. A RPC deve abrir uma transação.
3. Executar `DELETE FROM candidatos WHERE edital_id = p_edital_id`.
4. Executar o `INSERT` de todos os dados do JSON.
5. Fazer o *commit*. Se falhar, dá *rollback*.
*(Se a RPC não for usada, o delete terá que ser feito via API no cliente antes do loop de blocos, assumindo o risco de inconsistência em caso de falha).*

### Passo 2: Alteração no Hook de Importação (`src/hooks/useCandidatos.tsx`)
1. No hook `useImportarCandidatos`, remover a lógica atual que usa `.upsert()` e a configuração `onConflict`.
2. Trocar a chamada para `.insert()`.
3. Se não usar a RPC do Passo 1, adicionar uma chamada inicial à *mutation* já existente `excluirDoEdital(editalId)` (disponível no `useExcluirCandidatos`) logo antes de iniciar o loop de `for (let i = 0; i < candidatos.length; i += TAMANHO_BLOCO)`.

### Passo 3: Ajustes na UI e Experiência do Usuário (`src/pages/CandidatosImportar.tsx`)
1. O fluxo atual assume que reimportar é seguro (idempotente).
2. Modificar o botão "Confirmar Importação" para exibir um **Modal de Alerta Crítico (Destructive)**.
3. O texto do modal deve deixar claro: *"Atenção: Esta ação apagará todos os candidatos atualmente cadastrados para este edital antes de inserir a nova lista. Dados relacionados poderão ser perdidos permanentemente."*

### Passo 4: Manutenção da Deduplicação em Memória (`src/lib/candidatos-import.ts`)
1. A função `deduplicar()` e `chaveNatural()` **não devem ser removidas**.
2. Mesmo que o banco esteja limpo, se a *planilha* enviada possuir duas linhas duplicadas (mesmo CPF, cargo e inscrição), o PostgreSQL rejeitará o `INSERT` devido ao índice único (`candidatos_cpf_cargo_id_inscricao_key`).
3. O comportamento de manter a última linha lida deve permanecer para garantir que a inserção em lote funcione.

---

## Resumo da Comparação

| Característica | Fluxo Atual (Upsert) | Novo Fluxo (Delete + Insert) |
| :--- | :--- | :--- |
| **Segurança de Dados** | Alta (atualiza campos sem deletar dependências) | Baixa (risco de apagar dados em cascata) |
| **Tolerância a Falhas** | Alta (se o bloco 3 falhar, blocos 1 e 2 estão salvos e basta tentar de novo) | Baixa (se falhar, o edital fica com dados pela metade) |
| **Complexidade** | Simples (executado direto pelo cliente) | Alta (requer RPC para garantir atomicidade) |
