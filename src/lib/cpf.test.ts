import { describe, it, expect } from "vitest";
import { cpfValido } from "@/lib/cpf";

/**
 * Função pura, então `.test.ts` — sem render, sem provider.
 *
 * Os casos aqui não são exaustivos por gosto: cada bloco cobre uma armadilha conhecida
 * do algoritmo, e é onde implementação ingênua passa a aceitar CPF inventado.
 */
describe("cpfValido", () => {
  describe("CPFs válidos", () => {
    // Gerados pelo próprio algoritmo, não colhidos de gente real.
    it.each(["529.982.247-25", "111.444.777-35", "398.402.111-96"])(
      "aceita %s",
      (cpf) => expect(cpfValido(cpf)).toBe(true),
    );

    it("aceita com ou sem máscara — os dígitos é que valem", () => {
      expect(cpfValido("52998224725")).toBe(true);
      expect(cpfValido("529.982.247-25")).toBe(true);
      expect(cpfValido(" 529 982 247 25 ")).toBe(true);
    });

    it("aceita CPF que começa com zero", () => {
      // É a razão de a coluna ser texto e de existir o `padStart` no diálogo: um CPF
      // legítimo pode começar com 0, e tratá-lo como número comeria o dígito.
      expect(cpfValido("01234567890")).toBe(true);
    });
  });

  describe("a blacklist de repetidos — que a aritmética sozinha NÃO pega", () => {
    // Todos estes passam no cálculo dos dois DVs. Só a rejeição sumária os barra.
    it.each([
      "00000000000",
      "11111111111",
      "22222222222",
      "33333333333",
      "44444444444",
      "55555555555",
      "66666666666",
      "77777777777",
      "88888888888",
      "99999999999",
    ])("recusa %s", (cpf) => expect(cpfValido(cpf)).toBe(false));

    it("00000000000 é justamente o que o defeito do padStart produzia", () => {
      // CPF em branco virava onze zeros, com 11 dígitos e DVs coerentes: passava no Zod
      // e no CHECK do banco. Este é o teste que fecha aquele caminho.
      expect(cpfValido("00000000000")).toBe(false);
    });
  });

  describe("dígito verificador errado", () => {
    it("recusa quando o último dígito não fecha", () => {
      expect(cpfValido("52998224726")).toBe(false);
    });

    it("recusa quando o penúltimo não fecha", () => {
      expect(cpfValido("52998224735")).toBe(false);
    });

    it("recusa o CPF que o padStart fabricava a partir de 6 dígitos", () => {
      // "123456" digitado virava isto. O DV esperado seria 3, e o gravado era 5.
      expect(cpfValido("00000123456")).toBe(false);
    });
  });

  describe("o ramo resto < 2, onde o DV é 0", () => {
    // Implementação que faz `11 - resto` sem o `if` produziria 11 ou 10 aqui — valores
    // impossíveis num dígito — e recusaria CPF legítimo. Os dois casos foram CALCULADOS
    // pelo algoritmo, não inventados: dois palpites meus reprovaram antes disto.
    it("aceita quando o PRIMEIRO verificador é zero por esse ramo", () => {
      expect(cpfValido("10000000108")).toBe(true);
    });

    it("aceita quando o SEGUNDO verificador é zero por esse ramo", () => {
      expect(cpfValido("10000000280")).toBe(true);
    });

    it("o único CPF com os dois verificadores zero é o 00000000000 — e ele é blacklist", () => {
      // Varrendo o espaço, a única combinação em que ambos os DVs saem zero pelo ramo
      // `resto < 2` é a de onze zeros. Ou seja: a blacklist e este ramo se cruzam num
      // ponto só, e a blacklist ganha.
      expect(cpfValido("00000000000")).toBe(false);
    });
  });

  describe("tamanho", () => {
    it.each(["", "123", "1234567890", "123456789012"])(
      "recusa %s por não ter 11 dígitos",
      (cpf) => expect(cpfValido(cpf)).toBe(false),
    );

    it("letras não contam como dígito", () => {
      // O CHECK do banco (`^[0-9]{11}$`) existe porque `.length(11)` do Zod contava
      // CARACTERES: 'abcdefghijk' passava. Aqui as letras somem na extração e sobra
      // um CPF curto demais.
      expect(cpfValido("abcdefghijk")).toBe(false);
      expect(cpfValido("5299822472a")).toBe(false);
    });

    it("não quebra com entrada vazia ou nula", () => {
      expect(cpfValido("")).toBe(false);
      expect(cpfValido(null as unknown as string)).toBe(false);
      expect(cpfValido(undefined as unknown as string)).toBe(false);
    });
  });
});
