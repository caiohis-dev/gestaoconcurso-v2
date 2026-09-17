/**
 * Os ARTIGOS de um capítulo — numeração, âncoras e a colagem em lote.
 *
 * 🔴 **Por que numerar item, medido nos três editais reais em 2026-09-16:**
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
 * Volume medido: ~270 a 330 artigos por edital, em até 3 níveis, mais alíneas em letra.
 *
 * 🔵 **O que mudou em 2026-09-16 (migration 20260916225307):** o artigo saiu do texto do
 * capítulo e virou **registro em `edital_itens`**. O que NÃO mudou é a medição acima nem
 * a regra que ela sustenta — o número continua calculado e nunca digitado. Mudou só onde
 * o artigo mora, e com isso o banco passou a poder garantir coisas sobre ele (âncora
 * única) e o linter a apontar o ARTIGO, não o capítulo inteiro.
 *
 * ## As duas metades deste arquivo
 *
 * | | |
 * |---|---|
 * | `numerarItens` | a **única** autoridade de numeração: registros → `7.1`, `7.2.1`, `a` |
 * | `parsearCapitulo` | só o **importador de colagem**: texto em lista → registros novos |
 *
 * ⚠️ `parsearCapitulo` NÃO numera mais. Se voltar a numerar, passam a existir duas
 * implementações da mesma regra, e elas divergem no dia em que uma for corrigida.
 */

/** Nível 0 = item (`7.1`) · 1 = subitem (`7.1.2`) · 2 = alínea (`a)`). */
export type NivelItem = 0 | 1 | 2;

/** `item` é numerado · `prosa` é parágrafo sem número · `quadro` é tabela gerada. */
export type TipoItem = "item" | "prosa" | "quadro";

/**
 * De onde sai a tabela de um artigo `tipo = 'quadro'`.
 *
 * 🔴 Domínio fechado, espelhando a CHECK do banco. Levantadas TODAS as tabelas dos três
 * editais reais: nenhuma é de forma livre — cada uma é dado que um capítulo estruturado
 * já gera ou vai gerar. Tabela nova = fatia nova, nunca grade digitável.
 */
export type QuadroFonte = "cargos" | "disciplinas" | "titulos" | "vagas_por_area" | "cronograma";

// 🔵 O campo `pronto` SAIU em 2026-09-17. Ele marcava fonte cujo capítulo ainda não
// existia, e com a fatia 7 as cinco passaram a ter — virou constante `true`, e flag que
// nunca é falsa é flag em que alguém confia sem motivo. Quem renderiza uma fonte
// desconhecida é `QuadroDoArtigo`, que a nomeia em vez de devolver espaço em branco.
export const QUADRO_FONTES: ReadonlyArray<{ fonte: QuadroFonte; rotulo: string }> = [
  { fonte: "cargos", rotulo: "Quadro de cargos, vagas e vencimentos" },
  { fonte: "disciplinas", rotulo: "Matriz da prova objetiva" },
  { fonte: "cronograma", rotulo: "Cronograma do certame" },
  { fonte: "titulos", rotulo: "Quadro de títulos por cargo" },
  { fonte: "vagas_por_area", rotulo: "Vagas por área de abrangência" },
];

/** O registro cru de `edital_itens`. */
export interface ItemBruto {
  id: string;
  capitulo_chave: string;
  ordem: number;
  nivel: number;
  tipo: string;
  texto: string | null;
  ancora: string | null;
  quadro_fonte: string | null;
  created_at?: string | null;
}

/** O mínimo para numerar: tudo o mais é irrelevante para a regra. */
export interface ItemNumeravel {
  tipo: string;
  nivel: number;
}

const LETRAS = "abcdefghijklmnopqrstuvwxyz";

/** Só `item` e `quadro` consomem número; `prosa` é parágrafo solto. */
function ehNumerado(tipo: string): boolean {
  return tipo === "item" || tipo === "quadro";
}

/**
 * Ordena os artigos de um capítulo.
 *
 * ⚠️ O desempate por `created_at` não é enfeite: NÃO há UNIQUE em
 * `(edital_id, capitulo_chave, ordem)` — a alternativa `DEFERRABLE` foi reprovada pelo
 * `db reset` em 03/08. Sem desempate estável, dois artigos com a mesma `ordem` trocariam
 * de lugar entre consultas, e a numeração pularia sozinha na cara do usuário.
 */
export function ordenarItens<T extends { ordem: number; created_at?: string | null; id: string }>(
  itens: readonly T[],
): T[] {
  return [...itens].sort(
    (a, b) =>
      a.ordem - b.ordem ||
      (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
      a.id.localeCompare(b.id),
  );
}

/**
 * 🔴 A ÚNICA autoridade de numeração do módulo, no nível do artigo.
 *
 * Num capítulo 7, a lista vira `7.1`, `7.2`, `7.2.1`, alínea `a)`, `7.3`. Inserir,
 * apagar ou mover um artigo renumera todos abaixo sozinho — que é o ponto inteiro.
 *
 * ⚠️ Espera a lista **já ordenada** (`ordenarItens`). Ordenar aqui dentro exigiria que o
 * tipo genérico carregasse `ordem`, e o importador de colagem não tem `ordem` ainda.
 */
export function numerarItens<T extends ItemNumeravel>(
  itens: readonly T[],
  numeroCapitulo: number | null,
): (T & { numero: string })[] {
  // contador[n] = quantos artigos numerados saíram no nível n desde o último reinício
  const contador = [0, 0, 0];

  return itens.map((item) => {
    if (!ehNumerado(item.tipo)) return { ...item, numero: "" };

    const nivel = Math.min(2, Math.max(0, item.nivel)) as NivelItem;
    contador[nivel] += 1;
    // Descer de nível reinicia os contadores abaixo: o subitem 7.2.1 vem depois do
    // 7.1.3 sem herdar a contagem dele.
    for (let n = nivel + 1; n < contador.length; n++) contador[n] = 0;

    if (numeroCapitulo === null) return { ...item, numero: "" };

    let numero: string;
    if (nivel === 0) numero = `${numeroCapitulo}.${contador[0]}`;
    else if (nivel === 1) numero = `${numeroCapitulo}.${contador[0]}.${contador[1]}`;
    // Alínea é LETRA, como nos editais reais ("item 15.8, alínea L"). Passando de 26
    // repete a última em vez de quebrar — caso que não existe hoje e não vale um erro.
    else numero = LETRAS[Math.min(contador[2] - 1, LETRAS.length - 1)];

    return { ...item, numero };
  });
}

/** Agrupa os artigos de um edital por capítulo, cada grupo já ordenado. */
export function agruparPorCapitulo(itens: readonly ItemBruto[]): Map<string, ItemBruto[]> {
  const m = new Map<string, ItemBruto[]>();
  for (const i of itens) {
    const lista = m.get(i.capitulo_chave) ?? [];
    lista.push(i);
    m.set(i.capitulo_chave, lista);
  }
  for (const [chave, lista] of m) m.set(chave, ordenarItens(lista));
  return m;
}

/** Um capítulo do documento, com os artigos que moram nele. */
export interface CapituloComItens {
  chave: string;
  numero: number | null;
  incluido: boolean;
  itens: readonly ItemBruto[];
}

export interface AncoraDoDocumento {
  ancora: string;
  capitulo: string;
  numero: string;
}

/** Todas as âncoras do documento, com o número que cada uma resolve. */
export function ancorasDoDocumento(capitulos: readonly CapituloComItens[]): AncoraDoDocumento[] {
  const achadas: AncoraDoDocumento[] = [];
  for (const cap of capitulos) {
    if (!cap.incluido) continue;
    for (const item of numerarItens(ordenarItens([...cap.itens]), cap.numero)) {
      if (item.ancora) achadas.push({ ancora: item.ancora, capitulo: cap.chave, numero: item.numero });
    }
  }
  return achadas;
}

export function mapaDeAncoras(ancoras: readonly AncoraDoDocumento[]): Map<string, string> {
  const m = new Map<string, string>();
  // 🔵 Até 16/09 a primeira vencia e o linter acusava a duplicata. Hoje o índice único
  // `edital_itens_ancora_key` a torna impossível; este `if` sobra como rede para dado
  // montado em memória (teste, importação), não para dado vindo do banco.
  for (const a of ancoras) if (!m.has(a.ancora)) m.set(a.ancora, a.numero);
  return m;
}

/** A referência a artigo no texto: `{{item:ancora}}`. */
export const RE_REFERENCIA_ITEM = /\{\{item:([a-z0-9_]+)\}\}/g;

/**
 * Troca `{{item:ancora}}` pelo número do artigo.
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

// ─────────────────────────────────────────────────────────────────────────────
// O IMPORTADOR DE COLAGEM
// ─────────────────────────────────────────────────────────────────────────────
//
// Os editais reais têm 270 a 330 artigos. Criar um por vez, um clique cada, é uma
// regressão que aparece no primeiro uso — por isso a tela oferece colar um capítulo
// inteiro em lista, e é este parser que o quebra em registros.
//
// ⚠️ Ele NÃO numera. A numeração é de `numerarItens`, e só dela.

/** `- {#ancora} texto` · a indentação define o nível. */
const RE_ITEM = /^(\s*)-\s+(?:\{#([a-z0-9_]+)\}\s*)?(.*)$/;

export interface LinhaColada {
  tipo: "prosa" | "item";
  texto: string;
  nivel: NivelItem;
  ancora: string | null;
  /** Índice da linha no texto colado — para apontar onde está um problema. */
  linha: number;
}

/**
 * Quebra um texto em lista nos artigos que ele contém.
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
 * ⚠️ A indentação é de 2 em 2 espaços, e passa pelo `Math.floor`: 3 espaços contam como
 * 1 nível. Ser tolerante aqui é deliberado — quem cola não deve perder um artigo por um
 * espaço a mais, e o nível errado é visível na lista na hora.
 */
export function parsearCapitulo(texto: string): LinhaColada[] {
  const saida: LinhaColada[] = [];

  texto.split("\n").forEach((bruta, i) => {
    const m = RE_ITEM.exec(bruta);
    if (!m) {
      if (bruta.trim() !== "") {
        saida.push({ tipo: "prosa", texto: bruta.trim(), nivel: 0, ancora: null, linha: i });
      }
      return;
    }
    const nivel = Math.min(2, Math.floor(m[1].replace(/\t/g, "  ").length / 2)) as NivelItem;
    saida.push({ tipo: "item", texto: m[3].trim(), nivel, ancora: m[2] ?? null, linha: i });
  });

  return saida;
}
