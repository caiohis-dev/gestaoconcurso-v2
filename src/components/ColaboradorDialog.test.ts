import { describe, it, expect } from "vitest";
import { colaboradorSchema } from "@/components/ColaboradorDialog";

/**
 * Contrato de validação do cadastro de Colaborador — o maior schema do projeto e o
 * que carrega dado sensível (CPF, PIS, conta bancária, chave PIX).
 *
 * Contexto que importa ao mexer aqui: `colab_email` não é campo comum, é âncora de
 * identidade — é por ele que o trigger `handle_new_user` casa conta do Auth com
 * cadastro. O schema não sabe disso; a trava de edição em linha vinculada é de UI
 * (o dialog aplica `.omit({ colab_email: true })` quando `user_id` não é nulo).
 * Ver estrutura/transversais/auth-e-permissoes.md.
 */
describe("colaboradorSchema", () => {
  // Só os obrigatórios. Todo o resto é nullable/optional.
  const valido = {
    colab_nome_completo: "Maria da Silva",
    colab_cpf: "12345678901",
    colab_data_nascimento: "1990-05-20",
    colab_telefone: 24998491988,
    colab_email: "maria@exemplo.com",
  };

  it("aceita o conjunto mínimo de obrigatórios", () => {
    expect(colaboradorSchema.safeParse(valido).success).toBe(true);
  });

  it("aplica default false a colab_deficiente", () => {
    const r = colaboradorSchema.safeParse(valido);
    expect(r.data?.colab_deficiente).toBe(false);
  });

  it("rejeita payload vazio", () => {
    expect(colaboradorSchema.safeParse({}).success).toBe(false);
  });

  it.each([
    "colab_nome_completo",
    "colab_cpf",
    "colab_data_nascimento",
    "colab_telefone",
    "colab_email",
  ])("exige %s", (campo) => {
    const payload = { ...valido };
    delete (payload as Record<string, unknown>)[campo];
    expect(colaboradorSchema.safeParse(payload).success).toBe(false);
  });

  describe("colab_cpf", () => {
    it("exige exatamente 11 caracteres", () => {
      expect(colaboradorSchema.safeParse({ ...valido, colab_cpf: "1234567890" }).success).toBe(false);
      expect(colaboradorSchema.safeParse({ ...valido, colab_cpf: "123456789012" }).success).toBe(false);
    });

    it("informa a mensagem da tela", () => {
      const r = colaboradorSchema.safeParse({ ...valido, colab_cpf: "123" });
      expect(r.error?.issues[0].message).toBe("CPF deve ter 11 dígitos");
    });

    it("⚠️ aceita 11 caracteres NÃO numéricos — a mensagem diz 'dígitos', o schema não exige", () => {
      // z.string().length(11), sem regex. "abcdefghijk" passa. O CPF é a chave
      // natural da tabela (UNIQUE) e o identificador da porta de acesso — dado
      // sujo aqui contamina a reivindicação de cadastro.
      expect(colaboradorSchema.safeParse({ ...valido, colab_cpf: "abcdefghijk" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, colab_cpf: "123.456.789" }).success).toBe(true);
    });

    it("⚠️ não valida os dígitos verificadores", () => {
      // "00000000000" é formalmente inválido como CPF e passa.
      expect(colaboradorSchema.safeParse({ ...valido, colab_cpf: "00000000000" }).success).toBe(true);
    });
  });

  describe("colab_email", () => {
    it("exige formato de e-mail", () => {
      expect(colaboradorSchema.safeParse({ ...valido, colab_email: "sem-arroba" }).success).toBe(false);
    });

    it("exige preenchido (não aceita vazio)", () => {
      // Importante: string vazia NÃO pode chegar ao banco. O índice único é sobre
      // lower(trim(colab_email)), e duas linhas com '' colidiriam. Os caminhos de
      // escrita convertem '' em NULL; aqui o min(1) barra antes.
      const r = colaboradorSchema.safeParse({ ...valido, colab_email: "" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Email obrigatório");
    });

    it("limita a 255 caracteres", () => {
      const longo = `${"a".repeat(250)}@x.com`;
      expect(colaboradorSchema.safeParse({ ...valido, colab_email: longo }).success).toBe(false);
    });
  });

  describe("colab_telefone", () => {
    it("exige número, não string", () => {
      const r = colaboradorSchema.safeParse({ ...valido, colab_telefone: "24998491988" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Telefone obrigatório");
    });

    it("exige inteiro positivo", () => {
      expect(colaboradorSchema.safeParse({ ...valido, colab_telefone: 0 }).success).toBe(false);
      expect(colaboradorSchema.safeParse({ ...valido, colab_telefone: -1 }).success).toBe(false);
      expect(colaboradorSchema.safeParse({ ...valido, colab_telefone: 1.5 }).success).toBe(false);
    });

    it("⚠️ não valida quantidade de dígitos — `1` é telefone válido", () => {
      expect(colaboradorSchema.safeParse({ ...valido, colab_telefone: 1 }).success).toBe(true);
    });
  });

  describe("dados bancários", () => {
    it("aceita todos vazios (o cadastro pode não ter conta)", () => {
      const r = colaboradorSchema.safeParse({
        ...valido,
        codigo_banco: "",
        agencia: "",
        agencia_dv: "",
        conta: "",
        conta_dv: "",
        tipo_conta: "",
      });
      expect(r.success).toBe(true);
    });

    it("aceita todos nulos", () => {
      const r = colaboradorSchema.safeParse({
        ...valido,
        codigo_banco: null,
        agencia: null,
        conta: null,
        tipo_conta: null,
      });
      expect(r.success).toBe(true);
    });

    it("exige exatamente 3 dígitos no código do banco", () => {
      expect(colaboradorSchema.safeParse({ ...valido, codigo_banco: "001" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, codigo_banco: "1" }).success).toBe(false);
      expect(colaboradorSchema.safeParse({ ...valido, codigo_banco: "abc" }).success).toBe(false);
    });

    it("aceita só dígitos em agência e conta", () => {
      expect(colaboradorSchema.safeParse({ ...valido, agencia: "12345678" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, agencia: "123456789" }).success).toBe(false);
      expect(colaboradorSchema.safeParse({ ...valido, agencia: "12a" }).success).toBe(false);
      expect(colaboradorSchema.safeParse({ ...valido, conta: "12345678901234567890" }).success).toBe(true);
    });

    it("aceita X como dígito verificador (convenção bancária)", () => {
      expect(colaboradorSchema.safeParse({ ...valido, conta_dv: "X" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, conta_dv: "x" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, conta_dv: "9" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, conta_dv: "AB" }).success).toBe(false);
    });

    it("restringe tipo_conta a corrente/poupanca", () => {
      expect(colaboradorSchema.safeParse({ ...valido, tipo_conta: "corrente" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, tipo_conta: "poupanca" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, tipo_conta: "salario" }).success).toBe(false);
    });
  });

  describe("chave PIX", () => {
    it("⚠️ aceita qualquer texto de até 255 — sem formato e sem tipo", () => {
      // Espelha a dívida já registrada no backlog: as 565 chaves existentes estão
      // em formatos misturados e `tipo_chave_pix` está NULL nas 771 linhas. O
      // schema não pede o tipo nem normaliza a chave, então nada aqui impede que
      // a mesma chave entre escrita de dois jeitos.
      expect(colaboradorSchema.safeParse({ ...valido, colab_chave_pix: "127.139.687-47" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, colab_chave_pix: "(24)998491988" }).success).toBe(true);
      expect(colaboradorSchema.safeParse({ ...valido, colab_chave_pix: "qualquer coisa" }).success).toBe(true);
    });
  });

  describe("limites de texto que espelham as colunas", () => {
    it.each([
      ["colab_nome_completo", 40],
      ["colab_matricula", 6],
      ["colab_nacionalidade", 10],
      ["colab_pis", 11],
      ["colab_rua", 34],
      ["colab_bairro", 26],
      ["colab_cidade", 15],
      ["colab_complemento_endereco", 20],
    ])("%s aceita %i caracteres e recusa um a mais", (campo, max) => {
      const noLimite = { ...valido, [campo]: "a".repeat(max) };
      const acima = { ...valido, [campo]: "a".repeat(max + 1) };
      expect(colaboradorSchema.safeParse(noLimite).success, `${campo} no limite`).toBe(true);
      expect(colaboradorSchema.safeParse(acima).success, `${campo} acima`).toBe(false);
    });
  });
});
