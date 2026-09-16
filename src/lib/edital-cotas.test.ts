/**
 * O cálculo das cotas do Quadro I.
 *
 * ⭐ **O controle positivo são os 22 valores REAIS dos Editais 002 e 003**, contados no
 * material de referência em 2026-09-16. A regra não foi estimada: foi inferida desses
 * números, e cada grupo deles descarta uma hipótese concorrente.
 *
 * ⚠️ Se algum dia uma norma exigir piso de uma vaga, é este arquivo que vai acusar — os
 * três casos de reserva ZERO são justamente os que mudariam.
 */
import { describe, it, expect } from "vitest";
import { sugerirCotas, conferirCotas } from "@/lib/edital-cotas";

/** cargo, AC, PD, CN — exatamente como publicados. */
const REAIS: ReadonlyArray<[string, number, number, number]> = [
  ["002 Arte", 1, 0, 0],
  ["002 Ciências", 1, 0, 0],
  ["002 Ed. Física", 5, 1, 2],
  ["002 Geografia", 3, 0, 1],
  ["002 História", 1, 0, 0],
  ["002 L. Inglesa", 10, 1, 3],
  ["002 L. Portuguesa", 7, 1, 2],
  ["002 Matemática", 12, 2, 3],
  ["002 Docente II", 3, 1, 1],
  ["003 Enfermeiro", 140, 20, 40],
  ["003 Téc. Enfermagem", 108, 16, 31],
];

describe("⭐ controle positivo — os 22 valores dos editais reais", () => {
  it.each(REAIS)("%s reproduz AC=%i PD=%i CN=%i", (_nome, ac, pd, cn) => {
    const total = ac + pd + cn;
    expect(sugerirCotas(total)).toEqual({
      total,
      amplaConcorrencia: ac,
      pcd: pd,
      negros: cn,
    });
  });
});

describe("as hipóteses que os dados DESCARTAM", () => {
  it("não é teto: 1 vaga reserva ZERO, e não 1", () => {
    // Edital 002, Arte. Com `ceil` daria 1 PCD e 1 CN num cargo de uma vaga só.
    expect(sugerirCotas(1)).toMatchObject({ pcd: 0, negros: 0, amplaConcorrencia: 1 });
  });

  it("não é piso: 8 vagas reservam 1 PCD, e não 0", () => {
    // Edital 002, Educação Física. 10% de 8 = 0,8.
    expect(sugerirCotas(8)).toMatchObject({ pcd: 1, negros: 2 });
  });

  it("🔴 é meio para CIMA, não meio para o par", () => {
    // Docente II: 10% de 5 = 0,5 → 1. `round half to even` daria 0.
    expect(sugerirCotas(5).pcd).toBe(1);
    // Téc. Enfermagem: 10% de 155 = 15,5 → 16. Meio-para-o-par daria 16 aqui também
    // (16 é par), então o caso do 5 é o que realmente separa as duas regras.
    expect(sugerirCotas(155).pcd).toBe(16);
  });

  it("🔴 a base é o TOTAL, não a ampla concorrência", () => {
    // Matemática: AC=12, total=17. 10% de 17 = 2 (publicado); de 12 daria 1.
    expect(sugerirCotas(17).pcd).toBe(2);
    // Téc. Enfermagem: AC=108, total=155. 10% de 155 = 16 (publicado); de 108 daria 11.
    expect(sugerirCotas(155).pcd).toBe(16);
  });

  it("a fronteira do arredondamento, nos dois sentidos", () => {
    expect(sugerirCotas(14).pcd).toBe(1); // 1,4 → 1
    expect(sugerirCotas(15).pcd).toBe(2); // 1,5 → 2
    expect(sugerirCotas(17).negros).toBe(3); // 3,4 → 3
    expect(sugerirCotas(18).negros).toBe(4); // 3,6 → 4
  });
});

describe("bordas", () => {
  it.each([0, -1, NaN])("total inválido (%s) devolve tudo zerado, sem quebrar", (t) => {
    expect(sugerirCotas(t)).toMatchObject({ amplaConcorrencia: 0, pcd: 0, negros: 0 });
  });

  it("a soma SEMPRE fecha com o total", () => {
    for (let t = 1; t <= 500; t++) {
      const c = sugerirCotas(t);
      expect(c.amplaConcorrencia + c.pcd + c.negros).toBe(t);
    }
  });

  it("a ampla concorrência nunca fica negativa", () => {
    for (let t = 1; t <= 500; t++) expect(sugerirCotas(t).amplaConcorrencia).toBeGreaterThanOrEqual(0);
  });
});

describe("conferirCotas — o que a tela avisa", () => {
  it("⭐ CONTROLE: a sugestão do sistema não gera aviso nenhum", () => {
    for (const [, ac, pd, cn] of REAIS) {
      const total = ac + pd + cn;
      expect(conferirCotas({ total, amplaConcorrencia: ac, pcd: pd, negros: cn })).toEqual([]);
    }
  });

  it("soma que não fecha é ERRO, e diz os dois números", () => {
    // ⚠️ A fixture ISOLA a regra de propósito: as reservas estão no mínimo (10 vagas →
    // 1 PCD, 2 CN), e só o AC está errado. A primeira versão deste caso usava CN=1, que
    // dispara TAMBÉM o aviso de mínimo — e aí o teste mediria as duas regras juntas.
    const avisos = conferirCotas({ total: 10, amplaConcorrencia: 8, pcd: 1, negros: 2 });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].tipo).toBe("soma-nao-fecha");
    expect(avisos[0].mensagem).toContain("somam 11");
    expect(avisos[0].mensagem).toContain("total declarado é 10");
  });

  it("as duas regras convivem quando as duas são violadas", () => {
    const avisos = conferirCotas({ total: 10, amplaConcorrencia: 7, pcd: 1, negros: 1 });
    expect(avisos.map((a) => a.tipo)).toEqual(["soma-nao-fecha", "abaixo-do-minimo"]);
  });

  it("reserva abaixo do mínimo é AVISO, e diz quanto seria", () => {
    // 20 vagas: sugerido PCD 2, CN 4. O usuário pôs 1 e 4.
    const avisos = conferirCotas({ total: 20, amplaConcorrencia: 15, pcd: 1, negros: 4 });
    expect(avisos.map((a) => a.tipo)).toEqual(["abaixo-do-minimo"]);
    expect(avisos[0]).toMatchObject({ reserva: "pcd", sugerido: 2 });
  });

  it("⭐ CONTROLE NEGATIVO: reserva ACIMA do mínimo não avisa", () => {
    // Reservar mais que a lei exige é legítimo, e o sistema não pode atrapalhar.
    expect(conferirCotas({ total: 20, amplaConcorrencia: 10, pcd: 4, negros: 6 })).toEqual([]);
  });
});
