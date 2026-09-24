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
  como `coordenador`). **Fora de escopo da Fase 1**: conceder `financeiro` já na criação da conta
  (o `z.enum` de `GerenciarUsuarios.tsx` e o `validRoles` da Edge Function `create-admin` não
  incluem `financeiro` de propósito — dá para conceder depois, pelo toggle).

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
   tabela de pagamentos lidos, aviso de divergência CPF×chave PIX
   (`detectarChaveCpfDivergente`), e um botão de geração por unidade (`agruparPagamentosPorUnidade`
   + `gerarLotePix`) que baixa o `.REM` (`Blob`+`<a download>`) e a planilha de conferência
   (`baixarXls`).

Teste: `src/pages/Financeiro.ui.test.tsx` — sem mock de Supabase (o módulo não o toca). Constrói um
`.xlsx` real com `xlsx` e sobe pelo caminho real da página (mesma convenção de
`CandidatosImportar.ui.test.tsx`). Cobre: mapeamento pré-preenchido, bloqueio por coluna
obrigatória, resumo da validação, o aviso de divergência, e a geração de arquivo (com `xlsx.
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
- ⚠️ **`parseFloat(valorStr.replace(',', '.'))` (em `converterPlanilhaParaPagamentoPix`) só troca a
  PRIMEIRA vírgula.** Um valor com separador de milhar em ponto (`"1.234,56"`) vira `1.234` (para
  em `parseFloat` no segundo ponto), não `1234.56`. Herdado da origem, não testado como "correto"
  — só os valores simples (`"150,50"`) foram exercitados na Fase 2. Medir o formato real da
  planilha de pagamento antes de confiar nisso com valores de 4+ dígitos.
- ⚠️ **A Fase 3 não foi verificada em navegador real logado.** O banco local carrega dado e hashes
  de senha de PRODUÇÃO (`desenvolvimento-local.md`) — não há credencial de teste segura para logar
  sozinho como superadmin/financeiro e conferir a tela visualmente. A cobertura de comportamento
  vem só da suíte automatizada (`Financeiro.ui.test.tsx`), que já exercita o componente de verdade
  (planilha `.xlsx` real, sem mockar nada do módulo em si) — mas ninguém a viu rodar num browser.
