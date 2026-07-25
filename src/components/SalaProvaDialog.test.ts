import { describe, it, expect } from "vitest";
import { createFormSchema, editFormSchema } from "@/components/SalaProvaDialog";

/**
 * Contrato de validação de Sala.
 *
 * Estes dois schemas são FÁBRICAS: recebem `maxAndares` da unidade e fecham o limite
 * de `sala_andar` em cima disso. É a única validação do projeto que depende de dado
 * de outra entidade — logo, a que mais merece teste, porque um refactor que perca o
 * parâmetro só falharia em runtime, com a unidade errada.
 */
describe("createFormSchema (criação em lote)", () => {
  const schema = createFormSchema(5);
  const valido = { quantidade: 10, sala_capacidade: 30, sala_andar: 2 };

  it("aceita um payload válido", () => {
    expect(schema.safeParse(valido).success).toBe(true);
  });

  it("coage strings dos inputs para número", () => {
    const r = schema.safeParse({ quantidade: "10", sala_capacidade: "30", sala_andar: "2" });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ quantidade: 10, sala_capacidade: 30, sala_andar: 2 });
  });

  describe("sala_andar é limitado pelo maxAndares da unidade", () => {
    it("aceita o andar igual ao máximo", () => {
      expect(schema.safeParse({ ...valido, sala_andar: 5 }).success).toBe(true);
    });

    it("rejeita acima do máximo, citando o limite na mensagem", () => {
      const r = schema.safeParse({ ...valido, sala_andar: 6 });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Máximo 5 andares");
    });

    it("o limite acompanha o parâmetro, não é constante", () => {
      // A prova de que a fábrica está fazendo o seu trabalho.
      expect(createFormSchema(2).safeParse({ ...valido, sala_andar: 3 }).success).toBe(false);
      expect(createFormSchema(20).safeParse({ ...valido, sala_andar: 3 }).success).toBe(true);
    });

    it("rejeita andar 0 ou negativo", () => {
      expect(schema.safeParse({ ...valido, sala_andar: 0 }).success).toBe(false);
      expect(schema.safeParse({ ...valido, sala_andar: -1 }).success).toBe(false);
    });
  });

  describe("quantidade: 1..50 inteiro", () => {
    it.each([1, 50])("aceita %i", (n) => {
      expect(schema.safeParse({ ...valido, quantidade: n }).success).toBe(true);
    });

    it("rejeita 0 e 51", () => {
      expect(schema.safeParse({ ...valido, quantidade: 0 }).success).toBe(false);
      expect(schema.safeParse({ ...valido, quantidade: 51 }).success).toBe(false);
    });

    it("rejeita fracionário (tem .int(), diferente de unid_andares)", () => {
      expect(schema.safeParse({ ...valido, quantidade: 2.5 }).success).toBe(false);
    });
  });

  describe("sala_capacidade", () => {
    it("exige positivo", () => {
      expect(schema.safeParse({ ...valido, sala_capacidade: 0 }).success).toBe(false);
      expect(schema.safeParse({ ...valido, sala_capacidade: -1 }).success).toBe(false);
      expect(schema.safeParse({ ...valido, sala_capacidade: 1 }).success).toBe(true);
    });

    it("não tem teto — 99999 lugares numa sala passa", () => {
      // Sem .max(). A capacidade agregada alimenta o cálculo de quantos candidatos
      // cabem por unidade, então um valor absurdo distorce o planejamento em
      // silêncio. Candidato natural a CHECK no banco.
      expect(schema.safeParse({ ...valido, sala_capacidade: 99999 }).success).toBe(true);
    });
  });

  it("rejeita payload vazio", () => {
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("editFormSchema (edição de uma sala)", () => {
  const schema = editFormSchema(5);
  const valido = {
    sala_numero: 101,
    sala_descricao: "Laboratório",
    sala_arcondicionado: true,
    sala_capacidade: 30,
    sala_andar: 2,
  };

  it("aceita um payload válido", () => {
    expect(schema.safeParse(valido).success).toBe(true);
  });

  it("aplica default false ao ar-condicionado quando omitido", () => {
    const { sala_arcondicionado: _, ...sem } = valido;
    const r = schema.safeParse(sem);
    expect(r.success).toBe(true);
    expect(r.data?.sala_arcondicionado).toBe(false);
  });

  it("exige sala_numero positivo", () => {
    expect(schema.safeParse({ ...valido, sala_numero: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...valido, sala_numero: -1 }).success).toBe(false);
  });

  it("limita a descrição a 50 caracteres e aceita vazia", () => {
    expect(schema.safeParse({ ...valido, sala_descricao: "" }).success).toBe(true);
    expect(schema.safeParse({ ...valido, sala_descricao: "a".repeat(50) }).success).toBe(true);
    expect(schema.safeParse({ ...valido, sala_descricao: "a".repeat(51) }).success).toBe(false);
  });

  it("aceita andar vazio — o .or(z.literal('')) existe para o campo em branco", () => {
    // Sem esse ramo, "" viraria 0 na coerção e bateria no min(1). O efeito é que
    // andar é OPCIONAL na edição, ao contrário da criação.
    expect(schema.safeParse({ ...valido, sala_andar: "" }).success).toBe(true);
  });

  it("ainda respeita o maxAndares quando o andar é informado", () => {
    expect(schema.safeParse({ ...valido, sala_andar: 6 }).success).toBe(false);
    expect(schema.safeParse({ ...valido, sala_andar: 5 }).success).toBe(true);
  });
});
