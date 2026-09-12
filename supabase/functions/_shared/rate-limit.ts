// Rate limit dos fluxos públicos de acesso — o lado Deno da RPC `registrar_tentativa`.
//
// Executa a Etapa 1 de `my_rules/analises/roadmap-rate-limit-fluxos-de-acesso.yaml`.
// Toda porta pública passa por aqui; nenhuma monta a consulta à mão.
//
// 🔴 A REGRA QUE DEFINE ESTE ARQUIVO: **na dúvida, BLOQUEIA.** É o oposto exato do que
// existia até 2026-09-12, quando as duas EFs com teto faziam `const { count } = await …`
// e descartavam o `error` — com a consulta falhando, `count` vinha `undefined`, `0 >= 5`
// era falso e a requisição passava. O teto desaparecia justamente quando o banco estava
// em apuros, que é quando ele mais importa.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Os escopos em uso. Orçamentos separados: apertar um não aperta os outros. */
export type EscopoRateLimit =
  | 'acesso'          // reivindicar-acesso + recuperar-senha (orçamento COMPARTILHADO)
  | 'cadastro'        // public-create-colaborador
  | 'checagem-cpf';   // check-cpf-colaborador

export interface TetoRateLimit {
  escopo: EscopoRateLimit;
  max: number;
  janelaMin: number;
}

/**
 * Os tetos, confirmados pelo usuário em 2026-09-12 (decisão N1 do roadmap).
 *
 * ⚠️ **São ordem de grandeza, não número medido.** Nenhum colaborador passou por estes
 * fluxos desde que o site subiu (medido em 13/08: a tabela de produção tinha 2 linhas,
 * ambas de teste), então não há tráfego real para calibrar. A primeira convocação é que
 * vai dizer se estão apertados demais — e é por isso que a Etapa 5 do roadmap (contar os
 * 429) vale mais que o número escolhido aqui.
 */
export const TETOS: Record<EscopoRateLimit, TetoRateLimit> = {
  // Compartilhado de propósito entre as duas portas de "estou sem minha senha":
  // separados, o atacante somaria 5 pelo CPF MAIS 5 pelo e-mail.
  acesso: { escopo: 'acesso', max: 5, janelaMin: 15 },

  // O mais apertado do sistema, e com motivo: cada chamada INSERE PII de gente real em
  // `colaboradores` e DISPARA um e-mail com SPF/DKIM da FEVRE para o endereço que o corpo
  // mandar. O pior dano não é a base poluída — é o domínio da FEVRE numa blocklist, que
  // derrubaria TODOS os fluxos de acesso legítimos de uma vez.
  cadastro: { escopo: 'cadastro', max: 3, janelaMin: 60 },

  // Folgado porque não tem efeito colateral: devolve só `{exists}` e não envia nada.
  // O teto aqui é contra varredura de CPF em massa, não contra abuso pontual.
  'checagem-cpf': { escopo: 'checagem-cpf', max: 30, janelaMin: 15 },
};

/**
 * A chave de origem da requisição.
 *
 * 🔵 O `x-forwarded-for` é CONFIÁVEL aqui, e isso foi medido contra produção em 13/08:
 * forjar o header não muda a linha gravada — o edge o sobrescreve com o IP real, apesar
 * da Cloudflare na frente. ⚠️ A medição cobriu o XFF simples; `X-Real-IP` e
 * `CF-Connecting-IP` forjados não foram testados.
 *
 * 🔴 IPv6 é normalizado para o prefixo /64, e isso é PREVENTIVO, não cosmético. Hoje o
 * endpoint é IPv4-only (sem registro AAAA, medido em 13/08). Se a Supabase publicar AAAA,
 * cada casa passa a ter ~18 quintilhões de endereços — e as privacy extensions os
 * rotacionam sozinhas, sem ninguém pedir. Um teto por endereço inteiro viraria pó em
 * silêncio, por um caminho que ninguém associaria a rate limit.
 */
export function chaveDeOrigem(req: Request): string {
  const bruto = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (!bruto) return 'desconhecido';
  if (!bruto.includes(':')) return bruto; // IPv4, ou já é o literal 'desconhecido'

  // IPv6: fica só o prefixo /64 (os quatro primeiros grupos). `::` é expandido antes,
  // senão "2001:db8::1" e "2001:db8:0:0:1:2:3:4" gerariam chaves diferentes para a
  // mesma rede.
  const [cabeca, cauda] = bruto.split('::');
  const esquerda = cabeca ? cabeca.split(':').filter(Boolean) : [];
  const direita = cauda ? cauda.split(':').filter(Boolean) : [];
  const grupos =
    cauda === undefined
      ? esquerda
      : [...esquerda, ...Array(Math.max(0, 8 - esquerda.length - direita.length)).fill('0'), ...direita];

  return grupos.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/**
 * Registra a tentativa e diz se ela pode seguir.
 *
 * 🔴 Devolve `false` (BLOQUEIA) também quando a RPC falha. Quem chama não precisa
 * distinguir "estourou o teto" de "não consegui verificar": os dois significam "não
 * prossiga". Distinguir seria justamente o convite a tratar o erro como "deixa passar".
 */
export async function podeSeguir(
  supabase: SupabaseClient,
  teto: TetoRateLimit,
  chave: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('registrar_tentativa', {
    p_escopo: teto.escopo,
    p_chave: chave,
    p_max: teto.max,
    p_janela: `${teto.janelaMin} minutes`,
  });

  if (error) {
    // Sem `console.error` a falha vira invisível: o usuário leva 429 e ninguém descobre
    // que o motivo foi o banco, não o abuso.
    console.error('[rate-limit] RPC falhou, BLOQUEANDO por precaucao:', error.message);
    return false;
  }

  return data === true;
}

/**
 * O caminho completo, que é como as Edge Functions devem usar: extrai a origem, registra
 * e devolve a resposta 429 pronta — ou `null` quando pode seguir.
 *
 * ⚠️ A frase do 429 é a MESMA em todas as portas, e genérica de propósito. Ela não pode
 * dizer se o CPF existe, se o e-mail tem conta, nem se o limite é por IP ou por alvo:
 * cada uma dessas revelações transformaria o teto num oráculo — e a assimetria deliberada
 * entre as respostas de CPF e de e-mail está documentada em
 * `my_rules/estrutura/transversais/auth-e-permissoes.md`.
 */
export async function barrarSeExcedeu(
  supabase: SupabaseClient,
  escopo: EscopoRateLimit,
  req: Request,
  jsonResp: (body: unknown, status?: number) => Response,
): Promise<Response | null> {
  const teto = TETOS[escopo];
  const ok = await podeSeguir(supabase, teto, chaveDeOrigem(req));
  if (ok) return null;

  return jsonResp(
    { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
    429,
  );
}
