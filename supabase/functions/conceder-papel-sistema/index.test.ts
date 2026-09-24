import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { forgeToken, callFunction, getAdminClient } from "../_shared/test-utils.ts";

// ⚠️ O ramo "colaborador SEM conta" ENVIA E-MAIL DE VERDADE (o link de acesso, pela
// send-email, a partir do banco local). Por isso ele só roda com
// EF_TESTE_ENVIA_EMAIL=1 — e o endereço do caso é de domínio `.invalid` (RFC 2606),
// que não entrega a ninguém. Os demais casos não enviam nada.
const RODAR_ENVIO = Deno.env.get("EF_TESTE_ENVIA_EMAIL") === "1";

const cpfDeTeste = () => "999" + String(Date.now()).slice(-8);

Deno.test("conceder-papel-sistema — autorização e os três estados do colaborador", async (t) => {
  const admin = getAdminClient();
  const contas: string[] = [];
  const colaboradores: string[] = [];

  const criarConta = async (email: string, senha = "senha-forte-123") => {
    const { data: { user }, error } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true,
    });
    if (error) throw error;
    contas.push(user!.id);
    return user!;
  };

  const criarColaborador = async (email: string | null) => {
    const { data, error } = await admin.from("colaboradores").insert({
      colab_nome_completo: "Teste Runner Papel Sistema",
      colab_cpf: cpfDeTeste(),
      colab_data_nascimento: "1990-01-01",
      colab_email: email,
    }).select("id").single();
    if (error) throw error;
    colaboradores.push(data.id);
    return data.id as string;
  };

  const papeisDe = async (userId: string) => {
    const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
    return (data ?? []).map((r) => r.role as string).sort();
  };

  const contagens = async () => {
    const tabelas = ["colaboradores_prova", "coordenadores_prova", "user_roles"];
    const out: Record<string, number | null> = {};
    for (const tb of tabelas) {
      const { count } = await admin.from(tb).select("*", { count: "exact", head: true });
      out[tb] = count;
    }
    return out;
  };

  const sa = await criarConta(`test_runner_superadmin_${Date.now()}@exemplo.com`);
  await admin.from("user_roles").insert({ user_id: sa.id, role: "superadmin" });
  const ad = await criarConta(`test_runner_admin_${Date.now()}@exemplo.com`);
  await admin.from("user_roles").insert({ user_id: ad.id, role: "admin" });
  const tokenSA = await forgeToken({ sub: sa.id, email: sa.email });
  const tokenAdmin = await forgeToken({ sub: ad.id, email: ad.email });

  try {
    const colabQualquer = await criarColaborador(null);

    await t.step("A1 — anon key crua (401): verify_jwt não é autorização", async () => {
      const res = await callFunction("conceder-papel-sistema", { colaborador_id: colabQualquer, role: "superadmin" });
      const text = await res.text();
      assertEquals(res.status, 401, text);
    });

    await t.step("A3 — token inválido (401)", async () => {
      const res = await callFunction("conceder-papel-sistema", { colaborador_id: colabQualquer, role: "admin" }, "lixo");
      await res.text();
      assertEquals(res.status, 401);
    });

    await t.step("A4 — admin comum, não superadmin (403)", async () => {
      const res = await callFunction("conceder-papel-sistema", { colaborador_id: colabQualquer, role: "admin" }, tokenAdmin);
      const text = await res.text();
      assertEquals(res.status, 403, text);
    });

    await t.step("A9/A10 — coordenador recusado (400) sem escrever NADA", async () => {
      const antes = await contagens();
      const res = await callFunction("conceder-papel-sistema", { colaborador_id: colabQualquer, role: "coordenador" }, tokenSA);
      const text = await res.text();
      assertEquals(res.status, 400, text);
      assertEquals(JSON.parse(text).error.includes("Acesso de coordenador não é concedido aqui"), true);
      assertEquals(await contagens(), antes);
    });

    await t.step("papel desconhecido (400)", async () => {
      const res = await callFunction("conceder-papel-sistema", { colaborador_id: colabQualquer, role: "user" }, tokenSA);
      await res.text();
      assertEquals(res.status, 400);
    });

    await t.step("colaborador inexistente (404)", async () => {
      const res = await callFunction(
        "conceder-papel-sistema",
        { colaborador_id: "00000000-0000-0000-0000-000000000000", role: "admin" },
        tokenSA,
      );
      await res.text();
      assertEquals(res.status, 404);
    });

    await t.step("sem e-mail e sem conta → 400 nomeando a providência, e nenhuma conta nasce", async () => {
      const antes = await contagens();
      const res = await callFunction("conceder-papel-sistema", { colaborador_id: colabQualquer, role: "admin" }, tokenSA);
      const text = await res.text();
      assertEquals(res.status, 400, text);
      assertEquals(JSON.parse(text).error.includes("Cadastre o e-mail"), true);
      assertEquals(await contagens(), antes);
    });

    await t.step("VINCULADO → papel concedido e a SENHA CONTINUA A MESMA (controle do defeito da create-admin)", async () => {
      const email = `test_runner_vinculado_${Date.now()}@exemplo.com`;
      const senha = "senha-da-propria-pessoa-123";
      const conta = await criarConta(email, senha);
      const colabId = await criarColaborador(email);
      await admin.from("colaboradores").update({ user_id: conta.id }).eq("id", colabId);

      const { count: trilhaAntes } = await admin.from("log_envio_link_acesso")
        .select("*", { count: "exact", head: true }).eq("colaborador_id", colabId);

      const res = await callFunction("conceder-papel-sistema", { colaborador_id: colabId, role: "financeiro" }, tokenSA);
      const text = await res.text();
      assertEquals(res.status, 200, text);
      const body = JSON.parse(text);
      assertEquals(body.situacao, "concedido");
      assertEquals(body.userId, conta.id);
      assertEquals((await papeisDe(conta.id)).includes("financeiro"), true);

      // A prova de que a senha não foi tocada: a pessoa ainda entra com a DELA.
      const anon = createClient(
        Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { auth: { persistSession: false } },
      );
      const { error: loginErr } = await anon.auth.signInWithPassword({ email, password: senha });
      assertEquals(loginErr, null);

      // E nenhum e-mail saiu.
      const { count: trilhaDepois } = await admin.from("log_envio_link_acesso")
        .select("*", { count: "exact", head: true }).eq("colaborador_id", colabId);
      assertEquals(trilhaDepois, trilhaAntes);

      // Idempotente: repetir não duplica nem falha.
      const res2 = await callFunction("conceder-papel-sistema", { colaborador_id: colabId, role: "financeiro" }, tokenSA);
      const body2 = JSON.parse(await res2.text());
      assertEquals(res2.status, 200);
      assertEquals(body2.situacao, "ja-tinha");
      assertEquals((await papeisDe(conta.id)).filter((r) => r === "financeiro").length, 1);
    });

    await t.step({
      name: "SEM CONTA, com e-mail → a conta nasce, se vincula e recebe o papel (ENVIA E-MAIL)",
      ignore: !RODAR_ENVIO,
      fn: async () => {
        const email = `test_runner_convite_${Date.now()}@example.invalid`;
        const colabId = await criarColaborador(email);

        const res = await callFunction("conceder-papel-sistema", { colaborador_id: colabId, role: "admin" }, tokenSA);
        const text = await res.text();
        assertEquals(res.status, 200, text);
        const body = JSON.parse(text);
        contas.push(body.userId);
        assertEquals(["convite-enviado", "convite-falhou"].includes(body.situacao), true, body.situacao);

        const { data: colab } = await admin.from("colaboradores").select("user_id").eq("id", colabId).single();
        assertEquals(colab!.user_id, body.userId);
        const papeis = await papeisDe(body.userId);
        assertEquals(papeis.includes("admin"), true, papeis.join(","));
        assertEquals(papeis.includes("colaborador"), true, papeis.join(","));

        // A trilha registrou, com a origem nova (a CHECK da migration 20260924112512).
        const { count } = await admin.from("log_envio_link_acesso")
          .select("*", { count: "exact", head: true })
          .eq("colaborador_id", colabId).eq("origem", "conceder-papel-sistema");
        assertEquals(count, 1);
      },
    });
  } finally {
    for (const id of colaboradores) {
      await admin.from("log_envio_link_acesso").delete().eq("colaborador_id", id);
      await admin.from("colaboradores").delete().eq("id", id);
    }
    for (const id of contas) {
      await admin.from("user_roles").delete().eq("user_id", id);
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }
});
