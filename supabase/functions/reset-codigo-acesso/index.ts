import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  cpf: z.string().min(1).max(20),
  email: z.string().email().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const json = await req.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cpf = parsed.data.cpf.replace(/\D/g, '').padStart(11, '0');
    if (cpf.length !== 11) {
      return new Response(
        JSON.stringify({ error: 'CPF inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: colab, error: fetchErr } = await supabase
      .from('colaboradores')
      .select('id, colab_email, colab_nome_completo')
      .eq('colab_cpf', cpf)
      .maybeSingle();

    if (fetchErr) {
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!colab) {
      return new Response(
        JSON.stringify({ error: 'Colaborador não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let emailToUse = colab.colab_email as string | null;
    if (!emailToUse) {
      const providedEmail = parsed.data.email?.trim();
      if (!providedEmail) {
        return new Response(
          JSON.stringify({ error: 'Colaborador sem email cadastrado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const { error: emailUpdErr } = await supabase
        .from('colaboradores')
        .update({ colab_email: providedEmail })
        .eq('id', colab.id);
      if (emailUpdErr) {
        return new Response(
          JSON.stringify({ error: emailUpdErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      emailToUse = providedEmail;
    }

    const codigo = String(Math.floor(Math.random() * 10000)).padStart(4, '0');

    const { error: updErr } = await supabase
      .from('colaboradores')
      .update({ colab_codigo_acesso: codigo })
      .eq('id', colab.id);

    if (updErr) {
      return new Response(
        JSON.stringify({ error: updErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        email: emailToUse,
        nome: colab.colab_nome_completo,
        codigo,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
