import { describe, it, expect } from "vitest";
import { resumoAlocacao } from "@/lib/alocacao";

/**
 * Função pura, então `.test.ts` — sem render, sem provider.
 *
 * O que estes casos guardam é a MUDANÇA DE FONTE de 2026-08-02: o total de candidatos
 * do painel passou a ser a contagem real de inscritos, não mais o número digitado na
 * prova. Os dois defeitos que isso poderia introduzir — mostrar zero enquanto carrega e
 * mostrar zero quando a lista nem foi importada — têm caso próprio abaixo, com controle
 * positivo (a conta continua saindo quando há lista).
 */
describe("resumoAlocacao", () => {
  const base = { editalId: "edital-1", inscritos: 7231, alocados: 5000, carregando: false };

  it("faz a conta com a contagem REAL de inscritos", () => {
    expect(resumoAlocacao(base)).toEqual({
      estado: "ok",
      inscritos: 7231,
      alocados: 5000,
      naoAlocados: 2231,
    });
  });

  it("nunca afirma zero enquanto carrega — nem com inscritos ainda indefinidos", () => {
    expect(resumoAlocacao({ ...base, inscritos: undefined, carregando: true })).toEqual({
      estado: "carregando",
    });
    // Carregando vence até quando já há número: durante o carregamento não há afirmação.
    expect(resumoAlocacao({ ...base, carregando: true })).toEqual({ estado: "carregando" });
  });

  it("distingue 'lista não importada' de uma alocação coberta", () => {
    expect(resumoAlocacao({ ...base, inscritos: undefined })).toEqual({ estado: "sem-lista" });
    // Zero e ausência são a mesma coisa aqui: a importação é troca total, então edital sem
    // linha é edital sem lista. O que não pode é virar "0 inscritos, tudo alocado".
    expect(resumoAlocacao({ ...base, inscritos: 0 })).toEqual({ estado: "sem-lista" });
  });

  it("separa 'prova sem edital' de 'edital sem lista'", () => {
    // `provas.edital_id` é NULLABLE no banco; culpar a importação aqui mandaria o usuário
    // para a tela errada.
    expect(resumoAlocacao({ ...base, editalId: null })).toEqual({ estado: "sem-edital" });
    expect(resumoAlocacao({ ...base, editalId: undefined })).toEqual({ estado: "sem-edital" });
  });

  it("devolve naoAlocados NEGATIVO quando há mais lugares que inscritos", () => {
    // Sobra de lugar não é falta de lugar: quem pinta de vermelho é `> 0`, e este caso
    // existe para que ninguém "conserte" isso com um Math.max(0, ...).
    const r = resumoAlocacao({ ...base, inscritos: 200, alocados: 500 });
    expect(r).toEqual({ estado: "ok", inscritos: 200, alocados: 500, naoAlocados: -300 });
  });

  it("conta os inscritos mesmo sem nenhuma unidade alocada", () => {
    expect(resumoAlocacao({ ...base, alocados: 0 })).toEqual({
      estado: "ok",
      inscritos: 7231,
      alocados: 0,
      naoAlocados: 7231,
    });
  });
});
