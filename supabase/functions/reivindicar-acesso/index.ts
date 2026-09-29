import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import {
  contextoParaContaExistente,
  enviarLinkAcesso,
  mascararEmail,
  registrarFalhaDeEnvio,
} from '../_shared/enviar-link-acesso.ts';
import { emCooldown } from '../_shared/cooldown-link.ts';
import { barrarSeExcedeu } from '../_shared/rate-limit.ts';
import { normalizarCpfOuNull } from '../_shared/cpf.ts';

// Subetapa 2B — reivindicação do acesso do colaborador.
//
// Substitui o papel de "localizar cadastro pelo CPF" da check-cpf-colaborador, mas
// sem o vazamento dela (aquela devolvia o e-mail inteiro). Aqui o cliente só recebe
// {existe, ja_vinculado, email_mascarado, divergente?, envio?} — o e-mail completo nunca
// sai do servidor. `envio` ('enviado' | 'falhou') só vem quando houve tentativa de envio.
//
// Efeito colateral quando cabe, pelo visual da FEVRE via send-email:
//   - cadastro SEM conta → link do helper em modo 'auto' (invite, ou recovery se o
//     e-mail já tiver conta). Ao criar a conta, o trigger on_auth_user_created vincula
//     user_id e concede o papel 'colaborador' (migration 20260714201650).
//   - cadastro COM conta, e-mail não divergente → recovery para o e-mail DA CONTA,
//     respeitando o cooldown por conta (🔵 desde 2026-09-28; antes, nada era enviado).
// Nada de vínculo é feito aqui.

const BodySchema = z.object({
  cpf: z.string().min(1).max(20),
});

// Teto do rate limit: no máximo N tentativas por IP na janela. A função revela se um
// CPF existe (concessão aceita no desenho); o teto impede varrer CPFs em massa e
// disparar e-mails em série.

/**
 * O que responder — e o que ENVIAR — quando o cadastro JÁ tem conta.
 *
 * 🔴 O e-mail que importa aqui é o da CONTA, não o do cadastro — e os dois podem divergir
 * (o "estado B dessincronizado"). Até 2026-09-19 esta resposta devolvia `colab_email`, e
 * isso fechava um CICLO: pelo CPF a tela mandava "informe o seu e-mail", a pessoa
 * informava o do cadastro, a `recuperar-senha` não achava conta com ele, caía no ramo de
 * estado A (que exige `user_id IS NULL`, e a linha dela é vinculada) e respondia "link
 * enviado" — sem enviar nada. Perda silenciosa, em círculo. Medido: 1 pessoa real.
 *
 * 🔴 ATÉ 2026-09-28 ESTE RAMO NÃO ENVIAVA NADA, e isso prendia quem pedia de novo: a 1ª
 * chamada pelo CPF gera o convite, o convite CRIA a conta e o gatilho preenche user_id na
 * hora. Quem não achava o e-mail e pedia outra vez caía aqui e ouvia "já tem acesso" —
 * sem nunca ter definido senha, conhecendo só o e-mail mascarado. Medido em 16/09: TODOS
 * os 52 vinculados caíam aqui sem saída, 12 deles provavelmente sem senha. Agora manda o
 * link de redefinição ao e-mail DA CONTA — o mesmo destino que a pessoa alcançaria
 * digitando-o no caminho do e-mail. Ver roadmap-cpf-link-para-conta-existente.yaml.
 *
 * ⚠️ Não é revelação nova: a porta do CPF já revela e-mail mascarado por desenho (ver a
 * assimetria em auth-e-permissoes.md).
 */
async function responderCadastroVinculado(
  supabase: SupabaseClient,
  colab: { id: string; user_id: string; colab_nome_completo: string },
  emailDoCadastro: string | null,
) {
  const { data: conta } = await supabase.auth.admin.getUserById(colab.user_id);
  const user = conta?.user as unknown as Record<string, unknown> | undefined;
  const emailConta = (user?.email as string | undefined)?.trim() || null;
  const alvo = emailConta ?? emailDoCadastro;
  const divergente = !!emailConta && !!emailDoCadastro
    && emailConta.toLowerCase() !== emailDoCadastro.toLowerCase();

  const resposta = {
    existe: true,
    ja_vinculado: true,
    email_mascarado: alvo ? mascararEmail(alvo) : null,
    // O front usa isto para parar de mandar a pessoa informar um e-mail que não vai
    // funcionar, e apontá-la para a coordenação, que tem a saída de verdade (a EF
    // `corrigir-email-acesso`).
    divergente,
  };

  // Divergente: o link iria para uma caixa que talvez não seja dela — segue com a
  // coordenação, sem envio (decisão D2 do roadmap). Conta ilegível: sem destino
  // confiável, comportamento de antes.
  if (divergente || !user || !emailConta) return resposta;

  // 🔴 No cooldown a resposta é `enviado`, NÃO um estado novo (decisão D3): um link saiu
  // há menos de 2 min, então é verdade — e um "enviamos há pouco" revelaria que ALGUÉM
  // pediu para este CPF agora (roadmap de rate limit, etapa 4: a resposta não muda).
  if (emCooldown(user)) return { ...resposta, envio: 'enviado' as const };

  const r = await enviarLinkAcesso(supabase, {
    email: emailConta,
    nome: colab.colab_nome_completo,
    tipo: 'recovery',
    contexto: contextoParaContaExistente(user),
    origem: 'reivindicar-acesso',
    colaboradorId: colab.id,
  });
  registrarFalhaDeEnvio('reivindicar-acesso', `cadastro ${colab.id} (vinculado)`, r);

  return { ...resposta, envio: r.ok ? 'enviado' as const : 'falhou' as const };
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

    // 🔴 CORRIGIDO em 2026-09-21: era `padStart(11,'0')` ANTES do length check — o
    // mesmo defeito já consertado em `check-cpf-colaborador` (02/08), mas que
    // sobreviveu aqui sem ninguém notar. Entrada curta (ex.: 9 dígitos, alguém que
    // não digitou os zeros à esquerda) virava o CPF de OUTRA PESSOA, e esta função
    // tem efeito colateral: revela o e-mail mascarado dela ou dispara um convite
    // para a caixa dela. Medido: 275 dos 821 colaboradores (33%) têm CPF começando
    // em zero — a colisão é real, não hipotética. Ver `_shared/cpf.ts`.
    const cpf = normalizarCpfOuNull(parsed.data.cpf);
    if (cpf === null) return jsonResp({ error: 'CPF inválido' }, 400);

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

    // Vinculado: resolve o e-mail DA CONTA e, quando cabe, manda o link para lá. O
    // porquê (o ciclo do estado B, e quem pedia de novo e ficava preso) está no
    // cabeçalho de `responderCadastroVinculado`.
    if (jaVinculado) {
      return jsonResp(await responderCadastroVinculado(
        supabase,
        colab as { id: string; user_id: string; colab_nome_completo: string },
        email,
      ));
    }

    // Não tem e-mail para onde mandar: o front oferece informar o próprio (2026-09-19).
    if (!email) {
      return jsonResp({ existe: true, ja_vinculado: false, email_mascarado: null });
    }

    // Dispara o link do Auth com o visual da FEVRE. O helper decide sozinho entre
    // `invite` (conta nova — o trigger on_auth_user_created vincula) e `recovery`
    // (a conta já existe — o trigger on_auth_user_signin vincula quando ela logar).
    //
    // 🔴 O RETORNO NÃO SE DESCARTA MAIS (2026-09-19): engolir o `{ ok }` sem olhar foi o
    // que manteve invisível, por meses, o invite que morria em e-mail com conta.
    // 🔵 E desde 2026-09-28 ele CHEGA À TELA (`envio`): até então a resposta era a do
    // sucesso mesmo com o envio falhando, e a pessoa ouvia "link enviado" sem nada sair.
    // Não vaza: esta porta já revela existência e e-mail mascarado por desenho. (A porta
    // do E-MAIL continua genérica — não tocar.)
    const r = await enviarLinkAcesso(supabase, {
      email,
      nome: colab.colab_nome_completo as string,
      origem: 'reivindicar-acesso',
      colaboradorId: colab.id as string,
    });
    registrarFalhaDeEnvio('reivindicar-acesso', `cadastro ${colab.id}`, r);

    return jsonResp({
      existe: true,
      ja_vinculado: false,
      email_mascarado: mascararEmail(email),
      envio: r.ok ? 'enviado' : 'falhou',
    });
  } catch (e) {
    return jsonResp({ error: (e as Error).message || 'Erro interno' }, 500);
  }
});
