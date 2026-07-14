# Autenticação e Permissões

> Ver [`00-indice.md`](./00-indice.md). Cross-referenciado por [`colaboradores.md`](./colaboradores.md) (portal do colaborador) e [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md) (concessão de acesso de coordenador).

## Dois sistemas paralelos e independentes

Este é o ponto mais importante para não confundir ao mexer em auth/permissões: **existem dois modelos de login completamente separados**, cada um com seu próprio Context/Provider, ambos montados simultaneamente em `App.tsx`. Ao tocar em qualquer fluxo, primeiro identifique qual dos dois está em jogo — nada é compartilhado entre eles (nem sessão, nem tabela de usuário, nem storage key).

### 1. `useAuth` (`src/hooks/useAuth.tsx`) — equipe administrativa

- Usa **Supabase Auth** de verdade (`supabase.auth.signInWithPassword`, sessão JWT, `onAuthStateChange`).
- Papel (`role`) resolvido consultando a tabela `user_roles`: hierarquia `superadmin` > `admin` > `coordenador` > `user` (superadmin herda tudo de admin — ver `isAdmin = role === 'admin' || role === 'superadmin'`). Um mesmo `user_id` pode ter múltiplas linhas em `user_roles`; o hook resolve para o papel mais alto.
- É para quem acessa `/auth-admin`, `/dashboard`, gestão de provas, etc.
- Logout força `window.location.href = '/auth-admin'` (reload completo) e limpa manualmente todas as chaves `sb-*`/`supabase` do `localStorage` — decisão deliberada para evitar estado React "fantasma" pós-logout, não é um bug a "simplificar".
- Perfil correspondente: página `/perfil` (dados do próprio usuário admin, tabela `profiles`).

### 2. `useColaboradorAuth` (`src/hooks/useColaboradorAuth.tsx`) — portal do colaborador

- **Não usa Supabase Auth.** Login é por CPF + "código de acesso" de 4 dígitos (gerado no primeiro cadastro), validado via RPC `verify_colaborador_codigo_acesso` que compara contra hash na tabela `colaboradores`.
- Sessão é um objeto simples (`id`, `nome`, `cpf`) persistido em `localStorage` (`colaborador_session`), **sem JWT**.
- Ao restaurar sessão do localStorage, registra atividade via RPC `register_colaborador_session`. Existe a tabela `colaborador_sessions` e a RPC `update_colaborador_session_activity`/`is_colaborador_logged_in` para rastrear login/expiração.
- **Dois timeouts diferentes, não confundir:** o front (`PerfilColaborador.tsx`, `INACTIVITY_TIMEOUT`) desloga o colaborador da própria aba depois de **5 minutos** sem interação — é só UX client-side. Já a RPC `is_colaborador_logged_in` (verificada em `supabase/migrations/20251224214421_9b961360-*.sql`, `CREATE OR REPLACE`) considera um colaborador "logado" (bloqueando edição por admin, ver [`colaboradores.md`](./colaboradores.md)) enquanto `last_activity > NOW() - INTERVAL '15 minutes'`. São mecanismos independentes para propósitos diferentes — não é uma inconsistência a corrigir.
- Como não há JWT do Supabase Auth, todo acesso a dados do colaborador passa por RPCs `SECURITY DEFINER` (`get_colaborador_by_id`, `get_colaborador_full_data`, `update_colaborador_data_full`, `set_colaborador_password`, `check_colaborador_has_password`, etc.) que fazem sua própria checagem de permissão — RLS padrão não protegeria essas rotas porque não há `auth.uid()` de colaborador.
- Perfil correspondente: página `/perfil-colaborador`.

Ao tocar em qualquer fluxo de colaborador, o "usuário logado" nunca é `auth.uid()` — é sempre o `id` guardado no contexto `ColaboradorAuthContext`.

## Modelo de roles (equipe admin)

- Enum `app_role`: `superadmin`, `admin`, `coordenador`, `user` — e, desde 2026-07-14, **`colaborador`** (migration `20260714162027_*`). Atenção: **nenhum código lê `colaborador` ainda**; ele é a fundação da refatoração do acesso do colaborador (ver [`../analises/roadmap-auth-colaborador.md`](../analises/roadmap-auth-colaborador.md)). Ele **não** entra na hierarquia acima: não é um degrau abaixo de `user`, e sim uma dimensão paralela — dos 15 usuários atuais, **12 são colaboradores**, e são justamente os 2 admins e os 10 coordenadores. Uma pessoa acumula os dois papéis sem contradição, e é por isso que ele vive em `user_roles` (multi-papel) e não numa coluna `tipo` em `profiles`, que forçaria escolher entre gestor e colaborador.
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
