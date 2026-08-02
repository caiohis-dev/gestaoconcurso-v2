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

`src/pages/guards.test.tsx` testa a AUTORIZAÇÃO de todas as páginas, e o padrão dele vale para os próximos. Três decisões que não são óbvias:

**1. O `useAuth` é mockado, não o `AuthProvider`.** O objeto de teste é o guard ("dado este estado de auth, para onde vai?"), não o provider — que tem cobertura própria em `useAuth.test.tsx`. Montar o provider real obrigaria a simular sessão do Supabase para alcançar cada combinação, e a janela do `rolesLoaded` é praticamente inalcançável por ali. O mock usa `vi.hoisted` para o objeto mutável de estado, porque `vi.mock` é içado.

**2. Uma `<Sonda>` com `useLocation` dentro do `MemoryRouter`, e uma rota `*` sentinela.** O que se afirma é o `pathname` em que o router parou. Assim tanto `<Navigate>` em tempo de render quanto `useEffect` + `navigate` são medidos do mesmo jeito, sem espiar implementação.

**3. A bateria compõe como o `App.tsx` compõe.** Desde a centralização dos guards, cada entrada da matriz declara os papéis que a rota exige e o harness embrulha a página no `RequireAcesso` — senão a bateria testaria uma composição que não existe. É o que a manteve como especificação depois de os guards saírem das páginas.

**4. Toda tabela e RPC do app devolvem lista vazia.** O default do mock é `{ data: null }`, e várias páginas chamam `.some()`/`.map()` sem coalescer — o teste mediria o TypeError, não a autorização.

### Testar o COMPORTAMENTO de uma página (novo em 2026-07-27)

Guard e comportamento são baterias separadas, e de propósito: a matriz de guards mede
"quem entra", e um `.ui.test.tsx` de página mede o que a tela faz depois disso. As duas
telas de Candidatos foram as primeiras. O que se aprendeu ali:

- **Mocke `useAuth` e `useNavigate`, não o router inteiro.** `vi.importActual` + spread
  preserva `MemoryRouter` e `Link` (de que o `Layout` depende) e troca só o `useNavigate`,
  que é o que se quer afirmar.
- **Não coloque espera fixa no helper que renderiza.** Uma página que troca o cabeçalho
  inteiro no estado vazio (é o caso de `Candidatos` sem edital) trava qualquer
  `findByRole("heading", …)` genérico. Cada teste espera pelo que ele mesmo afirma.
- **Input de arquivo `hidden` não aceita `user.upload`** — o userEvent recusa elemento
  invisível. Use `fireEvent.change(input, { target: { files: [arquivo] } })`, que é o que
  dispara o `onChange` de verdade.
- **Planilha de teste se monta com o próprio `xlsx`** (`aoa_to_sheet` + `write({type:"array"})`)
  e se entrega como `File`. É o único jeito de exercitar o caminho real de leitura — e,
  no caso de candidatos, as duas colunas de mesmo nome que são a origem da armadilha.
  Redefina `arrayBuffer` no `File` se o jsdom não o trouxer.

## ⚠️ As nove armadilhas que já custaram tempo aqui

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

**8. 🔴 Teste verde pode estar GUARDANDO um defeito — e o comentário dele te convence de que é regra.** Apareceu em 2026-07-30. O teste dizia *"duas linhas com CPF impossível não viram duas: o CPF vira NULL e a chave é a mesma"*, com um comentário explicando por que aquilo era necessário. Estava verde desde 27/07. Só que os dois CPFs do arquivo real são **valores diferentes**: ao virarem `NULL`, a chave natural ficava idêntica e o `deduplicar()` **fundia dois inscritos num só** — um sumia da lista, que é o único erro grave possível naquela tabela. O teste não estava errado sobre o comportamento; estava errado sobre o comportamento ser **desejável**.

> **Como detectar:** quando um teste afirma que duas coisas **colapsam**, pergunte se elas eram a mesma coisa. Fusão silenciosa é o oposto de duplicação e ninguém a procura, porque o sintoma é "tem menos linha do que eu esperava" — e quem importa 7.416 inscritos não conta.
>
> **A regra que fica:** ao mudar uma regra de negócio, os testes que caem **não são obstáculo, são a pergunta**. Cada um deles afirmava algo; antes de reescrever, decida se aquilo era verdade ou só era o que o código fazia.

**9. ⚠️ No jsdom, gerar arquivo GRAVA ARQUIVO — a suíte suja a raiz do repo.** São duas funções, e a segunda só apareceu quando o segundo lugar passou a exportar:

| Chamada | O que faz no jsdom | Como neutralizar |
|---|---|---|
| `doc.save(...)` (jsPDF) | escreve o `.pdf` no diretório atual | mocke `criarDocumentoPaisagem` e troque `doc.save` por um spy |
| `XLSX.writeFile(...)` | escreve o `.xlsx` no diretório atual | mocke o módulo `xlsx` com `{ ...real, writeFile: spy }` |

A primeira custou **4 PDFs commitáveis na raiz** antes de alguém notar, em 01/08. O spy não é só limpeza: é ele que permite afirmar **o nome do arquivo** e, no caso do XLS, **quais abas o workbook levou** — asserção que pegou o caso de a aba "Cargos" sair vazia onde deveria não existir.

⚠️ **Vale para qualquer teste novo que exporte.** Rode `git status` depois de escrever um: arquivo gerado aparecendo como não rastreado é o sintoma.

## O que está coberto (2026-07-27)

**974 testes em 51 arquivos** (medido em 2026-07-30, ao fim do tema "dado inválido entra cru"; eram 965 em 29/07). O módulo Candidatos sozinho responde por **206** deles.

⚠️ **Os 9 testes novos de 30/07 quase todos AFIRMAM O CONTRÁRIO do que a suíte afirmava na véspera** — a decisão inverteu a regra (o campo impossível deixou de virar `NULL` e passou a entrar cru). **Um deles guardava um defeito**: "duas linhas com CPF impossível não viram duas" descrevia o `deduplicar()` fundindo dois inscritos distintos num só. É o caso exemplar da armadilha 8 abaixo.

✅ **Os três arquivos que estavam marcados como "nunca executados" rodaram.** `useCandidatos.test.tsx` (24), `Candidatos.ui.test.tsx` (23) e `CandidatosImportar.ui.test.tsx` (18) — os primeiros testes de comportamento de página do projeto.

⚠️ **Dois deles estavam vermelhos, e os dois eram erro do teste, não do código.** Vale como aviso porque são modos de falha fáceis de repetir:

1. **Contar caractere de escape na mão.** O teste do filtro esperava UM espaço onde há DOIS: em `"SOUZA, A (50%)"`, o `%` e o `)` viram **cada um** um espaço. Prefira montar a string esperada por composição (uma constante com o trecho normalizado) a digitá-la inteira.
2. **Regex de substring em texto que se repete na tela.** `/7416 inscrito\(s\)/` casa tanto com o cabeçalho da lista quanto com o card `"7416 inscrito(s) importado(s)"`, e o teste morre por ambiguidade. Quando dois elementos legitimamente exibem o mesmo número, use **busca exata**.

A lição geral: **teste que nunca rodou não é cobertura, é intenção** — e ao rodá-lo pela primeira vez, desconfie do teste antes do código.

⚠️ **O que esta suíte NÃO cobre, e é preciso saber:** ela mocka o Supabase, então **não exercita RLS, constraints, triggers nem transação**. Todo o trabalho de banco de 2026-07-26 (RESTRICTs, triggers, RPCs transacionais e o recorte de RLS) e o de 2026-07-27/28 (`candidatos`, `cargos`, `cargo_apelidos`, a troca da chave natural e o trigger de reapontamento) foi verificado **à mão contra o banco local**, com `ROLLBACK` e controle positivo. Quem mexer nessas regras refaz a verificação manualmente — as consultas estão em [`invariantes.md`](./invariantes.md), em [`../../../docs/bateria-cargos.sql`](../../../docs/bateria-cargos.sql) e no [`backlog.md`](../../backlog.md).

### ⭐ Verificar pelo POSTGREST, não só por SQL

Quando a regra depende de o **app** acertar (upsert com `on_conflict`, tradução de erro), SQL direto no psql **não prova nada**: ele passaria mesmo com o app quebrado. O caso real é o índice único da importação — é o PostgREST que precisa *inferir* o índice a partir do `on_conflict`, e o jeito de provar que inferiu é o **controle positivo**: reimportar com um campo mudado e ver que **atualizou**. Sem ele, "não duplicou" pode ser só o insert falhando em silêncio.

Foi assim que as chaves de 27/07 e 28/07 foram verificadas, e é assim que se repete.

⭐ **O mesmo vale para JOIN embutido (`select` com relação).** A suíte prova que o hook *manda* a string; só o PostgREST diz se ela é válida, se a relação devolve **objeto ou array**, e se o join é à esquerda. Medido em 29/07 na listagem de candidatos: o embed padrão devolve 3 linhas (a de FK nula com `"cargos": null`), e `cargos!inner` devolve **2** — o inscrito sem cargo desaparece **e o `Content-Range` cai junto**, então o contador concorda com o erro. É defeito que nenhum teste sobre mock pode ver.

⚠️ Um achado que só apareceu por aí: o **SQLSTATE customizado de um trigger chega em `error.code`, nunca dentro de `error.message`**. Um tradutor de erro que case por `includes('<codigo>')` na mensagem é guarda que não pode disparar.

### ⭐ Duas práticas que 2026-07-27 consolidou

**1. Falsificar antes de aceitar.** Teste que passa de primeira sobre um mock pode estar afirmando o mock. A cada asserção central, sabote o código e confira que cai *exatamente* o teste esperado — e nada além. No tema Cargos isso rodou nove vezes; a que mais valeu foi trocar `ignoreDuplicates` de `true` para `false`, porque o defeito que ela guarda (criar um cargo renomeando outro) é invisível na tela.

> ⭐ **A falsificação também diz QUAL teste tem dentes, e a resposta surpreende.** Na etapa 6 (29/07), o teste marcado ⭐ era *"a lista mostra o cargo canônico, não o texto sujo"*, com asserção negativa incluída. Sabotando a coluna para `c.cargos?.nome ?? c.cargo ?? "—"` — o *fallback esquecido*, que é o erro realista — ele **passou**: o fixture tinha cargo canônico, então o fallback nunca disparava. Quem pegou foi o teste auxiliar, o do inscrito **sem** `cargo_id`. **Asserção negativa só tem dentes se o fixture puder chegar ao ramo errado**; o caso de borda é que guardava a regra, e sem a sabotagem eu teria confiado no teste errado.

**2. `npm test` sozinho NÃO é o gate.** `CODIGOS_POSTGREST.RLS` não existe — a constante só tem `DUPLICADO` e `CHAVE_ESTRANGEIRA`, e os ~10 arquivos que precisam do 42501 usam o literal. O vitest passou **verde** com a chave inexistente (`undefined` em runtime não quebra o mock); quem pegou foi o `tsc`. Fechar tema exige os três comandos, sempre.

### ⚠️ Endurecer uma regra transforma o teste que a guardava

Quando uma regra passa de *aviso* para *impedimento*, o teste que a protegia não "quebra": ele **muda de objeto**. Aconteceu com o mais importante do módulo Candidatos — era *"ALERTA EM VERMELHO quando o cargo está sem parear"* (aviso ignorável, única barreira contra a perda de 396 inscritos) e virou *"sem o cargo pareado NÃO DÁ para avançar"*.

Duas coisas a fazer nesse momento, e as duas são fáceis de esquecer:
- **manter a exigência de que a tela EXPLIQUE** — barrar sem orientar só troca um problema por outro;
- **procurar o código morto que o endurecimento criou.** Ali, dois trechos ficaram inalcançáveis (um alerta dentro de uma prévia que só aparece depois da condição, e um ramo de "nenhum cargo lido" que virou impossível). **Guarda que não pode disparar é armadilha, não segurança.**

✅ **`lib/candidatos-import.test.ts` (40) é a exceção que vale imitar.** A lógica difícil da importação de candidatos — pareamento de colunas, conversão de data/hora, a distinção erro-vs-aviso, a deduplicação — foi posta num módulo **puro** (`src/lib/candidatos-import.ts`), fora do componente. Por isso tem teste de verdade, sem mock nenhum. Compare com `CadastroLote.tsx`, onde a mesma classe de lógica vive dentro de um componente de 1.100 linhas e **não tem como ser exercitada**. Ao escrever importador novo, separe primeiro a parte pura.

| Área | Arquivos |
|---|---|
| Registro de módulos | `lib/modulos.test.ts` — inclui invariantes que rodam sobre `MODULOS` inteiro |
| **Importação de candidatos** | `lib/candidatos-import.test.ts` (40) — **puro, sem mock**: pareamento por índice, conversores, erro-vs-aviso e deduplicação. Os casos de dado sujo são medidos no arquivo real de 7.416 inscritos |
| Acessibilidade | `components/dialogos-acessibilidade.test.ts` — invariante **estática**: lê o fonte e exige `DialogDescription` em cada um dos 31 `DialogContent` (contando as variantes AlertDialog/Sheet) |
| Schemas Zod (9) | `*Dialog.test.ts`, `pages/Auth.test.ts`, `pages/GerenciarUsuarios.test.ts` |
| Auth | `useAuth.test.tsx` — hierarquia, `colaborador` paralelo, `rolesLoaded`, `signOut` |
| Hooks de dados | `useEditais`, `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useProvaLock`, `useOcorrencias`, `useCoordenadorUnidades`, `useProvas`, `useProvaUnidades`, `useSalasDistribuidas` (+ `useSalasDistribuidasCapacidade` e `useFiscaisSala`), `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useUsers`, `useUnidadesProva`, `useSalasProva`, `useUnidadeCapacidade`, `useBancos` — **a camada está fechada** |
| UI | `EditalDialog.ui.test.tsx`, `ProvaDialog.ui.test.tsx`, **`PasswordConfirmDialog.ui.test.tsx`** (16 — a barreira das ações destrutivas), **`CoordenadoresProvaDialog.ui.test.tsx`** (23 — a concessão de acesso de coordenador), **`ValoresFuncaoProvaDialog`** + **`MetaColaboradoresDialog`** (20 + 13 — o caminho do dinheiro), **`CorrigirEmailAcessoDialog`** (16 — a âncora de identidade), **`UnidadeProvaDialog`** · **`FuncaoColaboradorDialog`** · **`SalaProvaDialog`** · **`SalaExtraDialog`** (42 no total) |
| **Guards de página** | `pages/guards.test.tsx` — 151 testes: a matriz **21 páginas × 5 papéis**, mais a janela do `rolesLoaded` e o `isLoggingOut` |
| **Hooks de candidatos** | `hooks/useCandidatos.test.tsx` (28) — paginação com `count` do servidor, `onConflict` da chave natural, o **join do cargo canônico** (e que ele é à esquerda), o **recorte por cargo no servidor** com controle positivo, blocos de 1.000, parada no meio e tradução de erro |
| **Hooks de cargos** | `hooks/useCargos.test.tsx` — a **assimetria dos dois upserts** (`ignoreDuplicates` em `cargos`, `merge` em `cargo_apelidos`), o `isLoading` distinguível de lista vazia, e o nome repetido que vira associação em vez de erro |
| **Páginas de candidatos** | `pages/Candidatos.ui.test.tsx` (34) e `pages/CandidatosImportar.ui.test.tsx` (38) — os **primeiros testes de comportamento de página** do projeto (até aqui, das páginas só o guard era testado). O do assistente monta um `.xlsx` real e guarda o alerta que impede a perda silenciosa de inscritos; o da listagem guarda o **cargo canônico** (com o par negativo: o texto sujo NÃO aparece mais) e a **regressão do "limpar edital"**, que anunciava o total filtrado numa ação que apaga o edital inteiro |

**A camada de hooks fechou em 2026-07-26** — os 20 hooks de dados têm teste (`use-mobile` e `use-toast` são utilitários do shadcn, fora da conta). **Os 12 diálogos estão cobertos.**

### Edge Functions (Deno)

As **Edge Functions** (que rodam em Deno e interagem direto com o banco/Auth) estão fora do escopo do Vitest e ganharam uma infraestrutura própria em 2026-07-28 usando o test runner nativo do Deno (`deno test`). Elas são tratadas como **testes de integração reais** contra o Supabase local (exigindo que a stack do banco esteja online via `npx supabase start`).

O coração dessa infraestrutura é o `supabase/functions/_shared/test-utils.ts`, que forja JWTs localmente (usando a constante `JWT_SECRET` e a biblioteca `jose`). Isso resolve o maior obstáculo desse tipo de teste: permite invocar funções assumindo qualquer papel (como `superadmin` ou `admin`) sem precisar trafegar senhas ou fazer requisições lentas de login no Auth.

| Função | Cobertura |
|---|---|
| `create-admin` | `index.test.ts` (8 cenários). Garante recusas (`401`/`403`) para tokens anônimos, lixos ou de administradores não-super. Impede concessões ilícitas (ex: criar papel "coordenador" avulso que corromperia o painel), verificando no próprio banco se o dado foi preservado intacto. |

*(Baterias manuais prévias, como a `docs/bateria-create-admin-autorizacao.md`, tornaram-se obsoletas com esta infraestrutura e são mantidas apenas para registro histórico.)*

#### Como rodar — e as duas pré-condições que ninguém tinha escrito

### 🔵 Desde 2026-08-02: `npm run test:ef`

Com a stack de pé, é só isso:

```bash
npm run test:ef                      # todos os testes de EF
npm run test:ef -- supabase/functions/create-admin/index.test.ts   # um arquivo
```

O script (`scripts/test-ef.sh`) lê as três variáveis do próprio `supabase status`, então elas não vivem copiadas em lugar nenhum. **Executado em 02/08: 8 passos, todos verdes, sem resíduo no banco** — o teste tinha 4 dias sem nunca ter rodado.

**A decisão de instalar o Deno**, com o que foi medido, está em [`../../analises/concluidos/backlog-itens-concluidos.md`](../../analises/concluidos/backlog-itens-concluidos.md).

⚠️ **`deno` NÃO é dependência do projeto** e não entra no `package.json` — é um binário à parte (2.9.4, em `~/.deno/bin`). O script o localiza e, se faltar, **falha com a instrução de instalação** em vez de sumir em silêncio.

⚠️ **`npm test` continua sem alcançar esta camada.** Instalar o Deno resolveu *"não dá para rodar"*; **não** resolveu *"nada avisa"*. Enquanto o CI não existir, rodar `test:ef` continua dependendo de alguém lembrar — a diferença é que agora existe um comando descoberto, e não três `export` enterrados nesta doc.

> O comando cru, se precisar dele fora do script:
> ```bash
> export SUPABASE_URL="http://127.0.0.1:54321"
> export SUPABASE_ANON_KEY="<ANON_KEY>"
> export SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"
> deno test --allow-net --allow-env supabase/functions/create-admin/index.test.ts
> ```

🔴 **As três variáveis são obrigatórias, e desde 2026-07-31 a ausência LANÇA.** Antes, `callFunction` omitia o header `Authorization` quando `SUPABASE_ANON_KEY` faltava — e o caso *"A1 — Anon Key crua (401)"* passava a exercitar **"requisição sem header nenhum"**, que também dá 401. O teste seguia verde afirmando outro cenário, e o que ele existe para guardar — que **`verify_jwt` não é autorização**, porque a anon key *é* um JWT válido e público, a falha que já apareceu em `send-email` e `create-admin` — deixava de ser coberto. `getAdminClient` já lançava; `callFunction` passou a fazer igual.

Para testar de propósito a ausência de header, passe `""` como token — é explícito, e não se confunde com env var faltando.

### 🔴 Antes de escrever teste para OUTRA Edge Function

São **9 EFs e apenas 1 tem teste** (`create-admin`). Expandir esbarra numa condição deste ambiente que não vale a pena descobrir do jeito errado:

⚠️ **`public-create-colaborador`, `reivindicar-acesso`, `recuperar-senha` e `send-email` ENVIAM E-MAIL DE VERDADE daqui**, e o banco local é cópia de produção — 771 endereços reais. Um teste que dispare qualquer uma delas contra a linha errada manda e-mail com SPF/DKIM da FEVRE para a caixa de uma pessoa real. Ver [`integracoes-externas.md`](./integracoes-externas.md).

**`create-admin` é o único que roda sem combinado prévio: ele não envia e-mail** (verificado em 02/08), e o teste usa endereços `@exemplo.com` com `email_confirm: true`, que suprime a confirmação nativa.

⚠️ **Estes testes são de INTEGRAÇÃO e criam/apagam usuários reais no Auth local.** O de `create-admin` tem teardown e foi verificado sem deixar resíduo; se um passo estourar antes dele, sobra conta `test_runner_*` num banco que é cópia de prod.
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
