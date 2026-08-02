import { describe, it, expect } from "vitest";
import { formSchema } from "@/components/ProvaDialog";

/**
 * Contrato de validação do cadastro de Prova.
 *
 * O ponto central: `edital_id` é o ÚNICO campo obrigatório. Isso codifica a decisão
 * D5 do tema "Editais como entidade" — no banco a coluna é NULLABLE (a ordem
 * migration → seed impede o NOT NULL), então **a obrigatoriedade vive aqui, no
 * schema, e em nenhum outro lugar**. Se este `min(1)` cair, passa a ser possível
 * gravar prova órfã sem que nada reclame.
 */
describe("formSchema do ProvaDialog", () => {
  const valido = {
    edital_id: "edital-uuid-1",
    prova_data: "2026-03-15",
    prova_hora_inicio: "08:00",
    prova_hora_final: "12:00",
    prova_cabecalho_linha1: "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA",
    prova_cabecalho_linha2: "Coordenação de Concursos e Processos Seletivos",
  };

  it("aceita um payload completo", () => {
    expect(formSchema.safeParse(valido).success).toBe(true);
  });

  it("aceita só o edital — todo o resto é opcional", () => {
    expect(formSchema.safeParse({ edital_id: "edital-uuid-1" }).success).toBe(true);
  });

  describe("edital_id é a única obrigatoriedade", () => {
    it("rejeita vazio, com a mensagem da tela", () => {
      const r = formSchema.safeParse({ ...valido, edital_id: "" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Selecione um edital");
    });

    it("rejeita ausente", () => {
      const { edital_id: _, ...sem } = valido;
      expect(formSchema.safeParse(sem).success).toBe(false);
    });

    it("rejeita null", () => {
      expect(formSchema.safeParse({ ...valido, edital_id: null }).success).toBe(false);
    });

    it("NÃO valida formato de UUID — qualquer texto passa", () => {
      // Lacuna consciente de registrar: a integridade real é a FK no banco, que
      // devolveria 23503. O schema só garante "escolheu alguma coisa".
      expect(formSchema.safeParse({ ...valido, edital_id: "qualquer-coisa" }).success).toBe(true);
    });
  });

  describe("campos herdados do edital (sugestão editável)", () => {
    it("aceita todos vazios — a herança é sugestão, não exigência", () => {
      const r = formSchema.safeParse({
        edital_id: "e1",
        prova_cabecalho_linha1: "",
        prova_cabecalho_linha2: "",
      });
      expect(r.success).toBe(true);
    });

    it("🔴 o nº de candidatos NÃO é mais campo da prova", () => {
      // Até 2026-08-02 este era o número que a alocação lia, digitado à mão — 200 num
      // edital com 7.231 inscritos. Hoje a alocação conta os inscritos reais do edital.
      // Afirma-se o OUTPUT porque o zod ignora chave desconhecida: se o campo voltar ao
      // schema, ele reaparece aqui e este caso cai, que é quando a decisão deve ser
      // reaberta (o campo só faz sentido junto com o vínculo candidato↔prova).
      const r = formSchema.safeParse({ ...valido, prova_n_candidatos: "500" });
      expect(r.success).toBe(true);
      expect(r.data).not.toHaveProperty("prova_n_candidatos");
    });
  });

  describe("data e horários", () => {
    it("aceita qualquer string — não há validação de formato nem de ordem", () => {
      // Nenhum regex, nenhum refine cruzando início x fim. Uma prova que termina
      // antes de começar passa pelo schema. É a lacuna mais visível aqui, e a que
      // um refine resolveria sem tocar no banco.
      expect(formSchema.safeParse({ ...valido, prova_data: "data inválida" }).success).toBe(true);
      expect(
        formSchema.safeParse({ ...valido, prova_hora_inicio: "12:00", prova_hora_final: "08:00" })
          .success,
      ).toBe(true);
    });
  });

  it("rejeita payload vazio", () => {
    expect(formSchema.safeParse({}).success).toBe(false);
  });
});
