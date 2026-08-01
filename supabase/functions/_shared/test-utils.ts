import { SignJWT } from "https://deno.land/x/jose@v5.2.3/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Gera um JWT válido para testes locais no Supabase.
 * Usa a secret padrão do emulador local.
 */
export async function forgeToken(
  payload: { sub?: string; email?: string; role?: string; user_role?: string },
  expiresIn = "1h"
): Promise<string> {
  // A secret padrão do "supabase start"
  const secret = new TextEncoder().encode(
    Deno.env.get("JWT_SECRET") || "super-secret-jwt-token-with-at-least-32-characters-long"
  );

  const jwt = await new SignJWT({
    ...payload,
    role: payload.role || "authenticated",
    user_role: payload.user_role || "authenticated",
    aud: "authenticated",
    iss: "supabase",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);

  return jwt;
}

/**
 * Retorna o cliente admin do Supabase (Service Role)
 */
export function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não está definida nas variáveis de ambiente de teste.");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Wrapper para chamar as funções locais.
 *
 * Sem `token`, manda a **anon key** — que é um JWT válido e público. Esse caso não é
 * decorativo: é o que prova que `verify_jwt` **não é autorização**, a falha que já
 * apareceu duas vezes neste repo (`send-email` e `create-admin`).
 *
 * 🔴 Por isso a anon key ausente LANÇA, em vez de degradar. Até 2026-07-31 o código
 * omitia o header quando `SUPABASE_ANON_KEY` não estava definida, e o custo era
 * silencioso: um caso chamado "anon key crua (401)" passava a exercitar
 * "requisição sem header nenhum", que também dá 401. **O teste continuava verde
 * afirmando outra coisa** — e justo a que ele existe para guardar deixava de ser
 * coberta. Mesma postura do `getAdminClient` acima.
 */
export async function callFunction(
  functionName: string,
  body: Record<string, unknown>,
  token?: string
): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token !== undefined) {
    // `""` é o pedido explícito de NÃO mandar header — o cenário "sem Authorization",
    // que é diferente de "com anon key" e precisa ser escolhido, não herdado de um
    // env var faltando.
    if (token !== "") headers["Authorization"] = `Bearer ${token}`;
  } else {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) {
      throw new Error(
        "SUPABASE_ANON_KEY não está definida nas variáveis de ambiente de teste. " +
          "callFunction() sem `token` existe para exercitar a anon key crua; sem ela a " +
          "chamada iria sem header nenhum e o teste passaria afirmando outro cenário. " +
          "Pegue a chave em `npx supabase status` (PUBLISHABLE_KEY). Para testar de " +
          'propósito a ausência de header, passe `""` como token.'
      );
    }
    headers["Authorization"] = `Bearer ${anonKey}`;
  }

  return await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
