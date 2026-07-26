import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { enviarLinkAcesso, mascararEmail } from '../_shared/enviar-link-acesso.ts';

// Etapa 2 da edição de colab_email sensível à identidade — reconciliação do estado B.
//
// O problema: colab_email é a âncora do login, mas o invite cria a conta no Auth na
// hora do "Primeiro acesso" e o trigger handle_new_user vincula user_id no nascimento.
// Se o e-mail estava errado, a conta nasce no endereço errado e já vinculada — e a
// pessoa nunca recebe nada. Corrigir colab_email pela UI não conserta (a conta órfã
// segue no endereço velho, e "esqueci minha senha" iria para lá). A Etapa 1 travou o
// campo; esta função é a saída deliberada, no lugar certo.
//
// Os três estados de uma linha (ver my_rules/analises/roadmap-edicao-email-colaborador.md):
//   A  user_id IS NULL           -> edição livre pelo dialog; esta função recusa.
//   B  vinculado, não-confirmado -> o caso travado: é o que esta função reconcilia.
//   C  vinculado, confirmado     -> login ativo; a troca pertence ao dono. Recusa.
//
// Dois modos, uma função só: 'consultar' (a UI descobre o estado para saber o que
// renderizar) e 'corrigir' (a operação). O modo consultar existe porque separar B de C
// exige ler auth.users, e isso só acontece aqui — o front nunca vê o Auth.
//
// A mecânica do 'corrigir': RENOMEAR a conta (admin.updateUserById), não apagar e
// recriar. O desenho original mandava apagar, supondo que o DELETE só zerasse
// colaboradores.user_id pela FK ON DELETE SET NULL. Não é o caso: 15 colunas em 11
// tabelas apontam para auth.users — as de CASCADE (profiles, user_roles,
// coordenadores_prova) sumiriam em silêncio (um papel 'coordenador' concedido por
// admin seria perdido, porque o trigger só reconcede 'user' e 'colaborador'), e as 11
// de NO ACTION (created_by/sent_by) fariam o DELETE falhar. Renomear preserva o
// user_id e, com ele, todos os vínculos — por construção, sem inventário nem
// reassociação. Decisão de 2026-07-16.

const BodySchema = z.object({
  acao: z.enum(['consultar', 'corrigir']),
  colaborador_id: z.string().uuid('Colaborador inválido'),
  novo_email: z.string().trim().email('E-mail inválido').max(255).optional(),
});

type Estado = 'A' | 'B' | 'C';

const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();

// Procura conta no Auth pelo e-mail. Não existe getUserByEmail no admin API, então é
// varredura paginada — o universo é de dezenas de contas, não de milhares.
async function acharContaPorEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  const alvo = norm(email);
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Falha ao consultar o Auth: ${error.message}`);
    const achou = data.users.find((u) => norm(u.email) === alvo);
    if (achou) return achou;
    if (data.users.length < perPage) break;
  }
  return null;
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
    if (!parsed.success) {
      return jsonResp({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }, 400);
    }
    const { acao, colaborador_id, novo_email } = parsed.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- Quem está chamando ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Não autenticado' }, 401);

    const supabaseCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await supabaseCaller.auth.getUser();
    if (callerErr || !caller) return jsonResp({ error: 'Não autenticado' }, 401);

    // Espelha exatamente a policy de UPDATE de colaboradores: has_role(admin) OR
    // has_role(coordenador).
    //
    // ⚠️ Chama `has_role`, e não faz SELECT em `user_roles`. A diferença passou a
    // importar em 2026-07-25: a migration 20260725195530 pôs a hierarquia DENTRO do
    // `has_role` (superadmin ⇒ admin). Consultar a tabela direto contorna a regra e
    // recria o bug que ela fechou — a policy deixaria o superadmin passar, e esta
    // função o barraria, com a UI mostrando os botões. Onde o alvo é "a mesma regra
    // da policy", use a mesma função que a policy usa.
    const [admin, coordenador] = await Promise.all([
      supabase.rpc('has_role', { _user_id: caller.id, _role: 'admin' }),
      supabase.rpc('has_role', { _user_id: caller.id, _role: 'coordenador' }),
    ]);

    if (admin.error || coordenador.error) {
      return jsonResp({ error: 'Falha ao verificar permissão' }, 500);
    }
    if (!admin.data && !coordenador.data) {
      return jsonResp({ error: 'Só a coordenação pode corrigir o e-mail de acesso.' }, 403);
    }

    // --- A linha e o seu estado ---
    const { data: colab, error: colabErr } = await supabase
      .from('colaboradores')
      .select('id, colab_email, colab_nome_completo, user_id')
      .eq('id', colaborador_id)
      .maybeSingle();

    if (colabErr) return jsonResp({ error: colabErr.message }, 500);
    if (!colab) return jsonResp({ error: 'Colaborador não encontrado' }, 404);

    let estado: Estado = 'B';
    let contaAtual: User | null = null;

    if (!colab.user_id) {
      estado = 'A';
    } else {
      const { data: contaData, error: contaErr } = await supabase.auth.admin.getUserById(colab.user_id);
      if (contaErr || !contaData?.user) {
        // user_id aponta para conta inexistente — impossível pela FK, mas se acontecer
        // a linha está, de fato, sem conta: trata como não-vinculada em vez de estourar.
        console.error('user_id sem conta no Auth:', colab.user_id, contaErr?.message);
        estado = 'A';
      } else {
        contaAtual = contaData.user;
        const confirmada = !!contaAtual.email_confirmed_at || !!contaAtual.last_sign_in_at;
        estado = confirmada ? 'C' : 'B';
      }
    }

    if (acao === 'consultar') {
      return jsonResp({
        estado,
        // O chamador é a coordenação, que já enxerga a linha inteira: mostrar os dois
        // endereços é o ponto — é a divergência que explica o problema.
        email_cadastro: colab.colab_email,
        email_conta: contaAtual?.email ?? null,
        divergentes: !!contaAtual && norm(contaAtual.email) !== norm(colab.colab_email),
      });
    }

    // --- acao === 'corrigir' ---
    if (estado === 'A') {
      return jsonResp(
        { error: 'Este cadastro ainda não tem conta de acesso. Edite o e-mail direto no cadastro.' },
        409,
      );
    }
    if (estado === 'C') {
      return jsonResp(
        {
          error:
            'Esta conta já foi confirmada e está em uso. Trocar o e-mail dela seria trocar o login de alguém — a mudança pertence ao próprio colaborador.',
        },
        409,
      );
    }
    if (!novo_email) return jsonResp({ error: 'Informe o e-mail correto.' }, 400);

    const email = novo_email.trim();

    // Nada a fazer: já é o e-mail da conta. Compara contra o e-mail da CONTA, não contra
    // colab_email — o caso típico é justamente colab_email já corrigido e a conta velha.
    if (norm(email) === norm(contaAtual?.email)) {
      return jsonResp({ error: 'Este já é o e-mail da conta de acesso.' }, 400);
    }

    // --- O que pode recusar, recusa antes de escrever ---
    // colab_email tem índice único funcional sobre lower(trim(...)).
    const { data: donoEmail, error: donoErr } = await supabase
      .from('colaboradores')
      .select('id')
      .ilike('colab_email', email)
      .neq('id', colaborador_id)
      .maybeSingle();

    if (donoErr) return jsonResp({ error: donoErr.message }, 500);
    if (donoEmail) {
      return jsonResp({ error: 'Este e-mail já está no cadastro de outro colaborador.' }, 409);
    }

    // auth.users.email é único: renomear para um endereço ocupado falharia.
    const contaNoDestino = await acharContaPorEmail(supabase, email);
    if (contaNoDestino) {
      return jsonResp(
        { error: 'Já existe uma conta de acesso com este e-mail. Verifique o endereço.' },
        409,
      );
    }

    // --- A partir daqui, escreve ---
    console.log('corrigir-email-acesso: renomeando conta pendente', {
      colaborador_id,
      por: caller.id,
      de: contaAtual?.email,
      para: email,
    });

    // 1. Renomeia a conta. O user_id não muda, então nada que aponta para ele se perde.
    //    email_confirm: false mantém a conta pendente — quem confirma é a pessoa, ao
    //    abrir o link no endereço novo. É a prova de posse da caixa.
    const { error: renameErr } = await supabase.auth.admin.updateUserById(colab.user_id!, {
      email,
      email_confirm: false,
    });

    if (renameErr) {
      console.error('updateUserById falhou:', renameErr.message);
      return jsonResp(
        { error: `Não foi possível mover a conta para o e-mail novo: ${renameErr.message}` },
        500,
      );
    }

    // 2. Re-ancora o cadastro. Se falhar, a conta já está no endereço certo e a pessoa
    //    entra por "esqueci minha senha" — sobra só a divergência cosmética, que é
    //    justamente o que esta função conserta, então basta repetir a operação.
    const { error: updErr } = await supabase
      .from('colaboradores')
      .update({ colab_email: email })
      .eq('id', colaborador_id);

    if (updErr) {
      console.error('update colab_email falhou depois do rename:', updErr.message);
      return jsonResp(
        {
          error:
            'A conta de acesso foi movida para o e-mail novo, mas o cadastro não acompanhou. Repita a correção para alinhar os dois.',
        },
        500,
      );
    }

    // 3. profiles.email é escrito pelo trigger no nascimento da conta e não acompanha o
    //    rename — sem isto, o perfil guarda o endereço errado para sempre.
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ email })
      .eq('id', colab.user_id!);

    if (profErr) {
      // Não é motivo para falhar a operação: o acesso já está correto, e profiles.email
      // é cópia de conveniência — a verdade do login é auth.users.email.
      console.error('update profiles.email falhou:', profErr.message);
    }

    // 4. A conta já existe (acabamos de renomeá-la), então o invite falharia: o link é
    //    de recuperação. Abri-lo cria a senha e confirma o endereço.
    const { ok } = await enviarLinkAcesso(supabase, {
      email,
      nome: (colab.colab_nome_completo as string) ?? '',
      tipo: 'recovery',
    });

    if (!ok) {
      return jsonResp({
        ok: false,
        email_mascarado: mascararEmail(email),
        aviso:
          'A conta foi movida para o e-mail correto, mas o link não saiu. Peça para a pessoa usar "Esqueci minha senha" em /auth — agora o e-mail chega no endereço certo.',
      });
    }

    return jsonResp({ ok: true, email_mascarado: mascararEmail(email) });
  } catch (e) {
    console.error('corrigir-email-acesso:', e);
    return jsonResp({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
