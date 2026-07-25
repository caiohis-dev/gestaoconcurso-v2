import { describe, it, expect } from "vitest";
import { formSchema } from "@/components/UnidadeProvaDialog";

/**
 * Contrato de validação do cadastro de Unidade de Prova.
 *
 * Este schema é o CASO-EXEMPLO do roadmap `analises/roadmap-db-constraints.yaml`:
 * o Zod exige `unid_andares` entre 1 e 99, mas a coluna no banco é só SMALLINT e
 * aceita -5 ou 0. Os testes abaixo fixam o lado do Zod — são a referência do que
 * as CHECK constraints precisarão espelhar.
 */
describe("formSchema do UnidadeProvaDialog", () => {
  const valido = { unid_nome: "Escola Municipal XYZ", unid_sigla: "EMXYZ", unid_andares: 3 };

  it("aceita um payload válido", () => {
    expect(formSchema.safeParse(valido).success).toBe(true);
  });

  it("coage andares de string para número (o <input> devolve string)", () => {
    const r = formSchema.safeParse({ ...valido, unid_andares: "3" });
    expect(r.success).toBe(true);
    expect(r.data?.unid_andares).toBe(3);
  });

  describe("unid_andares: faixa 1..99", () => {
    it.each([1, 50, 99])("aceita %i", (n) => {
      expect(formSchema.safeParse({ ...valido, unid_andares: n }).success).toBe(true);
    });

    it("rejeita 0 com a mensagem da tela", () => {
      const r = formSchema.safeParse({ ...valido, unid_andares: 0 });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Mínimo 1 andar");
    });

    it("rejeita negativo — o caso que o banco hoje aceitaria", () => {
      expect(formSchema.safeParse({ ...valido, unid_andares: -5 }).success).toBe(false);
    });

    it("rejeita 100", () => {
      const r = formSchema.safeParse({ ...valido, unid_andares: 100 });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Máximo 99 andares");
    });

    it("NÃO exige inteiro — lacuna: 2.5 andares passa", () => {
      // Não há .int() na cadeia. A coluna é SMALLINT, então o Postgres arredonda
      // em vez de recusar. Se um dia entrar CHECK, vale entrar .int() junto.
      expect(formSchema.safeParse({ ...valido, unid_andares: 2.5 }).success).toBe(true);
    });

    it("rejeita texto não numérico", () => {
      expect(formSchema.safeParse({ ...valido, unid_andares: "três" }).success).toBe(false);
    });
  });

  describe("campos de texto", () => {
    it("exige nome não vazio", () => {
      const r = formSchema.safeParse({ ...valido, unid_nome: "" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Nome é obrigatório");
    });

    it("limita o nome a 30 caracteres (a coluna é VARCHAR(30))", () => {
      expect(formSchema.safeParse({ ...valido, unid_nome: "a".repeat(30) }).success).toBe(true);
      expect(formSchema.safeParse({ ...valido, unid_nome: "a".repeat(31) }).success).toBe(false);
    });

    it("exige sigla não vazia e limita a 10", () => {
      expect(formSchema.safeParse({ ...valido, unid_sigla: "" }).success).toBe(false);
      expect(formSchema.safeParse({ ...valido, unid_sigla: "a".repeat(10) }).success).toBe(true);
      expect(formSchema.safeParse({ ...valido, unid_sigla: "a".repeat(11) }).success).toBe(false);
    });

    it("aceita nome só de espaços — lacuna: min(1) não faz trim", () => {
      // "   " tem length 3, então passa. No banco, length(trim(...)) > 0 pegaria.
      // É exatamente a D1 do roadmap de constraints.
      expect(formSchema.safeParse({ ...valido, unid_nome: "   " }).success).toBe(true);
    });
  });

  it("rejeita payload sem os obrigatórios", () => {
    expect(formSchema.safeParse({}).success).toBe(false);
  });
});
