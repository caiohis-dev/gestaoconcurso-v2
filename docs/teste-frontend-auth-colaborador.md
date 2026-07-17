# Bateria de teste manual — frontend do acesso do colaborador

Roteiro de teste manual da UI cobrindo a refatoração do acesso do colaborador (etapas 1–3, concluídas em 2026-07-15). Rode de cima a baixo. Cada bloco indica **o que valida**. O histórico do que mudou está em [`../my_rules/analises/concluidos/roadmap-auth-colaborador.md`](../my_rules/analises/concluidos/roadmap-auth-colaborador.md); as dívidas assumidas em [`../my_rules/analises/dividas-auth-colaborador.md`](../my_rules/analises/dividas-auth-colaborador.md).

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

---

**Notas:** os itens **C2 / D2 / E2 dependem do Mailpit** (envio local); para evitar qualquer envio, teste só até a tela de "confira o e-mail" e valide o vínculo direto no banco. O **H3** é o único que precisa de terminal (curl/psql), não de UI.
