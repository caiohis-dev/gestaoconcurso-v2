# Bateria de teste manual — Editais como entidade

Roteiro de teste manual da UI cobrindo o tema **Editais como entidade** (etapas 1–7, 2026-07-24). Rode de cima a baixo. Cada bloco indica **o que valida**. Os blocos `A`–`E` se concluem; a seção **`F` (conferência perpétua)** guarda o que reconferir a cada mexida no domínio de provas/editais.

Desenho em [`../my_rules/analises/roadmap-editais.yaml`](../my_rules/analises/roadmap-editais.yaml); modelo em [`../my_rules/estrutura/provas-e-unidades.md`](../my_rules/estrutura/provas-e-unidades.md).

## Antes de começar

1. Supabase local (`sg docker -c 'npx supabase status'`) e o app (`npm run dev`). Faça um `db reset` antes, para ter o backfill dos 2 editais aplicado.
2. Contas: um **admin** e um **coordenador**.
3. **Modelo a lembrar:** o edital é o MODELO (nome + nº candidatos + cabeçalho). A prova tem os SEUS próprios nº candidatos e cabeçalho — o edital só os oferece como sugestão ao criar a prova. Alocação e PDFs leem da PROVA.

---

## A. CRUD de Editais (/editais)

- [ ] **A1** — Como **admin**, o header do módulo Aplicação de Provas mostra o item **Editais**; abre `/editais`.
- [ ] **A2** — Após um `db reset`, a lista já traz **2 editais** (backfill): "Edital 001/2026 SMA" (200 candidatos) e "Edital 002/2026 - SMA".
- [ ] **A3** — **Novo Edital**: nome + nº candidatos + as 2 linhas de cabeçalho (já vêm com o default FEVRE) → salva e aparece na lista.
- [ ] **A4** — **Editar** um edital → alterações persistem.
- [ ] **A5** — **Nome duplicado** (mesmo texto, ou só mudando caixa/espaço) → barrado pelo índice único; toast de erro.
- [ ] **A6** — **Excluir** um edital SEM provas → sai da lista.
- [ ] **A7** — **Excluir** um edital COM provas vinculadas → **bloqueado**, com a mensagem "Há provas vinculadas..." (não some nada — D6/ON DELETE RESTRICT).
- [ ] **A8** — Como **coordenador**, tentar abrir `/editais` na barra → **barrado**, cai no hub (guard de admin).

## B. Prova sob um edital (seletor + herança)

- [ ] **B1** — Em `/provas` (admin), **Nova Prova** → o campo Edital é um **seletor** dos editais, não texto livre.
- [ ] **B2** — Ao **escolher um edital**, os campos **Nº Candidatos** e **Cabeçalho linha 1/2** são pré-preenchidos com os valores do edital (sugestão).
- [ ] **B3** — Alterar o nº de candidatos sugerido e salvar → a **prova** guarda o SEU valor (o edital não muda).
- [ ] **B4** — **Editar** uma prova existente → o edital vem selecionado; mudar de edital **não** sobrescreve os campos já salvos da prova.
- [ ] **B5** — Com **nenhum edital cadastrado**, abrir "Nova Prova" → mensagem + botão **Cadastrar Edital** (leva a `/editais`); não dá para criar prova sem edital (D5).

## C. O nome do edital aparece em todo lugar (join)

- [ ] **C1** — Card da prova (`/provas`) mostra o nome do edital.
- [ ] **C2** — Títulos das telas de gestão (GerenciarProva, Salas Distribuídas, Colaboradores da Prova, Ocorrências) mostram "&lt;edital&gt; - &lt;data&gt;".
- [ ] **C3** — `/gerenciar-usuarios`: o seletor de prova mostra o nome do edital.
- [ ] **C4** — Exports (colaboradores .xls, coordenadores .xlsx, cargos .csv em GerenciarProva; colaboradores da prova) têm o **nome do edital no nome do arquivo**.
- [ ] **C5** — Excluir prova (`/provas`): a confirmação cita o nome do edital.

## D. Cabeçalho dos PDFs vem da PROVA (D3)

- [ ] **D1** — Em `/documentos-impressao`, gerar uma lista de presença → o cabeçalho usa as **linhas da prova** (não do edital) e o **nome do edital** no centro.
- [ ] **D2** — Editar o cabeçalho **do edital** (em /editais) → o PDF de uma prova **já salva NÃO muda** (ela tem as suas próprias linhas). Só uma prova nova criada depois herdaria o novo default.
- [ ] **D3** — Ocorrências: o PDF de ocorrências mostra o nome do edital no topo.

## E. Alocação continua por prova

- [ ] **E1** — Em GerenciarProva, o "Total de Candidatos" e o cálculo de não-alocados usam o **nº de candidatos da prova** (não do edital) — inalterado em relação a antes do tema.

---

## F. Conferência perpétua — reconferir a cada mexida em provas/editais

- [ ] **F1** — **A query de provas traz o join `editais`.** Se o join sumir do `useProvas` (ou de `useUsers`), o nome do edital some de todas as telas/PDFs/arquivos de uma vez.
- [ ] **F2** — **Cabeçalho e nº de candidatos são da PROVA** nos PDFs e na alocação (D2/D3). Não trocar a fonte para o edital "para simplificar" — o edital é só a sugestão inicial.
- [ ] **F3** — **prova_edital (CHAR30) ainda existe e é escrito como cópia denormalizada** pelo ProvaDialog (`.slice(0,30)`), só para o NOT NULL, até ser dropada. É a ponte do backfill local (o seed.pos lê dela). Não remover a coluna enquanto o db reset depender do dump do v1.
- [ ] **F4** — **edital_id é obrigatório no app, não no banco** (D5). Se o form deixar criar prova sem edital, o insert quebra (prova_edital NOT NULL) ou nasce uma prova órfã de edital.
