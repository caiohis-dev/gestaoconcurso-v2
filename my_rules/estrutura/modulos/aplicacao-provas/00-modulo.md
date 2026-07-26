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

Todas em `prefixosRota`. **Cada página tem o seu guard, escrito à mão** — não há wrapper central (o `RequireModulo` é item de backlog, deliberadamente fora do tema que criou o hub).

| Rota | Página | Guard efetivo |
|---|---|---|
| `/dashboard` | `Dashboard.tsx` | `isAdmin` |
| `/colaboradores` | `Colaboradores.tsx` (era `/` até 2026-07-24) | `isAdmin \|\| isCoordenador` (desde 2026-07-25) |
| `/cadastro` | `Cadastro.tsx` | `isAdmin \|\| isCoordenador` |
| `/cadastro-lote` | `CadastroLote.tsx` | `isAdmin \|\| isCoordenador` |
| `/provas` | `Provas.tsx` (171 l.) | `isAdmin \|\| isCoordenador` |
| `/gerenciar-prova/:provaId` | `GerenciarProva.tsx` | `isAdmin \|\| isCoordenador` |
| `/unidades-prova` | `UnidadesProva.tsx` (199 l.) | `isAdmin` |
| `/salas-prova/:unidadeId` | `SalasProva.tsx` (260 l.) | `isAdmin` |
| `/gerenciar-salas-distribuidas/:provaId/:unidadeId` | `GerenciarSalasDistribuidas.tsx` (435 l.) | `isAdmin` |
| `/gerenciar-colaboradores-prova/:provaUnidadeId` | `GerenciarColaboradoresProva.tsx` (935 l.) | `isAdmin \|\| isCoordenador` |
| `/ocorrencias-prova/:provaId` | `OcorrenciasProva.tsx` | `isAdminOrSuper \|\| isCoordenador` |
| `/funcoes-colaboradores` | `FuncoesColaboradores.tsx` (236 l.) | `isAdmin` (desde 2026-07-25) |
| `/documentos-impressao/:provaId` | `DocumentosImpressao.tsx` | `isAdmin` **+ `prova_finalizada`** |
| `/painel-dados-colaboradores/:provaId` | `PainelDadosColaboradores.tsx` | `isAdmin` |

✅ **`/colaboradores` ganhou o guard de papel em 2026-07-25.** Até então o `useEffect` só mandava para `/auth` quem não estava logado, e qualquer conta autenticada alcançava a página pela URL. Agora bounce para `/` quem não é `isAdmin || isCoordenador`. Duas notas de implementação que valem para qualquer guard novo:

- **Esperar `rolesLoaded`, não só `loading`.** `useAuth` só faz `setLoading(false)` depois de buscar os papéis, mas cada `applySession` posterior (refresh de token) reabre a janela em que o usuário já existe e os papéis ainda não. Decidir ali expulsaria coordenador para o hub. O idiom correto é o do `Inicio.tsx`: `if (loading || !rolesLoaded) return;`.
- **Respeitar `isLoggingOut`.** Sem isso o logout dispara o bounce por papel antes do redirect do `signOut`.

✅ **`/funcoes-colaboradores` também ganhou o guard**, no mesmo dia e pelo mesmo motivo: era o **outro** caso da mesma omissão (só mandava para `/auth`; `isAdmin` apenas escondia as ações de escrita, então qualquer conta autenticada via a lista de funções em modo leitura). Ficou em `isAdmin` — que inclui superadmin —, decidido pelo usuário: o cadastro de funções é gestão, e o coordenador já vê os nomes das funções na tela de alocação.

**Duas omissões idênticas em 15 páginas não é coincidência** — é o que guard escrito à mão produz, e o erro é silencioso: nada quebra, a página só fica aberta demais. É o argumento do `RequireModulo` no [`backlog.md`](../../../backlog.md), que elimina a classe inteira por construção. Uma **terceira** ocorrência apareceu depois, fora deste módulo — `/perfil`, config geral, sem guard nenhum —, **fechada em 2026-07-26**; ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

🧪 **A tabela acima tem versão executável desde 2026-07-26.** `src/pages/guards.test.tsx` afirma, para cada rota deste módulo, quem entra e para onde o recusado é mandado — inclusive as duas dimensões das notas acima (`rolesLoaded` e `isLoggingOut`). **Mudou guard? A tabela e o teste andam juntos.** Ver [`../../transversais/testes.md`](../../transversais/testes.md).

⚠️ **Um defeito do módulo que a bateria achou:** `/dashboard` **prende o colaborador puro em tela branca**. O guard usa `role !== null` como proxy de `rolesLoaded` — o que evita expulsar admin na janela, mas o colaborador puro tem justamente `role === null`: nunca é mandado ao hub, e o `return null` entrega página vazia. Item no [`backlog.md`](../../../backlog.md).

## Regras de negócio que o BANCO garante (2026-07-25)

Até 2026-07-25 as validações viviam **só** no Zod dos formulários, e uma chamada direta ao PostgREST as ignorava inteiras. A migration `20260725202722_fortificar_constraints_db.sql` espelhou 17 delas como `CHECK`. O mapa completo (regra Zod × coluna × contagem de violações) está em [`../../../analises/concluidos/db-constraints-mapeamento.md`](../../../analises/concluidos/db-constraints-mapeamento.md); a prova de que barram, em [`../../../../docs/bateria-db-constraints.sql`](../../../../docs/bateria-db-constraints.sql).

| Tabela | Garantido |
|---|---|
| `unidades_prova` | nome e sigla não-vazios (após `trim`); `unid_andares >= 1` |
| `sala_prova` | capacidade e número positivos; `sala_andar >= 1` quando informado |
| `provas` | edital denormalizado não-vazio; candidatos positivos; **`hora_final > hora_inicio`** |
| `funcoes_colaboradores` | `cargo_nome` não-vazio |
| `colaboradores` | nome não-vazio; **CPF exatamente 11 dígitos**; telefone positivo; nº da casa não-negativo; e-mail com formato mínimo |

Três coisas que valem saber antes de mexer aqui:

1. **O CPF não era validado por ninguém.** O Zod usa `.length(11)`, que conta **caracteres** — `'abcdefghijk'` passava —, e a coluna é `CHAR(11)`. Nem front nem banco exigiam dígito. Hoje o banco exige.
2. **Nos horários, o banco é mais rígido que o formulário.** O Zod declara os horários como `z.string().optional()` e não confere ordem nenhuma; a CHECK barra prova que termina antes (ou no mesmo instante em que) começa. Foi decisão consciente — se um formulário novo permitir salvar isso, o erro vem do banco.
3. **`unid_sigla` e `prova_edital` são `CHAR`**, não `VARCHAR`: o Postgres preenche com espaços, então `length()` é sempre o tamanho da coluna. Só `length(trim(...))` diz alguma coisa.

➕ **Complemento de 2026-07-26 — `20260726150000_check_valores_nao_negativos.sql`.** O tema dos 17 mirou **formatos**, e deixou sem barreira os dois números do caminho do dinheiro. Entraram dois CHECKs de piso zero: `valores_funcao_prova.valor_pagamento >= 0` e `meta_colaboradores_unidade.quantidade_meta >= 0` — medidos antes (24 e 186 linhas, zero violações). O gatilho foi um defeito real: o `min="0"` do input **não valida nada** sem submit de `<form>`, e o `ValoresFuncaoProvaDialog` não tem form, então `-150` entrava na base de pagamento.

**O piso é `>= 0`, não `> 0`, nos dois casos.** `quantidade_meta = 0` é como se **zera** uma meta, e `valor_pagamento = 0` cobre função voluntária — o que não se defende é o negativo, que só pode ser engano.

**Ficaram de fora, de propósito:** o teto de `sala_andar` (depende de `unid_andares` de *outra* tabela — `CHECK` não expressa, e um `CHECK` com função consultando outra tabela **não é reavaliado** quando ela muda, virando mentira silenciosa); o dígito verificador do CPF (algoritmo, não formato); e o teto de 99 andares (número redondo de formulário, não limite de prédio).

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
| `acquire_prova_lock`, `update_prova_lock_activity`, `release_prova_lock` | `useProvaLock` | chamadas com cast `(supabase.rpc as any)` — não estão no `types.ts` gerado |
| `get_coordenador_colaboradores` | `useColaboradores` | recorte do coordenador |
| `get_coordenador_prova_unidade_ids` | `useCoordenadorUnidades` | idem |

**As RPCs do perfil do colaborador** (`get_meu_colaborador`, `update_meu_colaborador`, `update_meus_dados_bancarios`) são chamadas de `PerfilColaborador.tsx`, que é **rota transversal**, não deste módulo — ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

## Hooks

| Hook | Área |
|---|---|
| `useColaboradores`, `useBancos` | colaboradores |
| `useProvas`, `useProvaUnidades`, `useUnidadesProva`, `useSalasProva`, `useSalasDistribuidas`, `useUnidadeCapacidade`, `useProvaLock` | provas e unidades |
| `useFuncoesColaboradores`, `useFuncoesAssociadas`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useColaboradoresProva`, `useCoordenadoresProva`, `useCoordenadorUnidades` | alocação e funções |
| `useOcorrencias` | ocorrências |

Padrão dominante: React Query (`useQuery`/`useMutation` + `invalidateQueries`). **Exceção conhecida:** `PainelDadosColaboradores.tsx` e o `Dashboard.tsx` fazem fetch próprio — não assuma cache automático sem conferir o hook.

## Cobertura de testes

Ver [`../../transversais/testes.md`](../../transversais/testes.md) para infra e convenções.

| Coberto | Sem cobertura |
|---|---|
| `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useProvaLock`, `useOcorrencias`, `useCoordenadorUnidades`, `useProvas`, `useProvaUnidades`, `useSalasDistribuidas`, `useFuncoesColaboradores`, `useFuncoesAssociadas` | `useUnidadesProva`, `useSalasProva`, `useUnidadeCapacidade` |
| Schemas Zod: `ColaboradorDialog`, `UnidadeProvaDialog`, `SalaProvaDialog`, `FuncaoColaboradorDialog`, `ProvaDialog` | UI dos diálogos, exceto `ProvaDialog` |

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

   Ao mexer no cadastro de funções, lembre-se de que **duas telas dependem do conteúdo daquelas linhas**, não só da existência delas.
2. **Template vs. snapshot de sala** — confundir `sala_prova` com `salas_prova_distribuidas` é o erro mais fácil deste módulo. Ver [`provas-e-unidades.md`](./provas-e-unidades.md).
3. **`valor_pagamento` é congelado na alocação**, não lido ao vivo de `valores_funcao_prova`. Mudar o valor da função não corrige alocações existentes.
4. **Encerrar ocorrências de uma unidade é irreversível pelo app** — nada devolve `ocorrencias_encerradas` a `FALSE`, nem o `reabrir_prova_unidade`. Ver [`ocorrencias.md`](./ocorrencias.md).
5. **A liberação do lock ao sair da página passou a funcionar em 2026-07-25** — antes não funcionava, e a armadilha vale registro: era `navigator.sendBeacon`, que **não permite definir header nenhum**, então a requisição saía sem `apikey`/`Authorization` e o PostgREST recusava; quem devolvia a prova era o timeout de 10 min. Agora é `fetch` com `keepalive: true` (sobrevive ao unload **e** aceita headers), no evento **`pagehide`** — que cobre o `beforeunload` e mais: aba mandada para segundo plano no mobile, e navegação que entra no bfcache. **Não volte para `sendBeacon`**, e ao mexer no lock leia o ponto do bfcache em [`provas-e-unidades.md`](./provas-e-unidades.md).
6. **A rota `/treinamento` não existe mais.** O manual do usuário embutido no app (`Treinamento.tsx`, 1547 linhas de JSX estático) foi **excluído em 2026-07-25**: o conteúdo estava envelhecido demais para valer remendo, e manual errado é pior que manual nenhum, porque parece autoridade. Será reescrito do zero — o item no [`backlog.md`](../../../backlog.md) registra o que a versão nova precisa resolver *além* do conteúdo. Se encontrar referência a `/treinamento` em migration, roadmap ou comentário, é história.
7. **Guard de página é escrito à mão, um por arquivo** — e por isso já falhou por omissão duas vezes (ver a seção de rotas). Ao criar página nova no módulo, copie o par completo: bounce por login **e** por papel, esperando `rolesLoaded`. `/funcoes-colaboradores` ainda está sem o segundo.

> **Corrigido em 2026-07-25, mantido aqui como aviso de refatoração:** `useProvaLock` deixava `isLoading` preso em `true` quando faltava parâmetro ou `enabled` era falso — a guarda que resolveria o estado vivia *dentro* de `acquireLock`, que o efeito de mount não chamava nesse caso. Travava a tela de alocação num spinner sem saída. O efeito agora resolve o estado no `else`; **não remova esse `else`** achando que a guarda interna de `acquireLock` cobre o caso — ela continua inalcançável pelo mount. Coberto por teste de regressão em `useProvaLock.test.tsx`.
