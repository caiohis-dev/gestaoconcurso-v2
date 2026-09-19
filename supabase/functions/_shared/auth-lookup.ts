// Consulta "este e-mail já tem conta no Auth?" — um lugar só.
//
// Extraído da recuperar-senha em 2026-09-19, quando o enviar-link-acesso passou a
// precisar da mesma resposta para escolher entre `invite` e `recovery`.
//
// 🔴 O `?filter=` do GoTrue é busca PARCIAL: `ana@x.com` casa também com
// `mariana@x.com`. A conferência exata depois NÃO é refinamento, é a correção — sem
// ela, mandar link para "a conta encontrada" pode ser mandar para outra pessoa.
//
// Três respostas, não duas. "Não consegui perguntar" é diferente de "não existe", e
// quem chama decide o que fazer com isso: o enviar-link-acesso cai no `invite`, que é
// o comportamento de sempre, em vez de inventar um `recovery` para conta que talvez
// não exista.

export type ContaNoAuth =
  | { estado: 'encontrada'; user: Record<string, unknown> }
  | { estado: 'ausente' }
  | { estado: 'indisponivel' };

/** Permite injetar o fetch nos testes — a suíte Deno roda sem rede. */
export type FetchLike = typeof fetch;

export async function buscarContaPorEmail(
  email: string,
  opts?: { fetchImpl?: FetchLike; supabaseUrl?: string; serviceKey?: string },
): Promise<ContaNoAuth> {
  const alvo = email.trim().toLowerCase();
  if (!alvo) return { estado: 'ausente' };

  const supabaseUrl = opts?.supabaseUrl ?? Deno.env.get('SUPABASE_URL')!;
  const serviceKey = opts?.serviceKey ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const doFetch = opts?.fetchImpl ?? fetch;

  let resp: Response;
  try {
    resp = await doFetch(
      `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(alvo)}`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
    );
  } catch (e) {
    console.error('admin/users não respondeu:', (e as Error).message);
    return { estado: 'indisponivel' };
  }

  if (!resp.ok) {
    console.error('admin/users falhou:', resp.status, await resp.text());
    return { estado: 'indisponivel' };
  }

  const { users } = await resp.json() as { users: Array<Record<string, unknown>> };
  const user = (users ?? []).find(
    (u) => String(u.email ?? '').trim().toLowerCase() === alvo,
  );

  return user ? { estado: 'encontrada', user } : { estado: 'ausente' };
}
