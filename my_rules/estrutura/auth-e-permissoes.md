# Autenticação e Permissões

> Ver [`00-indice.md`](./00-indice.md). Cross-referenciado por [`colaboradores.md`](./colaboradores.md) (portal do colaborador) e [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md) (concessão de acesso de coordenador).

## Um só sistema de login (desde a subetapa 2A, 2026-07-14)

**Antes havia dois modelos de login separados; a refatoração do acesso do colaborador unificou tudo no Supabase Auth.** Hoje existe **um** provider (`useAuth`), montado em `App.tsx`, e uma porta única (`/auth`). Se você está lendo código ou migrations antigas que falam de "código de acesso", "sessão do colaborador no localStorage" ou `useColaboradorAuth`, isso é o mundo anterior — ver o histórico da mudança em [`../analises/roadmap-auth-colaborador.md`](../analises/roadmap-auth-colaborador.md).

### `useAuth` (`src/hooks/useAuth.tsx`) — para todo mundo

- Usa **Supabase Auth** (`supabase.auth.signInWithPassword`, sessão JWT, `onAuthStateChange`).
- **`role`** é o papel de **gestão**, resolvido de `user_roles` pela hierarquia `superadmin` > `admin` > `coordenador` > `user` (superadmin herda admin — ver `isAdmin = role === 'admin' || role === 'superadmin'`).
- **`colaborador` NÃO entra nessa hierarquia** — é dimensão paralela, exposta como **`isColaborador`** (`roles.includes('colaborador')`), não como valor de `role`. O hook guarda o array `roles` completo justamente porque uma pessoa acumula gestão + colaborador (os 12 do backfill). Espremer num papel único rebaixaria os 10 coordenadores que também são colaboradores.
- **`rolesLoaded`**: há uma janela entre `setUser` e o fim do fetch de papéis em que o usuário existe e os papéis ainda não. Quem decide para onde navegar (o `/auth`, as guardas de rota) **espera `rolesLoaded`**, senão decide sobre um conjunto vazio.
- Logout força `window.location.href = '/auth'` (reload completo, para não deixar estado React fantasma) e limpa as chaves `sb-*`/`supabase` do `localStorage`. **Cuidado herdado:** esse reload duro destrói qualquer `navigate(..., { state })` chamado logo depois de `signOut()` — foi o bug que sumiu com a mensagem de sucesso ao salvar o perfil, na 2A.
- Roteamento pós-login (em `Auth.tsx`): admin → `/dashboard`, coordenador → `/`, só-colaborador → `/perfil-colaborador`. Os 12 gestor+colaborador caem na gestão e chegam ao cadastro pelo item de menu "Meu Cadastro".

### O acesso do colaborador aos próprios dados

- A página é `/perfil-colaborador`. O "usuário logado" é **`auth.uid()`** — não há mais objeto de sessão em `localStorage`.
- Os dados vêm das RPCs **`get_meu_colaborador` / `update_meu_colaborador` / `update_meus_dados_bancarios`** (migration `20260714193057`), que resolvem o colaborador por `auth.uid() → colaboradores.user_id` (via `meu_colaborador_id()`), **sem receber id do cliente**. Nascem com `GRANT` só a `authenticated`.
- `INACTIVITY_TIMEOUT` (5 min, em `PerfilColaborador.tsx`) segue deslogando a aba por inatividade — é só UX client-side.
- **Ainda de pé, mas condenado:** as RPCs antigas (`get_colaborador_full_data`, `update_colaborador_data_full`, `verify_colaborador_codigo_acesso`, `set_colaborador_password`, etc.), a coluna `colab_codigo_acesso`, a tabela `colaborador_sessions` e a função `is_colaborador_logged_in` **continuam existindo** — nada mais as usa desde a 2A, e elas são aposentadas na etapa 3 (subetapa D), junto com o `REVOKE` dos `GRANT ... TO PUBLIC`. Não construa nada novo sobre elas.

### Perfis

- `/perfil` — dados do próprio usuário (tabela `profiles`), qualquer conta.
- `/perfil-colaborador` — o cadastro de colaborador de quem tem `isColaborador`.

## Modelo de roles (equipe admin)

- Enum `app_role`: `superadmin`, `admin`, `coordenador`, `user` — e, desde 2026-07-14, **`colaborador`** (migration `20260714162027_*`). Desde a subetapa 2A o front **lê** esse papel, via `isColaborador` no `useAuth` (guarda de `/perfil-colaborador`, item de menu "Meu Cadastro"). Ele **não** entra na hierarquia acima: não é um degrau abaixo de `user`, e sim uma dimensão paralela — dos 15 usuários atuais, **12 são colaboradores**, e são justamente os 2 admins e os 10 coordenadores. Uma pessoa acumula os dois papéis sem contradição, e é por isso que ele vive em `user_roles` (multi-papel) e não numa coluna `tipo` em `profiles`, que forçaria escolher entre gestor e colaborador.
- **O papel já é concedido, e o elo já existe:** desde 2026-07-14, `colaboradores.user_id` (UNIQUE, FK para `auth.users` com `ON DELETE SET NULL`, migration `20260714162029_*`) liga o cadastro à conta, e o **backfill** do `supabase/seed.pos.sql` preencheu-o para esses 12, concedendo-lhes o papel `colaborador`. As outras 759 linhas têm `user_id` NULL e o receberão quando a pessoa se cadastrar (etapa 2). É esse `user_id` que vai ancorar RLS e RPCs em `auth.uid()` no lugar do `p_colaborador_id` que hoje vem do cliente.
- Tabela `user_roles` (`user_id`, `role`) — um usuário pode ter mais de uma role.
- `coordenador` é a role mais restrita das "de equipe": um coordenador só enxerga as provas/unidades a que foi explicitamente vinculado via `coordenadores_prova` (ver `useCoordenadorUnidades.tsx`, que resolve os `prova_unidade_id`s permitidos via RPC `get_coordenador_prova_unidade_ids`). Páginas de gestão (`GerenciarProva`, `OcorrenciasProva`) filtram listas no client usando esse resultado — a filtragem client-side é só UX; a proteção real está nas policies/RPCs que também checam `is_coordenador_prova`.
- Gestão de usuários/roles é feita em `/gerenciar-usuarios` (`useUsers.tsx`), restrita a `superadmin` na navegação.

### Duas formas distintas de conceder acesso de coordenador — atenção ao mexer aqui

Existem **dois caminhos diferentes** no código para dar acesso de coordenador a um usuário, com precondições distintas:

1. **`useCoordenadoresProva.createMutation`** (usado em `CoordenadoresProvaDialog`, dentro do fluxo normal de gestão de uma prova) — exige que já exista um registro em `colaboradores_prova` para aquele colaborador com uma função de coordenação (`FUNCOES_COORDENACAO`, ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md)) e apenas vincula `user_id` a esse `colaborador_prova_id` existente.
2. **`useUsers.addCoordenadorAccess`** (usado em `/gerenciar-usuarios`) — caminho mais "de emergência": adiciona a role `coordenador` em `user_roles` e, se não existir um `colaboradores_prova` elegível, **cria um registro sintético** usando qualquer colaborador disponível (primeiro encontrado) e nenhuma função definida, só para satisfazer o vínculo. Isso é um workaround visível no código, não uma feature deliberada de "coordenador sem colaborador real" — se for mexer em concessão de acesso de coordenador, esse caminho alternativo é a explicação mais provável de um `coordenadores_prova` com dados estranhos/incompletos.

Remover o papel de coordenador (`updateRole` com `action: "remove"`) também remove em cascata todos os registros de `coordenadores_prova` daquele usuário.

### RLS não é o único portão: sem `GRANT`, a policy nem é avaliada

Toda tabela de `public` tem RLS ativa e policies — mas o Postgres checa o **privilégio de tabela antes** da RLS. Se `authenticated` não tiver `GRANT SELECT`, o PostgREST devolve `42501 permission denied` e a policy nunca roda. Foi exatamente isso que quebrou o login em dev local até 2026-07-12: os `GRANT`s existiam em produção (criados implicitamente pelo dashboard do Lovable) mas nunca tinham sido registrados em migration. A migration `20260712010000_grant_api_roles_table_privileges.sql` corrigiu isso e ajustou o `ALTER DEFAULT PRIVILEGES` para que tabelas futuras já nasçam certas. Detalhes em [`desenvolvimento-local.md`](./desenvolvimento-local.md).

Consequência prática ao criar uma tabela nova: RLS ativa + policy correta **não basta** se o role não tiver GRANT.
