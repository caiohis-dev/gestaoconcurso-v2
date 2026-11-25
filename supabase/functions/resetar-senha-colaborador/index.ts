import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { gerarSenhaProvisoria } from '../_shared/senha-provisoria.ts';

// "Resetar senha" do superadmin em /colaboradores (2026-11-25).
//
// Define uma SENHA PROVISÓRIA, gerada aqui, na conta vinculada ao colaborador, e a
// devolve UMA VEZ ao superadmin, que a repassa à pessoa. É a saída para quem não
// acessa a caixa de e-mail — "Estou sem minha senha" manda link, e o link não chega.
//
// ⚠️ DECISÃO CONSCIENTE, NÃO REGRESSÃO. O repo aposentou duas vezes o gestor que
// conhece a senha de outra pessoa (`create-coordenador` em 12/09, `create-admin` em
// 24/09 — esta SOBRESCREVIA a senha calada, ao conceder papel). Aqui a sobrescrita é a
// própria função, pedida pelo usuário: explícita, só superadmin, confirmada na tela, e
// registrada em `log_reset_senha`. Não "conserte" isto achando que é o defeito antigo.
//
// O que esta função NÃO faz, de propósito:
//   - criar conta. Colaborador sem `user_id` é recusado com a providência (convite por
//     "Estou sem minha senha"). Criar conta com senha + e-mail confirmado é exatamente
//     o que a `create-admin` fazia sem prova de posse da caixa.
//   - aceitar `user_id` ou e-mail do corpo. O alvo é DERIVADO do cadastro, no servidor:
//     parâmetro que o chamador envia não é identidade (lição do lock, 20260912191749).
//   - mexer no e-mail nem na confirmação da conta.
//   - resetar a senha do próprio chamador — para isso há o AlterarSenhaCard, que não
//     deixa rastro de "um superadmin conhece esta senha".

const jsonResp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Cada passo devolve o valor OU a Response de recusa — o handler só encadeia.
type Ou<T> = { ok: T } | { recusa: Response };

// ─── 1. Quem está chamando? ──────────────────────────────────────────────────────
// `verify_jwt` NÃO é autorização: a anon key é um JWT válido e público.
async function autorizarSuperadmin(
  req: Request,
  supabaseUrl: string,
  supabaseAdmin: SupabaseClient,
): Promise<Ou<User>> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { recusa: jsonResp({ error: 'Não autenticado' }, 401) };

  const supabaseCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: callerErr } = await supabaseCaller.auth.getUser();
  if (callerErr || !caller) return { recusa: jsonResp({ error: 'Não autenticado' }, 401) };

  // Só superadmin. Via `has_role`, nunca SELECT literal em `user_roles` (a hierarquia
  // mora dentro da função — e já quebrou 3 vezes quando contornada).
  const { data: ehSuperadmin, error: papelErr } = await supabaseAdmin.rpc('has_role', {
    _user_id: caller.id,
    _role: 'superadmin',
  });
  if (papelErr) {
    console.error('Falha ao verificar permissão do chamador:', papelErr);
    return { recusa: jsonResp({ error: 'Falha ao verificar permissão' }, 500) };
  }
  if (!ehSuperadmin) {
    return { recusa: jsonResp({ error: 'Só um superadmin pode resetar a senha de um colaborador.' }, 403) };
  }
  return { ok: caller };
}

interface Alvo {
  colaboradorId: string;
  nome: string;
  userId: string;
  emailConta: string;
}

// ─── 2. De quem é a senha? DERIVADO do cadastro, nunca informado ────────────────────
async function resolverAlvo(
  colaboradorId: string,
  caller: User,
  supabaseAdmin: SupabaseClient,
): Promise<Ou<Alvo>> {
  if (!colaboradorId) return { recusa: jsonResp({ error: 'Informe o colaborador.' }, 400) };

  const { data: colab, error: colabErr } = await supabaseAdmin
    .from('colaboradores')
    .select('id, colab_nome_completo, user_id')
    .eq('id', colaboradorId)
    .maybeSingle();
  // uuid malformado chega como 22P02 — é pedido ruim, não falha nossa.
  if (colabErr && colabErr.code !== '22P02') {
    console.error('Falha ao ler o colaborador:', colabErr);
    return { recusa: jsonResp({ error: 'Falha ao ler o cadastro do colaborador.' }, 500) };
  }
  if (!colab) return { recusa: jsonResp({ error: 'Colaborador não encontrado.' }, 404) };

  const nome = (colab.colab_nome_completo as string | null) ?? '';
  const userId = colab.user_id as string | null;

  if (!userId) {
    return {
      recusa: jsonResp({
        error: `${nome} ainda não tem acesso ao sistema, então não há senha a resetar. ` +
          'Peça que use "Estou sem minha senha" na tela de login para receber o convite.',
      }, 409),
    };
  }
  if (userId === caller.id) {
    return {
      recusa: jsonResp({ error: 'Esta é a sua própria conta. Troque a sua senha pela tela de perfil.' }, 409),
    };
  }

  // O e-mail DA CONTA é o login — pode divergir de `colab_email` (estado B), e é ele
  // que a pessoa vai digitar com a senha provisória.
  const { data: contaData, error: contaErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (contaErr || !contaData?.user) {
    console.error('Conta vinculada não encontrada no Auth:', contaErr);
    return {
      recusa: jsonResp({ error: 'A conta de acesso deste colaborador não foi encontrada. Nada foi alterado.' }, 409),
    };
  }
  return { ok: { colaboradorId: colab.id as string, nome, userId, emailConta: contaData.user.email ?? '' } };
}

// ─── 3. A troca, com a trilha ANTES ──────────────────────────────────────────────
// 🔴 "Registro sem troca" é inofensivo (e é desfeito se a troca falhar); "troca sem
// registro" é exatamente o que a trilha existe para impedir. Se não der para
// registrar, não se troca.
//
// As sessões abertas da conta morrem com a troca — quem faz isso é o GoTrue
// (`updateUserById` com `password`), não esta função. Medido em 2026-11-25 com controle
// positivo, e afirmado no index.test.ts.
async function trocarComTrilha(alvo: Alvo, caller: User, supabaseAdmin: SupabaseClient): Promise<Ou<string>> {
  const { data: registro, error: logErr } = await supabaseAdmin
    .from('log_reset_senha')
    .insert({
      colaborador_id: alvo.colaboradorId,
      colab_nome: alvo.nome,
      alvo_user_id: alvo.userId,
      alvo_email: alvo.emailConta || null,
      executado_por: caller.id,
      executado_por_email: caller.email ?? null,
    })
    .select('id')
    .single();
  if (logErr || !registro) {
    console.error('Falha ao registrar a trilha do reset:', logErr);
    return { recusa: jsonResp({ error: 'Não foi possível registrar a operação. Nada foi alterado.' }, 500) };
  }

  const senha = gerarSenhaProvisoria();
  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(alvo.userId, { password: senha });
  if (updErr) {
    console.error('Falha ao definir a senha provisória:', updErr);
    const { error: desfazErr } = await supabaseAdmin.from('log_reset_senha').delete().eq('id', registro.id);
    if (desfazErr) console.error('E falha ao desfazer o registro da trilha:', desfazErr);
    return {
      recusa: jsonResp({ error: 'Não foi possível definir a nova senha. A senha atual continua valendo.' }, 500),
    };
  }
  return { ok: senha };
}

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

    const quem = await autorizarSuperadmin(req, supabaseUrl, supabaseAdmin);
    if ('recusa' in quem) return quem.recusa;

    const corpo = await req.json().catch(() => ({})) as { colaborador_id?: unknown };
    const colaboradorId = typeof corpo.colaborador_id === 'string' ? corpo.colaborador_id : '';
    const alvo = await resolverAlvo(colaboradorId, quem.ok, supabaseAdmin);
    if ('recusa' in alvo) return alvo.recusa;

    const troca = await trocarComTrilha(alvo.ok, quem.ok, supabaseAdmin);
    if ('recusa' in troca) return troca.recusa;

    return jsonResp({ success: true, senha: troca.ok, nome: alvo.ok.nome, email: alvo.ok.emailConta });
  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    return jsonResp({ error: errorMessage }, 500);
  }
});
