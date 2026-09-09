// 🔴 O denomailer SAIU em 2026-09-09, e não foi preferência: ele quebrava o e-mail.
//
// Assunto com acento e mais de ~60 caracteres saía assim:
//     Subject:  =?utf-8?Q?Redefini=c3=a7=c3=a3o de senha =e2=80=94 ... Colaborado=
//     res FEVRE?=
// A continuação começava na COLUNA 0, sem espaço. Isso não é folding de cabeçalho:
// o parser lê `res FEVRE?=` como cabeçalho novo inválido, decide que o bloco de
// cabeçalhos terminou ali, e o `Content-Type: multipart/...` vira CORPO.
//
// Medido reproduzindo com o assunto real de produção: `is_multipart() == False`.
// O Gmail e outro cliente exibiram a mensagem inteira como texto, com as tags HTML
// à mostra — e o link de recuperação de senha, copiado dali, vinha com `=3d` no
// meio e não abria.
//
// `denomailer@1.6.0` é a ÚLTIMA versão publicada, então não havia upgrade a fazer.
// Detalhes e as outras violações de RFC em `../_shared/smtp.ts`.
import { enviarEmail } from "../_shared/smtp.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  // Só o servidor envia e-mail. `verify_jwt` (o padrão) não basta aqui: a anon key
  // é um JWT válido E é pública — vai no bundle do frontend, qualquer um a copia do
  // DevTools. Sem esta checagem, um terceiro faz POST {to, subject, html} e dispara
  // e-mail arbitrário PELO servidor da FEVRE: passa por SPF/DKIM, chega como
  // remetente legítimo e serve de vetor de phishing contra os próprios colaboradores.
  //
  // Nenhum código do frontend chama esta função — só as Edge Functions, via
  // _shared/enviar-link-acesso.ts, todas com service_role. Fechar não quebra nada.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(
      JSON.stringify({ error: "Não autorizado" }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  try {
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios ausentes: to, subject, html" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const host = Deno.env.get("SMTP_HOST")!;
    const port = Number(Deno.env.get("SMTP_PORT"));
    const username = Deno.env.get("SMTP_USER")!;
    const password = Deno.env.get("SMTP_PASS")!;

    await enviarEmail({
      hostname: host,
      port,
      username,
      password,
      from: username,
      to,
      subject,
      html,
    });

    return new Response(
      JSON.stringify({ success: true, message: "E-mail enviado com sucesso pela Hostinger!" }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Erro no envio de e-mail:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
