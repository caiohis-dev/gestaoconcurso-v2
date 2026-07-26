# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. Itens concluídos devem ser removidos daqui (o histórico do que foi feito vive na documentação em [`estrutura/`](./estrutura/), não neste arquivo).

---

## Completar a suíte de testes (Vitest) — onde paramos e o que falta

**Status:** parcial — a suíte existe e roda desde 2026-07-25; a cobertura está **incompleta por decisão**, não por esquecimento
**Área:** Infraestrutura / transversal (ver [`estrutura/transversais/testes.md`](./estrutura/transversais/testes.md) para infra, convenções e as **6 armadilhas**)

Este item é o marco: quem retomar os testes começa por aqui. **Leia `testes.md` antes de escrever teste novo** — as armadilhas ali custaram tempo real (a sequência do mock consumida pela listagem; `.at(-1)` pegando o refetch e não a mutation; `act()` no que atualiza provider; fake timers com `shouldAdvanceTime`; o caminho do `pagehide`, que não passa pelo mock do Supabase; e **timeout usado como resposta**, que passou isolado e falhou na suíte cheia).

### Onde paramos (2026-07-26)

**554 testes em 32 arquivos.** Vitest 2 + React Testing Library + jsdom, `npm test`. Infra em `src/test/` (mock do Supabase, helpers de render).

Coberto:

| Camada | O que já tem |
|---|---|
| Registro de módulos | `lib/modulos.test.ts` — inclui invariantes sobre `MODULOS` inteiro |
| Schemas Zod (9) | `ColaboradorDialog`, `EditalDialog`, `FuncaoColaboradorDialog`, `ProvaDialog`, `SalaProvaDialog`, `UnidadeProvaDialog`, `pages/Auth`, `pages/GerenciarUsuarios` |
| Auth | `useAuth.test.tsx` — hierarquia, `colaborador` paralelo, `rolesLoaded`, `signOut` |
| Hooks de dados (18) | `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useEditais`, `useMetaColaboradoresUnidade`, `useProvaLock`, `useValoresFuncaoProva`, `useOcorrencias`, `useCoordenadorUnidades`, `useProvas`, `useProvaUnidades`, `useSalasDistribuidas` + os dois vizinhos do mesmo arquivo (`useSalasDistribuidasCapacidade`, `useFiscaisSala`), `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useUsers` (+ `useAuth`) |
| UI de diálogo (4) | `EditalDialog.ui.test.tsx`, `ProvaDialog.ui.test.tsx`, `PasswordConfirmDialog.ui.test.tsx`, `CoordenadoresProvaDialog.ui.test.tsx` |
| Acessibilidade | `components/dialogos-acessibilidade.test.ts` — invariante estática sobre os 28 diálogos |
| **Guards de página** | `pages/guards.test.tsx` — **137 testes**: matriz 19 páginas × 5 papéis, a janela do `rolesLoaded` e o `isLoggingOut` |
| A própria infra | `src/test/supabase-mock.test.ts` — o mock tem teste próprio |

### O que falta, em ordem de valor

**1. Hooks sem cobertura — faltam 4.**

> ⚠️ **Correção de um número que já esteve errado.** `testes.md` e o `00-modulo.md` listavam **8**; o inventário real de 2026-07-25 deu **12**, porque a lista antiga esquecia `useBancos`, `useCoordenadorUnidades`, `useOcorrencias` e `useUnidadeCapacidade`.

**Feitos em 2026-07-25, os quatro prioritários:** `useOcorrencias`, `useCoordenadorUnidades`, `useProvas` e `useProvaUnidades`. A aposta se pagou: a primeira dupla rendeu o defeito do recorte por unidade (item acima), e a segunda fixou por escrito que `addUnidade`/`removeUnidade` **não são transacionais** (ver [`estrutura/modulos/aplicacao-provas/provas-e-unidades.md`](./estrutura/modulos/aplicacao-provas/provas-e-unidades.md)).

Faltam: `useUnidadesProva`, `useSalasProva`, `useUnidadeCapacidade`, `useBancos`.

Os quatro que sobram são de baixo risco — CRUD parecido com o já coberto, e `useBancos` deve ser lista estática. **O valor agora está na camada 2 (diálogos) e na 3 (páginas/guards)**, não em terminar esta.

**2. UI de diálogo — 4 de 12 cobertos.** Sem nenhum teste: `CorrigirEmailAcessoDialog`, `MetaColaboradoresDialog`, `SalaExtraDialog`, `ValoresFuncaoProvaDialog`. Com teste de schema mas sem teste de interação: `ColaboradorDialog`, `FuncaoColaboradorDialog`, `SalaProvaDialog`, `UnidadeProvaDialog`.

✅ **`PasswordConfirmDialog` foi o primeiro, em 2026-07-26** — era o que mais importava: a barreira de confirmação das ações destrutivas (excluir edital e prova, finalizar/reabrir, encerrar ocorrências), com 7 usos em 5 páginas. 16 testes fixam o contrato numa frase: **`onConfirm` só roda depois de a senha ser aceita pelo servidor**, e erro em qualquer etapa **não fecha o diálogo** — porque fechar sem executar pareceria sucesso. Falsificado: neutralizar a checagem de `signInError` derruba o teste da senha incorreta.

✅ **`CoordenadoresProvaDialog` saiu em seguida, no mesmo dia** — 23 testes, escolhido porque é o caminho que a decisão do `addCoordenadorAccess` quer tornar exclusivo. A aposta se pagou como a dos hooks: **rendeu mais achado que cobertura**, inclusive o 403 que bloqueia o superadmin (item próprio abaixo) e que é pré-requisito daquela decisão. O hook fica mockado ali de propósito — a regra de elegibilidade vive no `useCoordenadoresProva`, que tem teste próprio.

Efeito colateral registrado: o `setFunctionResult` do mock passou a aceitar erro no formato do `FunctionsHttpError` (`context.body` como string), que é diferente do erro do PostgREST. Antes só compilava com cast. O `supabase-mock.test.ts` ganhou dois testes por isso.

**A próxima de maior valor é `MetaColaboradoresDialog`**, que define quantos colaboradores cada unidade precisa — número de que sai a alocação e, adiante, o pagamento.

**3. Páginas: os guards estão cobertos desde 2026-07-26; o comportamento, não.** A aposta do `it.each` sobre a tabela rota × papel se pagou: `pages/guards.test.tsx` cobre **19 páginas × 5 papéis** e é agora a especificação do `RequireModulo` (item abaixo), que deixou de ser arriscado. A bateria foi **falsificada de propósito** antes de ser aceita — quebrar o guard do `Editais` fez cair exatamente os casos "recusa colaborador" e "recusa coordenador", que é a falha que passou meses invisível.

Rendeu dois achados, ambos detalhados no item do `RequireModulo`: **`/perfil` não tinha guard nenhum** (corrigido em 2026-07-26, e `/perfil` entrou na matriz — daí as 19 páginas) e **`/dashboard` prende o colaborador puro em tela branca** (aberto).

**O que falta em páginas** é o comportamento: formulário, listagem, ação. Nenhuma página tem isso. As candidatas de maior valor são as que concentram ação destrutiva ou dinheiro — `GerenciarColaboradoresProva` (alocação, base de pagamento) e `OcorrenciasProva`.

**Sugestão anotada, não feita:** a matriz usa 5 papéis e **não inclui `user` puro** (conta sem papel de gestão e sem `colaborador`). Seriam 19 combinações novas; vale se algum dia o `user` ganhar significado além de "vê o hub vazio".

**4. Edge Functions: sem teste automatizado.** São 8 (`check-cpf-colaborador`, `corrigir-email-acesso`, `create-admin`, `create-coordenador`, `public-create-colaborador`, `recuperar-senha`, `reivindicar-acesso`, `send-email`) mais `_shared/`. Rodam em Deno, fora do alcance do Vitest como está montado — exigiria decisão de ferramenta (Deno test) antes de qualquer código. **Não é continuação natural da suíte atual; é tema próprio.** É onde vivem as políticas de anti-enumeração, rate limit e cooldown — a lógica mais sensível do sistema.

O que **existe** hoje é verificação manual da **autorização** de duas delas, em [`../docs/bateria-create-admin-autorizacao.md`](../docs/bateria-create-admin-autorizacao.md) (7 casos, rodada em 2026-07-25) — inclusive o script de forjar JWT local, que qualquer teste futuro de EF vai precisar, porque o dump traz hashes de senha de produção e ninguém sabe as senhas.

**5. O que deliberadamente NÃO se testa com Vitest.** As constraints de banco: a suíte roda contra um **mock** do Supabase, sem Postgres, então um teste ali afirmaria o mock, não o banco. A verificação correta é bateria SQL contra o banco local — feita, em [`../docs/bateria-db-constraints.sql`](../docs/bateria-db-constraints.sql) (22 casos). Histórico do tema em [`analises/concluidos/roadmap-db-constraints.yaml`](./analises/concluidos/roadmap-db-constraints.yaml).

### Dívida de contexto que a suíte carrega

- **Mudança de produção feita para viabilizar os testes:** os 9 schemas Zod passaram a ser `export`ados dos componentes (8 arquivos; só a palavra `export`). Custo aceito: +9 avisos de `react-refresh/only-export-components`.
- **Baseline de lint do repo: 93 problemas (69 erros, 24 avisos)** por `npm run lint`. Se subir, é coisa nova. (Atenção: `npx eslint src` dá 90 — a diferença são arquivos fora de `src`.)
- **Enquanto não houver CI**, fechar tema inclui rodar à mão: `npm test`, `npx tsc --noEmit -p tsconfig.app.json` e `npm run build`.

### A automação ficou para o fim, por decisão

**O usuário decidiu em 2026-07-25 deixar o CI para o final.** Não é esquecimento — está registrado no item próprio abaixo ("Rodar a suíte de testes automaticamente"), que segue válido e continua sendo o de maior alavancagem da lista. A consequência de a decisão valer: **nada roda a suíte sozinho**, então cada tema fechado depende de alguém lembrar. Escrever mais teste rende menos até o CI existir — o que é justamente o argumento para não perseguir 100% de cobertura antes dele.

---

## `addCoordenadorAccess` fabrica uma alocação falsa para satisfazer uma FK

**Status:** pendente — **achado ao escrever teste** em 2026-07-25 (decisão de resolução em 2026-07-26)
**Área:** Alocação e Funções (ver [`estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md`](./estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md)) / Autenticação (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

`coordenadores_prova` exige um `colaborador_prova_id`. Quando a unidade da prova ainda não tem **nenhuma** alocação, `useUsers.addCoordenadorAccess` não recusa: pega **qualquer colaborador** (`.limit(1)`, sem ordenação — o que o banco devolver primeiro) e **cria uma linha em `colaboradores_prova`** só para preencher a FK.

**Por que isso é poluição de dado, e não um detalhe técnico:** `colaboradores_prova` é a tabela de **alocação real** — a que diz quem trabalha na prova, e de onde saem os relatórios e a base de pagamento. A linha fabricada faz um colaborador aparecer alocado numa unidade para a qual ninguém o escalou, **sem função e sem valor**. Ninguém que olhe a tela de alocação consegue distinguir essa linha de uma real.

**A causa é de modelagem:** o acesso de coordenador está amarrado a uma alocação, quando são coisas independentes — coordenar uma prova não é trabalhar numa sala dela. O conserto honesto seria tornar `colaborador_prova_id` nullable, mas a solução arquitetural decidida é outra.

### Decisão de resolução: Excluir a concessão de coordenador pela UI de `/gerenciar-usuarios`

**Decidido em 2026-07-26:** em vez de contornar a FK ou melhorar o chute de qual colaborador usar, **refatorar a rota `/gerenciar-usuarios` (acessível pelo botão "Usuários" na headerbar) para excluir a possibilidade de concessão de acesso a coordenador por ali**.

Como documentado em [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md), hoje existem duas formas de dar acesso de coordenador:
1. Pelo `CoordenadoresProvaDialog` (dentro da gestão da prova), que exige uma alocação real em `colaboradores_prova` com função de coordenação.
2. Pela tela `/gerenciar-usuarios` via `useUsers.addCoordenadorAccess`, que é o caminho "de emergência" que fabrica a linha sintética quando não há alocação.

**Ação necessária:**
- Remover da UI de `/gerenciar-usuarios` a opção de conceder/selecionar o papel de `coordenador`.
- A concessão de acesso de coordenador passará a ser **exclusiva** do fluxo de alocação da prova (`CoordenadoresProvaDialog`).
- Com isso, o hook `useUsers.addCoordenadorAccess` (e o workaround da alocação falsa em `colaboradores_prova`) deverá ser excluído do código.

---

## Papel checado por SELECT literal em `user_roles` bloqueia o superadmin na concessão de coordenador

**Status:** pendente — **achado ao escrever teste** do `CoordenadoresProvaDialog` em 2026-07-26
**Área:** Autenticação (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md)) / Alocação e Funções

**Terceira ocorrência da mesma classe** (as duas primeiras foram `send-email` e `create-admin`): papel conferido por `SELECT` em `user_roles` com igualdade, em vez de `has_role`. A migration [`20260725195530_superadmin_implica_admin_em_has_role.sql`](../supabase/migrations/20260725195530_superadmin_implica_admin_em_has_role.sql) existe **precisamente** porque `user_roles` não carrega a implicação `superadmin ⊇ admin` — quem a resolve é o `has_role`. E `create-admin` já foi corrigida para usar a RPC, com o comentário explícito no código.

São **dois lugares**, o mesmo erro, gravidades diferentes:

**1. 🔴 A Edge Function `create-coordenador` RECUSA o superadmin** (`index.ts:51-64`):

```ts
.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single()
// roleError || !roleData  →  403 "Only admins can create coordinators"
```

Um superadmin **não tem linha `admin`** em `user_roles` — `create-admin` insere só o papel escolhido. Então ele leva **403** e **não consegue conceder acesso de coordenador**. Isto viola a regra do usuário de que superadmin não bate em muro, e é funcional: quebra o fluxo hoje, não em teoria.

> **Consequência direta para a decisão do `addCoordenadorAccess`** (item acima): aquela decisão quer tornar o `CoordenadoresProvaDialog` o caminho **exclusivo** de concessão. Enquanto este 403 existir, tornar exclusivo um caminho que o superadmin não consegue usar **tranca a concessão para ele**. Consertar isto é pré-requisito daquele tema, não item paralelo.

**2. 🟡 A barreira de e-mail de admin no diálogo não pega superadmin** (`CoordenadoresProvaDialog.tsx:122-127`). A intenção é recusar e-mail que já pertence a um administrador; com `.eq("role","admin")`, o e-mail de um superadmin passa reto. A EF então **reaproveita a conta existente** (`create-coordenador/index.ts:85-87`) e acrescenta o papel `coordenador` mais uma linha em `coordenadores_prova` à conta do superadmin.

Não é escalada de privilégio (superadmin já pode mais), e o `resolveRoleGestao` mantém o `role` como `superadmin`, então a UI dele não muda. O dano é **poluição de dado** e a barreira falhando em silêncio no caso que ela mesma diz proibir. Tem teste marcado `⚠️ DEFEITO`.

**Conserto dos dois:** trocar o SELECT por `supabase.rpc("has_role", { _user_id, _role: "admin" })`, que já resolve a hierarquia. O da EF é o urgente.

---

## Excluir função de colaborador apaga dados em cascata, e só o cliente protege

**Status:** pendente — **achado ao escrever teste** em 2026-07-25
**Área:** Alocação e Funções (ver [`estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md`](./estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md))

As três FKs que apontam para `funcoes_colaboradores` são **destrutivas, não protetivas** (verificado no banco):

| Tabela | `ON DELETE` | Efeito |
|---|---|---|
| `colaboradores_prova` | **SET NULL** | alocações ficam **sem função**, inclusive em provas já realizadas |
| `meta_colaboradores_unidade` | **CASCADE** | metas somem |
| `valores_funcao_prova` | **CASCADE** | valores de pagamento somem |

Excluir uma função em uso **não dá erro**: apaga dado de várias provas em silêncio, incluindo registro financeiro. **A única barreira é o cliente** — `useFuncoesAssociadas` consulta as três tabelas e a página desabilita o botão. Uma chamada direta ao PostgREST por um admin passa reto.

É a mesma lacuna que o tema de [DB constraints](./analises/concluidos/roadmap-db-constraints.yaml) fechou para *formatos*, agora em *integridade referencial*: a regra existe na UI e não no banco.

**Conserto sugerido**, em ordem de preferência:
1. **`ON DELETE RESTRICT`** nas três FKs — o banco recusa, e a UI passa a traduzir o `23503` (que ela já sabe fazer para outros casos). Mais simples e mais honesto: a exclusão vira erro, não perda silenciosa.
2. Trigger `BEFORE DELETE` que levanta mensagem própria, se a de FK for considerada técnica demais.

**Atenção ao escolher:** `SET NULL` em `colaboradores_prova` pode ter sido deliberado, para permitir aposentar uma função sem travar em histórico antigo. Se for o caso, a resposta certa talvez seja **soft delete** (uma coluna `ativa`) em vez de RESTRICT — decidir antes de migrar. Enquanto isso, o cliente continua sendo a única rede, e o `isFuncaoAssociada` que a sustenta **responde `false` enquanto carrega** (contido hoje só porque a página espera o `isLoading`).

---

## `useOcorrencias`: lista vazia de unidades não restringe nada

**Status:** pendente — **achado por teste automatizado** em 2026-07-25
**Área:** Ocorrências (ver [`estrutura/modulos/aplicacao-provas/ocorrencias.md`](./estrutura/modulos/aplicacao-provas/ocorrencias.md))

O filtro por unidade em `useOcorrencias` é aplicado assim:

```js
if (provaUnidadeIds && provaUnidadeIds.length > 0) q = q.in("prova_unidade_id", provaUnidadeIds);
```

Uma lista **vazia** significa "nenhuma unidade permitida", mas cai no **mesmo ramo** do `undefined` que o admin usa para dizer "sem restrição": nenhum filtro é aplicado e a consulta devolve **todas as ocorrências da prova**.

**Por que não é teórico.** Em `OcorrenciasProva.tsx:105` o segundo argumento vem de `scopedUnidadeIds`, derivado de `useCoordenadorUnidades` — que devolve `[]` **enquanto carrega** (`query.data ?? []`, e a query ainda nem resolveu). Ou seja: em **todo carregamento da página por um coordenador** existe uma janela em que a consulta roda sem filtro, e a tela mostra ocorrências de unidades que não são dele. Quando os ids chegam, o `queryKey` muda e o React Query refaz a consulta — a janela fecha sozinha, mas não antes de renderizar.

**A RLS não segura isso.** A policy de `ocorrencias_colaborador` é `is_coordenador_prova(auth.uid(), prova_id)`, que autoriza **por prova**, não por unidade (confirmado no banco em 2026-07-25). O recorte por unidade existe **só no cliente** — então este `if` é a única barreira, e ela abre justamente quando deveria fechar ao máximo.

**Conserto sugerido:** distinguir os dois casos, que hoje colidem. `undefined` = admin, sem restrição; `[]` = nada permitido → aplicar `.in("prova_unidade_id", [])`, que devolve zero linhas. Alternativa complementar: não disparar a consulta enquanto o escopo do coordenador não tiver resolvido (o `enabled` passaria a considerar isso), o que também evita a consulta ampla e o refetch.

**Ao corrigir:** o teste `⚠️ DEFEITO` em `src/hooks/useOcorrencias.test.tsx` afirma hoje o comportamento **errado** de propósito. Ele vai quebrar quando o conserto entrar — é o sinal de que deve ser reescrito para o comportamento correto.

---

## Centralizar os guards de página num `RequireModulo`

**Status:** pendente — aberto em 2026-07-24, como saldo da D5 do tema "tela de entrada por módulos"
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md)) / Arquitetura (ver [`estrutura/transversais/arquitetura-geral.md`](./estrutura/transversais/arquitetura-geral.md) §6)

Cada página de gestão hoje tem o **próprio** guard, repetido à mão (padrão `Dashboard.tsx`: checa papel, senão `navigate("/")`). O registro de módulos (`src/lib/modulos.ts`) já sabe, por rota, qual módulo e quais papéis — então dá para trocar os ~11 guards espalhados por **um** wrapper `RequireModulo` que lê o registro e decide num lugar só.

Foi **deixado de fora de propósito** do tema que criou o hub (decisão D5 do [`analises/concluidos/roadmap-modulos.yaml`](./analises/concluidos/roadmap-modulos.yaml)): misturar uma refatoração de autorização com uma feature de navegação transformaria uma coisa em duas. Ao fazer, manter o princípio: o wrapper é UX/roteamento; RLS + EFs continuam sendo a barreira real.

> **Correção do que estava escrito aqui (2026-07-25):** este item afirmava que "os guards atuais continuam corretos". **Dois não estavam** — e a omissão é do mesmo tipo nos dois: o `useEffect` manda para `/auth` quem não está logado e **para por aí**, sem o `navigate("/")` por papel que as outras páginas têm.
>
> - `Colaboradores.tsx` — **corrigido em 2026-07-25** (`isAdmin || isCoordenador`).
> - `FuncoesColaboradores.tsx` — **corrigido em 2026-07-25** (`isAdmin`, decidido pelo usuário: cadastro de funções é gestão, e o coordenador já vê os nomes na tela de alocação).
>
> Nenhum dos dois era vazamento de dado (a RLS contém), mas **duas ocorrências da mesma omissão em 15 páginas é o argumento do item**, não uma coincidência: guard escrito à mão erra por esquecimento, e o erro é silencioso — nada quebra, a página só fica aberta demais. Os dois consertos pontuais **não substituem o wrapper**; eles mostram por que ele é necessário. Inventário de guards por rota: [`estrutura/modulos/aplicacao-provas/00-modulo.md`](./estrutura/modulos/aplicacao-provas/00-modulo.md).
>
> **Dois detalhes que o wrapper precisa herdar** (achados ao consertar o `Colaboradores.tsx`): esperar **`rolesLoaded`**, não só `loading` — cada refresh de token reabre a janela em que o usuário existe e os papéis ainda não, e decidir ali expulsa coordenador; e respeitar **`isLoggingOut`**, senão o logout dispara o bounce por papel antes do redirect.

### O item deixou de ser arriscado: existe rede desde 2026-07-26

`src/pages/guards.test.tsx` (137 testes) afirma a matriz **19 páginas × 5 papéis** e é a **especificação do wrapper**: se um teste dali quebrar durante a refatoração, a decisão de autorização mudou de comportamento. Fazer o `RequireModulo` agora é trocar 19 guards à mão por um, com o contrato escrito.

**O retrato medido dos dois detalhes acima** — não é mais leitura de código, é teste:

| Dimensão | Quem já faz certo | Quem não |
|---|---|---|
| Espera `rolesLoaded` | `Inicio`, `Colaboradores`, `FuncoesColaboradores`, `PerfilColaborador` | as outras 13 (`<Navigate>` em render, olhando só `authLoading`) |
| Respeita `isLoggingOut` | `Inicio`, `Colaboradores`, `FuncoesColaboradores` | as outras 15 — **inofensivo**: mandam para `/auth`, que é o destino que o `signOut` já ia impor |

**Correção de dimensionamento:** as 13 que decidem sem esperar os papéis **não estão quebradas hoje**, ao contrário do que a redação anterior deste item sugeria. O motivo é preciso: no refresh de token o `fetchUserRoles` só reescreve `role` **depois** de responder, então o papel anterior sobrevive à janela e `isAdmin` continua true. A janela com `role` vazio só existe na transição do login, e ali a página montada é a `/auth`, que espera `rolesLoaded`. É **fragilidade latente** — viraria bug real no dia em que alguém limpar os papéis antes do refetch, ou fizer o login cair direto numa página de módulo. O wrapper fecha isso de uma vez.

### Dois defeitos de verdade, achados pela bateria — um fechado, um aberto

**1. ✅ `/perfil` não tinha guard nenhum — CORRIGIDO em 2026-07-26.** `Perfil.tsx` lia `user` do contexto e renderizava, sem `useEffect` de redirecionamento e sem `<Navigate>`. Era a **terceira ocorrência da mesma omissão**, e a mais completa das três: as outras duas pelo menos mandavam o deslogado para `/auth`. Nunca foi vazamento — nada era lido do banco e salvar falhava no `auth.updateUser`; era porta aberta na tela.

> **Conferido antes de mexer:** a hipótese de que fosse deliberado, para o cadastro público, **não se sustenta** — o botão "Novo Colaborador" do `/auth` leva a `/cadastro-publico` (rota separada, sem guard de propósito), e `/perfil` só é alcançável pelo dropdown "Alterar Cadastro" do header, que exige login.
>
> **Decisão de alcance:** restrita a **gestão**; colaborador puro vai para `/perfil-colaborador`, que é a página dele — evita duas telas concorrentes de "meus dados". Quem tem `role === 'user'` entra, de propósito: tem conta no Auth e o hub já o aceita.
>
> **Um defeito adjacente saiu no mesmo commit:** o campo Nome Completo era inicializado no `useState`, que roda antes de a sessão resolver — num reload direto em `/perfil` aparecia **vazio** para quem tinha nome salvo, e salvar assim **apagava o nome**. Sincronizado por `user?.id`, como `PerfilColaborador.tsx:141` já fazia.

**2. ⚠️ `/dashboard` prende o colaborador puro em tela branca — ABERTO.** O guard usa `role !== null` como proxy de `rolesLoaded` (`Dashboard.tsx:26`) para não expulsar admin na janela — a intenção é boa, e é o único lugar que se protegeu disso sem usar `rolesLoaded`. Mas o colaborador puro tem justamente `role === null`: ele cai para sempre no ramo "ainda não sei o papel", nunca é mandado ao hub, e o `return null` de baixo entrega **página vazia**. Conserto: trocar o proxy pelo `rolesLoaded` de verdade — o que o wrapper já vai fazer.

---

## Rodar a suíte de testes automaticamente (CI e/ou pre-commit)

**Status:** pendente — aberto em 2026-07-25, junto com a introdução dos testes. **Adiado por decisão do usuário no mesmo dia: "deixar o CI para o final."** Segue sendo o item de maior alavancagem da lista; o adiamento é escolha consciente de ordem, não reavaliação do valor.
**Área:** Infraestrutura (ver [`estrutura/transversais/arquitetura-geral.md`](./estrutura/transversais/arquitetura-geral.md))

O projeto ganhou uma suíte de regressão em 2026-07-25 (Vitest + React Testing Library, `npm test`), mas **nada a executa sozinho**: não há `.github/workflows/`, não há hook de pre-commit. Os testes só rodam quando alguém digita o comando.

**Por que isso não é detalhe:** uma suíte que ninguém executa não previne regressão nenhuma. E este repositório já pagou por isso — o `tsc` ficou **vermelho por 11 dias** por causa de um import morto deixado na subetapa 2A (`useOnlineColaboradores` em `ColaboradoresList.tsx`), atravessando os temas do hub e de Editais sem ninguém notar. `npm run build` sozinho não pegava, porque o esbuild descarta import não usado antes de resolver o módulo. Verificação manual depende de lembrar.

**O trabalho:** um workflow rodando `npm test`, `npx tsc --noEmit -p tsconfig.app.json` e `npm run build` a cada push/PR. Opcionalmente um pre-commit (husky + lint-staged) para o feedback rápido. **Atenção ao escolher o gate do lint:** o repo tem 69 erros de eslint pré-existentes, então `npm run lint` não pode ser bloqueante hoje sem um passe de saneamento antes — ou trave só os arquivos alterados.

---

## Refazer a página de treinamento do zero

**Status:** pendente — a página antiga foi **excluída** em 2026-07-25
**Área:** Aplicação de Provas (ver [`estrutura/modulos/aplicacao-provas/00-modulo.md`](./estrutura/modulos/aplicacao-provas/00-modulo.md))

A rota `/treinamento` e o `src/pages/Treinamento.tsx` (1547 linhas) foram removidos: o conteúdo estava envelhecido demais para valer um remendo, e um manual errado é pior que manual nenhum — ele *parece* autoridade. A decisão foi excluir agora e reescrever depois, do zero.

**O que era:** manual do usuário embutido no app, explicando o sistema tela por tela em JSX estático — texto corrido mais mockups desenhados à mão (cards de exemplo com dados literais no código). Não importava hook nenhum e não consultava o banco.

**Por que envelheceu sem ninguém ver:** descrevendo o sistema *por fora*, ela nunca quebrava build, teste ou lint ao ficar errada. O único detector era memória humana — e a página **não tinha link nenhum na UI** (estava em `prefixosRota` mas nunca nos `navLinks`), então só se chegava nela digitando a URL. Invisível para o usuário e para quem mantinha.

**O que a versão nova precisa resolver, além do conteúdo:**
1. **Um caminho até ela.** Sem entrada na navegação, a página não cumpre função — e some do radar de quem mantém.
2. **Uma âncora contra o drift.** A causa raiz é o texto não ter vínculo nenhum com o código que descreve. Vale considerar conteúdo fora do JSX (MDX/markdown versionado), capturas reais em vez de mockups à mão, ou pelo menos uma checagem no fechamento de tema. Se a solução for só "lembrar de atualizar", ela vai apodrecer de novo pelo mesmo motivo.
3. **A marca certa.** O título da antiga dizia *"Sistema de Cadastro de Colaboradores do DCIT"*, divergindo do FEVRE usado no resto da UI.

**Ponta solta:** `framer-motion` (`^12.27.0`, em `package.json`) era usado **só** por essa página e agora é dependência órfã. Manter, se a página nova for usar animação; remover, se não — decisão para o momento da reescrita.

O conteúdo antigo continua recuperável no histórico do git (última versão em `cd86219`; a exclusão é de 2026-07-25).

---

## Refatorar diálogo "Nova Ocorrência" para modelo wizard

**Status:** pendente
**Área:** Ocorrências (ver [`estrutura/modulos/aplicacao-provas/ocorrencias.md`](./estrutura/modulos/aplicacao-provas/ocorrencias.md))

Refatorar o diálogo de Nova Ocorrência (`src/pages/OcorrenciasProva.tsx`) para um fluxo em wizard (passos), em vez do formulário único atual.

Junto com a refatoração, **corrigir a funcionalidade de "Faltou"**: quando uma ocorrência marca que o colaborador faltou, ele deve ser **retirado da unidade daquela prova** (ou seja, o vínculo correspondente em `colaboradores_prova` deve ser removido/desfeito para aquela prova+unidade). Hoje esse efeito não acontece.

---

## Sanear as contas do Auth (3 dívidas abertas pelo backfill)

**Status:** pendente — aberto em 2026-07-14, ao vincular os colaboradores que já eram usuários
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

Ao escrever o backfill do `seed.pos.sql`, a varredura das 15 contas do `auth.users` revelou três problemas. **Nenhum bloqueia a etapa 2**, mas todos ficam piores quando a recuperação de senha por e-mail passar a valer.

**1. Um coordenador loga com `ab@ab.com`.** É um e-mail de teste, e o e-mail real dele já está no cadastro de colaborador. Duas consequências: ele **nunca consegue recuperar a própria senha** (o link iria para uma caixa que não é dele), e `ab@ab.com` é um domínio que **outra pessoa pode passar a possuir** — o que faz de uma conta de coordenador um alvo de tomada de conta. O conserto é trocar o e-mail da conta no Auth para o do cadastro, avisando-o (muda o login dele).

**2. O Caio tem duas contas admin+superadmin:** `caiohis@gmail.com` (a que o backfill vinculou ao cadastro de colaborador dele) e `caio.teixeira@smevr.com.br`. A segunda é a **operacional de verdade** — assinou 406 linhas (232 e-mails do log, 87 metas, 32 salas, 31 alocações, 10 alocações de coordenador, 6 unidades, 3+5 finalizações); a primeira assinou 26. Excluir uma delas **não é trivial**: 8 FKs `created_by` são `NO ACTION`, então o `DELETE` **falha** enquanto as linhas existirem — seria preciso primeiro reapontar a autoria para a conta sobrevivente, o que **reescreve o histórico**. Tentado e abandonado em 2026-07-14 por ser complexo demais para o ganho. Enquanto as duas viverem, decidir qual é a canônica.

**3. Duas contas do Auth não casam com colaborador nenhum:** uma pessoa que não existe na tabela `colaboradores`, e uma "Nathalia" cujo `full_name` (só o primeiro nome) é ambíguo entre duas colaboradoras homônimas. Ambas têm só o papel `user` e ficaram **sem vínculo**, corretamente — o backfill se recusa a adivinhar. Elas podem se reivindicar pelo fluxo normal da etapa 2; o item aqui é só **conferir com um humano** quem são.

---

## Enxugar os grants de tabela de `anon`/`authenticated` (drift do dashboard Lovable)

**Status:** pendente — aberto em 2026-07-15, ao endurecer a RLS de `colaboradores`
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

Ao fazer a RLS de verdade em `colaboradores` apareceu que **`anon` tem `GRANT SELECT/INSERT/UPDATE/DELETE/TRUNCATE`** na tabela (e `authenticated` idem) — o padrão "tudo para todo mundo" que o dashboard do Lovable aplicou, provavelmente **em todas as tabelas de `public`**. Hoje só a **RLS** impede o estrago: `anon` não tem policy, então SELECT/INSERT/UPDATE/DELETE caem em *default deny*. **Mas `TRUNCATE` não passa por RLS** — um `GRANT TRUNCATE ... TO anon` é, no papel, poder de esvaziar a tabela. O que salva na prática é o PostgREST **não expor** TRUNCATE pela API; ainda assim é privilégio a mais, contra o princípio do menor privilégio.

O trabalho: varrer `information_schema.role_table_grants` por `grantee IN ('anon','authenticated')` e **revogar o que não se justifica** — no mínimo `TRUNCATE`, `REFERENCES`, `TRIGGER` de `anon` em toda tabela; possivelmente reduzir `anon` a só o que os fluxos públicos realmente usam (que hoje passam por Edge Functions com `service_role`, não pela anon key direta). É sistêmico (não só `colaboradores`), então merece um passo próprio e um `db reset` de validação. **Atenção:** casa com a migration `20260712010000_grant_api_roles_table_privileges.sql`, que registrou os grants que faltavam em migration e ajustou `ALTER DEFAULT PRIVILEGES` — o enxugamento tem que conversar com ela, não brigar.

---

## Troca de e-mail de conta confirmada (estado C) — sem caminho no app

**Status:** pendente — aberto em 2026-07-16, ao fechar as Etapas 1 e 2 da edição de `colab_email`
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

As três etapas da edição de `colab_email` sensível à identidade **estão feitas** (trava de UI + a EF `corrigir-email-acesso`, que renomeia a conta pendente do estado B). **Sobra o estado C:** quem tem login **confirmado** não consegue trocar o próprio e-mail pelo app — e a coordenação também não, de propósito (dar essa alavanca à coordenação reabriria o sequestro). Hoje a única saída é o dashboard do Auth, na mão.

Faltam as duas pontas: **(1) o caminho principal** — `supabase.auth.updateUser({ email })` no `PerfilColaborador`, com a dupla confirmação nativa e o sync de volta para `colab_email` quando confirmar; **(2) a exceção administrativa** — o dono que perdeu a caixa antiga, que exigiria ação separada, restrita a `admin`, auditada. Detalhe e o porquê de cada uma ter ficado de fora em [`analises/dividas-auth-colaborador.md`](./analises/dividas-auth-colaborador.md) §1-bis.

**Resíduo relacionado (§1):** a trava de `colab_email` é **de UI, não de banco** — a RPC `update_meu_colaborador` ainda aceita `p_email` e a policy de UPDATE ainda alcança a coluna, então uma chamada direta ao PostgREST re-ancora a linha. Fechar isso pede trigger (que dispara mesmo para `service_role`, então precisaria de escape para a `corrigir-email-acesso`) ou tirar a coluna do alcance da policy.

---

## Sanear as chaves PIX e preencher `tipo_chave_pix`

**Status:** pendente — aberto em 2026-07-14, quando as colunas ganharam unicidade
**Área:** Colaboradores (ver [`estrutura/modulos/aplicacao-provas/colaboradores.md`](./estrutura/modulos/aplicacao-provas/colaboradores.md))

Duas pontas soltas deixadas de propósito pela migration `20260714163506_*`:

1. **Os formatos da chave PIX estão misturados.** Das 565 chaves preenchidas, 94 estão em formatos mistos (`127.139.687-47` ao lado de `12713968747`, `(24)998491988`, chaves com espaço no meio) e **uma tem 21 dígitos** — não é chave válida de tipo nenhum. O índice único atual normaliza caixa e espaço nas pontas, mas **não** pontuação: a mesma chave escrita de dois jeitos ainda entra duas vezes. Sanear isso é reescrever dado bancário de 565 pessoas e pede conferência humana.

2. **`tipo_chave_pix` está `NULL` nas 771 linhas.** O tipo **não é inferível** do valor: 397 chaves têm 11 dígitos, e 11 dígitos é tanto CPF quanto celular com DDD (193 batem com o CPF da própria pessoa, 188 com o telefone dela, e o resto com nenhum dos dois). Adivinhar errado é errar o destino de um pagamento. Preencher exige ou confirmação humana, ou uma regra de negócio que ainda não existe.

Enquanto (2) não estiver resolvido, não é possível criar o `CHECK` que amarra "tem chave ⇒ tem tipo".

**Atenção:** qualquer correção em massa aqui é **operação de dados** e esbarra na regra do seed — migration não alcança dado que entra pelo dump (ver [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md)).

---

## Bootstrap do banco de produção da v2

**Status:** pendente — **deliberadamente adiado até a primeira subida da v2 a produção**
**Área:** Infraestrutura / Banco (ver [`banco-producao.md`](./banco-producao.md))

O projeto novo no supabase.com já foi criado, mas o repo **não é linkado a ele** — e não deve ser, até o dia de colocar a v2 no ar (regra combinada em 2026-07-12: o repo fica deslinkado por padrão, e produção só é atualizada em versões estáveis).

O schema já está pronto para subir quando for a hora: as 69 migrations reproduzem o banco local do zero, validado por `db reset` em 2026-07-12. O roteiro completo dos **9 passos** (link → `prod:push:dry` → `prod:push` → carga do `seed.local.sql` → **`seed.pos.sql`** → auth no dashboard → edge functions + secrets SMTP → `.env` do frontend → **unlink**) está em [`banco-producao.md`](./banco-producao.md).

Falta apenas, no dia: a **ref do projeto novo** no Supabase.

---

## Migrar hospedagem/deploy para fora do Lovable

**Status:** pendente
**Área:** Infraestrutura (ver [`estrutura/transversais/arquitetura-geral.md`](./estrutura/transversais/arquitetura-geral.md))

O Lovable já foi removido do **código** em 2026-07-11 (`lovable-tagger`, boilerplate, `.lovable/`), e o site do Lovable **não existe mais** — o projeto está temporariamente fora do ar (situação em 2026-07-12). Não há mais deploy ativo em lugar nenhum.

Publicar a v2 em infraestrutura própria (ex.: Vercel, Netlify, ou build estático em qualquer host), incluindo o domínio. O build de produção (`npm run build`) é um Vite estático comum e não depende de nada do Lovable. Depende do bootstrap do banco acima (o frontend precisa apontar para o Supabase novo).

---

## Verificar exposição da `send-email` no projeto Supabase antigo (v1)

**Status:** pendente — **a verificar antes de considerar o assunto fechado**
**Área:** Segurança / Infraestrutura (ver [`estrutura/transversais/integracoes-externas.md`](./estrutura/transversais/integracoes-externas.md))

Em 2026-07-20 descobriu-se que a `send-email` **não checava quem a chamava**. O `verify_jwt` padrão exige um JWT, mas a **anon key é um JWT válido e é pública** — vai no bundle do frontend. Qualquer pessoa com essa chave podia mandar `{to, subject, html}` arbitrário **pelo servidor SMTP da FEVRE**: o e-mail sai com SPF/DKIM legítimos e serve de vetor de phishing contra os próprios colaboradores. **Corrigido no código** (a função passou a exigir `service_role`).

**O que falta:** a correção vale para o código deste repo. **O projeto Supabase antigo (v1) pode ainda ter a versão vulnerável publicada** — e uma Edge Function fica acessível pela URL do projeto **independentemente de o frontend estar no ar** (hoje não está). Se o projeto v1 ainda existe, o endpoint provavelmente continua chamável com a anon key antiga.

**A fazer:** confirmar se o projeto v1 ainda está ativo; se estiver, ou republicar a `send-email` corrigida nele, ou remover a function, ou derrubar o projeto. Enquanto isso não for verificado, considere as credenciais SMTP da Hostinger como **potencialmente já expostas a uso indevido** — vale checar o volume de envio na conta e, na dúvida, **trocar `SMTP_PASS`** (a senha está nos secrets das EFs e no `.env` local, então a troca é barata).

---

## Porta única de acesso: "Estou sem minha senha" (CPF ou e-mail)

**Status:** ✅ **CONCLUÍDO.** Implementado em 2026-07-20; UI validada em 2026-07-21 (blocos `C` e `E` da bateria, todos aprovados). A regra consolidada vive em [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md) ("Porta única"); este item fica como registro do desenho e das decisões.
**Área:** UX / Autenticação (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

> **Achado durante a implementação:** o cooldown precisou olhar **três** carimbos (`recovery_sent_at`, `confirmation_sent_at`, `invited_at`), não só o primeiro — `generateLink('invite')` deixa `recovery_sent_at` NULL, então a versão inicial deixava a chamada seguinte a um invite mandar um recovery que **invalidava o invite recém-enviado**. Detalhe em `auth-e-permissoes.md`.
>
> **Fica em aberto, por decisão:** os **254 sem e-mail** seguem dependendo do coordenador. E o CPF de quem **já tem conta** informa em vez de mandar o link — fechar isso esbarra no estado B (`colab_email` e e-mail da conta divergem, e mandar para a conta não ajudaria).

### A proposta

Na tela `/auth`, **substituir os dois links** — "Primeiro acesso (já sou cadastrado)" e "Esqueci minha senha" — por **um só: "Estou sem minha senha"**. Ele abre uma UI com **um campo**, rotulado "CPF ou e-mail", com **detecção automática** do que foi digitado (tem `@` → e-mail; só dígitos → CPF).

**O botão "Novo Colaborador" permanece** (decisão do usuário). Ficam duas portas, mas a classificação que elas pedem passa a ser fácil — "sou novo" vs. "sou eu, sem senha" — em vez da atual, que é impossível.

### Por que

Hoje a tela pede que a pessoa se classifique segundo o estado do **banco** (`user_id` é nulo? `email_confirmed_at`?), informação a que ela não tem acesso nenhum. **O servidor sabe em que estado ela está; ela não sabe.** A porta única inverte isso: a pessoa diz quem é, e o servidor decide se o caso é criar conta (`invite`) ou redefinir senha (`recovery`).

O rótulo novo também cobre os dois casos com uma frase verdadeira: "estou sem minha senha" vale para quem nunca teve e para quem esqueceu. "Primeiro acesso (já sou cadastrado)" exigia entender o que "cadastrado" significa no nosso jargão.

### ⚠️ A decisão que precisa sobreviver: as respostas são ASSIMÉTRICAS de propósito

Os dois caminhos fundidos têm **políticas opostas de privacidade, e isso não é acidente**:

- **CPF** (`reivindicar-acesso`) **revela**: devolve `{existe, ja_vinculado, email_mascarado}`. Concessão consciente, já documentada como dívida contida, segurada por rate limit de 5/15 min por IP. O e-mail mascarado é o que diz à pessoa **qual caixa abrir** — para quem tem vários endereços, é a diferença entre entrar e desistir.
- **E-mail** (`recuperar-senha`) **não revela nada**: resposta idêntica para conta existente, inexistente ou em cooldown.

**Decisão: fundir a UI, NÃO as políticas.** Cada input vaza coisa diferente, com economia de ataque diferente — uma lista de e-mails se compra pronta e se testa em massa; CPF é outro jogo, e aquele risco já está aceito e contido. Mantendo cada política onde ela é ótima, a fusão **não cria dívida nova**: é reorganização de tela, não mudança de postura.

**Isto é o item mais importante deste registro.** A mesma tela responder de dois jeitos **parece bug** para quem chega depois. Quem "consertar" a inconsistência uniformizando as respostas vai, dependendo do lado que escolher, **reabrir a enumeração por e-mail** ou **matar o e-mail mascarado** (e com ele o aviso "procure o coordenador" dos 254 sem e-mail). Não uniformize sem reler isto.

### O furo que a implementação precisa fechar

A `recuperar-senha` procura a conta em **`auth.users`**. Quem está em **estado A com e-mail no cadastro** (a maioria dos 759) **não tem conta** — então, se essa pessoa digitar o e-mail dela, a EF não acha nada, devolve a frase genérica e **não envia e-mail nenhum**. É o mesmo buraco negro de hoje, agora atrás de uma porta que promete resolvê-lo.

**Correção necessária:** não achou conta no Auth → procurar em `colaboradores.colab_email` → se achar em estado A, mandar o **`invite`** em vez do `recovery`. É o mesmo raciocínio que o servidor já faz pelo CPF, aplicado ao e-mail. **Não custa privacidade:** a resposta continua genérica, então a EF fica mais útil sem ficar mais falante.

### Beco novo que a proposta cria

Os **254 sem e-mail no cadastro**: se a pessoa digitar o e-mail pessoal dela, não há match (o cadastro não tem e-mail nenhum) e ela recebe "não encontrado" — concluindo que **não está cadastrada**, o que é falso. Hoje isso não acontece porque a porta dela é obrigatoriamente o CPF. **A tela deve sugerir "tente pelo CPF" antes de dar qualquer veredicto de inexistência.**

### Escopo

1. Componente novo (campo único + detecção), reaproveitando o miolo do `ReivindicarAcessoCard`.
2. `Auth.tsx`: dois links viram um; "Novo Colaborador" fica.
3. `recuperar-senha`: o ramo de estado A por e-mail (acima).
4. A dica "tente pelo CPF" antes do veredicto de inexistência.
5. Rate limit: o endpoint passa a receber os dois tipos de input — conferir se o teto por IP da `reivindicar-acesso` (5/15 min) e o cooldown por conta da `recuperar-senha` (2 min) seguem cobrindo o caminho fundido.
6. Docs: quando implementar, a regra consolidada vai para [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md), e a bateria em [`../docs/teste-frontend-auth-colaborador.md`](../docs/teste-frontend-auth-colaborador.md) ganha os casos (bloco C e E se fundem na prática).

**Não precisa de roadmap:** não há etapas com dependência entre si, nem migration, nem política de segurança nova — é uma mudança coerente única. O que precisava de registro era a assimetria e o furo acima, que é o que este item guarda.
