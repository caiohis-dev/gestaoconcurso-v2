# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. **Item concluído sai daqui** — o registro completo dele (o que foi medido, a premissa errada, o que a decisão custou) vai para [`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md), e fica só uma linha na tabela abaixo. O que o sistema **é** vive em [`estrutura/`](./estrutura/).

> **Última auditoria contra o código: 2026-07-26**, com correções pontuais depois. Cada item foi conferido no código e no banco local; o que estava desatualizado está marcado no próprio item.
>
> ⚠️ **Números envelhecem — confira na hora.** Este bloco já trazia dois errados: dizia **95 migrations** (são **106** em 31/07) e **`anon` ainda com `TRUNCATE` em 23 tabelas**, o que **deixou de valer** na mesma data — `anon` não tem privilégio nenhum em `public`. Seguem medidos e válidos: **771 colaboradores** (565 com chave PIX, **0** com `tipo_chave_pix`) e as três FKs de `funcao_id` em `SET NULL`/`CASCADE`/`CASCADE`.

---

## Concluídos — o histórico saiu daqui

Os **15** blocos de temas fechados foram movidos em 2026-07-31 para
[`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md),
**na íntegra**. Eles ocupavam 65% deste arquivo e diluíam o que falta.

⚠️ **Não são só registro de pronto:** guardam o que foi medido, a premissa que estava
errada e o que cada decisão custou. Antes de reabrir qualquer tema abaixo, procure lá.

| Data | Tema |
|---|---|
| ✅ 26/07 | a fabricação de alocação falsa foi apagada por inteiro |
| ✅ 26/07 | as três regras que moravam só no cliente foram para o banco |
| ✅ 26/07 | segunda e terceira rodadas da auditoria de invariantes |
| ❌ 26/07 | os CPFs inválidos são trabalho do coordenador |
| ✅ 26/07 | a meta órfã deixou de ser possível |
| ✅ 26/07 | excluir função em uso passou a ser recusado pelo banco |
| ❌ 26/07 | exposição da `send-email` no projeto v1 |
| ✅ 27/07 | a chave natural de `candidatos` passou a incluir o CPF |
| ❌ 28/07 | o auto-pareamento estava CERTO; a leitura da planilha é que estava errada |
| ✅ 29/07 | Cargos como entidade: o cargo do candidato deixou de ser texto sujo |
| ✅ 30/07 | os `useEffect` do `GerenciarColaboradoresProva` saíram do jeito cru |
| ✅ 30/07 | dado inválido do candidato passou a ENTRAR como veio |
| ✅ 30/07 | o registro órfão deixou de ser possível: importar virou TROCA TOTAL |
| ✅ 31/07 | os grants de `anon` foram a zero, e a auditoria achou um vazamento de leitura |
| ✅ 31/07 | as duas pontas de infraestrutura de teste |

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

## O cadastro público não valida o CPF antes de consultar o banco

**Status:** pendente — **achado na auditoria de `analises/`** em 2026-07-26
**Área:** Colaboradores (ver [`estrutura/modulos/aplicacao-provas/colaboradores.md`](./estrutura/modulos/aplicacao-provas/colaboradores.md))

`/cadastro-publico` pede o CPF, apenas tira o que não é dígito (`CadastroPublico.tsx:35`) e já chama a EF `check-cpf-colaborador`. Desde 2026-07-26 existe `cpfValido` (`src/lib/cpf.ts`), usado pelo `ColaboradorDialog` e pelo `CadastroLote` — **esta porta ficou de fora**, e é a única aberta ao público.

Validar antes da consulta poupa uma ida ao servidor, dá mensagem melhor ("confira os dígitos" em vez de "não encontrado") e reduz superfície de sondagem, já que a EF responde se o CPF existe.

⚠️ **Armadilha ao implementar:** aquele arquivo já tem um **estado** chamado `cpfValido` (`CadastroPublico.tsx:26`), que guarda o CPF em string. Importar a função de mesmo nome colide. Renomeie o estado (`cpfConferido`, por exemplo) — não a função, que já está em uso em dois lugares.

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

## Pendências menores da importação de candidatos

**Status:** registradas para adiante — nenhuma bloqueia nada hoje
**Área:** Candidatos

1. ~~**O fixture `CABECALHO_REAL` está defasado**~~ — ✅ **RESOLVIDO em 2026-07-31.** Atualizado lendo o arquivo real (`docs/temp/todos inscritos concurso 002-2026-SMA cabeçalho.xls`), não de memória: a coluna 0 se chama `N_INSCRICAO`, são 29 colunas, 7.416 linhas de dado, e a `LINHA_REAL` do fixture bate **exatamente** com a primeira linha — ela não precisou mudar. O caso "coluna sem título" ganhou fixture próprio (`CABECALHO_SEM_TITULO_NA_COLUNA_A`) mais um **controle negativo** que quebra se alguém reverter o cabeçalho — sem ele o fixture envelheceria calado de novo, que é o que houve entre 27/07 e 31/07.

   🔴 **O item dizia "3 asserções" e eram QUATRO** — e a quarta é a que importa: `converterLinha` afirmava `n_inscricao: "214274"`, que é o `ID` da coluna B, **o identificador da PESSOA**. O teste ficava verde porque o fixture defasado mapeava `n_inscricao` para a coluna 1; ele afirmava como correto exatamente o defeito que a correção de 28/07 identificou. **Armadilha 8 de `testes.md` outra vez** — teste verde guardando defeito — e a **quarta** vez que um item deste backlog erra a contagem ou a premissa.

2. **Alargar o trigger da 5b**, tirando a comparação de texto, fecharia o buraco registrado como "irredutível" — ⚠️ mas o **CONTROLE POSITIVO 1** da bateria de cargos quebra e precisa ser **reescrito** com inscrições diferentes. **Fica sem sentido se a chave mudar**, então decidir a chave ANTES de investir no trigger.

3. ~~**`anon` continua com `TRUNCATE` em `candidatos`**~~ — ✅ **RESOLVIDO em 2026-07-31** pela migration `20260731110000`: `anon` perdeu **todos** os privilégios em `public`, e o `ALTER DEFAULT PRIVILEGES` parou de reconceder. Ver ["os grants de `anon` foram a zero"](./analises/concluidos/backlog-itens-concluidos.md) no histórico — a execução do item achou, de quebra, um vazamento de leitura em 8 policies.

---

## Temas de infraestrutura — futuro distante

**Status:** anotados, sem desenho e sem ordem definida. Nenhum tem dono nem medição ainda.

- Rate Limiting
- Caching & CDN
- Load Balancing & Scaling
- Error Tracking & Logs
- Availability & Recovery

---
