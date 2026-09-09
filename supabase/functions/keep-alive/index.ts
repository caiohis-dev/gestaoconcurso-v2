import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Sinal de vida do banco de produção. Chamada por um cron DIÁRIO no servidor Ubuntu que
// já serve o fevre.online — o gatilho é externo de propósito: um agendador dentro do banco
// (pg_cron) morreria junto com o que deveria prevenir, porque projeto pausado não roda
// cron nenhum. (E `pg_cron` nem está habilitado aqui: nenhuma migration cria extensão.)
//
// Por que Edge Function e não um RPC chamado direto pelo cron: um RPC alcançável de fora
// exigiria `GRANT EXECUTE ... TO anon`, reabrindo a superfície do `anon` — exatamente o
// que custou caro em 31/07. Aqui a escrita usa a SERVICE_ROLE_KEY que a PLATAFORMA INJETA,
// então não se concede nada ao `anon` nem se guarda chave poderosa no servidor.

const HEADER_TOKEN = 'x-keep-alive-token';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // 🔴 FALHA FECHADA, e isto é o INVERSO DELIBERADO do defeito do `SITE_URL`.
    //
    // `_shared/enviar-link-acesso.ts` faz `Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:8080'`:
    // sem o secret, o fallback entra calado, a função responde SUCESSO e só o destinatário
    // descobre. Aqui é o oposto — secret ausente vira recusa explícita, e o `curl -f` do
    // cron transforma isso em erro visível no log em vez de silêncio.
    const esperado = Deno.env.get('KEEP_ALIVE_TOKEN');
    if (!esperado) {
      return json(
        { error: 'KEEP_ALIVE_TOKEN não configurado — recusando por padrão' },
        503,
      );
    }

    if (req.headers.get(HEADER_TOKEN) !== esperado) {
      return json({ error: 'Não autorizado' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // O upsert (e o incremento do contador) mora no banco, numa operação atômica só.
    const { data, error } = await supabase.rpc('registrar_batida_saude');

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, batida: data }, 200);
  } catch (e) {
    return json({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
