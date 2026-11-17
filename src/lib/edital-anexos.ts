/**
 * A numeração dos ANEXOS e dos QUADROS — e os marcadores que a citam.
 *
 * 🔴 **É o mesmo problema da numeração de capítulo, um nível abaixo, e foi medido:**
 *
 * | | Anexo I | Anexo II |
 * |---|---|---|
 * | Edital 002 | conteúdo programático | — |
 * | Edital 003 | conteúdo programático | — |
 * | Edital 004 | **áreas de abrangência** | conteúdo programático |
 *
 * Um anexo condicional que entra desloca os seguintes, exatamente como um capítulo. E os
 * quadros erram do mesmo jeito: o Edital 004 publicou **dois** "Quadro II" (as vagas de ACS
 * por UBSF e a composição da prova), e o item 5.1.1 cita "Quadro I" para o quadro que, na
 * linha seguinte, se intitula "Quadro II".
 *
 * Por isso nenhum dos dois números é escrito: o texto cita `{{anexo:chave}}` e
 * `{{quadro:ancora}}`, e o número sai daqui. O que não resolve vira marcador VISÍVEL
 * (`[?anexo:…]`, `[?quadro:…]`) — nunca some, nunca inventa número. Quem acusa é o linter.
 *
 * 🔵 Fatia 12, etapa 2 (2026-11-16). Decisão do usuário: o mecanismo entra agora, e o
 * texto do edital modelo continua sem número ("como anexo deste Edital") — quem quiser
 * citar o número edita pela tela.
 */
import type { CapituloResolvido } from "@/lib/edital-numeracao";
import { ordenarItens, type ItemBruto } from "@/lib/edital-itens";

/** `1` → `I`, `4` → `IV`. Os editais numeram anexo e quadro em romano. */
export function romano(n: number): string {
  const tabela: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let resto = Math.max(0, Math.floor(n));
  let saida = "";
  for (const [valor, letra] of tabela) {
    while (resto >= valor) {
      saida += letra;
      resto -= valor;
    }
  }
  return saida;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXOS
// ─────────────────────────────────────────────────────────────────────────────

export type ChaveDeAnexo = "abrangencia" | "conteudo_programatico";

/**
 * O catálogo dos anexos, NA ORDEM em que saem.
 *
 * ⚠️ A abrangência vem primeiro: é o que o Edital 004 publica (Anexo I = abrangência,
 * Anexo II = conteúdo). Nos editais sem territorialidade ela não entra, e o conteúdo
 * programático sobe para Anexo I — que é o que o 002 e o 003 publicam.
 *
 * O cronograma NÃO é anexo numerado em nenhum dos três: é um quadro dentro do capítulo
 * `anexos`, antes do fecho.
 */
export const ANEXOS_CATALOGO: ReadonlyArray<{
  chave: ChaveDeAnexo;
  titulo: string;
  /** O capítulo que, desligado, tira este anexo do documento. */
  dependeDoCapitulo: string | null;
}> = [
  { chave: "abrangencia", titulo: "Áreas de abrangência das unidades", dependeDoCapitulo: "distribuicao_geografica" },
  { chave: "conteudo_programatico", titulo: "Conteúdos programáticos", dependeDoCapitulo: null },
];

export interface AnexoNumerado {
  chave: ChaveDeAnexo;
  titulo: string;
  /** Em romano: `I`, `II`. */
  numero: string;
}

/**
 * Os anexos que entram neste documento, já numerados.
 *
 * 🔴 **Todos dependem do capítulo `anexos` estar incluído.** "Todo capítulo é desligável"
 * (decisão de 2026-09-16), e desligar os pós-textuais tem de tirar os anexos junto —
 * senão o documento publicaria um Anexo I depois de um corpo que não o anuncia.
 */
export function anexosDoDocumento(documento: readonly CapituloResolvido[]): AnexoNumerado[] {
  const incluido = (chave: string) => documento.some((c) => c.chave === chave && c.incluido);
  if (!incluido("anexos")) return [];
  return ANEXOS_CATALOGO
    .filter((a) => a.dependeDoCapitulo === null || incluido(a.dependeDoCapitulo))
    .map((a, i) => ({ chave: a.chave, titulo: a.titulo, numero: romano(i + 1) }));
}

/** A referência a anexo no texto: `{{anexo:conteudo_programatico}}`. */
export const RE_REFERENCIA_ANEXO = /\{\{anexo:([a-z0-9_]+)\}\}/g;

export function mapaDeAnexos(anexos: readonly AnexoNumerado[]): Map<string, string> {
  return new Map(anexos.map((a) => [a.chave, a.numero]));
}

export function resolverReferenciasDeAnexo(texto: string, anexos: ReadonlyMap<string, string>): string {
  return texto.replace(RE_REFERENCIA_ANEXO, (_t, chave: string) => anexos.get(chave) ?? `[?anexo:${chave}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// QUADROS
// ─────────────────────────────────────────────────────────────────────────────

export interface QuadroNumerado {
  /** O `id` do artigo `tipo = 'quadro'`. */
  itemId: string;
  /** A âncora do artigo, se tiver — é por ela que `{{quadro:}}` aponta. */
  ancora: string | null;
  capitulo: string;
  /** Em romano: `I`, `II`. */
  numero: string;
}

/**
 * Todos os quadros do documento, numerados pela ORDEM em que aparecem.
 *
 * ⚠️ Conta só capítulos INCLUÍDOS: quadro de capítulo desligado não sai no documento, e
 * contá-lo deixaria um buraco na sequência (Quadro I, Quadro III).
 *
 * ⚠️ A numeração é do documento inteiro, não por capítulo — é como os três editais
 * numeram (Quadro I no capítulo 2, Quadro II no 12, no Edital 002).
 */
export function quadrosDoDocumento(
  capitulos: readonly { chave: string; incluido: boolean; itens: readonly ItemBruto[] }[],
): QuadroNumerado[] {
  const saida: QuadroNumerado[] = [];
  for (const cap of capitulos) {
    if (!cap.incluido) continue;
    for (const item of ordenarItens([...cap.itens])) {
      if (item.tipo !== "quadro") continue;
      saida.push({ itemId: item.id, ancora: item.ancora, capitulo: cap.chave, numero: romano(saida.length + 1) });
    }
  }
  return saida;
}

/** A referência a quadro no texto: `{{quadro:ancora}}` — a âncora do artigo do quadro. */
export const RE_REFERENCIA_QUADRO = /\{\{quadro:([a-z0-9_]+)\}\}/g;

/** Âncora → número. Quadro sem âncora não é citável, e não entra. */
export function mapaDeQuadros(quadros: readonly QuadroNumerado[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const q of quadros) if (q.ancora && !m.has(q.ancora)) m.set(q.ancora, q.numero);
  return m;
}

/**
 * Troca `{{quadro:ancora}}` pelo número em romano — SÓ o número, como os outros três
 * marcadores de referência: o texto escreve "conforme Quadro {{quadro:vagas}}", do mesmo
 * jeito que escreve "subitem {{item:laudo}}" e "Anexo {{anexo:conteudo_programatico}}".
 */
export function resolverReferenciasDeQuadro(texto: string, quadros: ReadonlyMap<string, string>): string {
  return texto.replace(RE_REFERENCIA_QUADRO, (_t, ancora: string) => quadros.get(ancora) ?? `[?quadro:${ancora}]`);
}
