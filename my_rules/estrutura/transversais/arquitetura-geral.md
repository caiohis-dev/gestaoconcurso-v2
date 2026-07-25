# Arquitetura Geral — Gestão de Concursos (FEVRE)

> **Documento transversal.** Ver [`00-indice.md`](../00-indice.md) para o mapa completo. Auth é tratada em detalhe em [`auth-e-permissoes.md`](./auth-e-permissoes.md); integrações externas em [`integracoes-externas.md`](./integracoes-externas.md). O que é específico de um módulo vive em [`../modulos/`](../modulos/), não aqui.

## 1. Visão geral

Sistema web para gerenciar a **logística operacional de provas de concursos públicos**: cadastro de colaboradores (fiscais, coordenadores, apoio), organização de provas/editais, alocação de unidades e salas de aplicação, distribuição de colaboradores por função, registro de ocorrências durante a prova, e geração de documentos (listas de presença, recibos) em PDF.

O nome/marca exibida na UI é **FEVRE** (`src/components/Layout.tsx`), embora o diretório do projeto e os metadados internos usem "gestaoconcurso".

O projeto foi originalmente gerado pelo **Lovable** (plataforma low-code), mas em 2026-07-11 passou a ser mantido diretamente por nós: o `lovable-tagger` foi removido do `vite.config.ts`/`package.json`, o `.lovable/` e o README boilerplate saíram. Resquícios de scaffold ainda podem aparecer (nomes genéricos, comentários de "arquivo gerado") — trate como cruft, não como convenção a preservar. **Pendência:** a hospedagem/deploy ainda passa pelo Lovable (`Share → Publish`); migrar isso é um trabalho separado, ainda não feito.

## 2. Stack tecnológico

| Camada | Tecnologia |
|---|---|
| Build/dev server | Vite 5 (`@vitejs/plugin-react-swc`), alias `@/` → `./src/` |
| UI | React 18 (function components + hooks) |
| Roteamento | React Router DOM 6 (rotas declaradas em `src/App.tsx`) |
| Estilo | Tailwind CSS + `tailwindcss-animate`, tokens HSL em `src/index.css` |
| Componentes | shadcn/ui (`src/components/ui/*`, configurado via `components.json`) |
| Estado servidor | TanStack React Query 5 — usado de forma consistente na maioria dos hooks de entidade (`useQuery`/`useMutation` + `invalidateQueries`); alguns hooks mais antigos/específicos de página (ex.: `PainelDadosColaboradores.tsx`) fazem fetch manual com `useState`/`useEffect` em vez de React Query — não assuma cache automático sem checar o hook específico |
| Formulários | React Hook Form + Zod |
| PDF | jsPDF + jspdf-autotable (geração 100% client-side, ver [`documentos-e-relatorios.md`](../modulos/aplicacao-provas/documentos-e-relatorios.md)) |
| Planilhas | xlsx (SheetJS) — usado em `CadastroLote.tsx` para importação em massa |
| Gráficos | Recharts (Dashboard) |
| Backend/dados | Supabase (Postgres + Auth + Edge Functions), projeto `dqslqfzqukcahogkieet` |

TypeScript está configurado com tipagem **frouxa** (`tsconfig.app.json`): `strict: false`, `noImplicitAny: false`, `noUnusedLocals/Parameters: false`. ESLint também desliga `@typescript-eslint/no-unused-vars`. Não trate ausência de tipos estritos como bug a corrigir por conta própria — é uma escolha deliberada do projeto (velocidade > rigor).

## 3. Arquitetura macro

**SPA client-side puro consumindo o Supabase SDK diretamente — não há servidor de aplicação intermediário.** O frontend React fala diretamente com o Postgres via API REST/RPC do Supabase (`@supabase/supabase-js`), respeitando Row Level Security (RLS).

Toda lógica de negócio sensível ou que exige elevação de privilégio vive em dois lugares fora do frontend:

1. **Funções de banco (`SECURITY DEFINER`)** em `supabase/migrations/*.sql` — 31 das 81 migrations definem funções com `SECURITY DEFINER`, chamadas do frontend via `supabase.rpc(...)`. Fazem validação de permissão manualmente dentro do PL/pgSQL (ex.: `has_role`, `is_coordenador_prova`) antes de agir, já que RLS sozinho não cobriria os casos (ex.: autenticação de colaborador não usa Supabase Auth — ver [`auth-e-permissoes.md`](./auth-e-permissoes.md)).
2. **Edge Functions (Deno)** em `supabase/functions/*` — usadas para operações administrativas que exigem a service role key. Detalhadas em [`integracoes-externas.md`](./integracoes-externas.md).

18 das 81 migrations habilitam RLS explicitamente em tabelas (`ENABLE ROW LEVEL SECURITY`). Não existe servidor Node/Express próprio — o "backend" é inteiramente Supabase (BaaS) + Edge Functions.

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
│   └── migrations/                # 81 migrations SQL — fonte da verdade do schema
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
| `/gerenciar-salas-distribuidas/:provaId/:unidadeId` | Distribuição de salas por prova/unidade | [`provas-e-unidades.md`](../modulos/aplicacao-provas/provas-e-unidades.md) |
| `/gerenciar-colaboradores-prova/:provaUnidadeId` | Alocação de colaboradores por função | [`alocacao-e-funcoes.md`](../modulos/aplicacao-provas/alocacao-e-funcoes.md) |
| `/ocorrencias-prova/:provaId` | Registro de ocorrências | [`ocorrencias.md`](../modulos/aplicacao-provas/ocorrencias.md) |
| `/funcoes-colaboradores` | Cadastro de funções e valores | [`alocacao-e-funcoes.md`](../modulos/aplicacao-provas/alocacao-e-funcoes.md) |
| `/documentos-impressao/:provaId` | Geração de PDFs | [`documentos-e-relatorios.md`](../modulos/aplicacao-provas/documentos-e-relatorios.md) |
| `/painel-dados-colaboradores/:provaId` | Painel consolidado | [`documentos-e-relatorios.md`](../modulos/aplicacao-provas/documentos-e-relatorios.md) |
| `/gerenciar-usuarios` | Gestão de usuários/roles (superadmin) | [`auth-e-permissoes.md`](./auth-e-permissoes.md) |

Navegação visível no header (`Layout.tsx`) é filtrada por role **e por módulo atual** (ver §6), mas isso é só ocultação de UI — **não substitui checagem de permissão no backend** (feita via RLS/RPC).

## 6. Módulos e a tela de entrada (hub)

Desde 2026-07-24 a raiz `/` não abre mais uma lista, e sim um **hub** (`src/pages/Inicio.tsx`) que mostra a cada gestor os **módulos** a que ele tem acesso. Hoje existem **dois** módulos: *Aplicação de Provas* (todas as rotas de gestão da tabela acima) e *Editais* (`/editais`, só admin/superadmin). A estrutura está pronta para os próximos: o valor está no **mecanismo**, não na lista.

**A fonte de verdade é `src/lib/modulos.ts`.** Um módulo é uma entrada no array `MODULOS`, com: `id`, `nome`, `descricao`, `icone`, os `papeis` de gestão que o acessam, `rotaEntrada(ctx)` (para onde o card leva, por papel), `prefixosRota` (as rotas que pertencem ao módulo) e `navLinks` (os links que o header mostra dentro dele). **Módulo novo = 1 entrada aqui** — nunca duplicar a lista de rotas de um módulo em outro arquivo. Quem lê desse registro: o hub (`modulosDoUsuario`), o header (`moduloDaRota` + `navLinks`) e, no futuro, os guards.

**Como a raiz virou hub sem reescrever guards.** Os ~11 `navigate("/")` / `<Navigate to="/">` espalhados pelas páginas de gestão sempre significaram "acesso negado → lugar seguro". Com o hub na raiz, esse destino passou a ser "a tela com o que você PODE acessar" — semântica correta **sem editar nenhum deles**. A única migração de rota foi a lista de colaboradores: `/` → `/colaboradores`.

**Regras que não são óbvias:**
- **É UX, não autorização.** O hub e o filtro de `navLinks` *escondem* módulos; não *barram* ninguém. Quem barra continua sendo RLS + as checagens das Edge Functions + os guards de página. Esconder um card não protege nada por si só.
- **`moduloDaRota` casa por igualdade-ou-prefixo-com-`/`**, nunca `startsWith` cru — senão `/cadastro` capturaria `/cadastro-publico` (rota pública, fora de qualquer módulo). Rotas públicas e de config geral (`/perfil`, `/perfil-colaborador`, `/gerenciar-usuarios`) **não** entram em `prefixosRota`.
- **Config geral não é módulo** (decisão de desenho): "Usuários" e "Meu Cadastro" ficam no header sempre, fora dos cards; o dropdown do avatar leva a "Alterar Cadastro".
- **Colaborador puro nunca vê o hub** — cai direto em `/perfil-colaborador` (o guard do `Inicio.tsx` e o pós-login do `Auth.tsx` cuidam disso). Ver a matriz papel × módulo em [`auth-e-permissoes.md`](./auth-e-permissoes.md).

O desenho fechado e as 5 decisões (D1–D5) estão em [`roadmap-modulos.yaml`](../../analises/concluidos/roadmap-modulos.yaml).

**A documentação segue o mesmo recorte.** Cada módulo tem contrato próprio, e é ele — não este arquivo — a porta de entrada para trabalhar no módulo: [`aplicacao-provas/00-modulo.md`](../modulos/aplicacao-provas/00-modulo.md) e [`editais/00-modulo.md`](../modulos/editais/00-modulo.md). Módulo novo em `modulos.ts` = pasta nova em [`../modulos/`](../modulos/); a regra está em [`../00-indice.md`](../00-indice.md), seção "Como manter".

## 7. Pontos de atenção / higiene do repositório

- **`docs/features/cadastro-lote-sanitizacao.md`** é documentação específica e detalhada do fluxo de importação em lote — parece atualizada, referenciada em [`colaboradores.md`](../modulos/aplicacao-provas/colaboradores.md).
- **`public/auth_users_export.csv`** existe no repo mas contém só o cabeçalho (sem linhas de dados) — não é vazamento de dados reais no momento, mas vale perguntar por que um artefato de export está versionado em `public/` (fica publicamente acessível se servido como estático).
- **`src/integrations/supabase/types.ts`** é gerado automaticamente pelo Supabase CLI — não editar à mão. Já **`client.ts`**, apesar de um dia ter carregado o mesmo aviso, **é mantido à mão** (tem um wrapper de `fetch` que corrige o `expires_at` das respostas de auth); o comentário enganoso foi corrigido em 2026-07-11.
- **Deploy ainda no Lovable** — a limpeza de 2026-07-11 removeu o Lovable do *código*, mas o site continua sendo publicado pela plataforma. Migrar hospedagem é trabalho pendente e separado.
