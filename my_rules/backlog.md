# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. Itens concluídos devem ser removidos daqui (o histórico do que foi feito vive na documentação em [`estrutura/`](./estrutura/), não neste arquivo).

> **Última auditoria contra o código: 2026-07-26.** Cada item foi conferido no código e no banco local; o que estava desatualizado está marcado no próprio item. Números que valem repetir, porque foram medidos e não estimados: **95 migrations** (85 até 26/07), **771 colaboradores** (565 com chave PIX, **0** com `tipo_chave_pix`), **`anon` ainda com `TRUNCATE` em 23 tabelas**, e as três FKs de `funcao_id` seguem `SET NULL`/`CASCADE`/`CASCADE`.

---

## Candidatos — o que o módulo deixou em aberto

**Status:** o módulo está pronto e verificado (2026-07-27). Estes são os fios soltos que ele **não** resolveu, e nenhum bloqueia nada hoje.
**Área:** módulo Candidatos — ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md)

1. **Nenhuma tela consome candidato ainda.** A tabela é uma ilha: não há vínculo entre candidato e prova, unidade ou sala. Se um dia for preciso saber *em que sala cada inscrito faz prova*, isso é **feature nova com desenho próprio** — não é para pendurar `prova_id`/`sala_id` em `candidatos` sem decidir antes o que acontece quando a mesma pessoa concorre a dois cargos.

2. **`editais.n_candidatos` (digitado à mão) e a contagem real de inscritos não conversam.** São coisas diferentes — previsão do edital contra lista real —, e hoje ninguém sincroniza. O card da listagem já mostra a contagem real, vinda da RPC `contar_candidatos_por_edital`. Quem for unificar precisa **decidir qual manda**, porque `n_candidatos` alimenta a herança edital→prova e a alocação lê `prova_n_candidatos`.

3. **`CadastroLote.tsx` continua lendo planilha do jeito errado** — modo objeto (perde coluna de cabeçalho repetido) e sem `raw: false` (come zero à esquerda). Não deu problema porque o template de colaboradores não tem cabeçalho repetido, mas é a mesma classe de defeito que `candidatos-import.ts` resolve. Migrar aquele fluxo para a leitura por índice é dívida conhecida.

---

## Completar a suíte de testes (Vitest) — onde paramos e o que falta

**Status:** parcial — a suíte existe e roda desde 2026-07-25; a cobertura está **incompleta por decisão**, não por esquecimento
**Área:** Infraestrutura / transversal (ver [`estrutura/transversais/testes.md`](./estrutura/transversais/testes.md) para infra, convenções e as **7 armadilhas**)

Este item é o marco: quem retomar os testes começa por aqui. **Leia `testes.md` antes de escrever teste novo** — as armadilhas ali custaram tempo real (a sequência do mock consumida pela listagem; `.at(-1)` pegando o refetch e não a mutation; `act()` no que atualiza provider; fake timers com `shouldAdvanceTime`; o caminho do `pagehide`, que não passa pelo mock do Supabase; **timeout usado como resposta**, que passou isolado e falhou na suíte cheia; e o `min`/`max` do input barrando **antes** do Zod em formulário com submit).

### Onde paramos (2026-07-26)

**743 testes em 46 arquivos.** Guards centralizados no `RequireAcesso` desde 2026-07-26. Vitest 2 + React Testing Library + jsdom, `npm test`. Infra em `src/test/` (mock do Supabase, helpers de render).

Coberto:

| Camada | Estado |
|---|---|
| **Hooks de dados** | **20 de 20** (`use-mobile` e `use-toast` são utilitários shadcn, fora da conta) |
| **UI de diálogo** | **12 de 12** — todos com `.ui.test.tsx` |
| **Guards de página** | `pages/guards.test.tsx` — 137 testes: matriz **19 páginas × 5 papéis**, a janela do `rolesLoaded` e o `isLoggingOut` |
| Schemas Zod | 9 schemas em 8 arquivos (o `SalaProvaDialog` tem dois: criação e edição) |
| Auth | `useAuth.test.tsx` — hierarquia, `colaborador` paralelo, `rolesLoaded`, `signOut` |
| Registro de módulos | `lib/modulos.test.ts` — invariantes sobre `MODULOS` inteiro |
| Acessibilidade | `dialogos-acessibilidade.test.ts` — invariante estática sobre os 31 diálogos |
| A própria infra | `supabase-mock.test.ts` — o mock tem teste próprio; e `lib/edge-function-error.test.ts` |

> Os números acima vêm de **varredura**, não de memória: a lista de hooks já esteve errada duas vezes (dizia 8 quando eram 12).

### O que FALTA

**1. Comportamento de página — a maior lacuna.** A bateria de guards cobre **autorização**, não comportamento: nenhuma página tem teste de formulário, listagem ou ação. As candidatas de maior valor são as que concentram ação destrutiva ou dinheiro — `GerenciarColaboradoresProva` (alocação, base de pagamento) e `OcorrenciasProva`.

**2. Edge Functions — tema próprio, não continuação desta suíte.** São 8 mais `_shared/`, rodam em Deno e estão fora do alcance do Vitest como está montado; exige decisão de ferramenta (Deno test) antes de qualquer código. É onde vive a lógica mais sensível: anti-enumeração, rate limit, cooldown.

O que **existe** hoje é verificação manual da autorização de duas delas, em [`../docs/bateria-create-admin-autorizacao.md`](../docs/bateria-create-admin-autorizacao.md) (7 casos, 2026-07-25) — inclusive o script de forjar JWT local, que qualquer teste futuro de EF vai precisar, porque o dump traz hashes de produção e ninguém sabe as senhas.

**3. Anotado, não feito:** a matriz de guards usa 5 papéis e **não inclui `user` puro** (conta sem papel de gestão e sem `colaborador`). Seriam 19 combinações novas; vale se o `user` ganhar significado além de "vê o hub vazio".

**4. O que deliberadamente NÃO se testa aqui.** Constraints de banco: a suíte roda contra um **mock**, sem Postgres — um teste ali afirmaria o mock. A verificação correta é bateria SQL contra o banco local, feita em [`../docs/bateria-db-constraints.sql`](../docs/bateria-db-constraints.sql) (22 casos).

### O que as camadas fechadas renderam — e por que a ordem importou

**Testar diálogo de autorização ou de dinheiro rendeu mais achado que cobertura.** Foi o padrão de todas as etapas, e é o critério para escolher a próxima coisa a cobrir. O saldo de 2026-07-26: o **403 que bloqueava o superadmin** na concessão de coordenador, **valor de pagamento negativo** sem barreira em camada nenhuma, exclusão de valor **sem confirmação**, a **mensagem de erro da EF descartada**, o **CPF sem dígito verificador**, o aviso do cadastro público **invisível para leitor de tela**, e o **recorte por unidade** das ocorrências.

**A bateria de guards virou a especificação do `RequireAcesso`** e é o que tornou a centralização segura: ficou verde do começo ao fim, inclusive depois de os guards saírem das páginas. Foi **falsificada antes de ser aceita** — quebrar o guard do `Editais` derrubou exatamente "recusa colaborador" e "recusa coordenador".

**Três coisas que só apareceram ao escrever, e que valem para quem continuar:**

- **`useSalasProva` esconde regra de negócio numa mutation:** `número = andar × 100 + sequência`, calculada no cliente. Continua do **maior número daquele andar** — buraco de sala excluída não é reaproveitado. `⚠️ ATENÇÃO` no teto de **99 salas por andar**.
- **O teto de andar da sala só existe no cliente** — regra entre tabelas, deixada fora dos CHECKs de propósito. O `SalaProvaDialog` é a única barreira.
- **`cargo_editavel === false` trava o nome da função**, protegendo as duas funções de coordenação identificadas por UUID fixo.

**Efeito colateral na infra:** o mock ganhou `FunctionErrorLike` (erro de EF não é erro do PostgREST) e o `supabase-mock.test.ts` ganhou dois testes por isso.

### Dívida de contexto que a suíte carrega

- **Mudança de produção feita para viabilizar os testes:** os 9 schemas Zod passaram a ser `export`ados dos componentes (**8 arquivos**; só a palavra `export`). Custo aceito: os 8 entram nos avisos de `react-refresh/only-export-components` — que hoje somam **19 no repo**, a maioria pré-existente (`components/ui/*`, hooks e páginas que exportam constantes).
- **Baseline de lint do repo: 93 problemas (69 erros, 24 avisos)** por `npm run lint` — conferido em 2026-07-26. Se subir, é coisa nova. (Atenção: `npx eslint src` dá **90**; a diferença são arquivos fora de `src`.)
- **Enquanto não houver CI**, fechar tema inclui rodar à mão: `npm test`, `npx tsc --noEmit -p tsconfig.app.json` e `npm run build`.

### A automação ficou para o fim, por decisão

**O usuário decidiu em 2026-07-25 deixar o CI para o final.** Não é esquecimento — está registrado no item próprio abaixo ("Rodar a suíte de testes automaticamente"), que segue válido e continua sendo **o de maior alavancagem da lista**. A consequência de a decisão valer: **nada roda a suíte sozinho**, então cada tema fechado depende de alguém lembrar.

⚠️ **O custo dessa decisão cresceu.** Em 25/07 eram 376 testes; hoje são **743**, e as três camadas fechadas (hooks, diálogos, guards) só protegem quem as executa. O argumento original — "escrever mais teste rende menos até o CI existir" — agora aponta com mais força para o CI do que para a próxima camada de cobertura.

---

## ✅ CONCLUÍDO 2026-07-26 — a fabricação de alocação falsa foi apagada por inteiro

**Área:** Alocação e Funções / Autenticação. Registro mantido no backlog porque **deixou uma decisão de operação em aberto** (no fim desta seção) e porque a verificação não é automatizável.

### O que era

`coordenadores_prova.colaborador_prova_id` é `NOT NULL`. Para conceder acesso de coordenador a quem não estava alocado, o código pegava **um colaborador arbitrário** (`.limit(1)`, sem ordenação) e criava uma linha em `colaboradores_prova` — a tabela de alocação real, base de relatório e pagamento — sem função e sem valor. Dado inventado indistinguível do verdadeiro.

Havia **duas cópias**, e as duas caíram no mesmo dia:

1. `useUsers.addCoordenadorAccess`, junto com a concessão pela UI de `/gerenciar-usuarios` — o papel deixou o enum do `createUserSchema`, o campo "Prova do Coordenador" e o Switch da tabela sumiram. A coluna Coordenador virou **somente leitura**. Conceder e revogar são agora exclusivos do `CoordenadoresProvaDialog`, que exige alocação elegível.
2. `createCoordenadorAccess`, na EF `create-admin`, que roda com `service_role` fora da RLS. Saiu com o ramo que a chamava e com o `provaId` do corpo — que `useUsers.createUser` também não manda mais.

**Revogação conferida antes de remover o Switch:** o `deleteMutation` do `useCoordenadoresProva` apaga o vínculo e, se era o último, remove o papel — ninguém fica com papel irrevogável.

### ⚠️ A premissa que este item trazia estava errada — vale guardar

Este backlog afirmava que conceder o papel `coordenador` **sem** vínculo de prova era *inofensivo*, porque `is_coordenador_prova` lê `coordenadores_prova` e não `user_roles`. **É falso para o front:** o `RequireAcesso` deriva `isCoordenador` de `user_roles`, então quem recebesse só o papel **passaria pelos guards** das rotas de coordenação e entraria — para ver listas vazias, porque as consultas se apoiam na outra tabela. Meio-usuário: exatamente o que levou alguém a fabricar alocação para evitá-lo.

Por isso a EF **recusa** `role: "coordenador"` com **400** e mensagem apontando o fluxo da prova, em vez de aceitar e ignorar. E recusa explícita, não rebaixamento silencioso para `user`: cair no `else` do `validRoles` criaria a conta com papel errado sem sinal nenhum.

É a segunda vez que um item deste backlog carrega premissa errada sobre autorização — a primeira foi a proposta de os guards lerem papéis de `src/lib/modulos.ts`, que teria **afrouxado** o acesso. **Conferir a premissa no código antes de executar o item continua sendo obrigatório.**

### 🔴 Não há teste guardando isto — a verificação é manual

O teste `⚠️ DEFEITO` que acusava a fabricação vivia em `useUsers.test.tsx` e **saiu junto com o hook**; era a última marca dessas no repo. A EF roda em Deno, fora do alcance do Vitest. Ficou um aviso no lugar do bloco removido.

**Quem mexer na `create-admin` refaz esta verificação à mão** (foi assim que esta entrega foi conferida, contra o runtime local, com JWT de superadmin assinado com o `JWT_SECRET` do `supabase status`):

| Corpo | Esperado | Obtido em 26/07 |
|---|---|---|
| `role: "coordenador"` **com** `provaId` | 400, mensagem do fluxo da prova | ✅ |
| `role: "coordenador"` **sem** `provaId` | 400, mesma mensagem | ✅ |
| `role: "admin"` | 200, papel gravado | ✅ |
| sem `Authorization` | 401 (o portão de 25/07 segue de pé) | ✅ |

E as contagens de `colaboradores_prova` / `coordenadores_prova` **iguais antes e depois** (554 / 9 em 26/07). É essa **igualdade** que prova que nada foi fabricado — não o status HTTP, e não o número em si.

> ⚠️ **Medido de novo em 2026-07-30, depois de um `db reset`: 554 / 10.** As 10 linhas são todas de 2026-06-26, com e-mails reais do dump, e nenhuma foi criada pelos testes — não é resíduo. Não sei dizer se o `9` estava errado ou se o dump foi reexportado desde então, e **não vale investigar**: o que a verificação prova é a igualdade antes/depois, não o valor absoluto. Fica como exemplo da regra da casa — **contagem escrita envelhece; confira na hora**.

> Observação colhida na verificação, **não é defeito deste item**: a conta criada pela EF termina com **dois** papéis, `user` (do trigger `handle_new_user`) e o pedido. Comportamento antigo, sem efeito prático porque `has_role` é por papel — mas quem for contar papéis por usuário precisa saber.

### ⏭️ Decisão de operação que segue em aberto

**Criar um coordenador passou de 1 para 3 passos:** criar a conta → alocar na prova com função de coordenação → conceder no diálogo. É mais correto (não inventa alocação), mas é mais trabalho no dia da prova. **Vale confirmar na operação** — se não for aceitável, a saída mais honesta é tornar `coordenadores_prova.colaborador_prova_id` **nullable**, que era o conserto de modelagem descartado no começo, e não voltar a fabricar linha.

## ✅ CONCLUÍDO 2026-07-26 — as três regras que moravam só no cliente foram para o banco

**Área:** transversal (ver [`estrutura/transversais/invariantes.md`](./estrutura/transversais/invariantes.md), que traz o mapa e a lista de verificação)

A auditoria do padrão **"regra implementada só na camada que o usuário vê"** varreu as 19 tabelas e os hooks. As três lacunas achadas foram fechadas no mesmo dia, na ordem pedida.

### 1. Excluir colaborador com histórico — impossível (migration `20260726210000`)

As FKs para `colaboradores` eram CASCADE. **O agravante não era o PostgREST, era a UI:** o cliente checava alocação e não checava ocorrência, então quem tinha histórico sem alocação era excluído pela tela levando o histórico junto — **18 das 19 ocorrências** do banco estavam nessa situação.

`colaboradores_prova`, `ocorrencias_colaborador.colaborador_id` e `ocorrencias_colaborador.substituto_id` viraram **RESTRICT**. O `substituto_id` entrou de propósito: ser citado como substituto é histórico, e deixá-lo em `SET NULL` reproduziria o mesmo defeito em miniatura.

⚠️ **Exceção consciente:** `email_atualizacao_log` **continua CASCADE**. É log operacional de entrega, não histórico de participação, e bloquear por causa dele criaria beco sem saída — não há tela para limpá-lo, e `colaborador_id` é NOT NULL, então `SET NULL` não era opção. Custo medido: 4 colaboradores.

**O pré-check client-side foi removido**, não estendido: era "leio e então decido", uma corrida, e a mensagem do banco nomeia o obstáculo melhor do que ele conseguia. 553 dos 771 passaram a ser inexcluíveis.

### 2. Numeração de sala (migration `20260726220000`)

Índice único em `sala_prova (sala_fk_unidade, sala_numero)` e em `salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero)` — esta era a única tabela do schema com zero unique, zero check e zero trigger.

**O índice não conserta a corrida, torna-a visível:** a numeração continua sendo calculada no cliente (lê o maior, insere max+1), mas duas sessões simultâneas agora colidem com 23505 em vez de criarem duas salas 203. O tradutor cobre os dois caminhos com saídas diferentes — na criação, repetir resolve; na edição, é preciso escolher outro número.

### 3. Vincular/desvincular unidade (migration `20260726230000`)

Viraram as RPCs `vincular_unidade_a_prova` e `desvincular_unidade_da_prova`. **As duas operações tinham o defeito**, não só a de vincular: remover apagava as salas antes do vínculo, e falhar no fim deixava o mesmo estado corrompido — vínculo vivo, zero salas, indistinguível na tela de "unidade sem salas cadastradas".

`prova_id` **não é parâmetro** do desvincular: sai da própria linha, para o cliente não poder mandar um que não corresponde ao vínculo e apagar salas de outra prova.

### Como foram verificadas

Todas contra o banco real, com `ROLLBACK`, e **todas com controle positivo** — provar que passou a recusar é metade:

| Regra | Recusa | Controle positivo |
|---|---|---|
| Colaborador | alocação ✓, ocorrência ✓, substituto ✓ (caso construído, pois não existe isolado no dado) | sem histórico → `DELETE 1` |
| Sala | mesmo número na mesma unidade ✓ | mesmo número em **outra** unidade → passa |
| Unidade | — | 16 salas copiadas, e desvincular zera as duas tabelas |

A **atomicidade** da RPC foi provada sabotando a cópia com um `CHECK ... NOT VALID` (que só vale para linhas novas) e confirmando que o vínculo não sobra. Foi essa a falha exata que produzia o estado corrompido.

> **Seis testes caíram de propósito**, dois deles marcados `⚠️ ATENÇÃO` — eles *afirmavam* a não-atomicidade ("o vínculo fica sem as salas se a cópia falhar"). Eram a testemunha do defeito; viraram o oposto, garantindo que a RPC seja usada. A atomicidade em si não é testável no Vitest, porque o mock não tem transação.

---

## ✅ CONCLUÍDO 2026-07-26 — segunda e terceira rodadas da auditoria de invariantes

**Área:** transversal (ver [`estrutura/transversais/invariantes.md`](./estrutura/transversais/invariantes.md))

Depois de fechar as três primeiras lacunas, a auditoria foi refeita **sobre o schema inteiro** (a primeira só olhara as FKs das tabelas sob investigação) e depois estendida à **leitura**. Saldo:

| Decisão do usuário | Como ficou |
|---|---|
| **Prova não se exclui. Nem com senha.** | policy de DELETE removida **+** trigger `check_prova_nao_excluivel` (pega `service_role`, que passa por cima da RLS). Sumiu do hook, da página e do card |
| **Unidade só se exclui sem nenhum uso** | `RESTRICT` em `prova_unidades` e `salas_prova_distribuidas`; `sala_prova` segue CASCADE (as salas são parte da unidade) |
| **Desalocar quem tem coordenação: bloquear no banco** | `RESTRICT` em `coordenadores_prova.colaborador_prova_id`; pré-check removido |
| **Fiscal de sala: avisar, não bloquear** | aviso na confirmação de remoção, com o número da sala |
| **Recorte de leitura por RLS** | 4 tabelas saíram de `USING (true)` |

### ⏭️ O que ficou decidido em aberto

1. **Apertar as três tabelas de `USING (true)` para recorte por UNIDADE** (hoje são por prova). Exige antes decidir **se o coordenador deve registrar ocorrência de outra unidade da prova dele** — é decisão de operação, não de schema. Hoje `OcorrenciasProva` lê a prova inteira e a RLS de ocorrências é por prova; igualar sem essa decisão cria desencontro ou afrouxa.
2. **Prova criada por engano não tem como ser apagada.** Se incomodar na operação, a saída é um conceito de *arquivada/cancelada* — **não** reabrir o DELETE.

### 🔴 Nada disso tem teste automatizado

A suíte mocka o Supabase: não exercita RLS, constraint, trigger nem transação. Tudo foi verificado à mão contra o banco local, com `ROLLBACK` e **controle positivo** em cada caso. As consultas de auditoria e as tabelas de resultado esperado estão em [`estrutura/transversais/invariantes.md`](./estrutura/transversais/invariantes.md). **Quem mexer nessas regras refaz a verificação manualmente.**

---

## ✅ CONCLUÍDO 2026-07-29 — Cargos como entidade: o cargo do candidato deixou de ser texto sujo

**Status:** **as 6 etapas concluídas** (27 a 29/07). Roadmap arquivado em [`analises/concluidos/roadmap-cargos.yaml`](./analises/concluidos/roadmap-cargos.yaml); doc da feature em [`estrutura/modulos/candidatos/cargos.md`](./estrutura/modulos/candidatos/cargos.md). A etapa 7 (página `/cargos`) **não** é pendência — foi decidida como não planejada em D7.

✅ **Etapa 1 (schema):** migration `20260727210000` criou `cargos` e `cargo_apelidos`, acrescentou `candidatos.cargo_id` e os dois índices de apoio a FK. Verificada por [`../docs/bateria-cargos.sql`](../docs/bateria-cargos.sql), verde.

✅ **Etapa 2 (lib pura):** `cargosDaPlanilha`, `pareceSujo` e `aplicarResolucoes` em `candidatos-import.ts`, mais o tipo `CandidatoResolvido` — 22 testes novos.

✅ **Etapa 3 (hooks):** `useCargos.tsx` — catálogo, apelidos, criação e gravação — 26 testes. **Fecha a janela A.**

✅ **Etapa 4 (a tela):** o assistente passou de 4 para 5 passos, com o passo **Cargos** entre pareamento e importação — associação, criação inline partindo do texto sujo, memória de apelidos com selo "lembrado", e o cargo virou **obrigatório** (D4 + D9). 20 testes novos. **Fecha a janela B.**

✅ **Etapa 5 (a chave):** migration `20260728100000` — a chave natural trocou `cargo_chave` por `cargo_id` e a coluna gerada foi dropada (D3). **Renomear um cargo deixou de duplicar candidato**, verificado pelo PostgREST. O dedup mudou de lugar no pipeline, e a ordem agora é garantida pelo TypeScript, não por disciplina.

✅ **Etapa 5b (a guarda):** migration `20260728110000` — trigger `candidatos_recusa_reapontar_cargo` (SQLSTATE `RC001`). A etapa 5 **inverteu qual erro é fatal**: o perigo deixou de ser a origem mudar a grafia e passou a ser o usuário **reapontar** um texto já importado para outro cargo, o que criaria linhas novas e deixaria as antigas órfãs em silêncio. A guarda fica em `candidatos`, **não** em `cargo_apelidos`.

✅ **Etapa 6 (a exibição):** a lista e a ficha passaram a mostrar o **nome canônico** do catálogo (join à esquerda embutido no select da listagem), a ficha ganhou o texto da planilha como procedência — só quando difere —, e o cabeçalho ganhou um **filtro por cargo** recortado no servidor. 15 testes novos (suíte em 965). Verificado pelo PostgREST, inclusive o controle negativo que mostra `cargos!inner` sumindo com o inscrito de `cargo_id` nulo.

🔴 **A etapa 6 achou e corrigiu um defeito preexistente:** a confirmação de **"limpar edital"** — a que pede senha — anunciava o `count` da consulta **filtrada** numa ação que apaga o edital inteiro. Com uma busca ligada, prometia remover 12 inscritos e removia 7.416. Passou a usar a contagem da RPC, e a visibilidade do botão também. ⚠️ **A regra que fica:** ao acrescentar filtro a uma tela, revise toda ação que age sobre o conjunto inteiro.


**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md))

Os cargos chegam sujos da origem: **7 dos 9** trazem `¿`, um travessão mal decodificado (em dash cp1252 lido como latin-1). Como o cargo compõe a **identidade** do candidato, corrigir o texto e reimportar **cria registro novo em vez de atualizar** — é o problema que abriu a revisão da chave natural, e que a inclusão do CPF nela **não** resolveu.

**O desenho:** tabelas `cargos` (catálogo canônico) e `cargo_apelidos` (memória de "texto sujo → cargo"), mais um **passo novo no assistente de importação, entre o pareamento e a importação**, onde o usuário associa cada cargo lido a um existente ou cria um novo redigitando o nome. Depois, a chave natural troca `cargo_chave` por `cargo_id` — e renomear cargo passa a ser inofensivo.

**Medido antes de desenhar:** 9 cargos distintos em 7.416 linhas; normalizar por caixa e espaço **não colapsa nenhum** (9 → 9), ou seja, não existe limpeza automática que resolva. E `ARTE` (195 linhas) foge do padrão dos outros sete — só o usuário sabe se é `DOCENTE I — ARTE` ou outro cargo.

**Decidido pelo usuário em 2026-07-27**, e são as duas escolhas que moldam o resto:

- **D1 — catálogo GLOBAL.** `cargos` e `cargo_apelidos` não têm `edital_id`; o apelido aprendido numa importação vale para todas as seguintes, de qualquer edital. É o que faz o passo novo virar conferência a partir da segunda vez.
- **D4 — pareamento OBRIGATÓRIO.** `cargo` passa a `obrigatorio: true` em `CAMPOS_CANDIDATO`, e o passo novo só libera a importação com todos os cargos resolvidos. Planilha sem coluna de cargo deixa de ser importável — pretendido, porque com `cargo_id` na chave deixá-la vazia ressuscita a perda dos 396 inscritos. A saída alternativa (um cargo `(não informado)` no catálogo) fica **descartada**, registrada no roadmap caso a operação venha a precisar.

---

## ❌ RETIRADO 2026-07-28 — o auto-pareamento estava CERTO; a leitura da planilha é que estava errada

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md))

O item aberto em 27/07 dizia que `autoMapear` casava `N_INSCRICAO` com "o contador de linha do export" e mandava, enquanto não houvesse conserto, **conferir à mão que "Nº de Inscrição" aponta para a coluna `ID`**.

🔴 **Aquela instrução fazia a coisa errada, e é por isso que o item fica registrado em vez de sumir.** Informado pelo usuário e remedido em 28/07 contra o arquivo real:

| Coluna | Distintos em 7.416 linhas | O que é |
|---|---|---|
| `N_INSCRICAO` (coluna 0) | **7.416** | **a inscrição** — uma por linha |
| `ID` | 7.020 | **a pessoa** no sistema de origem |
| `CPF` | 7.020 | bate exatamente com o `ID` |

Os 382 `ID` repetidos têm todos o mesmo CPF e todos cargos distintos: `ID` é a pessoa, `N_INSCRICAO` é a inscrição — uma por pessoa-por-cargo. Seguir a instrução antiga gravaria o **identificador da pessoa** no campo de inscrição, repetido em até 4 linhas.

**Nada a fazer no código:** `autoMapear` já casa `N_INSCRICAO` corretamente, e é o comportamento desejado. As três "saídas" propostas no item antigo (tirar o sinônimo, desempatar por conteúdo, avisar na tela) estão **todas descartadas** — resolveriam um problema que não existe, e a saída 2 (recusar coluna que seja `1..N`) recusaria justamente a coluna certa.

⚠️ **O que a correção deixou em aberto está no módulo, não aqui:** a justificativa de o cargo estar na chave natural caiu junto (a inscrição não se repete, então `(edital, n_inscricao)` já seria único). A chave em vigor continua correta — ver a seção "CORREÇÃO DE 2026-07-28" em [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md), com as duas decisões que ela abre.

---

## ✅ CONCLUÍDO 2026-07-27 — a chave natural de `candidatos` passou a incluir o CPF

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md)). Registro mantido porque **deixou consequências em aberto** (no fim) e porque a verificação não é automatizável.

**Decisão do usuário:** a chave passa de `(edital_id, n_inscricao, cargo_chave)` para **`(edital_id, cpf, cargo_chave, n_inscricao)`** — migration `20260727200000`, índice `candidatos_cpf_cargo_inscricao_key`.

⚠️ **A chave mudou DE NOVO em 2026-07-28**, e este registro é histórico: `cargo_chave` deu lugar a `cargo_id`. A chave em vigor é **`(edital_id, cpf, cargo_id, n_inscricao)`**, índice `candidatos_cpf_cargo_id_inscricao_key`. Tudo que segue sobre o CPF e o `NULLS NOT DISTINCT` continua valendo.

### Medido antes, contra o arquivo real (regra 5 de invariantes)

| Chave | Grupos distintos em 7.416 linhas |
|---|---|
| `(n_inscricao, cargo)` — antiga | 7.416 |
| `(cpf, cargo, n_inscricao)` — nova | 7.416 |

**Ninguém se perde, e não podia perder:** a chave nova **contém** a antiga, e acrescentar coluna a uma chave única só separa linhas, nunca as funde. ⚠️ **Não confundir com a proposta recusada em 27/07**, que era *trocar* `cargo_chave` **por** `cpf` — essa sim colapsaria 396 inscritos em silêncio.

### ⚠️ `NULLS NOT DISTINCT` é a parte que não pode ser removida

2 das 7.416 linhas têm CPF impossível (`8631309761`, 10 dígitos; `1O778817709`, letra O) e o importador grava `NULL`. No padrão do Postgres dois `NULL` são **distintos**, então essas linhas se inseririam de novo **a cada reimportação**, multiplicando em silêncio. O índice é `NULLS NOT DISTINCT` por causa disso, e `chaveNatural()` espelha o mesmo com `cpf ?? ''`.

O CPF **não ganhou coluna gerada** como o cargo, e a assimetria é deliberada: o cargo precisa de coluna porque precisa de *normalização* e o PostgREST não sabe nomear expressão; o CPF já é forçado a 11 dígitos pela CHECK, então uma `cpf_chave` seria cópia inútil.

### Verificado à mão, contra o banco local (a suíte mocka o Supabase)

Via PostgREST, que é o caminho real — o teste do Vitest só afirma a string do `onConflict`:

| Caso | Esperado | Obtido |
|---|---|---|
| Importar 3 linhas, reimportar 2× | 3, 3, 3 | ✅ |
| Linha **sem CPF** após 3 reimportações | 1 | ✅ |
| **Controle positivo:** reimportar com nome novo | atualiza | ✅ |
| Mesma inscrição+cargo, CPF diferente | linha nova (4) | ✅ |

O terceiro caso é o que prova que o índice está sendo *inferido* pelo PostgREST — sem isso, "não duplicou" poderia ser só o insert falhando.

### ⏭️ O que a decisão deixou em aberto

1. **Corrigir CPF na planilha agora cria registro novo**, em vez de atualizar — o mesmo defeito que o texto do cargo já tinha, agora em três campos. As duas saídas desenhadas em 27/07 seguem sem implementação: **modelo** (cargo em tabela filha, candidato único por inscrição) ou **reconciliação** (ao fim da importação, listar quem está no banco e não veio no arquivo). A reconciliação resolve o sintoma para os três campos de uma vez.
2. **Afrouxamento aceito:** duas linhas com a mesma inscrição e o mesmo cargo passam a coexistir se tiverem CPF diferente. Não ocorre no arquivo medido.
3. ~~**A instabilidade do texto do cargo continua**~~ — **RESOLVIDO em 2026-07-28** pela etapa 5 do tema Cargos: a chave trocou `cargo_chave` por `cargo_id` (migration `20260728100000`) e o texto saiu da identidade. Renomear cargo virou um `UPDATE` numa linha.

---

## O cadastro público não valida o CPF antes de consultar o banco

**Status:** pendente — **achado na auditoria de `analises/`** em 2026-07-26
**Área:** Colaboradores (ver [`estrutura/modulos/aplicacao-provas/colaboradores.md`](./estrutura/modulos/aplicacao-provas/colaboradores.md))

`/cadastro-publico` pede o CPF, apenas tira o que não é dígito (`CadastroPublico.tsx:35`) e já chama a EF `check-cpf-colaborador`. Desde 2026-07-26 existe `cpfValido` (`src/lib/cpf.ts`), usado pelo `ColaboradorDialog` e pelo `CadastroLote` — **esta porta ficou de fora**, e é a única aberta ao público.

Validar antes da consulta poupa uma ida ao servidor, dá mensagem melhor ("confira os dígitos" em vez de "não encontrado") e reduz superfície de sondagem, já que a EF responde se o CPF existe.

⚠️ **Armadilha ao implementar:** aquele arquivo já tem um **estado** chamado `cpfValido` (`CadastroPublico.tsx:26`), que guarda o CPF em string. Importar a função de mesmo nome colide. Renomeie o estado (`cpfConferido`, por exemplo) — não a função, que já está em uso em dois lugares.

---

## ❌ FORA DO BACKLOG 2026-07-26 — os CPFs inválidos são trabalho do coordenador

**Decisão do usuário:** o coordenador resolve. Não é trabalho de código e não fica na fila de implementação.

Dos **771** CPFs cadastrados, **16** não passam na validação de dígito verificador (14 com DV errado, 2 formados por dígitos repetidos) — medido em 2026-07-26. Não dá para corrigir por algoritmo: CPF errado é o CPF de outra pessoa.

**O que continua valendo, e é a razão de esta nota existir:**

- O cliente valida (`src/lib/cpf.ts`, usado por `ColaboradorDialog` e `CadastroLote`), mas **de propósito só quando o CPF é novo ou alterado**. Validar sempre travaria a edição desses cadastros, impedindo corrigir telefone ou e-mail deles no dia da prova. **É decisão registrada — não "conserte" isso achando que é esquecimento.**
- **Um CHECK de DV no banco depende do saneamento acontecer primeiro**, senão a migration falha na carga. Enquanto os 16 existirem, esse CHECK não é possível — e a correção teria de morar no **dump**, não no `seed.pos.sql`, que roda depois das migrations.

## ✅ CONCLUÍDO 2026-07-26 — a meta órfã deixou de ser possível

**Área:** Alocação e Funções (ver [`estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md`](./estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md))

Apagar o valor de pagamento de uma função fazia a linha de `meta_colaboradores_unidade` ficar órfã — invisível no diálogo (que só lista função com valor) e ainda **contando no card da prova** como gente faltando, sem que ninguém conseguisse zerá-la.

Migration `20260726200000`: trigger **`check_valor_sem_meta`** recusa remover o valor enquanto houver **meta > 0** daquela função na prova. É trigger e não FK porque a meta é por unidade e o valor é por prova — a dependência cruza um nível.

**Decisão do usuário:** bloquear, não zerar as metas junto. Zerar seria um clique só, mas perderia em silêncio o número planejado.

**A ressalva deste item — "apagar meta órfã é decisão de produto, pode ser histórico legítimo" — ficou sem objeto:** a medição mostrou **0 órfãs** em 186 metas. A dívida era inteiramente preventiva; não houve o que sanear e nenhuma decisão sobre histórico precisou ser tomada.

**Verificado com `db reset` + DELETE real em transação:** valor cuja função tinha 7 metas > 0 → recusado com a mensagem; e o **controle positivo**, um valor cuja função tinha **8 linhas de meta, todas zero** → `DELETE 1`. É esse segundo caso que prova a semântica `> 0` — bloquear pela existência da linha criaria impasse, já que o diálogo não apaga linha, só zera.

> **Corrigido junto, e é dívida de outra classe:** `deleteValor` descartava a mensagem do banco e mostrava "Erro ao remover valor" para qualquer falha. Segunda ocorrência do padrão (a primeira foi a mensagem da Edge Function). **A regra que fica: mensagem vinda do banco ou de EF passa adiante; texto próprio é fallback.**

## ✅ CONCLUÍDO 2026-07-26 — excluir função em uso passou a ser recusado pelo banco

**Área:** Alocação e Funções (ver [`estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md`](./estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md))

As três FKs que apontavam para `funcoes_colaboradores` eram destrutivas — `SET NULL` em `colaboradores_prova`, `CASCADE` em `meta_colaboradores_unidade` e `valores_funcao_prova`. Excluir uma função em uso não dava erro: apagava registro financeiro de várias provas em silêncio. Só o cliente protegia, e uma chamada direta ao PostgREST passava reto.

Migration `20260726190000_funcoes_colaboradores_on_delete_restrict.sql`: as três viraram **`ON DELETE RESTRICT`**. O `23503` chega à UI traduzido por `mensagemErroExclusaoFuncao`, que **nomeia qual uso bloqueia** (alocação, meta ou valor), porque as três pedem providências diferentes.

**Decisão do usuário (26/07):** `RESTRICT`, **não** soft delete. A dúvida registrada aqui era se o `SET NULL` seria deliberado, para aposentar função sem travar em histórico; **não existe função aposentada** — o bloqueio que a UI já fazia é o comportamento correto, e a migration só o move para onde não pode ser contornado.

**Medido antes de apertar:** 0 de 554 linhas de `colaboradores_prova` com `funcao_id` nulo — o `SET NULL` nunca disparou em produção. Nenhum saneamento foi necessário.

**Verificado com `db reset` + DELETE real em transação:** função editável com alocação → recusa citando `colaboradores_prova`; editável só com meta e valor → recusa citando `meta_colaboradores_unidade`; e o **controle positivo** — função editável sem uso nenhum → `DELETE 1`. Excluir continua possível quando deve ser.

> **Achado de brinde, agora documentado:** existe uma segunda barreira mais antiga no banco, o trigger `check_system_funcao_changes`, que recusa excluir/renomear/tornar editável as funções com `cargo_editavel = false`. Ele **dispara antes** da checagem de FK — tentar excluir função do sistema levanta `P0001`, não `23503`. Não estava em doc nenhuma.

## ✅ CONCLUÍDO 2026-07-30 — os `useEffect` do `GerenciarColaboradoresProva` saíram do jeito cru

**Área:** Alocação e Funções

A página chamava `supabase...then()` **cru** e fazia `setState` no `.then`, em vez de usar React Query como o resto do repo. Estado que aterrissa fora do ciclo do React Query não participa de cache, invalidação nem `isLoading` — a tela pode mostrar dado velho sem ninguém perceber.

**Os TRÊS foram convertidos**, em dois momentos: `fetchProvaUnidadeInfo` (virou a query `prova_unidade_info`, com o `refetch` reaproveitando o nome antigo, então os dois pontos de chamada não mudaram) e `isCoordDestaProva` em 29/07; o `setUserName` em 30/07.

**Verificado pelo critério certo, e agora medido:** `npx vitest run src/pages/guards.test.tsx` não cita mais `not wrapped in act` — **de 3 para 0**, e **0 na suíte inteira** (974 testes).

### 🔴 A premissa deste item estava errada — é o que vale guardar

O item se chamava **"Dois `useEffect`"** e prometia que converter os dois faria os 3 avisos sumirem: *"é o sinal de que deu certo"*. **Eram TRÊS**, e os dois convertidos primeiro **não eram a fonte do barulho** — medido em 30/07, depois da primeira conversão, os 3 avisos continuavam intactos. Quem os produzia era justamente o terceiro, que o item nunca contou.

**A lição:** o item mediu o **sintoma** (3 avisos) e presumiu a **causa** (2 efeitos) sem cruzar os dois. É a **terceira vez** que um item deste backlog carrega premissa errada — as anteriores foram a proposta de os guards lerem papéis de `modulos.ts` (que teria **afrouxado** o acesso) e a de que papel `coordenador` sem vínculo era inofensivo. **Conferir a premissa no código antes de executar o item continua sendo obrigatório.**

### ⚠️ O terceiro tinha uma regra que os outros dois não tinham

Os dois primeiros passaram a **propagar erro** (`if (error) throw error`) — inclusive corrigindo, no `prova_unidade_info`, um `error` que sequer era desestruturado e sumia em silêncio.

O do `setUserName` faz o **oposto, de propósito**: engole a falha e devolve `user.email` como nome. `userName` habilita o **lock de edição exclusiva** da unidade; deixar a falha virar estado de erro manteria o lock **desligado**, e a unidade ficaria sem proteção contra dois coordenadores editando ao mesmo tempo. O `try/catch` cobre os dois modos de falha que o `.then(ok, erro)` antigo tratava junto — o erro do PostgREST (que volta em `error`, sem rejeitar) e a rejeição de rede —, e devolver em vez de relançar evita o retry do React Query, que atrasaria o lock sem melhorar nada.

**O `enabled` do lock passou a olhar `isSuccess`** em vez de `!!userName`: diz "o nome foi resolvido", que é a condição de verdade, em vez de inferi-la de a string não estar vazia.

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

✅ **Existe agora um precedente a copiar:** `cargos` e `cargo_apelidos` (migration `20260727210000`) são as **primeiras tabelas do repo a nascer com grants enxutos** — `REVOKE ALL ... FROM anon` e `REVOKE TRUNCATE, REFERENCES, TRIGGER ... FROM authenticated`, na própria migration de criação. Medido: `anon` com **zero** privilégios nelas e TRUNCATE recusado, enquanto `candidatos` segue com os sete. Quem for executar este item tem o padrão pronto e a bateria (`docs/bateria-cargos.sql`, caso 2) mostrando como provar que a revogação pegou.

O trabalho: varrer `information_schema.role_table_grants` por `grantee IN ('anon','authenticated')` e **revogar o que não se justifica** — no mínimo `TRUNCATE`, `REFERENCES`, `TRIGGER` de `anon` em toda tabela; possivelmente reduzir `anon` a só o que os fluxos públicos realmente usam (que hoje passam por Edge Functions com `service_role`, não pela anon key direta). É sistêmico (não só `colaboradores`), então merece um passo próprio e um `db reset` de validação. **Atenção:** casa com a migration `20260712010000_grant_api_roles_table_privileges.sql`, que registrou os grants que faltavam em migration e ajustou `ALTER DEFAULT PRIVILEGES` — o enxugamento tem que conversar com ela, não brigar.

---


🔴 **A aposta subiu em 2026-07-27, com o módulo Candidatos.** A tabela `candidatos` nasce herdando os mesmos grants — verificado: `anon` tem `TRUNCATE` nela, e **`TRUNCATE` não passa por RLS**; um `TRUNCATE candidatos` como `anon` funciona no banco local. O que segura é o PostgREST não expor TRUNCATE, ou seja, um detalhe de implementação de terceiro.

A diferença é o conteúdo: as outras tabelas guardam dado operacional, esta guarda **CPF, e-mail, telefone e endereço de milhares de cidadãos**. **Ao executar este item, comece por `candidatos`** — e note que o `ALTER DEFAULT PRIVILEGES` continuará dando esses grants a **toda tabela nova**, então o conserto tem de mexer nele também, não só revogar tabela a tabela.
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

## ❌ DESCARTADO 2026-07-26 — exposição da `send-email` no projeto v1

**Decisão do usuário:** não é problema, porque **não há sistema no ar**.

Registro do que era, para quem reabrir: em 2026-07-20 descobriu-se que a `send-email` não checava quem a chamava — o `verify_jwt` exige um JWT, mas a anon key é um JWT válido e público. **Corrigido no código deste repo** (passou a exigir `service_role`); a dúvida que restava era se o projeto Supabase **v1** ainda teria a versão vulnerável publicada.

⚠️ **A premissa que fica anotada, não contestada:** uma Edge Function responde pela URL do projeto **independentemente de o frontend estar no ar**. Ou seja, "sistema fora do ar" e "endpoint inalcançável" não são a mesma coisa — o que fecha o assunto de fato é o projeto v1 **não existir mais** ou não ter a function publicada. Se algum dia se confirmar que o projeto v1 segue ativo, isto volta a valer, incluindo checar o volume de envio da conta SMTP.

---

## ✅ CONCLUÍDO 2026-07-30 — dado inválido do candidato passou a ENTRAR como veio

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md))

**Decisão do usuário:** *"Candidato com dados considerado inválido. Candidato e dados entram. Candidato e dados são citados no relatório."*

Até 29/07 o campo secundário impossível virava `NULL`: o inscrito entrava, mas **o que a origem afirmou sumia** — e ninguém depois conseguia saber o que a pessoa tinha digitado para corrigir na fonte. Agora o valor é gravado como veio, e o relatório continua igual em forma e lugar.

Migration `20260730100000`: as quatro CHECKs de formato (`cpf`, `cep`, `email`, `raca`) saíram, e `raca` (`smallint`) e `data_nascimento` (`date`) viraram `text` — nesses dois não havia CHECK a remover, o valor cru **fisicamente não cabia no tipo**.

### 🔴 O que esta decisão custou, dito por extenso

**A garantia de formato caiu para TODO caminho de escrita**, não só para o importador: PostgREST direto, Edge Function e script passam a poder gravar CPF, CEP, e-mail e raça em qualquer forma. Isto foi levantado como **risco alto antes da decisão** e escolhido assim mesmo, com o risco à vista.

**A consequência prática para quem for escrever regra nova:** `candidatos` deixou de ter opinião sobre o formato desses quatro campos. Quem precisar de CPF válido **valida na leitura** — não dá mais para presumir, como dava até 29/07, que o que está na coluna passou por uma CHECK. As duas CHECKs de **identidade** (`n_inscricao`, `nome`) seguem de pé, e a classe "erro" da importação não mudou: inscrição, nome e cargo vazios continuam descartando a linha.

**O que se perde com `data_nascimento` text:** ordenação e comparação por data no banco. Hoje ninguém faz nenhuma das duas (`useCandidatos` ordena só por `nome`), então o custo é futuro. Quem for construir filtro por faixa etária vai precisar de `to_date(...)` com o dado sujo dentro.

### 🔴 A mudança corrigiu um defeito que ninguém tinha visto

Os 2 CPFs impossíveis do arquivo real são **valores distintos** (`8631309761` e `1O778817709`). Com os dois virando `NULL`, a chave natural ficava idêntica e o `deduplicar()` **fundia os dois inscritos num só** — um sumia da lista, que é exatamente o erro que a regra de aviso existe para evitar. **Havia um teste afirmando essa fusão como correta.** Verificado contra o PostgREST em 30/07: agora são duas linhas.

⚠️ **Uma regressão silenciosa saiu junto:** a guarda antiga do CPF lia `soDigitos`, que devolve `null` quando não sobra dígito — então `'abc'` era anulado **sem aviso**. Perda calada dentro da regra criada para não perder calado.

⚠️ **O `NULLS NOT DISTINCT` não perdeu a razão de existir, mudou de dono:** guarda agora a célula **vazia**, não a impossível. **Vazio ≠ impossível.**

### Segunda leva, mesmo dia: três regras novas de campo

Todas **aviso**, nenhuma descarta linha, todas medidas no arquivo real antes de existir:

| Regra | Atinge | O que pega |
|---|---|---|
| Nome com caractere estranho | **10** de 7.416 | `SALVAD0` (zero por O), `SANT¿ ANA` (mojibake), `VITO&#769;RIA` (entidade HTML), `D\'AVILA` (**escape vazado da exportação**, 3×), ID concatenado, `}` |
| Nome de uma palavra só | **10** de 7.416 | `TESTEPAULO` ×3 e um `A` — **registro de teste na lista de inscritos** |
| Nome com palavra de mock | **3** de 7.416 | `TESTEPAULO`. `PALAVRAS_DE_MOCK` = `teste`, `test`; **substring**, case-insensitive |
| Hora de nascimento irreconhecível | **2** de 3.089 | `'88888888'` e `'Não sei'` — migration `20260730110000` (`time` → `text`) |

⚠️ **Aceitos no nome: letra COM ACENTO, espaço, apóstrofo, hífen e ponto.** 1.527 nomes têm acento e acusá-los faria a regra virar ruído; o ponto saiu por decisão do usuário (abreviação é nome bem escrito), o que levou a regra de 16 para 10 linhas. Há **controle negativo** guardando os dois.

⚠️ **A busca de mock é por SUBSTRING** (é o que pega `TESTEPAULO`, uma palavra só). Falso positivo conhecido e aceito: **`TESTA`, sobrenome legítimo** — 0 no arquivo real. O risco é real e o campo e-mail prova (`soumatestemunhadodeusvivente@` traz "testemunha"). 🔴 **Medir antes de acrescentar palavra à lista.** Hoje a regra não acrescenta linha nenhuma ao relatório — existe pelo caso que as outras não pegam (`TESTE DA SILVA`).

🔴 **A hora era o buraco maior:** único campo secundário que anulava **sem sequer avisar** — não havia `avisos.push` para ela. Segunda ocorrência do padrão "perda silenciosa" no mesmo dia.

⚠️ **Hora de nascimento é critério LEGAL de desempate em concurso.** Com a coluna em `text`, desempate por SQL vai exigir conversão com o dado sujo dentro.

### Como foi verificado

Suíte em **974** (eram 965), `tsc` limpo, `build` limpo, `db reset` com as 101 migrations. Mais bateria SQL contra o banco local, em transação com `ROLLBACK` e **dois controles positivos** — porque provar que passou a aceitar é metade:

| Caso | Esperado | Obtido |
|---|---|---|
| `cpf`/`email`/`cep`/`raca`/`data_nascimento` impossíveis | entram crus | ✅ |
| Dois CPFs impossíveis diferentes | **duas** linhas | ✅ |
| **CP1:** `nome` em branco | ainda recusado | ✅ |
| **CP2:** reimportar o CPF cru | **atualiza**, não multiplica | ✅ |

O **CP2 é o que sustenta o resto**: prova que a idempotência do upsert sobreviveu, porque o valor cru é determinístico e a chave natural volta a casar na reimportação.

---

## ✅ CONCLUÍDO 2026-07-30 — o registro órfão deixou de ser possível: importar virou TROCA TOTAL

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md)). Roadmap arquivado em [`analises/concluidos/roadmap-importacao-troca-total.yaml`](./analises/concluidos/roadmap-importacao-troca-total.yaml).

### O que era

A chave natural é `(edital_id, cpf, cargo_id, n_inscricao)`. Como CPF, cargo e inscrição **compunham a identidade**, corrigir qualquer um deles na planilha e reimportar fazia o upsert **não casar** a linha: entrava um registro NOVO e o antigo **ficava lá, órfão**. Sem aviso. É o formato de erro que este repo chama de o pior — **parece ter funcionado**.

### A decisão do usuário

**Importar passa a APAGAR a lista do edital e reinserir a planilha inteira**, numa transação só. Ele escolheu isto sobre a alternativa que eu recomendei (upsert + exclusão do resíduo), com os trade-offs à vista. As duas premissas que autorizam: *"sempre planilhas inteiras, nunca de adição"* e *"corrigimos tudo na origem"*.

Resolve os **três** campos de uma vez — coisa que nem trocar a chave natural nem o `RC001` alcançavam.

### 🔴 A medição que mudou a FORMA da solução

O desenho óbvio era um RPC recebendo tudo em JSON. **Não cabe:** 5,40 MB para 7.416 inscritos (5,11 MB omitindo nulos — economiza 5%) contra o limite de 5 MB do Kong, e pior com editais maiores.

Por isso os blocos continuam, mas sobem para uma **tabela de preparo**, e **uma** chamada à RPC faz `DELETE` + `INSERT` no servidor. Delete total + insert total, atômico, sem teto: o bloco não cresce com o edital, só o número de requisições (50.000 inscritos = 50 requisições de 0,89 MB).

### As três guardas do banco, e por que cada uma existe

| Código | Recusa | Por que é silencioso sem ela |
|---|---|---|
| `IM001` | lote vazio ou já consumido | o `DELETE` roda, o `INSERT` não insere ninguém, **e não há erro** |
| `IM002` | preparo com edital divergente | apagaria a lista de A e poria a de B no lugar |
| `IM003` | contagem ≠ total declarado | **preparo incompleto**: apagaria 7.416 e inseriria 6.000, dizendo sucesso |

🔴 **A `IM003` nasceu de uma pergunta do usuário.** Eu tinha posto essa conferência no *cliente*, e ele perguntou se dava para fatiar em mil "entregando ao fim o total" — o que expôs que aquilo era **convenção, não regra**: não valeria para PostgREST, script nem chamada manual. A guarda foi para o banco.

### ⚠️ A inversão que precisa sobreviver a qualquer refatoração

Antes, um bloco falho deixava a importação **pela metade** e reimportar consertava. Agora deixa a lista **INTACTA**. É melhor, mas é diferente — o relatório abre com *"A lista NÃO foi alterada"*, porque sem isso o usuário assume o pior e vai conferir milhares de linhas à mão.

### O que a decisão custou, dito por extenso

- **`created_at` e `created_by` de todos os inscritos são reescritos a cada importação.** A data de entrada de cada pessoa passa a ser a do último reimport. Não tem mitigação dentro deste desenho; foi aceito ao escolhê-lo.
- **A proteção contra arquivo truncado é mais fraca** que a da alternativa recusada, que sabia dizer *quem* sumiria. Aqui o usuário compara os dois números na confirmação e decide.
- 🔴 **Se `candidatos` um dia guardar algo que a planilha não sabe** (nota, alocação de sala, presença), a troca total passa a **destruir esse dado a cada importação**, e o tema tem de ser reaberto ANTES da feature nova. Hoje há **0 FKs** apontando para `candidatos` — é o que torna isto seguro agora.

### O `RC001` saiu junto, e o acoplamento fica registrado

O trigger existia porque o upsert casava linha pela chave. Com o `DELETE` rodando antes do `INSERT`, ele não tinha mais o que encontrar — **guarda que não pode disparar**. ⚠️ **Se a importação voltar ao upsert, o trigger tem de voltar junto.**

### Como foi verificado

Bateria própria em [`../docs/bateria-troca-total-candidatos.sql`](../docs/bateria-troca-total-candidatos.sql), **10 casos**, mais os três casos reescritos de `bateria-cargos.sql`. Suíte em **978**, `tsc`, `build` e lint (110, = baseline) limpos.

⚠️ **A prova de ATOMICIDADE roda FORA de transação, de propósito** — dentro de um `BEGIN` o erro aborta o bloco, e o que se mediria depois do `ROLLBACK` seria o efeito **dele**, não o da função: o caso provaria a si mesmo. Vale para qualquer bateria futura que precise observar estado **após** um erro.

**Verificado pelo PostgREST, e é o item que fecha o tema:** com o CPF corrigido na origem, 2 linhas entram e 2 ficam. No upsert ficariam 3.

---

## Pendências menores da importação de candidatos

**Status:** registradas para adiante — nenhuma bloqueia nada hoje
**Área:** Candidatos

1. **O fixture `CABECALHO_REAL` de `candidatos-import.test.ts` é o cabeçalho anterior a 27/07** (coluna 0 sem título). Com o arquivo atual, `autoMapear` casaria a coluna 0, que é **o certo**. Mexe em 3 asserções, e o caso "coluna sem título" precisa de fixture próprio. Barato, e é dívida de **teste**, não de código.

2. **Alargar o trigger da 5b**, tirando a comparação de texto, fecharia o buraco registrado como "irredutível" — ⚠️ mas o **CONTROLE POSITIVO 1** da bateria de cargos quebra e precisa ser **reescrito** com inscrições diferentes. **Fica sem sentido se a chave mudar**, então decidir a chave ANTES de investir no trigger.

3. **`anon` continua com `TRUNCATE` em `candidatos`**, e `TRUNCATE` **não passa por RLS**. Não é da importação, mas é da mesma tabela — tem item próprio acima ("Enxugar os grants de tabela"), com a nota de **começar por `candidatos`**.

---

## Temas de infraestrutura — futuro distante

**Status:** anotados, sem desenho e sem ordem definida. Nenhum tem dono nem medição ainda.

- Rate Limiting
- Caching & CDN
- Load Balancing & Scaling
- Error Tracking & Logs
- Availability & Recovery

---

## 📋 Nota de manutenção deste arquivo — decisão pendente do usuário

O cabeçalho manda **remover item concluído** ("o histórico do que foi feito vive na documentação em `estrutura/`"), mas o arquivo já acumulou **8 blocos ✅ CONCLUÍDO**. Registro de sessões anteriores não é apagado por conta própria — **é decisão do usuário** se o cabeçalho muda ou se os blocos migram para `estrutura/`.
