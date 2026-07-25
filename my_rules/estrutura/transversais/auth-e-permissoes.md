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

- `/perfil` — dados do próprio usuário (tabela `profiles`), qualquer conta.
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

**Reforço — hub e `navLinks` são UX, não autorização.** Esconder um card ou um link não protege rota nenhuma; quem barra é RLS + as checagens das Edge Functions + os guards de página (cada página de gestão tem o seu, padrão `Dashboard.tsx`). Centralizar esses guards num `RequireModulo` lido do registro é melhoria pendente (backlog), deliberadamente fora do tema que criou o hub.

### Duas formas distintas de conceder acesso de coordenador — atenção ao mexer aqui

Existem **dois caminhos diferentes** no código para dar acesso de coordenador a um usuário, com precondições distintas:

1. **`useCoordenadoresProva.createMutation`** (usado em `CoordenadoresProvaDialog`, dentro do fluxo normal de gestão de uma prova) — exige que já exista um registro em `colaboradores_prova` para aquele colaborador com uma função de coordenação (`FUNCOES_COORDENACAO`, ver [`alocacao-e-funcoes.md`](../modulos/aplicacao-provas/alocacao-e-funcoes.md)) e apenas vincula `user_id` a esse `colaborador_prova_id` existente.
2. **`useUsers.addCoordenadorAccess`** (usado em `/gerenciar-usuarios`) — caminho mais "de emergência": adiciona a role `coordenador` em `user_roles` e, se não existir um `colaboradores_prova` elegível, **cria um registro sintético** usando qualquer colaborador disponível (primeiro encontrado) e nenhuma função definida, só para satisfazer o vínculo. Isso é um workaround visível no código, não uma feature deliberada de "coordenador sem colaborador real" — se for mexer em concessão de acesso de coordenador, esse caminho alternativo é a explicação mais provável de um `coordenadores_prova` com dados estranhos/incompletos.

Remover o papel de coordenador (`updateRole` com `action: "remove"`) também remove em cascata todos os registros de `coordenadores_prova` daquele usuário.

### RLS não é o único portão: sem `GRANT`, a policy nem é avaliada

Toda tabela de `public` tem RLS ativa e policies — mas o Postgres checa o **privilégio de tabela antes** da RLS. Se `authenticated` não tiver `GRANT SELECT`, o PostgREST devolve `42501 permission denied` e a policy nunca roda. Foi exatamente isso que quebrou o login em dev local até 2026-07-12: os `GRANT`s existiam em produção (criados implicitamente pelo dashboard do Lovable) mas nunca tinham sido registrados em migration. A migration `20260712010000_grant_api_roles_table_privileges.sql` corrigiu isso e ajustou o `ALTER DEFAULT PRIVILEGES` para que tabelas futuras já nasçam certas. Detalhes em [`desenvolvimento-local.md`](./desenvolvimento-local.md).

Consequência prática ao criar uma tabela nova: RLS ativa + policy correta **não basta** se o role não tiver GRANT.
