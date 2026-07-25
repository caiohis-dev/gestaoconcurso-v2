import { describe, it, expect } from "vitest";
import { formSchema } from "@/components/FuncaoColaboradorDialog";

/**
 * Contrato de validação do cadastro de Função/Cargo (`/funcoes-colaboradores`).
 *
 * Lembrete de contexto: duas linhas desta tabela têm o UUID hardcoded no front
 * (FUNCOES_COORDENACAO, em useCoordenadoresProva) e definem quem pode virar
 * coordenador. Este schema não sabe disso — ele valida o texto do formulário —,
 * mas quem mexer aqui deve saber que apagar e recriar uma função quebra aquele
 * vínculo em silêncio.
 */
describe("formSchema do FuncaoColaboradorDialog", () => {
  const valido = {
    cargo_nome: "Fiscal de Sala",
    cargo_cbo: "4110-10",
    cargo_descricao: "Acompanha a aplicação na sala.",
  };

  it("aceita um payload completo", () => {
    expect(formSchema.safeParse(valido).success).toBe(true);
  });

  it("aceita só o nome — CBO e descrição são opcionais", () => {
    expect(formSchema.safeParse({ cargo_nome: "Fiscal" }).success).toBe(true);
  });

  describe("cargo_nome", () => {
    it("exige não vazio, com a mensagem da tela", () => {
      const r = formSchema.safeParse({ ...valido, cargo_nome: "" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Nome é obrigatório");
    });

    it("limita a 35 caracteres", () => {
      expect(formSchema.safeParse({ ...valido, cargo_nome: "a".repeat(35) }).success).toBe(true);
      const r = formSchema.safeParse({ ...valido, cargo_nome: "a".repeat(36) });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Máximo 35 caracteres");
    });

    it("rejeita ausente", () => {
      const { cargo_nome: _, ...sem } = valido;
      expect(formSchema.safeParse(sem).success).toBe(false);
    });
  });

  describe("cargo_cbo", () => {
    it("limita a 7 caracteres", () => {
      expect(formSchema.safeParse({ ...valido, cargo_cbo: "1234567" }).success).toBe(true);
      expect(formSchema.safeParse({ ...valido, cargo_cbo: "12345678" }).success).toBe(false);
    });

    it("NÃO valida formato de CBO — qualquer texto de até 7 chars passa", () => {
      // Os CBOs reais são do tipo "4110-10" (7 chars com hífen). Sem regex, "abc"
      // entra. Candidato a CHECK, junto com o resto do roadmap de constraints.
      expect(formSchema.safeParse({ ...valido, cargo_cbo: "abc" }).success).toBe(true);
    });
  });

  describe("cargo_descricao", () => {
    it("limita a 1000 caracteres", () => {
      expect(formSchema.safeParse({ ...valido, cargo_descricao: "a".repeat(1000) }).success).toBe(true);
      expect(formSchema.safeParse({ ...valido, cargo_descricao: "a".repeat(1001) }).success).toBe(false);
    });
  });

  it("rejeita payload vazio", () => {
    expect(formSchema.safeParse({}).success).toBe(false);
  });
});
