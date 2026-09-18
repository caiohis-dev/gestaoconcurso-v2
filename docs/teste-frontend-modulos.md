# Bateria de teste manual — tela de entrada por módulos (hub)

Roteiro de teste manual da UI cobrindo o tema **tela de entrada por módulos** (etapas 1–6, 2026-07-24). Rode de cima a baixo. Cada bloco indica **o que valida**. Os blocos `A`–`E` se concluem; a seção **`F` (conferência perpétua)** não — ela guarda o que precisa ser reconferido a cada mexida no roteamento/header, e seus checkboxes ficam abertos de propósito.

O desenho e as decisões (D1–D5) estão em [`../my_rules/analises/concluidos/roadmap-modulos.yaml`](../my_rules/analises/concluidos/roadmap-modulos.yaml); o mecanismo em [`../my_rules/estrutura/transversais/arquitetura-geral.md`](../my_rules/estrutura/transversais/arquitetura-geral.md) §6 e a matriz papel × módulo em [`../my_rules/estrutura/transversais/auth-e-permissoes.md`](../my_rules/estrutura/transversais/auth-e-permissoes.md).

## Antes de começar

1. Rode com **Supabase local** (`sg docker -c 'supabase status'`) e o app (`npm run dev`).
2. Tenha à mão as 4 contas de teste: **admin**, **coordenador**, **gestor+colaborador** (um dos 13) e **colaborador sem gestão** (`user` + `colaborador` — o caso dos 40; ⚠️ "colaborador puro", com `role` nulo, **não existe** em produção). Tenha também uma conta **`user` puro** (só o papel `user`, sem `colaborador`) — é ela que vê o estado vazio do hub, e é o contraste que importa.
3. **Princípio a lembrar:** o hub e os links do header são **UX** — escondem, não barram. Um card ausente não é prova de que a rota está protegida; a barreira real é RLS + EFs + os guards de página. Se algo "aparece que não devia", é bug de UX; se algo "deixa fazer que não devia", é bug de autorização (outra camada).

---

## A. O hub por papel

- [ ] **A1** — Login como **admin** → cai em `/` e vê o hub com o card **Aplicação de Provas**.
- [ ] **A2** — Login como **coordenador** → cai em `/` e vê o card **Aplicação de Provas**.
- [ ] **A3** — Login como **superadmin** → vê o card **Aplicação de Provas**; no header, além dele, o link **Usuários** (fora dos cards).
- [ ] **A4** — Conta **`user` puro** (sem módulo) → hub com o **estado vazio**: "Nenhum módulo disponível. Fale com a administração." — não é erro.
- [ ] **A5** — **Colaborador puro** → **nunca** vê o hub: login o leva direto a `/perfil-colaborador`.
- [ ] **A6** — **Gestor+colaborador** (um dos 12) → cai no **hub** (a dimensão de gestão manda), e o header mostra **Meu Cadastro**.

## B. Navegação a partir do hub

- [ ] **B1** — Card **Aplicação de Provas** como **admin/superadmin** → botão "Entrar" leva a `/dashboard`.
- [ ] **B2** — Card **Aplicação de Provas** como **coordenador** → "Entrar" leva a `/colaboradores`.
- [ ] **B3** — Dentro do módulo, o header mostra **Início** (ícone de casa) → clicar volta ao hub (`/`).
- [ ] **B4** — Dentro do módulo, o subtítulo do header vira **"Aplicação de Provas"**; no hub, é **"Sistema de Cadastro"**.
- [ ] **B5** — Config geral aparece **em todo lugar**: **Usuários** (só superadmin) e **Meu Cadastro** (só quem tem a dimensão colaborador) estão no header tanto no hub quanto dentro do módulo.
- [ ] **B6** — Filtro por papel dentro do módulo: coordenador vê **Início + Colaboradores + Provas** (não vê Dashboard nem Unidades de Prova); admin/superadmin veem os 4 links.

## C. Rotas digitadas direto na barra

- [ ] **C1** — `/` deslogado → vai para `/auth`.
- [ ] **C2** — `/` como **colaborador sem gestão** (`user` + `colaborador`) → redireciona para `/perfil-colaborador` (cobre digitar a raiz na barra).
- [ ] **C3** — `/colaboradores` → abre a **lista de colaboradores** (a antiga home).
- [ ] **C4** — `/dashboard` como **coordenador** → o guard da página barra e joga em `/` → **cai no hub** (destino "barrado → lugar seguro", agora correto).
- [ ] **C5** — `/cadastro-publico` → segue **público e SEM Layout** (o header do sistema não aparece); o hub não a captura. **Este é o caso da pegadinha** `/cadastro` vs `/cadastro-publico`.

## D. O colaborador sem gestão (revisto em 2026-09-18)

> 🔵 Esta seção chamava-se "Regressão do colaborador puro (nada do fluxo dele mudou)" e valia para `role === null` — estado que o trigger `handle_new_user` torna inalcançável. Em 18/09 o fluxo passou a valer para quem tem `user` + `colaborador`, que são 40 contas; antes disso elas caíam no hub vazio.

- [ ] **D1** — Login do colaborador sem gestão → `/perfil-colaborador`, **sem** Layout/header do sistema.
- [ ] **D2** — Digitar `/` logado como colaborador sem gestão → volta a `/perfil-colaborador`, sem piscar o hub vazio (o guard espera `rolesLoaded`).
- [ ] **D2b** — Abrir um bookmark de rota de gestão (ex.: `/colaboradores`) como colaborador sem gestão → termina em `/perfil-colaborador`. São **dois** saltos (rota → `/` → portal): o que se confere é que a cadeia PARA.
- [ ] **D2c** — Trocar a senha pelo card no fim do `/perfil-colaborador`, deslogar e entrar com a senha nova. ⚠️ É o caminho que substituiu o link "Alterar Cadastro" do menu, que essa pessoa não tem mais.
- [ ] **D2d** — Como **`user` puro** (sem `colaborador`): login → **hub vazio**, e `/perfil` **abre**. É o contraste que prova que a regra olha a dimensão colaborador, não só o papel `user`.
- [ ] **D3** — Editar e salvar o cadastro → segue funcionando (sem regressão do tema anterior).

## E. Menu mobile

- [ ] **E1** — Em viewport estreito, o menu hambúrguer **espelha o desktop**: no hub, só config geral; dentro do módulo, Início + links do módulo + config geral.
- [ ] **E2** — Os mesmos filtros por papel valem no mobile (coordenador não vê Dashboard/Unidades ali também).

---

## F. Conferência perpétua — reconferir a cada mexida em roteamento/header

Estes não "concluem": todo trabalho que toque `App.tsx`, `Layout.tsx`, `src/lib/modulos.ts`, `Auth.tsx` ou os guards de página deve revalidá-los.

- [ ] **F1** — **`moduloDaRota` não captura rota pública/de config.** `/cadastro-publico`, `/perfil`, `/perfil-colaborador`, `/gerenciar-usuarios` continuam **fora** de qualquer módulo (nenhum link "Início" nem subtítulo de módulo aparece nelas). Regra: matching por igualdade-ou-prefixo-com-`/`, nunca `startsWith` cru.
- [ ] **F2** — **Toda decisão de navegação espera `rolesLoaded`.** Nenhuma tela decide destino (hub, redirect, cards) com papéis não carregados — senão pisca o hub vazio. Vale para `Inicio.tsx` e `Auth.tsx`.
- [ ] **F3** — **Módulo novo = 1 entrada em `MODULOS`.** Ao adicionar um módulo, conferir que hub, header e subtítulo o refletem **sem** editar `Layout.tsx`/`Inicio.tsx` (só o registro).
- [ ] **F4** — **Hub/nav é UX.** Qualquer rota nova de gestão ainda tem seu **próprio guard** (RLS/EF/página) — esconder do hub não basta. (Até o `RequireModulo` do backlog existir, os guards seguem página a página.)
- [ ] **F5** — **`user` prevalece sobre `colaborador`.** O combo `user`+`colaborador` cai no hub (estado vazio) e alcança o cadastro por "Meu Cadastro" — **não** é redirecionado para `/perfil-colaborador`.
