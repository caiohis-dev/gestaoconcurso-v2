/**
 * export-seed — gera o SQL de seed do banco de produção (Lovable Cloud).
 *
 * POR QUE ISSO EXISTE
 * O banco de produção roda no Lovable Cloud, que não expõe connection string
 * nem permite conexão externa (psql, `supabase db dump`, n8n — nada conecta).
 * Uma Edge Function, porém, roda DENTRO da infra e recebe `SUPABASE_DB_URL`
 * como secret padrão — o que dá uma conexão Postgres direta, e portanto acesso
 * ao schema `auth`. É a única via que consegue ler `auth.users.encrypted_password`
 * (a Admin API não devolve o hash), preservando as SENHAS e os UUIDs dos usuários.
 * Preservar os UUIDs é obrigatório: profiles.id, user_roles.user_id,
 * provas.created_by e coordenadores_prova.user_id referenciam auth.users(id).
 *
 * COMO USAR
 * O SQL não volta no corpo da resposta HTTP: ele é enviado por e-mail para DEST
 * (abaixo), como anexo .sql. O SMTP é o mesmo da função send-email (secrets
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
 *
 * Logado no app como superadmin, cole no console do navegador (F12). O client
 * Supabase não é exposto em `window`, então o token sai direto do localStorage:
 *
 *   const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
 *   let raw = localStorage.getItem(k);
 *   if (raw.startsWith('base64-')) raw = atob(raw.slice(7));   // supabase-js novo
 *   const token = JSON.parse(raw).access_token;
 *
 *   const r = await fetch('/functions/v1/export-seed'.replace(/^/, SUPABASE_URL), {
 *     headers: { Authorization: `Bearer ${token}` },
 *   });
 *   console.log(await r.json());   // { success, to, arquivo, linhas, bytes }
 *
 * Baixe o anexo do e-mail e aplique no banco novo (Studio → SQL Editor, ou como
 * arquivo de seed). É idempotente: todo INSERT tem ON CONFLICT DO NOTHING.
 *
 * SEGURANÇA
 * O anexo contém PII pesada (CPF, PIS, endereço, conta bancária, chave PIX de
 * todos os colaboradores) e os hashes de senha. Por isso a função exige que o
 * chamador seja superadmin, e o destino é fixo no código — não aceita `to` do
 * chamador, senão um token vazado exfiltraria a base inteira para um endereço
 * arbitrário. Ainda assim, isso põe a base num e-mail: apague a função do
 * projeto assim que a migração terminar.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.5";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

/** Destino fixo: nunca vem do request. Ver bloco SEGURANÇA acima. */
const DEST = "naoresponda@fevre.online";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Ordem importa: respeita as dependências de FK. Mesmo com
 * session_replication_role = replica (que desliga a checagem), manter a ordem
 * correta faz o dump continuar válido caso alguém rode os INSERTs sem esse SET.
 */
const TABLES: { schema: string; table: string }[] = [
  // auth primeiro — todo o resto pendura FK em auth.users(id)
  { schema: "auth", table: "users" },
  { schema: "auth", table: "identities" }, // sem identity, o login por email não funciona no GoTrue novo

  // catálogos sem dependência
  { schema: "public", table: "bancos" },
  { schema: "public", table: "funcoes_colaboradores" },

  // dependem de auth.users
  { schema: "public", table: "profiles" },
  { schema: "public", table: "user_roles" },

  // domínio
  { schema: "public", table: "colaboradores" },
  { schema: "public", table: "unidades_prova" },
  { schema: "public", table: "sala_prova" },
  { schema: "public", table: "provas" },
  { schema: "public", table: "prova_unidades" },
  { schema: "public", table: "salas_prova_distribuidas" },
  { schema: "public", table: "colaboradores_prova" },
  { schema: "public", table: "coordenadores_prova" },
  { schema: "public", table: "valores_funcao_prova" },
  { schema: "public", table: "meta_colaboradores_unidade" },
  { schema: "public", table: "ocorrencias_colaborador" },
  { schema: "public", table: "email_atualizacao_log" },
];

/**
 * Deliberadamente fora do dump:
 * - colaborador_sessions, prova_edit_locks: estado efêmero de runtime, sem valor histórico.
 * - colaboradores_backup_20260701: lixo, já removido por migration.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return fail(401, "Authorization header ausente.");
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const DB_URL = Deno.env.get("SUPABASE_DB_URL")!;

  // 1) Quem está chamando?
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);

  if (userError || !userData?.user) {
    return fail(401, "Token inválido.");
  }

  // 2) É superadmin? A resposta carrega PII + hashes de senha; ninguém mais entra.
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);

  if (rolesError) {
    return fail(500, `Falha ao verificar permissão: ${rolesError.message}`);
  }
  if (!roles?.some((r) => r.role === "superadmin")) {
    return fail(403, "Apenas superadmin pode exportar o seed.");
  }

  // 3) Conexão Postgres direta — é isso que dá acesso ao schema `auth`,
  //    invisível pela API REST (PostgREST só expõe `public`).
  const sql = postgres(DB_URL, { prepare: false });

  try {
    const out: string[] = [];
    const stamp = new Date().toISOString();
    let totalRows = 0;

    out.push(`-- Seed gerado por export-seed em ${stamp}`);
    out.push(`-- Origem: banco de produção (Lovable Cloud).`);
    out.push(`--`);
    out.push(`-- session_replication_role = replica desliga TRIGGERS e checagem de FK`);
    out.push(`-- durante a carga. Sem isso, o trigger on_auth_user_created dispararia a`);
    out.push(`-- cada INSERT em auth.users e criaria profiles/user_roles duplicados,`);
    out.push(`-- conflitando com as linhas reais que estamos importando aqui.`);
    out.push(`BEGIN;`);
    out.push(`SET session_replication_role = replica;`);
    out.push(``);

    for (const { schema, table } of TABLES) {
      // Colunas reais da tabela. Geradas/identity ficam de fora: o Postgres as
      // recalcula no destino e um INSERT explícito nelas seria rejeitado.
      const cols = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = ${table}
          AND is_generated = 'NEVER'
          AND identity_generation IS NULL
        ORDER BY ordinal_position
      `;

      if (cols.length === 0) {
        out.push(`-- [aviso] ${schema}.${table} não existe na origem — pulando.`);
        out.push(``);
        continue;
      }

      const names = cols.map((c) => c.column_name);
      const colList = names.map((n) => `"${n}"`).join(", ");

      // O escaping é feito pelo próprio Postgres (quote_nullable), não por
      // concatenação em JS: é o que garante que aspas, JSON, timestamps e NULLs
      // saiam como literais válidos. O cast ::text + recast implícito no destino
      // funciona para uuid, jsonb, timestamptz, boolean, numeric etc.
      const valueExpr = names
        .map((n) => `quote_nullable("${n}"::text)`)
        .join(", ");

      const rows = await sql.unsafe<{ stmt: string }[]>(
        `SELECT 'INSERT INTO ${schema}.${table} (${colList}) VALUES ('
                || concat_ws(', ', ${valueExpr})
                || ') ON CONFLICT DO NOTHING;' AS stmt
         FROM ${schema}.${table}`,
      );

      out.push(`-- ${schema}.${table} — ${rows.length} linha(s)`);
      if (rows.length === 0) {
        out.push(`-- (vazia)`);
      } else {
        for (const r of rows) out.push(r.stmt);
      }
      out.push(``);
      totalRows += rows.length;
    }

    out.push(`SET session_replication_role = origin;`);
    out.push(`COMMIT;`);
    out.push(``);

    const seed = out.join("\n");
    const seedBytes = new TextEncoder().encode(seed);
    const filename = `seed_${stamp.slice(0, 10)}.sql`;

    // O anexo vai em base64 justamente porque o dump tem acento (nomes, endereços):
    // fromCharCode byte a byte preserva o UTF-8 que o TextEncoder produziu — passar
    // a string direto para btoa quebraria em qualquer caractere fora de latin-1.
    let bin = "";
    for (const b of seedBytes) bin += String.fromCharCode(b);
    const seedBase64 = btoa(bin);

    // 4) Envia o seed por e-mail — mesmo SMTP da função send-email, mas como
    //    anexo: no corpo, o cliente de e-mail reescreveria aspas e quebras de
    //    linha, corrompendo o SQL.
    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get("SMTP_HOST")!,
        port: Number(Deno.env.get("SMTP_PORT")),
        tls: true,
        auth: {
          username: Deno.env.get("SMTP_USER")!,
          password: Deno.env.get("SMTP_PASS")!,
        },
      },
    });

    try {
      await client.send({
        from: Deno.env.get("SMTP_USER")!,
        to: DEST,
        subject: `Seed do banco de produção — ${stamp.slice(0, 10)} (${totalRows} linhas)`,
        content: `Seed gerado em ${stamp}: ${totalRows} linha(s), ${seedBytes.length} bytes.\nO SQL está no anexo ${filename}.`,
        attachments: [
          {
            filename,
            contentType: "text/plain; charset=utf-8",
            encoding: "base64",
            content: seedBase64,
          },
        ],
      });
    } finally {
      await client.close();
    }

    return new Response(
      JSON.stringify({
        success: true,
        to: DEST,
        arquivo: filename,
        linhas: totalRows,
        bytes: seedBytes.length,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Erro ao gerar seed:", error);
    return fail(500, (error as Error).message);
  } finally {
    await sql.end();
  }
});
