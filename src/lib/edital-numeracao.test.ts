/**
 * A numeração dos capítulos do edital.
 *
 * 🔴 **Por que este arquivo existe.** O número de um capítulo depende de quais capítulos
 * condicionais entraram — capítulo que não entra não ocupa número, e todos abaixo sobem.
 * Numerar à mão é como o Edital 002/2026 publicado ficou com uma linha solta
 * "10. e seus subitens" dentro do capítulo 7: referência cruzada que envelheceu.
 *
 * ⭐ **O controle positivo são os TRÊS EDITAIS REAIS**, medidos em 2026-09-16. Eles dão
 * três numerações diferentes a partir do mesmo catálogo — é o que prova que o modelo
 * descreve a realidade, e não uma realidade inventada.
 */
import { describe, it, expect } from "vitest";
import { CAPITULOS_CATALOGO } from "@/lib/edital-capitulos";
import {
  montarDocumento,
  resolverReferencias,
  referenciasDoTexto,
  mapaDeNumeros,
  type CapituloOverride,
} from "@/lib/edital-numeracao";

/** Os três editais de referência, pelos DOIS capítulos condicionais que os distinguem. */
const EDITAL_002: CapituloOverride[] = [
  { chave: "distribuicao_geografica", incluido: false },
  { chave: "prova_de_titulos", incluido: true },
];
const EDITAL_003: CapituloOverride[] = [
  { chave: "distribuicao_geografica", incluido: false },
  { chave: "prova_de_titulos", incluido: false },
];
const EDITAL_004: CapituloOverride[] = [
  { chave: "distribuicao_geografica", incluido: true },
  { chave: "prova_de_titulos", incluido: false },
];

const numeroDe = (overrides: CapituloOverride[], chave: string) =>
  montarDocumento(overrides).find((c) => c.chave === chave)?.numero ?? null;

const totalNumerados = (overrides: CapituloOverride[]) =>
  montarDocumento(overrides).filter((c) => c.numero !== null).length;

describe("catálogo", () => {
  it("tem 19 elementos, dos quais 17 são capítulos numerados", () => {
    // Preâmbulo e anexos entram no documento e NÃO recebem número — são elementos pré e
    // pós-textuais. Confundir os dois é o que fazia a contagem dar 18.
    expect(CAPITULOS_CATALOGO).toHaveLength(19);
    expect(CAPITULOS_CATALOGO.filter((c) => c.numerado)).toHaveLength(17);
  });

  it("tem exatamente dois capítulos desligados por padrão", () => {
    const fora = CAPITULOS_CATALOGO.filter((c) => !c.padrao).map((c) => c.chave);
    expect(fora).toEqual(["distribuicao_geografica", "prova_de_titulos"]);
  });

  it("não tem chave repetida", () => {
    const chaves = CAPITULOS_CATALOGO.map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe("⭐ controle positivo — os três editais reais da FEVRE", () => {
  // Medido nos arquivos de my_rules/modulo_editais/ em 2026-09-16.
  it.each([
    ["Edital 002/2026 (Magistério)", EDITAL_002, 16, 7],
    ["Edital 003/2026 (Enfermagem)", EDITAL_003, 15, 7],
    ["Edital 004/2026 (ACS/ACE)", EDITAL_004, 16, 8],
  ])("%s tem %i capítulos e o PCD cai em %i", (_rotulo, overrides, total, pcd) => {
    expect(totalNumerados(overrides as CapituloOverride[])).toBe(total);
    expect(numeroDe(overrides as CapituloOverride[], "vagas_pcd")).toBe(pcd);
  });

  it("🔴 o MESMO capítulo cai em posições diferentes conforme o condicional acima dele", () => {
    // É o ponto inteiro do módulo, num assert só: territorialidade entra no 004 e empurra
    // o PCD de 7 para 8. Se este teste passar com numeração fixa, ela não está calculada.
    expect(numeroDe(EDITAL_003, "vagas_pcd")).toBe(7);
    expect(numeroDe(EDITAL_004, "vagas_pcd")).toBe(8);
  });

  it("um condicional ABAIXO não mexe em quem está acima", () => {
    // Títulos é o capítulo 14 do catálogo; ligar ou desligar não pode mover o PCD, que
    // vem antes. Guarda contra uma renumeração que recalcule tudo do jeito errado.
    expect(numeroDe(EDITAL_002, "vagas_pcd")).toBe(numeroDe(EDITAL_003, "vagas_pcd"));
    expect(numeroDe(EDITAL_002, "disposicoes_gerais")).toBe(16);
    expect(numeroDe(EDITAL_003, "disposicoes_gerais")).toBe(15);
  });
});

describe("montarDocumento", () => {
  it("sem override nenhum, usa o padrão do catálogo", () => {
    // 17 numerados menos os 2 condicionais.
    expect(totalNumerados([])).toBe(15);
    expect(numeroDe([], "distribuicao_geografica")).toBeNull();
  });

  it("preâmbulo e anexos entram no documento mas NÃO recebem número", () => {
    const doc = montarDocumento([]);
    const preambulo = doc.find((c) => c.chave === "preambulo")!;
    const anexos = doc.find((c) => c.chave === "anexos")!;
    expect(preambulo.incluido).toBe(true);
    expect(preambulo.numero).toBeNull();
    expect(anexos.numero).toBeNull();
    // E não consomem posição: o primeiro numerado é o 1, não o 2.
    expect(numeroDe([], "disposicoes_preliminares")).toBe(1);
  });

  it("capítulo excluído não recebe número", () => {
    expect(numeroDe([{ chave: "isencao_taxa", incluido: false }], "isencao_taxa")).toBeNull();
  });

  it("`incluido: false` vence o padrão `true` — e não é engolido por `||`", () => {
    // Armadilha real: `o?.incluido || cat.padrao` devolveria `true` aqui, porque `false`
    // é falsy. Tem de ser `??`.
    const doc = montarDocumento([{ chave: "disposicoes_gerais", incluido: false }]);
    expect(doc.find((c) => c.chave === "disposicoes_gerais")!.incluido).toBe(false);
  });

  it("`ordem: 0` também não é engolido — e o empate desempata pelo catálogo", () => {
    const doc = montarDocumento([{ chave: "disposicoes_gerais", ordem: 0 }]);
    // Ordem 0 EMPATA com o preâmbulo, que é o índice 0 do catálogo. O desempate pela
    // posição no catálogo mantém o preâmbulo na frente — sem ele, a ordem entre os dois
    // dependeria da ordem de chegada do banco, que muda entre consultas.
    expect(doc.slice(0, 3).map((c) => c.chave)).toEqual([
      "preambulo",
      "disposicoes_gerais",
      "disposicoes_preliminares",
    ]);
  });

  it("ordem própria reordena, e a numeração acompanha", () => {
    const doc = montarDocumento([{ chave: "disposicoes_gerais", ordem: 0 }]);
    // Ficou antes do preâmbulo (que não numera), então vira o capítulo 1.
    expect(doc.find((c) => c.chave === "disposicoes_gerais")!.numero).toBe(1);
    expect(doc.find((c) => c.chave === "disposicoes_preliminares")!.numero).toBe(2);
  });

  it("override de capítulo que não está no catálogo é ignorado, sem quebrar", () => {
    // Acontece de verdade: capítulo removido do catálogo deixa linha órfã no banco.
    expect(() => montarDocumento([{ chave: "capitulo_que_nao_existe", incluido: true }])).not.toThrow();
    expect(totalNumerados([{ chave: "capitulo_que_nao_existe", incluido: true }])).toBe(15);
  });
});

describe("referência cruzada", () => {
  it("resolve pela CHAVE, devolvendo o número daquele edital", () => {
    const texto = "na forma do capítulo {{cap:vagas_pcd}} deste Edital";
    expect(resolverReferencias(texto, montarDocumento(EDITAL_003))).toBe(
      "na forma do capítulo 7 deste Edital",
    );
    // O MESMO texto, noutro edital, resolve para outro número. Sem tocar no texto.
    expect(resolverReferencias(texto, montarDocumento(EDITAL_004))).toBe(
      "na forma do capítulo 8 deste Edital",
    );
  });

  it("resolve várias referências na mesma frase", () => {
    const texto = "ver {{cap:prova_objetiva}} e {{cap:disposicoes_gerais}}";
    expect(resolverReferencias(texto, montarDocumento(EDITAL_003))).toBe("ver 11 e 15");
  });

  it("🔴 referência que não resolve vira marcador VISÍVEL, não some nem inventa número", () => {
    const texto = "conforme {{cap:prova_de_titulos}}";
    // Títulos está desligado no 003.
    expect(resolverReferencias(texto, montarDocumento(EDITAL_003))).toBe(
      "conforme [?prova_de_titulos]",
    );
  });

  it("classifica o problema de cada referência", () => {
    const doc = montarDocumento(EDITAL_003);
    const refs = referenciasDoTexto(
      "{{cap:vagas_pcd}} {{cap:prova_de_titulos}} {{cap:nao_existe}}",
      doc,
    );
    expect(refs.map((r) => r.problema)).toEqual([null, "excluida", "desconhecida"]);
  });

  it("mapaDeNumeros só traz quem tem número", () => {
    const m = mapaDeNumeros(montarDocumento(EDITAL_003));
    expect(m.get("vagas_pcd")).toBe(7);
    expect(m.has("preambulo")).toBe(false);
    expect(m.has("prova_de_titulos")).toBe(false);
  });
});
