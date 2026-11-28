/**
 * O Markdown é PROJEÇÃO do documento montado — e a numeração sai como texto.
 *
 * O risco que este arquivo guarda (D-PDF, 2026-11-16): a diagramação final é no Word, a
 * partir deste Markdown. Uma linha que o conversor leia como LISTA ORDENADA é renumerada
 * por ele, e o número publicado deixa de ser o calculado — o defeito que a v3 inteira
 * existe para eliminar, reintroduzido na última etapa.
 *
 * O controle positivo forte é o EDITAL MODELO INTEIRO (19 capítulos, 377 artigos): nenhuma
 * linha dele pode começar como bloco de lista/código, e todo número do arquivo tem de ser o
 * número do documento montado.
 */
import { describe, expect, it } from "vitest";
import { montarDocumento } from "@/lib/edital-numeracao";
import type { ItemBruto } from "@/lib/edital-itens";
import { CAPITULOS_CATALOGO } from "@/lib/edital-capitulos";
import { artigosDoModelo } from "@/lib/edital-modelo";
import {
  montarEditalCompleto,
  rotuloDoNumero,
  type AnexoMontado,
  type ArtigoMontado,
  type DadosDoCabecalho,
  type DadosDosQuadros,
  type DocumentoMontado,
  type QuadroMontado,
} from "@/lib/edital-documento";
import {
  documentoEmMarkdown,
  escaparInicioDeLinha,
  escaparInline,
  paragrafos,
  tabela,
} from "@/lib/edital-markdown";

/** O cabeçalho do Edital 002/2026 como publicado — completo, então não gera pendência. */
const CABECALHO_002: DadosDoCabecalho = {
  numero_edital: "002",
  ano: 2026,
  secretaria_sigla: "SMA",
  secretaria_publicadora: "Secretaria Municipal de Administração",
  natureza_juridica: "CONCURSO_PUBLICO",
  orgao_demandante: "Secretaria Municipal de Educação",
};

const art = (p: Partial<ArtigoMontado>): ArtigoMontado => ({
  id: "a",
  numero: "",
  nivel: 0,
  tipo: "item",
  texto: "texto",
  quadro: null,
  numeroDoQuadro: null,
  ...p,
});

const doc = (artigos: ArtigoMontado[], anexos: AnexoMontado[] = []): DocumentoMontado => ({
  cabecalho: { linhas: [], pendencias: [] },
  capitulos: [{ chave: "inscricao", titulo: "Das inscrições", numero: 7, artigos }],
  anexos,
});

/**
 * Começo de linha que ALGUM conversor lê como bloco que não é parágrafo.
 * - CommonMark: lista `1.`/`1)`, marcador `-`/`+`/`*`, citação, título, código (4 espaços);
 * - pandoc (`fancy_lists`, `example_lists`): `a)`, `a.`, `(a)`, `iv.`, `(@)`.
 *
 * ⚠️ Escrito à parte do exportador, de propósito: reutilizar o regex dele tornaria o teste
 * uma tautologia.
 */
function abreBloco(linha: string): boolean {
  return (
    /^ {4}/.test(linha) ||
    /^ {0,3}(\d{1,9}|[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+|#)[.)](\s|$)/.test(linha) ||
    /^ {0,3}\((\d{1,9}|[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+|@)\)/.test(linha) ||
    /^ {0,3}(>|#{1,6}(\s|$))/.test(linha) ||
    /^ {0,3}[-+*:~](\s|$)/.test(linha) ||
    /^ {0,3}(-{3,}|={3,}|\*{3,}|_{3,})\s*$/.test(linha)
  );
}

describe("escaparInicioDeLinha — o número não vira lista", () => {
  it.each([
    ["1. Texto", "1\\. Texto"],
    ["12) Texto", "12\\) Texto"],
    ["a) alínea", "a\\) alínea"],
    ["IV. inciso", "IV\\. inciso"],
    ["(a) item", "\\(a) item"],
    ["- traço", "\\- traço"],
    ["+ mais", "\\+ mais"],
    ["> citação", "\\> citação"],
    ["# título", "\\# título"],
    ["===", "\\==="],
    [": definição", "\\: definição"],
  ])("%j → %j", (entrada, saida) => {
    expect(escaparInicioDeLinha(entrada)).toBe(saida);
    expect(abreBloco(saida)).toBe(false);
    expect(abreBloco(entrada)).toBe(true); // controle: a entrada abriria bloco
  });

  it("controle positivo: `7.1.` e `7.1.2.` NÃO são lista e saem intactos — sem barra à toa", () => {
    expect(escaparInicioDeLinha("7.1. Texto")).toBe("7.1. Texto");
    expect(escaparInicioDeLinha("7.1.2. Texto")).toBe("7.1.2. Texto");
    expect(escaparInicioDeLinha("Av. Brasil, 10")).toBe("Av. Brasil, 10");
    expect(escaparInicioDeLinha("SUS.")).toBe("SUS.");
  });
});

describe("escaparInline", () => {
  it("o marcador de pendência sai LITERAL — nem link, nem ênfase", () => {
    expect(escaparInline("[?campo:data_da_prova]")).toBe("\\[?campo:data\\_da\\_prova\\]");
  });

  it("`|` escapado (célula de tabela) e `<` (HTML)", () => {
    expect(escaparInline("a | b <c>")).toBe("a \\| b \\<c\\>");
  });

  it("controle positivo: `R$ 100,00` com espaço fica como está; `R$100` colado é escapado", () => {
    expect(escaparInline("R$ 100,00")).toBe("R$ 100,00");
    expect(escaparInline("R$100")).toBe("R\\$100");
  });
});

describe("paragrafos", () => {
  it("quebra simples vira quebra DURA — senão as linhas da ementa sairiam coladas", () => {
    expect(paragrafos("Fonética\nOrtografia")).toEqual(["Fonética\\\nOrtografia"]);
  });

  it("linha em branco separa parágrafo; brancos repetidos não criam parágrafo vazio", () => {
    expect(paragrafos("um\n\n\n\ndois")).toEqual(["um", "dois"]);
  });

  it("🔴 cada linha do MEIO do parágrafo também é escapada — `1. ` ali abriria lista", () => {
    const [p] = paragrafos("Tópicos:\n1. Fonética\n- Sintaxe");
    expect(p).toBe("Tópicos:\\\n1\\. Fonética\\\n\\- Sintaxe");
    for (const l of p.split("\n")) expect(abreBloco(l)).toBe(false);
  });

  it("espaço à esquerda sai — quatro espaços seriam bloco de código", () => {
    expect(paragrafos("    recuado")).toEqual(["recuado"]);
  });

  it("negrito preservado; o espaço da borda vai para FORA do `**`", () => {
    expect(paragrafos("**Atenção:** leia")).toEqual(["**Atenção:** leia"]);
    expect(paragrafos("ver** item 7 **agora")).toEqual(["ver **item 7** agora"]);
  });

  it("asterisco solto (negrito sem fechar) sai escapado, visível — nunca some", () => {
    expect(paragrafos("**sem fechar")).toEqual(["\\*\\*sem fechar"]);
  });

  it("o rótulo entra só no primeiro parágrafo", () => {
    expect(paragrafos("um\n\ndois", "7.1. ")).toEqual(["7.1. um", "dois"]);
  });

  it("artigo sem texto ainda publica o número — não some", () => {
    expect(paragrafos("", "7.1. ")).toEqual(["7.1."]);
  });
});

describe("o CABEÇALHO (E2)", () => {
  const vazio = { capitulos: [], anexos: [] };

  it("as linhas saem em negrito, empilhadas num parágrafo só, ANTES do primeiro capítulo", () => {
    const md = documentoEmMarkdown(
      { ...vazio, cabecalho: { linhas: ["MUNICÍPIO DE VOLTA REDONDA", "Edital Nº. 002/2026-SMA"], pendencias: [] } },
      { titulo: "Edital 002" },
    );
    expect(md).toBe("# Edital 002\n\n**MUNICÍPIO DE VOLTA REDONDA**\\\n**Edital Nº. 002/2026-SMA**\n");
  });

  it("🔴 falta vira PENDÊNCIA visível, nunca linha em branco", () => {
    const md = documentoEmMarkdown({ ...vazio, cabecalho: { linhas: ["MUNICÍPIO DE VOLTA REDONDA"], pendencias: ["Sem número."] } });
    expect(md).toBe("**MUNICÍPIO DE VOLTA REDONDA**\n\n> **PENDÊNCIA:** Sem número.\n");
  });
});

describe("artigos e capítulos", () => {
  it("🔴 o número é o do documento montado, como texto, nos três níveis", () => {
    const md = documentoEmMarkdown(
      doc([
        art({ numero: "7.1", nivel: 0, texto: "Item" }),
        art({ numero: "7.1.1", nivel: 1, texto: "Subitem" }),
        art({ numero: "a", nivel: 2, texto: "Alínea" }),
        art({ numero: "", tipo: "prosa", texto: "Prosa" }),
      ]),
    );
    expect(md).toBe("## 7. DAS INSCRIÇÕES\n\n7.1. Item\n\n7.1.1. Subitem\n\na\\) Alínea\n\nProsa\n");
  });

  it("capítulo sem número sai sem número; capítulo vazio sai só com o título", () => {
    const md = documentoEmMarkdown({
      cabecalho: { linhas: [], pendencias: [] },
      capitulos: [{ chave: "preambulo", titulo: "Preâmbulo", numero: null, artigos: [] }],
      anexos: [],
    });
    expect(md).toBe("## PREÂMBULO\n");
  });

  it("título do edital opcional no topo", () => {
    expect(documentoEmMarkdown(doc([]), { titulo: "Edital 002/2026" }).startsWith("# Edital 002/2026\n\n## 7.")).toBe(
      true,
    );
  });
});

describe("quadros", () => {
  const q: QuadroMontado = {
    fonte: "cargos",
    colunas: [{ titulo: "Cargo", numerica: false }, { titulo: "Vagas", numerica: true }],
    linhas: [
      ["Agente | Comunitário", "10"],
      ["Médico\nClínico", "2"],
    ],
    pendencia: null,
  };

  it("tabela de pipe: `|` da célula escapado, quebra vira espaço, coluna numérica à direita", () => {
    expect(tabela(q)).toBe(
      "| Cargo | Vagas |\n| --- | ---: |\n| Agente \\| Comunitário | 10 |\n| Médico Clínico | 2 |",
    );
  });

  it("legenda, número do quadro e tabela, nessa ordem", () => {
    const md = documentoEmMarkdown(
      doc([art({ numero: "7.1", tipo: "quadro", texto: "Os cargos:", quadro: q, numeroDoQuadro: "II" })]),
    );
    expect(md).toContain("7.1. Os cargos:\n\n**Quadro II**\n\n| Cargo | Vagas |");
  });

  it("🔴 quadro com pendência sai como PENDÊNCIA visível, não tabela vazia", () => {
    const md = documentoEmMarkdown(
      doc([
        art({
          tipo: "quadro",
          numeroDoQuadro: "I",
          quadro: { ...q, linhas: [], pendencia: "Nenhum cargo vinculado a este edital." },
        }),
      ]),
    );
    expect(md).toContain("**Quadro I**\n\n> **PENDÊNCIA:** Nenhum cargo vinculado a este edital.");
    expect(md).not.toContain("| Cargo |");
  });

  it("🔴 quadro sem dado carregado (`quadro: null`) também é pendência — nunca buraco", () => {
    const md = documentoEmMarkdown(doc([art({ tipo: "quadro", numeroDoQuadro: "I", quadro: null })]));
    expect(md).toContain("**Quadro I**\n\n> **PENDÊNCIA:**");
  });
});

describe("anexos", () => {
  const base = { titulo: "Conteúdos programáticos", conteudo: null, abrangencia: null, pendencia: null };

  it("conteúdo programático: comuns marcadas, depois por cargo; ementa com linhas escapadas", () => {
    const md = documentoEmMarkdown(
      doc([], [
        {
          ...base,
          chave: "conteudo_programatico",
          numero: "I",
          conteudo: [
            { cargo: null, disciplinas: [{ nome: "Língua Portuguesa", ementa: "1. Fonética\n2. Sintaxe" }] },
            { cargo: "Enfermeiro", disciplinas: [{ nome: "Saúde Pública", ementa: "SUS." }] },
          ],
        },
      ]),
    );
    expect(md).toContain(
      [
        "## ANEXO I — CONTEÚDOS PROGRAMÁTICOS",
        "**LÍNGUA PORTUGUESA (COMUM A TODOS OS CARGOS)**",
        "1\\. Fonética\\\n2\\. Sintaxe",
        "### CARGO: ENFERMEIRO",
        "**SAÚDE PÚBLICA**",
        "SUS.",
      ].join("\n\n"),
    );
  });

  it("abrangência: ruas numeradas por UNIDADE, atravessando bairros, como texto escapado", () => {
    const md = documentoEmMarkdown(
      doc([], [
        {
          ...base,
          chave: "abrangencia",
          numero: "I",
          titulo: "Áreas de abrangência das unidades",
          abrangencia: [
            { unidade: "UBSF Centro", secoes: [{ bairro: "Centro", logradouros: ["Rua A", "Rua B"] }, { bairro: "Vila", logradouros: ["Rua C"] }] },
            { unidade: "UBSF Norte", secoes: [{ bairro: null, logradouros: ["Rua D"] }] },
          ],
        },
      ]),
    );
    expect(md).toContain(
      "### UBSF CENTRO\n\n**Centro:**\n\n1\\. Rua A\\\n2\\. Rua B\n\n**Vila:**\n\n3\\. Rua C\n\n### UBSF NORTE\n\n1\\. Rua D",
    );
  });

  it("🔴 anexo com pendência, ou sem dado, sai como PENDÊNCIA — nunca em branco", () => {
    const md = documentoEmMarkdown(
      doc([], [
        { ...base, chave: "conteudo_programatico", numero: "I", pendencia: "Nenhuma ementa cadastrada." },
        { ...base, chave: "abrangencia", numero: "II" },
      ]),
    );
    expect(md).toContain("## ANEXO I — CONTEÚDOS PROGRAMÁTICOS\n\n> **PENDÊNCIA:** Nenhuma ementa cadastrada.");
    expect(md).toContain("## ANEXO II — CONTEÚDOS PROGRAMÁTICOS\n\n> **PENDÊNCIA:** O dado deste anexo não foi carregado.");
  });
});

describe("⭐ o edital modelo inteiro (controle positivo)", () => {
  const itens: ItemBruto[] = artigosDoModelo().map(({ capituloChave, ordem, artigo }, i) => ({
    id: `m${i}`,
    capitulo_chave: capituloChave,
    ordem,
    nivel: artigo.nivel ?? 0,
    tipo: artigo.tipo,
    texto: artigo.texto,
    ancora: artigo.ancora ?? null,
    quadro_fonte: artigo.quadroFonte ?? null,
  }));
  const porCapitulo = new Map<string, ItemBruto[]>();
  for (const i of itens) porCapitulo.set(i.capitulo_chave, [...(porCapitulo.get(i.capitulo_chave) ?? []), i]);
  const vazio: DadosDosQuadros = {
    cargosDoEdital: [],
    nomesDosCargos: new Map(),
    disciplinas: [],
    titulos: [],
    distribuicao: [],
    nomesDasUnidades: new Map(),
    etapas: [],
  };
  // Todos os capítulos ligados — inclusive os condicionais — para exercitar o modelo todo.
  const montado = montarEditalCompleto({ cabecalho: CABECALHO_002,
    documento: montarDocumento(CAPITULOS_CATALOGO.map((c) => ({ chave: c.chave, incluido: true }))),
    porCapitulo,
    valores: new Map(),
    quadros: vazio,
    anexos: { ementas: [], abrangencia: [] },
  });
  const md = documentoEmMarkdown(montado);
  const linhas = md.split("\n");
  const artigos = montado.capitulos.flatMap((c) => c.artigos);

  it("o modelo é o que se espera (sanidade da fixture)", () => {
    expect(artigos.length).toBeGreaterThan(370);
    expect(artigos.filter((a) => a.nivel === 2 && a.numero).length).toBeGreaterThan(0);
  });

  it("🔴 NENHUMA linha começa como lista, código, citação crua ou régua", () => {
    // As três exceções são blocos que o PRÓPRIO exportador emite: título, tabela, pendência.
    const culpadas = linhas.filter(
      (l) => abreBloco(l) && !/^#{1,3} /.test(l) && !l.startsWith("| ") && !l.startsWith("> **PENDÊNCIA:**"),
    );
    expect(culpadas).toEqual([]);
  });

  it("🔴 todo artigo numerado abre parágrafo com o MESMO número do documento montado", () => {
    const paragrafosDoMd = md.split("\n\n");
    let cursor = 0;
    for (const a of artigos.filter((x) => x.numero)) {
      const rotulo = escaparInicioDeLinha(rotuloDoNumero(a));
      const achado = paragrafosDoMd.findIndex((p, i) => i >= cursor && p.startsWith(rotulo));
      expect(achado, `artigo ${a.numero} ("${a.texto.slice(0, 40)}") não achado em ordem`).toBeGreaterThanOrEqual(0);
      cursor = achado + 1;
    }
  });

  it("um título por capítulo incluído, um por anexo, na ordem", () => {
    const titulos = linhas.filter((l) => l.startsWith("## "));
    expect(titulos).toHaveLength(montado.capitulos.length + montado.anexos.length);
    expect(titulos.at(-1)).toMatch(/^## ANEXO II — /);
  });
});
