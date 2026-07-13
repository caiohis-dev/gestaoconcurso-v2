# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. Itens concluídos devem ser removidos daqui (o histórico do que foi feito vive na documentação em [`estrutura/`](./estrutura/), não neste arquivo).

---

## Refatorar diálogo "Nova Ocorrência" para modelo wizard

**Status:** pendente
**Área:** Ocorrências (ver [`estrutura/ocorrencias.md`](./estrutura/ocorrencias.md))

Refatorar o diálogo de Nova Ocorrência (`src/pages/OcorrenciasProva.tsx`) para um fluxo em wizard (passos), em vez do formulário único atual.

Junto com a refatoração, **corrigir a funcionalidade de "Faltou"**: quando uma ocorrência marca que o colaborador faltou, ele deve ser **retirado da unidade daquela prova** (ou seja, o vínculo correspondente em `colaboradores_prova` deve ser removido/desfeito para aquela prova+unidade). Hoje esse efeito não acontece.

---

## Refatorar a segurança do acesso do colaborador (`/auth`)

**Status:** pendente — em debate de desenho (decisão de fundo ainda não tomada)
**Área:** Auth e Permissões (ver [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md))

O portal do colaborador (rota `/auth`, login por CPF + código de 4 dígitos, sem Supabase Auth) tem fragilidades sérias. O laudo completo, com os 8 pontos levantados por leitura de código e banco em 2026-07-13, está em [`analises/fragilidades-auth-colaborador.md`](./analises/fragilidades-auth-colaborador.md).

O nó central: as RPCs `SECURITY DEFINER` recebem o `p_colaborador_id` do cliente e confiam nele, sem prova de identidade — então qualquer um com a anon key (pública) lê/edita/reseta a senha de qualquer colaborador sabendo só o UUID. O código de acesso ainda é texto puro, sem rate limit, e o fluxo de "esqueci meu código" devolve a credencial na resposta HTTP.

A decisão de desenho que precede a implementação: **(A)** migrar o portal para Supabase Auth de verdade (`auth.uid()` ancora RLS/RPCs), ou **(B)** manter o modelo sem-JWT com um token de sessão assinado que as RPCs passem a exigir. Só depois de decidir isso é que hash do código, rate limit e correção do reset entram em ordem.

---

## Bootstrap do banco de produção da v2

**Status:** pendente — **deliberadamente adiado até a primeira subida da v2 a produção**
**Área:** Infraestrutura / Banco (ver [`banco-producao.md`](./banco-producao.md))

O projeto novo no supabase.com já foi criado, mas o repo **não é linkado a ele** — e não deve ser, até o dia de colocar a v2 no ar (regra combinada em 2026-07-12: o repo fica deslinkado por padrão, e produção só é atualizada em versões estáveis).

O schema já está pronto para subir quando for a hora: as 69 migrations reproduzem o banco local do zero, validado por `db reset` em 2026-07-12. O roteiro completo dos 8 passos (link → `prod:push:dry` → `prod:push` → carga do `seed.local.sql` → auth no dashboard → edge functions + secrets SMTP → `.env` do frontend → **unlink**) está em [`banco-producao.md`](./banco-producao.md).

Falta apenas, no dia: a **ref do projeto novo** no Supabase.

---

## Migrar hospedagem/deploy para fora do Lovable

**Status:** pendente
**Área:** Infraestrutura (ver [`estrutura/arquitetura-geral.md`](./estrutura/arquitetura-geral.md))

O Lovable já foi removido do **código** em 2026-07-11 (`lovable-tagger`, boilerplate, `.lovable/`), e o site do Lovable **não existe mais** — o projeto está temporariamente fora do ar (situação em 2026-07-12). Não há mais deploy ativo em lugar nenhum.

Publicar a v2 em infraestrutura própria (ex.: Vercel, Netlify, ou build estático em qualquer host), incluindo o domínio. O build de produção (`npm run build`) é um Vite estático comum e não depende de nada do Lovable. Depende do bootstrap do banco acima (o frontend precisa apontar para o Supabase novo).
