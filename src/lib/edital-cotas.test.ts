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

describe("🔴 o percentual DECLARADO manda no cálculo", () => {
  // Até 2026-09-16 `sugerirCotas` usava 10%/20% fixos e ignorava o `percentual_reserva`
  // dos capítulos [8] e [9]. O usuário podia declarar 15% no texto e o Quadro I continuava
  // com números de 10% — o edital diria uma coisa na prosa e outra na tabela.

  it("sem declaração, cai no padrão de 10% e 20%", () => {
    expect(sugerirCotas(200)).toMatchObject({ pcd: 20, negros: 40 });
    expect(sugerirCotas(200, {})).toMatchObject({ pcd: 20, negros: 40 });
    expect(sugerirCotas(200, { pcd: null, negros: null })).toMatchObject({ pcd: 20, negros: 40 });
  });

  it("com declaração, ela vence o padrão", () => {
    expect(sugerirCotas(200, { pcd: 15, negros: 25 })).toMatchObject({
      pcd: 30, negros: 50, amplaConcorrencia: 120,
    });
  });

  it("⚠️ percentual ZERO é declaração legítima, e não vira o padrão", () => {
    // O `||` engoliria o 0 e devolveria 10%. Um edital pode declarar que não reserva.
    expect(sugerirCotas(200, { pcd: 0, negros: 0 })).toMatchObject({
      pcd: 0, negros: 0, amplaConcorrencia: 200,
    });
  });

  it("a conferência também usa o declarado — senão o painel mente sobre a própria regra", () => {
    // 200 vagas com 15% declarado: o mínimo é 30. Ter 20 (que seria certo a 10%) acusa.
    const cotas = { total: 200, amplaConcorrencia: 140, pcd: 20, negros: 40 };
    expect(conferirCotas(cotas)).toEqual([]); // sem declaração: 10% → 20 está certo
    const avisos = conferirCotas(cotas, { pcd: 15, negros: 20 });
    expect(avisos.map((a) => a.tipo)).toEqual(["abaixo-do-minimo"]);
    expect(avisos[0]).toMatchObject({ reserva: "pcd", sugerido: 30 });
  });

  it("⭐ CONTROLE: os 22 valores reais continuam batendo com o declarado de 10/20", () => {
    // Declarar explicitamente o que antes era constante não pode mudar nenhum resultado.
    for (const [, ac, pd, cn] of REAIS) {
      const total = ac + pd + cn;
      expect(sugerirCotas(total, { pcd: 10, negros: 20 })).toEqual(sugerirCotas(total));
    }
  });
});

/**
 * ⭐ CONTROLE POSITIVO NOVO — o QUADRO II do Edital 004/2026, 39 unidades.
 *
 * 🔴 **Ele corrigiu a regra, e é o melhor exemplo do que "medir muda o desenho" quer
 * dizer neste repo.** A regra original saiu de 22 valores dos Editais 002 e 003, e ela
 * estava certa para os 22 — mas **nenhum daqueles cargos tem 3 vagas**, então aqueles
 * dados não podiam decidir esse caso. O Quadro II do 004 distribui as 80 vagas de ACS por
 * 39 UBSF e traz 5 totais distintos, inclusive o 3.
 *
 * Resultado da conferência, unidade a unidade:
 *
 * | total | unidades | publicado (AC,PD,CN) | arredondamento comum |
 * |---|---|---|---|
 * | 1 | 20 | (1,0,0) | ✅ igual |
 * | 2 | 7 | (2,0,0) | ✅ igual |
 * | **3** | **4** | **(3,0,0)** | 🔴 dava (2,0,1) |
 * | 4 | 7 | (3,0,1) | ✅ igual |
 * | 6 | 1 | (4,1,1) | ✅ igual |
 *
 * As 4 unidades de 3 vagas concordam **entre si**, então é regra e não erro de digitação
 * do edital. Daí `MINIMO_DE_VAGAS_PARA_COTA_RACIAL`.
 */
describe("⭐ o Quadro II do Edital 004 — 39 unidades, e o caso que faltava", () => {
  const QUADRO_II: ReadonlyArray<[total: number, unidades: number, ac: number, pd: number, cn: number]> = [
    [1, 20, 1, 0, 0],
    [2, 7, 2, 0, 0],
    [3, 4, 3, 0, 0],
    [4, 7, 3, 0, 1],
    [6, 1, 4, 1, 1],
  ];

  it("🎯 os 5 totais distintos saem exatos, e cobrem as 39 unidades", () => {
    expect(QUADRO_II.reduce((n, [, u]) => n + u, 0)).toBe(39);
    for (const [total, , ac, pd, cn] of QUADRO_II) {
      expect(sugerirCotas(total)).toEqual({ total, amplaConcorrencia: ac, pcd: pd, negros: cn });
    }
  });

  it("🔴 e a soma das 80 vagas de ACS bate com o publicado", () => {
    const soma = QUADRO_II.reduce(
      (s, [total, u]) => {
        const c = sugerirCotas(total);
        return { ac: s.ac + c.amplaConcorrencia * u, pd: s.pd + c.pcd * u, cn: s.cn + c.negros * u };
      },
      { ac: 0, pd: 0, cn: 0 },
    );
    expect(soma).toEqual({ ac: 71, pd: 1, cn: 8 });
  });

  it("🔴 CONTROLE NEGATIVO: a cota NÃO é calculada sobre o total do cargo", () => {
    // Se alguém "simplificar" aplicando os 20% às 80 vagas de ACS de uma vez, saem 16
    // vagas de cota racial onde o edital publica 8 — o dobro. A distribuição é POR
    // UNIDADE, e o arredondamento para baixo em 27 unidades pequenas é o que faz a
    // diferença. Este caso existe para que a simplificação não passe calada.
    expect(sugerirCotas(80).negros).toBe(16);
    expect(sugerirCotas(80).negros).not.toBe(8);
  });

  it("⭐ CONTROLE: o corte está entre 3 e 4, e não em outro lugar", () => {
    expect(sugerirCotas(3).negros).toBe(0);
    expect(sugerirCotas(4).negros).toBe(1);
    // ⚠️ E não mexeu no PCD: 10% de 3 já era 0 por arredondamento, não pelo corte.
    expect(sugerirCotas(3).pcd).toBe(0);
    expect(sugerirCotas(5).pcd).toBe(1);
  });

  it("⚠️ o corte NÃO se aplica a percentual DECLARADO alto", () => {
    // Fronteira registrada: com 3 vagas e 20% declarados, segue zero. É o mesmo corte —
    // ele é sobre o número de vagas, não sobre o percentual. Se um dia um edital declarar
    // reserva a partir de 3, é `MINIMO_DE_VAGAS_PARA_COTA_RACIAL` que muda, e este caso
    // cai junto para avisar.
    expect(sugerirCotas(3, { pcd: null, negros: 50 }).negros).toBe(0);
    expect(sugerirCotas(4, { pcd: null, negros: 50 }).negros).toBe(2);
  });
});
