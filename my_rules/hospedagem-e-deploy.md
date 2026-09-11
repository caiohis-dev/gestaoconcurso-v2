# Hospedagem e Deploy do Frontend

Como o gestaoconcurso vai ao ar. Par de [`banco-producao.md`](./banco-producao.md), que cobre o **banco**; este cobre o **site**. Nenhum dos dois basta sozinho: uma release sobe os dois, no mesmo evento.

> 🔵 **Estado em 2026-08-13: O SITE ESTÁ NO AR.** Medido, não presumido: `https://fevre.online` responde **200** por nginx sobre **HTTP/2 com TLS válido**, servindo o build (`<title>FEVRE - Sistema de Cadastro de Colaboradores</title>`), e o bundle publicado aponta para **`https://zugigdpuxbpogoepdawm.supabase.co`** com a publishable key `sb_publishable_mN1jgi…` — a de `.env.production`. Ou seja: **site de produção falando com o banco de produção**, e a armadilha do `.env` da raiz (que aponta para o Docker local) **não mordeu**.
>
> O deploy foi executado em outra sessão; o ferramental vive fora deste repo, em `configura_server_gestaoconcurso`. 🟢 **O secret `SITE_URL` e as redirect URLs — que ficaram como ressalva aqui desde 13/08 — foram CONFIRMADOS em 2026-09-09**, por uma recuperação de senha real: o e-mail chegou com o visual da FEVRE e o link abriu `fevre.online/redefinir-senha`.
>
> *(Este bloco dizia, até 2026-08-13: "nada está no ar… o servidor ainda não foi provisionado e o DNS de `fevre.online` ainda não aponta para lugar nenhum".)*

---

## O modelo

**Servidor Ubuntu 24.04 próprio, nginx servindo o build estático, público, com TLS do Let's Encrypt.**

```
navegador  ──HTTPS/443──►  nginx  ──►  APP_DIR/dist   (servidor Ubuntu)
    │                                   ▲
    └──────────────────────────────►  Supabase (nuvem)
                                        │ rsync do build
                                   sua máquina (faz o build)
```

Três consequências que definem tudo o mais:

1. **O servidor não tem Node, npm nem código-fonte.** O build acontece na sua máquina; só a pasta `dist/` viaja. O "backend" é o Supabase — não há processo de aplicação rodando lá.
2. **O site é público.** Não dá para escondê-lo atrás de VPN ou túnel: `/cadastro-publico` existe para quem ainda não tem conta, e o link de recuperação de senha chega por e-mail e precisa abrir no navegador de quem recebeu.
3. **Publicar o frontend é UM dos nove passos** de subida da v2. Os outros oito são de banco e estão em [`banco-producao.md`](./banco-producao.md).

### Alternativas descartadas

**Vercel/Netlify** (o que o backlog supunha até 2026-08-08): funcionariam, mas o projeto já tem servidor próprio no horizonte e a conta de um PaaS a mais não se justificou.

**Acesso só por túnel SSH**, sem exposição pública: é o modelo padrão do ferramental de origem, e foi **rejeitado com motivo** — cada fiscal precisaria de conta no servidor e chave SSH cadastrada só para abrir a tela de login.

---

## Onde vive o ferramental

🔴 **Fora deste repositório**, em `configura_server_gestaoconcurso` (decisão de 2026-08-08). Ele é um fork dedicado de `configura_server_agnostico`, e contém **cinco** scripts (`01-hardening.sh`, `02-app.sh`, `04-tls.sh`, `05-keep-alive.sh`, `deploy.sh`), os dois templates de nginx e o `config.env`.

> ⚠️ **Esta linha dizia "os quatro scripts" e omitia o `05-keep-alive.sh`** — corrigido em 2026-09-10. Ele nasceu em 08/09, junto com a mitigação da pausa por inatividade, e é o que instala o cron diário no servidor. Quem recriar o servidor seguindo a lista antiga sobe tudo menos o keep-alive, e a falha é **silenciosa**: só aparece 7 dias depois, com o projeto pausado. Ver [`banco-producao.md`](./banco-producao.md).

**Este repositório não versiona infraestrutura.** A fronteira é deliberada: aplicação de um lado, servidor do outro. O preço é que publicar exige os dois repositórios **lado a lado na mesma máquina** — o `deploy.sh` acha o projeto pelo `PROJETO_DIR` do `config.env`, que hoje vale `"../gestaoconcurso"`, resolvido a partir da raiz do ferramental.

> ⚠️ **Esta linha mandava copiar a pasta `server_setup/` para dentro deste repo no dia do deploy** — corrigido em 2026-09-10, conferindo o script. O `deploy.sh` diz no próprio cabeçalho que roda *"na SUA máquina, de qualquer diretório"*, e o comentário dele explica por que NÃO faz `cd $SCRIPT_DIR/..`: o ferramental é bash puro, sem `package.json`, então subir um nível cairia num diretório onde o `npm` não tem o que rodar. **Seguir a instrução antiga duplicaria o ferramental dentro do repo da aplicação — exatamente o que a decisão de 08/08 removeu.**

⚠️ Até 2026-08-08 havia um `server_setup/config.env` solto neste repo, com os valores de **exemplo** do ferramental genérico (`BIND_APP`, `/var/www/configura-server`). Foi removido: config obsoleta de infraestrutura, dentro do repo da aplicação, é a pior combinação — parece pronta e não é.

---

## O procedimento

O detalhe de cada etapa está no guia de setup do repositório do ferramental (my_docs/setup-seguro.md, lá — **não** aqui; por isso sem link). Resumo do que acontece:

| Etapa | Onde | O que faz |
|---|---|---|
| 1 | servidor, como root | usuário + chave, sshd endurecido, UFW (22/80/443), fail2ban |
| 2 | servidor | nginx; o site sobe **em HTTP** |
| 3 | servidor | certbot (webroot): confere DNS, emite o certificado, troca para HTTPS |
| 4 | **sua máquina** | build + gate do bundle + rsync do `dist/` |

A etapa 4 é a única que se repete: é ela o "deploy" do dia a dia.

**Pré-requisito que não é do ferramental:** o DNS de `fevre.online` precisa apontar para o IP do servidor **antes** da etapa 3. O Let's Encrypt valida na hora, e tem rate limit semanal por domínio — erro de DNS queima tentativa.

---

## 🔴 O erro que este deploy mais pode causar

**O build embute as variáveis `VITE_*` em tempo de compilação.** Se o Vite ler o `.env` errado, o bundle sai apontando para o Supabase **local**: a página carrega, mostra a tela de login e falha em toda requisição. O deploy não acusa nada.

Medido em 2026-08-08, com o repositório no estado em que estava: o build saiu com `http://127.0.0.1:54321` **7 vezes** e com a chave anon local **11 vezes**.

Duas coisas protegem contra isso:

1. **O `.env.production`**, na raiz deste repositório, com os valores de produção:

   ```
   VITE_SUPABASE_URL="https://<ref>.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
   ```

   ⚠️ **`.env.production` vence o `.env.local`** — medido, e é o contrário do que a intuição sugere. E **não** precisa de `--mode production`: o `vite build` já roda em modo production. O `.gitignore` cobre `.env.*`; não versione.

2. **O gate do `deploy.sh`**, que confere o **bundle** (não o `.env`) e recusa enviar se achar a URL ou a chave locais. Só o bundle diz o que foi realmente embutido — a precedência entre arquivos `.env` é justamente o que engana.

---

## 🔴 O domínio está hardcoded no aplicativo

`fevre.online` não é só configuração de servidor. Está no código:

- [`supabase/functions/_shared/enviar-link-acesso.ts`](../supabase/functions/_shared/enviar-link-acesso.ts) — `https://fevre.online/fevre-logo.png` no cabeçalho do e-mail;
- `_shared/transactional-email-templates/atualizacao-dados.tsx` — `siteUrl: 'https://fevre.online/auth'` e o mesmo logo.

Disso decorrem duas obrigações:

- **`/fevre-logo.png` tem de responder por HTTPS no domínio.** Ele vem de `public/` no build. Se o caminho quebrar, o logo some em **todo** e-mail transacional e nada no sistema denuncia.
- **Trocar de domínio mexe em quatro lugares:** os dois arquivos acima, o `config.env` do ferramental, e o secret `SITE_URL` + as redirect URLs do Auth (passos 6 e 7 de [`banco-producao.md`](./banco-producao.md)).

---

## ⚠️ Tudo que está em `public/` vira URL pública

O Vite copia `public/` inteiro para o `dist/`, e o nginx serve o `dist/`. Antes de publicar, olhe o que há ali.

Em 2026-08-08, `public/auth_users_export.csv` continha **uma linha de dado real** — UUID de conta do Auth, e-mail, nome e data do último login — e ficaria acessível em `https://fevre.online/auth_users_export.csv`. Ver [`estrutura/transversais/arquitetura-geral.md`](./estrutura/transversais/arquitetura-geral.md) §8.

---

## A ordem entre site e banco

⚠️ **Código novo e migration nova sobem juntos, na mesma release.** Nunca rode o deploy do frontend de uma versão cujo schema ainda não subiu: o frontend novo bate num banco velho e quebra em produção. É o corolário da regra "produção só é atualizada em versões estáveis" de [`banco-producao.md`](./banco-producao.md).

Na prática, no dia da release: **o `prod:push` do schema acontece antes** do deploy do frontend, e as edge functions junto. Não cito os números dos passos de lá de propósito — eles mudam, e referência por número envelhece calada.

---

## Verificar depois de publicar

⚠️ **Deploy sem erro não é deploy que funciona.** O rsync sempre sucede. O que falha depois é o app falando com o Supabase errado, o logo em 404, o HTML velho em cache.

```bash
curl -sI https://fevre.online | head -3                     # 200
curl -sI http://fevre.online | head -3                      # 301 para https
curl -sI https://fevre.online/fevre-logo.png | head -3      # 200 — o logo dos e-mails
```

E então **abra a aplicação e faça um login de verdade**. Depois, dispare uma recuperação de senha e confira que o link do e-mail aponta para `https://fevre.online/redefinir-senha`, e não para `localhost` — é a falha silenciosa descrita no passo 7 de [`banco-producao.md`](./banco-producao.md).
