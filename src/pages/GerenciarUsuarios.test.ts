import { describe, it, expect } from "vitest";
import { createUserSchema } from "@/pages/GerenciarUsuarios";

/**
 * Contrato de validação da criação de usuário de sistema (`/gerenciar-usuarios`).
 *
 * O que torna este schema diferente dos outros: ele tem um `.refine()` — validação
 * CONDICIONAL entre campos. Coordenador precisa de prova; os demais papéis não.
 * Regra de negócio de verdade, e a que mais quebra em refactor.
 *
 * Não confundir com cadastro de colaborador: aqui se cria uma CONTA com papel de
 * sistema (profiles + user_roles), não a pessoa da tabela `colaboradores`.
 */
describe("createUserSchema", () => {
  const valido = {
    email: "novo.admin@fevre.test",
    password: "senha-forte",
    fullName: "Maria Silva",
    role: "admin" as const,
  };

  it("aceita um payload válido de admin, sem prova", () => {
    expect(createUserSchema.safeParse(valido).success).toBe(true);
  });

  describe("coordenador NÃO é concedido por esta tela", () => {
    // Mudança de 2026-07-26. Antes, o schema aceitava `coordenador` e EXIGIA um
    // `provaId` — e conceder por aqui obrigava a fabricar uma alocação falsa em
    // `colaboradores_prova` só para satisfazer a FK NOT NULL de `coordenadores_prova`.
    // Coordenação depende de alocação real, então passou a ser concedida no
    // CoordenadoresProvaDialog. Aqui se concede papel PURO.
    it("recusa `coordenador` no papel", () => {
      const r = createUserSchema.safeParse({ ...valido, role: "coordenador" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toContain("Invalid enum value");
    });

    it("não existe mais campo `provaId` — mandá-lo não torna coordenador válido", () => {
      expect(
        createUserSchema.safeParse({ ...valido, role: "coordenador", provaId: "p1" }).success,
      ).toBe(false);
    });
  });

  describe("papel", () => {
    it("aceita os três papéis que esta tela concede", () => {
      // `coordenador` saiu em 2026-07-26 — ver o describe acima.
      for (const role of ["admin", "user", "superadmin"]) {
        expect(createUserSchema.safeParse({ ...valido, role }).success, role).toBe(true);
      }
    });

    it("rejeita `colaborador`, que NÃO é papel de gestão", () => {
      // colaborador existe no enum do banco, mas é dimensão paralela — não se
      // concede por esta tela. Se um dia aparecer aqui, é regressão de conceito.
      expect(createUserSchema.safeParse({ ...valido, role: "colaborador" }).success).toBe(false);
    });

    it("rejeita papel inventado", () => {
      expect(createUserSchema.safeParse({ ...valido, role: "root" }).success).toBe(false);
    });
  });

  describe("campos básicos", () => {
    it("exige e-mail válido", () => {
      expect(createUserSchema.safeParse({ ...valido, email: "invalido" }).success).toBe(false);
    });

    it("exige senha de 6+ caracteres", () => {
      expect(createUserSchema.safeParse({ ...valido, password: "12345" }).success).toBe(false);
      expect(createUserSchema.safeParse({ ...valido, password: "123456" }).success).toBe(true);
    });

    it("exige nome com 2+ caracteres", () => {
      expect(createUserSchema.safeParse({ ...valido, fullName: "M" }).success).toBe(false);
      expect(createUserSchema.safeParse({ ...valido, fullName: "Ma" }).success).toBe(true);
    });

    it("rejeita payload vazio", () => {
      expect(createUserSchema.safeParse({}).success).toBe(false);
    });
  });
});
