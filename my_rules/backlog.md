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

**Status:** pendente — **desenho fechado, pronto para implementar**
**Área:** Auth e Permissões (ver [`estrutura/auth-e-permissoes.md`](./estrutura/auth-e-permissoes.md))

O portal do colaborador (rota `/auth`, login por CPF + código de 4 dígitos, sem Supabase Auth) tem fragilidades sérias. O laudo dos 8 pontos, levantado em 2026-07-13, está em [`analises/fragilidades-auth-colaborador.md`](./analises/fragilidades-auth-colaborador.md).

O nó central: as RPCs `SECURITY DEFINER` recebem o `p_colaborador_id` do cliente e confiam nele, sem prova de identidade — então qualquer um com a anon key (pública) lê/edita/reseta a senha de qualquer colaborador sabendo só o UUID.

**Decidido em 2026-07-13 (opção A):** migrar para Supabase Auth, com o colaborador **criando a própria conta** (auto-cadastro), tendo como prova de identidade o **e-mail que já consta no cadastro** — e o coordenador corrigindo o e-mail quando estiver errado ou ausente. O papel `colaborador` entra no enum `app_role`, e nasce o elo `colaboradores.user_id`. O código de acesso de 4 dígitos morre.

O roteiro completo, com as 3 etapas, os fatos do banco que fundamentam o desenho e a dívida assumida, está em [`analises/roadmap-auth-colaborador.md`](./analises/roadmap-auth-colaborador.md).

---

## Sanear as chaves PIX e preencher `tipo_chave_pix`

**Status:** pendente — aberto em 2026-07-14, quando as colunas ganharam unicidade
**Área:** Colaboradores (ver [`estrutura/colaboradores.md`](./estrutura/colaboradores.md))

Duas pontas soltas deixadas de propósito pela migration `20260714163506_*`:

1. **Os formatos da chave PIX estão misturados.** Das 565 chaves preenchidas, 94 estão em formatos mistos (`127.139.687-47` ao lado de `12713968747`, `(24)998491988`, chaves com espaço no meio) e **uma tem 21 dígitos** — não é chave válida de tipo nenhum. O índice único atual normaliza caixa e espaço nas pontas, mas **não** pontuação: a mesma chave escrita de dois jeitos ainda entra duas vezes. Sanear isso é reescrever dado bancário de 565 pessoas e pede conferência humana.

2. **`tipo_chave_pix` está `NULL` nas 771 linhas.** O tipo **não é inferível** do valor: 397 chaves têm 11 dígitos, e 11 dígitos é tanto CPF quanto celular com DDD (193 batem com o CPF da própria pessoa, 188 com o telefone dela, e o resto com nenhum dos dois). Adivinhar errado é errar o destino de um pagamento. Preencher exige ou confirmação humana, ou uma regra de negócio que ainda não existe.

Enquanto (2) não estiver resolvido, não é possível criar o `CHECK` que amarra "tem chave ⇒ tem tipo".

**Atenção:** qualquer correção em massa aqui é **operação de dados** e esbarra na regra do seed — migration não alcança dado que entra pelo dump (ver [`estrutura/desenvolvimento-local.md`](./estrutura/desenvolvimento-local.md)).

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
