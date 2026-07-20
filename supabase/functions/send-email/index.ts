import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

    const client = new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: true,
        auth: { username, password },
      },
    });

    await client.send({
      from: username,
      to,
      subject,
      content: "Use um cliente compatível com HTML para visualizar este email.",
      html,
    });

    await client.close();

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
