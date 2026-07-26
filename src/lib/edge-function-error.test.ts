import { describe, it, expect } from "vitest";
import { mensagemDeErroDaFuncao } from "@/lib/edge-function-error";

/**
 * O helper é a resposta a um defeito real: as EFs recusam com 409/400 e o motivo no
 * corpo, e o `functions.invoke` esconde esse corpo em `error.context.body` como string —
 * `data` vem `null`. Quem escrevia `data?.error || <genérica>` descartava a explicação
 * do servidor.
 *
 * Por ser função pura, o teste é `.test.ts` (sem render, sem provider).
 */
describe("mensagemDeErroDaFuncao", () => {
  const PADRAO = "Não foi possível concluir.";

  it("prefere o que a EF escreveu no corpo da resposta não-2xx", () => {
    // O caso que motivou o helper.
    const msg = mensagemDeErroDaFuncao(
      {
        message: "Edge Function returned a non-2xx status code",
        context: { body: JSON.stringify({ error: "Esta conta já foi confirmada." }) },
      },
      null,
      PADRAO,
    );
    expect(msg).toBe("Esta conta já foi confirmada.");
  });

  it("ignora a message genérica do transporte quando há corpo", () => {
    // "Edge Function returned a non-2xx status code" não diz nada ao usuário.
    const msg = mensagemDeErroDaFuncao(
      {
        message: "Edge Function returned a non-2xx status code",
        context: { body: JSON.stringify({ error: "Informe o e-mail correto." }) },
      },
      null,
      PADRAO,
    );
    expect(msg).not.toContain("non-2xx");
  });

  it("lê o erro de `data` quando a EF responde 200 com erro no corpo", () => {
    // Algumas EFs fazem isso; `invoke` então entrega o corpo em `data`, sem `error`.
    expect(mensagemDeErroDaFuncao(null, { error: "Colaborador não encontrado." }, PADRAO)).toBe(
      "Colaborador não encontrado.",
    );
  });

  it("cai na message do erro quando não há corpo nenhum", () => {
    // Falha de rede: não há resposta HTTP para desembrulhar.
    expect(mensagemDeErroDaFuncao({ message: "Failed to fetch" }, null, PADRAO)).toBe(
      "Failed to fetch",
    );
  });

  it("usa o padrão quando não há nada aproveitável", () => {
    expect(mensagemDeErroDaFuncao(null, null, PADRAO)).toBe(PADRAO);
    expect(mensagemDeErroDaFuncao({}, {}, PADRAO)).toBe(PADRAO);
  });

  it("corpo que não é JSON não derruba nada", () => {
    // Gateway devolvendo HTML, por exemplo. Tem de degradar, não lançar.
    expect(
      mensagemDeErroDaFuncao({ message: "Bad Gateway", context: { body: "<html>502</html>" } }, null, PADRAO),
    ).toBe("Bad Gateway");
  });

  it("corpo JSON sem campo `error` também degrada", () => {
    expect(
      mensagemDeErroDaFuncao(
        { message: "Bad Request", context: { body: JSON.stringify({ detalhe: "outro formato" }) } },
        null,
        PADRAO,
      ),
    ).toBe("Bad Request");
  });

  it("o corpo ganha de `data.error` quando os dois existem", () => {
    // O corpo da resposta é a fonte mais próxima do que a EF decidiu.
    expect(
      mensagemDeErroDaFuncao(
        { context: { body: JSON.stringify({ error: "do corpo" }) } },
        { error: "do data" },
        PADRAO,
      ),
    ).toBe("do corpo");
  });
});
