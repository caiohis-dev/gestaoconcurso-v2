# Backfill — colaboradores que já eram usuários do Auth

Registro dos **12** vínculos criados em 2026-07-14 pelo `supabase/seed.pos.sql` (commit `d332115`), na etapa 1 da refatoração do acesso do colaborador ([`roadmap-auth-colaborador.md`](./roadmap-auth-colaborador.md)).

Cada linha preencheu `colaboradores.user_id` e recebeu o papel `colaborador` em `user_roles`. Os papéis de gestão que a pessoa já tinha foram **mantidos** — `user_roles` é multi-papel.

⚠️ **Este arquivo é versionado e contém nome + e-mail de pessoas reais.** É o único do repo nessas condições; o `seed.pos.sql` foi escrito justamente para não precisar disso (ele casa por regra, não por lista).

## Os 12

| # | Colaborador | Conta no Auth | Papéis (após o backfill) | Casou por | Nota |
|---|---|---|---|---|---|
| 1 | CAIO PINHEIRO TEIXEIRA | `caiohis@gmail.com` | admin + superadmin + **colaborador** | e-mail | ⚠️ tem uma **segunda conta** admin+superadmin (`caio.teixeira@smevr.com.br`), não vinculada — ver dívidas |
| 2 | CASSIA ANDREA DA SILVA O. COUTINHO | `cassiaoliveira40@gmail.com` | admin + user + **colaborador** | e-mail | — |
| 3 | JOAO PAULO MARQUES PINHEIRO DA SILVA | `ab@ab.com` | coordenador + user + **colaborador** | **nome** | ⚠️ único casado por nome. A conta usa e-mail de teste; o cadastro tem `joao.041491@smevr.com.br` — ver dívidas |
| 4 | BRUNO ALVES DE ANDRADE | `j2_bruno@hotmail.com` | coordenador + user + **colaborador** | e-mail | — |
| 5 | GRAZYELLE GERALYNE DOS SANTOS OLIVEIRA | `grazyelleoliveira@id.uff.br` | coordenador + user + **colaborador** | e-mail | — |
| 6 | GUSTAVO DE PAIVA SILVA | `gustavopaiva_@hotmail.com` | coordenador + user + **colaborador** | e-mail | — |
| 7 | LUDMILA DE OLIVEIRA SOARES F. DA ROCHA | `ludmila.041505@smevr.com.br` | coordenador + user + **colaborador** | e-mail | — |
| 8 | MARIA CRISTINA DA SILVA | `marcrisecrt@gmail.com` | coordenador + user + **colaborador** | e-mail | — |
| 9 | PATRICIA AZEVEDO QUINANE SILVA | `patricia.040517@smevr.com.br` | coordenador + user + **colaborador** | e-mail | — |
| 10 | RAFAEL DE ASSIS RODRIGUES | `djrafagospel@hotmail.com` | coordenador + user + **colaborador** | e-mail | — |
| 11 | RENATA ROQUE BRAGA DE FREITAS | `renatarbfreitas@yahoo.com.br` | coordenador + user + **colaborador** | e-mail | — |
| 12 | RODRIGO AMARAL ALVES | `rodrigoamaralalves@hotmail.com` | coordenador + user + **colaborador** | e-mail | — |

**2 admins + 10 coordenadores.** O `#3` é a razão de o backfill não casar só por e-mail: ele é coordenador, é colaborador, e o e-mail da conta é diferente do e-mail do cadastro — o casamento por e-mail o perdia em silêncio.

## As 3 contas do Auth que ficaram de fora

Das 15 contas, 3 **não** foram vinculadas — corretamente. O backfill se recusa a adivinhar: casamento ambíguo não vincula nada.

| Conta | Papéis | Por que ficou de fora |
|---|---|---|
| `caio.teixeira@smevr.com.br` | admin + superadmin + user | Segunda conta do `#1`. É a **operacional de verdade** (assinou 406 linhas: log de e-mails, metas, salas, alocações). A linha de colaborador só pode apontar para uma conta, e apontou para a do cadastro. |
| `cassiaoliveira40@yahoo.com` (ANEZIA MARIA DA SILVA OLIVEIRA) | user | Não existe na tabela `colaboradores`. |
| `nathalia.040827@smevr.com.br` (Nathalia) | user | `full_name` tem só o primeiro nome, e há **duas** colaboradoras homônimas (NATHALIA FERREIRA, NATHALIA GONÇALVES ALBERTO SANTIAGO). Ambígua — precisa de confirmação humana. |

Nenhuma das três é bloqueio: elas podem se cadastrar pelo fluxo normal de reivindicação (etapa 2).

## Dívidas abertas por este backfill

Detalhadas em [`../../backlog.md`](../../backlog.md):

1. **`ab@ab.com` como login de coordenador** (`#3`) — ele não consegue recuperar a própria senha, e o domínio pode ser adquirido por terceiros: é um vetor de tomada de conta. Consertar = trocar o e-mail da conta no Auth para o do cadastro (muda o login dele; precisa ser avisado).
2. **Conta duplicada do Caio** — excluir uma das duas **não é trivial**: 8 FKs `created_by` são `NO ACTION`, então o `DELETE` falha enquanto houver linhas; seria preciso reapontar a autoria antes, reescrevendo o histórico. Tentado e abandonado em 2026-07-14.
3. **Nathalia** — desambiguar com um humano.

## Verificação (após `db reset` completo, 2026-07-14)

- 12 vinculados, 12 com o papel `colaborador`, 759 linhas com `user_id` NULL.
- Nenhum usuário vinculado a mais de um colaborador.
- Nome do cadastro bate com o nome da conta nas **12** linhas.
- Idempotente: segunda execução → `UPDATE 0`, `INSERT 0`.
