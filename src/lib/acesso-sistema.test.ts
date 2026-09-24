import { describe, it, expect } from "vitest";
import { concederPapelSchema, situacaoAcesso } from "@/lib/acesso-sistema";

/**
 * Contrato da concessão de papel de sistema em `/gerenciar-usuarios`.
 *
 * ⚠️ Até 2026-09-24 este arquivo testava o `createUserSchema` (e-mail + SENHA + nome),
 * da época em que a `create-admin` criava a conta com senha escolhida pelo admin e
 * sobrescrevia a senha de quem já tinha conta. Hoje a conta de sistema nasce de
 * COLABORADOR, e senha não passa por aqui em lugar nenhum.
 */
describe("concederPapelSchema", () => {
  const valido = {
    colaboradorId: "8b2f7d6e-2c1a-4a6b-9f0e-1d2c3b4a5f60",
    role: "admin" as const,
  };

  it("aceita os três papéis de sistema", () => {
    for (const role of ["superadmin", "admin", "financeiro"]) {
      expect(concederPapelSchema.safeParse({ ...valido, role }).success, role).toBe(true);
    }
  });

  it("recusa `coordenador` — é concedido pela prova, com alocação real", () => {
    // Mudança de 2026-07-26: conceder por aqui obrigava a fabricar alocação falsa.
    expect(concederPapelSchema.safeParse({ ...valido, role: "coordenador" }).success).toBe(false);
  });

  it("recusa `user` e `colaborador` — não são papéis de sistema, o trigger os concede", () => {
    expect(concederPapelSchema.safeParse({ ...valido, role: "user" }).success).toBe(false);
    expect(concederPapelSchema.safeParse({ ...valido, role: "colaborador" }).success).toBe(false);
  });

  it("exige um colaborador selecionado", () => {
    const r = concederPapelSchema.safeParse({ ...valido, colaboradorId: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Selecione um colaborador");
  });

  it("não tem campo de senha nem de e-mail — mandá-los não muda nada", () => {
    // O e-mail vem do CADASTRO, no servidor. Se um dia o schema voltar a pedi-los, é a
    // regressão para o fluxo que sobrescrevia senha.
    const r = concederPapelSchema.safeParse({ ...valido, email: "x@y.z", password: "123456" });
    expect(r.success).toBe(true);
    expect(Object.keys(r.data!)).toEqual(["colaboradorId", "role"]);
  });
});

describe("situacaoAcesso — espelha a decisão da EF", () => {
  it("vinculado → tem-conta, mesmo sem e-mail no cadastro", () => {
    // A EF decide pelo `user_id` primeiro: quem tem conta recebe o papel sem e-mail.
    expect(situacaoAcesso({ user_id: "u1", colab_email: "a@b.c" })).toBe("tem-conta");
    expect(situacaoAcesso({ user_id: "u1", colab_email: null })).toBe("tem-conta");
  });

  it("sem conta, com e-mail → convite", () => {
    expect(situacaoAcesso({ user_id: null, colab_email: "a@b.c" })).toBe("convite");
  });

  it("sem conta e sem e-mail (ou só espaços) → sem-email", () => {
    expect(situacaoAcesso({ user_id: null, colab_email: null })).toBe("sem-email");
    expect(situacaoAcesso({ user_id: null, colab_email: "   " })).toBe("sem-email");
  });
});
