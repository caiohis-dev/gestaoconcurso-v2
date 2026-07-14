# Roadmap — Refatoração do acesso do colaborador (Supabase Auth)

> **Data:** 2026-07-13. **Natureza:** documento de desenho. Registra as decisões tomadas para corrigir as fragilidades do laudo [`fragilidades-auth-colaborador.md`](./fragilidades-auth-colaborador.md) e serve de roteiro da implementação. Nenhum código foi escrito ainda.
>
> Quando a refatoração for concluída, o que mudou é descrito em [`../estrutura/auth-e-permissoes.md`](../estrutura/auth-e-permissoes.md) e o item correspondente sai do [`../backlog.md`](../backlog.md). Este arquivo permanece como registro da decisão.

## A decisão de fundo

Das duas opções abertas pelo laudo, adotamos a **(A): migrar o portal do colaborador para o Supabase Auth de verdade**. O `auth.uid()` volta a ser a âncora de identidade — RLS e RPCs param de confiar num `p_colaborador_id` escolhido pelo cliente.

O objetivo original era *"todo colaborador vira um usuário"*, via script de migração em massa. **Essa premissa foi abandonada de propósito.** No lugar dela: **todo colaborador *pode* virar usuário, por auto-cadastro.** A responsabilidade de criar a conta passa para o próprio colaborador, e `colaboradores.user_id` fica nulo para quem nunca se cadastrar (que continua existindo normalmente como linha de dados, gerida pelo admin).

A troca não é só de conveniência — ela dissolve dois problemas que o script em massa criaria:

- **A senha inicial deixa de existir como problema.** Cada um define a própria senha no cadastro. Não nascem 771 contas com uma credencial provisória que ninguém troca.
- **A falta de e-mail deixa de ser bloqueio.** Quem quer o portal traz um e-mail; quem não quer, não precisa de um.

## Os fatos do banco que fundamentam o desenho

Levantados no banco local em 2026-07-13 (que é a fonte de verdade — ver [`../banco-producao.md`](../banco-producao.md)):

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

### 5. O código de acesso morre no fluxo, mas a coluna fica

O código de 4 dígitos deixa de ser usado para qualquer coisa: some do frontend, e as funções que o manipulam são aposentadas. **A coluna `colab_codigo_acesso` permanece na tabela por ora** — o `DROP` fica para uma limpeza posterior, quando a refatoração estiver assentada.

Com o e-mail como única prova, o código perde a razão de existir — e sua remoção **elimina de uma vez as fragilidades 2, 3, 4 e 5 do laudo** (texto puro, 4 dígitos sem rate limit, o reset que devolve a credencial na resposta HTTP, o e-mail arbitrário gravado sem verificação). São resolvidas por remoção, não por correção.

## As etapas

A ordem abaixo inverte a proposta inicial (que começava pelo frontend): **a fundação no banco precede a porta nova**, senão o fluxo de reivindicação não tem onde gravar o vínculo.

### Etapa 1 — Fundação no banco (sem efeito visível)

- `'colaborador'` no enum `app_role`.
- Coluna `colaboradores.user_id`, `UNIQUE`, FK para `auth.users(id)`.
- Limpeza: `colab_email = NULL` nas 6 linhas dos 3 e-mails duplicados.
- **Backfill dos 11** que já são usuários: casa `colaboradores.colab_email` com `auth.users.email`, preenche `user_id` e concede o papel `colaborador` em `user_roles`. É o "script" da conversa original — 11 linhas, não 771.

Tudo em migrations novas (ver [`../estrutura/desenvolvimento-local.md`](../estrutura/desenvolvimento-local.md) — migrations aplicadas nunca são editadas).

### Etapa 2 — Porta única e reivindicação

- **`/auth` vira login + cadastro do Supabase Auth**, unificando com `/auth-admin` (que já usa Auth de verdade). Uma porta só para todo mundo.
- **Fluxo de reivindicação:** CPF → tela mostra o e-mail do cadastro **mascarado** → link de confirmação → colaborador define a própria senha → `user_id` é gravado e o papel `colaborador` concedido.
- **`/cadastro-publico`** (auto-cadastro de quem ainda não existe na base) passa a criar o usuário do Auth junto com a linha de colaborador, já vinculados — e deixa de pedir um código de 4 dígitos. Se o CPF já existir, a pessoa é encaminhada para o fluxo de reivindicação: as duas portas convergem.
- Morre a "sessão" `{id, nome, cpf}` do `localStorage` (fragilidade 6).

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
- **`reset-codigo-acesso` e o `buildEmailHtml`** somem. O e-mail com a identidade visual da FEVRE (logo, cores) vira um **template do Supabase Auth**, configurado no dashboard — é trabalho novo, e cai junto no passo "auth no dashboard" do bootstrap de produção (ver [`../banco-producao.md`](../banco-producao.md)).

### Etapa 3 — Fechar as portas velhas

- As RPCs (`get_colaborador_full_data`, `update_colaborador_data_full`, `set_colaborador_password`, `get_colaborador_by_id`) param de receber `p_colaborador_id` e passam a resolver o colaborador por **`auth.uid()`**.
- **RLS de verdade em `colaboradores`**, ancorada em `user_id = auth.uid()` para o próprio colaborador, mantendo o acesso de admin/coordenador via `has_role()`.
- **`REVOKE`** dos `GRANT EXECUTE ... TO PUBLIC` (fragilidade 1 — o coração do laudo).
- Aposentar `verify_colaborador_codigo_acesso`, `reset-codigo-acesso`, `check-cpf-colaborador` e `register_colaborador_session`.
- **Tirar o `AND NOT is_colaborador_logged_in(id)`** da policy de UPDATE de `colaboradores` (ver a dívida abaixo). A tabela `colaborador_sessions` e as duas funções **ficam** por ora — mesmo tratamento dado ao `colab_codigo_acesso`: somem do fluxo, o `DROP` é limpeza posterior.
- Corrigir o doc [`../estrutura/auth-e-permissoes.md`](../estrutura/auth-e-permissoes.md), que hoje afirma que o código é comparado contra hash — o banco desmente (é texto puro). O débito estava adiado justamente para ser pago aqui.

## Fora de escopo — dívida assumida conscientemente

**Sequestro de conta por troca de e-mail.** Como o e-mail do cadastro é a prova de identidade, quem pode editar `colab_email` (hoje: 2 admins e 9 coordenadores) pode, na prática, se apossar de um registro *ainda não vinculado*. Decidiu-se **adiar** esse tratamento — auditoria de alterações de e-mail, troca de e-mail passando pelo fluxo do próprio Supabase Auth após o vínculo, e restrição de quem edita o campo ficam para uma refatoração futura.

O que **não** foi adiado, e é o que mantém a dívida contida: com `user_id UNIQUE` e a reivindicação permitida só quando `user_id IS NULL`, o risco fica confinado à janela *antes* do primeiro vínculo. Depois de vinculada, a conta não é reivindicável de novo.

**A trava de edição concorrente.** A policy de UPDATE de `colaboradores` tem `AND NOT is_colaborador_logged_in(id)`, que impede admin/coordenador de editar enquanto o colaborador está "logado". Esse mecanismo se apoia no `register_colaborador_session`, que morre na etapa 3 (qualquer um o dispara com qualquer `id` — fragilidade 8). Decidido em 2026-07-14: **a trava também vira dívida.** Não será refundada agora sobre a sessão real do Auth; a cláusula sai da policy na etapa 3 e a proteção contra edição concorrente **deixa de existir** até uma refatoração futura decidir se ela deve voltar, e sobre que fundamento.

*Por que adiar é seguro:* a trava **se auto-expira**. `is_colaborador_logged_in` não lê um flag persistente — ela pergunta se há linha em `colaborador_sessions` com `last_activity` nos últimos 15 minutos. Sem ninguém escrevendo naquela tabela (o `register_colaborador_session` morre), toda linha envelhece e a função passa a devolver `false` para sempre. Não existe, portanto, o cenário temido de um colaborador ficar "logado" eternamente e travar a edição do coordenador. A cláusula morreria de causas naturais mesmo que ficasse — **tiramos da policy para não deixar no banco um texto que parece proteger e não protege.**

*O que se perde:* dois gestores (ou um gestor e o próprio colaborador) podem salvar o mesmo cadastro ao mesmo tempo, e o último escreve por cima. É um risco de *last-write-wins*, não de segurança — e o mecanismo atual já não protegia de verdade, já que qualquer um disparava o `register_colaborador_session` com qualquer `id` (fragilidade 8).

## Ponto em aberto

**Nenhum.** O desenho está fechado e a implementação pode começar pela etapa 1.
