# Índice — Documentação de Estrutura do Sistema

> **Última auditoria contra o código: 2026-07-26.** Todos os docs desta pasta foram conferidos linha a linha contra o código e o banco local. O que estava desatualizado foi corrigido no próprio arquivo, com a data. Ver o resumo no commit `docs(estrutura): auditoria completa`.
>
> **Regra que organiza esta pasta:** cada **módulo** do sistema é uma parte isolada e tem documentação própria em [`modulos/`](./modulos/). O doc de um módulo deve bastar para **implementar ou refatorar aquele módulo sem reler o codebase**. Se você precisou varrer o código para entender algo do módulo, isso é um defeito do doc — corrija-o na mesma unidade de trabalho.
>
> Escrito a partir de leitura direta do código-fonte. Ainda assim, são snapshots: confirme no código antes de agir sobre algo que só está documentado aqui.

## Módulos

Os módulos são os de **`src/lib/modulos.ts`** — a fonte de verdade. Módulo novo lá = pasta nova aqui.

| Módulo | Doc | Papéis | Entrada |
|---|---|---|---|
| **Aplicação de Provas** | [`modulos/aplicacao-provas/00-modulo.md`](./modulos/aplicacao-provas/00-modulo.md) | superadmin, admin, coordenador | `/dashboard` ou `/colaboradores` |
| **Editais** | [`modulos/editais/00-modulo.md`](./modulos/editais/00-modulo.md) | superadmin, admin | `/editais` |

O `00-modulo.md` de cada pasta é o **contrato**: identidade, arquivos, tabelas, rotas e guards, RPCs, fronteiras e pontos frágeis. Módulo grande se subdivide **por feature/domínio** dentro da própria pasta — nunca por rota nem por camada técnica:

**Aplicação de Provas** — [`colaboradores.md`](./modulos/aplicacao-provas/colaboradores.md) · [`provas-e-unidades.md`](./modulos/aplicacao-provas/provas-e-unidades.md) · [`alocacao-e-funcoes.md`](./modulos/aplicacao-provas/alocacao-e-funcoes.md) · [`ocorrencias.md`](./modulos/aplicacao-provas/ocorrencias.md) · [`documentos-e-relatorios.md`](./modulos/aplicacao-provas/documentos-e-relatorios.md)

## Transversais

O que atravessa módulos, ou é anterior a eles. Um doc de módulo **referencia** estes em vez de repetir seu conteúdo:

| Arquivo | Conteúdo |
|---|---|
| [`transversais/arquitetura-geral.md`](./transversais/arquitetura-geral.md) | Stack, arquitetura macro (SPA + Supabase, sem backend próprio), estrutura de pastas, mapa de rotas, o mecanismo de módulos e o hub, higiene do repositório |
| [`transversais/auth-e-permissoes.md`](./transversais/auth-e-permissoes.md) | Login único no Supabase Auth (`useAuth`), papéis e `isColaborador`, a porta única "Estou sem minha senha", RLS/RPC, `colab_email` como âncora de identidade, matriz papel × módulo |
| [`transversais/integracoes-externas.md`](./transversais/integracoes-externas.md) | E-mail transacional (tudo pela `send-email`), as 8 Edge Functions |
| [`transversais/desenvolvimento-local.md`](./transversais/desenvolvimento-local.md) | Supabase local via Docker, scripts, a divisão `migrations` / `seed.pos.sql` / `seed.local.sql` |
| [`transversais/testes.md`](./transversais/testes.md) | Vitest + RTL: como rodar, convenções, a infra de `src/test/` (mock do Supabase, helpers de render) e as armadilhas conhecidas |

**Rotas fora de qualquer módulo** (config geral e público), cobertas pelos transversais: `/` (hub), `/auth`, `/redefinir-senha`, `/cadastro-publico`, `/perfil`, `/perfil-colaborador`, `/gerenciar-usuarios`.

## Como manter

1. **Antes de mexer num módulo**, leia o `00-modulo.md` dele. Se não bastou, o doc tem um buraco — tape-o.
2. **Depois de mexer**, atualize os docs daquele módulo *antes* de fechar o tema. Vale para feature nova e para refatoração. Rode também `npm test`, `tsc --noEmit` e `npm run build` — ver [`transversais/testes.md`](./transversais/testes.md).
3. **Módulo novo** em `src/lib/modulos.ts` = pasta nova em `modulos/` com seu `00-modulo.md` + linha na tabela acima.
4. Mudança que não é de módulo nenhum vai para o transversal certo; se não couber em nenhum, provavelmente é transversal novo.
5. Nunca reorganizar por rota ou por camada técnica.

## Fora desta pasta

- [`../analises/`](../analises/) — roadmaps e análises de temas (o desenho e as decisões); concluídos vão para `analises/concluidos/`.
- [`../backlog.md`](../backlog.md) — trabalho planejado e ainda não iniciado.
- [`../versionamento.md`](../versionamento.md) — regras de git (branches, commits, tags, o que nunca versionar).
- [`../banco-producao.md`](../banco-producao.md) — regras do banco de produção e o roteiro de bootstrap da v2.
- [`../historico/`](../historico/) — código aposentado cujo raciocínio vale preservar (hoje, a Edge Function `export-seed`).
- `docs/` (raiz do repo) — baterias de teste manual e documentação pontual de fluxo (ex.: sanitização do cadastro em lote).

**Ordem de leitura para quem chega:** `transversais/arquitetura-geral.md` → `transversais/auth-e-permissoes.md` → o `00-modulo.md` do módulo da tarefa. Para subir o ambiente, vá direto a `transversais/desenvolvimento-local.md`.
