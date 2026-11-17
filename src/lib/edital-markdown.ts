/**
 * O edital em Markdown — uma PROJEÇÃO do `DocumentoMontado`, nunca uma segunda montagem.
 *
 * 🔴 **Não numera nem resolve nada.** Número de capítulo, de item, de quadro e de anexo, e
 * os marcadores, saem de `src/lib/edital-documento.ts` — o mesmo objeto que a prévia
 * desenha. Um exportador que remontasse o documento por conta própria poderia publicar um
 * número diferente do que a pessoa conferiu na tela.
 *
 * 🔴 **A numeração sai como TEXTO, escapada (D-PDF, 2026-11-16).** A diagramação final é no
 * Word, a partir deste arquivo. Uma linha `1. Texto` vira LISTA ORDENADA em qualquer
 * conversor, e lista ordenada se renumera sozinha: o número publicado deixaria de ser o
 * calculado. O pandoc vai além do CommonMark e também lê `a) `, `(a)` e `I. ` como lista
 * (extensão `fancy_lists`). Por isso todo começo de linha que um conversor possa ler como
 * bloco leva barra invertida — `7.1\.` nunca, `1\.` e `a\)` sempre (ver `escaparInicioDeLinha`).
 *
 * ⚠️ **Sem recuo por nível.** Quatro espaços à esquerda é bloco de CÓDIGO em Markdown. A
 * hierarquia está no número (`7.1`, `7.1.2`, `a)`), como nos editais publicados, e o
 * recuo é diagramação do Word.
 *
 * Pendência (quadro sem dado, anexo vazio) sai VISÍVEL, como citação marcada
 * "PENDÊNCIA" — nunca um buraco no arquivo. O portão da etapa 4 é quem impede exportar
 * com ela; este módulo só garante que, se passar, ela não passa calada.
 */
import { segmentarNegrito } from "@/lib/edital-texto";
import {
  rotuloDoNumero,
  type AnexoMontado,
  type ArtigoMontado,
  type CapituloMontado,
  type DocumentoMontado,
  type QuadroMontado,
} from "@/lib/edital-documento";

// ─────────────────────────────────────────────────────────────────────────────
// ESCAPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caracteres que viram marcação EM QUALQUER PONTO da linha: ênfase (`*`, `_`), código,
 * link e imagem (`[`, `]`), HTML e autolink (`<`, `>`), entidade (`&`), célula de tabela
 * (`|`), riscado e subscrito do pandoc (`~`), sobrescrito (`^`), fórmula (`$`).
 *
 * ⚠️ O `$` só é escapado COLADO a algo: `R$ 100,00` (com espaço) não abre fórmula no
 * pandoc, e escapar todo "R$" encheria de barras um arquivo que existe para ser lido.
 *
 * ⚠️ `[?campo:x]` também passa por aqui: o marcador de pendência tem de sair literal.
 */
const RE_INLINE = /[\\`*_[\]<>&|~^]|\$(?=\S)/g;

export function escaparInline(texto: string): string {
  return texto.replace(RE_INLINE, (c) => `\\${c}`);
}

/**
 * O começo de linha que um conversor pode ler como BLOCO:
 * - lista ordenada: `1.`, `1)`, `a)`, `A.`, `iv.` — o pandoc aceita UMA letra ou um
 *   ROMANO, nunca palavra: `SUS.` e `Av. Brasil` não são lista e não levam barra;
 * - lista com `(`: `(a)`, `(1)`, `(@)` — o `(` é escapado;
 * - lista com marcador, citação, título, régua, título setext, definição: `-`, `+`, `>`,
 *   `#`, `=`, `:` (o `*` e o `~` já saem escapados pelo inline).
 *
 * Só o primeiro caractere de pontuação recebe a barra: `7.1. ` não é lista e fica como
 * está; `1. ` vira `1\. `.
 */
const RE_INICIO_NUMERADO = /^([0-9]{1,9}|[A-Za-z]|[ivxlcdm]{1,8}|[IVXLCDM]{1,8})([.)])(?=\s|$)/;
const RE_INICIO_SIMBOLO = /^([-+>#=:(])/;

export function escaparInicioDeLinha(linha: string): string {
  return linha.replace(RE_INICIO_NUMERADO, "$1\\$2").replace(RE_INICIO_SIMBOLO, "\\$1");
}

/**
 * Texto com `**negrito**` → Markdown seguro.
 *
 * O negrito é o único recurso (medido: 265 marcadores no Edital 004, nenhum outro). Cada
 * segmento é escapado, e o espaço da borda sai para FORA do `**`: `** x**` não é negrito
 * em CommonMark (o delimitador de abertura não pode vir seguido de espaço), e o asterisco
 * apareceria cru no Word.
 */
function inline(texto: string): string {
  return segmentarNegrito(texto)
    .map((s) => {
      const t = escaparInline(s.texto);
      if (!s.negrito) return t;
      const m = /^(\s*)(.*?)(\s*)$/s.exec(t)!;
      return m[2] ? `${m[1]}**${m[2]}**${m[3]}` : t;
    })
    .join("");
}

/**
 * Um texto de várias linhas como parágrafos Markdown.
 *
 * - linha em branco separa PARÁGRAFO;
 * - quebra simples vira quebra DURA (`\` no fim): em Markdown a quebra simples some, e duas
 *   linhas da ementa sairiam coladas numa só;
 * - o espaço à esquerda sai (quatro espaços seriam bloco de código), e cada linha passa
 *   pelo escape de começo de linha — inclusive as do meio do parágrafo, porque um `- `
 *   ali interrompe o parágrafo e abre lista.
 *
 * ⚠️ O escape de começo de linha é aplicado DEPOIS do inline e no texto já com o rótulo:
 * `1\.` vem do rótulo, e o `\` que o inline pôs num `*` inicial não é tocado de novo.
 */
export function paragrafos(texto: string, rotulo = ""): string[] {
  const blocos: string[][] = [[]];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (linha === "") {
      if (blocos[blocos.length - 1].length > 0) blocos.push([]);
      continue;
    }
    blocos[blocos.length - 1].push(linha);
  }
  const cheios = blocos.filter((b) => b.length > 0);
  if (cheios.length === 0) return rotulo ? [escaparInicioDeLinha(escaparInline(rotulo.trimEnd()))] : [];

  return cheios.map((linhas, i) =>
    linhas
      .map((l, j) => escaparInicioDeLinha((i === 0 && j === 0 ? escaparInline(rotulo) : "") + inline(l)))
      .join("\\\n"),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCOS
// ─────────────────────────────────────────────────────────────────────────────

function caixaAlta(t: string): string {
  return t.toLocaleUpperCase("pt-BR");
}

/** Título: `## 7. DAS INSCRIÇÕES`. O número dentro de título não vira lista. */
function titulo(nivel: number, texto: string): string {
  return `${"#".repeat(nivel)} ${inline(texto)}`;
}

/** Pendência VISÍVEL. Citação, para destacar sem depender de cor. */
function pendencia(motivo: string): string {
  return `> **PENDÊNCIA:** ${inline(motivo)}`;
}

/** Célula: tabela de pipe não aceita quebra de linha — a quebra vira espaço. */
function celula(texto: string): string {
  return inline(texto.replace(/\s*\r?\n\s*/g, " ").trim());
}

/**
 * Tabela GFM (a que o pandoc lê como `pipe_tables`). Coluna numérica alinhada à direita,
 * como na prévia.
 */
export function tabela(quadro: QuadroMontado): string {
  if (quadro.pendencia) return pendencia(quadro.pendencia);
  const cab = `| ${quadro.colunas.map((c) => celula(c.titulo)).join(" | ")} |`;
  const sep = `| ${quadro.colunas.map((c) => (c.numerica ? "---:" : "---")).join(" | ")} |`;
  const linhas = quadro.linhas.map(
    (l) => `| ${quadro.colunas.map((_c, j) => celula(l[j] ?? "")).join(" | ")} |`,
  );
  return [cab, sep, ...linhas].join("\n");
}

function artigo(a: ArtigoMontado): string[] {
  const saida = paragrafos(a.texto, rotuloDoNumero(a));
  if (a.tipo === "quadro") {
    saida.push(`**Quadro ${escaparInline(a.numeroDoQuadro ?? "?")}**`);
    // `quadro: null` só acontece se o documento foi montado SEM o dado dos quadros. Sair
    // em branco seria o buraco que este módulo existe para não deixar.
    saida.push(a.quadro ? tabela(a.quadro) : pendencia("O dado deste quadro não foi carregado."));
  }
  return saida;
}

function capitulo(c: CapituloMontado): string[] {
  const cab = titulo(2, caixaAlta(c.numero !== null ? `${c.numero}. ${c.titulo}` : c.titulo));
  if (c.artigos.length === 0) return [cab];
  return [cab, ...c.artigos.flatMap(artigo)];
}

function anexo(a: AnexoMontado): string[] {
  const saida = [titulo(2, caixaAlta(`Anexo ${a.numero} — ${a.titulo}`))];
  if (a.pendencia) return [...saida, pendencia(a.pendencia)];

  if (a.conteudo) {
    for (const bloco of a.conteudo) {
      if (bloco.cargo) saida.push(titulo(3, caixaAlta(`Cargo: ${bloco.cargo}`)));
      for (const d of bloco.disciplinas) {
        const nome = bloco.cargo === null ? `${d.nome} (comum a todos os cargos)` : d.nome;
        saida.push(`**${inline(caixaAlta(nome))}**`);
        saida.push(...paragrafos(d.ementa));
      }
    }
  } else if (a.abrangencia) {
    for (const u of a.abrangencia) {
      saida.push(titulo(3, caixaAlta(u.unidade)));
      // A numeração das ruas é POR UNIDADE e atravessa os bairros — como na prévia e no
      // Anexo I do Edital 004. Como texto escapado: lista ordenada se renumeraria.
      let n = 0;
      for (const s of u.secoes) {
        if (s.bairro) saida.push(`**${inline(s.bairro)}:**`);
        saida.push(s.logradouros.map((l) => `${++n}\\. ${inline(l.trim())}`).join("\\\n"));
      }
    }
  } else {
    // Anexo montado sem o dado: numerado, mas sem conteúdo. Nunca em branco.
    saida.push(pendencia("O dado deste anexo não foi carregado."));
  }
  return saida;
}

/**
 * O documento inteiro. Blocos separados por linha em branco; termina em `\n`.
 *
 * `titulo` é o nome do edital, como `# título` no topo — opcional porque o documento
 * montado não o carrega.
 */
export function documentoEmMarkdown(documento: DocumentoMontado, opcoes: { titulo?: string } = {}): string {
  const blocos = [
    ...(opcoes.titulo ? [titulo(1, opcoes.titulo)] : []),
    ...documento.capitulos.flatMap(capitulo),
    ...documento.anexos.flatMap(anexo),
  ];
  return `${blocos.join("\n\n")}\n`;
}
