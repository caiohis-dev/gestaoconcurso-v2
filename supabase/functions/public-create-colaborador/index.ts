import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  colab_matricula: z.string().max(6).nullable().optional(),
  colab_nome_completo: z.string().min(1).max(40),
  colab_cpf: z.string().min(1).max(11),
  colab_data_nascimento: z.string().min(1),
  colab_nacionalidade: z.string().max(10).nullable().optional(),
  colab_pis: z.string().max(11).nullable().optional(),
  colab_rua: z.string().max(34).nullable().optional(),
  colab_numero_casa: z.number().nullable().optional(),
  colab_bairro: z.string().max(26).nullable().optional(),
  colab_cidade: z.string().max(15).nullable().optional(),
  colab_cep: z.number().nullable().optional(),
  colab_estado_civil: z.number().nullable().optional(),
  colab_raca: z.number().nullable().optional(),
  colab_grau_instrucao: z.number().nullable().optional(),
  colab_telefone: z.number().nullable().optional(),
  colab_complemento_endereco: z.string().max(20).nullable().optional(),
  colab_deficiente: z.boolean().optional().default(false),
  colab_email: z.string().email().max(255).nullable().optional().or(z.literal('')),
  colab_chave_pix: z.string().max(255).nullable().optional(),
  colab_codigo_acesso: z.string().regex(/^\d{4}$/, 'Código de acesso deve ter 4 dígitos'),
  codigo_banco: z.string().regex(/^\d{3}$/, 'Código do banco deve ter 3 dígitos').nullable().optional().or(z.literal('')),
  agencia: z.string().regex(/^\d{1,8}$/, 'Agência deve conter apenas números').nullable().optional().or(z.literal('')),
  agencia_dv: z.string().regex(/^[0-9xX]{1,2}$/, 'DV da agência inválido').nullable().optional().or(z.literal('')),
  conta: z.string().regex(/^\d{1,20}$/, 'Conta deve conter apenas números').nullable().optional().or(z.literal('')),
  conta_dv: z.string().regex(/^[0-9xX]{1,2}$/, 'DV da conta inválido').nullable().optional().or(z.literal('')),
  tipo_conta: z.enum(['corrente', 'poupanca']).nullable().optional().or(z.literal('')),
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
        JSON.stringify({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payload = { ...parsed.data };
    payload.colab_cpf = payload.colab_cpf.replace(/\D/g, '').padStart(11, '0');
    if (payload.colab_email === '') payload.colab_email = null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Duplicate CPF check
    const { data: existing } = await supabase
      .from('colaboradores')
      .select('id')
      .eq('colab_cpf', payload.colab_cpf)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'CPF já cadastrado' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data, error } = await supabase
      .from('colaboradores')
      .insert(payload)
      .select('id, colab_codigo_acesso')
      .single();

    if (error) {
      let message = error.message;
      let status = 400;
      if (message.includes('duplicate key')) {
        if (message.includes('colab_cpf')) { message = 'CPF já cadastrado'; status = 409; }
        else if (message.includes('colab_matricula')) { message = 'Matrícula já cadastrada'; status = 409; }
        else if (message.includes('colab_pis')) { message = 'PIS já cadastrado'; status = 409; }
        else if (message.includes('colab_codigo_acesso')) { message = 'Código de acesso já está em uso'; status = 409; }
      } else if (message.includes('colab_codigo_acesso_format')) {
        message = 'Código de acesso deve ter 4 dígitos numéricos';
      }
      return new Response(
        JSON.stringify({ error: message }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id, codigo_acesso: data.colab_codigo_acesso }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
