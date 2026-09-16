/**
 * Montagem e numeração do documento do edital.
 *
 * 🔴 **O número de um capítulo é CALCULADO, nunca guardado.** É a regra central do
 * módulo, e existe por um defeito medido: capítulo condicional que não entra não ocupa
 * número, e todos abaixo sobem. O mesmo capítulo de PCD cai em 7, 7 e 8 nos três editais
 * reais da FEVRE, conforme a territorialidade entre ou não.
 *
 * O Edital 002/2026 publicado já carrega o resíduo de numerar à mão: uma linha solta
 * "10. e seus subitens" dentro do capítulo 7 — referência cruzada que envelheceu quando
 * a numeração mudou e ninguém percebeu.
 *
 * Por isso **referência cruzada aponta para a `chave`**, e o número é resolvido na
 * renderização. Ver `edital-capitulos.ts` e o roadmap em
 * `my_rules/analises/roadmap-editais-espinha-do-documento.yaml`.
 */
import {
  CAPITULOS_CATALOGO,
  CAPITULO_POR_CHAVE,
  type CapituloCatalogo,
} from "@/lib/edital-capitulos";

/**
 * O que o banco guarda por capítulo. É um OVERRIDE: capítulo sem linha vale pelo padrão
 * do catálogo. Ver o comentário da migration 20260916173801 para o porquê.
 */
export interface CapituloOverride {
  chave: string;
  ordem?: number | null;
  incluido?: boolean | null;
}

// 🔵 `texto` SAIU daqui em 2026-09-16 junto com a coluna do banco: o conteúdo do
// capítulo agora são os registros de `edital_itens`, um por artigo. Um capítulo é só
// posição, inclusão e título — o texto mora um nível abaixo.

/** Um capítulo já resolvido: catálogo + override + número calculado. */
export interface CapituloResolvido extends CapituloCatalogo {
  ordem: number;
  incluido: boolean;
  /** `null` quando o capítulo não é numerado (preâmbulo, anexos) ou está excluído. */
  numero: number | null;
}

/** A sintaxe da referência cruzada no texto: `{{cap:vagas_pcd}}`. */
export const RE_REFERENCIA = /\{\{cap:([a-z0-9_]+)\}\}/g;

/**
 * Cruza o catálogo com os overrides e calcula o número de cada capítulo.
 *
 * ⚠️ A numeração conta **só os incluídos E numerados**, na ordem do documento. Preâmbulo
 * e anexos entram no documento mas não recebem número — e não consomem posição, senão o
 * capítulo 1 viraria 2.
 */
export function montarDocumento(overrides: readonly CapituloOverride[] = []): CapituloResolvido[] {
  const porChave = new Map(overrides.map((o) => [o.chave, o]));

  const resolvidos = CAPITULOS_CATALOGO.map((cat, i) => {
    const o = porChave.get(cat.chave);
    return {
      ...cat,
      // `??` e não `||`: ordem 0 e `incluido: false` são valores legítimos que o `||`
      // engoliria, devolvendo o padrão do catálogo no lugar da escolha do usuário.
      ordem: o?.ordem ?? i,
      incluido: o?.incluido ?? cat.padrao,
      numero: null as number | null,
    };
  });

  // Desempate pela posição do catálogo: sem ele, dois capítulos com a mesma `ordem`
  // ficariam na ordem de chegada do banco — que muda entre consultas.
  const catalogoIdx = new Map(CAPITULOS_CATALOGO.map((c, i) => [c.chave, i]));
  resolvidos.sort(
    (a, b) => a.ordem - b.ordem || catalogoIdx.get(a.chave)! - catalogoIdx.get(b.chave)!,
  );

  let n = 0;
  for (const c of resolvidos) {
    if (c.incluido && c.numerado) c.numero = ++n;
  }
  return resolvidos;
}

/** Mapa chave → número, para resolver referência cruzada. */
export function mapaDeNumeros(documento: readonly CapituloResolvido[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of documento) if (c.numero !== null) m.set(c.chave, c.numero);
  return m;
}

export interface ReferenciaEncontrada {
  chave: string;
  /** `desconhecida`: não existe no catálogo. `excluida`: existe, mas está desligada. */
  problema: "desconhecida" | "excluida" | null;
}

/** Lista as referências de um texto, dizendo quais não resolvem. */
export function referenciasDoTexto(
  texto: string,
  documento: readonly CapituloResolvido[],
): ReferenciaEncontrada[] {
  const numeros = mapaDeNumeros(documento);
  const achadas: ReferenciaEncontrada[] = [];
  for (const m of texto.matchAll(RE_REFERENCIA)) {
    const chave = m[1];
    achadas.push({
      chave,
      problema: !CAPITULO_POR_CHAVE.has(chave)
        ? "desconhecida"
        : numeros.has(chave)
          ? null
          : "excluida",
    });
  }
  return achadas;
}

/**
 * Troca `{{cap:chave}}` pelo número do capítulo.
 *
 * ⚠️ Referência que não resolve NÃO vira número nem some: vira um marcador visível
 * (`[?chave]`). Sumir em silêncio é como o resíduo do Edital 002 passou despercebido —
 * e um número inventado seria pior ainda. Quem acusa o problema é o linter.
 */
export function resolverReferencias(
  texto: string,
  documento: readonly CapituloResolvido[],
): string {
  const numeros = mapaDeNumeros(documento);
  return texto.replace(RE_REFERENCIA, (_todo, chave: string) => {
    const n = numeros.get(chave);
    return n === undefined ? `[?${chave}]` : String(n);
  });
}
