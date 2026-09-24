import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { enviarLinkAcesso, registrarFalhaDeEnvio } from '../_shared/enviar-link-acesso.ts';
import { buscarContaPorEmail } from '../_shared/auth-lookup.ts';

// Concede papel de sistema (superadmin / admin / financeiro) a um COLABORADOR.
//
// Substitui a `create-admin` (2026-09-24), que criava a conta com senha escolhida pelo
// admin e e-mail confirmado sem prova de posse — e, com e-mail que já tinha conta,
// SOBRESCREVIA A SENHA da pessoa. Aqui não há senha em lugar nenhum:
//   - colaborador já vinculado → só o papel; nada de e-mail, senha ou confirmação;
//   - sem vínculo → o link de acesso (`invite` cria a conta na hora, e o trigger
//     `handle_new_user` vincula e concede 'colaborador'; `recovery` se o e-mail já tinha
//     conta, e o gatilho de login vincula depois). A pessoa define a PRÓPRIA senha.
//
// 🔴 O e-mail sai do CADASTRO, nunca do corpo. É o princípio da `conceder_coordenador`:
// a conta é derivada, não informada. Campo de e-mail livre era o que deixava a
// `create-coordenador` criar conta que não casava com cadastro nenhum.
//
// ⚠️ Não há rollback de conta. Se o convite criou a conta e o e-mail não saiu, o papel
// é concedido assim mesmo e a resposta diz que o e-mail falhou — a pessoa entra por
// "Estou sem minha senha". `deleteUser` aqui apagaria `profiles`/`user_roles` em
// CASCADE: foi o defeito 2 da `create-coordenador`.

const PAPEIS_SISTEMA = ['superadmin', 'admin', 'financeiro'] as const;
type PapelSistema = typeof PAPEIS_SISTEMA[number];

const jsonResp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ─── Quem está chamando? ─────────────────────────────────────────────────────
    // `verify_jwt` NÃO é autorização: a anon key é um JWT válido e público. Sem esta
    // checagem, qualquer um com o bundle concederia superadmin (foi o estado da
    // `create-admin` até 2026-07-25).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResp({ error: 'Não autenticado' }, 401);
    }
    const supabaseCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await supabaseCaller.auth.getUser();
    if (callerErr || !caller) {
      return jsonResp({ error: 'Não autenticado' }, 401);
    }

    // Superadmin, não admin: quem concede aqui pode conceder superadmin, ou seja, pode se
    // replicar. Via `has_role`, nunca SELECT literal em `user_roles` (a hierarquia mora
    // dentro da função).
    const { data: ehSuperadmin, error: papelErr } = await supabaseAdmin.rpc('has_role', {
      _user_id: caller.id,
      _role: 'superadmin',
    });
    if (papelErr) {
      console.error('Falha ao verificar permissão do chamador:', papelErr);
      return jsonResp({ error: 'Falha ao verificar permissão' }, 500);
    }
    if (!ehSuperadmin) {
      return jsonResp({ error: 'Só um superadmin pode conceder papéis de sistema.' }, 403);
    }

    const corpo = await req.json().catch(() => ({})) as { colaborador_id?: unknown; role?: unknown };
    const colaboradorId = typeof corpo.colaborador_id === 'string' ? corpo.colaborador_id : '';
    const role = corpo.role;

    // `coordenador` é recusado com a providência, não rebaixado: o papel sozinho passa
    // pelos guards e abre telas vazias (o meio-usuário que levou a fabricar alocação).
    if (role === 'coordenador') {
      return jsonResp({
        error:
          'Acesso de coordenador não é concedido aqui. Aloque a pessoa na prova com função de coordenação e conceda pelo painel da prova.',
      }, 400);
    }
    if (!PAPEIS_SISTEMA.includes(role as PapelSistema)) {
      return jsonResp({ error: 'Papel inválido. Use superadmin, admin ou financeiro.' }, 400);
    }
    if (!colaboradorId) {
      return jsonResp({ error: 'Informe o colaborador.' }, 400);
    }

    const { data: colab, error: colabErr } = await supabaseAdmin
      .from('colaboradores')
      .select('id, colab_nome_completo, colab_email, user_id')
      .eq('id', colaboradorId)
      .maybeSingle();
    if (colabErr) {
      console.error('Falha ao ler o colaborador:', colabErr);
      return jsonResp({ error: 'Falha ao ler o cadastro do colaborador.' }, 500);
    }
    if (!colab) {
      return jsonResp({ error: 'Colaborador não encontrado.' }, 404);
    }

    const nome = (colab.colab_nome_completo as string | null) ?? '';
    const email = (colab.colab_email as string | null)?.trim() || '';

    let userId = colab.user_id as string | null;
    let envio: { ok: boolean } | null = null;

    if (!userId) {
      if (!email) {
        return jsonResp({
          error: 'Este colaborador não tem e-mail no cadastro. Cadastre o e-mail dele em /colaboradores antes de conceder o acesso.',
        }, 400);
      }

      const r = await enviarLinkAcesso(supabaseAdmin, {
        email,
        nome,
        origem: 'conceder-papel-sistema',
        colaboradorId: colab.id as string,
      });
      registrarFalhaDeEnvio('conceder-papel-sistema', email, r);
      envio = r;

      // A conta é a DO E-MAIL DO CADASTRO: nasceu agora pelo invite, ou já existia (e o
      // link foi recovery). Sem ela não há a quem conceder — e só aqui isso é erro.
      const conta = await buscarContaPorEmail(email);
      if (conta.estado !== 'encontrada') {
        return jsonResp({
          error: conta.estado === 'indisponivel'
            ? 'Não foi possível confirmar a conta agora. Tente de novo em instantes — nada foi concedido.'
            : 'Não foi possível criar a conta de acesso. Nada foi concedido.',
        }, 502);
      }
      userId = String(conta.user.id);
    }

    const { data: jaTinha } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', role)
      .maybeSingle();

    if (!jaTinha) {
      const { error: roleErr } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role });
      // 23505: concedido por outra chamada no meio — o estado final é o pedido.
      if (roleErr && roleErr.code !== '23505') {
        console.error('Falha ao conceder o papel:', roleErr);
        return jsonResp({ error: 'Falha ao conceder o papel.' }, 500);
      }
    }

    const situacao = envio === null
      ? (jaTinha ? 'ja-tinha' : 'concedido')
      : (envio.ok ? 'convite-enviado' : 'convite-falhou');

    const mensagens: Record<typeof situacao, string> = {
      'ja-tinha': `${nome} já tinha o papel ${role}.`,
      'concedido': `Papel ${role} concedido a ${nome}. A senha dele não foi alterada.`,
      'convite-enviado': `Papel ${role} concedido a ${nome}. O link para criar a senha foi enviado para o e-mail do cadastro.`,
      'convite-falhou': `Papel ${role} concedido a ${nome}, mas o e-mail com o link NÃO saiu. Peça que ele use "Estou sem minha senha" na tela de login.`,
    };

    return jsonResp({ success: true, userId, situacao, message: mensagens[situacao] });
  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    return jsonResp({ error: errorMessage }, 500);
  }
});
