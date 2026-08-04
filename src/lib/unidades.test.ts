/**
 * O rótulo das unidades disponíveis no seletor de `/gerenciar-prova` (2026-08-03).
 *
 * Função pura, testada sem mock nenhum. O que ela guarda não é a formatação: é a
 * distinção entre **"ainda contando"** e **"não tem sala"**, que na tela é a diferença
 * entre um número transitório mentiroso e uma informação útil.
 */
import { describe, it, expect } from "vitest";
import { rotuloUnidadeDisponivel } from "./unidades";

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
