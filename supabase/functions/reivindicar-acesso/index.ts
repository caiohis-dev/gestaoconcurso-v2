import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

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

function mascararEmail(email: string): string {
  const [local, dominio] = email.split('@');
  if (!dominio) return '***';
  const visivel = local.slice(0, 2);
  return `${visivel}${'*'.repeat(Math.max(3, local.length - 2))}@${dominio}`;
}

function buildEmailHtml(nome: string, link: string): string {
  const primeiroNome = (nome || 'Colaborador').split(' ')[0];
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td align="center" style="padding:32px 24px 8px;">
          <img src="https://fevre.online/fevre-logo.png" alt="FEVRE" width="120" style="max-width:120px;height:auto;display:inline-block;"/>
        </td></tr>
        <tr><td style="padding:8px 40px 0;">
          <h1 style="color:#0f172a;font-size:22px;margin:16px 0 8px;">Olá, ${primeiroNome}!</h1>
          <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px;">
            Recebemos um pedido de acesso ao Sistema de Cadastro de Colaboradores com o seu CPF.
            Para criar a sua senha e ativar o acesso, clique no botão abaixo.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:8px 40px 24px;">
          <a href="${link}" style="background:#dc2626;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:8px;display:inline-block;">
            Criar minha senha
          </a>
        </td></tr>
        <tr><td style="padding:0 40px 24px;">
          <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
            Se você não pediu este acesso, ignore este e-mail — nenhuma ação será tomada.
            O link é pessoal e expira em algumas horas.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:16px 40px 32px;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">
            Fundação Educacional de Volta Redonda — <a href="https://fevre.online" style="color:#64748b;text-decoration:none;">fevre.online</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

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

    // --- Dispara o link do Auth e envia com o visual da FEVRE ---
    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:8080';
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${siteUrl}/redefinir-senha` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      // Falha ao gerar (ex.: já existe conta no Auth com esse e-mail sem estar
      // vinculada — caso raro). Não vazamos o motivo; o front cai no genérico.
      console.error('generateLink falhou:', linkErr?.message);
      return jsonResp({ existe: true, ja_vinculado: false, email_mascarado: mascararEmail(email) });
    }

    const html = buildEmailHtml(colab.colab_nome_completo as string, linkData.properties.action_link);
    const sendResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        to: email,
        subject: 'Acesso ao Sistema de Cadastro de Colaboradores — FEVRE',
        html,
      }),
    });
    if (!sendResp.ok) {
      // A conta já foi criada pelo invite; o e-mail é que não saiu. A pessoa ainda
      // consegue entrar por "esqueci minha senha". Logamos e seguimos.
      console.error('send-email falhou:', await sendResp.text());
    }

    return jsonResp({ existe: true, ja_vinculado: false, email_mascarado: mascararEmail(email) });
  } catch (e) {
    return jsonResp({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
