# Análise — Fragilidades do fluxo de acesso do colaborador (`/auth`)

> **Data:** 2026-07-13. **Natureza:** laudo de segurança, feito por leitura de código e banco (nada foi alterado). É um retrato do estado **antes** da refatoração — não são vulnerabilidades abertas hoje.
>
> **Status (2026-07-15):** o login por CPF+código morreu (2A/2B/2C) e as fragilidades 2, 3, 4, 5 e 6 caíram por remoção. **A fragilidade 1 (o nó central) está fechada** desde 2026-07-15: a subetapa 2D item 1 revogou o `EXECUTE` de `PUBLIC` nas RPCs mortas do portal velho (migration `20260715072758_*`) — `anon`/`authenticated` já recebem `permission denied`. A **RLS de verdade** em `colaboradores` também já entrou (2026-07-15, migration `20260715073500_*`): o SELECT `USING (true)` — que deixava todo `authenticated` ler as 771 linhas — virou `has_role(admin) OR has_role(coordenador) OR user_id = auth.uid()`. E as **RPCs mortas foram dropadas** (item 3, migration `20260715125720_*`, + remoção da Edge Function `reset-codigo-acesso`) — com isso a **fragilidade 8 (`register_colaborador_session`) some de vez**. **Falta na 2D:** só o `DROP` das últimas sobras (`colab_codigo_acesso`, tabela `colaborador_sessions`, função `is_colaborador_logged_in`) e a retirada da trava `is_colaborador_logged_in` da policy de UPDATE. Estado por subetapa em [`roadmap-auth-colaborador.md`](./roadmap-auth-colaborador.md).

## Escopo lido

- `src/pages/Auth.tsx` (a rota `/auth`), `src/hooks/useColaboradorAuth.tsx`, `src/components/ForgotCodeCard.tsx`.
- Edge functions `check-cpf-colaborador` e `reset-codigo-acesso`.
- RPCs (definição vigente extraída do banco local): `verify_colaborador_codigo_acesso`, `update_colaborador_data_full`, `set_colaborador_password`, `register_colaborador_session`, `get_colaborador_by_id`.
- Grants (`information_schema.routine_privileges`) e tipos das colunas `colab_codigo_acesso` / `colab_senha`.

**Não lido a fundo** (verificar antes de fechar o desenho da correção): interior de `get_colaborador_full_data` e `set_colaborador_password`, `src/pages/PerfilColaborador.tsx` por inteiro, e as edge functions `send-email` e `public-create-colaborador`.

## O modelo de ameaça deste fluxo

O portal do colaborador **não usa Supabase Auth**: não há JWT, não há `auth.uid()`. A "sessão" é um objeto `{id, nome, cpf}` no `localStorage`, e toda a proteção de dados depende de RPCs `SECURITY DEFINER`.

O ponto crítico é que **essas RPCs recebem o `p_colaborador_id` do cliente e confiam nele**. Não existe segredo ligando a chamada ao colaborador — o `id` é só um UUID que o front manda. Isso desloca todo o peso da segurança para "o atacante não sabe o UUID e não consegue chamar a RPC" — e nenhuma das duas coisas se sustenta.

---

## Fragilidades graves

### 1. Qualquer um edita/lê os dados de qualquer colaborador sabendo só o UUID

> **✅ Fechada em 2026-07-15** (subetapa 2D, item 1). O `EXECUTE` foi revogado de `PUBLIC` nessas RPCs (migration `20260715072758_*`); a anon key não as alcança mais. O `DROP` delas ainda vem (item 3), mas a porta já está trancada.

As RPCs `update_colaborador_data_full`, `get_colaborador_full_data` e `set_colaborador_password` têm `GRANT EXECUTE` para `PUBLIC` e **não checam nada** — nenhuma senha, nenhum código, nenhuma sessão. Executam direto o `UPDATE ... WHERE id = p_colaborador_id`. Como a `anon key` é pública (está no bundle do front), qualquer pessoa com a URL do Supabase pode:

- chamar `get_colaborador_full_data(<uuid>)` e ler CPF, PIS, chave PIX, endereço;
- chamar `set_colaborador_password(<uuid>, 'nova')` e sequestrar a conta.

O "login" é decorativo: **não é pré-requisito** para chamar as funções que ele deveria proteger. **Este é o problema central** — os demais são agravantes de uma porta já aberta.

### 2. O código de acesso é armazenado e comparado em texto puro

O doc de arquitetura diz "compara contra hash", mas o banco desmente: `verify_colaborador_codigo_acesso` faz `colab_codigo_acesso = p_codigo` (igualdade direta), a coluna é `character` comum, e `reset-codigo-acesso` grava `colab_codigo_acesso: codigo` sem hash. Um vazamento do dump expõe as credenciais de acesso de todos em claro.

(A *senha* — `colab_senha` — essa sim é bcrypt via `set_colaborador_password`. São duas credenciais diferentes e só uma está protegida.)

### 3. Código de 4 dígitos, sem rate limit, sem lockout

São 10.000 combinações. `verify_colaborador_codigo_acesso` pode ser chamada diretamente com a anon key, em loop, sem custo nem bloqueio. Mesmo isolado do item 1, um espaço de 4 dígitos brute-forçável em segundos não é barreira.

### 4. `reset-codigo-acesso` devolve o novo código na resposta HTTP

A edge function gera o código, grava no banco e **retorna `{email, nome, codigo}` para o cliente**, que então dispara o `send-email` separado. Qualquer um que chame `reset-codigo-acesso` com um CPF recebe de volta um código de acesso válido para aquela conta — sem nunca ver o e-mail. É um bypass de "esqueci meu código" que entrega a credencial ao chamador. A separação em duas chamadas (gerar / enviar) é o que expõe isso; o envio deveria acontecer dentro da própria função, sem o código transitar de volta pelo cliente.

### 5. `reset-codigo-acesso` grava e-mail arbitrário num CPF sem verificação

Se o colaborador não tem e-mail cadastrado, a função aceita o e-mail passado no corpo, faz `UPDATE colab_email` naquele CPF e manda o código pra lá. Um atacante que saiba um CPF sem e-mail pode injetar o próprio e-mail e receber o código — tomada de conta by design. E `check-cpf-colaborador` confirma de graça se um CPF existe e revela o e-mail cadastrado (oracle de enumeração de CPF + vazamento de e-mail).

---

## Fragilidades médias

### 6. A sessão no `localStorage` é forjável e nunca é validada

É só `{id, nome, cpf}` em texto: dá pra colar qualquer `id` e o app trata como logado. Redundante perto do item 1, já que nem sessão é necessária pra chamar as RPCs.

### 7. `padStart(11,'0')` no CPF diverge entre camadas

O front e as edge functions normalizam o CPF com `padStart(11)`; a RPC `verify_colaborador_codigo_acesso` compara o CPF **como veio**, sem normalizar. Se algum CPF foi gravado sem o zero à esquerda ou com máscara, login e reset podem discordar sobre qual linha é "a mesma pessoa". Mais bug de consistência que segurança, mas mora no caminho de autenticação.

### 8. `register_colaborador_session` é acionável por qualquer `id`

> **✅ Fechada em 2026-07-15** (subetapa 2D, item 3). A função foi **dropada** (migration `20260715125720_*`), junto com `unregister/update_colaborador_session_activity`. Sobra só a tabela `colaborador_sessions` (órfã) e a trava `is_colaborador_logged_in` na policy de UPDATE, que saem no fim da 2D.

É chamada com o `id` do `localStorage` na montagem, sem validar que a sessão é legítima — então o rastro de "está logado" (que bloqueia edição do admin, ver [`estrutura/colaboradores.md`](../estrutura/colaboradores.md)) pode ser disparado para qualquer `id`.

---

## A questão de desenho que abre o debate

O nó de tudo é o item 1: **não há prova de identidade ligada às chamadas de dados.** Enquanto o `colaborador_id` for um parâmetro que o cliente escolhe e a RPC obedece, os demais problemas são agravantes.

A decisão de fundo, que condiciona todo o resto da correção:

- **(A)** migrar o portal do colaborador para **Supabase Auth de verdade** — aí `auth.uid()` volta a ancorar RLS e as RPCs; ou
- **(B)** manter o modelo sem-JWT e introduzir um **token de sessão assinado** que as RPCs passem a exigir e validar.

Decidido esse ponto, aí sim faz sentido tratar hash do código, rate limit, e o fluxo de reset.
