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

O **edital** é o **documento normativo do certame**, montado por capítulos dentro do sistema — e é também o registro sob o qual as provas são criadas.

> 🔵 **MUDOU em 2026-09-16, com a fatia 1 da v3.** Este parágrafo dizia: *"o edital é um MODELO, não uma fonte de verdade operacional. Ele carrega os valores que sugerem como uma prova nasce."* Era verdade enquanto o edital tinha 5 campos e servia só para sugerir o cabeçalho de uma prova. **Deixou de ser a descrição completa:** ele agora carrega metadados do certame e a estrutura do documento (`edital_capitulos`), e o alvo da v3 é gerar o edital publicável. Ver [`../../../analises/roadmap-editais-espinha-do-documento.yaml`](../../../analises/roadmap-editais-espinha-do-documento.yaml) e o índice das 12 fatias em [`../../../modulo_editais/00-Plano-v3.md`](../../../modulo_editais/00-Plano-v3.md).
>
> 🔴 **O que NÃO mudou, e não pode mudar:** a relação edital → prova continua sendo **sugestão, não fonte ao vivo**. Depois de criada, a prova é dona dos seus valores e o edital não a alcança mais. Quem "melhorar" isso fazendo a prova ler o edital ao vivo vai reescrever cabeçalhos de PDF de provas passadas retroativamente — ver a fronteira no fim deste arquivo, que segue valendo inteira.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/pages/Editais.tsx` (~150 l.) | A página. **Não guarda a si mesma** desde 2026-07-26 — o papel é declarado na rota (`RequireAcesso papeis={["admin"]}`). Grid de `Card`s, um por edital, com ações editar/excluir e `AlertDialog` de confirmação de exclusão |
| `src/components/EditalDialog.tsx` (~180 l.) | Form de criação/edição (react-hook-form + Zod). Serve aos dois modos, distinguidos por `edital` ser passado ou não |
| `src/hooks/useEditais.tsx` (144 l.) | React Query: `editais`, `create`, `update`, `delete` + os `isXxx` de pending. Interfaces `Edital`, `EditalInsert`, `EditalUpdate` |
| `supabase/migrations/20260724170000_create_editais_and_prova_edital_fk.sql` | O schema original — tabela, índice único, RLS, trigger, e a FK em `provas` |
| `supabase/migrations/20260916173801_editais_metadados_e_capitulos.sql` | 🔵 **v3 fatia 1** — os metadados do certame em `editais` e a tabela `edital_capitulos` |
| `src/pages/EditalStudio.tsx` | 🔵 **v3** — a tela de autoria, rota `/editais/:editalId`, três painéis |
| `src/hooks/useEdital.tsx` | 🔵 **v3** — um edital + seus capítulos; grava capítulo por **upsert** |
| `src/lib/edital-capitulos.ts` | 🔵 **v3** — o catálogo canônico: 19 elementos, dos quais **17 numerados** |
| `src/lib/edital-numeracao.ts` | 🔵 **v3** — função pura: numeração calculada e referência cruzada por `chave` |
| `src/lib/edital-linter.ts` | 🔵 **v3** — função pura: as regras determinísticas, sem LLM |

Não há Edge Function nem view neste módulo: é CRUD direto via PostgREST, contido pela RLS. 🔵 **Nem RPC** — e isso foi decidido na implementação, contra o que o roadmap previa: ver "A linha de capítulo é um override" abaixo.

## 🔴 O documento: capítulos e numeração calculada (v3, 2026-09-16)

**O número de um capítulo NUNCA é guardado.** Capítulo condicional que não entra não ocupa número, e todos abaixo sobem. Medido nos três editais reais da FEVRE:

| | capítulos | territorialidade | títulos | PCD cai em |
|---|---|---|---|---|
| Edital 002/2026 | 16 | não | sim | **7** |
| Edital 003/2026 | 15 | não | não | **7** |
| Edital 004/2026 | 16 | **sim** | não | **8** |

O mesmo capítulo em três posições. O catálogo tem **19 elementos — 17 numerados** mais o preâmbulo e os anexos, que entram no documento e não recebem número (⚠️ contá-los daria 19, e ignorá-los daria 18: os dois erros já foram cometidos no planejamento).

O Edital 002 publicado carrega o resíduo de numerar à mão: uma linha solta **`"10. e seus subitens"`** dentro do capítulo 7. Por isso **referência cruzada aponta para a `chave`** (`{{cap:vagas_pcd}}`), e o número é resolvido na renderização. Referência que não resolve vira marcador visível `[?chave]` — nunca some, nunca inventa número.

**O catálogo vive em CÓDIGO**, não no banco: versionado, revisável em diff, testável como dado puro.

### A linha de capítulo é um OVERRIDE, não um registro obrigatório

🔵 **Decidido na implementação, contra o roadmap.** Ele previa uma RPC `criar_edital_com_capitulos` que semeasse os 19 capítulos em transação. Se a RPC também conhecesse a lista, o catálogo existiria em **dois lugares** — e divergiriam no dia em que um capítulo novo entrasse.

Então: **capítulo sem linha vale pelo padrão do catálogo.** A linha só nasce quando alguém desliga, reordena ou escreve texto — um UPSERT, operação de um passo. Sumiu a semeadura, sumiu a transação de vários passos, sumiu o estado pela metade.

Dois efeitos que valem registro: os **3 editais de produção ganharam estrutura de documento sem backfill**, e capítulo novo no catálogo vale para todos eles **sem migration de dados**.

### Todo capítulo é desligável

Decisão do usuário em 2026-09-16. O catálogo diz quais **nascem** ligados (15 dos 17 numerados) e quais nascem desligados (territorialidade e prova de títulos) — mas **qualquer um** pode ser desligado.

⚠️ **"Condicional" NÃO quer dizer "condicional a uma carreira".** Um edital de ACS pode ter prova de títulos; um de enfermagem pode ter territorialidade. O material de referência propunha um mapa carreira → funcionalidade, e ele foi **recusado**. A carreira pode no máximo pré-marcar; nunca determinar, impedir ou esconder.

O preço combinado: desligar um capítulo **padrão** gera **aviso** do linter — permitido, mas incomum.

**Cobertura de testes** (ver [`../../transversais/testes.md`](../../transversais/testes.md)): o módulo é o mais bem coberto do sistema. `useEditais.test.tsx` (14) cobre a listagem, as traduções de `23505`/`23503` e a invalidação dupla; `EditalDialog.test.ts` (8) o schema isolado; `EditalDialog.ui.test.tsx` (11) a interação. O lado da prova está em `ProvaDialog.ui.test.tsx` (10), que guarda a herança e o bloqueio sem edital. E o **guard da rota** está em `pages/guards.test.tsx`: `/editais` recusa deslogado, colaborador e coordenador — foi justamente quebrando este guard de propósito que a bateria foi falsificada antes de ser aceita.

🔵 **A v3 trouxe 34 casos de LÓGICA PURA (2026-09-16):** `edital-numeracao.test.ts` (20) e `edital-linter.test.ts` (14). ⭐ O controle positivo deles são **os três editais reais**, que dão três numerações diferentes a partir do mesmo catálogo. Falsificado: fixar a numeração derruba exatamente 7 casos — e ⚠️ **o Edital 004 sobrevive ao defeito**, que é por que três fixtures valem mais que uma. O banco é `docs/bateria-edital-capitulos.sql`; ⚠️ nele, o caso da FK RESTRICT precisou de um edital **criado na hora**, porque com um edital existente quem barrava era `provas_edital_id_fkey` — o caso passava sem exercitar a regra nova.

🔵 **A PÁGINA ganhou bateria própria em 2026-08-02** (`pages/Editais.ui.test.tsx`, 5 casos), e a razão é a mudança do card: o número exibido deixou de ser um campo da linha e passou a vir da contagem real de inscritos, que é de **outro módulo**. Ela guarda os três textos (contando · nenhum importado · N importados), que a contagem case com o **edital certo** quando há mais de um na tela, e que **"0" nunca apareça**. Falsificada: com o card voltando a `?? 0`, caem exatamente os dois casos que tratam de ausência de lista.

## Modelo de dados

```
editais
  id                uuid PK
  nome              text NOT NULL      -- único case/space-insensitive (ver abaixo)
  n_candidatos      integer NULL       -- 🔵 ÓRFÃ desde 02/08: ninguém lê nem escreve (ver abaixo)
  cabecalho_linha1  text DEFAULT 'FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA'
  cabecalho_linha2  text DEFAULT 'Coordenação de Concursos e Processos Seletivos'
  created_at / updated_at  timestamptz   -- updated_at por trigger update_updated_at_column
  created_by        uuid → auth.users(id)

  -- 🔵 v3 fatia 1 (migration 20260916173801). TODAS ANULÁVEIS: produção tem 3 editais
  -- sem nenhum destes dados, e o seed carrega DEPOIS das migrations — um NOT NULL aqui
  -- quebraria o `db reset`, a mesma armadilha que deixou `provas.edital_id` nullable.
  numero_edital     text       -- ⚠️ SEM CHECK de formato: "002/2026-SMA" é real
  ano               integer
  natureza_juridica text       -- CHECK: CONCURSO_PUBLICO | PROCESSO_SELETIVO
  orgao_demandante / entidade_executora / decreto_autorizador / regime_trabalho  text
  prazo_validade_anos integer  -- CHECK > 0
  prorrogavel       boolean

edital_capitulos                       -- 🔵 v3 fatia 1
  id                uuid PK
  edital_id         uuid → editais(id) ON DELETE RESTRICT
  chave             text       -- slug do catálogo; é por ela que a referência aponta
  ordem             integer    -- CHECK >= 0
  incluido          boolean
  texto             text       -- redação livre nesta fatia
  UNIQUE (edital_id, chave)
  -- 🔴 NÃO há coluna `numero`. O número é calculado — ver a seção do documento acima.
```

⚠️ **`numero_edital` é `text` sem CHECK de formato, de propósito.** Este repo removeu 4 CHECKs de formato em 2026-08-01 ("dado inválido entra cru; valide na leitura"), e o formato varia no mundo real — o próprio Edital 002 se chama `002/2026-SMA`. Quem valida é a tela e o linter.

🔴 **A FK de `edital_capitulos` é RESTRICT, não CASCADE** (§2). O capítulo carrega **texto redigido**: é conteúdo com valor próprio, não anotação descartável. É o **terceiro** dependente RESTRICT de `editais`, junto de `provas` e `candidatos`.

**Unicidade do nome:** `CREATE UNIQUE INDEX editais_nome_key ON editais (lower(btrim(nome)))` — índice **funcional**, mesmo padrão de `colab_email`. Isso aposentou de propósito o antigo `CHAR(30)`, cujo *padding* de espaços era a origem dos ~15 `.trim()` espalhados pelo front. Não troque por um `UNIQUE (nome)` comum: voltariam a conviver `Edital 001` e `edital 001 `.

**Relação com `provas`:** `provas.edital_id uuid REFERENCES editais(id) ON DELETE RESTRICT`. **1 edital → N provas.**

**Relação com `candidatos`** (desde 2026-07-27): `candidatos.edital_id uuid NOT NULL REFERENCES editais(id) ON DELETE RESTRICT`. **1 edital → N inscritos.** São **dois dependentes com RESTRICT**, e o de candidatos é o que mais barra na prática — ver a nota na exclusão, abaixo. O módulo é [`../candidatos/00-modulo.md`](../candidatos/00-modulo.md).

## Permissões

| Operação | RLS |
|---|---|
| SELECT | `USING (true)` — **qualquer autenticado lê** |
| INSERT / UPDATE / DELETE | `has_role(auth.uid(), 'admin')` |

Espelha exatamente a política de `provas`: leitura ampla (a prova precisa exibir o nome do edital para coordenadores), escrita só de admin.

✅ **Isto já foi armadilha, e deixou de ser em 2026-07-25.** Este parágrafo afirmava que `has_role` era match literal sem hierarquia, e que um superadmin sem linha `admin` passaria pelo guard da página mas levaria erro do banco ao salvar. **Era verdade até 25/07**; a migration `20260725195530_superadmin_implica_admin_em_has_role.sql` pôs a implicação `superadmin ⇒ admin` dentro do `has_role`, então RLS e UI voltaram a concordar. Corrigido na auditoria de 2026-07-26.

⚠️ **O que continua valendo é a regra que aquilo ensinou:** papel para **autorizar** sai do `has_role`, nunca de `SELECT` literal em `user_roles` — a hierarquia mora lá dentro. A mesma falha ainda apareceu depois na EF `create-coordenador` (terceira ocorrência, corrigida em 2026-07-26). Ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

A tabela herda os `GRANT`s do `ALTER DEFAULT PRIVILEGES` da migration `20260712010000` — sem eles o PostgREST nem chegaria a avaliar a RLS (ver [`../../transversais/desenvolvimento-local.md`](../../transversais/desenvolvimento-local.md)).

## Regras de negócio

**Quantos inscritos o edital tem — 🔴 não é campo deste módulo (desde 2026-08-02).** O card de `/editais` mostra a **contagem real de `candidatos`** (`useContagemCandidatosPorEdital`), com três textos e nenhum "0": *"Contando inscritos…"* enquanto carrega, *"Nenhum inscrito importado"* sem lista, e *"N inscrito(s) importado(s)"* com lista. O número digitado à mão **saiu do formulário**, e a coluna `n_candidatos` ficou órfã — não foi dropada porque o dump (`seed.local.sql`) e o backfill do `seed.pos.sql` a listam, e dropar quebraria o `db reset` local. A decisão e o seu limite estão em [`../candidatos/00-modulo.md`](../candidatos/00-modulo.md).

**Criação/edição (`EditalDialog`):**
- Só `nome` é obrigatório (`z.string().min(1)`); é `.trim()`ado no submit.
- As duas linhas de cabeçalho **nascem pré-preenchidas com os textos da FEVRE** em edital novo; em edição, carregam o valor salvo. String vazia vira `null`.
- O bloco de cabeçalho traz, na própria UI, a frase que explica o modelo: *"Sugestão herdada ao cadastrar uma prova sob este edital. Cada prova pode ajustar a sua."*

**Erros traduzidos** — os dois casos que o usuário realmente encontra:
- **`23505`** (ou match de `editais_nome_key` na mensagem) → *"Já existe um edital com esse nome."* (`mensagemErroEdital` no hook).
- **`23503`** na exclusão → mensagem acionável em vez de erro cru do Postgres. ⚠️ **Desde 2026-07-27 há DOIS textos, escolhidos pelo nome da constraint na mensagem:** se veio `candidatos_edital_id_fkey`, *"Há candidatos importados neste edital. Remova os inscritos (Candidatos → Limpar edital) antes de excluí-lo."*; caso contrário, *"Há provas vinculadas a este edital…"*. Não volte a um texto só: candidatos é o dependente que mais barra (milhares de inscritos contra poucas provas), e culpar "provas" mandaria o usuário procurar no lugar errado.

**Invalidação de cache:** `update` invalida `["editais"]` **e `["provas"]`**. Necessário porque o nome da prova na UI vem de join com editais — sem isso, renomear um edital deixaria a tela de provas mostrando o nome velho.

## Fronteira do módulo — o que NÃO é daqui

**A herança edital → prova é de UI, e só de UI.** Não há trigger, view nem default no banco que propague valores do edital para a prova.

Ao criar uma prova **nova**, `ProvaDialog.handleEditalChange` copia **as duas linhas de cabeçalho** do edital para os campos do formulário, como **sugestão editável**. A partir do save, `provas.prova_cabecalho_linha1/2` são da prova. Consequências que precisam sobreviver:

- **Editar o cabeçalho de um edital não altera os PDFs de provas já criadas.** É intencional: um documento emitido não deve mudar retroativamente.
- 🔵 **E o vínculo em si não muda mais (`PE001`, 02/08):** o edital de uma prova é escolhido na criação e é **imutável** depois — trigger `check_prova_edital_imutavel`. É a mesma proteção do item acima levada à conclusão: antes, trocar o edital de uma prova antiga deixava o cabeçalho dela apontando para um concurso que não é o dela. A regra mora no módulo Aplicação de Provas; ver [`../aplicacao-provas/provas-e-unidades.md`](../aplicacao-provas/provas-e-unidades.md).
- 🔵 **A alocação NÃO lê mais número digitado (02/08).** Este item dizia *"a alocação lê `prova_n_candidatos`, não `edital.n_candidatos`; não troque a fonte"* — e era um aviso que guardava um defeito: o número da prova dizia **200** onde o edital tinha **7.231** inscritos, e o painel pintava a prova de coberta faltando 7.031 lugares. Hoje `GerenciarProva` conta os inscritos reais do edital da prova. Ver [`../candidatos/00-modulo.md`](../candidatos/00-modulo.md).
- **`n_candidatos` saiu da herança junto com o campo.** Herdar previsão para um número que ninguém lê só espalharia cópia desatualizada. O que se herda hoje é **cabeçalho**, e nada mais.
- **Os PDFs leem o cabeçalho da prova.** O que o PDF pega do edital é **só o nome**, via join `prova.editais.nome` (ver [`../aplicacao-provas/documentos-e-relatorios.md`](../aplicacao-provas/documentos-e-relatorios.md)).

Tudo que consome edital do lado da prova — o seletor no `ProvaDialog`, o join que exibe o nome, o ciclo de vida da prova — pertence ao módulo **Aplicação de Provas**: ver [`../aplicacao-provas/provas-e-unidades.md`](../aplicacao-provas/provas-e-unidades.md).

**Dependência dura na direção contrária:** `ProvaDialog` **bloqueia a criação de prova quando não há nenhum edital cadastrado**, com um link "Cadastrar Edital" para `/editais`. Um coordenador, que não tem acesso a este módulo, não consegue destravar isso sozinho — precisa de um admin.

## Dívida de transição em aberto

**A coluna `provas.prova_edital` (CHAR(30)) ainda existe** e continua sendo escrita pelo `ProvaDialog` como cópia denormalizada (`(edital?.nome ?? "").slice(0, 30)`), só para satisfazer seu `NOT NULL`.

Ela não foi dropada porque o backfill em `supabase/seed.pos.sql` **lê dela** para reconstruir os editais a cada `db reset` do dump do v1 — dropar a coluna quebraria o ambiente local. Consequência a não esquecer: **o nome do edital existe em dois lugares**, e o truncamento em 30 caracteres torna a cópia potencialmente diferente do original. **A fonte de verdade é `edital_id` + join.** Nenhum código novo deve ler `prova_edital`.

Por motivo aparentado, **`edital_id` é `NULLABLE` no banco**: um `NOT NULL` seria validado no instante da migration, antes de o seed rodar o backfill, e quebraria o `db reset`. A obrigatoriedade vive no app (`z.string().min(1, "Selecione um edital")`). Quem for endurecer isso precisa resolver a ordem migration→seed primeiro.
