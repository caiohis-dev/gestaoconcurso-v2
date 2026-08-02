#!/usr/bin/env bash
#
# Roda os testes das Edge Functions (Deno), com as três variáveis obrigatórias já
# resolvidas a partir do `supabase status`.
#
# POR QUE ESTE SCRIPT EXISTE
# Até 2026-08-02 esta camada só rodava com um comando de três `export` enterrado no
# `testes.md`. Quem não soubesse dele simplesmente não rodava os testes de EF — e NÃO
# RECEBIA SINAL NENHUM disso, porque `npm test` (Vitest) não alcança esta camada.
# O objetivo aqui é a camada ser DESCOBERTA, não depender de alguém lembrar.
#
# 🔴 AS TRÊS VARIÁVEIS SÃO OBRIGATÓRIAS e a ausência LANÇA (desde 31/07). Não é zelo:
# quando `SUPABASE_ANON_KEY` faltava, `callFunction` omitia o header `Authorization` e o
# caso "A1 — Anon Key crua (401)" passava a exercitar "requisição sem header nenhum",
# que também dá 401. O teste seguia VERDE afirmando outro cenário — justamente o que ele
# existe para guardar: que `verify_jwt` NÃO é autorização, porque a anon key é um JWT
# válido e público (a falha que já apareceu em `send-email` e `create-admin`).
#
# ⚠️ ESTES TESTES SÃO DE INTEGRAÇÃO e o banco local é CÓPIA DE PRODUÇÃO. Eles criam e
# apagam usuários reais no Auth local. O de `create-admin` tem teardown e foi verificado
# sem deixar resíduo — mas se um passo estourar antes dele, sobra conta `test_runner_*`.
#
# ⚠️ ANTES DE ESCREVER TESTE PARA OUTRA EF: `public-create-colaborador`,
# `reivindicar-acesso`, `recuperar-senha` e `send-email` ENVIAM E-MAIL DE VERDADE deste
# ambiente, e a base tem 771 endereços reais. `create-admin` não envia — por isso ele é o
# único que roda sem combinado prévio. Ver estrutura/transversais/integracoes-externas.md.
set -euo pipefail

if ! command -v deno >/dev/null 2>&1 && [ ! -x "$HOME/.deno/bin/deno" ]; then
  echo "deno não encontrado. Instale com:  curl -fsSL https://deno.land/install.sh | sh" >&2
  echo "(É um binário único; NÃO é dependência do projeto e não entra no package.json.)" >&2
  exit 1
fi
DENO="$(command -v deno 2>/dev/null || echo "$HOME/.deno/bin/deno")"

# As chaves saem do próprio `supabase status`, para não viverem copiadas em lugar nenhum.
# `sg docker` é obrigatório neste ambiente — ver CLAUDE.md §4.
if ! STATUS="$(sg docker -c 'npx supabase status -o env' 2>/dev/null)"; then
  echo "Não consegui ler o \`supabase status\`. A stack está de pé? (npm run supabase:start)" >&2
  exit 1
fi
eval "$(echo "$STATUS" | sed 's/^/export /')"

export SUPABASE_URL="${API_URL:-http://127.0.0.1:54321}"
export SUPABASE_ANON_KEY="${ANON_KEY:?ANON_KEY não veio do supabase status}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY não veio do supabase status}"

# `--allow-net` e `--allow-env` são o mínimo: a suíte fala com o Supabase local e lê as
# três variáveis acima.
exec "$DENO" test --allow-net --allow-env "${@:-supabase/functions/}"
