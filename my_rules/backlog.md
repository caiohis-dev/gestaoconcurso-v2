# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. Itens concluídos devem ser removidos daqui (o histórico do que foi feito vive na documentação em [`estrutura/`](./estrutura/), não neste arquivo).

---

## Refatorar diálogo "Nova Ocorrência" para modelo wizard

**Status:** pendente
**Área:** Ocorrências (ver [`estrutura/ocorrencias.md`](./estrutura/ocorrencias.md))

Refatorar o diálogo de Nova Ocorrência (`src/pages/OcorrenciasProva.tsx`) para um fluxo em wizard (passos), em vez do formulário único atual.

Junto com a refatoração, **corrigir a funcionalidade de "Faltou"**: quando uma ocorrência marca que o colaborador faltou, ele deve ser **retirado da unidade daquela prova** (ou seja, o vínculo correspondente em `colaboradores_prova` deve ser removido/desfeito para aquela prova+unidade). Hoje esse efeito não acontece.

---

## Bootstrap do banco de produção da v2

**Status:** pendente — pronto para executar
**Área:** Infraestrutura / Banco (ver [`banco-producao.md`](./banco-producao.md))

O projeto novo no supabase.com já foi criado; o repo **ainda não está linkado** a ele. O procedimento completo (link → `prod:push:dry` → `prod:push` → carga do `seed.local.sql` → config de auth no dashboard → deploy das edge functions + secrets SMTP → `.env` do frontend) está em [`banco-producao.md`](./banco-producao.md).

O schema já está pronto para subir: as 69 migrations reproduzem o banco local do zero, validado por `db reset` em 2026-07-12.

---

## Migrar hospedagem/deploy para fora do Lovable

**Status:** pendente
**Área:** Infraestrutura (ver [`estrutura/arquitetura-geral.md`](./estrutura/arquitetura-geral.md))

O Lovable já foi removido do **código** em 2026-07-11 (`lovable-tagger`, boilerplate, `.lovable/`), e o site do Lovable **não existe mais** — o projeto está temporariamente fora do ar (situação em 2026-07-12). Não há mais deploy ativo em lugar nenhum.

Publicar a v2 em infraestrutura própria (ex.: Vercel, Netlify, ou build estático em qualquer host), incluindo o domínio. O build de produção (`npm run build`) é um Vite estático comum e não depende de nada do Lovable. Depende do bootstrap do banco acima (o frontend precisa apontar para o Supabase novo).
