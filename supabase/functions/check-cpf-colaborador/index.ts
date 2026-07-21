import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  cpf: z.string().min(1).max(20),
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

    const { data, error } = await supabase
      .from('colaboradores')
      .select('id')
      .eq('colab_cpf', cpf)
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Só o booleano. O e-mail NÃO sai daqui — quem precisa localizar o cadastro para
    // reivindicar usa reivindicar-acesso, que devolve o e-mail mascarado. Devolver o
    // endereço inteiro aqui era um oráculo: varrer CPFs entregava uma lista de e-mails.
    return new Response(
      JSON.stringify({ exists: !!data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
