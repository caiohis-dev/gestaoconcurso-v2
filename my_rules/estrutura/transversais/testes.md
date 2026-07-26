# Testes Automatizados

> **Documento transversal.** Ver [`00-indice.md`](../00-indice.md) para o mapa completo. Introduzido em 2026-07-25; antes disso o projeto não tinha teste nenhum.

## Como rodar

| Comando | O que faz |
|---|---|
| `npm test` | roda a suíte uma vez (`vitest run`) |
| `npm run test:watch` | modo interativo |
| `npx vitest run src/hooks/useEditais.test.tsx` | um arquivo só |

⚠️ **Nada roda os testes sozinho.** Não há CI nem hook de pre-commit — é item aberto no [`backlog.md`](../../backlog.md). Enquanto isso, rodar `npm test` faz parte de fechar um tema, junto com `npx tsc --noEmit -p tsconfig.app.json` e `npm run build`. Os três, não só o build: o `tsc` já ficou **11 dias vermelho** por um import morto que o build não pegava (o esbuild descarta import não usado antes de resolver o módulo).

## Stack e convenções

**Vitest 2 + React Testing Library + jsdom.** A config está em `vitest.config.ts`, separada do `vite.config.ts` de propósito — o build de produção não precisa carregar nada disto. O alias `@` é duplicado lá; se mudar num, mude no outro.

**Co-localização:** o teste fica ao lado do arquivo testado, não numa pasta `__tests__`.

| Sufixo | Para quê |
|---|---|
| `.test.ts` | contrato puro — schema Zod, função pura. Sem JSX, sem render |
| `.test.tsx` | hook (precisa de provider) ou página (precisa de provider + router) |
| `.ui.test.tsx` | interação com componente renderizado |

Um componente pode ter os dois: `EditalDialog.test.ts` (o schema isolado) e `EditalDialog.ui.test.tsx` (o comportamento na tela).

**Os schemas Zod são exportados** dos componentes justamente para permitir o teste isolado (`export const formSchema = z.object(...)`). Isso gera um aviso de `react-refresh/only-export-components` por arquivo — 9 avisos, aceitos conscientemente.

## A infraestrutura em `src/test/`

### `setup.ts`
Carregado por `setupFiles`. Três responsabilidades, **nenhuma opcional**:
1. matchers do `jest-dom` + `cleanup` entre testes;
2. **env dummy do Supabase** — `client.ts` chama `createClient` na importação, então sem `VITE_SUPABASE_URL` qualquer import transitivo explode com `supabaseUrl is required` antes do primeiro teste;
3. **polyfills do Radix** (`ResizeObserver`, `matchMedia`, `hasPointerCapture`, `scrollIntoView`). Sem eles, todo teste de `Dialog`/`Select` falha com erro que aponta para dentro do Radix, não para o polyfill faltante.

### `supabase-mock.ts`
Mock do client. Como tudo passa por `src/integrations/supabase/client.ts`, mockar aquele módulo cobre 100% do acesso a dados.

```ts
vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});
```

A fábrica é `async` porque `vi.mock` é **içado**: referência direta a `supabaseMock` daria `ReferenceError`.

| Helper | Uso |
|---|---|
| `setTableResult(tabela, r)` | o que `from(tabela)` resolve |
| `setTableResultSequence(tabela, [r1, r2…])` | resultados em ordem, para chamadas sucessivas à mesma tabela |
| `setRpcResult(nome, r)` / `setFunctionResult(nome, r)` | RPC e Edge Function |
| `erroPostgrest(code, msg)` + `CODIGOS_POSTGREST` | erros por código (`23505`, `23503`) |
| `buildersDaTabela(t)` | todos os builders, na ordem |
| `builderQueChamou(t, metodo)` | **o builder da mutation** — ver armadilha 2 |
| `resetSupabaseMock()` | no `beforeEach`; limpa resultados, sequências e histórico |

O mock tem **teste próprio** (`supabase-mock.test.ts`): é infraestrutura de que todos os testes de hook dependem, então se ele mentir os outros passam ou falham pelo motivo errado.

### `utils.tsx`
`renderWithProviders` e `renderHookWithProviders` — `QueryClientProvider` (com `retry: false` e `gcTime: 0`) + `MemoryRouter`.

**O `AuthProvider` fica de fora de propósito:** ele dispara chamadas ao Supabase no mount, e embuti-lo no helper faria todo teste depender de um efeito invisível. Quem precisa dele monta explicitamente, como faz `useAuth.test.tsx`.

## Testar página: o harness dos guards

`src/pages/guards.test.tsx` é o único teste de página hoje, e o padrão dele vale para os próximos. Três decisões que não são óbvias:

**1. O `useAuth` é mockado, não o `AuthProvider`.** O objeto de teste é o guard ("dado este estado de auth, para onde vai?"), não o provider — que tem cobertura própria em `useAuth.test.tsx`. Montar o provider real obrigaria a simular sessão do Supabase para alcançar cada combinação, e a janela do `rolesLoaded` é praticamente inalcançável por ali. O mock usa `vi.hoisted` para o objeto mutável de estado, porque `vi.mock` é içado.

**2. Uma `<Sonda>` com `useLocation` dentro do `MemoryRouter`, e uma rota `*` sentinela.** O que se afirma é o `pathname` em que o router parou. Assim tanto `<Navigate>` em tempo de render quanto `useEffect` + `navigate` são medidos do mesmo jeito, sem espiar implementação.

**3. A bateria compõe como o `App.tsx` compõe.** Desde a centralização dos guards, cada entrada da matriz declara os papéis que a rota exige e o harness embrulha a página no `RequireAcesso` — senão a bateria testaria uma composição que não existe. É o que a manteve como especificação depois de os guards saírem das páginas.

**4. Toda tabela e RPC do app devolvem lista vazia.** O default do mock é `{ data: null }`, e várias páginas chamam `.some()`/`.map()` sem coalescer — o teste mediria o TypeError, não a autorização.

## ⚠️ As sete armadilhas que já custaram tempo aqui

**1. A sequência é consumida pela listagem antes de chegar à mutation.** A query de listagem também chama `from(<tabela>)`, então ela come a primeira entrada e o hook recebe um objeto onde espera array (`coordenadores.map is not a function`). Espere a carga inicial e **só então** instale a sequência — `setTableResultSequence` zera o contador. E a **última entrada precisa ser um array**, porque o refetch disparado pela invalidação cai nela.

```ts
async function carregarEDepois(sequencia) {
  setTableResult("coordenadores_prova", { data: [], error: null });
  const hook = renderHookWithProviders(() => useCoordenadoresProva(PROVA_ID));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  setTableResultSequence("coordenadores_prova", sequencia);
  return hook;
}
```

**2. `buildersDaTabela(t).at(-1)` pega o refetch, não a mutation.** A mutation invalida a query, o React Query refaz a listagem, e o último builder passa a ser o dela — a asserção compara contra o filtro da listagem e falha de forma confusa. Quebrou 9 testes de uma vez. Use `builderQueChamou(tabela, "update")`.

**3. `act()` em qualquer chamada que atualize estado de provider.** Foi o caso do `signOut` do `useAuth`. Aviso de `act` acumulado vira ruído que esconde problema real na suíte seguinte.

**4. Fake timers: use `shouldAdvanceTime: true`.** Sem isso o `waitFor` da RTL trava contra o relógio congelado. Em compensação o tempo real corre junto, então **não faça asserção na fronteira exata** de um intervalo (29.999ms) — o `waitFor` anterior já consumiu parte dele. Único hook temporal hoje: `useProvaLock`.

**5. Nem todo caminho passa pelo mock do Supabase.** A liberação do lock no `pagehide` usa `fetch` cru com `keepalive` (o cliente do Supabase não sobrevive ao unload), então asserção sobre `supabaseMock.rpc` **não vê nada** — é preciso `vi.spyOn(globalThis, "fetch")`. As envs `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` já vêm stubadas em `src/test/setup.ts`, o que permite conferir URL e headers. Eventos de ciclo de vida da página se disparam com `window.dispatchEvent(new Event("pagehide"))`; para o bfcache, monte o `pageshow` com `persisted = true` à mão, porque o jsdom não traz `PageTransitionEvent`.

**6. Timeout nunca é resposta — espera positiva, sempre.** Ao medir o guard das páginas, a primeira versão esperava 400ms pelo fim do spinner e tratava o estouro como "a página está esperando os papéis". Passou isolada e **falhou na suíte cheia**: sob carga, uma página lenta é indistinguível de uma que espera de propósito. A correção é inverter tudo em asserção do que **passa a valer** — `waitFor` até o router chegar no destino, ou até o spinner *aparecer* (que é a evidência positiva de "está esperando"). Com isso o timeout generoso sai de graça, porque o `waitFor` retorna no instante em que a condição vale e só cobra tempo quando o teste realmente vai falhar. A suíte inteira ficou **mais rápida** depois da troca (4,7s contra 6,8s).

**7. Em formulário com `<form>` + botão submit, o `min`/`max` do input barra ANTES do Zod.** A validação nativa do navegador impede o evento de submit, e a mensagem em português do schema **nunca aparece** — o usuário vê o balão do navegador, no idioma dele. Aconteceu em três campos (`unid_andares`, `quantidade` e `sala_andar`) e custou dois testes escritos errado, que esperavam a mensagem do app.

> Como testar cada caso: se o valor viola `min`/`max`, afirme `onSubmit` não chamado + `campo.validity.rangeUnderflow` (ou `rangeOverflow`) — é a prova de que foi o nativo. Se quiser exercitar a mensagem do Zod, use um caminho que o nativo deixa passar (campo **vazio**, por exemplo, quando não é `required`).
>
> ⚠️ **O inverso também é armadilha, e é pior:** diálogo cujo botão chama o handler no `onClick`, **sem `<form>`**, não tem validação nativa nenhuma — o `min="0"` ali é decorativo. Foi assim que o `ValoresFuncaoProvaDialog` aceitou valor de pagamento negativo até 2026-07-26.

> Corolário para quem for medir "não aconteceu nada": só é seguro afirmar isso quando a página não tem query pendente que possa mudar a decisão depois. Caso contrário, o teste está medindo o meio do caminho.

## O que está coberto (2026-07-26)

743 testes em 46 arquivos.

| Área | Arquivos |
|---|---|
| Registro de módulos | `lib/modulos.test.ts` — inclui invariantes que rodam sobre `MODULOS` inteiro |
| Acessibilidade | `components/dialogos-acessibilidade.test.ts` — invariante **estática**: lê o fonte e exige `DialogDescription` em cada um dos 31 `DialogContent` (contando as variantes AlertDialog/Sheet) |
| Schemas Zod (9) | `*Dialog.test.ts`, `pages/Auth.test.ts`, `pages/GerenciarUsuarios.test.ts` |
| Auth | `useAuth.test.tsx` — hierarquia, `colaborador` paralelo, `rolesLoaded`, `signOut` |
| Hooks de dados | `useEditais`, `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useProvaLock`, `useOcorrencias`, `useCoordenadorUnidades`, `useProvas`, `useProvaUnidades`, `useSalasDistribuidas` (+ `useSalasDistribuidasCapacidade` e `useFiscaisSala`), `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useUsers`, `useUnidadesProva`, `useSalasProva`, `useUnidadeCapacidade`, `useBancos` — **a camada está fechada** |
| UI | `EditalDialog.ui.test.tsx`, `ProvaDialog.ui.test.tsx`, **`PasswordConfirmDialog.ui.test.tsx`** (16 — a barreira das ações destrutivas), **`CoordenadoresProvaDialog.ui.test.tsx`** (23 — a concessão de acesso de coordenador), **`ValoresFuncaoProvaDialog`** + **`MetaColaboradoresDialog`** (20 + 13 — o caminho do dinheiro), **`CorrigirEmailAcessoDialog`** (16 — a âncora de identidade), **`UnidadeProvaDialog`** · **`FuncaoColaboradorDialog`** · **`SalaProvaDialog`** · **`SalaExtraDialog`** (42 no total) |
| **Guards de página** | `pages/guards.test.tsx` — 137 testes: a matriz **19 páginas × 5 papéis**, mais a janela do `rolesLoaded` e o `isLoggingOut` |

**A camada de hooks fechou em 2026-07-26** — os 20 hooks de dados têm teste (`use-mobile` e `use-toast` são utilitários do shadcn, fora da conta). **Os 12 diálogos estão cobertos.** Falta e **as 8 Edge Functions** (rodam em Deno, fora do alcance desta suíte — a autorização de duas delas é verificada pela bateria manual [`../../../docs/bateria-create-admin-autorizacao.md`](../../../docs/bateria-create-admin-autorizacao.md)).

**Das páginas, o que está coberto é o guard, não o comportamento.** A bateria afirma quem entra e para onde o recusado é mandado; ela não exercita formulário, listagem nem ação de página nenhuma. As **4 páginas fora da matriz** são as que não têm guard a testar, todas públicas por natureza: `/auth`, `/cadastro-publico`, `/redefinir-senha` e `NotFound`.

O inventário completo, com ordem de prioridade e o que **não** se testa aqui, está no [`backlog.md`](../../backlog.md) → "Completar a suíte de testes (Vitest)".

## O princípio

Os testes miram **comportamento e contrato**, não cobertura de linhas — para sobreviverem a refatoração. E acabam servindo de documentação executável: ao contrário de um `.md`, este texto **quebra quando deixa de ser verdade**.

**Invariante estática é um tipo válido de teste aqui.** Quando a regra vale para *todos* os arquivos de uma categoria e renderizar cada um custaria mais que o problema, ler o fonte e afirmar a regra cobre tudo de uma vez — é o que faz o `dialogos-acessibilidade.test.ts` com os 31 diálogos. Dois cuidados ao escrever uma dessas: inclua uma asserção de que **a varredura achou arquivos** (senão o teste passa por vacuidade quando o caminho quebra), e **prove que ela falha** removendo a propriedade de propósito uma vez, antes de confiar nela.

Onde um teste afirma comportamento **errado** de propósito, ele leva `⚠️ DEFEITO` no nome e um comentário explicando por quê. O teste vira então um alarme invertido: **ele quebra quando o bug é corrigido**, e é esse o sinal de que deve ser reescrito para o comportamento certo.

O ciclo já se fechou uma vez, e vale como modelo: dois testes de `useProvaLock` afirmavam que `isLoading` ficava preso em `true`, porque ficava; ao consertar o hook em 2026-07-25 eles quebraram, como previsto, e foram reescritos como **teste de regressão** — mesma montagem, asserção invertida, e o comentário passou de "defeito conhecido" para "isto já quebrou uma vez, não deixe voltar". Preserve esse comentário: é ele que impede alguém de "simplificar" o `else` que resolve o estado.

**Há hoje UMA marca `⚠️ DEFEITO`**, e todas têm item no `backlog.md` — a regra é essa: **marca sem item vira defeito aceito por esquecimento**, então abra os dois na mesma unidade de trabalho.

| Onde | O que o teste afirma, sabendo que está errado |
|---|---|
| `useUsers` | `addCoordenadorAccess` fabrica uma alocação falsa com um colaborador arbitrário |

**O ciclo se fechou três vezes em 2026-07-26, e é a confirmação do método** — a marca serve para *ser derrubada*:

| Marca | Como caiu | No que virou |
|---|---|---|
| `useProvaLock` (`isLoading` preso) | consertado o hook | teste de regressão com a asserção invertida |
| `/perfil` (renderiza para deslogado) | entrou o guard | duas regressões: o formulário **não escapa** no caminho para o `/auth`, e o nome vem preenchido quando a sessão resolve depois do mount |
| `CoordenadoresProvaDialog` (barreira não pega superadmin) | os dois SELECT literais viraram `has_role` | regressão que afirma **a quem se pergunta** (`has_role`), não como se filtra a tabela |
| `ValoresFuncaoProvaDialog` (aceita valor negativo) | CHECK no banco + recusa no cliente | regressão: recusa e **preserva o preenchimento**, e o zero segue aceito |
| `ValoresFuncaoProvaDialog` (excluir sem confirmar) | entrou `AlertDialog` | quatro regressões: abre, nomeia a função, confirma, cancela |
| `CorrigirEmailAcessoDialog` (descartava a mensagem do servidor) | extraído o helper `mensagemDeErroDaFuncao` | duas regressões, uma na consulta e outra na correção |
| `ColaboradorDialog` (CPF incompleto virava outro CPF) | validação de DV **antes** do `padStart` | recusa incompleto, DV errado, repetidos — e o legado segue editável |
| `ColaboradorDialog` (aviso `aria-hidden`) | o aviso passou para **dentro** do `DialogContent` | acessível sem `hidden: true`, e o hack de `z-[60]` sumiu |
| `useOcorrencias` (lista vazia devolvia a prova inteira) | `undefined` e `[]` deixaram de cair no mesmo ramo | zero linhas com `[]`, sem restrição com `undefined` |
| `Dashboard` (colaborador puro em tela branca) | o `RequireAcesso` substituiu o proxy `role !== null` | ele passou a ser recusado como em qualquer outra página |
| `useUsers` (revogar coordenador em dois passos) | virou a RPC transacional `revogar_coordenador` | três regressões: vai pela RPC, falha não deixa estado parcial, e outros papéis seguem no DELETE direto |

Existe também a marca mais fraca **`⚠️ ATENÇÃO`**, para quando o comportamento **não é defeito**, mas morde quem depende dele. Não abre item de backlog; existe para quem for mexer ali não achar que pode simplificar aquilo. Cinco casos: `useCoordenadorUnidades` (lista vazia indistinguível de "ainda carregando" sem olhar `isLoading`); o bloco da **janela do `rolesLoaded`** em `guards.test.tsx` — 13 páginas decidem sem esperar os papéis, o que hoje não expulsa ninguém só porque o `role` anterior sobrevive ao refetch; o `PasswordConfirmDialog`, que **só zera senha e erro pelo Cancelar/Esc**, não quando o pai fecha via prop `open` (nenhuma das 5 páginas faz isso hoje); e o `MetaColaboradoresDialog`, em que **meta de função que perdeu o valor fica órfã** — o upsert nunca apaga, então a linha continua no banco sem aparecer na tela; e o `useSalasProva`, cujo esquema `andar × 100 + sequência` comporta **99 salas por andar** e invade o andar seguinte em silêncio ao estourar.
