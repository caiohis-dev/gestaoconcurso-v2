/**
 * Extrai a mensagem que a Edge Function realmente escreveu.
 *
 * POR QUE ISTO EXISTE
 * As EFs deste projeto recusam com status **não-2xx** e o motivo no corpo — e as
 * mensagens são deliberadas, feitas para o usuário final ("Esta conta já foi confirmada e
 * está em uso. Trocar o e-mail dela seria trocar o login de alguém…"). Só que o
 * `supabase.functions.invoke` não devolve esse corpo em `data`: numa resposta não-2xx ele
 * devolve `{ data: null, error: FunctionsHttpError }` e guarda o corpo em
 * **`error.context.body`, como STRING**.
 *
 * A consequência prática, e o defeito que motivou este helper: o padrão ingênuo
 *
 *     if (error || data?.error) setErro(data?.error || "Não foi possível...");
 *
 * cai SEMPRE na mensagem genérica, porque `data` é `null`. Foi o que o
 * `CorrigirEmailAcessoDialog` fazia até 2026-07-26 — o servidor explicava, o cliente
 * jogava a explicação fora, e o admin ficava sem saber por que a correção falhou.
 *
 * ONDE SE APLICA: só em quem usa `functions.invoke`. As EFs chamadas com `fetch` cru
 * (`create-admin`, `recuperar-senha`, `reivindicar-acesso`, `public-create-colaborador`,
 * `check-cpf-colaborador`) leem `response.json()` e já enxergam o `error` do corpo — não
 * precisam disto.
 */

/** O erro do supabase-js, na parte que interessa. */
export interface ErroDeFuncao {
  message?: string;
  context?: { body?: string };
}

/**
 * A mensagem a mostrar, na melhor fonte disponível, nesta ordem:
 *
 *  1. o `error` dentro do corpo da resposta (o que a EF escreveu de propósito);
 *  2. o `error` que veio em `data` — algumas EFs respondem 200 com erro no corpo;
 *  3. a `message` do próprio erro de transporte ("Failed to fetch", por exemplo);
 *  4. o `padrao` recebido.
 *
 * `JSON.parse` de corpo não-JSON não lança para fora: cai para o passo seguinte.
 */
export function mensagemDeErroDaFuncao(
  error: ErroDeFuncao | null | undefined,
  data: { error?: string } | null | undefined,
  padrao: string,
): string {
  const corpo = error?.context?.body;
  if (corpo) {
    try {
      const parsed = JSON.parse(corpo) as { error?: string };
      if (parsed?.error) return parsed.error;
    } catch {
      // Corpo não-JSON (HTML de gateway, texto solto): segue para as outras fontes.
    }
  }

  if (data?.error) return data.error;
  if (error?.message) return error.message;
  return padrao;
}
