# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. Itens concluídos devem ser removidos daqui (o histórico do que foi feito vive na documentação em [`estrutura/`](./estrutura/), não neste arquivo).

---

## Centralizar os guards de página num `RequireModulo`

**Status:** pendente — aberto em 2026-07-24, como saldo da D5 do tema "tela de entrada por módulos"
**Área:** Auth e Permissões (ver [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md)) / Arquitetura (ver [`estrutura/arquitetura-geral.md`](./estrutura/arquitetura-geral.md) §6)

Cada página de gestão hoje tem o **próprio** guard, repetido à mão (padrão `Dashboard.tsx`: checa papel, senão `navigate("/")`). O registro de módulos (`src/lib/modulos.ts`) já sabe, por rota, qual módulo e quais papéis — então dá para trocar os ~11 guards espalhados por **um** wrapper `RequireModulo` que lê o registro e decide num lugar só.

Foi **deixado de fora de propósito** do tema que criou o hub (decisão D5 do [`analises/roadmap-modulos.yaml`](./analises/roadmap-modulos.yaml)): misturar uma refatoração de autorização com uma feature de navegação transformaria uma coisa em duas. Os guards atuais **continuam corretos** — o destino `navigate("/")` deles virou "cai no hub" de graça —, então isto é melhoria de manutenção, **não urgente**. Ao fazer, manter o princípio: o wrapper é UX/roteamento; RLS + EFs continuam sendo a barreira real.

---

## Refatorar diálogo "Nova Ocorrência" para modelo wizard

**Status:** pendente
**Área:** Ocorrências (ver [`estrutura/ocorrencias.md`](./estrutura/ocorrencias.md))

Refatorar o diálogo de Nova Ocorrência (`src/pages/OcorrenciasProva.tsx`) para um fluxo em wizard (passos), em vez do formulário único atual.

Junto com a refatoração, **corrigir a funcionalidade de "Faltou"**: quando uma ocorrência marca que o colaborador faltou, ele deve ser **retirado da unidade daquela prova** (ou seja, o vínculo correspondente em `colaboradores_prova` deve ser removido/desfeito para aquela prova+unidade). Hoje esse efeito não acontece.

---

## Sanear as contas do Auth (3 dívidas abertas pelo backfill)

**Status:** pendente — aberto em 2026-07-14, ao vincular os colaboradores que já eram usuários
**Área:** Auth e Permissões (ver [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md))

Ao escrever o backfill do `seed.pos.sql`, a varredura das 15 contas do `auth.users` revelou três problemas. **Nenhum bloqueia a etapa 2**, mas todos ficam piores quando a recuperação de senha por e-mail passar a valer.

**1. Um coordenador loga com `ab@ab.com`.** É um e-mail de teste, e o e-mail real dele já está no cadastro de colaborador. Duas consequências: ele **nunca consegue recuperar a própria senha** (o link iria para uma caixa que não é dele), e `ab@ab.com` é um domínio que **outra pessoa pode passar a possuir** — o que faz de uma conta de coordenador um alvo de tomada de conta. O conserto é trocar o e-mail da conta no Auth para o do cadastro, avisando-o (muda o login dele).

**2. O Caio tem duas contas admin+superadmin:** `caiohis@gmail.com` (a que o backfill vinculou ao cadastro de colaborador dele) e `caio.teixeira@smevr.com.br`. A segunda é a **operacional de verdade** — assinou 406 linhas (232 e-mails do log, 87 metas, 32 salas, 31 alocações, 10 alocações de coordenador, 6 unidades, 3+5 finalizações); a primeira assinou 26. Excluir uma delas **não é trivial**: 8 FKs `created_by` são `NO ACTION`, então o `DELETE` **falha** enquanto as linhas existirem — seria preciso primeiro reapontar a autoria para a conta sobrevivente, o que **reescreve o histórico**. Tentado e abandonado em 2026-07-14 por ser complexo demais para o ganho. Enquanto as duas viverem, decidir qual é a canônica.

**3. Duas contas do Auth não casam com colaborador nenhum:** uma pessoa que não existe na tabela `colaboradores`, e uma "Nathalia" cujo `full_name` (só o primeiro nome) é ambíguo entre duas colaboradoras homônimas. Ambas têm só o papel `user` e ficaram **sem vínculo**, corretamente — o backfill se recusa a adivinhar. Elas podem se reivindicar pelo fluxo normal da etapa 2; o item aqui é só **conferir com um humano** quem são.

---

## Enxugar os grants de tabela de `anon`/`authenticated` (drift do dashboard Lovable)

**Status:** pendente — aberto em 2026-07-15, ao endurecer a RLS de `colaboradores`
**Área:** Auth e Permissões (ver [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md))

Ao fazer a RLS de verdade em `colaboradores` apareceu que **`anon` tem `GRANT SELECT/INSERT/UPDATE/DELETE/TRUNCATE`** na tabela (e `authenticated` idem) — o padrão "tudo para todo mundo" que o dashboard do Lovable aplicou, provavelmente **em todas as tabelas de `public`**. Hoje só a **RLS** impede o estrago: `anon` não tem policy, então SELECT/INSERT/UPDATE/DELETE caem em *default deny*. **Mas `TRUNCATE` não passa por RLS** — um `GRANT TRUNCATE ... TO anon` é, no papel, poder de esvaziar a tabela. O que salva na prática é o PostgREST **não expor** TRUNCATE pela API; ainda assim é privilégio a mais, contra o princípio do menor privilégio.

O trabalho: varrer `information_schema.role_table_grants` por `grantee IN ('anon','authenticated')` e **revogar o que não se justifica** — no mínimo `TRUNCATE`, `REFERENCES`, `TRIGGER` de `anon` em toda tabela; possivelmente reduzir `anon` a só o que os fluxos públicos realmente usam (que hoje passam por Edge Functions com `service_role`, não pela anon key direta). É sistêmico (não só `colaboradores`), então merece um passo próprio e um `db reset` de validação. **Atenção:** casa com a migration `20260712010000_grant_api_roles_table_privileges.sql`, que registrou os grants que faltavam em migration e ajustou `ALTER DEFAULT PRIVILEGES` — o enxugamento tem que conversar com ela, não brigar.

---

## Troca de e-mail de conta confirmada (estado C) — sem caminho no app

**Status:** pendente — aberto em 2026-07-16, ao fechar as Etapas 1 e 2 da edição de `colab_email`
**Área:** Auth e Permissões (ver [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md))

As três etapas da edição de `colab_email` sensível à identidade **estão feitas** (trava de UI + a EF `corrigir-email-acesso`, que renomeia a conta pendente do estado B). **Sobra o estado C:** quem tem login **confirmado** não consegue trocar o próprio e-mail pelo app — e a coordenação também não, de propósito (dar essa alavanca à coordenação reabriria o sequestro). Hoje a única saída é o dashboard do Auth, na mão.

Faltam as duas pontas: **(1) o caminho principal** — `supabase.auth.updateUser({ email })` no `PerfilColaborador`, com a dupla confirmação nativa e o sync de volta para `colab_email` quando confirmar; **(2) a exceção administrativa** — o dono que perdeu a caixa antiga, que exigiria ação separada, restrita a `admin`, auditada. Detalhe e o porquê de cada uma ter ficado de fora em [`analises/dividas-auth-colaborador.md`](./analises/dividas-auth-colaborador.md) §1-bis.

**Resíduo relacionado (§1):** a trava de `colab_email` é **de UI, não de banco** — a RPC `update_meu_colaborador` ainda aceita `p_email` e a policy de UPDATE ainda alcança a coluna, então uma chamada direta ao PostgREST re-ancora a linha. Fechar isso pede trigger (que dispara mesmo para `service_role`, então precisaria de escape para a `corrigir-email-acesso`) ou tirar a coluna do alcance da policy.

---

## Sanear as chaves PIX e preencher `tipo_chave_pix`

**Status:** pendente — aberto em 2026-07-14, quando as colunas ganharam unicidade
**Área:** Colaboradores (ver [`estrutura/colaboradores.md`](./estrutura/colaboradores.md))

Duas pontas soltas deixadas de propósito pela migration `20260714163506_*`:

1. **Os formatos da chave PIX estão misturados.** Das 565 chaves preenchidas, 94 estão em formatos mistos (`127.139.687-47` ao lado de `12713968747`, `(24)998491988`, chaves com espaço no meio) e **uma tem 21 dígitos** — não é chave válida de tipo nenhum. O índice único atual normaliza caixa e espaço nas pontas, mas **não** pontuação: a mesma chave escrita de dois jeitos ainda entra duas vezes. Sanear isso é reescrever dado bancário de 565 pessoas e pede conferência humana.

2. **`tipo_chave_pix` está `NULL` nas 771 linhas.** O tipo **não é inferível** do valor: 397 chaves têm 11 dígitos, e 11 dígitos é tanto CPF quanto celular com DDD (193 batem com o CPF da própria pessoa, 188 com o telefone dela, e o resto com nenhum dos dois). Adivinhar errado é errar o destino de um pagamento. Preencher exige ou confirmação humana, ou uma regra de negócio que ainda não existe.

Enquanto (2) não estiver resolvido, não é possível criar o `CHECK` que amarra "tem chave ⇒ tem tipo".

**Atenção:** qualquer correção em massa aqui é **operação de dados** e esbarra na regra do seed — migration não alcança dado que entra pelo dump (ver [`estrutura/desenvolvimento-local.md`](./estrutura/desenvolvimento-local.md)).

---

## Bootstrap do banco de produção da v2

**Status:** pendente — **deliberadamente adiado até a primeira subida da v2 a produção**
**Área:** Infraestrutura / Banco (ver [`banco-producao.md`](./banco-producao.md))

O projeto novo no supabase.com já foi criado, mas o repo **não é linkado a ele** — e não deve ser, até o dia de colocar a v2 no ar (regra combinada em 2026-07-12: o repo fica deslinkado por padrão, e produção só é atualizada em versões estáveis).

O schema já está pronto para subir quando for a hora: as 69 migrations reproduzem o banco local do zero, validado por `db reset` em 2026-07-12. O roteiro completo dos **9 passos** (link → `prod:push:dry` → `prod:push` → carga do `seed.local.sql` → **`seed.pos.sql`** → auth no dashboard → edge functions + secrets SMTP → `.env` do frontend → **unlink**) está em [`banco-producao.md`](./banco-producao.md).

Falta apenas, no dia: a **ref do projeto novo** no Supabase.

---

## Migrar hospedagem/deploy para fora do Lovable

**Status:** pendente
**Área:** Infraestrutura (ver [`estrutura/arquitetura-geral.md`](./estrutura/arquitetura-geral.md))

O Lovable já foi removido do **código** em 2026-07-11 (`lovable-tagger`, boilerplate, `.lovable/`), e o site do Lovable **não existe mais** — o projeto está temporariamente fora do ar (situação em 2026-07-12). Não há mais deploy ativo em lugar nenhum.

Publicar a v2 em infraestrutura própria (ex.: Vercel, Netlify, ou build estático em qualquer host), incluindo o domínio. O build de produção (`npm run build`) é um Vite estático comum e não depende de nada do Lovable. Depende do bootstrap do banco acima (o frontend precisa apontar para o Supabase novo).

---

## Verificar exposição da `send-email` no projeto Supabase antigo (v1)

**Status:** pendente — **a verificar antes de considerar o assunto fechado**
**Área:** Segurança / Infraestrutura (ver [`estrutura/integracoes-externas.md`](./estrutura/integracoes-externas.md))

Em 2026-07-20 descobriu-se que a `send-email` **não checava quem a chamava**. O `verify_jwt` padrão exige um JWT, mas a **anon key é um JWT válido e é pública** — vai no bundle do frontend. Qualquer pessoa com essa chave podia mandar `{to, subject, html}` arbitrário **pelo servidor SMTP da FEVRE**: o e-mail sai com SPF/DKIM legítimos e serve de vetor de phishing contra os próprios colaboradores. **Corrigido no código** (a função passou a exigir `service_role`).

**O que falta:** a correção vale para o código deste repo. **O projeto Supabase antigo (v1) pode ainda ter a versão vulnerável publicada** — e uma Edge Function fica acessível pela URL do projeto **independentemente de o frontend estar no ar** (hoje não está). Se o projeto v1 ainda existe, o endpoint provavelmente continua chamável com a anon key antiga.

**A fazer:** confirmar se o projeto v1 ainda está ativo; se estiver, ou republicar a `send-email` corrigida nele, ou remover a function, ou derrubar o projeto. Enquanto isso não for verificado, considere as credenciais SMTP da Hostinger como **potencialmente já expostas a uso indevido** — vale checar o volume de envio na conta e, na dúvida, **trocar `SMTP_PASS`** (a senha está nos secrets das EFs e no `.env` local, então a troca é barata).

---

## Porta única de acesso: "Estou sem minha senha" (CPF ou e-mail)

**Status:** ✅ **CONCLUÍDO.** Implementado em 2026-07-20; UI validada em 2026-07-21 (blocos `C` e `E` da bateria, todos aprovados). A regra consolidada vive em [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md) ("Porta única"); este item fica como registro do desenho e das decisões.
**Área:** UX / Autenticação (ver [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md))

> **Achado durante a implementação:** o cooldown precisou olhar **três** carimbos (`recovery_sent_at`, `confirmation_sent_at`, `invited_at`), não só o primeiro — `generateLink('invite')` deixa `recovery_sent_at` NULL, então a versão inicial deixava a chamada seguinte a um invite mandar um recovery que **invalidava o invite recém-enviado**. Detalhe em `auth-e-permissoes.md`.
>
> **Fica em aberto, por decisão:** os **254 sem e-mail** seguem dependendo do coordenador. E o CPF de quem **já tem conta** informa em vez de mandar o link — fechar isso esbarra no estado B (`colab_email` e e-mail da conta divergem, e mandar para a conta não ajudaria).

### A proposta

Na tela `/auth`, **substituir os dois links** — "Primeiro acesso (já sou cadastrado)" e "Esqueci minha senha" — por **um só: "Estou sem minha senha"**. Ele abre uma UI com **um campo**, rotulado "CPF ou e-mail", com **detecção automática** do que foi digitado (tem `@` → e-mail; só dígitos → CPF).

**O botão "Novo Colaborador" permanece** (decisão do usuário). Ficam duas portas, mas a classificação que elas pedem passa a ser fácil — "sou novo" vs. "sou eu, sem senha" — em vez da atual, que é impossível.

### Por que

Hoje a tela pede que a pessoa se classifique segundo o estado do **banco** (`user_id` é nulo? `email_confirmed_at`?), informação a que ela não tem acesso nenhum. **O servidor sabe em que estado ela está; ela não sabe.** A porta única inverte isso: a pessoa diz quem é, e o servidor decide se o caso é criar conta (`invite`) ou redefinir senha (`recovery`).

O rótulo novo também cobre os dois casos com uma frase verdadeira: "estou sem minha senha" vale para quem nunca teve e para quem esqueceu. "Primeiro acesso (já sou cadastrado)" exigia entender o que "cadastrado" significa no nosso jargão.

### ⚠️ A decisão que precisa sobreviver: as respostas são ASSIMÉTRICAS de propósito

Os dois caminhos fundidos têm **políticas opostas de privacidade, e isso não é acidente**:

- **CPF** (`reivindicar-acesso`) **revela**: devolve `{existe, ja_vinculado, email_mascarado}`. Concessão consciente, já documentada como dívida contida, segurada por rate limit de 5/15 min por IP. O e-mail mascarado é o que diz à pessoa **qual caixa abrir** — para quem tem vários endereços, é a diferença entre entrar e desistir.
- **E-mail** (`recuperar-senha`) **não revela nada**: resposta idêntica para conta existente, inexistente ou em cooldown.

**Decisão: fundir a UI, NÃO as políticas.** Cada input vaza coisa diferente, com economia de ataque diferente — uma lista de e-mails se compra pronta e se testa em massa; CPF é outro jogo, e aquele risco já está aceito e contido. Mantendo cada política onde ela é ótima, a fusão **não cria dívida nova**: é reorganização de tela, não mudança de postura.

**Isto é o item mais importante deste registro.** A mesma tela responder de dois jeitos **parece bug** para quem chega depois. Quem "consertar" a inconsistência uniformizando as respostas vai, dependendo do lado que escolher, **reabrir a enumeração por e-mail** ou **matar o e-mail mascarado** (e com ele o aviso "procure o coordenador" dos 254 sem e-mail). Não uniformize sem reler isto.

### O furo que a implementação precisa fechar

A `recuperar-senha` procura a conta em **`auth.users`**. Quem está em **estado A com e-mail no cadastro** (a maioria dos 759) **não tem conta** — então, se essa pessoa digitar o e-mail dela, a EF não acha nada, devolve a frase genérica e **não envia e-mail nenhum**. É o mesmo buraco negro de hoje, agora atrás de uma porta que promete resolvê-lo.

**Correção necessária:** não achou conta no Auth → procurar em `colaboradores.colab_email` → se achar em estado A, mandar o **`invite`** em vez do `recovery`. É o mesmo raciocínio que o servidor já faz pelo CPF, aplicado ao e-mail. **Não custa privacidade:** a resposta continua genérica, então a EF fica mais útil sem ficar mais falante.

### Beco novo que a proposta cria

Os **254 sem e-mail no cadastro**: se a pessoa digitar o e-mail pessoal dela, não há match (o cadastro não tem e-mail nenhum) e ela recebe "não encontrado" — concluindo que **não está cadastrada**, o que é falso. Hoje isso não acontece porque a porta dela é obrigatoriamente o CPF. **A tela deve sugerir "tente pelo CPF" antes de dar qualquer veredicto de inexistência.**

### Escopo

1. Componente novo (campo único + detecção), reaproveitando o miolo do `ReivindicarAcessoCard`.
2. `Auth.tsx`: dois links viram um; "Novo Colaborador" fica.
3. `recuperar-senha`: o ramo de estado A por e-mail (acima).
4. A dica "tente pelo CPF" antes do veredicto de inexistência.
5. Rate limit: o endpoint passa a receber os dois tipos de input — conferir se o teto por IP da `reivindicar-acesso` (5/15 min) e o cooldown por conta da `recuperar-senha` (2 min) seguem cobrindo o caminho fundido.
6. Docs: quando implementar, a regra consolidada vai para [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md), e a bateria em [`../docs/teste-frontend-auth-colaborador.md`](../docs/teste-frontend-auth-colaborador.md) ganha os casos (bloco C e E se fundem na prática).

**Não precisa de roadmap:** não há etapas com dependência entre si, nem migration, nem política de segurança nova — é uma mudança coerente única. O que precisava de registro era a assimetria e o furo acima, que é o que este item guarda.
