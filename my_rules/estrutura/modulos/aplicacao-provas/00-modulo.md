# Módulo: Aplicação de Provas

> **Contrato do módulo.** Este arquivo é a porta de entrada: dá o mapa completo (arquivos, tabelas, rotas, fronteiras) e delega o detalhe de cada área aos cinco documentos irmãos. Contrato + doc da área devem bastar para implementar ou refatorar sem reler o codebase; se faltou algo, o defeito é do doc — corrija-o junto com o código. Ver [`../../00-indice.md`](../../00-indice.md).

## Identidade

| | |
|---|---|
| **`id`** em `src/lib/modulos.ts` | `aplicacao-provas` |
| **Nome na UI** | Aplicação de Provas |
| **Papéis com acesso** | `superadmin`, `admin`, `coordenador` |
| **Rota de entrada** | `/dashboard` se `isAdmin`; `/colaboradores` para coordenador |
| **`navLinks`** (header) | Dashboard (admin+), Colaboradores (todos), Provas (todos), Unidades de Prova (admin+) |
| **Ícone** | `ClipboardList` (lucide) |

É o módulo original — todo o sistema era isto até 2026-07-24, quando o hub e o módulo [Editais](../editais/00-modulo.md) o dividiram.

## O que o módulo faz

A logística operacional de aplicar uma prova de concurso: cadastrar quem trabalha (colaboradores), onde (unidades e salas), quem faz o quê e por quanto (funções, metas, alocação, pagamento), o que deu errado no dia (ocorrências) e o que sai impresso no fim (documentos e relatórios).

## Os cinco documentos de área

O módulo é grande demais para um arquivo. O recorte interno é por **feature/domínio** — a unidade de trabalho típica ("adicionar campo em X") toca página + hook + RPC/migration junto:

| Documento | Cobre |
|---|---|
| [`colaboradores.md`](./colaboradores.md) | A entidade `colaboradores`, as unicidades funcionais (CPF, PIS, e-mail, PIX), `user_id` como elo com o Auth, os três fluxos de cadastro, os dois perfis |
| [`provas-e-unidades.md`](./provas-e-unidades.md) | `provas`, `unidades_prova`, `sala_prova` (template) vs. `salas_prova_distribuidas` (snapshot), ciclo de vida, lock de edição |
| [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md) | `funcoes_colaboradores`, valores de pagamento, metas por unidade, `colaboradores_prova`, acesso de coordenador |
| [`ocorrencias.md`](./ocorrencias.md) | `ocorrencias_colaborador`, quem aparece no combobox, encerramento por unidade |
| [`documentos-e-relatorios.md`](./documentos-e-relatorios.md) | PDFs client-side, exports do `GerenciarProva`, painel de dados, dashboard |

## Rotas e guards

Todas em `prefixosRota`. **Desde 2026-07-26 a autorização é do `RequireAcesso`, no `App.tsx`** — as páginas não guardam mais a si mesmas. A coluna abaixo é o que a rota declara; ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

| Rota | Página | `papeis` no `RequireAcesso` |
|---|---|---|
| `/dashboard` | `Dashboard.tsx` | `["admin"]` |
| `/colaboradores` | `Colaboradores.tsx` (era `/` até 2026-07-24) | `["admin", "coordenador"]` |
| `/cadastro` | `Cadastro.tsx` | `["admin", "coordenador"]` |
| `/cadastro-lote` | `CadastroLote.tsx` | `["admin", "coordenador"]` |
| `/provas` | `Provas.tsx` (~160 l.) | `["admin", "coordenador"]` |
| `/gerenciar-prova/:provaId` | `GerenciarProva.tsx` | `["admin", "coordenador"]` |
| `/unidades-prova` | `UnidadesProva.tsx` (~185 l.) | `["admin"]` |
| `/salas-prova/:unidadeId` | `SalasProva.tsx` (~245 l.) | `["admin"]` |
| `/gerenciar-salas-distribuidas/:provaId/:unidadeId` | `GerenciarSalasDistribuidas.tsx` (~425 l.) | `["admin"]` |
| `/gerenciar-colaboradores-prova/:provaUnidadeId` | `GerenciarColaboradoresProva.tsx` (~935 l.) | `["admin", "coordenador"]` |
| `/ocorrencias-prova/:provaId` | `OcorrenciasProva.tsx` | `["admin", "coordenador"]` |
| `/funcoes-colaboradores` | `FuncoesColaboradores.tsx` (~230 l.) | `["admin"]` |
| `/documentos-impressao/:provaId` | `DocumentosImpressao.tsx` | `["admin"]` **+ `prova_finalizada`** |
| `/painel-dados-colaboradores/:provaId` | `PainelDadosColaboradores.tsx` | `["admin"]` |

### O histórico, porque explica por que a guarda virou uma só

Três omissões apareceram em três lugares diferentes, e todas eram da mesma engrenagem, não da política:

- **`/colaboradores`** e **`/funcoes-colaboradores`** (2026-07-25) mandavam o deslogado para `/auth` e paravam aí — qualquer conta autenticada alcançava a página pela URL. `isAdmin` só escondia as ações de escrita.
- **`/perfil`** (config geral) não tinha guard nenhum.
- **`/dashboard`** usava `role !== null` como proxy de `rolesLoaded` e **prendia o colaborador puro numa tela branca** — corrigido de graça quando o `RequireAcesso` entrou.

**Três ocorrências da mesma classe não é coincidência:** guard escrito à mão erra por esquecimento, e o erro é silencioso — nada quebra, a página só fica aberta demais. Foi o argumento da centralização, feita em 2026-07-26.

🧪 **A tabela acima tem versão executável:** `src/pages/guards.test.tsx` afirma, para cada rota, quem entra e para onde o recusado vai — e o harness compõe rota + `RequireAcesso` como o `App.tsx`. **Mudou papel de rota? A tabela e o teste andam juntos.**

## Regras de negócio que o BANCO garante (2026-07-25)

Até 2026-07-25 as validações viviam **só** no Zod dos formulários, e uma chamada direta ao PostgREST as ignorava inteiras. A migration `20260725202722_fortificar_constraints_db.sql` espelhou 17 delas como `CHECK`. O mapa completo (regra Zod × coluna × contagem de violações) está em [`../../../analises/concluidos/db-constraints-mapeamento.md`](../../../analises/concluidos/db-constraints-mapeamento.md); a prova de que barram, em [`../../../../docs/bateria-db-constraints.sql`](../../../../docs/bateria-db-constraints.sql).

| Tabela | Garantido |
|---|---|
| `unidades_prova` | nome e sigla não-vazios (após `trim`) — ⚠️ o `unid_andares >= 1` saiu em 03/08 **com a coluna** (`20260804001559`) |
| `sala_prova` | capacidade e número positivos; `sala_andar >= 1` quando informado; 🔵 **`sala_numero` = `sala_andar` × 100 + (1..99)** quando há andar (`chk_sala_numero_casa_com_andar`, 03/08) |
| `provas` | edital denormalizado não-vazio; candidatos positivos; **`hora_final > hora_inicio`** |
| `funcoes_colaboradores` | `cargo_nome` não-vazio |
| `colaboradores` | nome não-vazio; **CPF exatamente 11 dígitos**; telefone positivo; nº da casa não-negativo; e-mail com formato mínimo |

Três coisas que valem saber antes de mexer aqui:

1. **O CPF não era validado por ninguém.** O Zod ainda usa `.length(11)`, que conta **caracteres** — `'abcdefghijk'` passa por ele —, e a coluna é `CHAR(11)`. **Hoje as duas pontas cobrem o buraco, e nenhuma delas é o Zod:** o banco tem `chk_colab_cpf_numerico` (`^[0-9]{11}$`), e o cliente chama **`cpfValido`** (módulo 11, os dois DVs) no `ColaboradorDialog` e no `CadastroLote` — ver [`colaboradores.md`](./colaboradores.md).

   ⚠️ **O `.length(11)` do Zod continua frouxo de propósito?** Não: ele simplesmente não foi mexido. É inofensivo hoje porque a checagem real roda depois dele, mas **não confie no schema Zod como barreira de CPF** — quem barra é `cpfValido` e o banco.
2. **Nos horários, o banco é mais rígido que o formulário.** O Zod declara os horários como `z.string().optional()` e não confere ordem nenhuma; a CHECK barra prova que termina antes (ou no mesmo instante em que) começa. Foi decisão consciente — se um formulário novo permitir salvar isso, o erro vem do banco.
3. **`unid_sigla` e `prova_edital` são `CHAR`**, não `VARCHAR`: o Postgres preenche com espaços, então `length()` é sempre o tamanho da coluna. Só `length(trim(...))` diz alguma coisa.

➕ **Complemento de 2026-07-26 — `20260726150000_check_valores_nao_negativos.sql`.** O tema dos 17 mirou **formatos**, e deixou sem barreira os dois números do caminho do dinheiro. Entraram dois CHECKs de piso zero: `valores_funcao_prova.valor_pagamento >= 0` e `meta_colaboradores_unidade.quantidade_meta >= 0` — medidos antes (24 e 186 linhas, zero violações). O gatilho foi um defeito real: o `min="0"` do input **não valida nada** sem submit de `<form>`, e o `ValoresFuncaoProvaDialog` não tem form, então `-150` entrava na base de pagamento.

**O piso é `>= 0`, não `> 0`, nos dois casos.** `quantidade_meta = 0` é como se **zera** uma meta, e `valor_pagamento = 0` cobre função voluntária — o que não se defende é o negativo, que só pode ser engano.

**Ficaram de fora, de propósito:** o teto de `sala_andar` (dependia de `unid_andares` de *outra* tabela — `CHECK` não expressa, e um `CHECK` com função consultando outra tabela **não é reavaliado** quando ela muda, virando mentira silenciosa);

> 🔵 **Em 2026-08-03 o problema deixou de existir em vez de ser resolvido:** `unid_andares` foi dropada e **não há mais teto de andar por unidade**. A regra entre tabelas que nenhum `CHECK` conseguia expressar simplesmente não é mais uma regra. O que ficou no banco é a coerência número↔andar dentro da própria linha (`chk_sala_numero_casa_com_andar`), que um `CHECK` expressa muito bem.

Também ficaram de fora: o dígito verificador do CPF (algoritmo, não formato); e o teto de 99 andares (número redondo de formulário, não limite de prédio).

## Tabelas que o módulo possui

```
colaboradores ─────┬──< colaboradores_prova >──┬── funcoes_colaboradores
                   │         │                 └── valores_funcao_prova (por prova)
                   │         └──< coordenadores_prova
                   └──< ocorrencias_colaborador

provas ──< prova_unidades ──< salas_prova_distribuidas   (snapshot da prova)
   │            │
   │            └──< meta_colaboradores_unidade
   │
   └── prova_edit_locks

unidades_prova ──< sala_prova                            (template reutilizável)

bancos                      catálogo, populado por migration
email_atualizacao_log       histórico congelado (232 envios); não é mais alimentado
```

**Não pertencem ao módulo** (mas ele lê): `editais` (módulo Editais), `profiles`/`user_roles`/`auth.users`/`reivindicacao_rate_limit` (transversal de auth).

**Tabelas que já existiram e foram dropadas** — se aparecerem em migration antiga, são história, não schema vivo: `sala_colaboradores` (dropada em `20251225183722`), `colaborador_sessions` e `colaboradores_backup_20260701`.

## RPCs consumidas

Todas `SECURITY DEFINER`, chamadas via `supabase.rpc(...)`:

| RPC | Onde | Nota |
|---|---|---|
| `finalizar_prova`, `finalizar_prova_unidade` | ciclo de vida | |
| `reabrir_prova`, `reabrir_prova_unidade` | ciclo de vida | só superadmin **ou** quem finalizou |
| `encerrar_ocorrencias_unidade` | `OcorrenciasProva` | **sem RPC simétrica de reabertura** — ver `ocorrencias.md` |
| `acquire_prova_lock`, `update_prova_lock_activity`, `release_prova_lock` | `useProvaLock` | chamadas com cast `(supabase.rpc as any)` — ⚠️ **o cast é resíduo, não necessidade** (ver abaixo) |
| `get_coordenador_colaboradores` | `useColaboradores` | recorte do coordenador |
| `get_coordenador_prova_unidade_ids` | `useCoordenadorUnidades` | idem |
| `vincular_unidade_a_prova`, `desvincular_unidade_da_prova` | `useProvaUnidades` | transacionais desde 26/07 — ver `provas-e-unidades.md` |
| `totais_da_prova` | `ProvaTotaisDialog` | 🔵 **10/09** — soma meta × ocupação NO BANCO, uma linha por (unidade × função). `SECURITY INVOKER`, e o `p_prova_unidade_ids` **não é redundante com a RLS** — ver `provas-e-unidades.md` |
| `salvar_salas_distribuidas` | `useSalasDistribuidas` | 🔵 **03/08** — o lote de salas numa transação, com renumeração em dois passos; é o que permite **trocar o número de duas salas** |

> 🔵 **Corrigido em 2026-07-31 — o cast das RPCs de lock.** Esta tabela afirmava que as três *"não estão no `types.ts` gerado"*, e era isso que justificava o `(supabase.rpc as any)` em `useProvaLock`. **As três estão** — `acquire_prova_lock` tem `Args` e `Returns` completos na linha ~1137. O `types.ts` foi regerado em algum momento e a justificativa caducou junto.
>
> ⚠️ **Consequência: o cast virou dívida silenciosa.** Ele desliga a checagem de tipo de três chamadas que hoje poderiam ser verificadas — errar o nome de um parâmetro passa batido no `tsc`. Tirar os três `as any` é mudança pequena e não está feita; **conferir contra os types antes**, porque a assinatura pode ter mudado desde que o cast foi escrito.

**As RPCs do perfil do colaborador** (`get_meu_colaborador`, `update_meu_colaborador`, `update_meus_dados_bancarios`) são chamadas de `PerfilColaborador.tsx`, que é **rota transversal**, não deste módulo — ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

## Hooks

| Hook | Área |
|---|---|
| `useColaboradores`, `useBancos` | colaboradores |
| `useProvas`, `useProvaUnidades`, `useUnidadesProva`, `useSalasProva` (+ `useCapacidadeTemplateUnidades`), `useSalasDistribuidas`, `useUnidadeCapacidade`, `useProvaLock` | provas e unidades |
| `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useColaboradoresProva`, `useCoordenadoresProva`, `useCoordenadorUnidades` | alocação e funções |
| `useOcorrencias` | ocorrências |

Padrão dominante: React Query (`useQuery`/`useMutation` + `invalidateQueries`). **Exceção conhecida:** `PainelDadosColaboradores.tsx` e o `Dashboard.tsx` fazem fetch próprio — não assuma cache automático sem conferir o hook.

## Cobertura de testes

Ver [`../../transversais/testes.md`](../../transversais/testes.md) para infra e convenções.

| Coberto | Sem cobertura |
|---|---|
| **Todos os hooks de dados do módulo** — `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useProvaLock`, `useOcorrencias`, `useCoordenadorUnidades`, `useProvas`, `useProvaUnidades`, `useSalasDistribuidas`, `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useUnidadesProva`, `useSalasProva` (+ `useCapacidadeTemplateUnidades`), `useUnidadeCapacidade` | — |
| Schemas Zod: `ColaboradorDialog`, `UnidadeProvaDialog`, `SalaProvaDialog`, `FuncaoColaboradorDialog`, `ProvaDialog` | UI dos diálogos, exceto `ProvaDialog` |
| Páginas: `GerenciarProva.ui.test.tsx` (17) · `GerenciarSalasDistribuidas.ui.test.tsx` (13) — **comportamento**, não guard | as demais páginas do módulo |

> ⚠️ **Corrigido em 2026-08-03.** A primeira linha listava `useUnidadesProva`, `useSalasProva` e `useUnidadeCapacidade` como **sem cobertura**: os três têm arquivo de teste, e a camada de hooks fechou em 2026-07-26 (ver [`../../transversais/testes.md`](../../transversais/testes.md)). Doc que subestima cobertura faz alguém reescrever teste que já existe.

Não há mais teste marcado `⚠️ DEFEITO` neste módulo: os dois de `useProvaLock` que afirmavam o `isLoading` preso viraram teste de regressão quando o bug foi corrigido, em 2026-07-25.

## Componentes de domínio

`ColaboradorDialog`, `ColaboradoresList`, `ProvaDialog`, `ProvaCard`, `UnidadeProvaDialog`, `SalaProvaDialog`, `SalaExtraDialog`, `FuncaoColaboradorDialog`, `ValoresFuncaoProvaDialog`, `MetaColaboradoresDialog`, `CoordenadoresProvaDialog`.

Fora do módulo, em `src/components/`: `Layout`, `NavLink`, `PasswordConfirmDialog`, `ReivindicarAcessoCard`, `CorrigirEmailAcessoDialog` (transversais) e `EditalDialog` (módulo Editais).

## Fronteiras — o que NÃO é deste módulo

- **Editais.** A prova referencia um edital, e o nome exibido vem do join `prova.editais.nome`; o CRUD e o modelo do edital são do [módulo Editais](../editais/00-modulo.md). A herança edital→prova é de UI e acontece **só na criação** — os campos de cabeçalho e nº de candidatos que a prova usa são **dela**, não do edital.
- **Autenticação, papéis e RLS.** Está tudo em [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md). Este módulo *consome* `useAuth`; não define política.
- **`/cadastro-publico`.** A rota **não** está em `prefixosRota` — é pública, fora de qualquer módulo, e pertence ao funil de acesso. O fluxo está descrito em [`colaboradores.md`](./colaboradores.md) por afinidade de entidade, mas a política (invite, rate limit, anti-enumeração) é transversal.
- **`/perfil-colaborador`, `/perfil`, `/gerenciar-usuarios`.** Config geral, não módulo — decisão de desenho do hub.
- **Envio de e-mail.** Nenhuma tela deste módulo chama a `send-email` (o único caller do front foi aposentado na 2D). Se uma feature nova precisar mandar e-mail, o caminho é uma Edge Function nova — ver [`../../transversais/integracoes-externas.md`](../../transversais/integracoes-externas.md).

## Pontos frágeis conhecidos (leia antes de refatorar)

1. **Papel identificado por dado editável — em dois lugares, de dois jeitos.** É a mesma fragilidade com duas caras, e as duas falham **em silêncio**:
   - **Por UUID:** `useCoordenadoresProva.tsx` traz `FUNCOES_COORDENACAO` hardcoded. Recriar essas linhas de `funcoes_colaboradores` quebra a elegibilidade de coordenador. Detalhe em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).
   - **Por NOME, via substring:** `useFiscaisSala` (em `useSalasDistribuidas.tsx`) decide quem é fiscal de sala com `nome.includes("fiscal") && nome.includes("sala")`, em minúsculas e no JS. Não há id nem flag no banco marcando isso. Logo: "Fiscal de Corredor" **não** entra, "fiscal volante de sala" entra, e **renomear a função no cadastro esvazia a lista sem erro nenhum**. Fixado por teste em `useSalasDistribuidas.test.tsx`.

     > 🔴 **Isto DEIXOU DE SER hipótese — está acontecendo (medido em 2026-08-03).** A única função de fiscal cadastrada chama-se **"Fiscal"**, sem "de sala": das 15 funções com alocação, **nenhuma** casa com as duas palavras, e os seletores "Fiscal 1/2" de `/gerenciar-salas-distribuidas` mostram só "Nenhum" — com **456 pessoas alocadas como Fiscal** e **0 fiscais atribuídos** nas 58 salas. Não corrigir foi **decisão do usuário em 03/08**; o item, os números e as duas saídas possíveis estão em [`../../../backlog.md`](../../../backlog.md).

   Ao mexer no cadastro de funções, lembre-se de que **duas telas dependem do conteúdo daquelas linhas**, não só da existência delas.
2. **Template vs. snapshot de sala** — confundir `sala_prova` com `salas_prova_distribuidas` é o erro mais fácil deste módulo. Ver [`provas-e-unidades.md`](./provas-e-unidades.md).
3. **`valor_pagamento` é congelado na alocação**, não lido ao vivo de `valores_funcao_prova`. Mudar o valor da função não corrige alocações existentes.
4. **Encerrar ocorrências de uma unidade é irreversível pelo app** — nada devolve `ocorrencias_encerradas` a `FALSE`, nem o `reabrir_prova_unidade`. Ver [`ocorrencias.md`](./ocorrencias.md).
5. **A liberação do lock ao sair da página passou a funcionar em 2026-07-25** — antes não funcionava, e a armadilha vale registro: era `navigator.sendBeacon`, que **não permite definir header nenhum**, então a requisição saía sem `apikey`/`Authorization` e o PostgREST recusava; quem devolvia a prova era o timeout de 10 min. Agora é `fetch` com `keepalive: true` (sobrevive ao unload **e** aceita headers), no evento **`pagehide`** — que cobre o `beforeunload` e mais: aba mandada para segundo plano no mobile, e navegação que entra no bfcache. **Não volte para `sendBeacon`**, e ao mexer no lock leia o ponto do bfcache em [`provas-e-unidades.md`](./provas-e-unidades.md).
6. **A rota `/treinamento` não existe mais.** O manual do usuário embutido no app (`Treinamento.tsx`, 1547 linhas de JSX estático) foi **excluído em 2026-07-25**: o conteúdo estava envelhecido demais para valer remendo, e manual errado é pior que manual nenhum, porque parece autoridade. Será reescrito do zero — o item no [`backlog.md`](../../../backlog.md) registra o que a versão nova precisa resolver *além* do conteúdo. Se encontrar referência a `/treinamento` em migration, roadmap ou comentário, é história.
7. **Guard de página é declarado NA ROTA, não dentro do arquivo.** Envolva o elemento em `<RequireAcesso papeis={[...]}>` no `App.tsx` — são **20 rotas** assim hoje. Nunca escreva o par bounce-por-login + bounce-por-papel à mão na página: é exatamente o que falhou por omissão **três vezes**, e a centralização de 2026-07-26 existe para tornar o esquecimento impossível.

   > 🔴 **Corrigido em 2026-07-31.** Este item dizia *"guard é escrito à mão, um por arquivo … copie o par completo … `/funcoes-colaboradores` ainda está sem o segundo"*. **Nada disso vale**: os guards foram centralizados em `RequireAcesso` em 26/07, e `/funcoes-colaboradores` tem `papeis={["admin"]}` na rota. O item **ensinava a reintroduzir** o padrão que causou as três falhas.

   ⚠️ **Duas páginas ainda têm um `if (!user) return <Navigate to="/auth" />` interno** — `OcorrenciasProva` e `PainelDadosColaboradores`. É redundante com o `RequireAcesso` da rota, não errado; não copie para página nova.

> **Corrigido em 2026-07-25, mantido aqui como aviso de refatoração:** `useProvaLock` deixava `isLoading` preso em `true` quando faltava parâmetro ou `enabled` era falso — a guarda que resolveria o estado vivia *dentro* de `acquireLock`, que o efeito de mount não chamava nesse caso. Travava a tela de alocação num spinner sem saída. O efeito agora resolve o estado no `else`; **não remova esse `else`** achando que a guarda interna de `acquireLock` cobre o caso — ela continua inalcançável pelo mount. Coberto por teste de regressão em `useProvaLock.test.tsx`.
