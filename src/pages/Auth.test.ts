import { describe, it, expect } from "vitest";
import { loginSchema } from "@/pages/Auth";

/**
 * Contrato de validação da porta única de login (`/auth`).
 *
 * Escopo: só o par e-mail/senha do formulário de entrada. A recuperação de acesso
 * ("Estou sem minha senha") não usa este schema — ela aceita CPF **ou** e-mail e
 * decide no servidor entre invite e recovery, com políticas de privacidade
 * deliberadamente assimétricas (ver estrutura/transversais/auth-e-permissoes.md).
 */
describe("loginSchema", () => {
  const valido = { email: "colaborador@fevre.test", password: "senha-forte" };

  it("aceita e-mail e senha válidos", () => {
    expect(loginSchema.safeParse(valido).success).toBe(true);
  });

  describe("e-mail", () => {
    it.each([
      "sem-arroba",
      "@sem-usuario.com",
      "sem-dominio@",
      "",
      "espaço no meio@x.com",
    ])("rejeita %j", (email) => {
      expect(loginSchema.safeParse({ ...valido, email }).success).toBe(false);
    });

    it("informa a mensagem que aparece na tela", () => {
      const r = loginSchema.safeParse({ ...valido, email: "invalido" });
      expect(r.error?.issues[0].message).toBe("E-mail inválido");
    });

    it("rejeita ausência do campo", () => {
      const { email: _, ...sem } = valido;
      expect(loginSchema.safeParse(sem).success).toBe(false);
    });

    it("NÃO normaliza caixa nem espaços", () => {
      // Relevante: o Supabase Auth trata Joao@x.com e joao@x.com como o MESMO
      // usuário, e o índice único de colab_email é sobre lower(trim(...)). Aqui o
      // valor passa como veio — quem normaliza é o GoTrue, não este schema.
      const r = loginSchema.safeParse({ ...valido, email: "Joao@Exemplo.COM" });
      expect(r.success).toBe(true);
      expect(r.data?.email).toBe("Joao@Exemplo.COM");
    });

    it("aceita e-mail com espaços nas pontas — lacuna: sem trim", () => {
      // z.string().email() do Zod 3 não faz trim; " a@b.com " falha, mas o caso
      // simétrico importa: o usuário que cola com espaço recebe "E-mail inválido"
      // sem entender por quê. Fixado aqui para que a mudança seja consciente.
      expect(loginSchema.safeParse({ ...valido, email: " a@b.com " }).success).toBe(false);
    });
  });

  describe("senha", () => {
    it("exige no mínimo 6 caracteres", () => {
      expect(loginSchema.safeParse({ ...valido, password: "12345" }).success).toBe(false);
      expect(loginSchema.safeParse({ ...valido, password: "123456" }).success).toBe(true);
    });

    it("informa a mensagem que aparece na tela", () => {
      const r = loginSchema.safeParse({ ...valido, password: "123" });
      expect(r.error?.issues[0].message).toBe("Senha deve ter no mínimo 6 caracteres");
    });

    it("não impõe complexidade — 6 espaços passam", () => {
      // O mínimo do GoTrue é 6 e o form apenas o espelha. Registrar isso evita que
      // alguém presuma regra de complexidade que não existe.
      expect(loginSchema.safeParse({ ...valido, password: "      " }).success).toBe(true);
    });

    it("rejeita ausência do campo", () => {
      const { password: _, ...sem } = valido;
      expect(loginSchema.safeParse(sem).success).toBe(false);
    });
  });

  it("rejeita tipos errados", () => {
    expect(loginSchema.safeParse({ email: 1, password: 2 }).success).toBe(false);
  });
});
