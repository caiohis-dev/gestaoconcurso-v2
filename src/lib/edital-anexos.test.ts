/**
 * Numeração de anexo e de quadro — o mesmo defeito da numeração de capítulo, um nível
 * abaixo. Os controles positivos são os editais reais: o conteúdo programático é Anexo I
 * no 002/003 e Anexo II no 004, porque lá a abrangência entra antes.
 */
import { describe, expect, it } from "vitest";
import { montarDocumento } from "@/lib/edital-numeracao";
import type { ItemBruto } from "@/lib/edital-itens";
import {
  anexosDoDocumento,
  mapaDeQuadros,
  quadrosDoDocumento,
  resolverReferenciasDeAnexo,
  romano,
} from "@/lib/edital-anexos";

const quadro = (id: string, capitulo_chave: string, ordem: number, ancora: string | null = null): ItemBruto => ({
  id, capitulo_chave, ordem, nivel: 0, tipo: "quadro", texto: "legenda", ancora, quadro_fonte: "cargos",
});
const item = (id: string, capitulo_chave: string, ordem: number): ItemBruto => ({
  id, capitulo_chave, ordem, nivel: 0, tipo: "item", texto: "t", ancora: null, quadro_fonte: null,
});

describe("romano", () => {
  it.each([[1, "I"], [2, "II"], [3, "III"], [4, "IV"], [5, "V"], [9, "IX"], [14, "XIV"], [40, "XL"]])(
    "%i → %s",
    (n, r) => expect(romano(n)).toBe(r),
  );
});

describe("anexosDoDocumento", () => {
  it("edital SEM territorialidade (002, 003): o conteúdo programático é o Anexo I", () => {
    expect(anexosDoDocumento(montarDocumento()).map((a) => [a.numero, a.chave])).toEqual([
      ["I", "conteudo_programatico"],
    ]);
  });

  it("🔴 edital COM territorialidade (004): a abrangência é o I e empurra o conteúdo para o II", () => {
    const doc = montarDocumento([{ chave: "distribuicao_geografica", incluido: true }]);
    expect(anexosDoDocumento(doc).map((a) => [a.numero, a.chave])).toEqual([
      ["I", "abrangencia"],
      ["II", "conteudo_programatico"],
    ]);
  });

  it("desligar o capítulo de ANEXOS tira todos os anexos — não sobra Anexo I sem anúncio", () => {
    const doc = montarDocumento([
      { chave: "anexos", incluido: false },
      { chave: "distribuicao_geografica", incluido: true },
    ]);
    expect(anexosDoDocumento(doc)).toEqual([]);
  });

  it("anexo que não entra fica visível como [?anexo:…]", () => {
    const mapa = new Map(anexosDoDocumento(montarDocumento()).map((a) => [a.chave, a.numero]));
    expect(resolverReferenciasDeAnexo("Anexo {{anexo:abrangencia}} e {{anexo:conteudo_programatico}}", mapa)).toBe(
      "Anexo [?anexo:abrangencia] e I",
    );
  });
});

describe("quadrosDoDocumento", () => {
  it("numera pela ordem do DOCUMENTO, atravessando capítulos — e não por capítulo", () => {
    const q = quadrosDoDocumento([
      { chave: "quadro_de_cargos", incluido: true, itens: [item("a", "quadro_de_cargos", 1), quadro("q1", "quadro_de_cargos", 2)] },
      { chave: "prova_objetiva", incluido: true, itens: [quadro("q2", "prova_objetiva", 1)] },
    ]);
    expect(q.map((x) => [x.itemId, x.numero])).toEqual([["q1", "I"], ["q2", "II"]]);
  });

  it("quadro de capítulo DESLIGADO não conta — a sequência não fica com buraco", () => {
    const q = quadrosDoDocumento([
      { chave: "quadro_de_cargos", incluido: true, itens: [quadro("q1", "quadro_de_cargos", 1)] },
      { chave: "distribuicao_geografica", incluido: false, itens: [quadro("q2", "distribuicao_geografica", 1)] },
      { chave: "prova_objetiva", incluido: true, itens: [quadro("q3", "prova_objetiva", 1)] },
    ]);
    expect(q.map((x) => [x.itemId, x.numero])).toEqual([["q1", "I"], ["q3", "II"]]);
  });

  it("dentro do capítulo, pela `ordem` gravada, não pela ordem de chegada", () => {
    const q = quadrosDoDocumento([
      { chave: "anexos", incluido: true, itens: [quadro("tarde", "anexos", 5), quadro("cedo", "anexos", 1)] },
    ]);
    expect(q.map((x) => x.itemId)).toEqual(["cedo", "tarde"]);
  });

  it("só quadro com âncora é citável", () => {
    const m = mapaDeQuadros(
      quadrosDoDocumento([
        { chave: "quadro_de_cargos", incluido: true, itens: [quadro("q1", "quadro_de_cargos", 1), quadro("q2", "quadro_de_cargos", 2, "vagas")] },
      ]),
    );
    expect([...m]).toEqual([["vagas", "II"]]);
  });
});
