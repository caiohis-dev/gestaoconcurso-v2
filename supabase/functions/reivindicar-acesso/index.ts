import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { enviarLinkAcesso, mascararEmail } from '../_shared/enviar-link-acesso.ts';

// Subetapa 2B — reivindicação do acesso do colaborador.
//
// Substitui o papel de "localizar cadastro pelo CPF" da check-cpf-colaborador, mas
// sem o vazamento dela (aquela devolvia o e-mail inteiro). Aqui o cliente só recebe
// {existe, ja_vinculado, email_mascarado} — o e-mail completo nunca sai do servidor.
//
// Efeito colateral quando cabe: dispara um link do Supabase Auth (generateLink type
// invite) para o e-mail do cadastro e o envia com o visual da FEVRE via send-email.
// Ao criar a conta, o trigger on_auth_user_created vincula user_id e concede o papel
// 'colaborador' (ver migration 20260714201650). Nada de vínculo é feito aqui.

const BodySchema = z.object({
  cpf: z.string().min(1).max(20),
});

// Teto do rate limit: no máximo N tentativas por IP na janela. A função revela se um
// CPF existe (concessão aceita no desenho); o teto impede varrer CPFs em massa e
// disparar e-mails em série.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_JANELA_MIN = 15;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonResp({ error: 'Dados inválidos' }, 400);

    const cpf = parsed.data.cpf.replace(/\D/g, '').padStart(11, '0');
    if (cpf.length !== 11) return jsonResp({ error: 'CPF inválido' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Rate limit por IP ---
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido';
    const desde = new Date(Date.now() - RATE_LIMIT_JANELA_MIN * 60_000).toISOString();
    const { count } = await supabase
      .from('reivindicacao_rate_limit')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', desde);
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return jsonResp({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, 429);
    }
    await supabase.from('reivindicacao_rate_limit').insert({ ip });

    // --- Localiza o cadastro ---
    const { data: colab, error: fetchErr } = await supabase
      .from('colaboradores')
      .select('id, colab_email, colab_nome_completo, user_id')
      .eq('colab_cpf', cpf)
      .maybeSingle();

    if (fetchErr) return jsonResp({ error: fetchErr.message }, 500);

    if (!colab) return jsonResp({ existe: false, ja_vinculado: false, email_mascarado: null });

    const jaVinculado = colab.user_id !== null;
    const email = (colab.colab_email as string | null)?.trim() || null;

    // Já tem conta, ou não tem e-mail para onde mandar: só informa o estado. O
    // front orienta (login/esqueci-senha, ou procurar o coordenador). Nenhum link.
    if (jaVinculado || !email) {
      return jsonResp({
        existe: true,
        ja_vinculado: jaVinculado,
        email_mascarado: email ? mascararEmail(email) : null,
      });
    }

    // Dispara o link do Auth (o helper cria a conta pelo invite e envia com o visual
    // da FEVRE; o trigger vincula). Uma falha aqui não muda a resposta ao cliente:
    // a conta pode ter sido criada e a pessoa ainda entra por "esqueci minha senha".
    await enviarLinkAcesso(supabase, { email, nome: colab.colab_nome_completo as string });

    return jsonResp({ existe: true, ja_vinculado: false, email_mascarado: mascararEmail(email) });
  } catch (e) {
    return jsonResp({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
