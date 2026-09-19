import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { enviarLinkAcesso, mascararEmail, registrarFalhaDeEnvio } from '../_shared/enviar-link-acesso.ts';
import { barrarSeExcedeu } from '../_shared/rate-limit.ts';

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

    // --- Rate limit por IP (orcamento 'acesso', COMPARTILHADO com a outra porta) ---
    // 🔴 Ate 2026-09-12 isto era uma consulta crua cujo `error` era descartado: a
    // requisicao PASSAVA quando o banco falhava. Agora a RPC decide, numa transacao, e o
    // helper bloqueia tambem em caso de erro.
    const barrado = await barrarSeExcedeu(supabase, 'acesso', req, jsonResp);
    if (barrado) return barrado;

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

    // Dispara o link do Auth com o visual da FEVRE. O helper decide sozinho entre
    // `invite` (conta nova — o trigger on_auth_user_created vincula) e `recovery`
    // (a conta já existe — o trigger on_auth_user_signin vincula quando ela logar).
    //
    // 🔴 O RETORNO NÃO SE DESCARTA MAIS (2026-09-19). A resposta ao cliente continua
    // a mesma — a assimetria CPF × e-mail é deliberada e não muda por isto —, mas
    // engolir o `{ ok }` sem olhar foi o que manteve invisível, por meses, o invite
    // que morria em e-mail com conta: "link enviado" na tela e nada saindo.
    registrarFalhaDeEnvio(
      'reivindicar-acesso',
      `cadastro ${colab.id}`,
      await enviarLinkAcesso(supabase, { email, nome: colab.colab_nome_completo as string }),
    );

    return jsonResp({ existe: true, ja_vinculado: false, email_mascarado: mascararEmail(email) });
  } catch (e) {
    return jsonResp({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
