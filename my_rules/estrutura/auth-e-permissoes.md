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

### Como uma conta de colaborador nasce e se vincula (subetapa 2B)

- **Reivindicação (os 759 que já eram cadastrados, sem conta):** em `/auth`, "Primeiro acesso" abre o `ReivindicarAcessoCard` → CPF → a Edge Function **`reivindicar-acesso`** localiza o cadastro e devolve **`{existe, ja_vinculado, email_mascarado}`** (o e-mail inteiro nunca sai do servidor), disparando um `generateLink('invite')` enviado com HTML da FEVRE via `send-email`. A pessoa clica, cai em `/redefinir-senha`, define a senha, entra. Rate limit de 5/15 min por IP (tabela `reivindicacao_rate_limit`, migration `20260714201650`).
- **Cadastro público (subetapa 2C):** `/cadastro-publico` → CPF novo → o `ColaboradorDialog` em `publicMode` (sem código de 4 dígitos, e-mail obrigatório) → `public-create-colaborador` cria a linha e **dispara o mesmo invite** da reivindicação. Se o CPF já existe, a página mostra o `ReivindicarAcessoCard` inline — as duas portas convergem.
- **O vínculo é automático, no trigger.** `handle_new_user` (o mesmo `on_auth_user_created` que cria `profiles` + papel `user`) passou a: se o e-mail da conta nova casa com um colaborador de **`user_id IS NULL`**, preencher `user_id` e conceder **`colaborador`**. Isso vale para *qualquer* conta nova — reivindicação, cadastro público ou uma conta criada por admin. Nada vem do cliente; o casamento é por `auth.users.email` (único) contra o índice único de `colab_email`. É o backfill dos 12 virado mecanismo contínuo.
- **O invite é compartilhado:** o helper `supabase/functions/_shared/enviar-link-acesso.ts` (generateLink invite + HTML da FEVRE + `send-email`) é usado por `reivindicar-acesso` **e** `public-create-colaborador`.
- **`check-cpf-colaborador`** ainda existe, mas **endurecida**: devolve só `{exists}` (o `CadastroPublico` usa para decidir cadastrar-ou-reivindicar). Antes devolvia o e-mail inteiro — um oráculo. Mantida separada da `reivindicar-acesso` de propósito: é a checagem **sem efeito colateral** (a `reivindicar-acesso` envia e-mail).
- **Dívida contida:** reivindicar um CPF alheio dispara um invite ao e-mail da vítima e marca o registro como vinculado — mas à conta do próprio dono daquele e-mail (recuperável por "esqueci senha"); o rate limit limita o abuso.

### O acesso do colaborador aos próprios dados

- A página é `/perfil-colaborador`. O "usuário logado" é **`auth.uid()`** — não há mais objeto de sessão em `localStorage`.
- Os dados vêm das RPCs **`get_meu_colaborador` / `update_meu_colaborador` / `update_meus_dados_bancarios`** (migration `20260714193057`), que resolvem o colaborador por `auth.uid() → colaboradores.user_id` (via `meu_colaborador_id()`), **sem receber id do cliente**. Nascem com `GRANT` só a `authenticated`.
- `INACTIVITY_TIMEOUT` (5 min, em `PerfilColaborador.tsx`) segue deslogando a aba por inatividade — é só UX client-side.
- **RLS de verdade na tabela (2D, 2026-07-15):** o SELECT de `colaboradores` deixou de ser `USING (true)`. Agora **admin/coordenador veem tudo** (via `has_role`) e **toda outra conta autenticada vê só a própria linha** (`user_id = auth.uid()`); `anon` vê nada. Antes, como o colaborador virou `authenticated` na 2A, o `USING (true)` deixava qualquer um ler as 771 linhas — era um vazamento. As RPCs `get_meu_colaborador`/… são SECURITY DEFINER e contornam RLS, então o perfil não muda. Migration `20260715073500_*`.
- **As RPCs do modelo `/auth` velho foram embora (subetapa 2D — 2026-07-15):** primeiro tiveram o `EXECUTE` **revogado de `PUBLIC`** (item 1, migration `20260715072758_*`, fechando a **fragilidade 1**) e em seguida foram **dropadas** (item 3, migration `20260715125720_*`): `get_colaborador_full_data`, `get_colaborador_by_id`, `set_colaborador_password`, `update_colaborador_data_full`, `update_colaborador_data` (3 overloads), `update_colaborador_bank_data`, `verify_colaborador_codigo_acesso`, `verify_colaborador_password`, `verify_colaborador_first_access`, `check_colaborador_has_password`, `register/unregister/update_colaborador_session_activity`. A Edge Function `reset-codigo-acesso` também foi removida. **Continuam vivas, de propósito:** `is_colaborador_logged_in` (na policy de UPDATE — some com a retirada da trava), `get_coordenador_colaboradores` (lado gestão) e a Edge Function `check-cpf-colaborador` (checagem sem efeito colateral do pré-cadastro).
- **Trava de edição concorrente removida (2D, 2026-07-15):** a policy de UPDATE de `colaboradores` perdeu o `AND NOT is_colaborador_logged_in(id)` — agora é só `has_role(admin) OR has_role(coordenador)`. A função `is_colaborador_logged_in` e a tabela `colaborador_sessions` foram **dropadas** (migration `20260715130603_*`). A proteção contra edição concorrente vira dívida assumida (last-write-wins). Sobra órfão do template `codigo-acesso.tsx` — removido no mesmo passo.
- **Último resto ainda de pé:** a coluna `colab_codigo_acesso` (+ o CHECK `colab_codigo_acesso_format`). Só ela falta dropar — está adiada porque ainda é referenciada por dois exports (`GerenciarProva`, `GerenciarColaboradoresProva`) e pelo e-mail em massa do `PainelDadosColaboradores` (o item 6, decisão de produto). Cai junto com o item 6. Não construa nada novo sobre ela.

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
