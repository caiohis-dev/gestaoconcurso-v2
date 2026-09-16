/**
 * A única formatação que o texto de um artigo aceita: **negrito**.
 *
 * 🔴 **Medido nos editais reais em 2026-09-16:** o Edital 004/2026 tem **265** marcadores
 * de negrito, e nenhum outro recurso de formatação aparece nos três. Itálico, sublinhado
 * e cor não são usados; tabela é dado estruturado (`tipo = 'quadro'`), não formatação.
 *
 * Por isso o texto continua sendo uma coluna `TEXT` e `**assim**` é toda a sintaxe.
 *
 * ⚠️ **Por que segmentos e não HTML.** A alternativa seria devolver `<strong>…</strong>`
 * e injetar com `dangerouslySetInnerHTML` — o que obrigaria a sanitizar, e a sanitização
 * é uma barreira que só existe enquanto ninguém a esquece. Devolvendo segmentos, o React
 * escapa tudo sozinho e não há caminho por onde marcação entre.
 */

export interface SegmentoDeTexto {
  texto: string;
  negrito: boolean;
}

/** `**x**`, sem quebra de linha dentro e sem par vazio. */
const RE_NEGRITO = /\*\*([^*\n]+?)\*\*/g;

/**
 * Quebra o texto em trechos normais e em negrito.
 *
 * Marcador solto (`**` sem fechar) fica **literal** na saída, de propósito: sumir com o
 * que a pessoa digitou é o formato de defeito que este repo mais teme, e um asterisco
 * visível é o aviso mais barato possível de que faltou fechar.
 */
export function segmentarNegrito(texto: string): SegmentoDeTexto[] {
  const saida: SegmentoDeTexto[] = [];
  let fim = 0;

  for (const m of texto.matchAll(RE_NEGRITO)) {
    if (m.index > fim) saida.push({ texto: texto.slice(fim, m.index), negrito: false });
    saida.push({ texto: m[1], negrito: true });
    fim = m.index + m[0].length;
  }
  if (fim < texto.length) saida.push({ texto: texto.slice(fim), negrito: false });

  return saida;
}

/** O texto sem os marcadores — para exportação em formato sem negrito e para o linter. */
export function semMarcadores(texto: string): string {
  return segmentarNegrito(texto)
    .map((s) => s.texto)
    .join("");
}
