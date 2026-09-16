/**
 * Os ITENS dentro de um capítulo — numeração e âncoras.
 *
 * 🔴 **Por que isto existe, medido nos três editais reais em 2026-09-16:**
 *
 * | | referências a item/subitem | referências a capítulo |
 * |---|---|---|
 * | Edital 002/2026 | 32 | **0** |
 * | Edital 003/2026 | 29 | **0** |
 * | Edital 004/2026 | 34 | **0** |
 *
 * **95 referências cruzadas, e nenhuma aponta para capítulo.** Todas apontam para item
 * (`"nos termos do subitem 10.13"`). Numerar só o capítulo resolveria o caso que não
 * acontece: o resíduo `"10. e seus subitens"` do Edital 002 — o defeito que originou o
 * módulo — é uma referência **de item**.
 *
 * Volume medido: ~270 a 330 itens por edital, em até 3 níveis, mais alíneas em letra.
 *
 * ## Como se escreve
 *
 * O capítulo continua sendo UM campo de texto. Quem redige **não digita número**:
 *
 * ```
 * Parágrafo de abertura, sem numeração.
 * - Primeiro item do capítulo.
 * - Segundo item.
 *   - Subitem do segundo.
 *     - alínea do subitem
 * - {#laudo} Item com âncora, para ser referenciado.
 * ```
 *
 * Num capítulo 7, isso vira `7.1`, `7.2`, `7.2.1`, alínea `a)`, `7.3`. Inserir um item no
 * meio renumera todos abaixo sozinho — que é o ponto inteiro.
 */

/** Nível 0 = item (`7.1`) · 1 = subitem (`7.1.2`) · 2 = alínea (`a)`). */
export type NivelItem = 0 | 1 | 2;

export interface LinhaDocumento {
  tipo: "prosa" | "item";
  texto: string;
  nivel: NivelItem;
  /** `"7.2.1"`, `"a"`, ou `""` quando o capítulo não é numerado. */
  numero: string;
  ancora: string | null;
  /** Índice da linha no texto original — para o linter apontar onde está o problema. */
  linha: number;
}

/** `- {#ancora} texto` · a indentação define o nível. */
const RE_ITEM = /^(\s*)-\s+(?:\{#([a-z0-9_]+)\}\s*)?(.*)$/;
/** A referência a item no texto: `{{item:ancora}}`. */
export const RE_REFERENCIA_ITEM = /\{\{item:([a-z0-9_]+)\}\}/g;

const LETRAS = "abcdefghijklmnopqrstuvwxyz";

/**
 * Quebra o texto do capítulo em linhas, numerando os itens.
 *
 * ⚠️ A indentação é de 2 em 2 espaços, e passa pelo `Math.floor`: 3 espaços contam como
 * 1 nível. Ser tolerante aqui é deliberado — quem redige não deve perder um item por
 * ter dado um espaço a mais, e o nível errado é visível no preview na hora.
 */
export function parsearCapitulo(texto: string, numeroCapitulo: number | null): LinhaDocumento[] {
  const linhas = texto.split("\n");
  const saida: LinhaDocumento[] = [];
  // contador[n] = quantos itens já saíram no nível n desde o último reinício
  const contador = [0, 0, 0];

  linhas.forEach((bruta, i) => {
    const m = RE_ITEM.exec(bruta);
    if (!m) {
      if (bruta.trim() !== "") {
        saida.push({ tipo: "prosa", texto: bruta.trim(), nivel: 0, numero: "", ancora: null, linha: i });
      }
      return;
    }

    const nivel = Math.min(2, Math.floor(m[1].replace(/\t/g, "  ").length / 2)) as NivelItem;
    contador[nivel] += 1;
    // Descer de nível reinicia os contadores abaixo: o subitem 7.2.1 vem depois do 7.1.3
    // sem herdar a contagem dele.
    for (let n = nivel + 1; n < contador.length; n++) contador[n] = 0;

    let numero = "";
    if (numeroCapitulo !== null) {
      if (nivel === 0) numero = `${numeroCapitulo}.${contador[0]}`;
      else if (nivel === 1) numero = `${numeroCapitulo}.${contador[0]}.${contador[1]}`;
      // Alínea é LETRA, como nos editais reais ("item 15.8, alínea L"). Passando de 26
      // repete a última em vez de quebrar — caso que não existe hoje e não vale um erro.
      else numero = LETRAS[Math.min(contador[2] - 1, LETRAS.length - 1)];
    }

    saida.push({ tipo: "item", texto: m[3].trim(), nivel, numero, ancora: m[2] ?? null, linha: i });
  });

  return saida;
}

export interface AncoraDoDocumento {
  ancora: string;
  capitulo: string;
  numero: string;
}

/** Todas as âncoras do documento, com o número que cada uma resolve. */
export function ancorasDoDocumento(
  capitulos: readonly { chave: string; texto: string; numero: number | null; incluido: boolean }[],
): AncoraDoDocumento[] {
  const achadas: AncoraDoDocumento[] = [];
  for (const cap of capitulos) {
    if (!cap.incluido) continue;
    for (const l of parsearCapitulo(cap.texto, cap.numero)) {
      if (l.ancora) achadas.push({ ancora: l.ancora, capitulo: cap.chave, numero: l.numero });
    }
  }
  return achadas;
}

/**
 * Troca `{{item:ancora}}` pelo número do item.
 *
 * ⚠️ Mesma regra da referência de capítulo: o que não resolve vira marcador VISÍVEL
 * (`[?item:ancora]`), nunca some nem inventa número. Quem acusa é o linter.
 */
export function resolverReferenciasDeItem(texto: string, ancoras: ReadonlyMap<string, string>): string {
  return texto.replace(RE_REFERENCIA_ITEM, (_t, ancora: string) => {
    const n = ancoras.get(ancora);
    return n ? n : `[?item:${ancora}]`;
  });
}

export function mapaDeAncoras(ancoras: readonly AncoraDoDocumento[]): Map<string, string> {
  const m = new Map<string, string>();
  // A primeira vence; âncora duplicada é acusada pelo linter, não resolvida em silêncio.
  for (const a of ancoras) if (!m.has(a.ancora)) m.set(a.ancora, a.numero);
  return m;
}
