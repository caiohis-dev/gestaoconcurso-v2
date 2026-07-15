# Roadmap — Edição de `colab_email` como operação sensível à identidade

> **Data:** 2026-07-15. **Natureza:** documento de desenho. Registra as etapas de uma refatoração **ainda não implementada**: reconciliar a edição de `colab_email` com o modelo de identidade do acesso do colaborador. Nasceu de um buraco achado ao montar a bateria de teste da 2B ([`../../docs/teste-frontend-auth-colaborador.md`](../../docs/teste-frontend-auth-colaborador.md)).
>
> **Nada foi escrito em código.** Referências: o fluxo atual em [`concluidos/roadmap-auth-colaborador.md`](./concluidos/roadmap-auth-colaborador.md), o laudo em [`concluidos/fragilidades-auth-colaborador.md`](./concluidos/fragilidades-auth-colaborador.md), e as dívidas em [`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md).

## O problema

Depois da refatoração do acesso (etapas 1–3), `colab_email` acumulou **dois papéis** que antes coincidiam:

1. **Dado de contato** — um atributo da pessoa.
2. **Identidade de acesso** — a prova para reivindicar e, depois de reivindicado, o **login**.

Enquanto ninguém reivindicou, os dois coincidem. Assim que existe conta no Auth, quem manda no login é o **`auth.users.email`**, e `colab_email` vira só registro. **O dialog "Editar colaborador" (rota de gestão) edita `colab_email` como campo comum** — mas numa linha já vinculada isso dessincroniza cadastro e conta. Daí saem **dois sintomas do mesmo defeito**:

- **O caso travado:** e-mail digitado errado no cadastro → o invite cria a conta no e-mail errado e vincula `user_id`; a pessoa nunca recebe, nunca confirma; o coordenador corrige o `colab_email`, mas a conta órfã continua no endereço velho e o registro consta como "já vinculado" — e "esqueci minha senha" também iria ao e-mail errado. A pessoa fica **presa**.
- **A dívida de sequestro** ([`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md) §1): editar `colab_email` é, na prática, re-ancorar a identidade — num registro vinculado e confirmado, é **tomar o login de alguém**.

## Os três estados de uma linha de `colaboradores`

O que uma edição de e-mail significa **depende do estado da linha** em relação à conta do Auth:

| Estado | Situação | O que a edição significa | Comportamento desenhado |
|---|---|---|---|
| **A** | `user_id IS NULL` (nunca reivindicado) | Só muda para onde um futuro invite vai | ✅ **Livre** — é o caminho já desenhado para os 254 sem e-mail e para consertar typo *antes* de reivindicar |
| **B** | Vinculado, conta **não-confirmada** (invite criado, nunca clicado) | Dessincroniza: cadastro com e-mail novo, conta órfã no e-mail velho | ⚠️ **Lógica de reconciliação** — descartar a reivindicação pendente e re-ancorar no e-mail corrigido |
| **C** | Vinculado, conta **confirmada** (login ativo) | Reescreve o login de um usuário — o vetor de sequestro | 🚫 **Bloquear no dialog** — a troca pertence ao próprio dono, via o fluxo nativo do Auth |

## A decisão de fundo

**Editar `colab_email` deixa de ser edição de campo comum: passa a depender do estado (vinculação + confirmação).** Numa linha vinculada, `colab_email` não é dado livre — é a projeção do login, e **só o Auth pode alterá-lo com consistência**. Isso não é só política: um `UPDATE` cru vindo do dialog **não alcança** `auth.users` (exige o admin API / `service_role`), então o caminho normal de edição é *fisicamente incapaz* de manter cadastro e conta em sincronia numa linha vinculada.

## Decisões de desenho

1. **Estado A → livre.** Mantém o caminho desenhado na 2B (coordenador inclui/corrige e-mail antes da reivindicação). A dívida residual de sequestro *nesse* estado (janela do não-vinculado) **segue aceita e contida** por `user_id UNIQUE` + reivindicação só com `user_id IS NULL`.
2. **Estado B → lógica.** Editar o e-mail de uma linha vinculada-mas-pendente **descarta a conta nunca-usada** (`admin.deleteUser`; a FK `colaboradores.user_id` é **`ON DELETE SET NULL`**, então `user_id` volta a NULL sozinho) e **re-ancora** no e-mail novo pelo fluxo de invite existente. É a mecânica que resolve o caso travado — agora no lugar certo (consequência de uma edição deliberada, não gambiarra no reenvio).
3. **Estado C → bloquear.** Trocar o e-mail de um login ativo não é operação de coordenador: pertence ao **próprio dono**, via o fluxo nativo de troca de e-mail do Supabase Auth (dupla confirmação no endereço novo). O coordenador **não** recebe essa alavanca — é o que fecha o sequestro para contas confirmadas. Uma eventual **saída administrativa** (pessoa saiu, caixa morta) **fica como dívida anotada** ([`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md)), **não implementada**.
4. **Onde vive a lógica.** Toda alteração de e-mail em linha vinculada (B) roda por **Edge Function** com `service_role` — o único contexto que mantém `colaboradores` e `auth.users` consistentes.

## Como o dialog sabe o estado

`user_id` (na própria tabela `colaboradores`) já distingue **A** de **{B, C}** — suficiente para a Etapa 1 travar o campo. **Confirmado vs. pendente** (separar B de C) exige um lookup em `auth.users` (`email_confirmed_at` / `last_sign_in_at`), que só a Edge Function faz — é a Etapa 2.

## As etapas (propostas — nenhuma implementada)

- **Etapa 1 — Travar o campo na UI.** `ColaboradorDialog`: `colab_email` editável quando `user_id IS NULL`, **read-only** quando vinculado (com nota de que a troca é pelo próprio colaborador). Autossuficiente e já corta o risco mais grosseiro: coordenador re-ancorando linha vinculada por edição casual.
- **Etapa 2 — Ação deliberada de correção (estado B).** Edge Function "corrigir e-mail de acesso": recebe o colaborador vinculado, checa no Auth se a conta é **pendente**; se for, `deleteUser` + reenvio do invite ao e-mail corrigido; se **confirmada**, recusa (cai no estado C). Ponto de entrada na UI só para linhas vinculadas-pendentes.
- **Etapa 3 — Reflexo nas docs.** Mover a invariante de "vinculado" para "confirmado" na dívida de sequestro; registrar o estado C como dívida (já feito neste ciclo); atualizar [`../estrutura/auth-e-permissoes.md`](../estrutura/auth-e-permissoes.md).

**Ordem/dependência:** a Etapa 1 não depende de nada e já reduz risco; a Etapa 2 depende de detectar confirmado vs. pendente. A 3 acompanha as duas.

## Fatos técnicos que condicionam o desenho

- **`generateLink('invite')` cria a conta no `auth.users` na hora do "Primeiro acesso"** (não ao clicar o link), e o trigger `handle_new_user` vincula `user_id` no nascimento (migration `20260714201650`). **É por isso que o estado B existe.**
- **FK `colaboradores.user_id` é `ON DELETE SET NULL`:** apagar a conta pendente devolve `user_id` a NULL e destrava o fluxo de invite existente sem migration.
- **Postgres não tem RLS a nível de coluna.** Um bloqueio no banco do tipo "`authenticated` não altera `colab_email` de linha vinculada" seria via **trigger**, não policy. A decidir na implementação: se vale esse cinto-e-suspensório, ou se o read-only da UI + a ausência de um caminho de escrita consistente já bastam.

## Ponto em aberto

**Desenho, não plano.** As etapas acima são propostas; nada foi implementado nem agendado. Quando virar plano, o item entra no [`../backlog.md`](../backlog.md) e, ao fechar, este arquivo é arquivado em `concluidos/` (convenção da reorganização de 2026-07-15).
