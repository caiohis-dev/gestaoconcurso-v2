// Envio de e-mail: montagem de MIME + cliente SMTP mínimo.
//
// 🔴 POR QUE ISTO EXISTE, e por que NÃO usamos mais o denomailer (2026-09-09).
//
// O `denomailer@1.6.0` — que é a ÚLTIMA versão publicada, não dá para atualizar —
// produz mensagem que viola a RFC em três pontos. Medido capturando o SMTP num
// servidor falso local, não deduzido:
//
//   1. 🔴 `Content-Type: multipart/mixed; boundary=attachment100 ` — ESPAÇO no fim
//      do valor do boundary, enquanto o delimitador no corpo é `--attachment100`
//      sem espaço. Cliente que inclui o espaço no valor não acha parte nenhuma e
//      RENDERIZA A MENSAGEM INTEIRA COMO TEXTO — foi o defeito relatado: Gmail e
//      outro cliente mostraram as tags HTML cruas.
//   2. Hex MINÚSCULO no quoted-printable (`=3d`, `=c3`). A RFC 2045 §6.7 exige
//      maiúsculo. Era o `=3d` que aparecia no link de recuperação de senha.
//   3. Espaço em branco no FIM de linha do quoted-printable (`</html> `), que a
//      RFC 2045 proíbe e que é removido em trânsito, corrompendo o conteúdo.
//      E o assunto saía como `=?utf-8?Q?S=c3=b3 HTML?=` — encoded-word com espaço
//      dentro, proibido pela RFC 2047.
//
// A saída aqui usa **base64** no corpo e no assunto. Não é preferência estética:
// base64 não tem regra de caixa, não tem limite de caractere imprimível e não tem
// espaço no fim de linha — as três armadilhas acima deixam de ser possíveis, em vez
// de dependerem de a gente escapar certo.

const CRLF = "\r\n";

/** Base64 de texto UTF-8, quebrado em linhas de 76 (RFC 2045 §6.8). */
function base64Utf8(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return (b64.match(/.{1,76}/g) ?? []).join(CRLF);
}

/**
 * Assunto como encoded-word base64 (RFC 2047). ASCII puro passa direto.
 *
 * 🔴 É AQUI QUE MORAVA O DEFEITO QUE QUEBROU O E-MAIL DE VERDADE (09/09), e por isso
 * esta função é mais longa do que parece precisar. O denomailer emitia:
 *
 *   Subject:  =?utf-8?Q?Redefini=c3=a7=c3=a3o de senha =e2=80=94 ... Colaborado=
 *   res FEVRE?=
 *
 * Três violações somadas: espaço DENTRO do encoded-word (proibido), passou dos 75
 * caracteres (o teto de um encoded-word), e — o que de fato matou — quebrou a linha
 * com `=` deixando a continuação `res FEVRE?=` COMEÇANDO NA COLUNA 0.
 *
 * Continuação de cabeçalho tem de começar com espaço ou tab (RFC 5322, folding).
 * Sem isso o parser lê `res FEVRE?=` como cabeçalho novo e inválido, conclui que o
 * bloco de cabeçalhos ACABOU ali, e todo o resto — inclusive o `Content-Type:
 * multipart/...` — vira corpo. Resultado medido: `is_multipart() == False` e a
 * mensagem inteira exibida como texto cru, com as tags HTML à mostra. Foi o que o
 * Gmail mostrou.
 *
 * Por isso: cada encoded-word cabe em 75 caracteres, nenhum parte um caractere
 * multibyte ao meio, e a junção é CRLF + ESPAÇO — folding de verdade.
 */
function codificarAssunto(assunto: string): string {
  // deno-lint-ignore no-control-regex
  if (/^[\x20-\x7E]*$/.test(assunto)) return assunto;

  const enc = new TextEncoder();
  // `=?UTF-8?B?` + `?=` custam 12 caracteres. Sobram 63 para o base64, e base64 só
  // fecha em múltiplos de 4 -> 60 caracteres -> 45 bytes de entrada por pedaço.
  const MAX_BYTES = 45;

  const pedacos: string[] = [];
  let atual: number[] = [];
  // Percorre por CARACTERE (não por byte): um único caractere nunca pode ficar
  // dividido entre dois encoded-words, senão cada metade fica indecodificável.
  for (const ch of assunto) {
    const b = Array.from(enc.encode(ch));
    if (atual.length + b.length > MAX_BYTES) {
      pedacos.push(String.fromCharCode(...atual));
      atual = [];
    }
    atual.push(...b);
  }
  if (atual.length > 0) pedacos.push(String.fromCharCode(...atual));

  // CRLF + espaço: o espaço é o que faz a linha seguinte ser CONTINUAÇÃO, e não um
  // cabeçalho novo. É a diferença entre funcionar e a mensagem virar texto.
  return pedacos.map((p) => `=?UTF-8?B?${btoa(p)}?=`).join(CRLF + " ");
}

/**
 * Monta a mensagem inteira. Função PURA — é o que torna o defeito do denomailer
 * testável sem enviar e-mail nenhum.
 */
export function montarMensagem(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  texto?: string;
  date?: Date;
}): string {
  const { from, to, subject, html } = opts;
  const texto = opts.texto ??
    "Este e-mail precisa de um cliente com suporte a HTML para ser visualizado.";

  // Boundary sem nada que precise de escape, e ENTRE ASPAS — as aspas são o que
  // torna impossível um espaço acidental virar parte do valor (o defeito nº 1).
  const boundary = `fevre_${crypto.randomUUID().replace(/-/g, "")}`;

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${codificarAssunto(subject)}`,
    `Date: ${(opts.date ?? new Date()).toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@fevre.online>`,
    "MIME-Version: 1.0",
    // multipart/ALTERNATIVE direto, sem o multipart/mixed por fora: não há anexo,
    // e a camada extra do denomailer só existia para acomodá-los.
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Utf8(texto),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Utf8(html),
    "",
    `--${boundary}--`,
    "",
  ].join(CRLF);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cliente SMTP
// ─────────────────────────────────────────────────────────────────────────────

class Conexao {
  #conn: Deno.Conn;
  #buf = new Uint8Array(4096);
  #dec = new TextDecoder();
  #enc = new TextEncoder();

  constructor(conn: Deno.Conn) {
    this.#conn = conn;
  }

  async ler(): Promise<string> {
    // Respostas SMTP podem vir em várias linhas (`250-` continua, `250 ` encerra).
    let resposta = "";
    while (true) {
      const n = await this.#conn.read(this.#buf);
      if (n === null) break;
      resposta += this.#dec.decode(this.#buf.subarray(0, n));
      const linhas = resposta.split(CRLF).filter((l) => l.length > 0);
      const ultima = linhas[linhas.length - 1];
      if (ultima && /^\d{3} /.test(ultima)) break;
    }
    return resposta;
  }

  async escrever(s: string): Promise<void> {
    await this.#conn.write(this.#enc.encode(s));
  }

  /** Envia um comando e exige que a resposta comece com um dos códigos esperados. */
  async comando(cmd: string, esperado: string[]): Promise<string> {
    await this.escrever(cmd + CRLF);
    const r = await this.ler();
    if (!esperado.some((c) => r.startsWith(c))) {
      // ⚠️ O comando entra no erro, mas NUNCA o argumento: em AUTH ele é a senha.
      const rotulo = cmd.split(" ")[0];
      throw new Error(`SMTP recusou ${rotulo}: ${r.trim()}`);
    }
    return r;
  }

  fechar(): void {
    try {
      this.#conn.close();
    } catch {
      // conexão já derrubada pelo servidor após QUIT — não é erro
    }
  }
}

function b64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

export async function enviarEmail(opts: {
  hostname: string;
  port: number;
  username: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  /** Só para teste local contra servidor falso. Produção é sempre TLS. */
  semTls?: boolean;
}): Promise<void> {
  const conn = opts.semTls
    ? await Deno.connect({ hostname: opts.hostname, port: opts.port })
    : await Deno.connectTls({ hostname: opts.hostname, port: opts.port });

  const c = new Conexao(conn);
  try {
    const saudacao = await c.ler();
    if (!saudacao.startsWith("220")) {
      throw new Error(`SMTP não saudou com 220: ${saudacao.trim()}`);
    }

    await c.comando(`EHLO fevre.online`, ["250"]);

    if (!opts.semTls) {
      await c.comando("AUTH LOGIN", ["334"]);
      await c.comando(b64(opts.username), ["334"]);
      await c.comando(b64(opts.password), ["235"]);
    }

    await c.comando(`MAIL FROM:<${opts.from}>`, ["250"]);
    await c.comando(`RCPT TO:<${opts.to}>`, ["250", "251"]);
    await c.comando("DATA", ["354"]);

    const mensagem = montarMensagem(opts);
    // Dot-stuffing (RFC 5321 §4.5.2): linha que começa com "." ganha outro ".",
    // senão ela encerraria os dados no meio da mensagem. Base64 nunca produz isso,
    // mas a proteção fica porque o corpo não é a única coisa que pode mudar.
    const seguro = mensagem.split(CRLF).map((l) => (l.startsWith(".") ? "." + l : l)).join(CRLF);
    await c.escrever(seguro + CRLF + "." + CRLF);

    const r = await c.ler();
    if (!r.startsWith("250")) throw new Error(`SMTP recusou a mensagem: ${r.trim()}`);

    try {
      await c.comando("QUIT", ["221"]);
    } catch {
      // servidor que fecha sem responder 221 não invalida o envio já aceito
    }
  } finally {
    c.fechar();
  }
}
