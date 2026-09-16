import { describe, it, expect } from "vitest";
import { segmentarNegrito, semMarcadores } from "@/lib/edital-texto";

describe("negrito no texto do artigo", () => {
  it("texto sem marcador vira um segmento só", () => {
    expect(segmentarNegrito("O candidato deverá comparecer.")).toEqual([
      { texto: "O candidato deverá comparecer.", negrito: false },
    ]);
  });

  it("marca o trecho entre ** e mantém o que vem antes e depois", () => {
    expect(segmentarNegrito("Chegar com **1 hora** de antecedência.")).toEqual([
      { texto: "Chegar com ", negrito: false },
      { texto: "1 hora", negrito: true },
      { texto: " de antecedência.", negrito: false },
    ]);
  });

  it("aceita mais de um trecho em negrito na mesma linha", () => {
    expect(segmentarNegrito("**A** e **B**").filter((s) => s.negrito).map((s) => s.texto)).toEqual([
      "A",
      "B",
    ]);
  });

  it("negrito no começo não produz segmento vazio antes", () => {
    expect(segmentarNegrito("**QUADRO I** — dos cargos")).toEqual([
      { texto: "QUADRO I", negrito: true },
      { texto: " — dos cargos", negrito: false },
    ]);
  });

  it("🔴 marcador sem fechar fica LITERAL — não some texto", () => {
    // Sumir com o que a pessoa digitou é o formato de defeito que este repo mais teme.
    expect(segmentarNegrito("prazo de **15 dias")).toEqual([
      { texto: "prazo de **15 dias", negrito: false },
    ]);
  });

  it("par vazio não vira negrito vazio", () => {
    expect(segmentarNegrito("a ** ** b").some((s) => s.negrito && s.texto.trim() === "")).toBe(true);
    expect(segmentarNegrito("a **** b")).toEqual([{ texto: "a **** b", negrito: false }]);
  });

  it("o marcador não atravessa quebra de linha", () => {
    expect(segmentarNegrito("**a\nb**").some((s) => s.negrito)).toBe(false);
  });

  it("semMarcadores devolve o texto limpo, na ordem", () => {
    expect(semMarcadores("Chegar com **1 hora** de antecedência.")).toBe(
      "Chegar com 1 hora de antecedência.",
    );
  });

  it("⭐ CONTROLE: nada de HTML sai daqui — o React escapa os segmentos", () => {
    // Se um dia isto devolver string com marcação, alguém vai injetar com
    // dangerouslySetInnerHTML e a sanitização passa a ser dívida.
    const segs = segmentarNegrito("<script>alert(1)</script> **x**");
    expect(segs[0].texto).toBe("<script>alert(1)</script> ");
    expect(segs.every((s) => typeof s.texto === "string")).toBe(true);
  });
});
