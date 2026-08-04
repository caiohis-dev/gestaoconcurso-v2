import { describe, it, expect } from "vitest";
import { createFormSchema, editFormSchema, ANDAR_MAXIMO } from "@/components/SalaProvaDialog";

/**
 * Contrato de validação de Sala.
 *
 * 🔴 **Os dois schemas DEIXARAM de depender da unidade em 2026-08-03.** Eram fábricas que
 * recebiam `unid_andares` e fechavam o andar em cima dele — "a única validação do projeto
 * que depende de dado de outra entidade", como dizia este comentário. A coluna foi dropada
 * e o teto por unidade caiu junto: **não existe mais andar que a unidade "não tem"**.
 *
 * O que sobrou é limite de FORMATO (`ANDAR_MAXIMO`), pela numeração `andar × 100 +
 * sequência` — nada a ver com o prédio.
 */
describe("createFormSchema (criação em lote)", () => {
  const schema = createFormSchema();
  const valido = { quantidade: 10, sala_capacidade: 30, andar_de: 1, andar_ate: 2 };

  it("aceita um payload válido", () => {
    expect(schema.safeParse(valido).success).toBe(true);
  });

  it("coage strings dos inputs para número", () => {
    const r = schema.safeParse({
      quantidade: "10",
      sala_capacidade: "30",
      andar_de: "1",
      andar_ate: "2",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ quantidade: 10, sala_capacidade: 30, andar_de: 1, andar_ate: 2 });
  });

  /**
   * 🔵 **Reescrito duas vezes na mesma sessão, e as duas por mudança de regra.** Primeiro
   * os casos afirmavam um `sala_andar` único (virou faixa); depois afirmavam o teto por
   * unidade (a coluna sumiu). Nenhuma das versões estava errada sobre o código do momento
   * — é a armadilha 8 em funcionamento normal: o teste que cai é a pergunta.
   */
  describe("🔴 não há mais teto por unidade — só limite de formato", () => {
    it("⭐ CONTROLE POSITIVO: andar bem acima do que qualquer unidade declarava passa", () => {
      // Era exatamente o caso recusado até ontem: com `unid_andares = 1` (7 das 11
      // unidades), pedir o andar 9 não produzia nem mensagem.
      expect(schema.safeParse({ ...valido, andar_de: 1, andar_ate: 9 }).success).toBe(true);
      expect(schema.safeParse({ ...valido, andar_de: 40, andar_ate: 50 }).success).toBe(true);
    });

    it("o schema não recebe mais parâmetro nenhum", () => {
      // A fábrica virou função sem argumento. Se alguém reintroduzir o teto, é aqui que
      // aparece primeiro.
      expect(createFormSchema.length).toBe(0);
    });

    it("aceita o andar máximo de formato e recusa um acima", () => {
      expect(schema.safeParse({ ...valido, andar_ate: ANDAR_MAXIMO }).success).toBe(true);
      const r = schema.safeParse({ ...valido, andar_ate: ANDAR_MAXIMO + 1 });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe(`O andar vai até ${ANDAR_MAXIMO}`);
    });

    it("⚠️ o limite é de NUMERAÇÃO, não do prédio", () => {
      // `andar × 100 + sequência`: do andar 100 em diante a sala passa a ter 5 dígitos
      // (10001) e toda lista impressa muda de forma. É por isso que 99 é o teto — não
      // porque alguém tenha declarado quantos andares o prédio tem.
      expect(ANDAR_MAXIMO).toBe(99);
    });

    it("rejeita andar 0 ou negativo nas duas pontas", () => {
      expect(schema.safeParse({ ...valido, andar_de: 0 }).success).toBe(false);
      expect(schema.safeParse({ ...valido, andar_ate: -1 }).success).toBe(false);
    });

    it("🔴 rejeita faixa invertida, apontando o campo do FINAL", () => {
      // O `path` importa: a mensagem tem de sair embaixo do campo que a pessoa
      // provavelmente errou, não embaixo do primeiro do formulário.
      const r = schema.safeParse({ ...valido, andar_de: 3, andar_ate: 2 });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("O andar final não pode ser menor que o inicial");
      expect(r.error?.issues[0].path).toEqual(["andar_ate"]);
    });

    it("⭐ faixa de um andar só continua válida", () => {
      // `De 2 Até 2` é como se atende um andar específico.
      expect(schema.safeParse({ ...valido, andar_de: 2, andar_ate: 2 }).success).toBe(true);
    });
  });

  describe("quantidade: 1..50 inteiro, POR ANDAR", () => {
    it.each([1, 50])("aceita %i", (n) => {
      expect(schema.safeParse({ ...valido, quantidade: n }).success).toBe(true);
    });

    it("rejeita 0 e 51", () => {
      expect(schema.safeParse({ ...valido, quantidade: 0 }).success).toBe(false);
      expect(schema.safeParse({ ...valido, quantidade: 51 }).success).toBe(false);
    });

    it("rejeita fracionário (tem .int(), diferente de unid_andares)", () => {
      expect(schema.safeParse({ ...valido, quantidade: 2.5 }).success).toBe(false);
    });
  });

  describe("sala_capacidade", () => {
    it("exige positivo", () => {
      expect(schema.safeParse({ ...valido, sala_capacidade: 0 }).success).toBe(false);
      expect(schema.safeParse({ ...valido, sala_capacidade: -1 }).success).toBe(false);
      expect(schema.safeParse({ ...valido, sala_capacidade: 1 }).success).toBe(true);
    });

    it("não tem teto — 99999 lugares numa sala passa", () => {
      // Sem .max(). A capacidade agregada alimenta o cálculo de quantos candidatos
      // cabem por unidade, então um valor absurdo distorce o planejamento em
      // silêncio. Candidato natural a CHECK no banco.
      expect(schema.safeParse({ ...valido, sala_capacidade: 99999 }).success).toBe(true);
    });
  });

  it("rejeita payload vazio", () => {
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("editFormSchema (edição de uma sala)", () => {
  const schema = editFormSchema();
  const valido = {
    sala_numero: 101,
    sala_descricao: "Laboratório",
    sala_capacidade: 30,
    sala_andar: 2,
  };

  it("aceita um payload válido", () => {
    expect(schema.safeParse(valido).success).toBe(true);
  });

  it("🔴 o ar-condicionado NÃO existe mais no schema", () => {
    // A coluna foi dropada em 03/08 ("é lixo, não existe mais"). O caso que existia aqui
    // afirmava o `default false` — e era ele que zerava o valor de qualquer sala editada,
    // porque o campo nem era exibido no formulário.
    const r = schema.safeParse({ ...valido, sala_arcondicionado: true });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("sala_arcondicionado");
  });

  it("exige sala_numero positivo", () => {
    expect(schema.safeParse({ ...valido, sala_numero: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...valido, sala_numero: -1 }).success).toBe(false);
  });

  it("limita a descrição a 50 caracteres e aceita vazia", () => {
    expect(schema.safeParse({ ...valido, sala_descricao: "" }).success).toBe(true);
    expect(schema.safeParse({ ...valido, sala_descricao: "a".repeat(50) }).success).toBe(true);
    expect(schema.safeParse({ ...valido, sala_descricao: "a".repeat(51) }).success).toBe(false);
  });

  it("aceita andar vazio — o .or(z.literal('')) existe para o campo em branco", () => {
    // Sem esse ramo, "" viraria 0 na coerção e bateria no min(1). O efeito é que
    // andar é OPCIONAL na edição, ao contrário da criação.
    expect(schema.safeParse({ ...valido, sala_andar: "" }).success).toBe(true);
  });

  it("🔵 o andar da sala não é mais limitado pela unidade", () => {
    // Este caso afirmava `maxAndares` até 03/08. Com o teto fora, o que resta é o limite
    // de formato — e uma sala no andar 9 passou a ser editável em qualquer unidade.
    expect(schema.safeParse({ ...valido, sala_andar: 9 }).success).toBe(true);
    expect(schema.safeParse({ ...valido, sala_andar: ANDAR_MAXIMO }).success).toBe(true);
    expect(schema.safeParse({ ...valido, sala_andar: ANDAR_MAXIMO + 1 }).success).toBe(false);
  });
});
