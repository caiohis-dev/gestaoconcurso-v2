/**
 * Ações afirmativas — e o defeito real que decidiu o desenho.
 *
 * 🔴 **O Edital 003/2026 publicado é internamente incoerente:** o cronograma marca a
 * prova em 20/09/2026, e o item 10.10 chama 16/09/2026 de "data de realização da prova",
 * derivando dali um corte em 16 de março. 16/09 é a data do comprovante de local de
 * prova.
 *
 * Com a prova em 20/09, o corte correto é **20 de março**. Uma candidata cujo bebê nasceu
 * em 18/03 seria recusada por engano.
 *
 * Por isso a data de corte **não é campo**: é derivada da etapa `prova_objetiva` do
 * cronograma. Os casos abaixo guardam essa derivação.
 */
import { describe, it, expect } from "vitest";
import {
  subtrairMeses,
  dataLimiteNascimentoLactente,
  conferirAcoesAfirmativas,
} from "@/lib/edital-acoes-afirmativas";

describe("🔴 o caso do Edital 003/2026", () => {
  it("o corte CORRETO é 20 de março, não o 16 de março publicado", () => {
    // Prova em 20/09/2026, limite de 6 meses.
    expect(dataLimiteNascimentoLactente("2026-09-20", 6)).toBe("2026-03-20");
  });

  it("e 16 de março é o que sai se alguém usar a data ERRADA da prova", () => {
    // 16/09 é o comprovante de local de prova. Derivar dali reproduz o defeito publicado
    // — e é exatamente por isso que a data não pode ser digitada à mão.
    expect(dataLimiteNascimentoLactente("2026-09-16", 6)).toBe("2026-03-16");
  });

  it("mudar a data da prova move o corte SOZINHO — é o ponto do desenho", () => {
    expect(dataLimiteNascimentoLactente("2026-09-20", 6)).toBe("2026-03-20");
    expect(dataLimiteNascimentoLactente("2026-10-04", 6)).toBe("2026-04-04");
  });
});

describe("subtrairMeses", () => {
  it("atravessa a virada de ano", () => {
    expect(subtrairMeses("2026-02-10", 6)).toBe("2025-08-10");
    expect(subtrairMeses("2026-01-31", 1)).toBe("2025-12-31");
  });

  it("⚠️ dia que não existe no mês de destino cai no ÚLTIMO dia — não estende o prazo", () => {
    // 31 de março menos 1 mês: 28/02, não 03/03. A convenção que não dá dia a mais.
    expect(subtrairMeses("2026-03-31", 1)).toBe("2026-02-28");
    expect(subtrairMeses("2024-03-31", 1)).toBe("2024-02-29"); // bissexto
  });

  it("🔴 não usa `new Date` sobre a string — o bug de fuso do Brasil", () => {
    // `new Date("2026-09-20")` é UTC: em fuso negativo, o dia volta um.
    expect(subtrairMeses("2026-09-20", 0)).toBe("2026-09-20");
    expect(subtrairMeses("2026-01-01", 0)).toBe("2026-01-01");
  });

  it("devolve null quando falta insumo, em vez de inventar data", () => {
    expect(dataLimiteNascimentoLactente(null, 6)).toBeNull();
    expect(dataLimiteNascimentoLactente("2026-09-20", null)).toBeNull();
    expect(dataLimiteNascimentoLactente("2026-09-20", 0)).toBeNull();
  });
});

describe("conferirAcoesAfirmativas", () => {
  it("🎯 regra de lactante SEM data da prova no cronograma é ERRO", () => {
    const avisos = conferirAcoesAfirmativas({
      dataDaProva: null,
      lactantes: { idadeMaximaMeses: 6, permiteCompensacao: true, tempoMaximoMinutos: 30 },
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe("erro");
    expect(avisos[0].mensagem).toContain("16 de setembro");
  });

  it("⭐ CONTROLE: com a data da prova, não acusa", () => {
    expect(
      conferirAcoesAfirmativas({
        dataDaProva: "2026-09-20",
        lactantes: { idadeMaximaMeses: 6, permiteCompensacao: true, tempoMaximoMinutos: 30 },
      }),
    ).toEqual([]);
  });

  it("o preset recomendado é AVISO, não erro — o Edital 002 é válido", () => {
    // Sem compensação é a regra do 002. Barrar impediria reproduzir um edital legal.
    const avisos = conferirAcoesAfirmativas({
      dataDaProva: "2026-09-20",
      lactantes: { idadeMaximaMeses: 6, permiteCompensacao: false, tempoMaximoMinutos: null },
    });
    expect(avisos.map((a) => [a.regra, a.severidade])).toEqual([
      ["lactante-sem-compensacao", "aviso"],
    ]);
  });

  it("laudo de prazo fixo avisa, citando as Leis RJ", () => {
    const avisos = conferirAcoesAfirmativas({
      dataDaProva: "2026-09-20",
      pcd: { percentualReserva: 10, aceitaLaudoIndeterminado: false, validadeMesesLaudoTemporario: 6 },
    });
    expect(avisos.map((a) => a.regra)).toEqual(["laudo-sem-validade-indeterminada"]);
    expect(avisos[0].mensagem).toContain("9.425/2021");
  });

  it("⭐ CONTROLE NEGATIVO: parâmetro não preenchido não avisa nada", () => {
    // `null` é "ainda não decidido", e não se confunde com `false`, que é decisão.
    expect(
      conferirAcoesAfirmativas({
        dataDaProva: "2026-09-20",
        lactantes: { idadeMaximaMeses: null, permiteCompensacao: null, tempoMaximoMinutos: null },
        pcd: { percentualReserva: null, aceitaLaudoIndeterminado: null, validadeMesesLaudoTemporario: null },
      }),
    ).toEqual([]);
  });

  it("⭐ os três editais reais convivem no MESMO modelo", () => {
    // Se qualquer um deles exigisse caso especial, o modelo estaria estreito.
    const e002 = conferirAcoesAfirmativas({
      dataDaProva: "2026-09-20",
      lactantes: { idadeMaximaMeses: null, permiteCompensacao: false, tempoMaximoMinutos: null },
      pcd: { percentualReserva: 10, aceitaLaudoIndeterminado: false, validadeMesesLaudoTemporario: 6 },
    });
    const e004 = conferirAcoesAfirmativas({
      dataDaProva: "2026-09-20",
      lactantes: { idadeMaximaMeses: 6, permiteCompensacao: true, tempoMaximoMinutos: 30 },
      pcd: { percentualReserva: 10, aceitaLaudoIndeterminado: true, validadeMesesLaudoTemporario: 6 },
    });
    // O 002 acumula os dois avisos de preset; o 004 não acumula nenhum.
    expect(e002.map((a) => a.regra).sort()).toEqual([
      "lactante-sem-compensacao",
      "laudo-sem-validade-indeterminada",
    ]);
    expect(e004).toEqual([]);
  });
});
