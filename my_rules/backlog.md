# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. Itens concluídos devem ser removidos daqui (o histórico do que foi feito vive na documentação em [`estrutura/`](./estrutura/), não neste arquivo).

> **Última auditoria contra o código: 2026-07-26.** Cada item foi conferido no código e no banco local; o que estava desatualizado está marcado no próprio item. Números que valem repetir, porque foram medidos e não estimados: **85 migrations**, **771 colaboradores** (565 com chave PIX, **0** com `tipo_chave_pix`), **`anon` ainda com `TRUNCATE` em 23 tabelas**, e as três FKs de `funcao_id` seguem `SET NULL`/`CASCADE`/`CASCADE`.

---

## Completar a suíte de testes (Vitest) — onde paramos e o que falta

**Status:** parcial — a suíte existe e roda desde 2026-07-25; a cobertura está **incompleta por decisão**, não por esquecimento
**Área:** Infraestrutura / transversal (ver [`estrutura/transversais/testes.md`](./estrutura/transversais/testes.md) para infra, convenções e as **7 armadilhas**)

Este item é o marco: quem retomar os testes começa por aqui. **Leia `testes.md` antes de escrever teste novo** — as armadilhas ali custaram tempo real (a sequência do mock consumida pela listagem; `.at(-1)` pegando o refetch e não a mutation; `act()` no que atualiza provider; fake timers com `shouldAdvanceTime`; o caminho do `pagehide`, que não passa pelo mock do Supabase; **timeout usado como resposta**, que passou isolado e falhou na suíte cheia; e o `min`/`max` do input barrando **antes** do Zod em formulário com submit).

### Onde paramos (2026-07-26)

**743 testes em 46 arquivos.** Guards centralizados no `RequireAcesso` desde 2026-07-26. Vitest 2 + React Testing Library + jsdom, `npm test`. Infra em `src/test/` (mock do Supabase, helpers de render).

Coberto:

| Camada | O que já tem |
|---|---|
| Registro de módulos | `lib/modulos.test.ts` — inclui invariantes sobre `MODULOS` inteiro |
| Schemas Zod (9) | `ColaboradorDialog`, `EditalDialog`, `FuncaoColaboradorDialog`, `ProvaDialog`, `SalaProvaDialog`, `UnidadeProvaDialog`, `pages/Auth`, `pages/GerenciarUsuarios` |
| Auth | `useAuth.test.tsx` — hierarquia, `colaborador` paralelo, `rolesLoaded`, `signOut` |
| Hooks de dados (**todos**) | `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useEditais`, `useMetaColaboradoresUnidade`, `useProvaLock`, `useValoresFuncaoProva`, `useOcorrencias`, `useCoordenadorUnidades`, `useProvas`, `useProvaUnidades`, `useSalasDistribuidas` + os dois vizinhos do mesmo arquivo (`useSalasDistribuidasCapacidade`, `useFiscaisSala`), `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useUsers` (+ `useAuth`) |
| UI de diálogo (**12 de 12**) | `EditalDialog`, `ProvaDialog`, `PasswordConfirmDialog`, `CoordenadoresProvaDialog`, `ValoresFuncaoProvaDialog`, `MetaColaboradoresDialog`, `CorrigirEmailAcessoDialog` (todos `.ui.test.tsx`) |
| Acessibilidade | `components/dialogos-acessibilidade.test.ts` — invariante estática sobre os 31 diálogos |
| **Guards de página** | `pages/guards.test.tsx` — **137 testes**: matriz 19 páginas × 5 papéis, a janela do `rolesLoaded` e o `isLoggingOut` |
| A própria infra | `src/test/supabase-mock.test.ts` — o mock tem teste próprio |

### O que falta, em ordem de valor

**1. ✅ Hooks — CAMADA FECHADA em 2026-07-26.**

Os **20 hooks de dados** têm teste (`use-mobile` e `use-toast` são utilitários do shadcn, fora da conta). A lista já esteve errada duas vezes — `testes.md` e o `00-modulo.md` diziam **8** quando eram **12** —, então o número acima vem de varredura, não de memória.

Os quatro últimos (`useUnidadesProva`, `useSalasProva`, `useUnidadeCapacidade`, `useBancos`) eram tidos como baixo risco, e em três dos quatro isso se confirmou. **A exceção foi o `useSalasProva`**, que esconde numeração de sala numa mutation: `número = andar × 100 + sequência`, calculada no cliente a partir das salas existentes, sem `SEQUENCE` no banco. O teste fixa que ela continua do **maior número daquele andar** (buraco de sala excluída não é reaproveitado, o que confundiria lista já impressa) e registra `⚠️ ATENÇÃO` no teto de **99 salas por andar** — ao estourar, a numeração invade o andar seguinte em silêncio.

**2. ✅ UI de diálogo — TODOS os 12 cobertos**, desde 2026-07-26. O último foi o `ColaboradorDialog` (777 l., o maior componente do repo): 24 testes de interação sobre a âncora de identidade, o modo público e a normalização do payload. Rendeu dois achados próprios (CPF com `padStart` e o aviso `aria-hidden`), ambos com item abaixo.

✅ **`PasswordConfirmDialog` foi o primeiro, em 2026-07-26** — era o que mais importava: a barreira de confirmação das ações destrutivas (excluir edital e prova, finalizar/reabrir, encerrar ocorrências), com 7 usos em 5 páginas. 16 testes fixam o contrato numa frase: **`onConfirm` só roda depois de a senha ser aceita pelo servidor**, e erro em qualquer etapa **não fecha o diálogo** — porque fechar sem executar pareceria sucesso. Falsificado: neutralizar a checagem de `signInError` derruba o teste da senha incorreta.

✅ **`CoordenadoresProvaDialog` saiu em seguida, no mesmo dia** — 23 testes, escolhido porque é o caminho que a decisão do `addCoordenadorAccess` quer tornar exclusivo. A aposta se pagou como a dos hooks: **rendeu mais achado que cobertura**, inclusive o 403 que bloqueia o superadmin (item próprio abaixo) e que é pré-requisito daquela decisão. O hook fica mockado ali de propósito — a regra de elegibilidade vive no `useCoordenadoresProva`, que tem teste próprio.

Efeito colateral registrado: o `setFunctionResult` do mock passou a aceitar erro no formato do `FunctionsHttpError` (`context.body` como string), que é diferente do erro do PostgREST. Antes só compilava com cast. O `supabase-mock.test.ts` ganhou dois testes por isso.

✅ **`ValoresFuncaoProvaDialog` + `MetaColaboradoresDialog` saíram juntos** (20 + 13 testes), como uma unidade de trabalho só — e a razão é um acoplamento que o teste agora fixa: **a meta só existe para função que já tem valor cadastrado na prova**. São as duas metades da base de pagamento. Renderam três achados: **dois já corrigidos no mesmo dia** (valor negativo e exclusão sem confirmação) e um aberto, no item "Apagar o valor de uma função deixa a meta dela órfã" abaixo.

✅ **`CorrigirEmailAcessoDialog` saiu em 2026-07-26** (16 testes) — a máquina de três estados da correção de `colab_email`, com foco na recusa do estado C (conta já confirmada: trocar seria trocar o login de alguém). Rendeu mais um achado — a mensagem de erro do servidor era descartada —, **corrigido no mesmo dia** com o helper `lib/edge-function-error.ts`.

✅ **Os quatro restantes saíram em 2026-07-26** (42 testes): `UnidadeProvaDialog`, `FuncaoColaboradorDialog`, `SalaProvaDialog` e `SalaExtraDialog`. Três coisas que só apareceram ao escrever:

- **O teto de andar da sala só existe no cliente.** `sala_andar <= unid_andares` é regra entre tabelas, deixada de fora dos CHECKs de propósito (um `CHECK` com função consultando outra tabela **não é reavaliado** quando ela muda). O `SalaProvaDialog` monta o schema a partir de `maxAndares` — é a única barreira, e agora tem teste.
- **`cargo_editavel === false` trava o nome da função**, e isso protege as duas funções de coordenação, identificadas por UUID fixo em `FUNCOES_COORDENACAO`.
- **A validação nativa do input precede o Zod** em formulário com submit — virou a armadilha 7 em `testes.md`.

**Falta a etapa 5:** o `ColaboradorDialog`.

**3. Páginas: os guards estão cobertos desde 2026-07-26; o comportamento, não.** A aposta do `it.each` sobre a tabela rota × papel se pagou: `pages/guards.test.tsx` cobre **19 páginas × 5 papéis** e é a especificação do `RequireAcesso` — que **foi feito em 2026-07-26** justamente porque ela existia. A bateria foi **falsificada de propósito** antes de ser aceita — quebrar o guard do `Editais` fez cair exatamente os casos "recusa colaborador" e "recusa coordenador", que é a falha que passou meses invisível.

Rendeu dois achados, **os dois já corrigidos**: `/perfil` não tinha guard nenhum (daí `/perfil` ter entrado na matriz, e as 19 páginas) e `/dashboard` prendia o colaborador puro em tela branca — este saiu de graça quando o `RequireAcesso` substituiu o proxy `role !== null`.

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

> ✅ **Um pré-requisito desta decisão foi resolvido em 2026-07-26.** A EF `create-coordenador` recusava o **superadmin** com 403, porque autorizava o chamador por `SELECT` literal em `user_roles` — ou seja, tornar esse diálogo o caminho exclusivo teria trancado a concessão justamente para o superadmin. As duas checagens (a da EF e a barreira de e-mail do diálogo) passaram a usar `has_role`. Ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md).
>
> ⚠️ **Atenção ao executar:** a fabricação da alocação falsa existe em **DOIS** lugares. Além do `useUsers.addCoordenadorAccess`, a EF `create-admin` tem a **própria cópia** da lógica (`createCoordenadorAccess`, com o mesmo `.limit(1)` pegando qualquer colaborador), usada pelo formulário de criação de usuário — e roda com `service_role`, fora da RLS. Fechar só o cliente deixa a máquina de poluir instalada.

**Ação necessária:**
- Remover da UI de `/gerenciar-usuarios` a opção de conceder/selecionar o papel de `coordenador`.
- A concessão de acesso de coordenador passará a ser **exclusiva** do fluxo de alocação da prova (`CoordenadoresProvaDialog`).
- Com isso, o hook `useUsers.addCoordenadorAccess` (e o workaround da alocação falsa em `colaboradores_prova`) deverá ser excluído do código.

---

## Sanear os 16 CPFs inválidos, para então poder exigi-los no banco

**Status:** pendente — **medido em 2026-07-26**, ao introduzir a validação de dígito verificador
**Área:** Colaboradores (ver [`estrutura/modulos/aplicacao-provas/colaboradores.md`](./estrutura/modulos/aplicacao-provas/colaboradores.md))

Dos **771** CPFs cadastrados, **16 não passam na validação de dígito verificador**: 14 com DV errado e 2 formados por dígitos repetidos.

Desde 2026-07-26 o **cliente** valida (`src/lib/cpf.ts`, usado pelo `ColaboradorDialog` e pelo `CadastroLote`), mas **de propósito só quando o CPF é novo ou alterado** — validar sempre travaria a edição desses 16 cadastros, impedindo corrigir telefone ou e-mail deles no dia da prova. É decisão registrada, não esquecimento.

**O que falta, em ordem:**

1. **Sanear os 16** — trabalho de dado, com a pessoa: CPF errado é CPF de outra pessoa, não dá para "consertar" por algoritmo.
2. **Só então** criar o CHECK de DV no banco. Antes disso, a migration falharia na carga.

⚠️ **Onde a correção precisa morar:** no **dump**, não no `seed.pos.sql` — ele roda *depois* da carga, e as constraints vêm das migrations, que rodam *antes*. É a regra que o tema dos CHECKs descobriu e que já custou três correções manuais no dump. Ver [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md).

> **Nota sobre o CHECK de DV:** não é trivial em SQL puro (precisa de função IMMUTABLE calculando módulo 11). Vale medir se o ganho supera o custo, dado que os dois escritores do cliente já validam.

---

## Apagar o valor de uma função deixa a meta dela órfã no banco

**Status:** pendente — **achado ao escrever teste** do `MetaColaboradoresDialog` em 2026-07-26
**Área:** Alocação e Funções (ver [`estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md`](./estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md))

`upsertMetas` é upsert puro (`onConflict` em prova+função) e **nunca apaga**. Quando uma função perde o valor de pagamento, ela desaparece do `MetaColaboradoresDialog` — mas a linha em `meta_colaboradores_unidade` **continua no banco**, invisível na tela e nunca mais reenviada.

Tem teste marcado `⚠️ ATENÇÃO`, não `DEFEITO`: não é falha do diálogo, que não tem como saber. O risco é para quem ler `meta_colaboradores_unidade` direto — relatório ou tela de alocação contando meta de função que não tem valor nesta prova.

**Cuidado ao consertar:** apagar meta órfã é **decisão de produto**, não limpeza óbvia — pode ser histórico legítimo de prova já realizada. Decidir antes de migrar.

> Os outros dois achados da mesma sessão **foram corrigidos em 2026-07-26**, e é por isso que este ficou menos alcançável: o valor negativo (`chk_valor_pagamento_nao_negativo` + recusa no cliente) e a exclusão sem confirmação (agora há `AlertDialog`). O gatilho mais curto para criar a órfã era justamente aquele clique sem confirmação.

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

## Dois `useEffect` do `GerenciarColaboradoresProva` escrevem estado fora do React Query

**Status:** pendente — **achado ao centralizar os guards** em 2026-07-26
**Área:** Alocação e Funções

A página tem dois efeitos que chamam `supabase...then()` **cru** (linhas ~116 e ~132) e chamam `setState` no `.then`, em vez de usar React Query como o resto do repo. Consequência visível hoje: **3 avisos de `act` no stderr** da bateria de guards, e nenhum truque de teste os silencia — tentei esperar as queries assentarem, drenar macrotarefa e desmontar a árvore antes do fim. A causa é a página, não o teste.

Por que incomoda além do ruído: estado que aterrissa fora do ciclo do React Query não participa de cache, invalidação nem `isLoading`, então a tela pode mostrar dado velho sem ninguém perceber.

**Conserto:** transformar os dois efeitos em `useQuery`. O ruído no stderr some junto, e é o sinal de que deu certo.

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

Junto com a refatoração, **corrigir a funcionalidade de "Faltou"**: quando uma ocorrência marca que o colaborador faltou, ele deve ser **retirado da unidade daquela prova** (o vínculo em `colaboradores_prova` some para aquela prova+unidade). Hoje esse efeito não acontece.

> ⚠️ **Corrigido na auditoria de 2026-07-26 — não existe "Faltou" no modelo.** `tipo_ocorrencia` é **texto livre**: o campo é um `Input` cujo placeholder apenas sugere *"Ex: Atraso, Falta, Elogio"*. Não há enum, lista fechada nem flag. O que existe de estruturado é `substituido` (0/1) com `substituto_id`.
>
> Consequência para quem for implementar: **não há em que se apoiar**. O primeiro passo é tornar o tipo estruturado (select com valores fixos, ou coluna própria), senão a regra dependeria de casar string digitada à mão — que muda com a grafia de quem preenche.

---

## Uma prova nunca pode ter seu Edital modificado

**Status:** pendente — adicionado em 2026-07-26
**Área:** Aplicação de Provas / Editais (ver [`estrutura/modulos/aplicacao-provas/provas-e-unidades.md`](./estrutura/modulos/aplicacao-provas/provas-e-unidades.md) e [`estrutura/modulos/editais/00-modulo.md`](./estrutura/modulos/editais/00-modulo.md))

Na rota `/gerenciar-prova` há um botão **"Parâmetros Gerais"** que permite alterar o cadastro da prova. Toda prova tem um edital associado a ela. O botão "Parâmetros Gerais" permite alterar o Edital.

**O que vamos mudar:** uma prova **nunca** pode ter seu Edital modificado. O campo de vinculação ao Edital deve ser permitido apenas no momento do cadastro/criação da prova, ficando travado/inviabilizado para alteração quando a prova for editada posteriormente via "Parâmetros Gerais". O valor da vinculação com o Edital segue sendo visualizado na UI conduzida atraves de Parametros Gerais. Apenas visualizado.

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

O schema já está pronto para subir quando for a hora: as **85** migrations reproduzem o banco local do zero (validado por `db reset` de novo em 2026-07-26; eram 69 quando este item foi escrito). O roteiro completo dos **9 passos** (link → `prod:push:dry` → `prod:push` → carga do `seed.local.sql` → **`seed.pos.sql`** → auth no dashboard → edge functions + secrets SMTP → `.env` do frontend → **unlink**) está em [`banco-producao.md`](./banco-producao.md).

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
