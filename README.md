# Gestão de Concursos — FEVRE

Sistema web para gerenciar a logística operacional de provas de concursos públicos: cadastro de colaboradores (fiscais, coordenadores, apoio), organização de provas e editais, alocação de unidades e salas de aplicação, distribuição de colaboradores por função, registro de ocorrências durante a prova e geração de documentos (listas de presença, recibos) em PDF.

## Stack

- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui, TanStack React Query, React Router
- **Backend:** Supabase (Postgres + Auth + Edge Functions) — não há servidor de aplicação próprio; o frontend fala direto com o Supabase, e a lógica sensível vive em funções `SECURITY DEFINER` no banco e em Edge Functions (Deno)

## Rodando o projeto

```sh
npm install
npm run dev          # http://localhost:8080
```

Para apontar o frontend ao Supabase, crie um `.env.local` (ou use o `.env`) com:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## Ambiente local completo (Supabase via Docker)

O projeto tem um stack Supabase local (Postgres, Auth, Studio, Edge Functions, servidor de e-mail de teste) configurado em `supabase/config.toml`:

```sh
npm run supabase:start    # sobe o stack (requer Docker)
npm run supabase:reset    # aplica migrations + supabase/seed.sql numa base zerada
npm run supabase:status   # mostra URLs e chaves
```

Passo a passo detalhado, incluindo gotchas importantes (como o seed obrigatório de `funcoes_colaboradores`), em [`my_rules/estrutura/transversais/desenvolvimento-local.md`](./my_rules/estrutura/transversais/desenvolvimento-local.md).

## Banco de dados

Toda mudança de schema entra como uma **nova migration** em `supabase/migrations/` (`npx supabase migration new <slug>`). Não edite migrations já existentes.

## Documentação

A documentação de arquitetura fica em [`my_rules/estrutura/`](./my_rules/estrutura/), seccionada por domínio. Comece pelo [índice](./my_rules/estrutura/00-indice.md).
