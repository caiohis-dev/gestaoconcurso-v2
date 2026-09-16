/**
 * A numeração dos ARTIGOS dentro do capítulo.
 *
 * 🔴 **É a granularidade que importa de verdade**, e foi medida: nos três editais reais
 * há 95 referências cruzadas, e **nenhuma aponta para capítulo** — todas apontam para
 * item. O resíduo "10. e seus subitens" do Edital 002, que originou o módulo, é uma
 * referência de item.
 *
 * 🔵 Desde 16/09 o artigo é registro em `edital_itens`, e não mais uma linha dentro do
 * texto do capítulo. Estes testes passam pelo CAMINHO REAL — colagem → registros →
 * `numerarItens` — de propósito: numerar direto a saída do parser testaria um atalho que
 * a aplicação não usa.
 */
import { describe, it, expect } from "vitest";
import {
  parsearCapitulo,
  numerarItens,
  ordenarItens,
  agruparPorCapitulo,
  ancorasDoDocumento,
  mapaDeAncoras,
  resolverReferenciasDeItem,
  type ItemBruto,
} from "@/lib/edital-itens";

/** Colagem → registros, como a tela faz ao importar um capítulo inteiro. */
const daColagem = (texto: string, capitulo = "vagas_pcd"): ItemBruto[] =>
  parsearCapitulo(texto).map((l, i) => ({
    id: `i${i}`,
    capitulo_chave: capitulo,
    ordem: i,
    nivel: l.nivel,
    tipo: l.tipo,
    texto: l.texto,
    ancora: l.ancora,
    quadro_fonte: null,
  }));

const numeros = (texto: string, cap: number | null = 7) =>
  numerarItens(daColagem(texto), cap)
    .filter((l) => l.tipo === "item")
    .map((l) => l.numero);

describe("numeração de artigos", () => {
  it("numera item como <capítulo>.<n>", () => {
    expect(numeros("- primeiro\n- segundo\n- terceiro")).toEqual(["7.1", "7.2", "7.3"]);
  });

  it("numera subitem como <capítulo>.<n>.<m>", () => {
    expect(numeros("- a\n  - a1\n  - a2\n- b")).toEqual(["7.1", "7.1.1", "7.1.2", "7.2"]);
  });

  it("alínea é LETRA, como nos editais reais ('item 15.8, alínea L')", () => {
    expect(numeros("- a\n  - a1\n    - x\n    - y")).toEqual(["7.1", "7.1.1", "a", "b"]);
  });

  it("🔴 inserir artigo no meio RENUMERA todos abaixo — é o ponto inteiro", () => {
    const antes = numeros("- um\n- dois\n- tres");
    const depois = numeros("- um\n- NOVO\n- dois\n- tres");
    expect(antes).toEqual(["7.1", "7.2", "7.3"]);
    expect(depois).toEqual(["7.1", "7.2", "7.3", "7.4"]);
    // E o artigo que era 7.2 virou 7.3 sem ninguém digitar nada.
    const itens = numerarItens(daColagem("- um\n- NOVO\n- dois\n- tres"), 7);
    expect(itens.find((t) => t.texto === "dois")!.numero).toBe("7.3");
  });

  it("o número do capítulo entra no do artigo — o MESMO texto em outro capítulo renumera", () => {
    expect(numeros("- x", 7)).toEqual(["7.1"]);
    expect(numeros("- x", 8)).toEqual(["8.1"]);
  });

  it("descer de nível reinicia o contador de baixo", () => {
    // 7.1.1, 7.1.2, depois 7.2.1 — e não 7.2.3.
    expect(numeros("- a\n  - a1\n  - a2\n- b\n  - b1")).toEqual(["7.1", "7.1.1", "7.1.2", "7.2", "7.2.1"]);
  });

  it("capítulo sem número (preâmbulo, anexos) deixa o artigo sem número", () => {
    expect(numeros("- x\n- y", null)).toEqual(["", ""]);
  });

  it("prosa não consome número, e os itens à volta seguem em sequência", () => {
    // Medido no Edital 002: entre 6.6 e 6.7 há um parágrafo sem número ("O envelope
    // deverá ser entregue na Fundação…"). Se a prosa consumisse número, 6.7 viraria 6.8.
    const itens = numerarItens(daColagem("- a\nParágrafo solto.\n- b"), 6);
    expect(itens.map((l) => [l.tipo, l.numero])).toEqual([
      ["item", "6.1"],
      ["prosa", ""],
      ["item", "6.2"],
    ]);
  });

  it("🔴 o QUADRO é numerado como artigo — no Edital 002 o Quadro I é o item 2.1", () => {
    const itens = numerarItens(
      [
        { tipo: "item", nivel: 0, texto: "O QUADRO I contém as informações." },
        { tipo: "quadro", nivel: 0, texto: "QUADRO I: DOS CARGOS…" },
        { tipo: "item", nivel: 0, texto: "A remuneração prevista…" },
      ],
      2,
    );
    expect(itens.map((l) => l.numero)).toEqual(["2.1", "2.2", "2.3"]);
  });

  it("nível negativo ou acima de 2 é dobrado para dentro da faixa, não quebra", () => {
    const itens = numerarItens([{ tipo: "item", nivel: -1 }, { tipo: "item", nivel: 9 }], 7);
    expect(itens.map((l) => l.numero)).toEqual(["7.1", "a"]);
  });
});

describe("ordenação dos artigos", () => {
  const item = (id: string, ordem: number, created_at?: string): ItemBruto => ({
    id,
    capitulo_chave: "c",
    ordem,
    nivel: 0,
    tipo: "item",
    texto: id,
    ancora: null,
    quadro_fonte: null,
    created_at,
  });

  it("ordena por `ordem`", () => {
    expect(ordenarItens([item("b", 2), item("a", 0), item("c", 1)]).map((i) => i.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("🔴 ordem REPETIDA desempata por created_at — não há UNIQUE no banco", () => {
    // Sem desempate estável, dois artigos com a mesma ordem trocariam de lugar entre
    // consultas e a numeração pularia sozinha na cara do usuário.
    const fora = [item("b", 5, "2026-09-16T10:00:01Z"), item("a", 5, "2026-09-16T10:00:00Z")];
    expect(ordenarItens(fora).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("sem created_at, o desempate final é o id — estável, ainda que arbitrário", () => {
    expect(ordenarItens([item("b", 5), item("a", 5)]).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("agrupar por capítulo entrega cada grupo já ordenado", () => {
    const itens = [
      { ...item("x2", 1), capitulo_chave: "cap_x" },
      { ...item("y1", 0), capitulo_chave: "cap_y" },
      { ...item("x1", 0), capitulo_chave: "cap_x" },
    ];
    const m = agruparPorCapitulo(itens);
    expect(m.get("cap_x")!.map((i) => i.id)).toEqual(["x1", "x2"]);
    expect(m.get("cap_y")!.map((i) => i.id)).toEqual(["y1"]);
  });
});

describe("âncoras e referência a artigo", () => {
  const CAPS = [
    {
      chave: "vagas_pcd",
      numero: 7,
      incluido: true,
      itens: daColagem("- um\n- {#laudo} do laudo médico\n- tres"),
    },
    {
      chave: "prova_objetiva",
      numero: 11,
      incluido: true,
      itens: daColagem("- ver {{item:laudo}}", "prova_objetiva"),
    },
  ];

  it("a âncora resolve para o número do artigo", () => {
    const mapa = mapaDeAncoras(ancorasDoDocumento(CAPS));
    expect(mapa.get("laudo")).toBe("7.2");
    expect(resolverReferenciasDeItem("nos termos do {{item:laudo}}", mapa)).toBe("nos termos do 7.2");
  });

  it("🔴 a MESMA referência acompanha quando um artigo é inserido antes", () => {
    // É o defeito do Edital 002 impossibilitado: o texto não muda, o número sim.
    const comInsercao = [
      { ...CAPS[0], itens: daColagem("- um\n- NOVO\n- {#laudo} do laudo médico") },
      CAPS[1],
    ];
    expect(mapaDeAncoras(ancorasDoDocumento(comInsercao)).get("laudo")).toBe("7.3");
  });

  it("🔴 referência que não resolve vira marcador VISÍVEL", () => {
    const mapa = mapaDeAncoras(ancorasDoDocumento(CAPS));
    expect(resolverReferenciasDeItem("ver {{item:inexistente}}", mapa)).toBe("ver [?item:inexistente]");
  });

  it("⭐ CONTROLE: âncora de capítulo DESLIGADO não entra no mapa", () => {
    const desligado = [{ ...CAPS[0], incluido: false }, CAPS[1]];
    expect(mapaDeAncoras(ancorasDoDocumento(desligado)).has("laudo")).toBe(false);
  });

  it("a âncora resolve mesmo com os registros fora de ordem", () => {
    // O banco não promete ordem de chegada; se `ancorasDoDocumento` confiasse nela, a
    // referência apontaria para o número errado de vez em quando.
    //
    // ⚠️ QUATRO artigos, com a âncora FORA DO CENTRO, e é o que faz o caso valer: na
    // primeira versão eu usei os três de CAPS[0], com a âncora no meio — invertida, ela
    // caía no mesmo 7.2 e o teste passava com ou sem a ordenação.
    const quatro = daColagem("- um\n- {#laudo} dois\n- tres\n- quatro");
    const baguncado = [{ ...CAPS[0], itens: [...quatro].reverse() }, CAPS[1]];
    expect(mapaDeAncoras(ancorasDoDocumento(baguncado)).get("laudo")).toBe("7.2");
  });
});

describe("importador de colagem", () => {
  it("lê o nível pela indentação e a âncora pelo {#}", () => {
    expect(parsearCapitulo("- a\n  - {#x} b")).toEqual([
      { tipo: "item", texto: "a", nivel: 0, ancora: null, linha: 0 },
      { tipo: "item", texto: "b", nivel: 1, ancora: "x", linha: 1 },
    ]);
  });

  it("linha que não é item vira prosa", () => {
    expect(parsearCapitulo("Parágrafo de abertura.\n- item").map((l) => l.tipo)).toEqual([
      "prosa",
      "item",
    ]);
  });

  it("linha em branco não vira nada", () => {
    expect(parsearCapitulo("- a\n\n\n- b")).toHaveLength(2);
  });

  it("⚠️ indentação ímpar é tolerada — 3 espaços contam como 1 nível", () => {
    // Perder um artigo porque quem cola deu um espaço a mais seria pior que o nível
    // errado, que a lista mostra na hora.
    expect(parsearCapitulo("- a\n   - a1").map((l) => l.nivel)).toEqual([0, 1]);
  });

  it("🔴 o parser NÃO numera — a numeração tem um dono só", () => {
    // Se voltar a numerar, passam a existir duas implementações da mesma regra.
    expect(parsearCapitulo("- a")[0]).not.toHaveProperty("numero");
  });
});

/**
 * ⭐ CONTROLE POSITIVO COM DADO REAL — o capítulo 6 do Edital 002/2026, publicado.
 *
 * 🔴 É o caso que prova que o modelo descreve a realidade, e não só a si mesmo. Ele
 * exercita os TRÊS tipos de linha de uma vez, porque o capítulo real os tem todos:
 *
 *   · 17 itens de primeiro nível (6.1 a 6.17);
 *   · alíneas em LETRA penduradas direto num item, sem subitem no meio — `A) B) C)` sob
 *     o 6.1 e `A) B) C) D)` sob o 6.6;
 *   · um parágrafo SEM NÚMERO entre as alíneas do 6.6 e o item 6.7 ("O envelope deverá
 *     ser entregue na Fundação Educacional de Volta Redonda…").
 *
 * ⚠️ Foi este capítulo que derrubou a primeira versão da regra `nivel-fora-de-sequencia`
 * do linter: ela acusaria a alínea direto sob o item, que é a forma NORMAL nos editais.
 */
describe("⭐ CONTROLE POSITIVO: capítulo 6 do Edital 002/2026 (Da Isenção da Taxa)", () => {
  const CAPITULO_6 = [
    "- O candidato poderá requerer a Isenção da Taxa de Inscrição, desde que atenda a um dos requisitos:",
    "    - Estar inscrito no CadÚnico e for membro de família de baixa renda;",
    "    - Nos termos da Lei Municipal 5.989/2022, seja doador regular de sangue;",
    "    - Nos termos da Lei Municipal nº 6.359/2024, tenha prestado serviço eleitoral.",
    "- O candidato interessado em obter isenção deverá imprimir o Formulário do Requerimento.",
    "- Preenchido o Formulário, o candidato deverá anexar a ele a folha resumo do CadÚnico.",
    "- O candidato interessado em usar o requisito da letra B deverá imprimir o formulário próprio.",
    "- O candidato interessado em usar o requisito da letra C deverá imprimir o formulário próprio.",
    "- {#entrega_envelope} O Formulário de Isenção deverá ser entregue em envelope lacrado, contendo na parte de fora:",
    "    - Concurso Público para a Secretaria Municipal de Educação;",
    "    - Referência: ISENÇÃO DE TAXA;",
    "    - Nome completo;",
    "    - Cargo para o qual o candidato está concorrendo;",
    "O envelope deverá ser entregue na Fundação Educacional de Volta Redonda – FEVRE.",
    "- O limite de entrega, conforme {{item:entrega_envelope}}, é de dois envelopes no total.",
    "- O candidato que desejar isenção deverá aguardar o resultado da análise.",
    "- Cada pedido de Isenção será analisado e julgado.",
    "- O resultado da análise será divulgado no endereço eletrônico.",
    "- Os candidatos com isenção concedida terão, ao lado do seu nome, a expressão DEFERIDO.",
    "- A não apresentação de qualquer documento implicará o indeferimento.",
    "- O candidato que tiver o pedido indeferido deverá efetivar sua inscrição.",
    "- Comprovada fraude, o candidato será eliminado.",
    "- Não caberá recurso da decisão pelo indeferimento.",
    "- Não será aceita entrega condicional ou complementação de documentos.",
    "- Não serão aceitos documentos postados eletronicamente, via Correios ou via e-mail.",
  ].join("\n");

  const numerados = numerarItens(daColagem(CAPITULO_6, "isencao_taxa"), 6);

  it("os 17 itens de primeiro nível saem de 6.1 a 6.17, como no documento publicado", () => {
    expect(numerados.filter((l) => l.tipo === "item" && l.nivel === 0).map((l) => l.numero)).toEqual(
      Array.from({ length: 17 }, (_, i) => `6.${i + 1}`),
    );
  });

  it("🔴 as alíneas são LETRAS e reiniciam a cada item — A,B,C sob o 6.1 e A,B,C,D sob o 6.6", () => {
    // ⚠️ Indexado pelo NÚMERO do item, não pela posição na lista: na primeira versão eu
    // procurei o 6.6 em `porItem[8]` e ele está em [5] — a asserção falhava por
    // aritmética minha, não por defeito da numeração.
    const alineasDe = new Map<string, string[]>();
    let atual = "";
    for (const l of numerados) {
      if (l.nivel === 0 && l.tipo === "item") alineasDe.set((atual = l.numero), []);
      else if (l.nivel === 2) alineasDe.get(atual)!.push(l.numero);
    }
    expect(alineasDe.get("6.1")).toEqual(["a", "b", "c"]);
    expect(alineasDe.get("6.6")).toEqual(["a", "b", "c", "d"]);
    expect([...alineasDe.values()].filter((p) => p.length > 0)).toHaveLength(2);
  });

  it("🔴 o parágrafo do envelope NÃO consome número — 6.7 continua sendo 6.7", () => {
    // Se a prosa consumisse número, todo o resto do capítulo andaria um, e as 32
    // referências cruzadas do Edital 002 passariam a apontar para o artigo errado.
    const prosa = numerados.filter((l) => l.tipo === "prosa");
    expect(prosa).toHaveLength(1);
    expect(prosa[0].texto).toContain("Fundação Educacional de Volta Redonda");
    expect(numerados.find((l) => l.texto?.startsWith("O limite de entrega"))!.numero).toBe("6.7");
  });

  it("🔴 a referência cruzada do 6.7 ao 6.6 resolve sozinha, sem número digitado", () => {
    // No documento publicado está escrito à mão: "conforme subitem6.6.". É o tipo de
    // referência que envelhece — o resíduo "10. e seus subitens" do capítulo 7 do MESMO
    // edital é exatamente isso, já quebrado.
    const mapa = mapaDeAncoras(
      ancorasDoDocumento([
        { chave: "isencao_taxa", numero: 6, incluido: true, itens: daColagem(CAPITULO_6, "isencao_taxa") },
      ]),
    );
    expect(mapa.get("entrega_envelope")).toBe("6.6");
    expect(
      resolverReferenciasDeItem("conforme {{item:entrega_envelope}}", mapa),
    ).toBe("conforme 6.6");
  });

  it("🔴 inserir um item no começo empurra TUDO — e a referência acompanha", () => {
    const comNovo = "- Artigo novo inserido no topo.\n" + CAPITULO_6;
    const itens = daColagem(comNovo, "isencao_taxa");
    const renumerados = numerarItens(itens, 6);
    expect(renumerados.find((l) => l.texto?.startsWith("O limite de entrega"))!.numero).toBe("6.8");

    const mapa = mapaDeAncoras(
      ancorasDoDocumento([{ chave: "isencao_taxa", numero: 6, incluido: true, itens }]),
    );
    expect(mapa.get("entrega_envelope")).toBe("6.7");
  });
});
