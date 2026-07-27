# Autenticação e Permissões

> Ver [`00-indice.md`](../00-indice.md). Cross-referenciado por [`colaboradores.md`](../modulos/aplicacao-provas/colaboradores.md) (portal do colaborador) e [`alocacao-e-funcoes.md`](../modulos/aplicacao-provas/alocacao-e-funcoes.md) (concessão de acesso de coordenador).

## Um só sistema de login (desde a subetapa 2A, 2026-07-14)

**Antes havia dois modelos de login separados; a refatoração do acesso do colaborador unificou tudo no Supabase Auth.** Hoje existe **um** provider (`useAuth`), montado em `App.tsx`, e uma porta única (`/auth`). Se você está lendo código ou migrations antigas que falam de "código de acesso", "sessão do colaborador no localStorage" ou `useColaboradorAuth`, isso é o mundo anterior — ver o histórico da mudança em [`../analises/roadmap-auth-colaborador.md`](../../analises/concluidos/roadmap-auth-colaborador.md).

### `useAuth` (`src/hooks/useAuth.tsx`) — para todo mundo

- Usa **Supabase Auth** (`supabase.auth.signInWithPassword`, sessão JWT, `onAuthStateChange`).
- **`role`** é o papel de **gestão**, resolvido de `user_roles` pela hierarquia `superadmin` > `admin` > `coordenador` > `user` (superadmin herda admin — ver `isAdmin = role === 'admin' || role === 'superadmin'`).
- **`colaborador` NÃO entra nessa hierarquia** — é dimensão paralela, exposta como **`isColaborador`** (`roles.includes('colaborador')`), não como valor de `role`. O hook guarda o array `roles` completo justamente porque uma pessoa acumula gestão + colaborador (os 12 do backfill). Espremer num papel único rebaixaria os 10 coordenadores que também são colaboradores.
- **`rolesLoaded`**: há uma janela entre `setUser` e o fim do fetch de papéis em que o usuário existe e os papéis ainda não. Quem decide para onde navegar (o `/auth`, as guardas de rota) **espera `rolesLoaded`**, senão decide sobre um conjunto vazio.
- Logout força `window.location.href = '/auth'` (reload completo, para não deixar estado React fantasma) e limpa as chaves `sb-*`/`supabase` do `localStorage`. **Cuidado herdado:** esse reload duro destrói qualquer `navigate(..., { state })` chamado logo depois de `signOut()` — foi o bug que sumiu com a mensagem de sucesso ao salvar o perfil, na 2A.
- Roteamento pós-login (em `Auth.tsx`, desde 2026-07-24): **colaborador puro → `/perfil-colaborador`; todo o resto → `/`** (o hub por módulos — ver [`arquitetura-geral.md`](./arquitetura-geral.md) §6). Antes o admin ia direto a `/dashboard`; agora todo gestor passa pelo hub. Os 12 gestor+colaborador caem no hub e chegam ao cadastro pelo item de menu "Meu Cadastro". A definição de "colaborador puro" (`isColaborador && role === null`) é a **mesma** aqui e no guard do `Inicio.tsx` — ver a matriz de módulos adiante.

### Porta única "Estou sem minha senha" (2026-07-20)

A tela `/auth` tinha **dois links** — "Primeiro acesso (já sou cadastrado)" e "Esqueci minha senha" — que pediam à pessoa para se classificar segundo `user_id` e `email_confirmed_at`: estado do **banco**, a que ela não tem acesso nenhum. Hoje é **um link** e **um campo**, que aceita **CPF ou e-mail** (detecção pelo `@`). A pessoa diz quem é; **o servidor decide** entre `invite` e `recovery`. O botão **"Novo Colaborador" permanece** — é intenção diferente ("não estou cadastrado"), e a classificação que sobrou ("sou novo" vs. "sou eu, sem senha") é fácil.

Componente: `ReivindicarAcessoCard` com a prop **`permitirEmail`**. Sem ela (o `CadastroPublico`, que chega com o CPF já conferido) o comportamento é o antigo, só CPF.

**⚠️ As duas respostas são assimétricas de propósito — não uniformize.** Cada input vaza coisa diferente, com economia de ataque diferente:

| Input | EF | Política | Por quê |
|---|---|---|---|
| **CPF** | `reivindicar-acesso` | **Revela**: e-mail mascarado, e distingue "sem e-mail" de "não encontrado" | Concessão já aceita e contida por rate limit. O mascarado diz **qual caixa abrir** — quem tem vários e-mails depende disso |
| **E-mail** | `recuperar-senha` | **Não revela nada**: resposta idêntica em todos os casos | Anti-enumeração: lista de e-mails se compra pronta e se testa em massa |

Uniformizar "para ficar consistente" quebra um dos dois lados: revelando, reabre a enumeração por e-mail; calando, mata o e-mail mascarado e o aviso que os **254 sem e-mail** recebem. Para esses 254 a tela do caminho do e-mail traz a dica **"tente pelo CPF"** — sem ela eles digitariam o e-mail pessoal, não receberiam nada e não teriam como saber por quê.

**Rate limit compartilhado.** As duas portas gravam na **mesma** tabela `reivindicacao_rate_limit` (5/15 min por IP). Separadas, o atacante somaria 5 pelo CPF **mais** 5 pelo e-mail.

**O que a porta única ainda não resolve:** os **254 sem e-mail** seguem dependendo do coordenador (decisão explícita), e o CPF de quem **já tem conta** informa em vez de mandar o link — a pessoa precisa reinformar o e-mail. Fechar esse segundo caso esbarra no estado B, onde `colab_email` e o e-mail da conta divergem e mandar para a conta não ajudaria.

### Recuperação de senha — EF própria, não o fluxo nativo (2026-07-20)

O "esqueci minha senha" de `/auth` **não usa mais** `supabase.auth.resetPasswordForEmail`. Agora chama a Edge Function **`recuperar-senha`**, que gera o link com `generateLink` — **`recovery` ou `invite`, conforme o estado da pessoa** (ver abaixo) — e o envia pela `send-email`.

**Por que sair do nativo:** os e-mails do fluxo nativo são compostos e enviados pelo **SMTP do próprio GoTrue** — local, o Mailpit (`[local_smtp]`, porta 54324); em produção, o serviço embutido do Supabase, fortemente limitado. Nenhum dos dois passa pela `send-email`, então aquele e-mail não tinha o visual da FEVRE nem saía pela Hostinger. A regra hoje é **todo e-mail sai pela `send-email`** (ver [`integracoes-externas.md`](./integracoes-externas.md)).

**O preço, e por que ele é obrigatório:** sair do nativo joga fora duas proteções que o GoTrue dava de graça, e a EF precisa repô-las **explicitamente**. Quem for mexer nessa função tem que preservar as duas:

1. **Anti-enumeração.** O nativo nunca revela se a conta existe. O `generateLink` **falha de forma distinguível** quando ela não existe, então *toda* saída da EF é a mesma frase genérica — conta existente, inexistente ou em cooldown. Inclusive o cooldown: devolver `429` ali revelaria que a conta existe. Quebrar isso transforma a tela de login num oráculo de quem tem cadastro.
2. **Rate limit.** Com `service_role` a EF passa por cima dos tetos do GoTrue. O limite voltou como **cooldown de 2 min por conta** — **sem tabela nova** —, mais o teto por IP compartilhado com a `reivindicar-acesso`. Ele cobre também a **rotação de token**: cada `generateLink` invalida o anterior, então dois cliques em "enviar" matariam o link do primeiro e-mail, que é justamente o que a pessoa costuma abrir.
   - **O cooldown olha três carimbos, não um.** `recovery_sent_at`, `confirmation_sent_at` e `invited_at` — porque `generateLink('invite')` grava os dois últimos e deixa `recovery_sent_at` **NULL**. Olhando só o recovery, quem acabou de receber um invite pediria de novo e receberia um link novo **que invalida o invite recém-enviado**; a pessoa abriria o primeiro e-mail, já morto. Foi bug real, pego no teste de 2026-07-20.

**A EF atende os dois estados.** Se o e-mail tem conta, manda `recovery`. Se não tem conta mas **existe cadastro em estado A** com aquele `colab_email`, manda `invite` — é o mesmo raciocínio que o servidor já faz pelo CPF. Sem esse ramo, a porta única prometeria à maioria (os 759 do estado A) e não entregaria nada. **Não custa privacidade:** a resposta segue genérica nos dois casos.

**Por que o teto por conta não bastou.** O raciocínio inicial era que ele bastaria, porque `generateLink` só produz link para conta **existente** — não dá para varrer endereços quaisquer. **O ramo do estado A derrubou isso:** ali o `invite` **cria** a conta, então a *primeira* chamada de cada e-mail não tem carimbo anterior para o cooldown olhar. Com uma lista de e-mails, alguém dispararia uma leva inteira. Por isso entrou também o teto por IP, compartilhado com a `reivindicar-acesso` (ver acima).

### Como uma conta de colaborador nasce e se vincula (subetapa 2B)

- **Reivindicação (os 759 que já eram cadastrados, sem conta):** em `/auth`, **"Estou sem minha senha"** (a porta única — era "Primeiro acesso" até 2026-07-20) abre o `ReivindicarAcessoCard` → CPF → a Edge Function **`reivindicar-acesso`** localiza o cadastro e devolve **`{existe, ja_vinculado, email_mascarado}`** (o e-mail inteiro nunca sai do servidor), disparando um `generateLink('invite')` enviado com HTML da FEVRE via `send-email`. A pessoa clica, cai em `/redefinir-senha`, define a senha, entra. Rate limit de 5/15 min por IP (tabela `reivindicacao_rate_limit`, migration `20260714201650`), **compartilhado com a `recuperar-senha`**.
- **Cadastro público (subetapa 2C):** `/cadastro-publico` → CPF novo → o `ColaboradorDialog` em `publicMode` (sem código de 4 dígitos, e-mail obrigatório) → `public-create-colaborador` cria a linha e **dispara o mesmo invite** da reivindicação. Se o CPF já existe, a página mostra o `ReivindicarAcessoCard` inline — as duas portas convergem.
- **O vínculo é automático, no trigger.** `handle_new_user` (o mesmo `on_auth_user_created` que cria `profiles` + papel `user`) passou a: se o e-mail da conta nova casa com um colaborador de **`user_id IS NULL`**, preencher `user_id` e conceder **`colaborador`**. Isso vale para *qualquer* conta nova — reivindicação, cadastro público ou uma conta criada por admin. Nada vem do cliente; o casamento é por `auth.users.email` (único) contra o índice único de `colab_email`. É o backfill dos 12 virado mecanismo contínuo.
- **O invite é compartilhado:** o helper `supabase/functions/_shared/enviar-link-acesso.ts` (generateLink invite + HTML da FEVRE + `send-email`) é usado por `reivindicar-acesso` **e** `public-create-colaborador`.
- **`check-cpf-colaborador`** ainda existe, mas **endurecida**: devolve só `{exists}` (o `CadastroPublico` usa para decidir cadastrar-ou-reivindicar). Antes devolvia o e-mail inteiro — um oráculo. Mantida separada da `reivindicar-acesso` de propósito: é a checagem **sem efeito colateral** (a `reivindicar-acesso` envia e-mail).
- **Dívida contida:** reivindicar um CPF alheio dispara um invite ao e-mail da vítima e marca o registro como vinculado — mas à conta do próprio dono daquele e-mail (recuperável por "esqueci senha"); o rate limit limita o abuso.

### O acesso do colaborador aos próprios dados

- A página é `/perfil-colaborador`. O "usuário logado" é **`auth.uid()`** — não há mais objeto de sessão em `localStorage`.
- Os dados vêm das RPCs **`get_meu_colaborador` / `update_meu_colaborador` / `update_meus_dados_bancarios`** (migration `20260714193057`), que resolvem o colaborador por `auth.uid() → colaboradores.user_id` (via `meu_colaborador_id()`), **sem receber id do cliente**. Nascem com `GRANT` só a `authenticated`.
- `INACTIVITY_TIMEOUT` (5 min, em `PerfilColaborador.tsx`) segue deslogando a aba por inatividade — é só UX client-side.
- **Recorte de leitura das tabelas operacionais (2026-07-26):** quatro tabelas tinham `SELECT ... USING (true)` — `meta_colaboradores_unidade`, `valores_funcao_prova`, `colaboradores_prova` e `salas_prova_distribuidas`. O recorte por coordenador existia **só na UI**. Fechadas nas migrations `20260726260000` e `20260726270000`: admin (e superadmin, pela hierarquia dentro do `has_role`) vê tudo; coordenador vê o seu escopo; **qualquer outro autenticado não vê nada**. Medido depois: admin 24/554/58/186, coordenador 17/531/42/17, autenticado sem papel 0/0/0/0. ⚠️ **Os níveis diferem de propósito** — metas por *unidade*, as outras três por *prova*, porque `OcorrenciasProva` lê alocações da prova inteira e a RLS de ocorrências já era por prova; igualar criaria desencontro. Detalhe em [`invariantes.md`](./invariantes.md).
- **RLS de verdade na tabela (2D, 2026-07-15):** o SELECT de `colaboradores` deixou de ser `USING (true)`. Agora **admin/coordenador veem tudo** (via `has_role`) e **toda outra conta autenticada vê só a própria linha** (`user_id = auth.uid()`); `anon` vê nada. Antes, como o colaborador virou `authenticated` na 2A, o `USING (true)` deixava qualquer um ler as 771 linhas — era um vazamento. As RPCs `get_meu_colaborador`/… são SECURITY DEFINER e contornam RLS, então o perfil não muda. Migration `20260715073500_*`.
- **As RPCs do modelo `/auth` velho foram embora (subetapa 2D — 2026-07-15):** primeiro tiveram o `EXECUTE` **revogado de `PUBLIC`** (item 1, migration `20260715072758_*`, fechando a **fragilidade 1**) e em seguida foram **dropadas** (item 3, migration `20260715125720_*`): `get_colaborador_full_data`, `get_colaborador_by_id`, `set_colaborador_password`, `update_colaborador_data_full`, `update_colaborador_data` (3 overloads), `update_colaborador_bank_data`, `verify_colaborador_codigo_acesso`, `verify_colaborador_password`, `verify_colaborador_first_access`, `check_colaborador_has_password`, `register/unregister/update_colaborador_session_activity`. A Edge Function `reset-codigo-acesso` também foi removida. **Continuam vivas, de propósito:** `is_colaborador_logged_in` (na policy de UPDATE — some com a retirada da trava), `get_coordenador_colaboradores` (lado gestão) e a Edge Function `check-cpf-colaborador` (checagem sem efeito colateral do pré-cadastro).
- **Trava de edição concorrente removida (2D, 2026-07-15):** a policy de UPDATE de `colaboradores` perdeu o `AND NOT is_colaborador_logged_in(id)` — agora é só `has_role(admin) OR has_role(coordenador)`. A função `is_colaborador_logged_in` e a tabela `colaborador_sessions` foram **dropadas** (migration `20260715130603_*`). A proteção contra edição concorrente vira dívida assumida (last-write-wins). Sobra órfão do template `codigo-acesso.tsx` — removido no mesmo passo.
- **Coluna `colab_codigo_acesso` removida (2D, 2026-07-15):** era a credencial do login por código, morta desde 2A–2C. Dropada (migration `20260715131321_*`, com o CHECK `colab_codigo_acesso_format`) depois de limpar suas últimas pontas no front — o e-mail em massa do `PainelDadosColaboradores` foi **aposentado** e a coluna "Código de acesso" saiu de dois exports. **Com isso a subetapa 2D está completa e a refatoração inteira do acesso do colaborador (etapas 1–3) está fechada.**

### `colab_email` é âncora de identidade, não campo comum (Etapa 1, 2026-07-16)

Depois da refatoração do acesso, `colab_email` acumulou **dois papéis**: dado de contato **e** identidade de login (é por ele que o trigger `handle_new_user` casa conta com cadastro). Enquanto ninguém reivindicou, os dois coincidem; **assim que existe conta, quem manda no login é `auth.users.email`**, e `colab_email` vira projeção dele. Editá-lo numa linha vinculada **dessincroniza** cadastro e conta — e não é só política: um `UPDATE` vindo do front **não alcança `auth.users`** (exige admin API / `service_role`), então o caminho normal de edição é *fisicamente incapaz* de manter os dois em sincronia.

**O estado da linha decide o que a edição significa** — os três estados, e o que hoje está implementado:

| Estado | Condição | Comportamento |
|---|---|---|
| **A** | `user_id IS NULL` | ✅ **Livre** — é o caminho dos 254 sem e-mail e do conserto de typo *antes* da reivindicação |
| **B** | Vinculado, conta não-confirmada | 🚫 Travado no formulário, ✅ **corrigível pela ação deliberada** — a EF `corrigir-email-acesso` (Etapa 2) |
| **C** | Vinculado, conta confirmada | 🚫 Travado — a troca pertence ao dono, e **não há caminho no app** (dívida aberta) |

**O que a Etapa 1 fez (só front, sem migration):**

- **`Colaborador` (em `useColaboradores.tsx`) passou a declarar `user_id`.** A coluna já vinha nos `select('*')`; faltava no tipo. `ColaboradorInsert` a exclui — quem preenche `user_id` é o trigger, nunca o cliente.
- **`ColaboradorDialog` (gestão):** `colab_email` fica **read-only quando `user_id` não é nulo** (`isVinculado`), com nota explicando que aquele e-mail virou o login. Nesse caso o campo sai **do payload do update e da validação** (`colaboradorSchema.omit({ colab_email: true })`) — o `omit` também evita travar o salvamento de uma linha vinculada cujo `colab_email` fosse nulo, já que o schema o exige.
- **`PerfilColaborador` (o próprio colaborador):** `colab_email` **read-only sempre**. Quem enxerga essa página está logado, logo a linha é sempre vinculada — é o estado C por definição. Esta tela **não estava no desenho original** da Etapa 1 e foi incluída em 2026-07-16: sem ela, o dialog de gestão remeteria a troca "ao próprio colaborador" enquanto o caminho do colaborador (`update_meu_colaborador`, que escreve `colab_email` e não toca `auth.users`) produzia exatamente a dessincronia que a etapa existe para impedir.

**Limite conhecido e aceito:** a trava é **de UI**. Decidiu-se (2026-07-16) **não** pôr trigger no banco: um `BEFORE UPDATE` barrando `colab_email` em linha vinculada fecharia junto o caminho da **Etapa 2** — a `corrigir-email-acesso` também faz `UPDATE` em `colab_email`, e trigger **dispara mesmo para `service_role`** (ao contrário de RLS, que ele contorna) —, exigindo escape por flag de sessão. Logo, **a RPC `update_meu_colaborador` ainda aceita `p_email`** e a policy de UPDATE de admin/coordenador ainda alcança a coluna: uma chamada direta ao PostgREST contorna a trava. Ver a dívida em [`../analises/dividas-auth-colaborador.md`](../../analises/dividas-auth-colaborador.md) e o desenho completo em [`../analises/roadmap-edicao-email-colaborador.md`](../../analises/roadmap-edicao-email-colaborador.md).

### A saída do estado B: `corrigir-email-acesso` (Etapa 2, 2026-07-16)

Travar o campo (Etapa 1) impede o estrago novo, mas não conserta quem já está preso. A **Edge Function `corrigir-email-acesso`** é a saída deliberada — no lugar certo, e não como edição casual de formulário. Ponto de entrada: um link discreto sob o campo travado do `ColaboradorDialog` ("O e-mail está errado e ele nunca conseguiu entrar?"), que abre o `CorrigirEmailAcessoDialog`.

- **Uma função, dois modos.** `consultar` devolve `{ estado, email_cadastro, email_conta, divergentes }`; `corrigir` executa. O modo `consultar` existe porque **separar B de C exige ler `auth.users`, e isso só a EF faz** — o front nunca vê o Auth. É a UI perguntando o que renderizar.
- **Autorização:** espelha exatamente a policy de UPDATE de `colaboradores` — `has_role(admin) OR has_role(coordenador)`. *(Até 2026-07-25 isto valia com a ressalva de que um superadmin sem linha `admin` não passava; desde a migration `20260725195530_*` o `has_role` faz superadmin herdar admin — ver "A hierarquia de papéis vive dentro do `has_role`" abaixo.)*
- **A mecânica é renomear, não apagar.** `admin.updateUserById(user_id, { email, email_confirm: false })` → atualiza `colab_email` → atualiza `profiles.email` (o trigger só o escreve no nascimento da conta; ele **não** acompanha o rename) → envia link **`recovery`** (o `invite` falharia: a conta existe). A conta **segue pendente** — quem confirma é a pessoa, ao abrir o link no endereço novo. É a prova de posse da caixa.
- **Por que não apagar** (o desenho original mandava `deleteUser` + reinvite): **15 colunas em 11 tabelas** referenciam `auth.users`. As de `CASCADE` (`profiles`, `user_roles`, `coordenadores_prova.user_id`) sumiriam **em silêncio** — um papel `coordenador` concedido por admin seria **perdido**, porque o trigger só reconcede `user` e `colaborador` — e as **11 de `NO ACTION`** (`created_by`/`sent_by`) fariam o DELETE **falhar**. Renomear preserva o `user_id` e, com ele, todos os vínculos **por construção**. A análise inteira está em [`../analises/roadmap-edicao-email-colaborador.md`](../../analises/roadmap-edicao-email-colaborador.md).
- **Tudo que pode recusar, recusa antes de escrever:** estado ≠ B, e-mail já no cadastro de outro (o índice único é funcional sobre `lower(trim(...))`), conta já existente no destino, e-mail igual ao da conta. **A comparação é contra o e-mail da CONTA, não contra `colab_email`** — o caso típico é `colab_email` já corrigido e a conta parada no endereço velho.
- **O helper compartilhado mudou:** `_shared/enviar-link-acesso.ts` ganhou `tipo?: 'invite' | 'recovery'`, com **`'invite'` como padrão** — `reivindicar-acesso` e `public-create-colaborador` seguem intactos.

**Consequência operacional:** o **estado B tem saída no app**; o **estado C não tem caminho nenhum** — nem pelo dono, nem pela coordenação —, e a correção segue manual (dashboard do Auth). Isso é **decisão, não esquecimento**: ver a dívida em [`../analises/dividas-auth-colaborador.md`](../../analises/dividas-auth-colaborador.md) §1-bis. O banco local tem **1 linha em B já dessincronizada** (`colab_email` `contato@caioteixeira.net.br` contra login `exemplo2@exemplo3.com`) — o caso travado em carne e osso, preservado de propósito como caso de teste.

### Perfis

- `/perfil` — a conta do Supabase Auth do próprio usuário (nome em `profiles` + senha). **Restrita a gestão desde 2026-07-26**: colaborador puro é mandado para `/perfil-colaborador`, que é a página dele. Quem tem `role === 'user'` **entra**, de propósito — tem conta no Auth e o hub já o aceita; barrá-lo o deixaria sem lugar para trocar a própria senha.
- `/perfil-colaborador` — o cadastro de colaborador de quem tem `isColaborador`.

## Modelo de roles (equipe admin)

- Enum `app_role`: `superadmin`, `admin`, `coordenador`, `user` — e, desde 2026-07-14, **`colaborador`** (migration `20260714162027_*`). Desde a subetapa 2A o front **lê** esse papel, via `isColaborador` no `useAuth` (guarda de `/perfil-colaborador`, item de menu "Meu Cadastro"). Ele **não** entra na hierarquia acima: não é um degrau abaixo de `user`, e sim uma dimensão paralela — dos 15 usuários atuais, **12 são colaboradores**, e são justamente os 2 admins e os 10 coordenadores. Uma pessoa acumula os dois papéis sem contradição, e é por isso que ele vive em `user_roles` (multi-papel) e não numa coluna `tipo` em `profiles`, que forçaria escolher entre gestor e colaborador.
- **O papel já é concedido, e o elo já existe:** desde 2026-07-14, `colaboradores.user_id` (UNIQUE, FK para `auth.users` com `ON DELETE SET NULL`, migration `20260714162029_*`) liga o cadastro à conta, e o **backfill** do `supabase/seed.pos.sql` preencheu-o para esses 12, concedendo-lhes o papel `colaborador`. As outras 759 linhas têm `user_id` NULL e o receberão quando a pessoa se cadastrar (etapa 2). É esse `user_id` que vai ancorar RLS e RPCs em `auth.uid()` no lugar do `p_colaborador_id` que hoje vem do cliente.
- Tabela `user_roles` (`user_id`, `role`) — um usuário pode ter mais de uma role.

### A hierarquia de papéis vive dentro do `has_role` (2026-07-25)

`has_role(_user_id, _role)` **não é** um match literal em `user_roles`. Ela implementa **uma** regra de herança:

> **superadmin satisfaz também as checagens de `admin`** — implicação de mão única. `has_role(x, 'superadmin')` continua estrito.

**Por que isso mora na função, e não nas policies.** Auditoria do banco local em 2026-07-25: **40 policies em 15 tabelas** checavam `'admin'` sem mencionar `superadmin`, contra apenas **3** que traziam o `OR has_role(..., 'superadmin')` explícito. Um superadmin **sem linha `admin`** não conseguia escrever praticamente nada — enquanto a UI, que usa `isAdmin` (inclui superadmin), mostrava todos os botões. Não explodiu porque os dois superadmins existentes **também têm linha `admin`**: estava armada, não detonada. Corrigir as 40 policies seria repetir a mesma regra 40 vezes e deixar a próxima livre para esquecê-la de novo — foi exatamente assim que a policy de `editais` (a mais nova, de 2026-07-24) nasceu errada.

**Por que só `admin`, e não "superadmin passa em tudo".** Duas razões: (1) espelha o front, onde admin/superadmin **não** são `isCoordenador` e `colaborador` é outra dimensão; (2) não é preciso — não existe ponto onde coordenador é autorizado e admin não. A única policy sem `'admin'` literal (`ocorrencias_colaborador` → "Coordenadores gerenciam ocorrências de suas provas") convive com "Admins e superadmins gerenciam todas as ocorrências", e **policies do mesmo comando são OR**.

⚠️ **Ao escrever policy nova, escreva `has_role(auth.uid(), 'admin')` e pare por aí.** Acrescentar `OR has_role(..., 'superadmin')` não está errado, mas é ruído — e as 3 policies que ainda o fazem são história, não padrão. **Nunca** troque `has_role` por um `SELECT` direto em `user_roles`: isso contorna a hierarquia e recria o bug.

**Seguro por construção:** `has_role` só é usada como porteira (RLS e `IF NOT has_role(...) THEN RAISE` nas RPCs `assign_coordenador_role`, `encerrar_ocorrencias_unidade`, `finalizar_prova_unidade`, `reabrir_prova_unidade`), nunca para filtrar linhas num `WHERE` de listagem — então a mudança só concede, nunca esconde dado.
- `coordenador` é a role mais restrita das "de equipe": um coordenador só enxerga as provas/unidades a que foi explicitamente vinculado via `coordenadores_prova` (ver `useCoordenadorUnidades.tsx`, que resolve os `prova_unidade_id`s permitidos via RPC `get_coordenador_prova_unidade_ids`). Páginas de gestão (`GerenciarProva`, `OcorrenciasProva`) filtram listas no client usando esse resultado — a filtragem client-side é só UX; a proteção real está nas policies/RPCs que também checam `is_coordenador_prova`.
- Gestão de usuários/roles é feita em `/gerenciar-usuarios` (`useUsers.tsx`), restrita a `superadmin` na navegação.

### Módulos: o que cada papel vê no hub (2026-07-24)

A tela de entrada por módulos (o mecanismo em [`arquitetura-geral.md`](./arquitetura-geral.md) §6) deriva o acesso **dos papéis que já existem** — sem tabela nem enum de módulos no banco. Hoje são dois módulos (Aplicação de Provas, para todo gestor; Editais, só admin/superadmin); a matriz ainda é simples, mas o que importa é a regra.

| Papel | Vê o hub? | Módulos no hub | Entrada do card *Aplicação de Provas* |
|---|---|---|---|
| `superadmin` | sim | Aplicação de Provas + Editais (+ "Usuários" no header, fora dos cards) | `/dashboard` |
| `admin` | sim | Aplicação de Provas + Editais | `/dashboard` |
| `coordenador` | sim | Aplicação de Provas (Editais é só admin) | `/colaboradores` |
| `user` puro | sim | **nenhum** — vê o estado vazio ("fale com a administração") | — |
| `colaborador` puro (`role === null`) | **não** | — cai direto em `/perfil-colaborador` | — |

**O combo `user` + `colaborador` existe, e `user` prevalece.** Uma pessoa pode ter os dois papéis; `resolveRoleGestao` devolve `'user'` (não `null`), então ela **não** é "colaborador puro": cai no **hub** (estado vazio, pois `user` não tem módulo), não no portal do colaborador. Ela ainda alcança o próprio cadastro pelo item "Meu Cadastro" do header (`showFor: ['colaborador']`, sempre visível). Foi decisão explícita (2026-07-24): a dimensão de gestão manda sobre a de colaborador na hora de escolher o destino.

**Reforço — hub e `navLinks` são UX, não autorização.** Esconder um card ou um link não protege rota nenhuma; quem barra é RLS + as checagens das Edge Functions + o **`RequireAcesso`** das rotas (ver a seção adiante). Desde 2026-07-26 os guards são um só, e os papéis são declarados rota a rota no `App.tsx` — **não** lidos deste registro, justamente porque ele é UX e conhece papel por módulo, que é mais grosso que a rota.

### Uma guarda só: `RequireAcesso` (desde 2026-07-26)

As páginas de gestão **não guardam mais a si mesmas**. A autorização de rota mora em `src/components/RequireAcesso.tsx`, aplicado no `App.tsx`:

```tsx
<Route path="/dashboard" element={<RequireAcesso papeis={["admin"]}><Dashboard /></RequireAcesso>} />
```

**O que a guarda faz, e por que é isto que valia centralizar:** os três bugs que apareceram eram todos de MECÂNICA, nunca de política — `Colaboradores` e `FuncoesColaboradores` mandavam o deslogado ao login e paravam aí, `/perfil` não tinha guard nenhum, e o `Dashboard` usava `role !== null` como proxy de `rolesLoaded` e prendia o colaborador puro numa tela branca. Então a engrenagem é que ficou num lugar só: esperar `rolesLoaded`, respeitar `isLoggingOut`, deslogado para `/auth`, papel insuficiente para o hub.

⚠️ **Os papéis continuam na tabela de rotas, e NÃO vêm do registro de módulos** — ao contrário do que o backlog propunha. O registro conhece papel por **módulo**, e as rotas são mais finas: `aplicacao-provas` admite `coordenador`, mas `/dashboard`, `/unidades-prova`, `/salas-prova`, `/gerenciar-salas-distribuidas`, `/funcoes-colaboradores`, `/documentos-impressao` e `/painel-dados-colaboradores` são **só admin**. Ler os papéis do registro daria a essas sete um acesso que nunca tiveram — afrouxamento, não refatoração. E `modulos.ts` diz no cabeçalho que segurança não mora lá: ele é UX.

**Duas ressalvas viraram invariante:**

| Antes | Agora |
|---|---|
| 13 páginas decidiam sem esperar `rolesLoaded`; 4 esperavam | **nenhuma** decide sem os papéis |
| 3 páginas respeitavam `isLoggingOut`; 15 mandavam ao login | as de gestão ficam **todas** quietas |

**Três rotas seguem com guarda própria, de propósito**, porque não são páginas de módulo e cada uma decide diferente: `/` (o hub, que roteia por papel), `/perfil` e `/perfil-colaborador`.

🧪 **A especificação é `src/pages/guards.test.tsx`** — 137 testes, matriz 19 páginas × 5 papéis. O harness compõe rota + wrapper como o `App.tsx` faz; se um teste dali quebrar numa refatoração de autorização, a decisão mudou de comportamento.

### Conceder acesso de coordenador — um caminho só, desde 2026-07-26

**`useCoordenadoresProva.createMutation`**, no `CoordenadoresProvaDialog`, dentro da gestão da prova. Ele **exige alocação real**: um registro em `colaboradores_prova` para aquele colaborador, com função de coordenação (`FUNCOES_COORDENACAO`, ver [`alocacao-e-funcoes.md`](../modulos/aplicacao-provas/alocacao-e-funcoes.md)). Só vincula `user_id` ao `colaborador_prova_id` que já existe.

**O segundo caminho foi removido.** `useUsers.addCoordenadorAccess`, em `/gerenciar-usuarios`, adicionava o papel e, **quando não havia alocação elegível, fabricava um registro sintético** — pegava qualquer colaborador (`.limit(1)`, sem ordenação) e criava uma linha em `colaboradores_prova` sem função e sem valor, só para satisfazer a FK `NOT NULL` de `coordenadores_prova`.

**Por que aquilo era poluição, não atalho:** `colaboradores_prova` é a tabela de **alocação real** — de onde saem os relatórios e a base de pagamento. A linha fabricada punha um colaborador "trabalhando" numa unidade para a qual ninguém o escalou, e nada na tela de alocação a distinguia de uma real.

**A regra que ficou:** nesta tela se concede **papel puro** (superadmin, admin). Coordenação depende de alocação, então se concede — e se revoga — na prova. A coluna Coordenador do `/gerenciar-usuarios` virou **somente leitura**: mostra o papel e as provas, sem controle.

> ✅ **A fabricação acabou — as duas cópias saíram em 2026-07-26.** A EF `create-admin` tinha a própria (`createCoordenadorAccess`), com o mesmo `.limit(1)` e rodando com `service_role`, fora da RLS. Ela **passou a recusar `role: "coordenador"` com 400**, apontando o fluxo da prova, e o `provaId` saiu do contrato.
>
> **Por que recusar em vez de só ignorar o papel:** o papel sozinho não é inofensivo. `RequireAcesso` deriva `isCoordenador` de `user_roles` — quem o recebesse sem vínculo **passaria pelos guards** das rotas de coordenação e entraria, para ver listas vazias (as consultas se apoiam em `coordenadores_prova`). É o meio-usuário que levou alguém a fabricar alocação em primeiro lugar. Rebaixar em silêncio para `user` seria pior: papel errado, sem sinal.
>
> ⚠️ **Nada automatizado guarda isso** — a EF é Deno, fora do alcance da suíte, e o teste `⚠️ DEFEITO` que acusava a fabricação saiu junto com o hook. Quem mexer na `create-admin` roda a bateria manual: [`../../../docs/bateria-create-admin-autorizacao.md`](../../../docs/bateria-create-admin-autorizacao.md), casos **A9/A10** — e confere a **contagem** das duas tabelas antes e depois, porque o 400 sozinho não prova nada.

**Revogar** acontece no mesmo diálogo: o `deleteMutation` do `useCoordenadoresProva` apaga o vínculo e, **se era o último**, remove também o papel. A ordem é a segura — apaga o acesso antes do papel, então falhar no fim deixa papel sem acesso, que não concede nada (`is_coordenador_prova` lê só `coordenadores_prova`).

A revogação em massa por `updateRole` (`action: "remove"`) continua existindo no hook, hoje sem chamador na UI, e passa pela RPC transacional `revogar_coordenador`.

✅ **Isso eram dois passos SEM transação até 2026-07-26, e na pior ordem:** `updateRole` apagava `user_roles` **e só depois** `coordenadores_prova`. Como `is_coordenador_prova` consulta **apenas** `coordenadores_prova` — nunca `user_roles` —, falhar no segundo passo **tirava o papel da tela e mantinha o acesso real pela RLS**: a pessoa sumia da lista de coordenadores e seguia entrando nas provas dela.

Agora é uma transação só, pela RPC **`revogar_coordenador(p_user_id)`** (migration `20260726160000`). O corpo de uma função roda dentro de uma transação, então falhar em qualquer um dos DELETEs desfaz o outro. A autorização é `has_role(auth.uid(), 'admin')` — a mesma exigência das policies que ela substitui, nem mais nem menos —, e a função é cirúrgica: apaga o papel `coordenador` e os vínculos, preservando os outros papéis da pessoa.

> **Só o coordenador passa pela RPC.** Revogar `admin` ou `user` segue sendo um `DELETE` direto, que já é atômico por ser uma operação só. RPC ali seria cerimônia sem ganho.

✅ **O superadmin voltou a poder conceder acesso de coordenador (corrigido em 2026-07-26).** A EF `create-coordenador` autorizava o chamador com `SELECT` em `user_roles` filtrando `role = 'admin'` — match literal. Superadmin não tem linha `admin` (a `create-admin` insere só o papel escolhido), então levava **403 "Only admins can create coordinators"** justamente no caminho canônico da concessão. Era a **terceira ocorrência** da classe que a migration `20260725195530_superadmin_implica_admin_em_has_role.sql` existe para resolver. As duas checagens passaram a usar `has_role`:

| Onde | Papel exigido |
|---|---|
| EF `create-coordenador` — autorização do chamador | `has_role(user.id, 'admin')` |
| `CoordenadoresProvaDialog` — barreira do e-mail já cadastrado | `has_role(profile.id, 'admin')` |

**A regra, para não voltar:** papel para **autorizar** sai do `has_role`. `SELECT` literal em `user_roles` só se presta a duas coisas — apagar uma linha específica, ou checar se ela já existe antes de inserir (idempotência). Uma varredura em 2026-07-26 confirmou que os `.eq("role", …)` restantes no repo são todos desses dois tipos.

🧪 O diálogo tem bateria de interação desde 2026-07-26 (`CoordenadoresProvaDialog.ui.test.tsx`, 23 testes): a barreira do e-mail, o body da EF, os dois formatos de erro dela e o fluxo de remoção.

### RLS não é o único portão: sem `GRANT`, a policy nem é avaliada

Toda tabela de `public` tem RLS ativa e policies — mas o Postgres checa o **privilégio de tabela antes** da RLS. Se `authenticated` não tiver `GRANT SELECT`, o PostgREST devolve `42501 permission denied` e a policy nunca roda. Foi exatamente isso que quebrou o login em dev local até 2026-07-12: os `GRANT`s existiam em produção (criados implicitamente pelo dashboard do Lovable) mas nunca tinham sido registrados em migration. A migration `20260712010000_grant_api_roles_table_privileges.sql` corrigiu isso e ajustou o `ALTER DEFAULT PRIVILEGES` para que tabelas futuras já nasçam certas. Detalhes em [`desenvolvimento-local.md`](./desenvolvimento-local.md).

Consequência prática ao criar uma tabela nova: RLS ativa + policy correta **não basta** se o role não tiver GRANT.
