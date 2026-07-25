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
| `.test.tsx` | hook (precisa de provider) |
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

## ⚠️ As cinco armadilhas que já custaram tempo aqui

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

## O que está coberto (2026-07-25)

344 testes em 26 arquivos.

| Área | Arquivos |
|---|---|
| Registro de módulos | `lib/modulos.test.ts` — inclui invariantes que rodam sobre `MODULOS` inteiro |
| Acessibilidade | `components/dialogos-acessibilidade.test.ts` — invariante **estática**: lê o fonte e exige `DialogDescription` em cada um dos 28 `DialogContent` |
| Schemas Zod (9) | `*Dialog.test.ts`, `pages/Auth.test.ts`, `pages/GerenciarUsuarios.test.ts` |
| Auth | `useAuth.test.tsx` — hierarquia, `colaborador` paralelo, `rolesLoaded`, `signOut` |
| Hooks de dados | `useEditais`, `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useProvaLock`, `useOcorrencias`, `useCoordenadorUnidades`, `useProvas`, `useProvaUnidades`, `useSalasDistribuidas` (+ `useSalasDistribuidasCapacidade` e `useFiscaisSala`) |
| UI | `EditalDialog.ui.test.tsx`, `ProvaDialog.ui.test.tsx` |

**Sem cobertura ainda — 7 hooks** (a lista já esteve errada, dizendo 8 quando eram 12): `useUnidadesProva`, `useSalasProva`, `useUnidadeCapacidade`, `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useUsers`, `useBancos`. Mais **10 dos 12 diálogos**, **as 23 páginas** (zero cobertura — daí os guards de papel não terem rede) e **as 8 Edge Functions** (rodam em Deno, fora do alcance desta suíte).

O inventário completo, com ordem de prioridade e o que **não** se testa aqui, está no [`backlog.md`](../../backlog.md) → "Completar a suíte de testes (Vitest)".

## O princípio

Os testes miram **comportamento e contrato**, não cobertura de linhas — para sobreviverem a refatoração. E acabam servindo de documentação executável: ao contrário de um `.md`, este texto **quebra quando deixa de ser verdade**.

**Invariante estática é um tipo válido de teste aqui.** Quando a regra vale para *todos* os arquivos de uma categoria e renderizar cada um custaria mais que o problema, ler o fonte e afirmar a regra cobre tudo de uma vez — é o que faz o `dialogos-acessibilidade.test.ts` com os 28 diálogos. Dois cuidados ao escrever uma dessas: inclua uma asserção de que **a varredura achou arquivos** (senão o teste passa por vacuidade quando o caminho quebra), e **prove que ela falha** removendo a propriedade de propósito uma vez, antes de confiar nela.

Onde um teste afirma comportamento **errado** de propósito, ele leva `⚠️ DEFEITO` no nome e um comentário explicando por quê. O teste vira então um alarme invertido: **ele quebra quando o bug é corrigido**, e é esse o sinal de que deve ser reescrito para o comportamento certo.

O ciclo já se fechou uma vez, e vale como modelo: dois testes de `useProvaLock` afirmavam que `isLoading` ficava preso em `true`, porque ficava; ao consertar o hook em 2026-07-25 eles quebraram, como previsto, e foram reescritos como **teste de regressão** — mesma montagem, asserção invertida, e o comentário passou de "defeito conhecido" para "isto já quebrou uma vez, não deixe voltar". Preserve esse comentário: é ele que impede alguém de "simplificar" o `else` que resolve o estado.

**Há hoje um teste marcado `⚠️ DEFEITO`:** o de `useOcorrencias`, que afirma que uma lista **vazia** de unidades não restringe nada e devolve a prova inteira. O item correspondente está no `backlog.md` — a regra é essa: **marca sem item vira defeito aceito por esquecimento**, então abra os dois na mesma unidade de trabalho.

Existe também a marca mais fraca **`⚠️ ATENÇÃO`** (em `useCoordenadorUnidades`), para quando o comportamento **não é defeito do hook**, mas morde quem o consome — ali, o fato de "lista vazia" ser indistinguível de "ainda carregando" sem olhar `isLoading`. Não abre item de backlog; existe para quem for mexer no hook não achar que pode simplificar aquilo.
