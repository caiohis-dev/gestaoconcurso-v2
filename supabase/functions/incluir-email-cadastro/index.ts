import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { enviarLinkAcesso, mascararEmail, registrarFalhaDeEnvio } from '../_shared/enviar-link-acesso.ts';
import { barrarSeExcedeu, chaveDeOrigem, podeSeguir, TETOS } from '../_shared/rate-limit.ts';

// O colaborador sem e-mail informa o PRÓPRIO e-mail. Porta pública, sem login.
//
// 🔴 ESTA FUNÇÃO NÃO PROVA IDENTIDADE, E ISSO É DECISÃO, NÃO ESQUECIMENTO (2026-09-19).
// O CPF não é credencial: está em documento, em ficha de RH, e a `check-cpf-colaborador`
// já confirma publicamente se um CPF existe. Quem souber o CPF de um dos 243 cadastros
// sem e-mail aponta o cadastro para a própria caixa, recebe o convite, e o trigger
// `handle_new_user` lhe concede `user_id` + papel 'colaborador' — a partir daí ele
// reescreve a chave PIX e os dados bancários daquela pessoa pelas RPCs do portal.
// O desfecho do ataque é REDIRECIONAR PAGAMENTO.
//
// O usuário decidiu seguir assim, ciente, com a fragilidade registrada para ser desfeita
// (o que a desfaz: OTP no telefone do cadastro — 240 dos 243 têm). Ver
// my_rules/analises/dividas-auth-colaborador.md §5.
//
// ⚠️ ANTES DE AFROUXAR QUALQUER COISA AQUI, leia aquela seção. As contenções que sobraram
// moram quase todas no BANCO, de propósito (§2) — esta função não decide nada sozinha:
//   1. a RPC só alcança cadastro SEM e-mail e NÃO vinculado, e recusa e-mail que já tem
//      conta no Auth — tudo numa transação, sem janela entre perguntar e gravar;
//   2. dois tetos: um por IP e um GLOBAL. O global existe porque a auditoria daqui é um
//      multiplicador de e-mail, e rotação de IP é trivial;
//   3. a trilha + o aviso aos admins, que é a ÚNICA detecção — depois do primeiro
//      registro a porta se fecha, e a pessoa legítima passa a ver o e-mail mascarado de
//      outra pessoa sem entender por quê.
const BodySchema = z.object({
  cpf: z.string().min(11).max(14),
  email: z.string().email('E-mail inválido').max(255),
  origem: z.enum(['auth', 'cadastro-publico']).optional(),
});

/**
 * Avisa os admins. Best-effort: uma falha aqui NÃO desfaz o registro — mas vai para o
 * log, porque descartar retorno de envio sem olhar é o defeito que este repo já pagou.
 *
 * ⚠️ Um POST por destinatário: a `send-email` recebe `to` como string e emite um único
 * `RCPT TO`. Mandar um array passaria batido e não entregaria a ninguém.
 */
async function avisarAdmins(
  supabase: SupabaseClient,
  dados: { nome: string; email: string; origem: string },
): Promise<boolean> {
  try {
    // A lista sai da RPC `emails_dos_admins`, que lê `auth.users` — e não `profiles`,
    // cujo e-mail não acompanha rename de conta. Mandar o aviso para um endereço velho
    // seria perder a única detecção desta porta, calado.
    const { data: destinos, error: erroLista } = await supabase.rpc('emails_dos_admins');
    if (erroLista || !destinos?.length) {
      console.error('incluir-email-cadastro: sem destinatários para o aviso:', erroLista?.message);
      return false;
    }

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <h2 style="font-size:18px;">E-mail informado pelo próprio colaborador</h2>
  <p><strong>${dados.nome}</strong> informou o e-mail <strong>${dados.email}</strong>
     pela tela de acesso (origem: ${dados.origem}).</p>
  <p style="color:#b91c1c;"><strong>Confira se foi ele mesmo.</strong> Esse caminho não
     verifica identidade — ele pede apenas CPF e e-mail. Se você não reconhece este
     pedido, entre em contato com a pessoa antes que ela perca o acesso ao próprio
     cadastro.</p>
  <p style="font-size:12px;color:#64748b;">Aviso automático do Sistema de Cadastro de
     Colaboradores da FEVRE.</p>
</body></html>`;

    let algumSaiu = false;
    for (const { email: to } of destinos as unknown as Array<{ email: string }>) {
      const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to,
          subject: 'Aviso: e-mail informado pelo próprio colaborador',
          html,
        }),
      });
      if (resp.ok) {
        algumSaiu = true;
      } else {
        console.error('incluir-email-cadastro: aviso ao admin falhou:', await resp.text());
      }
    }
    return algumSaiu;
  } catch (e) {
    console.error('incluir-email-cadastro: aviso aos admins falhou:', (e as Error).message);
    return false;
  }
}

/**
 * A mensagem do banco é escrita para ser lida pelo usuário (CLAUDE.md §2) — as guardas
 * da RPC usam `P0001` justamente para marcar "isto é para mostrar". Qualquer outro
 * código é defeito nosso, e defeito nosso não se repassa ao usuário.
 */
function traduzirErroDaRpc(
  erro: { code?: string; message?: string },
): { mensagem: string; status: number } {
  if (erro.code === 'P0001' && erro.message) {
    return { mensagem: erro.message, status: 409 };
  }
  return { mensagem: 'Não foi possível registrar o e-mail.', status: 500 };
}

/**
 * Valida e normaliza o corpo. O CPF vai normalizado para a RPC, que o normaliza de novo:
 * não é desperdício — a RPC precisa valer sozinha para qualquer chamador (§2), e aqui se
 * recusa cedo o que nem vale gastar teto.
 */
function lerEntrada(
  corpo: unknown,
): { cpf: string; email: string; origem: 'auth' | 'cadastro-publico' } | { erro: string } {
  const parsed = BodySchema.safeParse(corpo);
  if (!parsed.success) return { erro: 'Dados inválidos' };

  const cpf = parsed.data.cpf.replace(/\D/g, '').padStart(11, '0');
  if (cpf.length !== 11) return { erro: 'CPF inválido' };

  return { cpf, email: parsed.data.email.trim(), origem: parsed.data.origem ?? 'auth' };
}

/**
 * Os DOIS tetos desta porta, nesta ordem: o por IP e o GLOBAL.
 *
 * 🔴 O global, de chave fixa, é o que falta em todas as outras portas — e aqui ele é
 * necessário porque a AUDITORIA desta é um multiplicador de e-mail (1 convite + 1 aviso
 * por admin, por registro). Rotacionar IP é trivial e o cooldown por alvo do roadmap
 * ainda não existe: sem o global, uma lista de CPFs vira centenas de mensagens pelo SMTP
 * da FEVRE, que é o dano que o teto de `cadastro` existe para evitar — o domínio numa
 * blocklist derruba TODOS os fluxos de acesso.
 *
 * ⚠️ A frase do 429 é a mesma nos dois: dizer qual teto estourou seria um oráculo.
 */
async function barrarPelosDoisTetos(
  supabase: SupabaseClient,
  req: Request,
  jsonResp: (body: unknown, status?: number) => Response,
): Promise<Response | null> {
  const porIp = await barrarSeExcedeu(supabase, 'inclusao-email', req, jsonResp);
  if (porIp) return porIp;

  if (!(await podeSeguir(supabase, TETOS['inclusao-email-global'], 'global'))) {
    console.error('incluir-email-cadastro: teto GLOBAL estourado');
    return jsonResp({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429);
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
    const entrada = lerEntrada(await req.json());
    if ('erro' in entrada) return jsonResp({ error: entrada.erro }, 400);
    const { cpf, email, origem } = entrada;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const barrado = await barrarPelosDoisTetos(supabase, req, jsonResp);
    if (barrado) return barrado;

    // ⚠️ A guarda de "esse e-mail já tem conta" NÃO está aqui: ela mora na RPC, junto
    // com as outras, dentro da mesma transação. Reimplementá-la em TypeScript seria a
    // armadilha do §8 — duas versões da mesma regra, que divergem no primeiro descuido —
    // e ainda abriria uma janela entre perguntar ao Auth e gravar no banco.
    // A regra mora no banco: gravar o e-mail e registrar a trilha são dois passos, e a
    // RPC os faz numa transação só, com as guardas (sem e-mail, não vinculado, único).
    const { data: linhas, error: rpcErr } = await supabase.rpc(
      'registrar_email_do_proprio_cadastro',
      { p_cpf: cpf, p_email: email, p_origem: origem, p_chave_origem: chaveDeOrigem(req) },
    );

    if (rpcErr) {
      const { mensagem, status } = traduzirErroDaRpc(rpcErr);
      console.error('incluir-email-cadastro: RPC recusou:', rpcErr.code, rpcErr.message);
      return jsonResp({ error: mensagem }, status);
    }

    const registro = Array.isArray(linhas) ? linhas[0] : linhas;
    const nome = (registro?.nome as string | undefined) ?? '';

    // Daqui em diante nada desfaz o registro: o e-mail já está no cadastro.
    registrarFalhaDeEnvio(
      'incluir-email-cadastro',
      `cadastro ${registro?.colaborador_id ?? '?'}`,
      await enviarLinkAcesso(supabase, { email, nome }),
    );

    // O carimbo do aviso fecha o buraco de "o único sinal falhou calado": sem ele, um
    // auto-registro cujo aviso não saiu é indistinguível de um que saiu.
    if (await avisarAdmins(supabase, { nome, email, origem }) && registro?.auditoria_id) {
      await supabase
        .from('log_email_autoinformado')
        .update({ aviso_admins_em: new Date().toISOString() })
        .eq('id', registro.auditoria_id);
    }

    return jsonResp({ ok: true, email_mascarado: mascararEmail(email) });
  } catch (e) {
    return jsonResp({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
