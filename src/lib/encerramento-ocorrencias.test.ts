import { describe, it, expect } from "vitest";
import { podeEncerrarOcorrencias } from "@/lib/encerramento-ocorrencias";

/**
 * Espelho da RPC `encerrar_ocorrencias_unidade` (2026-11-27). A RPC é a barreira e tem
 * bateria própria (`docs/bateria-encerrar-ocorrencias.sql`); aqui se guarda que a TELA
 * não oferece o botão a quem o banco recusaria — nem esconde de quem ele aceita.
 */
describe("podeEncerrarOcorrencias", () => {
  const nenhuma = new Set<string>();

  it("superadmin encerra qualquer unidade", () => {
    expect(podeEncerrarOcorrencias("pu-1", { isSuperAdmin: true, unidadesDoCoordenador: nenhuma })).toBe(true);
  });

  it("coordenador encerra a SUA unidade", () => {
    expect(
      podeEncerrarOcorrencias("pu-1", { isSuperAdmin: false, unidadesDoCoordenador: new Set(["pu-1"]) }),
    ).toBe(true);
  });

  it("coordenador NÃO encerra outra unidade da mesma prova", () => {
    // Até 2026-11-27 a RPC aceitava coordenador de QUALQUER unidade da prova.
    expect(
      podeEncerrarOcorrencias("pu-2", { isSuperAdmin: false, unidadesDoCoordenador: new Set(["pu-1"]) }),
    ).toBe(false);
  });

  it("admin sem ser superadmin NÃO encerra (nem sendo o criador da prova)", () => {
    // O contexto não tem "isAdmin" de propósito: ser admin não entra na conta.
    expect(podeEncerrarOcorrencias("pu-1", { isSuperAdmin: false, unidadesDoCoordenador: nenhuma })).toBe(false);
  });
});
