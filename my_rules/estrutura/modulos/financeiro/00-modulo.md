# Módulo: Financeiro

> **Contrato do módulo.** Este arquivo deve bastar para implementar ou refatorar o módulo
> Financeiro sem reler o codebase. Se faltou algo, o defeito é deste doc — corrija-o junto com o
> código. Ver [`../../00-indice.md`](../../00-indice.md).

🟢 **Roadmap concluído (2026-09-24)** — ver
[`../../../analises/roadmap-modulo-financeiro.yaml`](../../../analises/roadmap-modulo-financeiro.yaml)
e o registro de fechamento em
[`../../../analises/concluidos/backlog-itens-concluidos.md`](../../../analises/concluidos/backlog-itens-concluidos.md).
Papel + guarda de acesso (Fase 1), a lógica de negócio pura (Fase 2), a UI real (Fase 3) e a
verificação final (Fase 4) estão prontas e testadas. A persistência (histórico de remessas) é
decisão D3, **fora** deste roadmap — cada geração continua sendo download direto do navegador, sem
gravar nada; vira roadmap próprio quando entrar (registrado em `backlog.md`).

## Identidade

| | |
|---|---|
| **`id`** em `src/lib/modulos.ts` | `financeiro` |
| **Nome na UI** | Financeiro |
| **Papéis com acesso** | `superadmin`, `financeiro` — **não** admin comum. Assimetria deliberada (D1 do roadmap): diferente de todo módulo existente, `admin` não herda este |
| **Rota de entrada** | `/financeiro` (fixa, sem variação por papel) |
| **`prefixosRota`** | `['/financeiro']` |
| **`navLinks`** | um só: Financeiro → `/financeiro` (`showFor: ['superadmin','financeiro']`) |
| **Ícone** | `Banknote` (lucide) |

## O que o módulo é

Gerador de remessa de pagamento **CNAB 240 (SISPAG Itaú), forma PIX**: a partir de uma planilha de
recebedores, mapeia colunas, infere e valida a chave PIX de cada linha, e produz um arquivo `.REM`
por unidade + planilha de conferência. Portado de um projeto separado
(`gera_cnab_pix`), que era 100% client-side (sem persistência nenhuma, apesar de ter migrations
Supabase desenhadas e nunca ligadas ao frontend).

🔴 **Fronteira central: não se comunica com dado nenhum do resto do sistema.** Candidatos, provas,
editais e colaboradores de Aplicação de Provas são invisíveis para este módulo. A única superfície
compartilhada é **Supabase Auth + `user_roles`** — o papel `financeiro` em si.

## Papel `financeiro` e o mecanismo de acesso (Fase 1)

- Enum `app_role` ganhou o valor `financeiro` (migration `20260924013236`).
- `has_role` foi estendida para superadmin também implicar `financeiro`, no mesmo padrão de
  `superadmin ⇒ admin` (migration `20260924013238`). Isso só importa a partir do dia em que houver
  tabela/RLS própria do módulo — na Fase 1 não há nenhuma.
- No frontend, `financeiro` é dimensão PARALELA a admin/coordenador — como `colaborador`. `useAuth`
  expõe `isFinanceiro = roles.includes('financeiro')`, sem entrar na escada `resolveRoleGestao`.
- A rota usa `RequireAcesso papeis={["superadmin", "financeiro"]}` — os dois papéis explícitos, e
  não um só, porque `isFinanceiro` **não** é true para superadmin (isso é decidido pela rota
  listar os dois, não por herança no `useAuth`).
- No hub (`src/lib/modulos.ts`), o módulo declara `papeis: ['superadmin', 'financeiro']` e
  `papeisDoUsuario` empurra `'financeiro'` só quando `ctx.isFinanceiro` — superadmin não ganha
  `'financeiro'` ali (ao contrário de como ganha `'admin'`), o card aparece para ele só porque o
  módulo lista `'superadmin'`.
- Concessão/revogação do papel é em `/gerenciar-usuarios` (coluna "Financeiro", `useUsers.tsx`) —
  papel puro, DELETE/INSERT direto em `user_roles`, sem RPC (não tem tabela de alocação paralela
  como `coordenador`). 🔵 **Desde 2026-09-24 também pelo diálogo "Conceder acesso"**, que parte
  do colaborador e cria a conta por convite se ela não existir (EF `conceder-papel-sistema`, ver
  `transversais/auth-e-permissoes.md`). ⚠️ Esta linha dizia que conceder `financeiro` na criação
  da conta estava fora de escopo da Fase 1 — deixou de valer com a substituição da `create-admin`.
- 🔴 **Colaborador + financeiro vai ao hub** desde 2026-09-24: `colaboradorSemGestao`
  (`src/lib/papeis.ts`) recebe `isFinanceiro`. Antes, esse combo — o caso real do papel, já que
  a conta nasce de colaborador — caía em `/perfil-colaborador` e nunca via o card do módulo.

## Arquivos — acesso (Fase 1)

| Arquivo | Papel |
|---|---|
| `src/pages/Financeiro.tsx` | UI real (Fase 3) — ver seção própria abaixo |
| `src/lib/modulos.ts` | Entrada do módulo, `PapelGestao`/`PapelNav`/`CtxAcesso` com `financeiro` |
| `src/hooks/useAuth.tsx` | `isFinanceiro` |
| `src/lib/papeis.ts` | `AppRole` inclui `financeiro` |
| `src/components/RequireAcesso.tsx` | `PapelExigido` inclui `financeiro` |
| `src/hooks/useUsers.tsx`, `src/pages/GerenciarUsuarios.tsx` | Concessão/revogação do papel |
| `src/pages/guards.test.tsx`, `src/lib/modulos.test.ts` | A especificação executável — inclui o controle negativo de que `admin` puro NÃO acessa |
| `supabase/migrations/20260924013236_*`, `20260924013238_*` | Enum e `has_role` |

Nenhuma tabela, RPC ou Edge Function própria — persistência é decisão D3, fora deste roadmap.

## Arquivos — lógica de negócio (Fase 2)

Portados 1:1 de `gera_cnab_pix/src/lib/` (que não tinha nenhum teste). Só o nome do arquivo ganhou
o prefixo `financeiro-`; os nomes de função/tipo exportados são os mesmos da origem.

| Arquivo | Papel | Teste |
|---|---|---|
| `src/lib/financeiro-cnab240-tipos.ts` | `PagamentoPix`, os 6 construtores de linha CNAB 240 (Header Arquivo/Lote, Segmento A/B, Trailer Lote/Arquivo), `dadosPagador` | `financeiro-cnab240-tipos.test.ts` — cada posição contra o layout |
| `src/lib/financeiro-cnab240-gerador.ts` | `gerarLotePix` (monta o arquivo de um lote), `agruparPagamentosPorUnidade` (um arquivo por unidade + nome de arquivo) | `financeiro-cnab240-gerador.test.ts` |
| `src/lib/financeiro-planilha-pagamentos.ts` | `COLUNAS_SISTEMA`, `sugerirMapeamento`, `converterPlanilhaParaPagamentoPix` — o maior agregador de regra de negócio | `financeiro-planilha-pagamentos.test.ts` |
| `src/lib/financeiro-ler-planilha.ts` | `lerPlanilha` (File → `Matriz`) | `financeiro-ler-planilha.test.ts` |
| `src/lib/financeiro-exportar-planilha.ts` | `baixarXls` (matriz → download `.xls`) | `financeiro-exportar-planilha.test.ts` |
| `src/lib/financeiro-chave-pix.ts` | `inferirTipoEFormatarChavePix` — inferência/desambiguação CPF×celular | `financeiro-chave-pix.test.ts` |
| `src/lib/financeiro-divergencia-pix.ts` | `detectarChaveCpfDivergente` — aviso de titularidade | `financeiro-divergencia-pix.test.ts` |
| [`layout-cnab240-itau.md`](./layout-cnab240-itau.md) | Referência de posições do layout (Itaú SISPAG v085, PIX PF) — portada verbatim | — |
| [`numeracao-de-lote.md`](./numeracao-de-lote.md) | Regra de numeração de lote/registro | — |

🔴 **Verificado contra produção real da origem em 2026-09-23**: a estrutura de um `.REM` gerado
pela ferramenta original (6 linhas para 1 pagamento — header arquivo, header lote, Seg. A, Seg. B,
trailer lote, trailer arquivo) bate byte a byte com o que `gerarLotePix` portado produz (sequencial
de registro repetido entre A/B, trailer-lote com 4 registros, trailer-arquivo com 6). Verificação
feita localmente, sem copiar o arquivo real (tem PII) para este repositório.

⚠️ **`dadosPagador` (CNPJ/agência/conta/DAC da FEVRE) está hardcoded** em
`financeiro-cnab240-tipos.ts`, exatamente como na origem — não foi extraído para configuração
nesta fase (preservar fielmente > redesenhar agora). Candidato a virar tela/config numa fase
futura, se o pagador puder mudar.

⚠️ **`edital` e `siglaUnidade` em `PagamentoPix` são texto livre lido da PLANILHA de pagamento —
sem NENHUM vínculo com as tabelas `editais`/`unidades_prova` do resto do sistema.** É a mesma
palavra, dado completamente diferente; não tente "juntar" com o módulo Editais.

## UI (Fase 3)

`src/pages/Financeiro.tsx` — um único arquivo, um único fluxo linear (sem abas "Geração"/
"Histórico" da origem: eram placeholders vazios, e D3 manteve o módulo stateless). Reescrito nos
padrões do repositório (Tailwind/shadcn), seguindo a convenção visual de `CadastroLote.tsx`
(stepper, upload por clique — sem drag-and-drop —, `Table`+`Select` para mapeamento), não a UI
original (CSS/ícones próprios, sem Tailwind).

Três etapas, cada uma um componente interno ao arquivo (`EnvioEtapa`, `MapeamentoEtapa`,
`ValidacaoEtapa` — a divisão existe também para manter a complexidade de cada função abaixo do
teto do lint, não só por organização):

1. **Envio** — data de pagamento (`Input type="date"`) + upload (`.xls`/`.xlsx`) via `lerPlanilha`.
2. **Correspondência de colunas** — uma linha por `COLUNAS_SISTEMA`, `Select` para a coluna da
   planilha, prévia do primeiro valor; "Validar" só libera com toda coluna `obrigatoria` mapeada.
3. **Validação/Geração** — resumo (recebedores válidos, ignoradas, valor total, nº de arquivos),
   aviso das linhas recusadas (`AvisoRecusadas`), aviso de centavos ignorados (`AvisoCentavos`),
   tabela de pagamentos lidos, aviso de divergência CPF×chave PIX
   (`detectarChaveCpfDivergente`), e um botão de geração por unidade (`agruparPagamentosPorUnidade`
   + `gerarLotePix`) que baixa o `.REM` (`Blob`+`<a download>`) e a planilha de conferência
   (`baixarXls`).

Teste: `src/pages/Financeiro.ui.test.tsx` — sem mock de Supabase (o módulo não o toca). Constrói um
`.xlsx` real com `xlsx` e sobe pelo caminho real da página (mesma convenção de
`CandidatosImportar.ui.test.tsx`). Cobre: mapeamento pré-preenchido, bloqueio por coluna
obrigatória, resumo da validação, os avisos de linha recusada, de centavos e de divergência, e a geração de arquivo (com `xlsx.
writeFile` e `URL.createObjectURL`/`HTMLAnchorElement.click` mockados — armadilha 9 de
`testes.md`, já que gerar arquivo de verdade suja o jsdom).

## Pontos frágeis

- ⚠️ **`admin` comum não acessa por desenho.** Ao tocar em qualquer checagem de acesso deste
  módulo, não generalize para `isAdmin` — é exatamente o padrão que quebraria a assimetria.
- ⚠️ **`isFinanceiro` não implica superadmin, e vice-versa no frontend.** A união dos dois só
  acontece porque a rota e o módulo listam os dois papéis explicitamente. No banco, `has_role`
  já resolve isso (superadmin ⇒ financeiro) — os dois mecanismos são independentes e intencionais.
- ⚠️ **`inferirTipoEFormatarChavePix` e `converterPlanilhaParaPagamentoPix` subiram o baseline de
  lint de 111 para 113** (2 avisos de `complexity`, ver CLAUDE.md §5). São ports fiéis da origem —
  refatorar a complexidade agora não é escopo da Fase 2 (traduzir, não redesenhar) e mexeria em
  lógica que decide o TIPO de chave PIX de um pagamento real.
- 🔴 **Pagamento é sempre em REAIS INTEIROS** (decisão do usuário, 2026-11-03). Centavos na
  planilha são **descartados — truncados, nunca arredondados** (`150,99` paga 150) — em
  `converterPlanilhaParaPagamentoPix`, que guarda o valor lido em `PagamentoPix.valorComCentavos`
  (metadado só de UI). A tela lista essas linhas no aviso `AvisoCentavos` ("os centavos serão
  ignorados"), com o valor da planilha e o valor pago. O `.REM` e a planilha de conferência saem
  com o valor truncado.
- 🔴 **O valor chega ao parser SEMPRE em formato brasileiro** (`parseValorMonetario`: ponto é
  milhar, vírgula é decimal). Por isso `lerPlanilha` converte célula **numérica** para texto com
  vírgula decimal (`1500.5` → `"1500,5"`). ⚠️ **De 2026-09-24 (v3.6.0) a 2026-11-03 não
  convertia:** a célula numérica `1500.5` chegava como `"1500.5"`, o parser apagava o ponto e lia
  **15005** — pagamento 10× maior, sem erro nenhum na tela. Entrou com o conserto do `"1.234,56"`
  (commit `0c81276`), cujos testes só usavam valor em TEXTO; nenhum envio saiu com valor quebrado
  (confirmado pelo usuário). Teste de valor neste módulo tem de incluir célula de número de verdade
  num `.xlsx` (`Financeiro.ui.test.tsx`).
- 🔴 **Nenhuma linha some calada** (2026-11-03). `lerPagamentosDaPlanilha` devolve
  `{ pagamentos, recusadas }`; cada `LinhaRecusada` traz nome, CPF e valor **como estavam na
  planilha** e o motivo. A tela lista todas em `AvisoRecusadas` ("ficaram fora do arquivo — não
  serão pagas"), e as válidas seguem geráveis. `converterPlanilhaParaPagamentoPix` continua
  existindo e devolve só os pagamentos. Motivos, nesta ordem: nome em branco · CPF em branco ·
  valor em branco · valor fora do formato · valor abaixo de R$ 1,00 (truncado, daria zero) ·
  **chave PIX preenchida e não reconhecida** (sem `tipo_chave_pix`, e a inferência não a leu como
  CPF, celular, e-mail nem chave aleatória). ⚠️ **Até 2026-11-03 essa chave era trocada CALADA pelo
  CPF do favorecido** — medido numa planilha real: 5 de 423 (celular sem DDD, `0` + telefone, 14
  dígitos). Decisão do usuário: recusar, não corrigir sozinho. Chave em **branco** segue indo para
  o CPF (por desenho), e `tipo_chave_pix` explícito não passa pela inferência.
  - **O formato de valor é estrito** (`VALOR_BR`): `1500`, `1500,5`, `1.500`, `1.234,56`. Fica
    fora: `"R$ …"`, sinal negativo, `"1.5"` (ponto decimal em texto, que o parser leria como 15)
    e lixo no fim. ⚠️ **Até 2026-11-03 era `parseFloat`**: `"R$ 1.500,00"` virava `NaN` e saía
    **R$ 0,00 no Segmento A**, `"1500abc"` virava 1500, valor em branco virava 0, e linha sem
    nome/CPF sumia — a tela só mostrava "Linhas ignoradas: N".
  - O número da linha do Excel **não** é mostrado de propósito: `lerPlanilha` descarta linhas em
    branco (`blankrows: false`), então o índice da matriz não bate com a linha da planilha.
- ⚠️ **Em aberto (avaliação de 2026-11-03, confirmada no código, não corrigida):**
  `lerPlanilha` usa `raw: true`, então CPF/chave PIX guardados como NÚMERO perdem o zero à esquerda
  (`05261923727` → `5261923727`; a chave de 10 dígitos pode virar telefone `+555261923727`). O
  campo CPF do favorecido se salva (o `formatNumeric` completa com zeros); a chave PIX, não.
  Trocar para `raw: false` sozinho **quebraria o valor** (o SheetJS formata em en-US: `"1,500.50"`).
  🔵 Medido numa planilha real em 2026-11-03: CPF e `Chave PIX` vêm como **texto** — o defeito
  não ocorre nesse formato. Também aberto: CPF do favorecido sem validação de DV;
  `cpfTemDigitosValidos` duplica `src/lib/cpf.ts`.
- ⚠️ **A Fase 3 não foi verificada em navegador real logado.** O banco local carrega dado e hashes
  de senha de PRODUÇÃO (`desenvolvimento-local.md`) — não há credencial de teste segura para logar
  sozinho como superadmin/financeiro e conferir a tela visualmente. A cobertura de comportamento
  vem só da suíte automatizada (`Financeiro.ui.test.tsx`), que já exercita o componente de verdade
  (planilha `.xlsx` real, sem mockar nada do módulo em si) — mas ninguém a viu rodar num browser.
