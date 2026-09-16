/**
 * A numeração dos ITENS dentro do capítulo.
 *
 * 🔴 **É a granularidade que importa de verdade**, e foi medida: nos três editais reais
 * há 95 referências cruzadas, e **nenhuma aponta para capítulo** — todas apontam para
 * item. O resíduo "10. e seus subitens" do Edital 002, que originou o módulo, é uma
 * referência de item.
 */
import { describe, it, expect } from "vitest";
import {
  parsearCapitulo,
  ancorasDoDocumento,
  mapaDeAncoras,
  resolverReferenciasDeItem,
} from "@/lib/edital-itens";

const numeros = (texto: string, cap: number | null = 7) =>
  parsearCapitulo(texto, cap).filter((l) => l.tipo === "item").map((l) => l.numero);

describe("numeração de itens", () => {
  it("numera item como <capítulo>.<n>", () => {
    expect(numeros("- primeiro\n- segundo\n- terceiro")).toEqual(["7.1", "7.2", "7.3"]);
  });

  it("numera subitem como <capítulo>.<n>.<m>", () => {
    expect(numeros("- a\n  - a1\n  - a2\n- b")).toEqual(["7.1", "7.1.1", "7.1.2", "7.2"]);
  });

  it("alínea é LETRA, como nos editais reais ('item 15.8, alínea L')", () => {
    expect(numeros("- a\n  - a1\n    - x\n    - y")).toEqual(["7.1", "7.1.1", "a", "b"]);
  });

  it("🔴 inserir item no meio RENUMERA todos abaixo — é o ponto inteiro", () => {
    const antes = numeros("- um\n- dois\n- tres");
    const depois = numeros("- um\n- NOVO\n- dois\n- tres");
    expect(antes).toEqual(["7.1", "7.2", "7.3"]);
    expect(depois).toEqual(["7.1", "7.2", "7.3", "7.4"]);
    // E o item que era 7.2 virou 7.3 sem ninguém digitar nada.
    const textos = parsearCapitulo("- um\n- NOVO\n- dois\n- tres", 7).filter((l) => l.tipo === "item");
    expect(textos.find((t) => t.texto === "dois")!.numero).toBe("7.3");
  });

  it("o número do capítulo entra no do item — o MESMO texto em outro capítulo renumera", () => {
    expect(numeros("- x", 7)).toEqual(["7.1"]);
    expect(numeros("- x", 8)).toEqual(["8.1"]);
  });

  it("descer de nível reinicia o contador de baixo", () => {
    // 7.1.1, 7.1.2, depois 7.2.1 — e não 7.2.3.
    expect(numeros("- a\n  - a1\n  - a2\n- b\n  - b1")).toEqual(["7.1", "7.1.1", "7.1.2", "7.2", "7.2.1"]);
  });

  it("capítulo sem número (preâmbulo, anexos) deixa o item sem número", () => {
    expect(numeros("- x\n- y", null)).toEqual(["", ""]);
  });

  it("linha que não é item vira prosa, e não consome número", () => {
    const linhas = parsearCapitulo("Parágrafo de abertura.\n- item", 7);
    expect(linhas.map((l) => l.tipo)).toEqual(["prosa", "item"]);
    expect(linhas[1].numero).toBe("7.1");
  });

  it("linha em branco não vira nada", () => {
    expect(parsearCapitulo("- a\n\n\n- b", 7)).toHaveLength(2);
  });

  it("⚠️ indentação ímpar é tolerada — 3 espaços contam como 1 nível", () => {
    // Perder um item porque quem redige deu um espaço a mais seria pior que o nível
    // errado, que o preview mostra na hora.
    expect(numeros("- a\n   - a1")).toEqual(["7.1", "7.1.1"]);
  });
});

describe("âncoras e referência a item", () => {
  const CAPS = [
    { chave: "vagas_pcd", numero: 7, incluido: true, texto: "- um\n- {#laudo} do laudo médico\n- tres" },
    { chave: "prova_objetiva", numero: 11, incluido: true, texto: "- ver {{item:laudo}}" },
  ];

  it("a âncora resolve para o número do item", () => {
    const mapa = mapaDeAncoras(ancorasDoDocumento(CAPS));
    expect(mapa.get("laudo")).toBe("7.2");
    expect(resolverReferenciasDeItem("nos termos do {{item:laudo}}", mapa)).toBe("nos termos do 7.2");
  });

  it("🔴 a MESMA referência acompanha quando um item é inserido antes", () => {
    // É o defeito do Edital 002 impossibilitado: o texto não muda, o número sim.
    const comInsercao = [{ ...CAPS[0], texto: "- um\n- NOVO\n- {#laudo} do laudo médico" }, CAPS[1]];
    const mapa = mapaDeAncoras(ancorasDoDocumento(comInsercao));
    expect(mapa.get("laudo")).toBe("7.3");
  });

  it("🔴 referência que não resolve vira marcador VISÍVEL", () => {
    const mapa = mapaDeAncoras(ancorasDoDocumento(CAPS));
    expect(resolverReferenciasDeItem("ver {{item:inexistente}}", mapa)).toBe("ver [?item:inexistente]");
  });

  it("⭐ CONTROLE: âncora de capítulo DESLIGADO não entra no mapa", () => {
    const desligado = [{ ...CAPS[0], incluido: false }, CAPS[1]];
    expect(mapaDeAncoras(ancorasDoDocumento(desligado)).has("laudo")).toBe(false);
  });

  it("âncora duplicada: a primeira vence, e o mapa não quebra", () => {
    const dup = [{ ...CAPS[0], texto: "- {#laudo} um\n- {#laudo} dois" }];
    expect(mapaDeAncoras(ancorasDoDocumento(dup)).get("laudo")).toBe("7.1");
  });
});
