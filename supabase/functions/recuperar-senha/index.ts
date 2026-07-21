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

// Teto por IP, além do cooldown por conta. Passou a ser necessário quando esta função
// ganhou o ramo de estado A: ali o invite CRIA conta, e o cooldown por conta não
// protege a primeira chamada de cada e-mail — alguém com a lista de e-mails dispararia
// uma leva inteira. Mesmos números da reivindicar-acesso (a outra porta pública).
//
// Deliberadamente a MESMA tabela da reivindicar-acesso: as duas portas dividem um só
// orçamento, senão o atacante somaria 5 pelo CPF mais 5 pelo e-mail. O 429 daqui não
// vaza nada — é por IP, não por conta, e não diz se o e-mail existe.
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

    // --- Rate limit por IP (orçamento compartilhado com a reivindicar-acesso) ---
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

    // Sem conta no Auth NÃO significa "não tem nada aqui". A maioria dos colaboradores
    // está no estado A: cadastro existe, conta nunca foi criada. Para essa pessoa o que
    // resolve é o INVITE (que cria a conta e o trigger vincula), não o recovery — é o
    // mesmo raciocínio que o servidor já faz pelo CPF na reivindicar-acesso, aplicado
    // ao e-mail. Sem este ramo, a porta única prometeria justamente para a maioria e
    // não entregaria: resposta genérica e nenhum e-mail saindo.
    if (!user) {
      const { data: colabA } = await supabase
        .from('colaboradores')
        .select('colab_nome_completo')
        .ilike('colab_email', email)
        .is('user_id', null)
        .maybeSingle();

      if (!colabA) {
        console.log('recuperar-senha: sem conta e sem cadastro para o e-mail (resposta genérica)');
        return jsonResp(RESPOSTA_GENERICA);
      }

      // Cooldown aqui é indireto: o invite CRIA a conta, então a segunda chamada já cai
      // no ramo de cima — e é por isso que aquele cooldown precisa olhar
      // `confirmation_sent_at`/`invited_at`, não só `recovery_sent_at` (que o invite
      // deixa NULL). Ver o comentário lá em cima.
      const { ok: okInvite } = await enviarLinkAcesso(supabase, {
        email,
        nome: (colabA.colab_nome_completo as string | undefined) ?? '',
        tipo: 'invite',
        contexto: 'primeiro-acesso',
      });
      if (!okInvite) console.error('recuperar-senha: invite falhou para cadastro em estado A');

      console.log('recuperar-senha: estado A localizado por e-mail, invite enviado');
      return jsonResp(RESPOSTA_GENERICA);
    }

    // Cooldown. Também genérico: um 429 aqui revelaria que a conta existe.
    //
    // Olha os TRÊS carimbos, não só o recovery_sent_at: o generateLink('invite') grava
    // `confirmation_sent_at`/`invited_at` e deixa `recovery_sent_at` NULL. Considerar só
    // o recovery deixaria passar o pior caso — quem acabou de receber o invite (pelo
    // ramo de estado A logo abaixo, ou pela reivindicar-acesso) pediria de novo e
    // receberia um recovery na hora, e esse segundo link INVALIDA o primeiro. A pessoa
    // então abre o e-mail do invite, que é o que costuma chegar primeiro, e ele já morreu.
    const carimbos = [user.recovery_sent_at, user.confirmation_sent_at, user.invited_at]
      .filter(Boolean)
      .map((t) => new Date(String(t)).getTime())
      .filter((t) => !Number.isNaN(t));
    const ultimoEnvio = carimbos.length ? new Date(Math.max(...carimbos)) : null;

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
