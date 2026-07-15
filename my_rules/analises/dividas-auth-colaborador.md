# Dívidas assumidas — acesso do colaborador (pós-refatoração)

> **Natureza:** dívidas de desenho **aceitas conscientemente** na refatoração do acesso do colaborador (etapas 1–3, concluídas em 2026-07-15). Nenhuma bloqueia o deploy da v2. Este arquivo é a casa canônica dessas dívidas — o histórico da refatoração que as gerou está arquivado em [`concluidos/roadmap-auth-colaborador.md`](./concluidos/roadmap-auth-colaborador.md) e [`concluidos/fragilidades-auth-colaborador.md`](./concluidos/fragilidades-auth-colaborador.md).
>
> Estas são dívidas **de desenho, não itens acionáveis do backlog**: foram deixadas de fora de propósito, com risco contido, à espera de uma refatoração futura que decida *se* e *sobre que fundamento* voltar a tratá-las. As dívidas **acionáveis** que a refatoração abriu vivem no [`../backlog.md`](../backlog.md) (ver o fim deste arquivo).

## 1. Sequestro de conta por troca de e-mail

Como o **e-mail do cadastro é a prova de identidade** da reivindicação, quem pode editar `colab_email` (hoje: 2 admins e 9 coordenadores) pode, na prática, se apossar de um registro **ainda não vinculado**: troca o e-mail para um seu, reivindica, define a senha.

**O que contém a dívida** (e por que adiar é seguro): com `colaboradores.user_id` **`UNIQUE`** e a reivindicação permitida **só quando `user_id IS NULL`**, o risco fica confinado à janela *antes* do primeiro vínculo. Depois de vinculada, a conta **não é reivindicável de novo**.

**O que ficou adiado:** auditoria de alterações de `colab_email`; troca de e-mail passando pelo fluxo do próprio Supabase Auth *após* o vínculo; e restrição de quem pode editar o campo.

> **Desenho em curso (2026-07-15):** há agora um roadmap para tratar a raiz disto — [`roadmap-edicao-email-colaborador.md`](./roadmap-edicao-email-colaborador.md). Ele **fecha o sequestro para contas confirmadas** (bloqueia a edição de `colab_email` em linha vinculada-e-confirmada) e conserta o caso travado (linha vinculada-mas-pendente). A **janela do não-vinculado** (estado A) descrita acima **permanece** como dívida aceita — é o caminho legítimo de inclusão/correção de e-mail antes da reivindicação. Ainda não implementado.

## 1-bis. Troca legítima de e-mail de uma conta já confirmada (saída administrativa)

Recorte do [`roadmap-edicao-email-colaborador.md`](./roadmap-edicao-email-colaborador.md) deixado de fora **de propósito**. No desenho, trocar o e-mail de uma conta **confirmada** (login ativo) pertence ao **próprio dono**, via o fluxo nativo de troca de e-mail do Supabase Auth (dupla confirmação no endereço novo) — o coordenador **não** recebe essa alavanca, porque qualquer porta administrativa para reescrever o e-mail de conta confirmada **reabre o sequestro**.

Fica em aberto o caso legítimo em que o dono **não consegue** fazer o autosserviço: mudou de e-mail e perdeu a caixa antiga, ou saiu e o endereço morreu. Hoje **não há saída administrativa** para isso — de propósito. Se um dia precisar existir, teria que ser uma ação **separada, restrita a `admin`** (não coordenador), **auditada**, e passando pelo admin API do Auth — decisão de **política**, não só de código. Contenção atual: o universo afetado é pequeno (a cúpula + quem já reivindicou), e o dono ainda tem o autosserviço enquanto tiver a caixa antiga.

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
