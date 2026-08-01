# Roadmap — Refatoração do acesso do colaborador (Supabase Auth)

> 📁 **HISTÓRICO — não leia por padrão.** Este arquivo registra um tema já entregue.
> Abra só quando o pedido for sobre o passado (*por que ficou assim? o que se tentou?
> que alternativa foi rejeitada?*). **Não é plano** — nada aqui é lista de tarefas.
> Para o que o sistema É, veja `my_rules/estrutura/`; para o que FALTA, `my_rules/backlog.md`.

> **Data:** 2026-07-13. **Natureza:** documento de desenho. Registra as decisões tomadas para corrigir as fragilidades do laudo [`fragilidades-auth-colaborador.md`](./fragilidades-auth-colaborador.md) e serve de roteiro da implementação. Nenhum código foi escrito ainda.
>
> Quando a refatoração for concluída, o que mudou é descrito em [`../../estrutura/transversais/auth-e-permissoes.md`](../../estrutura/transversais/auth-e-permissoes.md) e o item correspondente sai do [`../../backlog.md`](../../backlog.md). Este arquivo permanece como registro da decisão.

## A decisão de fundo

Das duas opções abertas pelo laudo, adotamos a **(A): migrar o portal do colaborador para o Supabase Auth de verdade**. O `auth.uid()` volta a ser a âncora de identidade — RLS e RPCs param de confiar num `p_colaborador_id` escolhido pelo cliente.

O objetivo original era *"todo colaborador vira um usuário"*, via script de migração em massa. **Essa premissa foi abandonada de propósito.** No lugar dela: **todo colaborador *pode* virar usuário, por auto-cadastro.** A responsabilidade de criar a conta passa para o próprio colaborador, e `colaboradores.user_id` fica nulo para quem nunca se cadastrar (que continua existindo normalmente como linha de dados, gerida pelo admin).

A troca não é só de conveniência — ela dissolve dois problemas que o script em massa criaria:

- **A senha inicial deixa de existir como problema.** Cada um define a própria senha no cadastro. Não nascem 771 contas com uma credencial provisória que ninguém troca.
- **A falta de e-mail deixa de ser bloqueio.** Quem quer o portal traz um e-mail; quem não quer, não precisa de um.

## Os fatos do banco que fundamentam o desenho

Levantados no banco local em 2026-07-13 (que é a fonte de verdade — ver [`../../banco-producao.md`](../../banco-producao.md)):

| Fato | Número |
| --- | --- |
| Colaboradores cadastrados | 771 |
| ...com senha (`colab_senha`) definida | **0** |
| ...com código de acesso (`colab_codigo_acesso`) | 771 |
| ...que já usaram o portal (`colab_ultimo_acesso`) | 493 |
| ...com e-mail | 523 |
| ...sem e-mail | 248 |
| Usuários no `auth.users` | 15 |
| Colaboradores que **já são** usuários (casando por e-mail) | 11 |
| ...casando também por **nome** (o número real — ver a seção da etapa 1) | **12** |

Três leituras importam:

1. **Ninguém tem senha.** A coluna `colab_senha` (bcrypt) está vazia nas 771 linhas — `set_colaborador_password` nunca foi usada de fato. Não há credencial herdada para preservar.
2. **Os 11 que já têm usuário são a cúpula:** 2 admins (um deles `superadmin`) e 9 coordenadores. São pessoas que são *ao mesmo tempo* colaboradores e gestores — prova de que "ser colaborador" e "ter papel de gestão" são dimensões que se sobrepõem, e não valores concorrentes de um mesmo campo.
3. **1/3 da base não tem e-mail** (248), e há **3 e-mails repetidos** entre pares de colaboradores.

## Decisões de desenho

### 1. O papel vive em `user_roles`, não em `profiles`

Acrescenta-se **`'colaborador'` ao enum `app_role`** (hoje: `admin`, `user`, `coordenador`, `superadmin`), concedido via `user_roles`.

*Por quê:* `profiles` não tem coluna de tipo, e criar um `tipo` singular ali quebraria os 9 coordenadores que também são colaboradores — um campo único forçaria escolher entre os dois. `user_roles` já é multi-papel (`UNIQUE (user_id, role)`), já é o que as RLS entendem via `has_role()`, e acomoda a sobreposição sem contradição.

### 2. O elo é `colaboradores.user_id`

Nova coluna `colaboradores.user_id uuid REFERENCES auth.users(id)`, **`UNIQUE`**, nula enquanto a pessoa não se cadastrar.

Hoje não existe elo nenhum entre `colaboradores` e `auth.users` — o único vínculo é a coincidência de texto do e-mail. Sem essa coluna, não há opção A: é ela que permite ao `auth.uid()` ancorar RLS e RPCs.

O `UNIQUE` não é decorativo: sem ele, os e-mails repetidos permitiriam que uma pessoa acabasse dona de dois registros de colaborador.

### 3. A prova de identidade é o e-mail que já está no cadastro

Para reivindicar um registro existente, o colaborador informa o **CPF**; o sistema mostra o **e-mail que consta no cadastro dele — mascarado** (`j2***@hotmail.com`) — e envia para lá o link de confirmação. Quem controla aquela caixa define a senha e passa a ser o dono da conta.

*Por que mascarado:* é igualmente usável ("é este mesmo?", e quem é dono da caixa reconhece), e não entrega uma lista de e-mails a quem varra CPFs. Confirmar que o CPF existe já é uma concessão aceita — a base tem dados bancários, e quem os persegue já conhece o CPF do alvo; entregar de brinde o e-mail seria dar um alvo novo de graça.

*Por quê só o e-mail:* é a única prova forte que já existe. Rejeitamos deliberadamente uma cascata de provas alternativas (código de acesso, aprovação manual) — uma regra só, simples de construir e de explicar.

**Quando o e-mail está errado ou ausente**, o caminho é humano: o **coordenador corrige o e-mail no cadastro do colaborador** (a policy de UPDATE de `colaboradores` já contempla `admin` e `coordenador` — não é preciso permissão nova), e o colaborador então se cadastra. Isso vale para os 248 sem e-mail e para as 6 linhas da limpeza abaixo. Não é exceção rara: é potencialmente 1/3 da base passando pelo coordenador — mas de forma incremental, só quando a pessoa quiser acesso.

**A reivindicação só é permitida se `user_id IS NULL`.** É um `WHERE` na RPC, e é o que faz a conta ficar de fato fechada depois do vínculo: reivindicar não pode ser uma operação repetível.

### 4. Os e-mails duplicados são zerados antes da migração

Os 3 e-mails que aparecem em 2 colaboradores cada (`suelenbertoldo9@gmail.com`, `yann_vr9@hotmail.com`, `teste@example.com`) têm o `colab_email` **apagado nas 6 linhas** — nenhum lado do par fica com o e-mail.

*Por quê apagar dos dois lados:* um e-mail corresponde a exatamente um usuário no Supabase Auth. Manter o e-mail em um dos pares seria escolher arbitrariamente quem tem direito à caixa, e deixaria a outra pessoa travada sem explicação. Zerando ambos, os 6 caem no caminho do coordenador, que é quem sabe de quem é o quê. **A resolução é humana e posterior** — não bloqueia a refatoração.

> **✅ Feito em 2026-07-14 — e não como migration.** A limpeza foi aplicada **dentro do `supabase/seed.local.sql`**, não em `supabase/migrations/`. O motivo está na regra do `[db.seed]`: o seed roda **depois** das migrations no `db reset` e **não roda em `db push`**. Uma migration de limpeza rodaria contra a tabela vazia (no-op) e o dump, logo depois, reintroduziria os 6 duplicados. **Dado que entra pelo dump só pode ser corrigido no dump.** Detalhes da edição (só `colab_email`; `colab_chave_pix` e `email_atualizacao_log` preservados) em [`../../estrutura/transversais/desenvolvimento-local.md`](../../estrutura/transversais/desenvolvimento-local.md). Números depois da limpeza: 771 colaboradores, **517 com e-mail, 254 sem**.
>
> **Cuidado herdado:** o `seed.local.sql` **não é versionado** (PII). A correção vive só no arquivo local e no dump que subirá para a produção da v2 — **um dump novo gerado pela `export-seed` nasce sem ela.**

### 5. O código de acesso morre no fluxo, e a coluna também

> **✅ Atualização (2026-07-15):** a coluna `colab_codigo_acesso` foi **dropada** na 2D (migration `20260715131321_*`, junto com o CHECK). O texto abaixo era o desenho original ("a coluna fica por ora"); a limpeza posterior aconteceu.

O código de 4 dígitos deixa de ser usado para qualquer coisa: some do frontend, e as funções que o manipulam são aposentadas. ~~A coluna `colab_codigo_acesso` permanece na tabela por ora~~ — o `DROP` foi feito na 2D.

Com o e-mail como única prova, o código perde a razão de existir — e sua remoção **elimina de uma vez as fragilidades 2, 3, 4 e 5 do laudo** (texto puro, 4 dígitos sem rate limit, o reset que devolve a credencial na resposta HTTP, o e-mail arbitrário gravado sem verificação). São resolvidas por remoção, não por correção.

## As etapas

A ordem abaixo inverte a proposta inicial (que começava pelo frontend): **a fundação no banco precede a porta nova**, senão o fluxo de reivindicação não tem onde gravar o vínculo.

> ### 📍 Onde paramos — ✅ REFATORAÇÃO COMPLETA (2026-07-15)
>
> **Tudo concluído.** As etapas 1, 2 (2A/2B/2C) e 3 (2D) estão feitas na branch `feat/auth-colaborador`; as 8 fragilidades do laudo resolvidas; o item saiu do `backlog.md`. Falta apenas o **deploy** (bootstrap da v2 — ver [`../../banco-producao.md`](../../banco-producao.md)). O histórico da etapa 1 abaixo fica como registro.
>
> | | |
> | --- | --- |
> | `4bf50b8` | limpeza dos 3 e-mails duplicados (no `seed.local.sql`) |
> | `d934ed0` | `'colaborador'` no enum `app_role` + coluna `colaboradores.user_id` |
> | `03842c7` | unicidade de `colab_email` e `colab_chave_pix` + coluna `tipo_chave_pix` |
> | — | **backfill dos 12**, no `seed.pos.sql` (novo, versionado) |
>
> O terceiro não estava no roadmap: é um pedido à parte, feito enquanto a tabela estava aberta (ver [`../../estrutura/modulos/aplicacao-provas/colaboradores.md`](../../estrutura/modulos/aplicacao-provas/colaboradores.md)). Ele ajuda a refatoração de raspão — o índice único do e-mail impede que o mesmo endereço volte a se repetir e reabra o problema que a limpeza fechou.

### Etapa 1 — Fundação no banco (sem efeito visível)

- **[✅ feito em 2026-07-14]** Limpeza: `colab_email = NULL` nas 6 linhas dos 3 e-mails duplicados — **no `seed.local.sql`**, pelo motivo explicado na decisão 4 acima.
- **[✅ feito em 2026-07-14]** `'colaborador'` no enum `app_role` — migration `20260714162027_add_colaborador_ao_enum_app_role.sql`. Sozinho num arquivo de propósito: no Postgres, um valor novo de enum não pode ser *usado* na mesma transação em que é criado, então o backfill precisa vir depois.
- **[✅ feito em 2026-07-14]** Coluna `colaboradores.user_id`, `UNIQUE`, FK para `auth.users(id)` **`ON DELETE SET NULL`** — migration `20260714162029_add_user_id_em_colaboradores.sql`. O `SET NULL` é deliberado: apagar a conta não pode apagar a pessoa (`CASCADE` destruiria folha de pagamento); o cadastro só volta a ficar não-vinculado.
- **[✅ feito em 2026-07-14]** **Backfill dos 12** que já são usuários: preenche `colaboradores.user_id` e concede o papel `colaborador` em `user_roles`. É o "script" da conversa original — 12 linhas, não 771. Mora no **`supabase/seed.pos.sql`** (novo), pelo motivo do quadro abaixo. **Quem são os 12, um a um** (e as 3 contas do Auth que ficaram de fora): [`backfill-colaboradores-usuarios.md`](./backfill-colaboradores-usuarios.md).

**Schema em migrations novas** (ver [`../../estrutura/transversais/desenvolvimento-local.md`](../../estrutura/transversais/desenvolvimento-local.md) — migrations aplicadas nunca são editadas). **Mas dado não:**

> ⚠️ **O backfill é operação de dados e tem o mesmo problema da limpeza acima.** Como migration, ele rodaria no bootstrap de produção **antes** da carga do `seed.local.sql` — contra `colaboradores` e `auth.users` vazios, casando zero linhas — e nunca mais rodaria (migration roda uma vez). Os 12 nasceriam em produção **sem `user_id` e sem o papel `colaborador`**, e a cúpula ficaria sem acesso de colaborador, silenciosamente.
>
> **Decidido em 2026-07-14: um `seed.pos.sql` versionado**, acrescentado a `sql_paths` **depois** do `seed.local.sql`. Foi a única das três saídas que fica **versionada e roda sozinha no `db reset`** (as outras eram: viver dentro do dump, que se perde num dump novo; ou virar migration com o seed carregado no meio do `db push`). Em produção, onde seed não roda, ele é o **passo 5 do bootstrap** — ver [`../../banco-producao.md`](../../banco-producao.md).
>
> As duas primeiras linhas da etapa (o enum e a coluna `user_id`) são schema puro e **não** têm esse problema: seguem como migrations normais.

#### Eram 12, não 11 — e o 12º é um coordenador (descoberto em 2026-07-14)

O número **11** vinha de casar `colab_email` com `auth.users.email`. Casando também por **nome**, aparece um 12º: **JOAO PAULO**, coordenador, que é colaborador mas se cadastrou no Auth com um e-mail **diferente** do que consta no cadastro dele. O casamento por e-mail o perdia — exatamente o modo de falha silencioso que o backfill existe para evitar. **A cúpula é 2 admins + 10 coordenadores.**

Por isso o backfill casa por **e-mail OU por nome**, com uma trava: só vincula quando o casamento é **inequívoco nos dois sentidos** (um colaborador para um usuário). Homônimo, e-mail repetido ou nome que case com duas contas **não vinculam nada** — a linha fica NULL e a pessoa entra pelo fluxo normal de reivindicação, que é o comportamento seguro. Vincular a pessoa errada é o pior erro possível nesta tabela, que tem conta bancária.

Verificado antes de escrever a regra: **não há homônimos reais** entre os 771 (o único nome repetido é "TESTE AUTOMATIZADO", linha de teste). Depois do `db reset`: 12 vinculados, 12 com o papel, zero vínculos cruzados, e o nome do cadastro batendo com o da conta nas 12 linhas.

Três contas do Auth **não** são colaboradores e ficaram de fora, corretamente: uma pessoa que não existe na `colaboradores`, uma "Nathalia" que não dá para desambiguar entre duas colaboradoras homônimas (papel `user`, não é cúpula), e a **segunda conta do próprio Caio** — ver as dívidas no [`../../backlog.md`](../../backlog.md).

### Etapa 2 — Porta única e reivindicação

> **Dividida em subetapas (2026-07-14).** A etapa 2 é grande demais para um passo só; foi quebrada em quatro. A **2A já está feita**. A ordem importa: as portas velhas só fecham (subetapa D, que é a etapa 3) depois que a reivindicação (B) estiver de pé.
>
> - **✅ 2A — A porta e a identidade** (commit `99fb867`). `/auth` virou login e-mail/senha do Supabase Auth com "esqueci minha senha" nativo; nova rota `/redefinir-senha`. A identidade do colaborador passou a vir de `auth.uid() → colaboradores.user_id`, via as RPCs novas `get_meu_colaborador` / `update_meu_colaborador` / `update_meus_dados_bancarios` (migration `20260714193057`, `GRANT` só a `authenticated`). `useColaboradorAuth`, `ForgotCodeCard` e `AuthAdmin` foram **deletados**; `/auth-admin` redireciona para `/auth`. Quem entra: os **12** vinculados no backfill. **Nada mais mudou no banco das portas velhas** — as RPCs antigas seguem vivas até a subetapa D.
> - **✅ 2B — A reivindicação** (commit `b7d063f`). Os 759 sem conta entram por "Primeiro acesso" em `/auth`: CPF → e-mail mascarado → link do Auth → senha. O **mecanismo do vínculo é o trigger** `handle_new_user` (migration `20260714201650`): ao nascer qualquer conta cujo e-mail case com um colaborador de `user_id NULL`, ele preenche `user_id` e concede `colaborador` — o backfill dos 12 virou contínuo, sem nada vindo do cliente. Nasceu a Edge Function **`reivindicar-acesso`** (`{existe, ja_vinculado, email_mascarado}` + `generateLink` invite + envio via `send-email` com HTML da FEVRE; rate limit 5/15min por IP na tabela `reivindicacao_rate_limit`) e o `ReivindicarAcessoCard`. A `check-cpf-colaborador` foi **endurecida** (só `{exists}`, sem o e-mail) em vez de deletada — o `CadastroPublico` ainda a usa; a fusão das duas é a 2C. Sem e-mail no cadastro → procurar o coordenador (o ramo `needsEmail` morreu). **Dívida contida:** um pedido de reivindicação para um CPF alheio dispara um invite ao e-mail da vítima e marca o registro como vinculado — mas à conta do *próprio dono* do e-mail (recuperável por "esqueci senha"), e o rate limit limita o abuso.
> - **✅ 2C — O cadastro público** (commit `cc50852`). `/cadastro-publico` deixou de pedir o código de 4 dígitos: cria a linha de colaborador (e-mail obrigatório) e dispara o mesmo invite da reivindicação — a conta é vinculada pelo trigger. Se o CPF já existe, mostra o `ReivindicarAcessoCard` inline (as duas portas convergem). O invite virou o helper compartilhado `_shared/enviar-link-acesso.ts` (usado por `reivindicar-acesso` e `public-create-colaborador`). O trigger `generate_codigo_acesso` foi **removido** (migration `20260714205901`) — colaboradores novos nascem com código NULL; a coluna fica para a 2D. A `check-cpf-colaborador` **não** foi fundida com a `reivindicar-acesso`: ficou separada de propósito (é a checagem sem efeito colateral).
> - **D — Fechar as portas velhas** = a **etapa 3** abaixo (REVOKE, aposentar RPCs, tirar a trava da policy, e o DROP das sobras do código).
>
> **Decisões tomadas na 2A que não estavam previstas:**
> - **O papel `colaborador` vive fora da hierarquia de gestão** no `useAuth` (`isColaborador`, à parte de `role`). Um campo único rebaixaria os 10 coordenadores que também são colaboradores.
> - **Salvar o perfil deixou de deslogar.** Era herança do modelo de sessão efêmera (CPF+código); com a sessão real do Auth, expulsava os 12 gestor+colaborador da sessão de gestão só por editarem o próprio cadastro. Agora confirma com toast e mantém a sessão.
> - **O indicador de "colaborador online" foi removido** (badge, coluna e o trava-edição por presença na `ColaboradoresList`). Ele lia `colaborador_sessions`, que ninguém mais alimenta desde que as chamadas de sessão saíram — mostrar "todos offline" é pior que não mostrar. É a face de UI da mesma dívida da trava de edição concorrente (ver "dívida assumida"). A tabela em si morre na etapa 3.
> - **Roteamento pós-login:** admin → `/dashboard`, coordenador → `/`, só-colaborador → `/perfil-colaborador`. Os 12 gestor+colaborador caem na gestão e alcançam o cadastro por um item de menu "Meu Cadastro".

**O desenho original da porta e da reivindicação (subetapas 2A + B):**

- **`/auth` vira login + cadastro do Supabase Auth**, unificando com `/auth-admin` (que já usa Auth de verdade). Uma porta só para todo mundo. *(feito na 2A)*
- **Fluxo de reivindicação:** CPF → tela mostra o e-mail do cadastro **mascarado** → link de confirmação → colaborador define a própria senha → `user_id` é gravado e o papel `colaborador` concedido. *(subetapa B)*
- **`/cadastro-publico`** (auto-cadastro de quem ainda não existe na base) passa a criar o usuário do Auth junto com a linha de colaborador, já vinculados — e deixa de pedir um código de 4 dígitos. Se o CPF já existir, a pessoa é encaminhada para o fluxo de reivindicação: as duas portas convergem. *(subetapa C)*
- Morre a "sessão" `{id, nome, cpf}` do `localStorage` (fragilidade 6). *(feito na 2A)*

#### O destino do link "Estou sem meu código" (decidido em 2026-07-14)

O link de `/auth` que hoje abre o `ForgotCodeCard` **não é corrigido — é aposentado.** Ele é o carregador literal das fragilidades 4 e 5: mostra o e-mail cadastrado **por extenso**, recebe o código de volta do `reset-codigo-acesso` e o envia pelo próprio cliente, e — no ramo `needsEmail` — **aceita um e-mail digitado na hora e o grava naquele CPF**. Além disso, o objeto que ele entrega (o código de 4 dígitos) deixa de existir. `ForgotCodeCard.tsx` é **deletado**.

Mas a *forma* dele é reaproveitada: CPF → localizar o cadastro → mandar e-mail é exatamente o desenho da reivindicação. Nasce um **`ReivindicarAcessoCard.tsx`** com o mesmo esqueleto (formulário de CPF, estados de busy/erro, o modal de sucesso com o aviso de caixa de spam) e as tripas trocadas:

- o e-mail aparece **mascarado**, nunca por extenso;
- quem envia o link é o **Supabase Auth** — a credencial nunca transita de volta pelo cliente;
- o ramo `needsEmail` **morre**: no lugar, a orientação de procurar o coordenador (é o caminho já decidido para os 248 sem e-mail).

Onde hoje há **um** link ambíguo, passam a existir **dois** caminhos, que a refatoração finalmente separa:

1. **"Primeiro acesso / ainda não tenho conta"** → o fluxo de reivindicação acima.
2. **"Esqueci minha senha"** → o reset de senha nativo do Supabase Auth (não escrevemos fluxo nenhum), disponível só para quem já tem conta.

Consequências para o resto da pilha:

- **`check-cpf-colaborador` é substituído** por uma RPC nova que devolve `{existe, email_mascarado, ja_vinculado}` — e **nunca** o e-mail inteiro. Ela precisa **normalizar o CPF** (fragilidade 7: o front faz `padStart(11)`, a RPC atual compara como veio) e precisa de **rate limit**, senão trocamos um oráculo de enumeração por outro.
- **`reset-codigo-acesso` e o `buildEmailHtml`** somem. O e-mail com a identidade visual da FEVRE (logo, cores) vira um **template do Supabase Auth**, configurado no dashboard — é trabalho novo, e cai junto no passo "auth no dashboard" do bootstrap de produção (ver [`../../banco-producao.md`](../../banco-producao.md)).

### Etapa 3 (= subetapa 2D) — Fechar as portas velhas

> **✅ COMPLETA em 2026-07-15.** Todos os itens abaixo foram feitos: REVOKE (item 1), RLS de verdade, DROP das RPCs antigas (item 3), remoção da trava de edição + sobras de sessão (itens 4–5), e o e-mail em massa aposentado + DROP da coluna `colab_codigo_acesso` (item 6). **Com isso a refatoração inteira do acesso do colaborador (etapas 1–3) está fechada, e as 8 fragilidades do laudo estão resolvidas.**
>
> As novas RPCs por `auth.uid()` já existem (2A: `get_meu_colaborador` etc.), e o fluxo inteiro já não usa mais as antigas. A 2D foi sobre **trancar e limpar** o que ficou de pé, não sobre reescrever caminhos.

- **[✅ feito em 2026-07-15]** **`REVOKE`** dos `GRANT EXECUTE ... TO PUBLIC` (fragilidade 1 — o coração do laudo). Migration `20260715072758_revoke_public_execute_rpcs_colaborador_antigas.sql`: revogou o `EXECUTE` de `PUBLIC` nas 15 assinaturas mortas do portal velho (as 3 da fragilidade 1 **e** as demais da mesma classe — `update_colaborador_data` ×3, `verify_colaborador_password`, `check_colaborador_has_password`, as três de sessão). Ficaram de fora, vivas: `is_colaborador_logged_in` (chamada no front e referenciada na policy de UPDATE — sai no DROP) e `get_coordenador_colaboradores` (lado gestão). Verificado: `anon` recebe `permission denied` na morta e ainda executa a viva.
- **[✅ feito em 2026-07-15]** **RLS de verdade em `colaboradores`**, ancorada em `user_id = auth.uid()` para o próprio colaborador, mantendo o acesso de admin/coordenador via `has_role()`. Migration `20260715073500_rls_colaboradores_por_auth_uid.sql`: trocou o SELECT `USING (true)` por `has_role(admin) OR has_role(coordenador) OR user_id = auth.uid()`. Só o SELECT — INSERT/UPDATE/DELETE já eram `has_role` (a trava `is_colaborador_logged_in` no UPDATE é item à parte). Verificado por papel (rolled-back txns): admin/coord veem 771, colaborador puro vê só a própria linha, `anon` vê 0; a RPC `get_meu_colaborador` segue devolvendo o cadastro (SECURITY DEFINER contorna RLS).
- **[✅ feito em 2026-07-15]** Aposentar as RPCs/functions mortas — migration `20260715125720_drop_rpcs_colaborador_antigas.sql`: dropou as 15 assinaturas (as do item 1 revogado: `get_colaborador_full_data`, `get_colaborador_by_id`, `set_colaborador_password`, `update_colaborador_data_full`, `update_colaborador_data` ×3, `update_colaborador_bank_data`, `verify_colaborador_codigo_acesso`, `verify_colaborador_password`, `verify_colaborador_first_access`, `check_colaborador_has_password`, `register/unregister/update_colaborador_session_activity`) e removeu a Edge Function `reset-codigo-acesso`. Antes de dropar: conferido que nenhuma função mantida, trigger ou policy as referencia. `types.ts` regenerado (removeu as mortas, incluiu a `reivindicacao_rate_limit` que a 2B não regenerou); `tsc` e `npm run build` passam. **`check-cpf-colaborador` FICA** — na 2C decidiu-se mantê-la (é a checagem de existência sem efeito colateral que o pré-cadastro usa; já endurecida para só `{exists}`).
- **[✅ feito em 2026-07-15]** **Tirar o `AND NOT is_colaborador_logged_in(id)`** da policy de UPDATE de `colaboradores`. Migration `20260715130603_*`: policy recriada só com `has_role(admin) OR has_role(coordenador)`; pré-check equivalente removido do `useColaboradores`. Verificado por papel: admin/coord editam, colaborador puro não edita direto (grava pela RPC).
- **`DROP` das sobras:** **[✅ feito em 2026-07-15]** dropadas `is_colaborador_logged_in` e a tabela `colaborador_sessions` (migration `20260715130603_*`); template órfão `_shared/transactional-email-templates/codigo-acesso.tsx` removido; e a coluna `colab_codigo_acesso` (+ CHECK `colab_codigo_acesso_format`) dropada (migration `20260715131321_*`).
- **[✅ feito em 2026-07-15]** **E-mail em massa do `PainelDadosColaboradores.tsx`:** **decisão — aposentar o botão inteiro.** Removida a feature (botão "Solicitar Atualização de Dados", `buildEmailHtml`, `getCamposFaltantes`, o dialog, a leitura de `email_atualizacao_log`); a página virou um painel read-only (nome, e-mail, unidade, último acesso). A tabela `email_atualizacao_log` fica (histórico). A coluna "Código de acesso" saiu dos exports de `GerenciarProva` e `GerenciarColaboradoresProva`, e `colab_codigo_acesso` saiu do tipo/erros do `useColaboradores` — o que destravou o DROP da coluna. `tsc` + `build` passam.
- **[✅ verificado em 2026-07-15]** Corrigir o doc [`../../estrutura/transversais/auth-e-permissoes.md`](../../estrutura/transversais/auth-e-permissoes.md) se ainda restar a afirmação de que o código é comparado contra hash. **Não restava** — o doc já foi reescrito nas subetapas anteriores e não afirma nada sobre hash; nada a corrigir.
- **[✅ nota — fragilidade 7 resolvida]** A `check-cpf-colaborador` (única sobrevivente do modelo antigo) **normaliza o CPF** (`replace(/\D/g,'').padStart(11,'0')`) antes de comparar — a divergência de normalização entre camadas (fragilidade 7) não existe mais; a RPC velha que comparava o CPF cru foi dropada no item 3.

## Dívidas assumidas e ponto em aberto

**Nenhum ponto em aberto na implementação.** As etapas 1–3 estão completas; falta só o **deploy** (bootstrap da v2, ver [`../../banco-producao.md`](../../banco-producao.md)).

As **dívidas assumidas conscientemente** por esta refatoração (sequestro de conta por troca de e-mail; edição concorrente sem trava / last-write-wins; reivindicação de CPF alheio) foram tiradas deste registro histórico e passaram a viver, com todo o raciocínio, em [`../dividas-auth-colaborador.md`](../dividas-auth-colaborador.md) — que também aponta para as dívidas **acionáveis** no [`../../backlog.md`](../../backlog.md) (3 contas do Auth; drift dos grants de `anon`/`authenticated`).

**Fragilidade 7 (normalização de CPF) — resolvida:** a `check-cpf-colaborador`, única sobrevivente, normaliza o CPF antes de comparar; a RPC velha que comparava cru foi dropada.

O ponto de desenho que esteve em aberto — *onde vive o backfill* — foi resolvido em 2026-07-14 com o `seed.pos.sql`: **migration não alcança dado que entra pelo dump.**
