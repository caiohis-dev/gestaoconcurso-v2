# Bateria — autorização da Edge Function `create-admin`

Prova que a `create-admin` só aceita chamada de um **superadmin autenticado**. Fechada em 2026-07-25; antes disso a função não checava nada e **qualquer um com a anon key criava uma conta `superadmin`** (ver [`../my_rules/estrutura/transversais/integracoes-externas.md`](../my_rules/estrutura/transversais/integracoes-externas.md)).

> **Por que é bateria manual e não teste do Vitest:** a function roda em **Deno**, fora do alcance da suíte — que roda em jsdom contra um mock do Supabase. Um teste lá afirmaria o mock, não a function. O lado do **frontend** (mandar o JWT da sessão, não a anon key) esse sim está coberto, em `src/hooks/useUsers.test.tsx`.

## Antes de começar

1. Supabase local no ar (`sg docker -c 'npx supabase status'`) e as functions servidas (`sg docker -c 'npx supabase functions serve'`).
2. Guarde as chaves:

```bash
export SB_URL="http://127.0.0.1:54321"
export ANON=$(sg docker -c 'npx supabase status -o json' | python3 -c "import sys,json;print(json.load(sys.stdin)['ANON_KEY'])")
```

3. Tenha à mão **três contas**: uma `superadmin`, uma `admin` (sem superadmin) e uma `user`/coordenador.

Para pegar o JWT de uma delas:

```bash
login() {  # uso: login email senha
  curl -s "$SB_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" |
  python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"
}
export JWT_SUPER=$(login super@exemplo.test senha)
export JWT_ADMIN=$(login admin@exemplo.test senha)
```

⚠️ **Use um e-mail de teste seu nos casos que CRIAM conta.** O ambiente local envia e-mail de verdade (banco é cópia de produção) — ver o aviso em [`teste-frontend-auth-colaborador.md`](./teste-frontend-auth-colaborador.md).

## Os casos

Chamada base (varia só o `Authorization`):

```bash
tentar() {  # uso: tentar "<token>" "<papel-desejado>"
  curl -s -o /tmp/resp.json -w "HTTP %{http_code}\n" \
    -X POST "$SB_URL/functions/v1/create-admin" \
    -H "apikey: $ANON" \
    -H "Authorization: Bearer $1" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"teste-$RANDOM@SEU-DOMINIO.test\",\"password\":\"senha-forte-123\",\"fullName\":\"Teste\",\"role\":\"$2\"}"
  cat /tmp/resp.json; echo
}
```

### ✅ Rodada em 2026-07-25 — 7 de 7 conforme o esperado

Executada contra o Supabase local com `functions serve --no-verify-jwt` (de propósito: desligar o portão da plataforma prova que **a autorização é da função**, não do `verify_jwt`). Resultados: A1 **401**, A2 **401**, A3 **401**, A4 **403**, A4b (coordenador) **403**, A5 **200**, A7 **400**. Nenhuma conta foi criada nos casos recusados — conferido em `auth.users`.

> Os JWTs de teste foram **forjados localmente** com o `JWT_SECRET` padrão do CLI, porque o dump traz os hashes de senha de produção e ninguém sabe as senhas. Um script de ~20 linhas assinando `{sub, aud:"authenticated", role:"authenticated", exp}` com HS256 resolve. Não serve para o remoto, e nem deveria.

| # | Quem chama | Esperado | O que prova |
|---|---|---|---|
| **A1** | `tentar "$ANON" superadmin` | **401** `{"error":"Não autenticado"}` | 🔴 **O caso central.** É exatamente o ataque que funcionava antes: anon key crua pedindo superadmin. A anon key é um JWT válido, mas anônimo — `getUser()` não devolve pessoa nenhuma |
| **A2** | sem header `Authorization` | **401** | O `verify_jwt` da plataforma já barraria, mas a função não depende disso |
| **A3** | `tentar "lixo" admin` | **401** | Token inválido não passa |
| **A4** | `tentar "$JWT_ADMIN" admin` | **403** `{"error":"Só um superadmin pode criar usuários."}` | Autenticado **não basta** — admin comum não cria conta. Espelha o guard da página `/gerenciar-usuarios`, que é `isSuperAdmin` |
| **A5** | `tentar "$JWT_SUPER" admin` | **200** `{"success":true}` | O caminho legítimo continua funcionando |
| **A6** | `tentar "$JWT_SUPER" superadmin` | **200** | Superadmin pode criar superadmin — decisão consciente: quem administra contas pode se replicar |
| **A7** | `tentar "$JWT_SUPER" coordenador` sem `provaId` | **400** | A validação de negócio continua depois da autorização, na ordem certa |

## Checagem de regressão da hierarquia

**A8** — Um **superadmin SEM linha `admin`** em `user_roles` deve passar em A5/A6. A verificação de papel usa `has_role`, que desde a migration `20260725195530` faz `superadmin ⇒ admin`; se alguém trocar isso por um `SELECT` em `user_roles`, este caso quebra. Para testar sem estragar dado:

```sql
BEGIN;
DELETE FROM public.user_roles WHERE user_id = '<uuid-do-superadmin>' AND role = 'admin';
-- rode A5 noutro terminal, com o JWT dele
ROLLBACK;
```

## A `corrigir-email-acesso` entrou no mesmo passe

Ela também passou a checar papel por **`has_role` (RPC)** em vez de `SELECT` em `user_roles` — a hierarquia mora naquela função desde a migration `20260725195530`, e consultar a tabela direto a contorna. Conferido na mesma rodada, com `acao: "consultar"`: **admin → 200**, **coordenador → 200**, **anon → 401**.

Vale repetir estes três sempre que mexer na autorização de qualquer EF: o risco de trocar uma consulta de tabela por RPC é a chamada falhar em silêncio e virar 500 — e um 500 aqui pareceria "erro do servidor", não "regra quebrada".

## Depois de rodar

As contas criadas em A5/A6/A7 são **reais**. Remova-as pelo dashboard do Auth local (`http://127.0.0.1:54323`), ou rode `sg docker -c 'npx supabase db reset'` para voltar ao estado do dump.
