import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { barrarSeExcedeu } from '../_shared/rate-limit.ts';
import { normalizarCpfOuNull } from '../_shared/cpf.ts';

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

    // 🔵 2026-09-21: a checagem migrou para `_shared/cpf.ts` — o defeito consertado
    // aqui em 2026-08-02 (padStart ANTES do length, que fazia entrada curta virar o
    // CPF de outra pessoa) sobreviveu em `reivindicar-acesso` e
    // `incluir-email-cadastro` por sete semanas, porque cada EF reimplementava a
    // própria versão. Agora as quatro usam a mesma função — ver o cabeçalho dela.
    const cpf = normalizarCpfOuNull(parsed.data.cpf);
    if (cpf === null) {
      return new Response(
        JSON.stringify({ error: 'CPF inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const jsonResp = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    // --- Rate limit (escopo 'checagem-cpf') ---
    //
    // Esta porta tambem ficou sem teto ate 2026-09-12, mas o teto dela e' FOLGADO de
    // proposito (30/15min): ela nao tem efeito colateral nenhum — devolve so' `{exists}`,
    // nao escreve e nao envia e-mail. O que o teto barra aqui e' VARREDURA: sem ele,
    // alguem percorre o espaco de CPFs e monta a lista de quem tem cadastro.
    //
    // ⚠️ O 429 e' a MESMA frase generica das outras portas. Um erro especifico daqui
    // ("limite da checagem de CPF") ja' contaria ao atacante que ele achou o endpoint
    // certo para varrer.
    const barrado = await barrarSeExcedeu(supabase, 'checagem-cpf', req, jsonResp);
    if (barrado) return barrado;

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
