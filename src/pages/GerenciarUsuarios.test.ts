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

  describe("o refine coordenador ⇒ prova", () => {
    it("rejeita coordenador sem provaId", () => {
      const r = createUserSchema.safeParse({ ...valido, role: "coordenador" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Selecione uma prova para o coordenador");
    });

    it("aceita coordenador com provaId", () => {
      const r = createUserSchema.safeParse({
        ...valido,
        role: "coordenador",
        provaId: "prova-uuid-1",
      });
      expect(r.success).toBe(true);
    });

    it("rejeita coordenador com provaId vazio", () => {
      // A checagem é `!data.provaId`, então "" é falsy e cai no refine — o que é o
      // comportamento desejado (um <select> não escolhido devolve "").
      expect(
        createUserSchema.safeParse({ ...valido, role: "coordenador", provaId: "" }).success,
      ).toBe(false);
    });

    it.each(["admin", "user", "superadmin"] as const)(
      "não exige prova para o papel %s",
      (role) => {
        expect(createUserSchema.safeParse({ ...valido, role }).success).toBe(true);
      },
    );

    it("ignora provaId sobrando em papel que não é coordenador", () => {
      // Não é erro mandar prova para um admin; o refine só olha o caso coordenador.
      expect(
        createUserSchema.safeParse({ ...valido, role: "admin", provaId: "prova-1" }).success,
      ).toBe(true);
    });
  });

  describe("papel", () => {
    it("aceita exatamente os quatro papéis do enum app_role de gestão", () => {
      for (const role of ["admin", "user", "coordenador", "superadmin"]) {
        const payload = role === "coordenador" ? { ...valido, role, provaId: "p1" } : { ...valido, role };
        expect(createUserSchema.safeParse(payload).success, role).toBe(true);
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
