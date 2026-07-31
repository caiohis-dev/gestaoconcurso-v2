import { describe, it, expect } from "vitest";
import { cargoFormSchema } from "@/components/CargoDialog";

/**
 * Contrato de validação do cadastro de Cargo.
 *
 * ⭐ O que este schema deliberadamente NÃO valida, e por quê: a **unicidade do nome**. Ela
 * é do banco — índice único sobre a coluna GERADA `nome_chave` (`lower(btrim(nome))`) — e
 * só o banco pode conferi-la. Reproduzi-la aqui criaria duas fontes de verdade que
 * divergem, e a do cliente perderia sempre (ela não vê os outros cargos).
 *
 * Quem traduz a recusa é `mensagemErroCargo`, testada em `useCargos.test.tsx`.
 */
describe("cargoFormSchema do CargoDialog", () => {
  it("aceita um nome comum", () => {
    expect(cargoFormSchema.safeParse({ nome: "DOCENTE I — HISTÓRIA" }).success).toBe(true);
  });

  it("exige o nome, com a mensagem que aparece na tela", () => {
    const r = cargoFormSchema.safeParse({ nome: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("O nome do cargo é obrigatório");
  });

  it("⭐ recusa nome só de espaços — o `.trim()` vem ANTES do `.min(1)`", () => {
    // A ordem importa: `z.string().min(1).trim()` aceitaria "   ", porque mediria antes
    // de aparar. É o mesmo caso que o `chk_cargo_nome_preenchido` do banco cobre com
    // `btrim(nome) <> ''` — aqui a barreira é só antecipação, não substituta.
    expect(cargoFormSchema.safeParse({ nome: "   " }).success).toBe(false);
  });

  it("apara as pontas, para o nome gravado não depender de digitação", () => {
    const r = cargoFormSchema.safeParse({ nome: "  DOCENTE II  " });
    expect(r.success).toBe(true);
    expect(r.data?.nome).toBe("DOCENTE II");
  });

  it("rejeita nome ausente e de tipo errado", () => {
    expect(cargoFormSchema.safeParse({}).success).toBe(false);
    expect(cargoFormSchema.safeParse({ nome: 123 }).success).toBe(false);
  });

  it("⚠️ NÃO recusa nome que já existe — isso é do banco", () => {
    // Documenta a lacuna de propósito: o schema não conhece o catálogo. Se um dia alguém
    // acrescentar unicidade aqui, vai precisar do catálogo inteiro no cliente e a regra
    // vai divergir da do banco no primeiro cargo criado em outra aba.
    expect(cargoFormSchema.safeParse({ nome: "docente ii" }).success).toBe(true);
  });
});
