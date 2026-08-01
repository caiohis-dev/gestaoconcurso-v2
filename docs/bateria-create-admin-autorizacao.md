# [OBSOLETO] Bateria — autorização da Edge Function `create-admin`

> 📁 **HISTÓRICO — não leia por padrão.** Este arquivo registra um tema já entregue.
> Abra só quando o pedido for sobre o passado (*por que ficou assim? o que se tentou?
> que alternativa foi rejeitada?*). **Não é plano** — nada aqui é lista de tarefas.
> Para o que o sistema É, veja `my_rules/estrutura/`; para o que FALTA, `my_rules/backlog.md`.

> **🚨 ATENÇÃO:** Esta bateria manual via curl foi **substituída** pelos testes automatizados em Deno. 
> Veja `supabase/functions/create-admin/index.test.ts` e `supabase/functions/_shared/test-utils.ts`. 
> O histórico abaixo é mantido apenas como referência de como as coisas eram antes da automação (2026-07-28).

Prova que a `create-admin` só aceita chamada de um **superadmin autenticado**. Fechada em 2026-07-25; antes disso a função não checava nada e **qualquer um com a anon key criava uma conta `superadmin`** (ver [`../my_rules/estrutura/transversais/integracoes-externas.md`](../my_rules/estrutura/transversais/integracoes-externas.md)).

> **Por que era bateria manual e não teste do Vitest:** a function roda em **Deno**, fora do alcance da suíte — que roda em jsdom contra um mock do Supabase. O lado do **frontend** (mandar o JWT da sessão, não a anon key) esse sim está coberto, em `src/hooks/useUsers.test.tsx`.

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
| **A7** | `tentar "$JWT_SUPER" coordenador` sem `provaId` | **400** | A validação de negócio continua depois da autorização, na ordem certa. ⚠️ **O motivo do 400 mudou em 26/07** — ver a seção seguinte |

## Casos de coordenador — a fabricação de alocação (acrescentados em 2026-07-26)

A EF **deixou de conceder acesso de coordenador**. Antes, ela pegava um colaborador arbitrário (`.limit(1)`) e criava uma linha em `colaboradores_prova` só para satisfazer a FK `NOT NULL` de `coordenadores_prova` — dado inventado na tabela que serve de base ao pagamento. **Não há teste automatizado guardando isso**: estes dois casos são a única barreira.

| # | Chamada | Esperado |
|---|---|---|
| **A9** | `role: "coordenador"` **com** `provaId` válido | **400** `{"error":"Acesso de coordenador não é concedido aqui. Aloque a pessoa na prova…"}` |
| **A10** | `role: "coordenador"` **sem** `provaId` | **400**, mesma mensagem (é o A7, com a mensagem nova) |

⚠️ **Recusa, não rebaixamento.** Se algum dia isto voltar 200 criando a conta como `user`, é regressão: papel errado sem sinal. E se voltar 200 concedendo `coordenador`, é pior — o `RequireAcesso` deriva `isCoordenador` de `user_roles`, então a pessoa **passaria pelos guards** das rotas de coordenação para ver listas vazias.

### 🔴 O status HTTP não é a prova — a contagem é

Um 400 pode chegar *depois* de a linha ter sido escrita. O que realmente prova é a contagem inalterada nas duas tabelas, antes e depois de rodar A9/A10:

```bash
Q() { sg docker -c "docker exec supabase_db_dqslqfzqukcahogkieet psql -U postgres -At -c \"$1\""; }
Q 'select count(*) from public.colaboradores_prova;'
Q 'select count(*) from public.coordenadores_prova;'
```

**Rodada de 2026-07-26:** A9 e A10 → 400 com a mensagem nova; A5 (`admin`) → 200 com o papel gravado; sem `Authorization` → 401. Contagens **554 / 9 antes e depois**. A conta criada em A5 foi apagada (`user_roles` e `auth.users`).

> Colhido aí: a conta criada pela EF termina com **dois** papéis — `user`, do trigger `handle_new_user`, e o pedido. Comportamento antigo e sem efeito prático (`has_role` é por papel), mas quem for contar papéis por usuário precisa saber.

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

As contas criadas em A5/A6 são **reais** (A7/A9/A10 param antes de criar). Remova-as pelo dashboard do Auth local (`http://127.0.0.1:54323`), ou rode `sg docker -c 'npx supabase db reset'` para voltar ao estado do dump.
