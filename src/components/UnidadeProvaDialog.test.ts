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
  const valido = { unid_nome: "Escola Municipal XYZ", unid_sigla: "EMXYZ" };

  it("aceita um payload válido", () => {
    expect(formSchema.safeParse(valido).success).toBe(true);
  });

  it("⚠️ REMOVIDO com a coluna: a coerção de andares de string para número", () => {
    const r = formSchema.safeParse({ ...valido });
    expect(r.success).toBe(true);
    expect(r.success).toBe(true);
  });

  /**
   * 🔵 **O bloco `unid_andares: faixa 1..99` foi REMOVIDO em 2026-08-03**, com a coluna.
   * Eram 6 casos (aceita 1/50/99, rejeita 0, negativo, 100, texto; e a lacuna do
   * fracionário). Nenhum deles estava errado — o campo existia e era validado assim. O que
   * mudou é que a unidade **não declara mais andares**: o número virava teto para criar
   * salas, e o teto era o defeito. Ver `provas-e-unidades.md`.
   */
  it("⭐ CONTROLE POSITIVO: o schema NÃO conhece mais unid_andares", () => {
    // Um valor extra é ignorado pelo Zod (não é `.strict()`), então o que se afirma é que
    // ele não SAI no dado parseado — reintroduzir o campo derruba este caso.
    const r = formSchema.safeParse({ ...valido, unid_andares: 3 });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("unid_andares");
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
