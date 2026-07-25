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

## ⚠️ As quatro armadilhas que já custaram tempo aqui

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

## O que está coberto (2026-07-25)

283 testes em 20 arquivos.

| Área | Arquivos |
|---|---|
| Registro de módulos | `lib/modulos.test.ts` — inclui invariantes que rodam sobre `MODULOS` inteiro |
| Schemas Zod (9) | `*Dialog.test.ts`, `pages/Auth.test.ts`, `pages/GerenciarUsuarios.test.ts` |
| Auth | `useAuth.test.tsx` — hierarquia, `colaborador` paralelo, `rolesLoaded`, `signOut` |
| Hooks de dados | `useEditais`, `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useProvaLock` |
| UI | `EditalDialog.ui.test.tsx`, `ProvaDialog.ui.test.tsx` |

**Sem cobertura ainda:** `useProvas`, `useProvaUnidades`, `useSalasDistribuidas`, `useUnidadesProva`, `useSalasProva`, `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useUsers`, e os demais diálogos.

## O princípio

Os testes miram **comportamento e contrato**, não cobertura de linhas — para sobreviverem a refatoração. E acabam servindo de documentação executável: ao contrário de um `.md`, este texto **quebra quando deixa de ser verdade**.

Onde um teste afirma comportamento **errado** de propósito, ele leva `⚠️ DEFEITO` no nome e um comentário explicando. É o caso de `useProvaLock`: dois testes afirmam que `isLoading` fica preso, porque fica. Eles vão quebrar quando o bug for corrigido — e é esse o sinal de que devem ser reescritos.
