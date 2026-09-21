// Envio do link de acesso do colaborador — compartilhado entre reivindicar-acesso
// (subetapa 2B), public-create-colaborador (subetapa 2C) e corrigir-email-acesso
// (Etapa 2 da edição de colab_email).
//
// Envia o link com o visual da FEVRE pela função send-email. O tipo do link depende
// de a conta já existir:
//   'auto'     (padrão) — pergunta ao Auth e escolhe entre os dois abaixo.
//   'invite'            — a conta ainda NÃO existe. O generateLink a cria, e o trigger
//                         on_auth_user_created vincula user_id e concede 'colaborador'
//                         (migration 20260714201650).
//   'recovery'          — a conta JÁ existe (o invite falharia). É o caso da correção
//                         de e-mail, que renomeia a conta em vez de recriá-la: o
//                         vínculo já está de pé, e o link só serve para a pessoa criar
//                         a senha. Ao abri-lo, o Auth também confirma o endereço.
//
// 🔴 O PADRÃO ERA 'invite', E ISSO ERA O DEFEITO (corrigido em 2026-09-19). Quando o
// e-mail já tinha conta, o invite falhava, a reivindicar-acesso descartava o erro e
// respondia "link enviado" — nada saía, e a pessoa ficava com user_id NULL e sem o
// papel 'colaborador'. Perda silenciosa. Hoje o padrão é 'auto': quem passa o tipo
// explícito (recuperar-senha, corrigir-email-acesso) não muda de comportamento.
//
// ⚠️ O 'auto' consulta o Auth ANTES de gerar, mas a consulta não é garantia: a conta
// pode nascer no meio, e a consulta pode cair. Por isso existe também o retry em
// `email_exists` — é ele que fecha a corrida. Se a consulta falha, o tipo escolhido é
// 'invite', que é exatamente o comportamento de antes desta mudança.
//
// Não lança: devolve { ok } para o chamador decidir. Se o generateLink falha, ou o
// e-mail não sai (SMTP), a operação de negócio que chamou (cadastrar, reivindicar,
// corrigir) não deve ser desfeita por causa disso — a pessoa ainda entra por
// "esqueci minha senha". ⚠️ Mas o chamador tem de LOGAR o { ok } falso: foi
// justamente descartá-lo sem olhar que escondeu o defeito acima.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buscarContaPorEmail, type ContaNoAuth, type FetchLike } from './auth-lookup.ts';

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

export type TipoLink = 'invite' | 'recovery';

/**
 * A decisão, pura e testável: conta encontrada pede `recovery`; ausente pede
 * `invite`. Consulta indisponível também dá `invite` — é o comportamento de sempre,
 * e o retry em `email_exists` cobre o caso de a conta existir mesmo assim.
 */
export function escolherTipoLink(conta: ContaNoAuth): TipoLink {
  return conta.estado === 'encontrada' ? 'recovery' : 'invite';
}

/**
 * O GoTrue recusa `invite` em e-mail que já tem conta com HTTP 422 e
 * `error_code: "email_exists"` (medido no Auth local em 2026-09-19). ⚠️ Não basta
 * olhar o `code`: a forma do erro do supabase-js já mudou entre versões, então a
 * mensagem entra como segunda leitura.
 */
function contaJaExiste(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  return code === 'email_exists'
    || msg.includes('email_exists')
    || msg.includes('already been registered')
    || msg.includes('already registered');
}

/**
 * Gera o link e, se o `invite` for recusado porque a conta existe, REPETE como
 * `recovery`. A corrida é real: a conta pode nascer entre a consulta e a geração, e a
 * própria consulta pode cair. Sem este retry, o e-mail se perderia do mesmo jeito.
 */
async function gerarComRetry(
  supabase: SupabaseClient,
  email: string,
  tipo: TipoLink,
  siteUrl: string,
) {
  const gerar = (t: TipoLink) =>
    supabase.auth.admin.generateLink({
      type: t,
      email,
      options: { redirectTo: `${siteUrl}/redefinir-senha` },
    });

  const primeira = await gerar(tipo);

  if (primeira.error && tipo === 'invite' && contaJaExiste(primeira.error)) {
    console.warn('enviar-link-acesso: invite recusado (conta já existe); repetindo como recovery');
    return { tipo: 'recovery' as TipoLink, ...(await gerar('recovery')) };
  }

  return { tipo, ...primeira };
}

/**
 * O log que os chamadores devem fazer quando o envio falha. Existe para que nenhum
 * deles precise de um `if` próprio — foi exatamente um `{ ok }` descartado sem olhar
 * que manteve este defeito invisível por meses.
 */
export function registrarFalhaDeEnvio(
  origem: string,
  alvo: string,
  r: { ok: boolean; tipoUsado?: TipoLink; motivo?: string },
): void {
  if (r.ok) return;
  console.error(
    `${origem}: envio do link falhou (tipo=${r.tipoUsado ?? '?'}) para ${alvo}: ${r.motivo ?? 'sem motivo'}`,
  );
}

/**
 * Grava a trilha de envio (migration 20260921005259). NUM SÓ PONTO — dentro deste
 * módulo, não em cada chamador — pela mesma razão de `registrarFalhaDeEnvio`: um
 * `{ ok }` esquecido por um chamador já escondeu um defeito real por meses.
 *
 * ⚠️ BEST-EFFORT, NUNCA LANÇA. A escrita da trilha não pode derrubar o envio real —
 * mesmo contrato de não-lançar do resto deste módulo. Se o INSERT falhar (RLS,
 * conexão, o que for), fica só o `console.error`; o chamador nunca sabe.
 */
async function registrarTrilhaDeEnvio(
  supabase: SupabaseClient,
  row: {
    colaboradorId?: string;
    colabNome?: string;
    email: string;
    origem: string;
    tipoUsado: TipoLink;
    sucesso: boolean;
    motivo?: string;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('log_envio_link_acesso').insert({
      colaborador_id: row.colaboradorId ?? null,
      colab_nome: row.colabNome ?? null,
      email: row.email,
      origem: row.origem,
      tipo_usado: row.tipoUsado,
      sucesso: row.sucesso,
      motivo_falha: row.sucesso ? null : (row.motivo ?? null),
    });
    if (error) {
      console.error('enviar-link-acesso: falha ao gravar a trilha de envio:', error.message);
    }
  } catch (e) {
    console.error('enviar-link-acesso: exceção ao gravar a trilha de envio:', (e as Error).message);
  }
}

export async function enviarLinkAcesso(
  supabase: SupabaseClient,
  params: {
    email: string;
    nome: string;
    // De qual porta veio a chamada — vira `origem` na trilha. Obrigatório de
    // propósito: sem ele, a linha gravada não diz quem disparou.
    origem: string;
    // Quando o chamador já tem a linha de `colaboradores` (a maioria tem). Fica de
    // fora só quando a conta é de gestão pura (admin/coordenador sem colaborador) —
    // ver o comentário da migration sobre por que a coluna é nullable.
    colaboradorId?: string;
    tipo?: TipoLink | 'auto';
    contexto?: Contexto;
    fetchImpl?: FetchLike;
  },
): Promise<{ ok: boolean; tipoUsado?: TipoLink; motivo?: string }> {
  const siteUrl = Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:8080';
  const doFetch = params.fetchImpl ?? fetch;
  const pedido = params.tipo ?? 'auto';

  // Todo retorno passa por aqui — é o que garante UMA gravação por chamada, em
  // qualquer um dos três desfechos possíveis (generateLink falhou, send-email falhou,
  // ou deu certo), sem repetir o INSERT em cada `return`.
  const finalizar = async (
    resultado: { ok: boolean; tipoUsado: TipoLink; motivo?: string },
  ) => {
    await registrarTrilhaDeEnvio(supabase, {
      colaboradorId: params.colaboradorId,
      colabNome: params.nome,
      email: params.email,
      origem: params.origem,
      tipoUsado: resultado.tipoUsado,
      sucesso: resultado.ok,
      motivo: resultado.motivo,
    });
    return resultado;
  };

  const escolhido: TipoLink = pedido === 'auto'
    ? escolherTipoLink(await buscarContaPorEmail(params.email, { fetchImpl: doFetch }))
    : pedido;

  const { tipo, data: linkData, error: linkErr } = await gerarComRetry(
    supabase,
    params.email,
    escolhido,
    siteUrl,
  );

  if (linkErr || !linkData?.properties?.action_link) {
    console.error('generateLink falhou:', linkErr?.message);
    return finalizar({ ok: false, tipoUsado: tipo, motivo: linkErr?.message ?? 'link vazio' });
  }

  const contexto = params.contexto ?? 'primeiro-acesso';
  const html = buildEmailHtml(params.nome, linkData.properties.action_link, contexto);
  const sendResp = await doFetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
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
    const texto = await sendResp.text();
    console.error('send-email falhou:', texto);
    return finalizar({ ok: false, tipoUsado: tipo, motivo: texto });
  }
  return finalizar({ ok: true, tipoUsado: tipo });
}
