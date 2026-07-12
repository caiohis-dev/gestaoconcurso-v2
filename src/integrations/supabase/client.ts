// Cliente Supabase da aplicação. Mantido à mão — o `fetch` customizado abaixo corrige
// o `expires_at` das respostas de auth. (O arquivo gerado automaticamente é o `types.ts`,
// via Supabase CLI; esse sim não deve ser editado.)
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

const adjustAuthSessionExpiry = (payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object') return payload;

  const copy = { ...(payload as Record<string, unknown>) };
  const expiresIn = copy.expires_in;

  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    copy.expires_at = Math.floor(Date.now() / 1000) + expiresIn;
  }

  if (copy.session && typeof copy.session === 'object') {
    copy.session = adjustAuthSessionExpiry(copy.session);
  }

  return copy;
};

const fetchWithAdjustedAuthExpiry: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const requestUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  const isAuthSessionRequest =
    requestUrl.includes('/auth/v1/token') || requestUrl.includes('/auth/v1/verify');

  if (!response.ok || !isAuthSessionRequest) {
    return response;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return response;
  }

  try {
    const payload = await response.clone().json();
    const adjustedPayload = adjustAuthSessionExpiry(payload);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('content-type', 'application/json;charset=UTF-8');

    return new Response(JSON.stringify(adjustedPayload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: fetchWithAdjustedAuthExpiry,
  },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});