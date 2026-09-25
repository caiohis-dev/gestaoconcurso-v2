# Versionamento — Regras de Git

Regras de trabalho com git neste repositório, adotadas em 2026-07-12, quando o projeto passou a ser versionado e o desenvolvimento da **versão 2** começou.

Contexto importante: o código da v1 rodou em produção por meses **sem nenhum versionamento** — o repositório foi criado só agora. O primeiro commit congela esse estado.

---

## Branches base — `main` e `dev`

Duas branches de vida longa, com papéis diferentes. Combinado em 2026-07-13.

**`main` é o estado publicado.** Ela recebe `dev` de uma vez no dia de uma subida, junto com o push do banco e a tag. Nenhuma branch de tema é mesclada em `main` no meio do caminho.

> 🔵 **O congelamento ACABOU em 2026-09-09.** Esta linha dizia que `main` ficava *"congelada em `v1.0.0`, e só volta a se mover no dia da subida da v2"*. `main` está em **`v2.0.0`**.
>
> ⚠️ **Mas leia como aconteceu, porque não foi como esta página descrevia** — e é isso que explica por que ela envelheceu: **o site subiu antes, a partir da `dev`.** `fevre.online` está no ar desde **13/08**, publicado de um build da `dev`, com a `main` intocada no commit inicial e 205 commits atrás. O ritual "merge + push do banco + tag, no mesmo evento" **não ocorreu naquele dia**. A `main` só alcançou a `dev` em **09/09**, quando as duas migrations do keep-alive foram para produção — e a tag `v2.0.0` nasceu aí, retroativamente, marcando o primeiro momento em que código e schema de produção coincidiram.
>
> **A lição, que vale mais que a correção:** a regra descrevia um evento único e a prática o partiu em três, com quase um mês entre as pontas. Se voltar a acontecer, **a doc é que está errada** — não force o ritual só para honrá-la.

**`dev` é a branch de integração** e a base do dia a dia. É de `dev` que saem as branches de tema e é para `dev` que elas voltam. Ela deve estar sempre em estado consistente (buildando, sem migration pela metade) — é ela que faz o papel que `main` normalmente faria.

```
                         site no ar (13/08)   main alcanca dev   1a release
                         a partir da DEV           (09/09)       incremental
                                                      │           (10/09)
main   ──●(v1.0.0)────────────────────────────────────●──────────●(v2.1.0)
           \                                         /(v2.0.0)  /
dev         ●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●●
             \    /       \  /       \  /                        │
feat/*        ●──●         ●●          ●●                  main == dev == prod
```

🔵 **Em 2026-09-10 as três coincidem pela primeira vez em repouso** — `main`, `dev` e o
schema de produção, todos em `f17a56f` / `v2.1.0`. A v2.0.0 levou um mês para alcançar
esse estado; a v2.1.0 nasceu já nele, porque foi a **primeira release incremental** —
merge, tag, `prod:push` e `deploy.sh` no mesmo evento, que é o ritual que esta página
descreve e que até então nunca tinha acontecido como descrito.

**Por que a `main` ficou congelada tanto tempo:** a v2 subiria como um bloco — banco novo, frontend novo, hospedagem nova (ver [`banco-producao.md`](./banco-producao.md)). Não existia subida incremental enquanto essa fundação não estivesse no ar, então `main` avançar a cada merge não significaria nada, e apagaria a única coisa que ela então significava: o retrato do que rodou (a v1).

**O que cada uma responde agora:** `main` volta a responder *"o que está publicado"* e `dev`, *"onde o trabalho está"*. É normal e esperado que `dev` fique à frente — o que **não** pode é `dev` ter migration ou mudança de frontend que produção não tenha, sem que isso vire uma subida consciente.

> 🔵 **Corrigido em 2026-09-09.** Aqui havia um ⚠️ afirmando: *"Hoje nenhuma das duas é a fonte do que está no ar — o site da v1 saiu do ar em 2026-07-12 e não há deploy ativo em lugar nenhum."* **Deixou de valer em 13/08**, quando `fevre.online` entrou no ar. Era exatamente o caso que o `CLAUDE.md` descreve: **aviso envelhecido é pior que aviso nenhum**, porque tem autoridade — este mandava tratar como "sem deploy" um sistema que já servia gente de verdade.

## Tags e versões

Versionamento semântico, com prefixo `v`:

- **`v1.0.0`** — o commit inicial, feito em 2026-07-12. É o ponto de retorno nomeado para "o começo do histórico", mas leia a ressalva abaixo antes de tratá-lo como "o que estava no ar".

  ⚠️ **`v1.0.0` não é um retrato fiel da produção da v1**, e nenhum commit pode ser. O git só foi adotado depois de duas limpezas irreversíveis já terem acontecido no disco: a remoção do Lovable (11/07) e a remoção do n8n (11/07, que levou junto o fluxo de recuperação de senha do admin). Esses arquivos não existem mais e não são recuperáveis. Além disso, o commit inicial já carrega a **fundação da v2** (as regras em `my_rules/`, os guardrails `prod:*`, as migrations de GRANT e dos cargos básicos, o `config.toml` de local). Ou seja: `v1.0.0` é *"a v1 já limpa, com a v2 engatilhada"* — não o binário que rodou em produção.
- **`v2.x.y`** — a v2 em diante. `MAJOR` para quebra de compatibilidade (schema/contrato), `MINOR` para funcionalidade nova, `PATCH` para correção.

  **`v2.0.0` nasceu em 2026-09-09**, no commit `e36fd87`, quando `main` alcançou `dev` e as duas migrations do keep-alive foram para produção. Não existe tag em `dev`.

  ⚠️ **A tag NÃO marca o dia em que o sistema foi ao ar.** O site subiu em 13/08, da `dev`, quase um mês antes. `v2.0.0` marca o primeiro momento em que **código, schema de produção e `main` coincidiram** — que é o que a tag precisa significar para servir de ponto de retorno. Quem procurar "o commit que foi ao ar em agosto" não vai achar tag nenhuma, e isso é fato, não descuido.

  **`v2.1.0` nasceu em 2026-09-10**, no commit `f17a56f`. É a **primeira release feita pelo ritual inteiro, na ordem certa e no mesmo evento**: merge `dev`→`main` (fast-forward, como na v2.0.0), tag, `prod:push` das 2 migrations, `deploy.sh`. Entregou a busca sob demanda de `/colaboradores` (com acento resolvido) e os totalizadores de `/provas` no modal.

  🔴 **A ordem foi BANCO ANTES DO SITE, e não é detalhe.** O bundle da v2.1.0 chama a RPC `totais_da_prova` e a coluna computada `colab_nome_busca`; publicar o site primeiro quebraria as duas telas na cara do usuário. Na ordem certa, o banco ganha dois objetos que o bundle antigo simplesmente não usa — inofensivo. **Medido antes de começar**, com duas requisições de leitura e sem linkar: `PGRST202` para a RPC e `42703` para a coluna, os dois virando `42501 permission denied` depois do push. Um `200` ali teria sido notícia ruim: significaria que o `REVOKE` de `anon` não pegou.

⚠️ **Entre a v2.1.0 e a v3.0.0 houve cinco releases que este arquivo não registrou** — `v2.1.1`, `v2.2.0`, `v2.3.0`, `v2.4.0` e `v2.5.0`. Elas existem como tag e estão no ar; o que falta é a nota aqui. **Não deduza o histórico desta lista** — `git tag --sort=-creatordate` é a fonte.

- **`v3.0.0` nasceu em 2026-09-19**, no commit `ebfa19a`, sobre o `checkpoint/pre-v3` (`8acc748`, a v2.5.0). Entregou o **módulo Editais v3** — 26 migrations, capítulos e artigos como registros próprios, o edital padrão clonável — e o **vínculo colaborador↔conta no login**. MAJOR pela escala e pela nomenclatura que o próprio checkpoint já usava, não por quebra de compatibilidade: as migrations são aditivas.

  🔴 **Banco antes do site, de novo, e por margem maior:** o bundle fala com 13 tabelas e várias RPCs que produção não tinha. Medido antes e depois, sem adivinhar: `edital_capitulos` respondia **PGRST205** (não existe) e passou a **42501** (existe, `anon` barrado) — um **200** ali teria sido notícia ruim, significaria `anon` lendo dado. E o `prod:diff` depois do push saiu **vazio**, exceto `pg_net`, que é extensão da plataforma e não se toca.

  ⚠️ **Subiu sem backup novo**, por decisão do usuário; o mais recente era o de 16/09. Fica registrado porque o Free não tem backup automático nenhum.

- **`v3.7.4` nasceu em 2026-09-24**, no commit `5ea3d29`. PATCH: as recusas do banco passaram
  a chegar à pessoa. No `ColaboradorDialog`, as **12** CHECKs de `colaboradores` ganharam frase
  que nomeia o campo (`mensagemRecusaCheck`); até ali só a duplicidade era traduzida. No
  `PerfilColaborador`, a frase `P0001` das RPCs — que a tela **descartava** — passou a aparecer, e
  a CHECK bancária deixou de ir crua. 🟢 **Só frontend** — `git diff v3.7.3..dev -- supabase/`
  vazio. Ritual curto: `git fetch . dev:main` → tag → push → `deploy.sh`. **Verificado ao vivo:**
  hash servido idêntico ao buildado (`index-C9d7YD-m.js`) e as frases novas presentes no bundle.

- **`v3.7.3` nasceu em 2026-09-24**, no commit `ae67258`. PATCH: o rate limit do escopo `acesso`
  (`reivindicar-acesso` + `recuperar-senha`) passou de **5/15 para 5/10 min**, e o 429 dele ganhou
  frase fixa — *"Sistema com excesso de acessos. Tente novamente após 10 minutos."* —, na EF e no
  `ReivindicarAcessoCard`, que escreve a própria. Decisão do usuário: o teto conta **toda**
  requisição, e folgar a janela foi preferido a um botão de "reenviar convite", que daria mais
  trabalho ao coordenador. Junto, um texto novo do usuário no link de correção de e-mail do
  `ColaboradorDialog`. 🟡 **Sem banco, mas COM Edge Function** — o helper é `_shared/`, então as
  duas EFs que o importam precisaram de `functions deploy`; só o `deploy.sh` teria deixado produção
  em 15 min com a tela prometendo 10. Ritual: `git fetch . dev:main` → tag → push → `functions
  deploy` das 2 (rodado pelo usuário com `!`) → `deploy.sh`. **Verificado ao vivo:** `functions list`
  com `reivindicar-acesso` v12 e `recuperar-senha` v11 recém-publicadas, hash servido idêntico ao
  buildado (`index-CdmljvKi.js`) e a frase nova presente no bundle publicado.

- **`v3.7.2` nasceu em 2026-09-24**, no commit `1a8a43a`. PATCH: o `ColaboradorDialog` (Novo/Editar
  Colaborador de `/colaboradores`) deixou de fechar por clique fora, em modo nenhum — antes só o
  `publicMode` barrava, e fechar descartava o preenchimento calado. 🟢 **Só frontend.** Ritual curto:
  `git fetch . dev:main` → tag → push → `deploy.sh`. Verificado: hash servido idêntico ao buildado
  (`index-sThWJBSr.js`).

- **`v3.7.1` nasceu em 2026-09-24**, no commit `91abf7e`. PATCH: `/gerenciar-usuarios` mostrava
  "Sem nome" para as contas nascidas pelo convite de colaborador (o `generateLink` não manda
  metadado, e `profiles.full_name` fica nulo — 40 de 58 no local); a tela passou a cair no nome do
  cadastro de colaborador. 🟢 **Só frontend** — conferido `git diff v3.7.0..dev -- supabase/`
  vazio antes de decidir. Ritual curto: `git fetch . dev:main` → tag → `deploy.sh`. **Verificado ao
  vivo:** hash idêntico ao buildado (`index-CudCxYiE.js`), **0** `127.0.0.1`, **8** de produção, e
  a consulta nova (`user_id, colab_nome_completo`) presente no bundle publicado.

- **`v3.7.0` nasceu em 2026-09-24**, no commit `92aa413`, horas depois da v3.6.0. Entregou a
  **conta de sistema nascendo de colaborador**: a EF `create-admin` (senha escolhida pelo admin, e
  que **sobrescrevia a senha** de quem já tinha conta) virou `conceder-papel-sistema`, e o
  colaborador promovido a financeiro passou a ver o hub. MINOR.

  🔴 **Banco antes do site, EF antes do site, e a EF velha apagada só DEPOIS do site** — o bundle
  anterior ainda chamava a `create-admin`. Ritual: commit → `git fetch . dev:main` → tag → `link` →
  `prod:push:dry` (1 migration, a esperada) → `prod:push` → `functions deploy
  conceder-papel-sistema` → prova ao vivo → `deploy.sh` → `functions delete create-admin` →
  `prod:unlink`. Sem `prod:diff` desta vez: a única migration só troca a CHECK de `origem` da
  trilha por um superconjunto — **nenhuma linha escrita**, e o re-ADD valida as existentes, que
  cabiam na regra mais estreita.

  ⚠️ **Subiu sem backup novo**; o mais recente é o de 16/09. Risco sobre dado: nulo pelo
  desenho da migration.

  **Verificado ao vivo:** a função nova responde **401** sem header e **401 "Não autenticado"**
  com a anon key (o caso que prova que `verify_jwt` não autoriza); hash do bundle publicado
  idêntico ao buildado (`index-DZL3IeA6.js`), **0** `127.0.0.1`, **8** do projeto de produção,
  `conceder-papel-sistema` presente e `create-admin` **ausente** no bundle; e a `create-admin`
  passou a responder **404** em produção. ⚠️ O ramo do convite (conta nascendo pela EF) **não** foi
  exercitado nem local nem em produção — ele envia e-mail real.

- **`v3.6.0` nasceu em 2026-09-24**, no commit `0c81276`. Entregou o **módulo Financeiro** (gerador
  de remessa CNAB 240/PIX, importado de um projeto separado — ver
  `estrutura/modulos/financeiro/00-modulo.md`): papel `financeiro` (só superadmin+financeiro, o
  único módulo a que `admin` comum não acessa), ~950 linhas de lógica portadas com 73 testes, e a
  UI real (upload → correspondência de colunas → validação/geração) — 78 testes novos nos arquivos
  `financeiro-*` (71 da lógica pura, 5 da tela, 2 de uma correção de parser no mesmo dia), além do
  que `guards.test.tsx` ganhou na Fase 1 para cobrir o papel. MINOR, seguindo a regra
  escrita (MAJOR é só para quebra de contrato/schema) — decisão explícita do usuário de não abrir
  exceção, mesmo sendo módulo novo (o único precedente de módulo virar MAJOR, a v3.0.0, foi por
  **escala**, não por ser módulo novo).

  🔴 **Banco antes do site:** 2 migrations (enum `app_role` + `has_role` estendida). Ritual
  completo: commit → push `dev` → `git fetch . dev:main` → tag → `link` → `prod:push:dry` (2
  migrations, as esperadas) → `prod:push` → `prod:diff` (só o drop conhecido do `pg_net`) →
  `prod:unlink` → `deploy.sh`.

  ⚠️ **Subiu sem backup novo**, por decisão do usuário; o mais recente é o de 16/09. A migration é
  puramente aditiva (enum + função), risco baixo.

  **Verificado ao vivo:** hash do bundle publicado idêntico ao buildado (`index-B_paDCJl.js`), **0**
  ocorrências de `127.0.0.1`, **4** da URL de produção, e o texto "Geração de remessas de pagamento"
  (a descrição da tela `/financeiro`) presente 2× no bundle publicado.

- **`v3.5.0` nasceu em 2026-09-23**, no commit `2ec0634`, poucas horas depois da v3.4.0. Entregou a renomeação do rótulo "Resultado" (pouco claro — resultado de quê?) para **"Situação do colaborador"** em Nova Ocorrência, e **ordenação clicável (asc/desc)** nas seis colunas de "Registro de Ocorrências" — mesmo padrão visual de `/colaboradores`, via `SortableTableHead` (`src/components/SortableTableHead.tsx`), extraído para as duas telas compartilharem. MINOR: funcionalidade nova, sem quebra.

  🟢 **Release SÓ DE FRONTEND — nenhuma migration.** Ritual mais curto: sem `link`/`prod:push:dry`/`prod:push`/`prod:diff`/`prod:unlink`, só commit → `git fetch . dev:main` → tag → push → `deploy.sh`. Vale checar `git status` das migrations antes de assumir que uma release precisa do banco — nem toda uma precisa.

  ⚠️ **Um bug meu foi pego pelo próprio checklist, antes de eu considerar a tarefa pronta.** A ordenação usava um `useMemo` colocado DEPOIS dos `return` condicionais do componente — violação de Rules of Hooks. Só apareceu porque medi o lint com `git stash` contra o baseline (CLAUDE.md §5) em vez de olhar só "subiu ou não subiu o total". Corrigido movendo a lógica pura para fora do componente e o hook para antes de qualquer `return`.

  **Verificado ao vivo:** hash do bundle publicado idêntico ao buildado (`index-BgcWsKGf.js`), **0** ocorrências de `127.0.0.1`, e o texto "Situação do colaborador" presente no bundle em produção.

- **`v3.4.0` nasceu em 2026-09-23**, no commit `20f7ba0`. Entregou **falta em Nova Ocorrência remove o colaborador da lista de trabalhadores da prova** (Aplicação de Provas) — terceiro estado ao lado de "substituído", e dois RPCs transacionais novos (`registrar_ocorrencia_colaborador` / `excluir_ocorrencia_colaborador`) que também corrigem um defeito latente na substituição (SELECT+INSERT+DELETE soltos, sem transação). MINOR: tudo aditivo.

  🔴 **Achado no caminho:** `GRANT EXECUTE ... TO authenticated` sozinho **não** impede `anon` de chamar uma função nova — o `ALTER DEFAULT PRIVILEGES` de `20260908231620` não segura isso, ao contrário do que aquela migration prometia. Os dois RPCs levam `REVOKE ALL ... FROM PUBLIC` explícito; achado e conserto documentados em [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md).

  Ritual: commit → `git fetch . dev:main` → tag → `link` → `prod:push:dry` (1 migration, a esperada) → `prod:push` → `prod:diff` (só o drift conhecido do `pg_net`) → `prod:unlink` → `deploy.sh`. ⚠️ **`prod:diff` precisou de `supabase stop`/`start` do ambiente local antes/depois** — ele sobe um banco "sombra" na mesma porta (`54320`) que o Supabase de dev já ocupa, e os dois colidem.

  **Verificado ao vivo:** hash do bundle publicado idêntico ao buildado (`index-Csm9DuJi.js`), **0** ocorrências de `127.0.0.1`, e `registrar_ocorrencia_colaborador` presente no bundle publicado — prova de que o RPC novo (não só a migration) chegou a produção.

- **`v3.3.0` nasceu em 2026-09-21**, no commit `47d1aa2`. Entregou a **trilha de envio do link** (`log_envio_link_acesso`) e o conserto do **`padStart` antes do `length`** — o defeito fixo em 02/08 só na `check-cpf-colaborador` sobrevivia idêntico em `reivindicar-acesso`, `incluir-email-cadastro` e `public-create-colaborador`. MINOR (uma feature + um fix, sem quebra de contrato).

  🔴 **Release de BANCO + EDGE FUNCTIONS, sem site** — e desta vez a checagem foi feita corretamente: nenhum `src/` mudou neste lote (diferença do que aconteceu na v3.2.0, quando eu errei essa mesma verificação). `deploy.sh` republicaria o mesmo bundle de sempre; quem entrega o conserto são as 6 Edge Functions.

  **Verificado ao vivo, sem efeito colateral:** a `check-cpf-colaborador` (a única das 6 sem escrita nem e-mail) foi chamada em produção com a entrada de 9 dígitos que colidiria com o CPF de outra pessoa — devolveu **400 "CPF inválido"** — e com um CPF de 11 dígitos normal, que continuou respondendo **200**. É o controle positivo e o negativo, na própria produção.

  Ritual: `git fetch . dev:main` (a árvore tinha 8 arquivos soltos de outras sessões, de novo) → tag → link → `prod:push:dry` (1 migration, a esperada) → `prod:push` → `prod:diff` (só o drift conhecido do `pg_net`) → `functions deploy` das 6 → prova ao vivo → `prod:unlink`.

- **`v3.2.0` nasceu em 2026-09-20**, no commit `f6136f4`. Entregou o **edital padrão COMPLETO** (rodadas 15 a 19 — 19 capítulos, 377 artigos) e o conserto do **"Último Acesso"**, que estava sem escritor desde 15/07 e descrevia errado **263 de 263** pessoas em produção. MINOR: tudo aditivo.

  🔴 **O site FOI publicado depois, no mesmo dia, pelo usuário** — corrigindo uma leitura errada
  minha logo após o `prod:push`: eu tinha concluído "release de banco apenas" olhando só a
  natureza das migrations, sem conferir o diff de `src/`. A rodada 15 do edital trazia código de
  app junto — `useInscricao` passou a ler `regras_vista_prova.email_solicitacao` + interstício, e
  `useCamposDoEdital` passou a resolver dois marcadores novos, `{{campo:email_vista_folha}}` e
  `{{campo:intersticio_vista_horas}}`. Sem o site, esses dois apareceriam como
  `[?campo:email_vista_folha]` nos capítulos 15 a 19 — visível, não silencioso, mas incompleto.

  **`deploy.sh` rodado pelo usuário, em `~/dev/configura_server_gestaoconcurso`. Conferido depois:**
  hash do bundle no ar **idêntico** ao buildado localmente (`index-Db8QuKdJ.js`), `last-modified`
  batendo com o horário do build, HTTPS 200, gzip ligado, HTTP→HTTPS 301, **0** ocorrências de
  `127.0.0.1` no bundle e 4 do projeto de produção, logo 200, e o marcador `email_vista_folha`
  presente no bundle — a lacuna fechou.

  **A lição:** *"o site não precisa subir"* é conclusão que se **confere no diff de `src/`**, não se
  deduz da natureza da migration.

  ⚠️ **A árvore tinha 8 arquivos soltos de outras sessões** (notas, um symlink para `seguranca/`, um roadmap de monitoramento). A `main` foi avançada com `git fetch . dev:main`, **sem checkout** — o truque de 09/09, registrado mais abaixo. Nada foi commitado por engano.

  🔴 **O symlink `my_rules/seguranca` → `../seguranca` NÃO é pego pelo `.gitignore`** (a regra é `seguranca/`, e o symlink não tem barra). Um `git add .` comitaria notas de pentest. Adicione arquivo por arquivo, sempre.

- **`v3.1.0` nasceu em 2026-09-19**, no commit `c9d1dff`, poucas horas depois da v3.0.0. Entregou o **autosserviço de e-mail** (o colaborador sem `colab_email` informa o próprio — 🔴 **sem prova de posse, dívida assumida**, ver `analises/dividas-auth-colaborador.md` §5), o conserto de **três becos sem saída** da rota de acesso e as rodadas 13–14 do edital padrão. MINOR: tudo aditivo.

  🔴 **A ordem teve um degrau a mais que as anteriores: banco → EDGE FUNCTIONS → site.** O bundle novo posta em `incluir-email-cadastro`, que **nasceu nesta release**; publicar o site antes da EF daria 404 no formulário, e publicar a EF antes da migration a faria quebrar na RPC. Medido antes e depois: `log_email_autoinformado` ia de **PGRST205** para **42501**, e as duas funções novas respondem `permission denied` ao `anon` — o `REVOKE` pegou.

Crie a tag no commit que efetivamente entrega a versão, com mensagem: `git tag -a v2.1.0 -m "..."`.

**A tag é o gatilho do banco de produção.** Combinado em 2026-07-12: o banco de produção só é atualizado em **versões estáveis** — nunca a cada migration ou a cada merge. Entre releases, as migrations se acumulam em **`dev`** e o schema de produção fica deliberadamente atrás do local. Por isso **código e migration da mesma versão sobem juntos**: nunca publique o frontend de uma versão cujo schema ainda não subiu. O roteiro está em [`banco-producao.md`](./banco-producao.md).

> 🔴 **Corrigido em 2026-09-09: esta frase dizia que as migrations se acumulam em `main`.** Nunca foi verdade — elas se acumulam em **`dev`**, como o [`CLAUDE.md`](../CLAUDE.md) §6 e o [`banco-producao.md`](./banco-producao.md) sempre disseram, e como a prática confirma (`main` passou 205 commits parada enquanto as migrations entravam em `dev`). É o segundo tipo de erro que o `CLAUDE.md` manda distinguir: não é *"era verdade e mudou"*, é *"nunca chegou a ser verdade"* — e esse é o que faz alguém mesclar em `main` para "acumular migration lá".

## Mensagens de commit

**Conventional Commits, com a descrição em português.**

```
<tipo>(<escopo opcional>): <descrição no imperativo, minúscula, sem ponto final>

<corpo opcional: o porquê da mudança, não o que ela faz — isso o diff já mostra>
```

Tipos em uso:

| Tipo | Quando |
|---|---|
| `feat` | funcionalidade nova para o usuário |
| `fix` | correção de bug |
| `refactor` | mudança de código sem alterar comportamento |
| `docs` | só documentação (inclui `my_rules/`) |
| `chore` | build, dependências, configuração, tooling |
| `test` | testes automatizados (Vitest + React Testing Library) |
| `db` | migration nova (ver a seção de migrations abaixo) |

O escopo, quando existir, é o **módulo** ou o **domínio** — os mesmos nomes de [`estrutura/`](./estrutura/). Módulos: `editais`, e as áreas de Aplicação de Provas (`colaboradores`, `provas`, `alocacao`, `ocorrencias`, `documentos`). Transversais: `auth`, `arquitetura`, `local`.

Exemplos reais do que vem por aí:

```
feat(ocorrencias): refatora diálogo de nova ocorrência para wizard
fix(ocorrencias): remove vínculo em colaboradores_prova ao marcar falta
db: concede privilégios de tabela aos roles da API
chore: migra hospedagem do Lovable para build estático
```

## Branches de trabalho

Branches **curtas**, criadas a partir de **`dev`** e mescladas de volta **em `dev`** assim que a mudança estiver pronta e verificada — nunca em `main`. Nomeie com o mesmo tipo do commit: `feat/wizard-ocorrencias`, `fix/falta-colaborador`, `db/reconciliacao-prod`.

Trabalho de uma sessão que já nasce pronto pode ir direto em `dev` — o objetivo da branch é isolar mudança que fica dias em aberto ou que pode não dar certo, não criar cerimônia.

A regra prática, se houver dúvida: **`git checkout main` só acontece no dia de uma subida.** Em qualquer outro dia, sair de uma branch de tema significa voltar para `dev`.

💡 **E talvez nem no dia da subida.** Em 09/09 a `main` foi avançada **sem checkout**, com `git fetch . dev:main` — porque a árvore tinha 19 arquivos com alteração pendente, e trocar de branch com trabalho solto é onde se perde coisa. O `fetch` só atualiza a referência: **recusa** se não for fast-forward (ao contrário de `git branch -f`, que sobrescreveria calado) e não encosta na árvore de trabalho.

## Migrations — a regra inegociável

**Nunca edite uma migration já aplicada.** Mudança de schema é sempre um **arquivo novo** em `supabase/migrations/` (gere o nome com `npx supabase migration new <slug>`, que já cuida do timestamp).

Isso vale inclusive para desfazer algo: para remover uma tabela criada por uma migration antiga, escreva uma migration nova com `DROP` — não apague nem edite o `CREATE` original. Qualquer banco que já aplicou o arquivo antigo (produção, a máquina de outra pessoa) não vai reaplicar a versão editada, e o histórico deixa de reproduzir o schema.

Precedente no repo: `20260711230647_drop_colaboradores_backup_20260701.sql` removeu uma tabela sem tocar na migration que a criou.

🔵 **A ressalva do drift DEIXOU DE VALER para a produção da v2 (corrigido em 2026-09-09).** Aqui se lia: *"as migrations não reproduzem fielmente a produção — o schema de prod foi construído pelo dashboard do Lovable, então existe drift. 'Funciona em produção' é evidência fraca de que as migrations estão corretas."*

Isso descrevia o projeto da era Lovable (`dqslqfzqukcahogkieet`), que está congelado e fora do caminho. **A produção da v2 (`zugigdpuxbpogoepdawm`) nasceu de `db push` das 122 migrations** e teve o dado conferido por controle positivo de 12 contagens — não há drift a suspeitar nela. Confirmado de novo em 09/09: o `prod:push:dry` listou **exatamente** as 2 migrations pendentes, nem uma a mais, que é o que se espera de um banco reproduzido pelas migrations.

⚠️ **O que continua verdade** é a origem do *schema* — ele veio do dashboard, e é daí que vêm os `CASCADE` por omissão (ver `CLAUDE.md` §2). E segue valendo, por outro motivo, que **"funciona em produção" não prova que a migration está correta**: a suíte mocka o Supabase e não exercita RLS, GRANT, constraint nem trigger. Quem prova isso é o `db reset` do zero mais bateria SQL.

## O que nunca é versionado

As regras estão no [`.gitignore`](../.gitignore); o motivo está aqui, porque o custo de errar é alto:

- **Segredos.** Qualquer `.env*` (exceto os templates `.env.example`). As chaves do Supabase de produção vivem nesses arquivos.
- **Dados reais.** `supabase/seed.local.sql` e qualquer `seed_*.sql`, `*.dump`, `*.sql.gz` carregam o dump de produção — CPF, PIS, conta bancária, chave PIX de colaboradores reais e hashes de senha. **Um vazamento desses é incidente de dados pessoais, não um deslize de repositório.** O banco local, por conter esses dados, merece o mesmo cuidado que produção.
- **Estado local.** `node_modules`, `dist`, `supabase/.temp`, `supabase/.branches`, `.claude/settings.local.json`.

Antes de um commit grande, vale um `git status --short` de conferência — e desconfie de qualquer arquivo que você não reconheça.

## Documentação anda junto com o código

Mudança que toca um domínio atualiza o `estrutura/*.md` correspondente **no mesmo commit** — não em um commit `docs:` posterior, que na prática nunca vem. A documentação em [`estrutura/`](./estrutura/) é a fonte canônica da arquitetura; se ela mente, ela vira dívida.

Trabalho concluído sai do [`backlog.md`](./backlog.md) (que é uma lista *futura*; o histórico do que foi feito vive no git e nos docs de estrutura).
