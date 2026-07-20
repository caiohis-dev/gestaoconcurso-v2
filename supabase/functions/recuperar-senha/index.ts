import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { enviarLinkAcesso } from '../_shared/enviar-link-acesso.ts';

// Recuperação de senha pelo caminho da casa.
//
// Substitui o supabase.auth.resetPasswordForEmail (fluxo nativo do GoTrue) no
// Auth.tsx. Motivo: o nativo é composto e enviado pelo próprio Auth, com o SMTP
// DELE — que localmente é o [local_smtp] (Mailpit, porta 54324) e em produção seria
// o serviço embutido do Supabase, fortemente limitado. Nenhum dos dois passa pela
// send-email, então aquele e-mail não tinha o visual da FEVRE nem saía pela
// Hostinger. Aqui geramos o link com generateLink e enviamos pelo mesmo caminho de
// todo o resto do sistema.
//
// O que se PERDE ao sair do fluxo nativo, e que esta função precisa repor:
//   1. Anti-enumeração — o nativo nunca revela se a conta existe. O generateLink
//      falha de forma distinguível quando ela não existe, então TODA saída daqui é
//      genérica: mesma resposta para conta existente, inexistente ou em cooldown.
//      Quem quebrar isso transforma a tela de login num oráculo de quem tem cadastro.
//   2. Rate limit — o nativo tem teto embutido (max_frequency, por IP). Com
//      service_role passamos por cima de tudo, então o teto volta aqui pelo
//      recovery_sent_at (ver COOLDOWN_MIN).
const BodySchema = z.object({
  email: z.string().email().max(255),
});

// Janela mínima entre dois envios para a MESMA conta. Cobre dois problemas de uma
// vez: bombardear de e-mail quem tem cadastro, e a rotação de token — cada
// generateLink invalida o link anterior, então clicar "enviar" duas vezes mataria o
// link do primeiro e-mail, que costuma ser justamente o que a pessoa abre.
//
// O teto por conta basta para o risco real: o generateLink só produz link para conta
// existente, então não dá para varrer endereços quaisquer. Um limite por IP (padrão
// da reivindicar-acesso, tabela reivindicacao_rate_limit) só faria falta contra
// ataque distribuído mirando muitas contas ao mesmo tempo — fica como evolução.
const COOLDOWN_MIN = 2;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // A resposta de sucesso é sempre esta, aconteça o que acontecer com a conta.
  const RESPOSTA_GENERICA = {
    ok: true,
    mensagem: 'Se existir uma conta com esse e-mail, o link de redefinição foi enviado.',
  };

  try {
    const parsed = BodySchema.safeParse(await req.json());
    // E-mail malformado é a única recusa visível: não diz nada sobre existir conta.
    if (!parsed.success) return jsonResp({ error: 'E-mail inválido' }, 400);

    const email = parsed.data.email.trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Localiza a conta no Auth. O supabase-js não filtra listUsers por e-mail, então
    // vai direto no endpoint admin do GoTrue. O `filter` é busca parcial — o
    // e-mail exato é conferido depois, senão "ana@x.com" casaria com "mariana@x.com".
    const resp = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
    );

    if (!resp.ok) {
      console.error('admin/users falhou:', resp.status, await resp.text());
      return jsonResp(RESPOSTA_GENERICA);
    }

    const { users } = await resp.json() as { users: Array<Record<string, unknown>> };
    const user = (users ?? []).find(
      (u) => String(u.email ?? '').trim().toLowerCase() === email,
    );

    // Conta não existe: silêncio. Mesma resposta, mesmo tempo de espera aparente.
    if (!user) {
      console.log('recuperar-senha: sem conta para o e-mail informado (resposta genérica)');
      return jsonResp(RESPOSTA_GENERICA);
    }

    // Cooldown. Também genérico: um 429 aqui revelaria que a conta existe.
    const ultimoEnvio = user.recovery_sent_at ? new Date(String(user.recovery_sent_at)) : null;
    if (ultimoEnvio && Date.now() - ultimoEnvio.getTime() < COOLDOWN_MIN * 60_000) {
      console.log('recuperar-senha: em cooldown, envio suprimido (resposta genérica)');
      return jsonResp(RESPOSTA_GENERICA);
    }

    // Nome só para o "Olá, <primeiro nome>" do e-mail. Nem toda conta é colaborador
    // (admin/coordenador não têm linha em colaboradores), daí o fallback do helper.
    const { data: colab } = await supabase
      .from('colaboradores')
      .select('colab_nome_completo')
      .ilike('colab_email', email)
      .maybeSingle();

    const { ok } = await enviarLinkAcesso(supabase, {
      email,
      nome: (colab?.colab_nome_completo as string | undefined) ?? '',
      tipo: 'recovery',
      contexto: 'redefinir',
    });

    // Falha de envio não vira erro visível: diria que a conta existe. Fica no log.
    if (!ok) console.error('recuperar-senha: envio do link falhou para a conta localizada');

    return jsonResp(RESPOSTA_GENERICA);
  } catch (e) {
    console.error('recuperar-senha:', (e as Error).message);
    return jsonResp({ error: 'Erro interno' }, 500);
  }
});
