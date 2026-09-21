# "Último Acesso" não é evidência de nada — e o que é

> **Vivo / parcialmente executado** (ver [`README.md`](./README.md)). Diagnóstico de 2026-09-20.
> ⚠️ Este bloco dizia *"sem correção executada"*, depois *"continua aberta a 6.2"* — as duas
> ficaram velhas no MESMO DIA. **As DUAS correções foram feitas em 2026-09-20**: o carimbo
> (migration `20260921002249_*`) e a trilha de envio (migration `20260921005259_trilha_envio_link_acesso.sql`).
>
> Área: [`../estrutura/transversais/auth-e-permissoes.md`](../estrutura/transversais/auth-e-permissoes.md)
> + [`../estrutura/modulos/aplicacao-provas/colaboradores.md`](../estrutura/modulos/aplicacao-provas/colaboradores.md)

## 1. O que motivou

Chegaram avisos automáticos de **"E-mail informado pelo próprio colaborador"** — o disparo da Edge
Function `incluir-email-cadastro`, a porta de autosserviço aberta em 19/09. Ao procurar essas
pessoas em `/colaboradores`, a coluna **Último Acesso** dizia **"Nunca acessou"**.

Três hipóteses estavam na mesa: (1) não receberam ou não acharam o e-mail; (2) realmente não
acessaram; (3) defeito no salvamento do último acesso.

**A (3) está confirmada, e ela envenena as outras duas:** enquanto a coluna estiver morta, a tela
não distingue quem nunca entrou de quem entra todo dia.

## 2. O achado: a coluna não tem escritor desde 2026-07-15

`colaboradores.colab_ultimo_acesso` nasceu em
[`../../supabase/migrations/20260120114445_78514e86-d0ad-4ad1-8fb7-ef790e9a6657.sql`](../../supabase/migrations/20260120114445_78514e86-d0ad-4ad1-8fb7-ef790e9a6657.sql)
junto com os seus dois únicos escritores, ambos do portal de login por código de 4 dígitos:

| Função | Quando escrevia |
|---|---|
| `register_colaborador_session(uuid)` | login no portal antigo |
| `update_colaborador_session_activity(uuid)` | heartbeat de atividade |

As duas foram **dropadas** em
[`../../supabase/migrations/20260715125720_drop_rpcs_colaborador_antigas.sql`](../../supabase/migrations/20260715125720_drop_rpcs_colaborador_antigas.sql)
(subetapa 2D), junto com o resto do modelo de acesso antigo. **A leitura ficou; a escrita foi
embora, e ninguém notou porque a coluna continuou existindo com dado dentro.**

Hoje: zero `.update()`, zero RPC, zero trigger, zero Edge Function escreve nessa coluna. O trigger
moderno de login — `on_auth_user_signin` → `vincular_colaborador_no_signin`, em
[`../../supabase/migrations/20260919121555_vinculo_colaborador_em_conta_existente.sql`](../../supabase/migrations/20260919121555_vinculo_colaborador_em_conta_existente.sql)
— roda a cada login, recebe `NEW.last_sign_in_at` e **não carimba nada**. Era o ponto natural.

Quem lê, e mostra "Nunca acessou" sobre `null`:

- `src/components/ColaboradoresList.tsx` (a rota `/colaboradores`), com a coluna no `select` de
  `src/hooks/useColaboradores.tsx` e ordenação server-side com `nullsFirst: false`
- `src/pages/PainelDadosColaboradores.tsx`

⚠️ **O recurso de ordenar por "Último Acesso" foi desenhado para achar quem nunca entrou** — e hoje
ordena uma coluna que é `null` para todo cadastro posterior a julho.

## 3. A medição (banco local, cópia de produção de 2026-09-16)

| | |
|---|---|
| valor mais recente em `colab_ultimo_acesso` | **2026-07-11** — congelado |
| linhas preenchidas | **493** — o mesmo número que [`concluidos/roadmap-auth-colaborador.md`](./concluidos/roadmap-auth-colaborador.md) anotou em julho, e que nunca mais mudou |
| colaboradores vinculados a uma conta | **52** |
| …que **entraram de verdade** | **47** |
| …desses, exibidos como **"Nunca acessou"** | **33** |
| …desses, exibindo uma **data congelada** de junho/julho | **14** |
| convites gerados **sem nenhum acesso** | **5** |
| login mais recente de verdade (`auth.users`) | **2026-09-16** |

**A tela erra para 100% de quem usou o sistema depois de 15/07**, e erra nos dois sentidos.

## 4. Como o GoTrue carimba — medido, não deduzido

Exercitado contra o GoTrue local em 2026-09-20, com `generateLink` pela Admin API e um endereço
descartável (`@example.invalid`), seguindo o `action_link` com `curl`. **`generateLink` não envia
e-mail** — quem envia é a nossa `send-email` —, então o teste não toca a caixa de ninguém.

| Evento | `invited_at` | `confirmation_sent_at` | `recovery_sent_at` | `email_confirmed_at` | `last_sign_in_at` |
|---|---|---|---|---|---|
| `generateLink('invite')` | ✅ carimba | ✅ carimba | — | — | — |
| **clique** no link de invite | mantém | 🔴 **LIMPA** | — | ✅ carimba | ✅ carimba (3 ms depois) |
| `generateLink('recovery')` | mantém | — | ✅ carimba | mantém | mantém |
| **clique** no link de recovery | mantém | — | ⚠️ **não limpa** | mantém | ✅ avança |

🔴 **Duas consequências que mudam a leitura, e as duas contrariam o senso comum:**

1. **`colaboradores.user_id` preenchido NÃO significa que a pessoa acessou.** O `generateLink` cria
   a conta no Auth no **envio**, e é o nascimento da conta que dispara `handle_new_user` → o
   vínculo. `user_id` prova que o **convite foi gerado**, e mais nada.
2. **`last_sign_in_at` preenchido não significa "entrou com a própria senha"** — o próprio clique no
   link abre sessão e carimba.

⚠️ **`confirmation_sent_at` ser LIMPO no consumo é o sinal mais útil do conjunto:** preenchido =
convite enviado e **ainda não aberto**. `recovery_sent_at` não tem essa propriedade — ele só diz
quando o último recovery saiu, não se alguém o usou.

### O corte entre "só clicou" e "usa o sistema" saiu do dado

Medida a diferença entre `email_confirmed_at` e `last_sign_in_at` nas 47 contas que entraram, a
distribuição é **bimodal e sem zona cinzenta**:

| faixa | contas |
|---|---|
| 4 a 13 **milissegundos** | **7** — o clique, e nada mais |
| entre 13 ms e 24,8 s | **0** |
| 24,8 s a vários dias | **40** — voltaram e entraram de verdade |

⚠️ **Eu havia proposto um corte de "2 minutos", e ele estava errado** — classificaria como "só
clicou" 12 pessoas que criaram a senha e logaram em seguida, que é o caminho normal e leva 1 a 2
minutos (o `RedefinirSenha` faz `signOut()` e devolve a pessoa para `/auth`). O controle positivo
pegou: uma colaboradora (`priscila…@gmail.com`), com 105 s de diferença, caía no balde errado. **O limiar é 1 segundo.**

## 5. Como responder à pergunta hoje

[`../../docs/consulta-acesso-colaborador.sql`](../../docs/consulta-acesso-colaborador.sql) —
somente `SELECT`, para colar no SQL Editor do dashboard de produção. **Não exige `supabase link`**,
e portanto não arma `db push` (§6 do `CLAUDE.md`). Quatro blocos: a pessoa, a coorte inteira do
autosserviço, o tamanho do defeito e o log de auditoria do GoTrue.

A tabela de leitura que ela implementa:

| Estado | Leitura |
|---|---|
| sem linha em `auth.users` | **o convite não chegou a ser gerado** — falha de envio, o caso mais grave |
| `confirmation_sent_at` preenchido, `email_confirmed_at` nulo | **convite pendente**: saiu e nunca foi aberto → hipótese 1 ou 2 |
| `email_confirmed_at` preenchido, delta < 1 s | **só abriu o link** e nunca entrou com a própria senha |
| `email_confirmed_at` preenchido, delta ≥ 1 s | **acessa o sistema** — a tela está mentindo |

🔴 **A consulta foi executada contra o banco local antes de ser entregue**, com controle positivo
nos dois sentidos: acha o caso ruim (busca por **CPF** → *convite pendente*) **e** reconhece o
caso bom (busca por **e-mail** → *acessa o sistema*, com a tela dizendo "Nunca acessou"). É o §5 do `CLAUDE.md`: bateria que ninguém rodou não é prova.

⚠️ O bloco 4 (auditoria do GoTrue) **não pôde ser validado**: `auth.audit_log_entries` não vem no
dump, então localmente ela só tinha as 5 linhas do meu próprio teste. Em produção pode ser a melhor
fonte — a consulta começa conferindo se a tabela tem histórico, e **tabela vazia ali não é evidência
de ausência de login**.

## 6. As duas correções — a primeira EXECUTADA em 2026-09-20, a segunda não

### 6.1 ✅ Ressuscitar o carimbo — FEITO (migration `20260921002249_carimbar_ultimo_acesso_no_login.sql`)

🟢 **Executado.** O que segue descreve o que foi feito, não o que falta.

🔴 **Um achado que só apareceu ao implementar:** os dois blocos `EXCEPTION` têm de ser **separados**. Com o carimbo pendurado no mesmo bloco do vínculo, a exceção do carimbo anula a subtransação inteira e **o vínculo é desfeito junto** — perda silenciosa nova, criada pelo conserto. Falsificado: a variante fundida reprova o caso 14 da bateria.

O lugar é `vincular_colaborador_no_signin`, que já dispara `AFTER UPDATE OF last_sign_in_at,
email_confirmed_at ON auth.users` e já tem o valor em mãos. Um `UPDATE public.colaboradores SET
colab_ultimo_acesso = NEW.last_sign_in_at WHERE user_id = NEW.id`.

🔴 **Tem de ficar DENTRO do bloco `EXCEPTION` que já existe ali.** Essa função roda dentro da
transação de login do GoTrue: exceção não tratada **impede a pessoa de entrar**. O comentário da
migration `20260919121555` explica por que o `EXCEPTION` engole erro de propósito, e o caso 6 de
[`../../docs/bateria-vinculo-colaborador.sql`](../../docs/bateria-vinculo-colaborador.sql) prova que
o login sobrevive.

⚠️ **O backfill é dado, não schema — vai para `seed.pos.sql`, nunca para a migration** (§3 do
`CLAUDE.md`): migration roda com `auth.users` ainda vazia e seria no-op, e em produção o bootstrap
faz `db push` **antes** de carregar o dump. Ele é exprimível como regra genérica (`… FROM auth.users
u WHERE u.id = c.user_id`), então é caso de `seed.pos.sql` mesmo — idempotente e seguro contra base
vazia. Em produção é passo manual, e esquecê-lo é falha silenciosa.

🔵 **A decisão sobre o backfill foi tomada em 2026-09-20: NÃO HAVERÁ.** Ver o §10. Este parágrafo
descrevia a pergunta em aberto (o que fazer com os valores de junho/julho e se usar
`GREATEST(colab_ultimo_acesso, u.last_sign_in_at)`) — ela **não está mais em aberto**, e o conserto
é só o item acima. ⚠️ Não reabra propondo backfill "para deixar consistente": foi recusado com
motivo.

### 6.2 ✅ A trilha de envio do link — FEITA (migration `20260921005259_trilha_envio_link_acesso.sql`)

🟢 **Executado.** Nova tabela **`public.log_envio_link_acesso`**, escrita num **ponto único**: dentro
de `enviarLinkAcesso` (`_shared/enviar-link-acesso.ts`), não em cada uma das 5 Edge Functions que a
chamam. É a mesma lição do `registrarFalhaDeEnvio` — um `{ ok }` esquecido por um chamador já
escondeu, por meses, o invite que morria calado em e-mail com conta. Repetir a escrita em 5 lugares
seria repetir esse risco numa 6ª função futura.

**Como funciona, por dentro:** todo `return` de `enviarLinkAcesso` passa por um `finalizar()` local
que grava a linha antes de devolver o resultado — os três desfechos (generateLink falhou, send-email
falhou, deu certo) gravam exatamente uma vez. `colaborador_id` é nullable: `recuperar-senha` atende
qualquer conta do Auth, não só colaborador (admin/coordenador não têm linha em `colaboradores`).

🔴 **Best-effort e nunca lança, por contrato** — a escrita da trilha não pode derrubar o envio real.
Falsificado: um dublê cujo `.insert()` sempre falha (`docs.../enviar-link-acesso.test.ts`, caso
*"INSERT da trilha falhando NÃO derruba o envio real"*) prova que `enviarLinkAcesso` continua
devolvendo `ok: true` mesmo com a gravação quebrada — só um `console.error` marca o ocorrido.

🟢 **Prova de ponta a ponta, não só dublê:** chamei `enviarLinkAcesso` de verdade contra o Auth local
(sem `INSERT` manual). O Edge Runtime local estava parado, então o POST para `send-email` falhou com
`name resolution failed` — e a função gravou sozinha `sucesso: false, motivo_falha: '{"message":
"name resolution failed"}'`. É o caso mais importante: falha de infraestrutura vira LINHA, não
silêncio.

**RLS: SELECT só para admin**, mesmo recorte de `log_email_autoinformado`. Verificado com controle
positivo e negativo via `SET LOCAL role` + `request.jwt.claims`: admin vê (1), colaborador comum não
vê (0), `anon` nem chega a ler (falta `GRANT`).

⚠️ **Só vale daqui para frente — sem backfill**, mesma decisão do carimbo de último acesso: envios
de antes de 20/09 não aparecem na trilha. `log_email_autoinformado` continua sem servir para isto —
é a trilha de quem **informou o e-mail**, não de quando o link saiu. `email_atualizacao_log` também
não — é de e-mail de prova, com `prova_id NOT NULL`.

Consulta pronta: bloco 6 de [`../../docs/consulta-acesso-colaborador.sql`](../../docs/consulta-acesso-colaborador.sql).

## 7. Confirmado em PRODUÇÃO — o caso que motivou o estudo

O bloco 1 foi rodado contra produção em 2026-09-20, para a colaboradora do aviso
(`patricia…@gmail.com`, origem `cadastro-publico`). A linha inteira do fluxo, em **3 minutos**:

| Carimbo | Valor | Leitura |
|---|---|---|
| `invited_at` | 17:20:18 | o convite foi gerado e enviado |
| `confirmation_sent_at` | **nulo** | 🔵 **consumido** — o link foi aberto |
| `email_confirmed_at` | 17:21:00 (+42 s) | **o e-mail chegou, e ela achou** |
| `last_sign_in_at` | 17:23:28 (+2 min 27 s) | **entrou com a senha própria** |
| `colab_ultimo_acesso` | nulo | a tela diz *"Nunca acessou"* |

🔴 **As hipóteses 1 e 2 caem neste caso, e sobra só o defeito da tela.** O segundo carimbo é a prova
do login de verdade: `RedefinirSenha` faz `signOut()` e devolve a pessoa para `/auth`, então
`last_sign_in_at` só avança além do clique se ela voltou e entrou.

🟢 **De quebra, dois pontos que estavam em aberto ficaram provados em produção:** o secret
`SITE_URL` está correto (o link abriu o site de verdade, e não `localhost` — o risco descrito no
§6 do `CLAUDE.md`) e a entrega pela Hostinger funciona ponta a ponta para um destinatário real.

⚠️ **Note a margem:** os 2 min 27 s entre confirmar e logar passam **raspando** por um corte de 2
minutos. Foi o segundo caso a reprovar aquele limiar — ver o §4.

## 8. A coorte inteira, em produção — a porta do autosserviço FUNCIONA

Bloco 2, rodado contra produção em 2026-09-20, sobre todo mundo que informou o próprio e-mail desde
que a porta abriu em 19/09:

| | |
|---|---|
| informaram o e-mail | **11** |
| o convite não saiu (sem conta no Auth) | **0** |
| convite pendente, nunca aberto | **0** |
| **abriram o link** | **11** — 100% |
| voltaram e entraram com a própria senha | **10** |

🟢 **As hipóteses 1 e 2 caem para a coorte inteira, não só para o caso isolado.** Não há e-mail que
não chegou, não há link que ninguém achou: 11 de 11 foram abertos. O único defeito é a tela.

⚠️ **Por que `abriram_o_link` é confiável aqui** (e não seria numa coorte qualquer):
`email_confirmed_at` preenchido só prova que *este* convite foi aberto porque a porta do
autosserviço atende exclusivamente cadastro **sem e-mail e não vinculado**, e a RPC
`registrar_email_do_proprio_cadastro` recusa e-mail que já tenha conta. Nenhuma dessas 11 contas
podia preexistir, então o carimbo não pode ser herdado de um acesso anterior. **Numa coorte que
inclua o caminho `recovery`, essa inferência não vale** — a conta já era confirmada antes.

### A pessoa que ficou no meio do caminho

Sobrou **1** que abriu o link e nunca mais entrou. O bloco 5 da consulta faz a triagem, e a
armadilha ali vale registrar:

🔴 **`encrypted_password` NÃO distingue nada** — o GoTrue sempre grava um hash, inclusive para o
convidado que nunca definiu senha. Medido: **zero** contas com senha vazia, nos dois grupos. Quem
auditar por essa coluna conclui que todo mundo tem senha e não aprende nada.

O que discrimina é **`updated_at`**: das 7 contas de delta-milissegundo no banco local, **3** têm a
linha alterada depois do clique (chegaram a criar a senha e não voltaram) e **4** não (abandonaram
antes disso). ⚠️ É triagem, não prova — `updated_at` avança a cada alteração da linha, não só ao
definir senha.

## 9. O tamanho do defeito em PRODUÇÃO — 263 de 263

Bloco 3, rodado contra produção em 2026-09-20:

| | |
|---|---|
| colaboradores vinculados a uma conta | **274** |
| **entraram de verdade** | **263** |
| …exibidos como *"Nunca acessou"* | **71** |
| …exibindo uma **data congelada** de junho/julho | **192** |
| convite gerado, sem nenhum acesso | **11** |
| último carimbo da coluna morta | **2026-07-09** |
| último login de verdade | **2026-09-20 23:43** |

🔴 **71 + 192 = 263: não há uma única pessoa que a tela descreva certo.** O número da direita é o
mesmo dos que entraram — a cobertura do defeito é total, não majoritária.

⚠️ **E o último login é do próprio dia da medição.** O sistema está em uso ativo enquanto a tela
afirma que quase ninguém acessa — é exatamente o formato de erro que o §8 do `CLAUDE.md` chama de
perda silenciosa: não dá erro, e *parece* informação.

Para escala: no banco local (cópia de 16/09) eram 47 de 47. Produção tem **5,6× mais** gente
afetada, o que faz sentido — o local é a foto de antes das duas semanas de uso da v3.

## 10. Decisão: o passado NÃO se corrige (2026-09-20)

**Decisão do usuário, registrada para não ser reaberta por engano:** *"o erro de informação 'nunca
acessou' não precisa ser corrigido para informações passadas"*. **Não haverá backfill.**

O conserto fica só no sentido do futuro: o trigger passa a carimbar, e cada pessoa se corrige
sozinha no primeiro login seguinte.

**O que isso elimina** — e é ganho real, não só economia: o backfill iria para `seed.pos.sql`, que
em produção **não roda sozinho** (é passo manual do bootstrap). Esquecê-lo seria falha silenciosa,
schema certo e dado errado. Sem backfill, não há passo manual a esquecer, e o §6.1 deixa de ter
pergunta em aberto sobre os ~446 valores do portal antigo.

⚠️ **O custo, aceito:** os **192** com data congelada seguem exibindo junho/julho até logarem de
novo — e data velha é pior que ausência, porque *parece* dado bom. Os **71** seguem como "Nunca
acessou". Os dois casos são auto-curáveis no próximo login, e quem precisar da verdade antes disso
tem [`../../docs/consulta-acesso-colaborador.sql`](../../docs/consulta-acesso-colaborador.sql).
