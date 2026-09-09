# Análise — rate limit nos fluxos de acesso (login, senha, colaboradores)

> **Status: VIVO, não iniciado.** Desenho e medições de 2026-08-13. Nada aqui foi implementado.
>
> 🔵 **Atualizado no mesmo dia, medido contra a produção.** Três hipóteses caíram, e o **passo 0
> está COMPLETO** — não há mais bloqueador para implementar:
>
> | Hipótese | Veredito |
> |---|---|
> | §5 — signup aberto permite tomar cadastro | ✅ **fechado no dashboard**: signup desligado, confirmação ligada |
> | §4 — não há teto para tentativa de senha | ✅ **há**: 30 req/5 min por IP (era leitura do container local) |
> | D3 — o IP do rate limit é forjável | ✅ **não é**: header forjado não virou chave (medição no D3) |
>
> **Sobra como primeiro item o §2** — o teto que falha **aberto** e não é atômico — **e o §3**, as
> duas portas públicas sem teto nenhum.
> Contexto que muda o peso de tudo: **o site foi ao ar**. Até 12/08 as Edge Functions eram
> alcançáveis pela URL do projeto mas ninguém as conhecia; agora há um domínio público
> apontando para elas, num projeto **sem backup** (ver [`../banco-producao.md`](../banco-producao.md)).

**Recomendação em uma linha:** o item mais urgente **não é** criar rate limit novo — é consertar
os quatro defeitos do rate limit que **já existe** (ele falha aberto, é contornável e não é atômico)
e tapar as **duas portas públicas que não têm nenhum**, sendo uma delas capaz de escrever PII e
disparar e-mail com o domínio da FEVRE a cada chamada.

---

## 1. O mapa das portas

Todo fluxo de acesso alcançável **sem sessão**, com o que barra hoje. `RL` = a tabela
`reivindicacao_rate_limit` (5 tentativas / 15 min por IP, **orçamento único** entre as duas EFs).

| # | Fluxo | Endpoint | Efeito colateral | Barreira hoje |
|---|---|---|---|---|
| 1 | **Login** | `POST /auth/v1/token?grant_type=password` (GoTrue) | sessão | ⚠️ nenhuma **nossa**; a plataforma dá 30/5 min por IP — ver §4 |
| 2 | Esqueci minha senha (e-mail) | EF `recuperar-senha` | envia e-mail | ✅ RL + cooldown 2 min/conta |
| 3 | Estou sem minha senha (CPF) | EF `reivindicar-acesso` | envia e-mail, cria conta | ✅ RL (**sem** cooldown por alvo) |
| 4 | Pré-checagem do cadastro público | EF `check-cpf-colaborador` | nenhum | 🔴 **nenhuma** |
| 5 | Cadastro público | EF `public-create-colaborador` | **INSERT em `colaboradores`** + e-mail | 🔴 **nenhuma** |
| 6 | Definir senha pelo link | `PUT /auth/v1/user` (GoTrue) | troca senha | GoTrue (token de uso único) |
| 7 | Signup direto | `POST /auth/v1/signup` (GoTrue) | **cria conta e VINCULA cadastro** | ✅ **fechado no dashboard** (13/08) — ver §5 |

As autenticadas (`create-admin`, `create-coordenador`, `corrigir-email-acesso`) exigem
`admin`/`superadmin` via `has_role` e ficam **fora do escopo**: rate limit ali protege contra o
próprio administrador, o que não é a ameaça.

🔴 **O nginx do servidor novo não protege nada disto.** O bundle nasce com
`VITE_SUPABASE_URL=https://zugigdpuxbpogoepdawm.supabase.co` (medido em `.env.production`), então o
navegador fala **direto** com o Supabase. `limit_req` no nosso nginx nunca vê esse tráfego — ele só
serve os arquivos estáticos. Qualquer desenho que suponha "resolvo no proxy" está errado por
construção.

---

## 2. O rate limit que já existe — e os quatro defeitos dele

O código é o mesmo bloco copiado em duas funções
(`reivindicar-acesso/index.ts:50-61` e `recuperar-senha/index.ts:76-87`):

```ts
const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido';
const { count } = await supabase.from('reivindicacao_rate_limit')
  .select('*', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', desde);
if ((count ?? 0) >= RATE_LIMIT_MAX) return jsonResp({ error: 'Muitas tentativas…' }, 429);
await supabase.from('reivindicacao_rate_limit').insert({ ip });
```

O **desenho** está certo — o orçamento compartilhado entre as duas portas é uma decisão boa e
documentada (separados, o atacante somaria 5 + 5). Os defeitos são de **mecânica**, e é a mesma
distinção que a centralização dos guards fez em 26/07: a política estava certa, a engrenagem não.

### D1 — 🔴 Falha ABERTA

`const { count } = …` **descarta o `error`**. Se a consulta falhar por qualquer motivo (a tabela
indisponível, o PostgREST recusando, um timeout), `count` vem `undefined`, `(count ?? 0) >= 5` é
falso e **a requisição passa**. O modo de falha do rate limit é "não há rate limit", em silêncio —
exatamente o formato de erro que o §8 do `CLAUDE.md` diz ser o mais temido aqui: não dá erro, só
para de proteger.

Pior: o `insert` seguinte também tem o erro descartado. Se as escritas falharem, o contador nunca
sobe e **todos** os pedidos passam para sempre.

### D2 — 🔴 Não é atômico: lê, decide, escreve

Três chamadas de rede separadas. Duas requisições simultâneas leem `count = 4` e **as duas** passam.
Com 50 requisições disparadas em paralelo, o teto de 5 vira ~50: o atacante nem precisa contornar o
limite, basta **não esperar**. Contra o cenário real (script disparando e-mails em série), o limite
atual entrega uma fração da proteção que promete.

É o padrão **"vários passos sem transação"** que o `CLAUDE.md` §8 lista como um dos dois defeitos
mais repetidos deste repo — desta vez no caminho de autenticação.

### D3 — ✅ MEDIDO E DESCARTADO: o header NÃO é forjável (2026-08-13)

> 🔵 **Esta era a minha hipótese mais forte, e a medição a derrubou.** Fica escrita porque o
> raciocínio é bom e volta a valer se a plataforma mudar — e porque este repo trata premissa
> falsificada como registro, não como erro a apagar.

**A hipótese:** `x-forwarded-for` é uma lista e o código pega `split(',')[0]` — o **primeiro**
elemento, que é o que o cliente escreveu; proxies acrescentam à direita. Se a plataforma anexasse
em vez de sobrescrever, um `X-Forwarded-For: 203.0.113.<aleatório>` por requisição daria
**orçamento infinito**. O DNS reforçava o medo: `zugigdpuxbpogoepdawm.supabase.co` resolve para
`104.18.38.10` / `172.64.149.246` — **Cloudflare**, cujo comportamento padrão é justamente anexar.

**A medição, contra produção:**

1. `curl -4 ifconfig.me` → `189.84.180.186` (o IP real da máquina de teste).
2. `POST /functions/v1/reivindicar-acesso` com `X-Forwarded-For: 203.0.113.7`, CPF inexistente
   (grava a linha de rate limit, não dispara e-mail) → **200**.
3. `select ip, count(*) from reivindicacao_rate_limit group by ip` →
   **`189.84.180.186 | 3`**, e **nenhuma** linha `203.0.113.7`.

**Veredito:** o edge do Supabase **sobrescreve** o header antes de a função vê-lo. O teto por IP
vale, e a correção "trocar a fonte do IP" **sai do escopo**. ⚠️ Ressalva honesta: foi testada uma
variante (`X-Forwarded-For` simples). Não testei `X-Real-IP` nem `CF-Connecting-IP` forjados, nem
XFF com múltiplos valores — o bypass clássico está fechado, mas a afirmação é sobre o que se mediu.

⚠️ **A armadilha que continua, e é de graça guardar:** o endpoint hoje é **IPv4-only** (nenhum
registro `AAAA` — conferido). Se a Supabase publicar AAAA, os clientes passam a chegar por IPv6 e a
chave vira o endereço completo. Uma casa recebe um `/64` (~18 quintilhões de endereços) e as
*privacy extensions* **rotacionam o endereço sozinhas**, sem ninguém tentar burlar nada: o teto
viraria pó em silêncio, e por um caminho que ninguém associaria a rate limit. Normalizar a chave
para o prefixo `/64` quando o valor for IPv6 custa uma linha e deve entrar junto com a RPC do §6.

### D4 — ⚠️ A tabela cresce para sempre

Nenhuma retenção: não há `DELETE`, não há `pg_cron` (conferido: zero ocorrências em
`supabase/migrations/`), e nada mais no repo toca a tabela. **Cada tentativa é uma linha eterna**,
inclusive as do atacante — que assim ganha um vetor barato de encher os 500 MB do plano Free, num
banco **sem backup nenhum**. Hoje são 0 linhas no local; o número não diz nada porque o fluxo mal
rodou. A retenção precisa entrar no mesmo passe da correção.

### D5 — ⚠️ 5 por 15 min por IP vai gerar chamado de suporte

São **771 colaboradores** (759 ainda sem conta, dos quais **504 têm e-mail** — medido hoje). O
perfil de uso é rajada: às vésperas da prova, muita gente reivindicando acesso ao mesmo tempo — e
gente que compartilha IP (escola, prefeitura, o mesmo escritório, operadora móvel com CGNAT). O
sexto colaborador do mesmo NAT leva 429 sem ter feito nada de errado, e a mensagem ("Aguarde alguns
minutos") não distingue isso de abuso.

**Não é argumento para afrouxar o teto** — é argumento para o teto ter **duas dimensões**: um
orçamento por IP maior (que barra o script) e um cooldown por **alvo** pequeno (que barra o
bombardeio de uma pessoa). Hoje só a `recuperar-senha` tem a segunda dimensão, e ela vem de graça
dos carimbos do Auth; a `reivindicar-acesso` não tem nenhuma.

---

## 3. As duas portas sem barreira alguma

### 3.1 🔴 `public-create-colaborador` — a mais grave

Sem sessão, sem teto, cada chamada:
1. **insere uma linha em `colaboradores`** — a tabela de PII (CPF, endereço, telefone, dados
   bancários) de 771 pessoas reais;
2. **dispara um e-mail** pelo `_shared/enviar-link-acesso.ts` → `send-email` → **SMTP da Hostinger,
   com SPF/DKIM da FEVRE**, para o endereço que o corpo mandar.

Três consequências distintas, e vale separá-las porque só uma delas é "spam":

| Ataque | O que custa |
|---|---|
| Encher `colaboradores` de linhas falsas | Polui a base que alimenta alocação e pagamento; limpar exige distinguir falso de real **depois**, sem backup para comparar |
| Mandar e-mail para terceiros | Bombardeio com o **domínio da FEVRE**; risco de a Hostinger suspender o SMTP ou de o domínio cair em blocklist — o que derruba junto **todos** os fluxos de acesso legítimos |
| Queimar CPF/e-mail alheio | O CPF vira "já cadastrado" e o índice único de `colab_email` fica consumido: a pessoa real **não consegue mais** se cadastrar sozinha |

⚠️ Isto é a mesma classe de falha que fechar a `send-email` em `service_role` resolveu em 20/07 —
reaberta **um nível acima**. A EF respeita a regra ("só EF chama a `send-email`"), mas a EF que
chama é pública e ilimitada.

### 3.2 ⚠️ `check-cpf-colaborador` — menor, mas é um oráculo

Devolve `{exists}` para qualquer CPF, sem teto. O espaço de CPF é grande demais para varredura cega,
então **não** é uma lista de colaboradores à venda. O que ele entrega é a pergunta dirigida: *"o
fulano trabalha para a FEVRE?"*, ilimitadamente — e uma consulta ao banco por requisição, num
projeto Free com cota. É o candidato natural ao teto **mais generoso e mais barato**: ele não tem
efeito colateral.

---

## 4. O login em si — por que não dá para resolver do nosso lado

O `signInWithPassword` (`useAuth.tsx:132`) fala com o **GoTrue**, não com código nosso. Não há onde
enfiar um `if`: nenhuma EF está no caminho, e nosso nginx também não (§1).

**Medido hoje**, no container `supabase_auth` local — as variáveis de rate limit que o GoTrue expõe:

```
GOTRUE_RATE_LIMIT_ANONYMOUS_USERS=30   GOTRUE_RATE_LIMIT_OTP=30
GOTRUE_RATE_LIMIT_EMAIL_SENT=360000    GOTRUE_RATE_LIMIT_VERIFY=30
GOTRUE_RATE_LIMIT_TOKEN_REFRESH=150    GOTRUE_RATE_LIMIT_SMS_SENT=30
```

Nenhuma delas é para tentativa de senha: há teto para renovar token, verificar OTP e signup anônimo,
e nada para "errar a senha".

🔵 **Isso vale só para o local, e a diferença importa.** Conferido no dashboard de produção em
2026-08-13 (**Authentication → Rate Limits**), a instância hospedada tem um teto que o container
local não expõe:

| Limite (produção, 13/08) | Valor |
|---|---|
| ⭐ **Sign-ups e sign-ins** | **30 requisições / 5 min por IP** (360/h) |
| Token refreshes | 150 / 5 min por IP |
| Token verifications (OTP e magic link) | 30 / 5 min por IP |
| Envio de e-mail (SMTP do próprio Auth) | 30/h |
| Usuários anônimos | 30/h por IP — inócuo, `enable_anonymous_sign_ins = false` |

⚠️ **Então existe teto, mas ele é por IP e não por conta.** Contra um script num IP só, 30/5 min
segura. Contra um ataque distribuído a **uma** conta conhecida, não há nada: não há bloqueio por
conta, nem backoff, nem aviso de tentativa falha. Some-se `minimum_password_length = 6`, sem
exigência de complexidade — é por isso que **subir o tamanho mínimo de senha rende mais aqui do que
qualquer teto**, e continua sendo a recomendação barata do §4.

⚠️ **E o mesmo número tem um lado operacional que ninguém mediu:** 30 sign-ins/5 min **por IP**, num
dia de prova em que um local inteiro de aplicação sai pelo mesmo NAT. O teto das nossas EFs (5/15
min) é bem mais apertado e estoura antes, então ele é quem vai gerar o chamado primeiro — mas se o
do §2 for afrouxado, este passa a ser o próximo gargalo. Calibrar um sem olhar o outro é
desperdício.

🔵 **`Enable IP address forwarding` está DESLIGADO** (mesma tela). Ou seja: para os limites do
**Auth**, o IP é o que a plataforma determina, não um header que o cliente manda — os 30/5 min não
são contornáveis com `X-Forwarded-For`. ⚠️ **Isso NÃO responde pelo D3**: aquele toggle governa o
GoTrue, e as Edge Functions são outro runtime, que lê o header por conta própria. O Teste 3 continua
necessário.

*(Fonte: `Captura de tela de 2026-08-13 19-46-32.png`, não versionada. Os valores estão transcritos
acima de propósito — imagem em pasta de doc não é greppável e o `docs:conferir` não a lê.)*

**As três alavancas reais, em ordem de custo:**

1. ✅ **Dashboard → Auth → Rate Limits.** É a única coisa que age sobre o endpoint de token, e já
   está em vigor com os valores acima — **conferido, não ajustado**. Rever só junto com o §2, pelo
   motivo do parágrafo do NAT.
2. **CAPTCHA (Turnstile/hCaptcha).** O Supabase Auth suporta nativamente para signin/signup/recovery:
   liga-se no dashboard e o cliente passa `options.captchaToken`. É a forma sancionada de proteger o
   endpoint que não é nosso — e o mesmo token pode ser exigido pelas nossas EFs públicas, cobrindo
   §3 de quebra. Custo: uma dependência de terceiro no caminho do login, e um fluxo a mais para
   quebrar. **Não recomendo agora** — depois dos §2 e §3, e só se houver abuso medido.
3. **Subir `minimum_password_length`.** Contra força bruta rende mais que qualquer teto, e custa uma
   linha. ⚠️ Só vale para senhas **novas** — as existentes não são reavaliadas.

❌ **Rejeitado: rotear o login por uma EF nossa.** Poria a senha em claro passando por código nosso
e exigiria `service_role` para emitir sessão — trocar um risco medido por um bem maior. Não fazer.

---

## 5. ✅ O que rate limit nenhum resolveria — e que o dashboard já barra

> 🔵 **VERIFICADO EM PRODUÇÃO, 2026-08-13.** *Allow new users to sign up* **desligado** e *Confirm
> email* **ligado**. O encadeamento descrito abaixo **não é alcançável em produção** — era a hipótese
> que exigia confirmação, e ela caiu. Nada a fazer.
>
> **Fica escrito porque o mecanismo continua existindo**, e é ele que amarra a decisão: quem um dia
> religar o signup — para "facilitar o cadastro do fiscal", por exemplo — **reabre isto junto**, sem
> tocar em uma linha de código. O toggle não é preferência de UX; é a única coisa que segura o
> vínculo automático. ⚠️ E ele **não** vem do `config.toml`: um projeto Supabase novo nasce com
> signup aberto, então a recriação do projeto reabre o buraco em silêncio.
>
> Demonstrado no banco local em 13/08 (onde o signup está aberto), contra um cadastro **falso**
> criado para o teste: `POST /auth/v1/signup` devolveu sessão, `handle_new_user` preencheu
> `user_id` e concedeu o papel `colaborador`, e `get_meu_colaborador` devolveu CPF, telefone e chave
> PIX do alvo. O rastro foi removido (771 colaboradores e 15 contas antes e depois).

`config.toml` tem `enable_signup = true` e `enable_confirmations = false` — **valores de dev**. E
`handle_new_user` (migration `20260714201650`) roda **no INSERT** de `auth.users`: se o e-mail casar
com um colaborador de `user_id IS NULL`, ele **vincula o cadastro à conta nova e concede o papel
`colaborador`**.

Encadeando, contra os **504** cadastros em estado A que têm e-mail:

- Com confirmação **desligada**: `POST /auth/v1/signup` com o e-mail da vítima devolve sessão na
  hora → a conta já nasce vinculada → `get_meu_colaborador` entrega **CPF, endereço, telefone e
  dados bancários** daquela pessoa. É tomada de cadastro, não spam.
- Com confirmação **ligada**: o atacante não entra, mas a linha em `auth.users` é inserida do mesmo
  jeito e **o vínculo acontece**. O cadastro da vítima vai para o **estado C**, que por decisão
  documentada **não tem saída no app** — negação de acesso permanente, uma requisição por vítima.

🔴 **Ação imediata, antes de qualquer código: conferir no dashboard de produção se signup está
fechado e confirmação ligada** (é o passo 6 do bootstrap, e ele **não vem** do `config.toml`). Se
signup estiver aberto, isso passa à frente de tudo nesta análise. Fechar signup resolve os dois
cenários de uma vez: nenhum fluxo do app usa `supabase.auth.signUp` — `useAuth.signUp` existe e
**não tem chamador** (conferido: só aparece em mocks de teste).

⚠️ **Rate limit aqui seria o remédio errado.** Diminuiria a taxa de um ataque que não precisa de
taxa: uma requisição por vítima já causa o dano.

---

## 6. Onde a regra deve morar

Pelo §2 do `CLAUDE.md`: *"se a regra é um `if` no hook, ela ainda não existe"*. Aqui há uma nuance
que vale registrar, porque a resposta automática seria "põe no banco":

- **A decisão** (recusar com 429) tem de ficar na EF: é ela que fala HTTP, e é a **única porta** —
  as EFs usam `service_role`, então não há caminho de PostgREST paralelo a proteger. Uma trigger não
  tem como recusar "a sexta chamada" sem que alguém a chame.
- **A contagem** tem de ser **uma chamada só ao banco**, atômica e falhando fechado. É o que corrige
  D1 e D2 juntos, e é a única forma de o teto valer sob concorrência.

Ou seja: **uma RPC** — que é o que o §2 manda usar para "vários passos".

```sql
-- Esboço. Uma chamada: conta, insere e limpa, tudo na transação da função.
CREATE FUNCTION public.registrar_tentativa(
  p_escopo text,        -- 'acesso-publico', 'cadastro-publico', 'checagem-cpf'
  p_chave  text,        -- o IP, ou o alvo (hash de CPF/e-mail)
  p_max    int,
  p_janela interval
) RETURNS boolean       -- true = pode seguir; false = estourou
```

Três exigências que o corpo tem de cumprir, e cada uma responde a um defeito medido:

1. **`INSERT ... RETURNING` + `count` na mesma instrução** (CTE), nunca duas idas ao banco — D2.
2. **A EF trata exceção como bloqueio**, não como liberação — D1. O `error` da RPC **não** pode ser
   descartado.
3. **Retenção dentro da própria função** (`DELETE` do que é mais velho que a maior janela), para não
   depender de `pg_cron`, que este projeto não tem — D4.

E a chave passa a ser `(escopo, chave)`, o que permite as duas dimensões do D5 e reaproveita a mesma
tabela para as portas do §3 — sem tabela nova por função, que multiplicaria o orçamento do atacante
pelo número de funções (o erro que o desenho de 20/07 já teve o cuidado de evitar).

⚠️ **Não guardar CPF nem e-mail em claro nesta tabela.** Ela viraria um registro de "quem tentou
entrar", que hoje não existe. Chave por hash resolve, e a tabela não precisa ser legível por
ninguém — ela já nasce sem GRANT para `anon`/`authenticated`, e isso tem de continuar.

---

## 7. Ordem proposta

**Passo 0 — ✅ COMPLETO em 2026-08-13.** As três medições que decidiam o desenho:

| O que se mediu | Resultado |
|---|---|
| ~~De onde vem o IP numa EF de produção; é forjável? é o mesmo para todos?~~ | ✅ IP real do cliente, **não** forjável — ver D3 |
| ~~Dashboard: signup fechado? confirmação ligada?~~ | ✅ fechado e ligada — §5 não se aplica |
| ~~Dashboard → Auth → Rate Limits: os valores em vigor~~ | ✅ transcritos no §4 |

⚠️ **Um dado que o passo 0 entregou de brinde e muda a calibração:** a tabela de produção tinha
**2 linhas no total**, ambas de teste meu. Nenhum colaborador real passou por "Estou sem minha
senha" desde que o site subiu. Ou seja: **não há tráfego real para calibrar teto nenhum**, e
qualquer número escolhido agora é chute informado até a primeira convocação. Isso rebaixa o D4
(a tabela cresce a passo de tartaruga) e reforça o item de observabilidade do §9 — sem contar 429,
não há como saber depois se o teto está apertado demais.

**Passo 1 — consertar o que existe** (D1–D4): a RPC do §6, as duas EFs passando a usá-la, retenção
dentro dela. Nenhuma mudança de comportamento visível quando tudo funciona; muda o modo de falhar.

**Passo 2 — tapar as portas do §3.** `public-create-colaborador` com o teto **mais apertado** de
todos (escreve PII e envia e-mail); `check-cpf-colaborador` com o mais folgado. Mesma RPC, escopos
diferentes.

**Passo 3 — cooldown por ALVO na `reivindicar-acesso`**, espelhando o que a `recuperar-senha` já faz
por conta. Sem ele, quem rotaciona IP bombardeia uma pessoa específica. ⚠️ A resposta ao cliente
**não pode mudar** por causa do cooldown: a assimetria CPF/e-mail documentada em
[`../estrutura/transversais/auth-e-permissoes.md`](../estrutura/transversais/auth-e-permissoes.md)
é deliberada, e um 429 novo num caminho onde hoje não há vazaria informação.

**Passo 4 — o login (§4),** e só o que for de dashboard/senha. Captcha fica para quando houver abuso
medido.

## 8. Como verificar — e por que a suíte não serve

🔴 **`npm test` não alcança nada disto.** Ela mocka o Supabase; um teste ali afirmaria o mock. E as
EFs rodam em Deno, fora do Vitest (`npm run test:ef` alcança, mas **não** exercita a concorrência,
que é o ponto de D2).

A verificação é **bateria SQL** (`docs/bateria-rate-limit.sql`, a criar), em transação com
`ROLLBACK`, com **controle positivo** — e aqui o controle positivo é metade do valor:

| Caso | Prova |
|---|---|
| N+1 chamadas em série → a última recusa | o teto existe |
| **N chamadas em PARALELO → no máximo N passam** | ✅ D2 corrigido (é o caso que o desenho atual reprova) |
| RPC indisponível → a EF **recusa** | ✅ D1 corrigido (falha fechada) |
| ⭐ **Após a janela, a chamada legítima PASSA** | controle positivo: não quebramos o acesso de quem tem direito |
| ⭐ **Dois IPs distintos não se atrapalham** | controle positivo: o teto é por chave, não global |
| Linhas fora da janela somem | a retenção roda |

⚠️ **E ninguém executa bateria sozinho** (`CLAUDE.md` §5): nem `npm test`, nem `docs:conferir`. A da
troca total ficou quebrada 2 dias sem ninguém notar. Se esta análise virar implementação, a bateria
precisa ser **rodada** no fechamento — "ela existe" não é "ela passa".

## 9. O que esta análise NÃO cobriu

- **Custo/cota**: não medi quanto de invocação de EF e de linha de tabela o plano Free aguenta. Se o
  teto for a defesa contra estouro de cota, o número dele deveria sair dessa medição.
- **Observabilidade**: hoje um 429 não é contável em lugar nenhum — não há como saber se o limite
  está apertado demais ou nunca dispara. Sem isso, calibrar é adivinhar. Conversa com o item "Error
  Tracking & Logs" do [`../backlog.md`](../backlog.md).
- **O `PasswordConfirmDialog`** (re-autenticação por senha, `src/components/PasswordConfirmDialog.tsx`):
  é força bruta contra a **própria** senha, com sessão válida. Não é ameaça; fica registrado só para
  não voltar como achado.
