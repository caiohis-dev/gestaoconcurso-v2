// Envio do link de acesso do colaborador — compartilhado entre reivindicar-acesso
// (subetapa 2B), public-create-colaborador (subetapa 2C) e corrigir-email-acesso
// (Etapa 2 da edição de colab_email).
//
// Envia o link com o visual da FEVRE pela função send-email. O tipo do link depende
// de a conta já existir:
//   'invite'   (padrão) — a conta ainda NÃO existe. O generateLink a cria, e o trigger
//                         on_auth_user_created vincula user_id e concede 'colaborador'
//                         (migration 20260714201650).
//   'recovery'          — a conta JÁ existe (o invite falharia). É o caso da correção
//                         de e-mail, que renomeia a conta em vez de recriá-la: o
//                         vínculo já está de pé, e o link só serve para a pessoa criar
//                         a senha. Ao abri-lo, o Auth também confirma o endereço.
//
// Não lança: devolve { ok } para o chamador decidir. Se o generateLink falha, ou o
// e-mail não sai (SMTP), a operação de negócio que chamou (cadastrar, reivindicar,
// corrigir) não deve ser desfeita por causa disso — a pessoa ainda entra por
// "esqueci minha senha".
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// O texto muda conforme o que a pessoa vai fazer, e isso NÃO é o mesmo que o `tipo`
// do link: a correção de e-mail (corrigir-email-acesso) usa link 'recovery' por razão
// técnica — o invite falha em conta existente — mas para a pessoa continua sendo o
// primeiro acesso. Por isso o contexto é um parâmetro à parte.
type Contexto = 'primeiro-acesso' | 'redefinir';

const COPY: Record<Contexto, { intro: string; botao: string; ignorar: string }> = {
  'primeiro-acesso': {
    intro: 'Para criar a sua senha e acessar o Sistema de Cadastro de Colaboradores, clique no botão abaixo.',
    botao: 'Criar minha senha',
    ignorar: 'Se você não pediu este acesso, ignore este e-mail — nenhuma ação será tomada.',
  },
  redefinir: {
    intro: 'Recebemos um pedido para redefinir a sua senha do Sistema de Cadastro de Colaboradores. Clique no botão abaixo para escolher uma nova.',
    botao: 'Redefinir minha senha',
    ignorar: 'Se você não pediu a redefinição, ignore este e-mail — sua senha atual continua valendo.',
  },
};

export function buildEmailHtml(nome: string, link: string, contexto: Contexto = 'primeiro-acesso'): string {
  const primeiroNome = (nome || 'Colaborador').split(' ')[0];
  const copy = COPY[contexto];
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
            ${copy.intro}
          </p>
        </td></tr>
        <tr><td align="center" style="padding:8px 40px 24px;">
          <a href="${link}" style="background:#dc2626;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:8px;display:inline-block;">
            ${copy.botao}
          </a>
        </td></tr>
        <tr><td style="padding:0 40px 24px;">
          <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
            ${copy.ignorar}
            O link é pessoal e expira em 1 hora.
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

export function mascararEmail(email: string): string {
  const [local, dominio] = email.split('@');
  if (!dominio) return '***';
  const visivel = local.slice(0, 2);
  return `${visivel}${'*'.repeat(Math.max(3, local.length - 2))}@${dominio}`;
}

export async function enviarLinkAcesso(
  supabase: SupabaseClient,
  params: { email: string; nome: string; tipo?: 'invite' | 'recovery'; contexto?: Contexto },
): Promise<{ ok: boolean }> {
  const siteUrl = Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:8080';

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: params.tipo ?? 'invite',
    email: params.email,
    options: { redirectTo: `${siteUrl}/redefinir-senha` },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.error('generateLink falhou:', linkErr?.message);
    return { ok: false };
  }

  const contexto = params.contexto ?? 'primeiro-acesso';
  const html = buildEmailHtml(params.nome, linkData.properties.action_link, contexto);
  const sendResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      to: params.email,
      subject: contexto === 'redefinir'
        ? 'Redefinição de senha — Sistema de Cadastro de Colaboradores FEVRE'
        : 'Acesso ao Sistema de Cadastro de Colaboradores — FEVRE',
      html,
    }),
  });

  if (!sendResp.ok) {
    console.error('send-email falhou:', await sendResp.text());
    return { ok: false };
  }
  return { ok: true };
}
