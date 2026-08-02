import { describe, it, expect } from "vitest";
import { formSchema } from "@/components/EditalDialog";

/**
 * Contrato de validação do cadastro de Edital.
 *
 * Cuidado ao ler: os campos aqui são os do FORMULÁRIO, não os da tabela. O form
 * trabalha com strings (é o que um <input> devolve) e o `handleSubmit` do dialog é
 * que converte para o payload do banco — `|| null` nos cabeçalhos. Então o schema
 * valida a entrada crua, não o que chega ao Postgres.
 *
 * ⚠️ Este arquivo tinha dois casos sobre `n_candidatos` (string, e a lacuna de não
 * validar que fosse numérico). Eles saíram em 2026-08-02 junto com o campo, e no lugar
 * ficou o caso que guarda a decisão — ver o último bloco.
 */
describe("formSchema do EditalDialog", () => {
  const valido = {
    nome: "Edital 001/2026 SMA",
    cabecalho_linha1: "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA",
    cabecalho_linha2: "Coordenação de Concursos e Processos Seletivos",
  };

  it("aceita um payload completo", () => {
    expect(formSchema.safeParse(valido).success).toBe(true);
  });

  it("aceita só o nome — os outros três são opcionais", () => {
    // Reflete o default do banco: n_candidatos e os cabeçalhos são nullable.
    const r = formSchema.safeParse({ nome: "Edital 002/2026" });
    expect(r.success).toBe(true);
  });

  it("exige o nome, com a mensagem que aparece na tela", () => {
    const r = formSchema.safeParse({ ...valido, nome: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Nome do edital é obrigatório");
  });

  it("rejeita nome ausente", () => {
    const { nome: _, ...semNome } = valido;
    expect(formSchema.safeParse(semNome).success).toBe(false);
  });

  it("rejeita nome de tipo errado", () => {
    expect(formSchema.safeParse({ ...valido, nome: 123 }).success).toBe(false);
  });

  it("🔴 NÃO tem campo de nº de candidatos — a contagem real é a única fonte", () => {
    // Guarda a decisão de 2026-08-02: quantos inscritos um edital tem é `count(candidatos)`,
    // não um número digitado. O zod ignora chave desconhecida, então o que se afirma é o
    // OUTPUT: se alguém devolver o campo ao schema, ele reaparece aqui e este caso cai —
    // que é o momento certo para reabrir a decisão, em vez de voltar calado.
    const r = formSchema.safeParse({ ...valido, n_candidatos: "1500" });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("n_candidatos");
    expect(Object.keys(r.data ?? {}).sort()).toEqual([
      "cabecalho_linha1",
      "cabecalho_linha2",
      "nome",
    ]);
  });

  it("não faz trim: o nome com espaços passa pelo schema", () => {
    // O trim acontece no handleSubmit (`data.nome.trim()`), e a unicidade real é
    // do índice funcional lower(btrim(nome)) no banco. O schema é indiferente.
    expect(formSchema.safeParse({ ...valido, nome: "  Edital 001  " }).success).toBe(true);
  });
});
