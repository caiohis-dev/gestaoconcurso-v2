import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { enviarLinkAcesso, mascararEmail } from '../_shared/enviar-link-acesso.ts';

// Subetapa 2C: o cadastro público cria a linha de colaborador e dispara o link de
// acesso (invite) para o e-mail informado — o mesmo fluxo da reivindicação. Não pede
// mais o código de 4 dígitos. O vínculo com a conta é feito pelo trigger no signup.

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
  // E-mail é obrigatório: é para ele que o link de acesso vai. Sem e-mail, não há
  // como a pessoa criar a senha.
  colab_email: z.string().email('E-mail inválido').max(255),
  colab_chave_pix: z.string().max(255).nullable().optional(),
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
    payload.colab_email = payload.colab_email.trim();

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
      .select('id, colab_nome_completo, colab_email')
      .single();

    if (error) {
      let message = error.message;
      let status = 400;
      if (message.includes('duplicate key')) {
        if (message.includes('colab_cpf')) { message = 'CPF já cadastrado'; status = 409; }
        else if (message.includes('colab_matricula')) { message = 'Matrícula já cadastrada'; status = 409; }
        else if (message.includes('colab_pis')) { message = 'PIS já cadastrado'; status = 409; }
        else if (message.includes('colab_email')) { message = 'Este e-mail já está em uso por outro cadastro'; status = 409; }
      }
      return new Response(
        JSON.stringify({ error: message }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Dispara o link de acesso (invite) para o e-mail do cadastro. O trigger vincula a
    // conta ao criar. Uma falha de envio não desfaz o cadastro — a linha já existe e a
    // pessoa pode reivindicar/recuperar depois.
    await enviarLinkAcesso(supabase, {
      email: data.colab_email as string,
      nome: data.colab_nome_completo as string,
    });

    return new Response(
      JSON.stringify({ success: true, id: data.id, email_mascarado: mascararEmail(data.colab_email as string) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
