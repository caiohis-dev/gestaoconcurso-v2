import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { montarMensagem } from "./smtp.ts";

// Regressão do defeito de 2026-09-09: o e-mail de recuperação de senha chegou ao
// Gmail como TEXTO CRU, com as tags HTML à mostra, e o link copiado de lá vinha com
// `=3d` no meio e não abria.
//
// A causa não estava no corpo — estava no ASSUNTO. O `denomailer@1.6.0` emitia:
//
//     Subject:  =?utf-8?Q?Redefini=c3=a7=c3=a3o de senha =e2=80=94 ... Colaborado=
//     res FEVRE?=
//
// A continuação começava na coluna 0. Sem espaço à esquerda não é folding: o parser
// lê como cabeçalho novo inválido, encerra o bloco de cabeçalhos ali e o
// `Content-Type: multipart/...` vira corpo. Medido: `is_multipart() == False`.
//
// ⚠️ Estes testes usam o ASSUNTO REAL DE PRODUÇÃO. Um assunto curto NÃO reproduz o
// defeito — foi o que me enganou na primeira tentativa de diagnóstico.
const ASSUNTO_REAL = "Redefinição de senha — Sistema de Cadastro de Colaboradores FEVRE";

const base = {
  from: "naoresponda@fevre.online",
  to: "alguem@exemplo.com",
  html: '<html><body><h1>Olá</h1><a href="https://fevre.online/redefinir-senha">Redefinir</a></body></html>',
};

/** Separa o bloco de cabeçalhos do corpo, como um parser faria. */
function cabecalhos(msg: string): string[] {
  return msg.split("\r\n\r\n")[0].split("\r\n");
}

Deno.test("montarMensagem — o assunto longo com acento", async (t) => {
  const msg = montarMensagem({ ...base, subject: ASSUNTO_REAL });
  const linhas = cabecalhos(msg);

  await t.step("🔴 toda continuação de cabeçalho começa com espaço ou tab", () => {
    // O CORAÇÃO DA REGRESSÃO. Linha que não é `Nome: valor` tem de ser continuação
    // dobrada — e continuação sem espaço inicial foi o que quebrou o e-mail.
    for (const linha of linhas) {
      const ehCabecalhoNovo = /^[!-9;-~]+:/.test(linha);
      const ehContinuacao = /^[ \t]/.test(linha);
      assert(
        ehCabecalhoNovo || ehContinuacao,
        `Linha de cabeçalho nem começa cabeçalho novo nem é continuação: ${JSON.stringify(linha)}`,
      );
    }
  });

  await t.step("nenhum encoded-word passa de 75 caracteres (RFC 2047)", () => {
    for (const ew of msg.match(/=\?[^?]+\?[BQ]\?[^?]*\?=/gi) ?? []) {
      assert(ew.length <= 75, `encoded-word com ${ew.length} caracteres: ${ew}`);
    }
  });

  await t.step("não há espaço DENTRO de um encoded-word", () => {
    for (const ew of msg.match(/=\?[^?]+\?[BQ]\?[^?]*\?=/gi) ?? []) {
      assert(!ew.includes(" "), `encoded-word com espaço dentro: ${ew}`);
    }
  });

  await t.step("CONTROLE POSITIVO: o assunto volta inteiro ao decodificar", () => {
    // Provar que recusa o formato errado é metade; a outra é provar que o conteúdo
    // sobrevive. Junta os encoded-words e decodifica.
    const partes = [...msg.matchAll(/=\?UTF-8\?B\?([^?]*)\?=/g)].map((m) => m[1]);
    assert(partes.length >= 2, "assunto longo deveria ter sido dobrado em 2+ pedaços");
    const bytes = partes.flatMap((p) => Array.from(atob(p), (c) => c.charCodeAt(0)));
    assertEquals(new TextDecoder().decode(new Uint8Array(bytes)), ASSUNTO_REAL);
  });
});

Deno.test("montarMensagem — estrutura MIME", async (t) => {
  const msg = montarMensagem({ ...base, subject: ASSUNTO_REAL });

  await t.step("é multipart/alternative com boundary ENTRE ASPAS", () => {
    const m = msg.match(/Content-Type: multipart\/alternative; boundary="([^"]+)"/);
    assert(m, "faltou o Content-Type multipart/alternative com boundary entre aspas");
    // O denomailer emitia `boundary=attachment100 `, sem aspas e com espaço no fim.
    assert(!m[1].includes(" "), "boundary não pode conter espaço");
  });

  await t.step("as duas partes existem e o delimitador casa", () => {
    const boundary = msg.match(/boundary="([^"]+)"/)![1];
    assertEquals(msg.split(`--${boundary}\r\n`).length - 1, 2, "deveria haver 2 partes");
    assert(msg.includes(`--${boundary}--`), "faltou o delimitador de fechamento");
    assert(msg.includes('Content-Type: text/plain; charset="UTF-8"'));
    assert(msg.includes('Content-Type: text/html; charset="UTF-8"'));
  });

  await t.step("CONTROLE POSITIVO: o HTML volta byte a byte", () => {
    const parte = msg.split('Content-Type: text/html; charset="UTF-8"')[1];
    const b64 = parte.split("\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    assertEquals(new TextDecoder().decode(bytes), base.html);
  });

  await t.step("nenhuma linha termina com espaço", () => {
    // Espaço no fim de linha é removido em trânsito e corrompe o conteúdo — era
    // outra violação do denomailer (`</html> `).
    for (const linha of msg.split("\r\n")) {
      assert(!/[ \t]$/.test(linha), `linha termina com espaço: ${JSON.stringify(linha)}`);
    }
  });
});

Deno.test("montarMensagem — assunto ASCII curto passa sem codificar", () => {
  const msg = montarMensagem({ ...base, subject: "Acesso ao sistema" });
  assert(msg.includes("Subject: Acesso ao sistema"), "ASCII puro não deve virar encoded-word");
});
