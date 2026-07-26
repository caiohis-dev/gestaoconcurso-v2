# Módulo: Editais

> **Contrato do módulo.** Este arquivo deve bastar para implementar ou refatorar o módulo Editais sem reler o codebase. Se faltou algo, o defeito é deste doc — corrija-o junto com o código. Ver [`../../00-indice.md`](../../00-indice.md).

## Identidade

| | |
|---|---|
| **`id`** em `src/lib/modulos.ts` | `editais` |
| **Nome na UI** | Editais |
| **Papéis com acesso** | `superadmin`, `admin` — **não** coordenador |
| **Rota de entrada** | `/editais` (fixa, sem variação por papel) |
| **`prefixosRota`** | `['/editais']` |
| **`navLinks`** | um só: Editais → `/editais` (`showFor: ['admin','superadmin']`) |
| **Ícone** | `ScrollText` (lucide) |

Módulo criado em 2026-07-24 pelo tema "Editais como entidade" ([`../../../analises/concluidos/roadmap-editais.yaml`](../../../analises/concluidos/roadmap-editais.yaml)). Nasceu como link no header de *Aplicação de Provas* e **virou módulo próprio no mesmo tema**, por ajuste pedido no smoke — o card fica no hub, ao lado de Aplicação de Provas.

## O que o módulo é

O **edital** é o concurso: o documento sob o qual uma ou mais provas são aplicadas. Antes de 2026-07-24 ele não era entidade — era `provas.prova_edital`, um `CHAR(30)` de texto livre digitado a cada prova.

**O ponto conceitual que governa tudo aqui: o edital é um MODELO, não uma fonte de verdade operacional.** Ele carrega os valores que *sugerem* como uma prova nasce; depois de criada, a prova é dona dos seus próprios valores e o edital não a alcança mais. Quem tentar "melhorar" isso fazendo a prova ler o edital ao vivo vai reescrever cabeçalhos de PDF de provas passadas retroativamente — ver a fronteira abaixo.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/pages/Editais.tsx` (162 l.) | A página. Guard `if (!isAdmin)`. Grid de `Card`s, um por edital, com ações editar/excluir e `AlertDialog` de confirmação de exclusão |
| `src/components/EditalDialog.tsx` (174 l.) | Form de criação/edição (react-hook-form + Zod). Serve aos dois modos, distinguidos por `edital` ser passado ou não |
| `src/hooks/useEditais.tsx` (144 l.) | React Query: `editais`, `create`, `update`, `delete` + os `isXxx` de pending. Interfaces `Edital`, `EditalInsert`, `EditalUpdate` |
| `supabase/migrations/20260724170000_create_editais_and_prova_edital_fk.sql` | Todo o schema do módulo — tabela, índice único, RLS, trigger, e a FK em `provas` |

Não há Edge Function, RPC nem view neste módulo: é CRUD direto via PostgREST, contido pela RLS.

**Cobertura de testes** (ver [`../../transversais/testes.md`](../../transversais/testes.md)): o módulo é o mais bem coberto do sistema. `useEditais.test.tsx` (14) cobre a listagem, as traduções de `23505`/`23503` e a invalidação dupla; `EditalDialog.test.ts` (8) o schema isolado; `EditalDialog.ui.test.tsx` (11) a interação. O lado da prova está em `ProvaDialog.ui.test.tsx` (10), que guarda a herança e o bloqueio sem edital. E o **guard da rota** está em `pages/guards.test.tsx`: `/editais` recusa deslogado, colaborador e coordenador — foi justamente quebrando este guard de propósito que a bateria foi falsificada antes de ser aceita.

## Modelo de dados

```
editais
  id                uuid PK
  nome              text NOT NULL      -- único case/space-insensitive (ver abaixo)
  n_candidatos      integer NULL
  cabecalho_linha1  text DEFAULT 'FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA'
  cabecalho_linha2  text DEFAULT 'Coordenação de Concursos e Processos Seletivos'
  created_at / updated_at  timestamptz   -- updated_at por trigger update_updated_at_column
  created_by        uuid → auth.users(id)
```

**Unicidade do nome:** `CREATE UNIQUE INDEX editais_nome_key ON editais (lower(btrim(nome)))` — índice **funcional**, mesmo padrão de `colab_email`. Isso aposentou de propósito o antigo `CHAR(30)`, cujo *padding* de espaços era a origem dos ~15 `.trim()` espalhados pelo front. Não troque por um `UNIQUE (nome)` comum: voltariam a conviver `Edital 001` e `edital 001 `.

**Relação com `provas`:** `provas.edital_id uuid REFERENCES editais(id) ON DELETE RESTRICT`. **1 edital → N provas.**

## Permissões

| Operação | RLS |
|---|---|
| SELECT | `USING (true)` — **qualquer autenticado lê** |
| INSERT / UPDATE / DELETE | `has_role(auth.uid(), 'admin')` |

Espelha exatamente a política de `provas`: leitura ampla (a prova precisa exibir o nome do edital para coordenadores), escrita só de admin.

⚠️ **Armadilha real: `has_role` é match literal, sem hierarquia.** O guard da página é `isAdmin`, que no `useAuth` **inclui superadmin** (`role === 'admin' || role === 'superadmin'`). A RLS, não. Um superadmin que **não tenha também uma linha `admin`** em `user_roles` passa pelo guard, vê os botões, e leva erro de permissão do banco ao salvar. É a mesma discrepância já documentada na EF `corrigir-email-acesso` — ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

A tabela herda os `GRANT`s do `ALTER DEFAULT PRIVILEGES` da migration `20260712010000` — sem eles o PostgREST nem chegaria a avaliar a RLS (ver [`../../transversais/desenvolvimento-local.md`](../../transversais/desenvolvimento-local.md)).

## Regras de negócio

**Criação/edição (`EditalDialog`):**
- Só `nome` é obrigatório (`z.string().min(1)`); é `.trim()`ado no submit.
- `n_candidatos` chega como string do input e vira `parseInt(...)` ou `null`.
- As duas linhas de cabeçalho **nascem pré-preenchidas com os textos da FEVRE** em edital novo; em edição, carregam o valor salvo. String vazia vira `null`.
- O bloco de cabeçalho traz, na própria UI, a frase que explica o modelo: *"Sugestão herdada ao cadastrar uma prova sob este edital. Cada prova pode ajustar a sua."*

**Erros traduzidos** — os dois casos que o usuário realmente encontra:
- **`23505`** (ou match de `editais_nome_key` na mensagem) → *"Já existe um edital com esse nome."* (`mensagemErroEdital` no hook).
- **`23503`** na exclusão → *"Há provas vinculadas a este edital. Remova ou realoque as provas antes de excluí-lo."* É o `ON DELETE RESTRICT` chegando à UI com instrução acionável em vez de erro cru do Postgres.

**Invalidação de cache:** `update` invalida `["editais"]` **e `["provas"]`**. Necessário porque o nome da prova na UI vem de join com editais — sem isso, renomear um edital deixaria a tela de provas mostrando o nome velho.

## Fronteira do módulo — o que NÃO é daqui

**A herança edital → prova é de UI, e só de UI.** Não há trigger, view nem default no banco que propague valores do edital para a prova.

Ao criar uma prova **nova**, `ProvaDialog.handleEditalChange` copia `n_candidatos` e as duas linhas de cabeçalho do edital para os campos do formulário, como **sugestão editável**. A partir do save, `provas.prova_n_candidatos` e `provas.prova_cabecalho_linha1/2` são da prova. Consequências que precisam sobreviver:

- **Editar o cabeçalho de um edital não altera os PDFs de provas já criadas.** É intencional: um documento emitido não deve mudar retroativamente.
- **A alocação lê `prova_n_candidatos`, não `edital.n_candidatos`.** Não troque a fonte (`GerenciarProva`).
- **Os PDFs leem o cabeçalho da prova.** O que o PDF pega do edital é **só o nome**, via join `prova.editais.nome` (ver [`../aplicacao-provas/documentos-e-relatorios.md`](../aplicacao-provas/documentos-e-relatorios.md)).

Tudo que consome edital do lado da prova — o seletor no `ProvaDialog`, o join que exibe o nome, o ciclo de vida da prova — pertence ao módulo **Aplicação de Provas**: ver [`../aplicacao-provas/provas-e-unidades.md`](../aplicacao-provas/provas-e-unidades.md).

**Dependência dura na direção contrária:** `ProvaDialog` **bloqueia a criação de prova quando não há nenhum edital cadastrado**, com um link "Cadastrar Edital" para `/editais`. Um coordenador, que não tem acesso a este módulo, não consegue destravar isso sozinho — precisa de um admin.

## Dívida de transição em aberto

**A coluna `provas.prova_edital` (CHAR(30)) ainda existe** e continua sendo escrita pelo `ProvaDialog` como cópia denormalizada (`(edital?.nome ?? "").slice(0, 30)`), só para satisfazer seu `NOT NULL`.

Ela não foi dropada porque o backfill em `supabase/seed.pos.sql` **lê dela** para reconstruir os editais a cada `db reset` do dump do v1 — dropar a coluna quebraria o ambiente local. Consequência a não esquecer: **o nome do edital existe em dois lugares**, e o truncamento em 30 caracteres torna a cópia potencialmente diferente do original. **A fonte de verdade é `edital_id` + join.** Nenhum código novo deve ler `prova_edital`.

Por motivo aparentado, **`edital_id` é `NULLABLE` no banco**: um `NOT NULL` seria validado no instante da migration, antes de o seed rodar o backfill, e quebraria o `db reset`. A obrigatoriedade vive no app (`z.string().min(1, "Selecione um edital")`). Quem for endurecer isso precisa resolver a ordem migration→seed primeiro.
