# Bateria de teste manual — frontend do acesso do colaborador

Roteiro de teste manual da UI cobrindo a refatoração do acesso do colaborador (etapas 1–3, concluídas em 2026-07-15) **e a edição de `colab_email` sensível à identidade (2026-07-16): a trava no bloco `I` e a correção do estado B no bloco `J` — os dois rodados e aprovados em 2026-07-20**. Rode de cima a baixo. Cada bloco indica **o que valida**. O histórico do que mudou está em [`../my_rules/analises/concluidos/roadmap-auth-colaborador.md`](../my_rules/analises/concluidos/roadmap-auth-colaborador.md); as dívidas assumidas em [`../my_rules/analises/dividas-auth-colaborador.md`](../my_rules/analises/dividas-auth-colaborador.md).

## ⚠️ Antes de começar — 3 cuidados críticos

1. **Os e-mails dos 771 colaboradores são de pessoas reais.** **Nunca** dispare o caminho de envio real (reivindicação / cadastro público) contra um e-mail real. Localmente o e-mail do Auth cai no **Mailpit (http://127.0.0.1:54324)**; o `send-email` (SMTP Hostinger) **não** entrega local sem credenciais — prefira testar os fluxos de envio com um **colaborador de teste criado por você** (e-mail tipo `teste+algo@example.com`).
2. **Tokens de invite/recuperação são de uso único** — abrir o link por `curl` para "conferir" o queima, e o navegador depois vê "link inválido". Não é bug.
3. Rode com **Supabase local** (`sg docker -c 'supabase status'`) e o app (`npm run dev`). Tenha à mão uma conta **admin**, uma **coordenador**, uma **gestor+colaborador** (um dos 12) e uma **colaborador puro**.

---

## A. Login e roteamento (porta única — 2A)

- [ ] **A1** — Acessar `/auth`: uma porta só, login e-mail/senha do Supabase Auth.
- [ ] **A2** — Login como **admin** → vai para `/dashboard`.
- [ ] **A3** — Login como **coordenador** → vai para `/`.
- [ ] **A4** — Login como **colaborador puro** → vai para `/perfil-colaborador`.
- [ ] **A5** — Login como **gestor+colaborador** → cai na gestão e enxerga o menu **"Meu Cadastro"**.
- [ ] **A6** — Acessar `/auth-admin` → redireciona para `/auth`.
- [ ] **A7** — Senha errada → barrado, sem vazar se o e-mail existe.

## B. Perfil do colaborador (RPCs novas — 2A)

- [ ] **B1** — Como colaborador, abrir `/perfil-colaborador` → carrega os dados (via `get_meu_colaborador`).
- [ ] **B2** — Editar um campo e **Salvar** → toast de sucesso **e a sessão se mantém** (não desloga — regressão corrigida na 2A).
- [ ] **B3** — Editar **dados bancários** e salvar → persiste (via `update_meus_dados_bancarios`).
- [ ] **B4** — Como gestor+colaborador, ir por "Meu Cadastro" e salvar → salva **sem** te expulsar da sessão de gestão.

## C. Primeiro acesso / reivindicação (2B)

- [ ] **C1** — `/auth` → "Primeiro acesso", CPF de **colaborador não vinculado com e-mail** → mostra e-mail **mascarado** (`j2***@…`), nunca inteiro.
- [ ] **C2** — Concluir → checar **Mailpit** → chega o link de invite; abrir → define senha → loga → `/perfil-colaborador`.
- [ ] **C3** — CPF **já vinculado** → mensagem de "já tem conta" (não reenvia invite).
- [ ] **C4** — CPF **sem e-mail** no cadastro → orienta procurar o coordenador (ramo `needsEmail` morto).
- [ ] **C5** — CPF **inexistente** → resposta genérica, sem revelar nada.
- [ ] **C6** — Repetir a reivindicação **6×** rápido (mesmo IP) → o **6º é cortado** (rate limit 5/15min).

## D. Cadastro público (2C)

> **Este bloco nunca tinha sido rodado, e escondia um fluxo sem final** (achado em 2026-07-16, corrigido). Ao enviar, a tela ficava **intacta e em silêncio** — no sucesso *e* no erro. Eram duas defesas do Radix sobre o aviso, que vive **fora do portal** do `Dialog`: (1) o `DialogContent` é `z-50` num portal anexado ao `body`, **depois** do aviso no DOM, então com `z-index` igual ele pintava por cima; (2) com dialog modal aberto o Radix põe `pointer-events: none` no `<body>` e só a camada dele volta a receber clique — o aviso aparecia e o botão **não respondia**. No `publicMode` o dialog **não se deixa fechar**, então não havia como contornar por fora. Hoje o aviso é `z-[60] pointer-events-auto`. **Ao mexer no `ColaboradorDialog`, os dois valores são load-bearing.**

- [ ] **D1** — `/cadastro-publico` → **não** pede código de 4 dígitos.
- [ ] **D2** — Preencher **Telefone + Email** (ambos `required` nativo) + resto e enviar → aparece o cartão verde **"Cadastro realizado!"** por cima do formulário; a linha nasce com código **NULL**; o trigger vincula a conta.
- [ ] **D3** — Enviar com **CPF já existente** → mostra o `ReivindicarAcessoCard` **inline**, com CPF pré-preenchido.
- [ ] **D4** — Tentar submeter **sem Telefone** → o browser barra (não confie em "passou" sem preencher Telefone).
- [ ] **D5** *(regressão de 2026-07-16)* — No cartão de sucesso, clicar **"Continuar"** → fecha e vai para `/auth`. **O botão precisa responder ao clique** — era exatamente o que o `pointer-events: none` do body matava.
- [ ] **D6** *(regressão de 2026-07-16 — o caminho de erro)* — Cadastrar com um **e-mail já usado** por outro cadastro → aparece o cartão **vermelho** com a mensagem, e "Fechar" funciona. Este era o pior sintoma: sem aviso, a pessoa reenviava para sempre sem saber por quê.

## E. Recuperação de senha (nativo — 2A)

- [ ] **E1** — `/auth` → "Esqueci minha senha" → fluxo nativo do Supabase Auth.
- [ ] **E2** — Concluir → Mailpit → abrir link → cai em `/redefinir-senha`, troca a senha, novo login funciona.

## F. Gestão de colaboradores (RLS + trava removida — 2D)

- [ ] **F1** — Admin/coordenador na lista de colaboradores → vê **as 771**.
- [ ] **F2** — Colaborador puro (via app/RLS) → vê **só a própria linha**.
- [ ] **F3** — Admin/coord **editar** um colaborador que "está logado" → edita normalmente (**trava de sessão removida** — sem bloqueio "colaborador online").
- [ ] **F4** — Abrir o `ColaboradorDialog` (criar e editar) → **sem** campos de código de acesso; sem exibição de código.
- [ ] **F5** — Conferir a `ColaboradoresList` → **sem** badge/indicador de "colaborador online".
- [ ] **F6** *(regressão de 2026-07-16)* — **Cadastrar** um colaborador novo com um **e-mail que já é de outro** → mensagem clara ("Este e-mail já está cadastrado para outro colaborador…"), **não** o `duplicate key value violates unique constraint` cru. O campo aceita a digitação de propósito (igual a CPF/matrícula/PIS): a unicidade é checada no **salvar**, pelo banco.
- [ ] **F7** *(regressão de 2026-07-16)* — Mesma coisa na **edição** de um colaborador, e também com **chave PIX** duplicada → mensagem amigável nos dois caminhos (criar e editar traduzem os 5 campos únicos: CPF, matrícula, PIS, e-mail, PIX).

## G. Painel de dados + exports (e-mail em massa aposentado — 2D)

- [ ] **G1** — `PainelDadosColaboradores` → **read-only** (nome/e-mail/unidade/último acesso + busca/ordenação); **sem** botão "Solicitar Atualização de Dados".
- [ ] **G2** — Exportar em `GerenciarProva` e `GerenciarColaboradoresProva` → **sem** coluna "Código de acesso".

## H. Segurança / negativos

- [ ] **H1** — Anônimo tenta abrir `/perfil-colaborador` → redireciona para `/auth`, zero dados.
- [ ] **H2** — Colaborador puro tenta rota de gestão → bloqueado (papel `colaborador` fora da hierarquia).
- [ ] **H3** *(opcional, via terminal — não UI)* — chamar uma RPC antiga (`get_colaborador_full_data`) com a anon key → `permission denied` / função não existe (REVOKE + DROP da 2D).

## I. `colab_email` travado em linha vinculada (Etapa 1 — 2026-07-16)

> **Rodado inteiro e aprovado em 2026-07-20** (o `I7` já tinha rodado em 2026-07-16). Até então a Etapa 1 estava verificada só por `tsc`/`build`. Contexto em [`../my_rules/analises/roadmap-edicao-email-colaborador.md`](../my_rules/analises/roadmap-edicao-email-colaborador.md).
>
> Para escolher as linhas de cada estado (A / B / C), rode:
> ```sql
> SELECT c.colab_nome_completo, c.colab_email, u.email AS auth_email,
>        CASE WHEN c.user_id IS NULL THEN 'A'
>             WHEN u.email_confirmed_at IS NULL THEN 'B' ELSE 'C' END AS estado
> FROM colaboradores c LEFT JOIN auth.users u ON u.id = c.user_id
> WHERE c.user_id IS NOT NULL;
> ```
> No banco local de hoje: **759 em A**, **1 em B** (`CAIO TESTE`), **12 em C**.

- [x] **I1** *(estado A)* — Admin/coord edita um colaborador **não vinculado** → `colab_email` **editável**; trocar e salvar → persiste. É o caminho dos 254 sem e-mail: **não pode ter regredido**.
- [x] **I2** *(estado C)* — Editar um colaborador **vinculado e confirmado** → `colab_email` **read-only** (fundo acinzentado) + nota de que virou o login. **Continua legível e copiável** (é `readOnly`, não `disabled`).
- [x] **I3** *(estado B)* — Editar `CAIO TESTE` (vinculado pendente) → **também read-only**. A Etapa 1 trava por `user_id`, sem distinguir pendente de confirmada.
- [x] **I4** — Numa linha vinculada, **alterar outro campo** (ex.: telefone) e salvar → salva normalmente, **e o `colab_email` não muda no banco**. Confirmar no SQL acima. *(Valida que o campo sai do payload sem levar o resto junto.)*
- [x] **I5** — Novo cadastro (`/cadastro`) e cadastro público (`/cadastro-publico`) → `colab_email` **editável e obrigatório**. Linha nova não tem `user_id`: a trava **não pode** vazar para a criação.
- [x] **I6** *(perfil do próprio colaborador)* — Logar como colaborador → `/perfil-colaborador` → `colab_email` **read-only sempre**, com a nota. Editar outro campo e salvar → salva, e o e-mail **permanece** no banco.
- [x] **I7** *(resíduo conhecido — deve FALHAR a trava)* — Via terminal, `PATCH` direto no PostgREST em `colaboradores` com JWT de coordenador, mudando `colab_email` de linha vinculada → **passa**. Não é bug: a trava é de UI, sem trigger (decisão de 2026-07-16). Registrado em [`../my_rules/analises/dividas-auth-colaborador.md`](../my_rules/analises/dividas-auth-colaborador.md) §1.

## J. Corrigir e-mail de acesso — a UI da Etapa 2 (2026-07-16)

> **A Edge Function foi verificada** ponta a ponta por HTTP em 2026-07-16 (12 casos: os 3 estados, as recusas, a correção real, a idempotência) — ver o roadmap. **A UI foi rodada e aprovada em 2026-07-20.** Para repetir, precisa de `npm run dev` **e** `npm run supabase:functions:serve`.
>
> O `CAIO TESTE` é o espécime de estado B: `colab_email` `contato@caioteixeira.net.br` contra login `exemplo2@exemplo3.com`. **Hoje ele está no estado pós-J3** (a corrida de 2026-07-20 sincronizou a conta e não foi restaurada) — para repetir o bloco, restaure antes com:
> ```sql
> UPDATE auth.users SET email='exemplo2@exemplo3.com', recovery_token='', recovery_sent_at=NULL
>  WHERE id='bee702b6-55c5-49a4-8986-4c929b593c0e';
> UPDATE profiles SET email='exemplo2@exemplo3.com' WHERE id='bee702b6-55c5-49a4-8986-4c929b593c0e';
> ```

- [x] **J1** *(estado C)* — Editar um colaborador vinculado-confirmado → clicar "O e-mail está errado e ele nunca conseguiu entrar?" → o dialog explica que a conta **já foi confirmada** e **não oferece formulário**, só "Fechar".
- [x] **J2** *(estado B)* — Editar `CAIO TESTE` → mesmo link → o dialog mostra o aviso âmbar com **os dois endereços** (conta `exemplo2@exemplo3.com`, cadastro `contato@…`) e **pré-preenche** o campo com o do cadastro.
- [x] **J3** *(a correção)* — Confirmar em J2 → toast de sucesso. Localmente o **e-mail não sai** (SMTP), então o esperado é o toast de **aviso** ("o link não saiu"), **não** o de sucesso — e isso está certo. Conferir no banco: `auth.users.email` mudou, **`user_id` NÃO mudou**, `profiles.email` acompanhou, `user_roles` intactos.
- [x] **J4** — Reabrir o dialog depois de J3 → o aviso de divergência **some** (`divergentes: false`); tentar corrigir para o mesmo e-mail → recusa "Este já é o e-mail da conta de acesso."
- [x] **J5** *(negativo)* — Em J2, informar um e-mail que **já é de outro colaborador** → recusa clara, e **nada** é escrito.
- [x] **J6** *(estado A)* — Numa linha não-vinculada o link **nem aparece** (o campo é editável e não há o que corrigir).
- [x] **J7** *(permissão)* — Logado como **colaborador puro**, chamar a EF direto → **403** ("Só a coordenação pode corrigir o e-mail de acesso").

---

**Notas:** os itens **C2 / D2 / E2 dependem do Mailpit** (envio local); para evitar qualquer envio, teste só até a tela de "confira o e-mail" e valide o vínculo direto no banco. **H3**, **I7** e **J7** são os que precisam de terminal (curl/psql), não de UI. O bloco **J** exige `npm run supabase:functions:serve` além do `npm run dev`.
