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
| `/colaboradores` | `Colaboradores.tsx` (era `/` até 2026-07-24) | ⚠️ **só login** — ver abaixo |
| `/cadastro` | `Cadastro.tsx` | `isAdmin \|\| isCoordenador` |
| `/cadastro-lote` | `CadastroLote.tsx` | `isAdmin \|\| isCoordenador` |
| `/provas` | `Provas.tsx` (171 l.) | `isAdmin \|\| isCoordenador` |
| `/gerenciar-prova/:provaId` | `GerenciarProva.tsx` | `isAdmin \|\| isCoordenador` |
| `/unidades-prova` | `UnidadesProva.tsx` (199 l.) | `isAdmin` |
| `/salas-prova/:unidadeId` | `SalasProva.tsx` (260 l.) | `isAdmin` |
| `/gerenciar-salas-distribuidas/:provaId/:unidadeId` | `GerenciarSalasDistribuidas.tsx` (435 l.) | `isAdmin` |
| `/gerenciar-colaboradores-prova/:provaUnidadeId` | `GerenciarColaboradoresProva.tsx` (935 l.) | `isAdmin \|\| isCoordenador` |
| `/ocorrencias-prova/:provaId` | `OcorrenciasProva.tsx` | `isAdminOrSuper \|\| isCoordenador` |
| `/funcoes-colaboradores` | `FuncoesColaboradores.tsx` (236 l.) | login (+ ações restritas na UI) |
| `/documentos-impressao/:provaId` | `DocumentosImpressao.tsx` | `isAdmin` **+ `prova_finalizada`** |
| `/painel-dados-colaboradores/:provaId` | `PainelDadosColaboradores.tsx` | `isAdmin` |

⚠️ **`/colaboradores` não checa papel.** O `useEffect` só manda para `/auth` quem não está logado; não há `navigate("/")` por papel como nas demais. Qualquer conta autenticada — inclusive `user` puro ou colaborador — alcança a página digitando a URL. **Não é vazamento**: desde a 2D a RLS de `colaboradores` só devolve a própria linha a quem não é admin/coordenador, então a lista chega vazia ou com uma linha. Mas é inconsistência real com as outras 14 páginas, e é exatamente o caso que o `RequireModulo` do backlog resolveria de uma vez.

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
| `useColaboradores`, `useColaboradoresProva`, `useCoordenadoresProva`, `useValoresFuncaoProva`, `useMetaColaboradoresUnidade`, `useProvaLock` | `useProvas`, `useProvaUnidades`, `useSalasDistribuidas`, `useUnidadesProva`, `useSalasProva`, `useFuncoesColaboradores`, `useFuncoesAssociadas` |
| Schemas Zod: `ColaboradorDialog`, `UnidadeProvaDialog`, `SalaProvaDialog`, `FuncaoColaboradorDialog`, `ProvaDialog` | UI dos diálogos, exceto `ProvaDialog` |

⚠️ Dois testes de `useProvaLock` estão marcados **`⚠️ DEFEITO`** e afirmam o comportamento **errado** de propósito (o `isLoading` preso — ponto 7 abaixo). Vão quebrar quando o bug for corrigido; é o sinal de que devem ser reescritos.

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

1. **UUIDs de coordenação hardcoded** em `useCoordenadoresProva.tsx` (`FUNCOES_COORDENACAO`). Recriar essas linhas de `funcoes_colaboradores` quebra a elegibilidade de coordenador **em silêncio**. Detalhe em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).
2. **Template vs. snapshot de sala** — confundir `sala_prova` com `salas_prova_distribuidas` é o erro mais fácil deste módulo. Ver [`provas-e-unidades.md`](./provas-e-unidades.md).
3. **`valor_pagamento` é congelado na alocação**, não lido ao vivo de `valores_funcao_prova`. Mudar o valor da função não corrige alocações existentes.
4. **Encerrar ocorrências de uma unidade é irreversível pelo app** — nada devolve `ocorrencias_encerradas` a `FALSE`, nem o `reabrir_prova_unidade`. Ver [`ocorrencias.md`](./ocorrencias.md).
5. **A liberação do lock no `beforeunload` não funciona como está.** `useProvaLock` usa `navigator.sendBeacon` contra `/rest/v1/rpc/release_prova_lock`, e o `sendBeacon` **não permite definir header nenhum** — a requisição sai sem `apikey`/`Authorization`, que o PostgREST exige. Na prática quem devolve a prova é o **timeout de 10 minutos** da `acquire_prova_lock`. *(Conclusão de leitura do código — não testada em runtime.)* Ao mexer aqui, não presuma que a limpeza no unload funciona hoje.
6. **A rota `/treinamento` não existe mais.** O manual do usuário embutido no app (`Treinamento.tsx`, 1547 linhas de JSX estático) foi **excluído em 2026-07-25**: o conteúdo estava envelhecido demais para valer remendo, e manual errado é pior que manual nenhum, porque parece autoridade. Será reescrito do zero — o item no [`backlog.md`](../../../backlog.md) registra o que a versão nova precisa resolver *além* do conteúdo. Se encontrar referência a `/treinamento` em migration, roadmap ou comentário, é história.

7. **⚠️ `useProvaLock` deixa `isLoading` preso em `true`** quando falta parâmetro ou `enabled` é falso — a guarda que resolveria o estado vive *dentro* de `acquireLock`, mas o efeito de mount só a chama quando tudo já existe, então é código morto. **Trava a tela de alocação:** `GerenciarColaboradoresProva.tsx:413` renderiza carregamento enquanto `unidadeLock.isLoading`, e o `enabled` de lá depende de um `userName` vindo de `.then()` **sem `.catch`**. Achado por teste em 2026-07-25; conserto sugerido no [`backlog.md`](../../../backlog.md).
