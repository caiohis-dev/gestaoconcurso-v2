# `analises/` — desenhos, roadmaps e dívidas

> **Leia isto antes de usar qualquer arquivo desta pasta como guia.** Ela mistura dois tipos de documento com valor muito diferente, e confundi-los leva a implementar o que já foi implementado — ou, pior, a seguir uma regra que deixou de valer.

## As duas categorias

| Onde | O que é | Como usar |
|---|---|---|
| **`analises/*.md`** (raiz) | **Vivo.** Desenho ainda não executado, ou dívida ainda em aberto. | Pode guiar implementação. Confira contra o código mesmo assim. |
| **`analises/concluidos/*`** | **Histórico.** Registro do desenho e das decisões de um tema já entregue. | **Não é plano.** Serve para entender *por que* algo é como é — não *o que fazer*. |

Hoje, vivos: [`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md) e [`roadmap-edicao-email-colaborador.md`](./roadmap-edicao-email-colaborador.md).

⚠️ **`roadmap-importacao-troca-total.yaml` saiu daqui em 2026-07-30** e está em [`concluidos/`](./concluidos/roadmap-importacao-troca-total.yaml): as quatro etapas foram executadas no mesmo dia em que ele nasceu. Duas coisas nele merecem cuidado ao ser lido depois:

1. **A decisão D0 registra uma alternativa RECUSADA** (upsert + exclusão do resíduo), que eu havia recomendado e o usuário preteriu em favor da troca total. É o caso exato do aviso desta página — **não** é um "plano original" a restaurar.
2. **Ele foi reescrito no mesmo dia em que nasceu**, quando a decisão mudou. O que está lá descreve o que foi feito, não o primeiro desenho.

⚠️ **`roadmap-cargos.yaml` saiu daqui em 2026-07-29** e está em [`concluidos/`](./concluidos/roadmap-cargos.yaml): as etapas 1 a 6 foram executadas em 27–29/07. Ele ainda descreve uma **etapa 7** (página `/cargos`) que **nunca foi planejada para a entrega** — é o caso exato de que a seção acima avisa. Não a leia como pendência; a decisão está em D7.

## O estado atual NÃO mora aqui

Nem no vivo nem no arquivado. O que o sistema **é** hoje vive em [`../estrutura/`](../estrutura/), e o que **falta fazer** vive no [`../backlog.md`](../backlog.md). Esta pasta guarda o *raciocínio*: as alternativas rejeitadas, o motivo de cada decisão, o que se mediu antes de escolher.

**É por isso que ela é valiosa e perigosa ao mesmo tempo.** Um roadmap concluído descreve o mundo no dia em que foi escrito, com verbos no presente e no futuro. Lido meses depois, "os guards seguem espalhados" e "o registro alimentará os guards" soam como descrição do código atual — e não são.

## A regra para arquivo já arquivado

Quando algo que um documento concluído afirma deixa de valer:

1. **Não se reescreve a história.** O registro do que se decidiu, e com que informação, é justamente o valor do arquivo.
2. **Corrige-se o que seria lido como regra.** Um bloco `⚠️ O QUE MUDOU DEPOIS` no topo, e uma anotação inline em cada frase que um leitor tomaria por instrução atual.
3. **Distinga os dois casos ao anotar:** *"era verdade e mudou"* é diferente de *"nunca chegou a ser verdade"*. O segundo é mais importante de marcar, porque costuma ser uma proposta que a implementação rejeitou com motivo — e alguém pode ressuscitá-la achando que é o plano original.

O exemplo vivo dessa regra está em [`concluidos/roadmap-modulos.yaml`](./concluidos/roadmap-modulos.yaml).

## Sobre a compartimentação em módulos, especificamente

É o assunto que mais atrai releitura, então vale o atalho:

- **A fonte de verdade em código é `src/lib/modulos.ts`.** Módulo novo = uma entrada em `MODULOS`. Nunca duplicar a lista de rotas de um módulo em outro lugar.
- **O registro é UX — ele esconde, não barra.** Alimenta o hub e o header. ⚠️ **Não alimenta os guards, e isso é decisão, não pendência:** o registro conhece papel por *módulo*, e as rotas são mais finas. `aplicacao-provas` admite coordenador, mas sete rotas dele são só admin. Ler os papéis do registro afrouxaria o acesso dessas sete.
- **A autorização de rota é o `RequireAcesso`** (`src/components/RequireAcesso.tsx`), com os papéis declarados rota a rota no `App.tsx`.
- **A especificação executável** é `src/pages/guards.test.tsx`: matriz 19 páginas × 5 papéis. Mudou autorização? Se um teste dali quebrar, a decisão mudou de comportamento — e isso tem de ser deliberado.
- O mecanismo em prosa está em [`../estrutura/transversais/arquitetura-geral.md`](../estrutura/transversais/arquitetura-geral.md) §6; a matriz papel × módulo, em [`../estrutura/transversais/auth-e-permissoes.md`](../estrutura/transversais/auth-e-permissoes.md).

## Documentação por módulo

Cada módulo tem contrato próprio em `../estrutura/modulos/<id>/00-modulo.md`, e **é ele a porta de entrada** para trabalhar naquele módulo — não os arquivos desta pasta. O contrato deve bastar para implementar ou refatorar sem reler o codebase; se não bastou, o defeito é do contrato e se corrige junto com o código.
