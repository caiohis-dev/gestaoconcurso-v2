/**
 * O rótulo das unidades disponíveis no seletor de `/gerenciar-prova` (2026-08-03).
 *
 * Função pura, testada sem mock nenhum. O que ela guarda não é a formatação: é a
 * distinção entre **"ainda contando"** e **"não tem sala"**, que na tela é a diferença
 * entre um número transitório mentiroso e uma informação útil.
 */
import { describe, it, expect } from "vitest";
import { rotuloUnidadeDisponivel, textoVagasDaUnidade, resumoDeVagas } from "./unidades";

describe("rotuloUnidadeDisponivel", () => {
  it("mostra a capacidade no formato pedido", () => {
    // O caso é literal do banco: a unidade `UGB-II` soma 350 lugares em `sala_prova`.
    expect(rotuloUnidadeDisponivel("UGB-II", "UGB - Bloco II", 350)).toBe(
      "UGB-II - UGB - Bloco II (capacidade: 350)",
    );
  });

  it("tira o preenchimento do CHAR(10) da sigla", () => {
    // `unid_sigla` é CHAR(10) — o Postgres devolve "SA" com oito espaços atrás. Sem o
    // trim o rótulo sai "SA         - SEDE ADMINISTRATIVA".
    expect(rotuloUnidadeDisponivel("SA        ", "SEDE ADMINISTRATIVA", 120)).toBe(
      "SA - SEDE ADMINISTRATIVA (capacidade: 120)",
    );
  });

  it("🔴 enquanto conta, NÃO afirma número nenhum", () => {
    // `null` é o estado de carregamento. Um "(capacidade: 0)" aqui seria "vazio enquanto
    // carrega" — o padrão de defeito que mais se repetiu neste repo.
    expect(rotuloUnidadeDisponivel("ICT", "INSTITUTO DE CULTURA TÉCNICA", null)).toBe(
      "ICT - INSTITUTO DE CULTURA TÉCNICA",
    );
  });

  it("🔴 unidade sem sala cadastrada DIZ isso, em vez de exibir zero", () => {
    // Medido em 03/08: 7 das 11 unidades do banco estão neste estado. "(capacidade: 0)"
    // é verdade e não ajuda; a frase manda a pessoa para o lugar certo.
    expect(rotuloUnidadeDisponivel("CIEP 295", "PROFª GLÓRIA ROUSSIM G. PINTO", 0)).toBe(
      "CIEP 295 - PROFª GLÓRIA ROUSSIM G. PINTO (sem salas cadastradas)",
    );
  });

  it("⭐ CONTROLE POSITIVO: zero e 'ainda contando' produzem textos DIFERENTES", () => {
    // O par que impede a simplificação óbvia (`capacidade || null`, `!capacidade`), que
    // fundiria os dois estados num só e devolveria o defeito.
    expect(rotuloUnidadeDisponivel("X", "Unidade", 0)).not.toBe(
      rotuloUnidadeDisponivel("X", "Unidade", null),
    );
  });

  it("capacidade negativa cai no mesmo texto do zero", () => {
    // Não existe no banco (`chk_sala_capacidade_positiva`), mas soma negativa nunca deve
    // virar "(capacidade: -30)" na tela.
    expect(rotuloUnidadeDisponivel("X", "Unidade", -30)).toBe(
      "X - Unidade (sem salas cadastradas)",
    );
  });
});

describe("textoVagasDaUnidade", () => {
  it("mostra o número com separador de milhar", () => {
    expect(textoVagasDaUnidade(1260)).toBe("1.260");
  });

  it("⭐ CONTROLE POSITIVO: 'ainda contando' e 'sem salas' são textos DIFERENTES", () => {
    // O mesmo par que `rotuloUnidadeDisponivel` guarda, agora na tabela: com o mapa vazio
    // (carregando OU consulta falhada) a célula não pode dizer 0 — seria afirmar que a
    // unidade está vazia quando não deu para perguntar. Medido em 03/08, 7 das 11
    // unidades não têm sala nenhuma: o zero é o caso comum, não a borda.
    expect(textoVagasDaUnidade(null)).toBe("—");
    expect(textoVagasDaUnidade(0)).toBe("sem salas cadastradas");
    expect(textoVagasDaUnidade(null)).not.toBe(textoVagasDaUnidade(0));
  });

  it("capacidade negativa cai no texto do zero, nunca em '-30'", () => {
    expect(textoVagasDaUnidade(-30)).toBe("sem salas cadastradas");
  });
});

describe("resumoDeVagas", () => {
  const CAPACIDADES = { "u-1": 350, "u-2": 480, "u-3": 0 };

  it("soma as vagas e conta quantas unidades têm sala cadastrada", () => {
    expect(resumoDeVagas(["u-1", "u-2", "u-3"], CAPACIDADES)).toEqual({
      total: 830,
      comSalas: 2,
      unidades: 3,
    });
  });

  it("unidade ausente do mapa conta como zero, não quebra a soma", () => {
    // É o caso real: uma unidade sem nenhuma linha em `sala_prova` nem aparece no mapa.
    expect(resumoDeVagas(["u-1", "u-nova"], CAPACIDADES)).toEqual({
      total: 350,
      comSalas: 1,
      unidades: 2,
    });
  });

  it("🔴 soma só as unidades EXIBIDAS, ignorando o resto do mapa", () => {
    // O totalizador do topo tem de bater com a coluna abaixo dele. Somar o mapa inteiro
    // daria o mesmo número hoje e passaria a divergir no dia em que a lista ganhar
    // filtro — é o defeito do "limpar edital" (contador filtrado, ação total).
    expect(resumoDeVagas(["u-1"], CAPACIDADES).total).toBe(350);
  });

  it("lista vazia devolve zeros — e é um zero legítimo", () => {
    expect(resumoDeVagas([], CAPACIDADES)).toEqual({ total: 0, comSalas: 0, unidades: 0 });
  });
});
