import { describe, it, expect } from "vitest";
import { formSchema } from "@/components/EditalDialog";

/**
 * Contrato de validação do cadastro de Edital.
 *
 * Cuidado ao ler: os campos aqui são os do FORMULÁRIO, não os da tabela. O form
 * trabalha com strings (é o que um <input> devolve) e o `handleSubmit` do dialog é
 * que converte para o payload do banco — `parseInt(n_candidatos)` e `|| null` nos
 * cabeçalhos. Então o schema valida a entrada crua, não o que chega ao Postgres.
 */
describe("formSchema do EditalDialog", () => {
  const valido = {
    nome: "Edital 001/2026 SMA",
    n_candidatos: "1500",
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

  it("trata n_candidatos como STRING, não número — inclusive na entrada", () => {
    // O <input type="number"> ainda entrega string ao react-hook-form. Passar um
    // number de verdade falha; é o formato do form que manda aqui.
    expect(formSchema.safeParse({ ...valido, n_candidatos: 1500 }).success).toBe(false);
    expect(formSchema.safeParse({ ...valido, n_candidatos: "1500" }).success).toBe(true);
  });

  it("NÃO valida que n_candidatos seja numérico — lacuna conhecida", () => {
    // z.string().optional() aceita qualquer texto. Quem converte é o parseInt do
    // handleSubmit, que devolveria NaN. Na prática o <input type="number"> segura
    // isso na UI, mas o schema sozinho não segura — relevante se alguém reusar
    // este schema fora do dialog.
    expect(formSchema.safeParse({ ...valido, n_candidatos: "mil e quinhentos" }).success).toBe(true);
  });

  it("não faz trim: o nome com espaços passa pelo schema", () => {
    // O trim acontece no handleSubmit (`data.nome.trim()`), e a unicidade real é
    // do índice funcional lower(btrim(nome)) no banco. O schema é indiferente.
    expect(formSchema.safeParse({ ...valido, nome: "  Edital 001  " }).success).toBe(true);
  });
});
