# Arquitetura Geral — Gestão de Concursos (FEVRE)

> **Documento transversal.** Ver [`00-indice.md`](../00-indice.md) para o mapa completo. Auth é tratada em detalhe em [`auth-e-permissoes.md`](./auth-e-permissoes.md); integrações externas em [`integracoes-externas.md`](./integracoes-externas.md). O que é específico de um módulo vive em [`../modulos/`](../modulos/), não aqui.

## 1. Visão geral

Sistema web para gerenciar a **logística operacional de provas de concursos públicos**: cadastro de colaboradores (fiscais, coordenadores, apoio), organização de provas/editais, alocação de unidades e salas de aplicação, distribuição de colaboradores por função, registro de ocorrências durante a prova, e geração de documentos (listas de presença, recibos) em PDF.

O nome/marca exibida na UI é **FEVRE** (`src/components/Layout.tsx`), embora o diretório do projeto e os metadados internos usem "gestaoconcurso".

O projeto foi originalmente gerado pelo **Lovable** (plataforma low-code), mas em 2026-07-11 passou a ser mantido diretamente por nós: o `lovable-tagger` foi removido do `vite.config.ts`/`package.json`, o `.lovable/` e o README boilerplate saíram. Resquícios de scaffold ainda podem aparecer (nomes genéricos, comentários de "arquivo gerado") — trate como cruft, não como convenção a preservar. **Pendência:** não há deploy ativo em lugar nenhum — o site do Lovable deixou de existir e o projeto está fora do ar desde 2026-07-12. Publicar a v2 em infraestrutura própria é item do [`backlog.md`](../../backlog.md), e depende do bootstrap do banco novo.

## 2. Stack tecnológico

| Camada | Tecnologia |
|---|---|
| Build/dev server | Vite 5 (`@vitejs/plugin-react-swc`), alias `@/` → `./src/` |
| UI | React 18 (function components + hooks) |
| Roteamento | React Router DOM 6 (rotas declaradas em `src/App.tsx`) |
| Estilo | Tailwind CSS + `tailwindcss-animate`, tokens HSL em `src/index.css` |
| Componentes | shadcn/ui (`src/components/ui/*`, configurado via `components.json`) |
| Estado servidor | TanStack React Query 5 — usado de forma consistente na maioria dos hooks de entidade (`useQuery`/`useMutation` + `invalidateQueries`); algumas páginas fazem fetch manual com `useState`/`useEffect` em vez de React Query — `PainelDadosColaboradores.tsx`, `Dashboard.tsx` e `GerenciarColaboradoresProva.tsx` (esta última com dois efeitos que chamam `supabase...then()` cru, item aberto no backlog). **Não assuma cache automático sem checar o hook específico** |
| Formulários | React Hook Form + Zod |
| PDF | jsPDF + jspdf-autotable (geração 100% client-side, ver [`documentos-e-relatorios.md`](../modulos/aplicacao-provas/documentos-e-relatorios.md)) |
| Planilhas | xlsx (SheetJS) — importação em massa (`CadastroLote.tsx`, `CandidatosImportar.tsx`) e exportação de relatórios. ⚠️ Leia planilha de entrada com `{ header: 1, raw: false }`: modo objeto perde colunas de cabeçalho repetido e modo cru come zero à esquerda de CPF/CEP — ver [`candidatos/00-modulo.md`](../modulos/candidatos/00-modulo.md) |
| Gráficos | Recharts (Dashboard) |
| Backend/dados | Supabase (Postgres + Auth + Edge Functions), projeto `dqslqfzqukcahogkieet` |

TypeScript está configurado com tipagem **frouxa** (`tsconfig.app.json`): `strict: false`, `noImplicitAny: false`, `noUnusedLocals/Parameters: false`. ESLint também desliga `@typescript-eslint/no-unused-vars`. Não trate ausência de tipos estritos como bug a corrigir por conta própria — é uma escolha deliberada do projeto (velocidade > rigor).

## 3. Arquitetura macro

**SPA client-side puro consumindo o Supabase SDK diretamente — não há servidor de aplicação intermediário.** O frontend React fala diretamente com o Postgres via API REST/RPC do Supabase (`@supabase/supabase-js`), respeitando Row Level Security (RLS).

Toda lógica de negócio sensível ou que exige elevação de privilégio vive em dois lugares fora do frontend:

1. **Funções de banco (`SECURITY DEFINER`)** em `supabase/migrations/*.sql` — **41 das 95** migrations definem funções com `SECURITY DEFINER`, chamadas do frontend via `supabase.rpc(...)`. Fazem validação de permissão manualmente dentro do PL/pgSQL (ex.: `has_role`, `is_coordenador_prova`) antes de agir, já que RLS sozinho não cobriria todos os casos. ⚠️ **Este parágrafo dizia que "autenticação de colaborador não usa Supabase Auth" — falso desde a subetapa 2A (2026-07-14)**, que unificou tudo num login só; corrigido na auditoria de 2026-07-26. Ver [`auth-e-permissoes.md`](./auth-e-permissoes.md).
2. **Edge Functions (Deno)** em `supabase/functions/*` — usadas para operações administrativas que exigem a service role key. Detalhadas em [`integracoes-externas.md`](./integracoes-externas.md).

**21 das 95** migrations habilitam RLS explicitamente em tabelas (`ENABLE ROW LEVEL SECURITY`). Não existe servidor Node/Express próprio — o "backend" é inteiramente Supabase (BaaS) + Edge Functions.

**Padrão a seguir ao adicionar features novas:** prefira RPC `SECURITY DEFINER` com checagem manual de permissão em vez de abrir uma tabela via policy permissiva — é o padrão dominante no schema atual.

## 4. Estrutura de pastas

```
.
├── src/
│   ├── App.tsx                 # Providers globais + declaração de todas as rotas
│   ├── main.tsx                # Entry point
│   ├── components/              # Componentes de domínio (dialogs, cards, listas)
│   │   └── ui/                  # shadcn/ui (geradas, evitar edição manual extensa)
│   ├── hooks/                   # Um hook por entidade/feature: fetch + mutations + regra de negócio
│   ├── integrations/supabase/   # client.ts (cliente configurado) + types.ts (gerado, NÃO editar)
│   ├── lib/                     # utils.ts (helpers genéricos) e constants.ts (enums de domínio)
│   └── pages/                    # Um componente por rota (ver tabela de rotas abaixo)
├── supabase/
│   ├── config.toml               # project_id + config de verify_jwt por function
│   ├── functions/                 # Edge Functions (Deno), uma pasta por função + _shared/ (templates de e-mail)
│   └── migrations/                # 95 migrations SQL — fonte da verdade do schema
├── public/                        # Estáticos (logo, favicon); ver nota sobre auth_users_export.csv abaixo
├── my_rules/estrutura/            # Esta documentação (transversais/ + modulos/)
└── docs/                          # Documentação pontual de features específicas
```

## 5. Mapa de rotas (`src/App.tsx`)

| Rota | Página | Domínio (ver documento) |
|---|---|---|
| `/` | `Inicio` | A **tela de entrada por módulos** (hub) — ver §6 |
| `/colaboradores` | `Colaboradores` | [`colaboradores.md`](../modulos/aplicacao-provas/colaboradores.md) — listagem (era `/` até 2026-07-24) |
| `/dashboard` | `Dashboard` | [`documentos-e-relatorios.md`](../modulos/aplicacao-provas/documentos-e-relatorios.md) |
| `/auth` | Porta única de login (Supabase Auth, e-mail/senha) + o link **"Estou sem minha senha"**, que aceita CPF ou e-mail e resolve invite/recovery no servidor (EF própria desde 2026-07-20 — não é mais o reset nativo). `/auth-admin` redireciona para cá; `/redefinir-senha` é o destino do link | [`auth-e-permissoes.md`](./auth-e-permissoes.md) |
| `/cadastro`, `/cadastro-publico`, `/cadastro-lote` | Cadastro de colaborador | [`colaboradores.md`](../modulos/aplicacao-provas/colaboradores.md) |
| `/perfil`, `/perfil-colaborador` | Perfil admin vs. colaborador | [`colaboradores.md`](../modulos/aplicacao-provas/colaboradores.md), [`auth-e-permissoes.md`](./auth-e-permissoes.md) |
| `/unidades-prova`, `/salas-prova/:unidadeId` | Cadastro de unidades e salas (template) | [`provas-e-unidades.md`](../modulos/aplicacao-provas/provas-e-unidades.md) |
| `/provas`, `/gerenciar-prova/:provaId` | CRUD de provas | [`provas-e-unidades.md`](../modulos/aplicacao-provas/provas-e-unidades.md) |
| `/editais` | CRUD de editais (só admin); a prova referencia um edital | **Módulo próprio:** [`editais/00-modulo.md`](../modulos/editais/00-modulo.md) |
| `/candidatos`, `/candidatos/importar` | Os inscritos de cada edital e o assistente de importação de planilha (só admin) | **Módulo próprio:** [`candidatos/00-modulo.md`](../modulos/candidatos/00-modulo.md) |
| `/gerenciar-salas-distribuidas/:provaId/:unidadeId` | Distribuição de salas por prova/unidade | [`provas-e-unidades.md`](../modulos/aplicacao-provas/provas-e-unidades.md) |
| `/gerenciar-colaboradores-prova/:provaUnidadeId` | Alocação de colaboradores por função | [`alocacao-e-funcoes.md`](../modulos/aplicacao-provas/alocacao-e-funcoes.md) |
| `/ocorrencias-prova/:provaId` | Registro de ocorrências | [`ocorrencias.md`](../modulos/aplicacao-provas/ocorrencias.md) |
| `/funcoes-colaboradores` | Cadastro de funções e valores | [`alocacao-e-funcoes.md`](../modulos/aplicacao-provas/alocacao-e-funcoes.md) |
| `/documentos-impressao/:provaId` | Geração de PDFs | [`documentos-e-relatorios.md`](../modulos/aplicacao-provas/documentos-e-relatorios.md) |
| `/painel-dados-colaboradores/:provaId` | Painel consolidado | [`documentos-e-relatorios.md`](../modulos/aplicacao-provas/documentos-e-relatorios.md) |
| `/gerenciar-usuarios` | Gestão de usuários/roles (superadmin) | [`auth-e-permissoes.md`](./auth-e-permissoes.md) |

Navegação visível no header (`Layout.tsx`) é filtrada por role **e por módulo atual** (ver §6), mas isso é só ocultação de UI — **não substitui checagem de permissão no backend** (feita via RLS/RPC).

## 6. Módulos e a tela de entrada (hub)

Desde 2026-07-24 a raiz `/` não abre mais uma lista, e sim um **hub** (`src/pages/Inicio.tsx`) que mostra a cada gestor os **módulos** a que ele tem acesso. Hoje existem **três** módulos: *Aplicação de Provas* (todas as rotas de gestão da tabela acima), *Editais* (`/editais`, só admin/superadmin) e *Candidatos* (`/candidatos`, idem, criado em 2026-07-27). A estrutura está pronta para os próximos: o valor está no **mecanismo**, não na lista.

**A fonte de verdade é `src/lib/modulos.ts`.** Um módulo é uma entrada no array `MODULOS`, com: `id`, `nome`, `descricao`, `icone`, os `papeis` de gestão que o acessam, `rotaEntrada(ctx)` (para onde o card leva, por papel), `prefixosRota` (as rotas que pertencem ao módulo) e `navLinks` (os links que o header mostra dentro dele). **Módulo novo = 1 entrada aqui** — nunca duplicar a lista de rotas de um módulo em outro arquivo. Quem lê desse registro: o hub (`modulosDoUsuario`) e o header (`moduloDaRota` + `navLinks`). ⚠️ **Os guards NÃO leem daqui, e isso é decisão**: o registro conhece papel por MÓDULO, e as rotas são mais finas — `aplicacao-provas` admite coordenador, mas sete rotas dele são só admin. Ler os papéis daqui afrouxaria o acesso. Ver `RequireAcesso` em [`auth-e-permissoes.md`](./auth-e-permissoes.md).

**Como a raiz virou hub sem reescrever guards.** Os `navigate("/")` espalhados pelas páginas sempre significaram "acesso negado → lugar seguro", e com o hub na raiz esse destino passou a ser "a tela com o que você PODE acessar" — semântica correta sem editar nenhum. A única migração de rota foi `/` → `/colaboradores`. **Desde 2026-07-26 aquele destino é único**, no `RequireAcesso`.

**Regras que não são óbvias:**
- **É UX, não autorização.** O hub e o filtro de `navLinks` *escondem* módulos; não *barram* ninguém. Quem barra continua sendo RLS + as checagens das Edge Functions + o `RequireAcesso` das rotas. Esconder um card não protege nada por si só.
- **`moduloDaRota` casa por igualdade-ou-prefixo-com-`/`**, nunca `startsWith` cru — senão `/cadastro` capturaria `/cadastro-publico` (rota pública, fora de qualquer módulo). Rotas públicas e de config geral (`/perfil`, `/perfil-colaborador`, `/gerenciar-usuarios`) **não** entram em `prefixosRota`.
- **Config geral não é módulo** (decisão de desenho): "Usuários" e "Meu Cadastro" ficam no header sempre, fora dos cards; o dropdown do avatar leva a "Alterar Cadastro".
- **Colaborador puro nunca vê o hub** — cai direto em `/perfil-colaborador` (o guard do `Inicio.tsx` e o pós-login do `Auth.tsx` cuidam disso). Ver a matriz papel × módulo em [`auth-e-permissoes.md`](./auth-e-permissoes.md).

O desenho fechado e as 5 decisões (D1–D5) estão em [`roadmap-modulos.yaml`](../../analises/concluidos/roadmap-modulos.yaml).

**A documentação segue o mesmo recorte.** Cada módulo tem contrato próprio, e é ele — não este arquivo — a porta de entrada para trabalhar no módulo: [`aplicacao-provas/00-modulo.md`](../modulos/aplicacao-provas/00-modulo.md) e [`editais/00-modulo.md`](../modulos/editais/00-modulo.md). Módulo novo em `modulos.ts` = pasta nova em [`../modulos/`](../modulos/); a regra está em [`../00-indice.md`](../00-indice.md), seção "Como manter".

## 7. Convenção de acessibilidade dos diálogos

**Todo `<DialogContent>` precisa de um `<DialogDescription>`.** Vale para as três variantes do Radix em uso: `Dialog`, `AlertDialog` e `Sheet`. Sem ele, o Radix emite `Missing 'Description' or 'aria-describedby' for {DialogContent}` e o leitor de tela anuncia **só o título** — a pessoa abre um formulário sem receber contexto nenhum do que ele faz.

São **31 diálogos em 22 arquivos** (contagem de 2026-07-26; eram 28 em 20 quando a invariante nasceu). Em 2026-07-25, seis não tinham descrição e ganharam uma. Um teste de invariante (`src/components/dialogos-acessibilidade.test.ts`) varre o fonte e falha apontando arquivo e linha se um diálogo novo nascer sem descrição. É teste **estático**, não de render, porque a maioria dos diálogos não tem teste de UI e montar as props de todos custaria mais do que o problema.

Duas orientações ao escrever a descrição:

- **Diga algo verdadeiro e útil, não encha linguiça.** "Preencha os campos" não informa nada. As boas apontam a regra que a pessoa não adivinha — por exemplo, o `ValoresFuncaoProvaDialog` avisa que o valor é congelado na alocação, e o `ProvaDialog` avisa que trocar o edital de uma prova existente não sobrescreve os campos dela.
- **Se já existe um subtítulo no header, promova-o em vez de duplicar.** Era o caso do `MetaColaboradoresDialog`, que tinha um `<p>` solto com o nome da unidade: virou `DialogDescription` sem mudar um pixel, porque o componente já aplica `text-sm text-muted-foreground`.

## 8. Pontos de atenção / higiene do repositório

- ~~**`docs/features/cadastro-lote-sanitizacao.md`** … parece atualizada~~ — 🔵 **resolvido em 2026-07-31.** O arquivo virou [`modulos/aplicacao-provas/cadastro-lote.md`](../modulos/aplicacao-provas/cadastro-lote.md), na pasta do módulo a que pertence, e `docs/features/` deixou de existir. ⚠️ **Ele não estava atualizado:** cinco afirmações divergiam do código, entre elas negar que o CPF passa por dígito verificador. **"Parece atualizada" é exatamente o tipo de aval que um doc não deve dar sobre outro** — ninguém verificou, e a frase emprestou autoridade a um texto errado.
- **`public/auth_users_export.csv`** existe no repo mas contém só o cabeçalho (sem linhas de dados) — não é vazamento de dados reais no momento, mas vale perguntar por que um artefato de export está versionado em `public/` (fica publicamente acessível se servido como estático).
- **`src/integrations/supabase/types.ts`** é gerado automaticamente pelo Supabase CLI — não editar à mão. Já **`client.ts`**, apesar de um dia ter carregado o mesmo aviso, **é mantido à mão** (tem um wrapper de `fetch` que corrige o `expires_at` das respostas de auth); o comentário enganoso foi corrigido em 2026-07-11.
- **Deploy ainda no Lovable** — a limpeza de 2026-07-11 removeu o Lovable do *código*, mas o site continua sendo publicado pela plataforma. Migrar hospedagem é trabalho pendente e separado.
