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
 * Wrapper para chamar as funções locais
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

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    // Se não mandar token explícito, tenta mandar a anon key
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (anonKey) {
      headers["Authorization"] = `Bearer ${anonKey}`;
    }
  }

  return await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
