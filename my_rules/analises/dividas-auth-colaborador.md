# Dívidas assumidas — acesso do colaborador (pós-refatoração)

> **Natureza:** dívidas de desenho **aceitas conscientemente** na refatoração do acesso do colaborador (etapas 1–3, concluídas em 2026-07-15). Nenhuma bloqueia o deploy da v2. Este arquivo é a casa canônica dessas dívidas — o histórico da refatoração que as gerou está arquivado em [`concluidos/roadmap-auth-colaborador.md`](./concluidos/roadmap-auth-colaborador.md) e [`concluidos/fragilidades-auth-colaborador.md`](./concluidos/fragilidades-auth-colaborador.md).
>
> Estas são dívidas **de desenho, não itens acionáveis do backlog**: foram deixadas de fora de propósito, com risco contido, à espera de uma refatoração futura que decida *se* e *sobre que fundamento* voltar a tratá-las. As dívidas **acionáveis** que a refatoração abriu vivem no [`../backlog.md`](../backlog.md) (ver o fim deste arquivo).

## 1. Sequestro de conta por troca de e-mail

Como o **e-mail do cadastro é a prova de identidade** da reivindicação, quem pode editar `colab_email` (hoje: 2 admins e 9 coordenadores) pode, na prática, se apossar de um registro **ainda não vinculado**: troca o e-mail para um seu, reivindica, define a senha.

**O que contém a dívida** (e por que adiar é seguro): com `colaboradores.user_id` **`UNIQUE`** e a reivindicação permitida **só quando `user_id IS NULL`**, o risco fica confinado à janela *antes* do primeiro vínculo. Depois de vinculada, a conta **não é reivindicável de novo**.

**O que ficou adiado:** auditoria de alterações de `colab_email`; troca de e-mail passando pelo fluxo do próprio Supabase Auth *após* o vínculo; e restrição de quem pode editar o campo.

> **Parcialmente fechada em 2026-07-16 (Etapa 1 do [`roadmap-edicao-email-colaborador.md`](./roadmap-edicao-email-colaborador.md)).** `colab_email` virou **read-only em linha vinculada** (`user_id IS NOT NULL`), no `ColaboradorDialog` e no `PerfilColaborador`. **A invariante desta dívida mudou:** o vetor de sequestro deixou de valer para *qualquer* linha vinculada — e não só para as confirmadas, como o desenho previa —, porque a Etapa 1 trava por `user_id`, sem distinguir pendente de confirmada (essa distinção exige o Auth, e é a Etapa 2). A **janela do não-vinculado** (estado A) **permanece** dívida aceita: é o caminho legítimo de inclusão/correção de e-mail antes da reivindicação, contido por `user_id UNIQUE` + reivindicação só com `user_id IS NULL`.
>
> **O que a Etapa 1 NÃO fecha:** a trava é **de UI, não de banco** — decidiu-se em 2026-07-16 não pôr trigger, porque ele fecharia junto o caminho da Etapa 2 (ver o roadmap). Então a RPC `update_meu_colaborador` **ainda aceita `p_email`** e a policy de UPDATE de admin/coordenador **ainda alcança a coluna**: quem chamar o PostgREST direto, com a anon key e um JWT de coordenador, contorna a trava e re-ancora a linha. O sequestro está **fora do alcance da UI, não impossível**. Fechá-lo de verdade pede o trigger (ou tirar `colab_email` do alcance da policy) — trabalho da Etapa 2. Seguem adiados: **auditoria** de alterações de `colab_email` e **restrição de quem** pode editar o campo.
>
> **Demonstrado, não só teorizado (2026-07-16, teste I7 da bateria).** O contorno foi executado no banco local: um JWT de **coordenadora pura** (sem papel `admin`) fez `PATCH /rest/v1/colaboradores?id=eq.<uuid>` com corpo `{"colab_email": "atacante@…"}` numa linha **vinculada** — resposta **HTTP 200**, `colab_email` reescrito, `user_id` intacto. Só a anon key (pública, vai no bundle do front) e o próprio login bastaram. A receita para reproduzir está no [[project-gestaoconcurso-edicao-email-colaborador]] (cunhar o JWT HS256 com o segredo local, **sem `session_id`**).
>
> **E o alcance é maior do que "a coluna":** a policy de UPDATE é `has_role(admin) OR has_role(coordenador)` e **não verifica se aquele colaborador está sob a prova de quem edita** — a coordenadora do teste reescreveu o `CAIO TESTE` sem nenhum vínculo entre os dois. Ou seja, **um coordenador comum alcança a identidade de acesso de qualquer um dos 771 colaboradores**, não só dos seus. Isso vale para `colab_email` e, pela mesma policy, para todo o resto da linha (dados bancários, PIX, PIS). A leitura já foi escopada por prova na RLS de SELECT (2D), mas a **escrita não** — é dívida à parte da trava de e-mail, e provavelmente maior.

## 1-bis. Troca legítima de e-mail de uma conta já confirmada (saída administrativa)

Recorte do [`roadmap-edicao-email-colaborador.md`](./roadmap-edicao-email-colaborador.md) deixado de fora **de propósito**. No desenho, trocar o e-mail de uma conta **confirmada** (login ativo) pertence ao **próprio dono**, via o fluxo nativo de troca de e-mail do Supabase Auth (dupla confirmação no endereço novo) — o coordenador **não** recebe essa alavanca, porque qualquer porta administrativa para reescrever o e-mail de conta confirmada **reabre o sequestro**.

Fica em aberto o caso legítimo em que o dono **não consegue** fazer o autosserviço: mudou de e-mail e perdeu a caixa antiga, ou saiu e o endereço morreu. Hoje **não há saída administrativa** para isso — de propósito. Se um dia precisar existir, teria que ser uma ação **separada, restrita a `admin`** (não coordenador), **auditada**, e passando pelo admin API do Auth — decisão de **política**, não só de código.

**Atualização (2026-07-16, Etapa 2):** a Etapa 2 (`corrigir-email-acesso`) **não mexe nesta dívida** — ela dá saída ao **estado B** e **recusa explicitamente o C** (409, "a mudança pertence ao próprio colaborador"), que é o desenho. O que segue faltando é só o estado C: o dono de um login **confirmado** não tem como trocar o próprio e-mail pelo app, e a coordenação também não. Continua sendo o dashboard do Auth, na mão.

**Atualização (2026-07-16, Etapa 1):** a contenção descrita aqui — "o dono ainda tem o autosserviço enquanto tiver a caixa antiga" — **não existe**, e ao que parece nunca existiu. O desenho supunha que o dono trocaria o e-mail pelo fluxo nativo do Auth, mas **esse fluxo nunca foi construído na UI**: o que o `PerfilColaborador` oferecia era edição de `colab_email` como campo comum, que não tocava `auth.users` e só dessincronizava (login e recuperação de senha ficavam no endereço velho). A Etapa 1 travou esse campo, então hoje **o dono não tem autosserviço nenhum** — a troca de e-mail de conta confirmada não tem caminho no app, nem pelo dono, nem pela coordenação; a saída é manual, pelo dashboard do Auth. Isso **aumenta** o peso desta dívida: ela deixou de ser "falta a exceção administrativa" e passou a ser "falta o caminho principal *e* a exceção". O `supabase.auth.updateUser({ email })` com dupla confirmação (mais o sync de volta para `colab_email` na confirmação) é o candidato óbvio, e foi **deliberadamente deixado fora** da Etapa 1 por ser escopo novo, não desenhado.

## 2. Edição concorrente sem trava (last-write-wins)

Concretizada na 2D (migration `20260715130603_*`): a cláusula `AND NOT is_colaborador_logged_in(id)` saiu da policy de UPDATE de `colaboradores`, e `is_colaborador_logged_in` + a tabela `colaborador_sessions` foram dropadas. **A proteção contra edição concorrente não existe mais** — dois gestores (ou um gestor e o próprio colaborador) podem salvar o mesmo cadastro ao mesmo tempo, e o último escreve por cima.

**Por que não é perda real:** o mecanismo **já não protegia nada** desde a 2A — ninguém mais escrevia em `colaborador_sessions`, então `is_colaborador_logged_in` devolvia sempre `false`; e qualquer um disparava `register_colaborador_session` com qualquer `id` (era a fragilidade 8, fechada pelo mesmo DROP). A cláusula **se auto-expirava** (janela de 15 min de `last_activity`): tirá-la foi remover do banco um texto que *parecia* proteger e não protegia. O que sobra é risco de *last-write-wins*, não de segurança.

## 3. Reivindicação de CPF alheio

Um pedido de reivindicação para um CPF que não é seu dispara um invite ao e-mail **da vítima** e marca o registro como vinculado — mas **à conta do próprio dono do e-mail** (recuperável por "esqueci senha", já que o link foi para a caixa dele). **Contida pelo rate limit** (5/15min por IP, tabela `reivindicacao_rate_limit`). Não foi tratada além disso.

## Fragilidade 7 (normalização de CPF) — resolvida, não é dívida

A `check-cpf-colaborador` (única sobrevivente do modelo antigo) **normaliza o CPF** (`replace(/\D/g,'').padStart(11,'0')`) antes de comparar; a RPC velha que comparava o CPF cru foi dropada na 2D. A divergência de normalização entre camadas deixou de existir.

## Dívidas acionáveis (rastreadas no backlog, não aqui)

Estas a refatoração também abriu, mas são **trabalho pendente acionável** e vivem no [`../backlog.md`](../backlog.md) — referenciadas aqui só para o quadro ficar completo, **sem duplicar conteúdo**:

- **Sanear as 3 contas do Auth** — login `ab@ab.com` de um coordenador, a conta duplicada do Caio, e as contas do Auth sem colaborador. Detalhe de quem são em [`concluidos/backfill-colaboradores-usuarios.md`](./concluidos/backfill-colaboradores-usuarios.md).
- **Enxugar os grants de `anon`/`authenticated`** (`TRUNCATE` etc., drift do dashboard Lovable) — aberto ao endurecer a RLS de `colaboradores` na 2D; é sistêmico.
