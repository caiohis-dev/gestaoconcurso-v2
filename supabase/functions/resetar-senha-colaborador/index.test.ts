import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { forgeToken, callFunction, getAdminClient } from "../_shared/test-utils.ts";

// resetar-senha-colaborador NÃO envia e-mail em ramo nenhum — roda sem combinado prévio.
//
// ⚠️ É teste de INTEGRAÇÃO: cria e apaga contas e cadastros no banco local (cópia de
// produção). Teardown no `finally`; se o processo morrer no meio, sobra `test_runner_*`.
//
// O superadmin do teste é criado SÓ com a linha `superadmin`, sem `admin` — é o
// controle positivo da hierarquia dentro do `has_role` (SELECT literal em user_roles
// já bloqueou o superadmin 3 vezes neste repo).

const NOME = "TESTE RUNNER RESET SENHA";
const cpfDeTeste = () => "998" + String(Date.now()).slice(-8);

const anonClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

Deno.test("resetar-senha-colaborador — autorização, recusas e a troca com trilha", async (t) => {
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

  const criarColaborador = async (userId: string | null = null) => {
    const { data, error } = await admin.from("colaboradores").insert({
      colab_nome_completo: NOME,
      colab_cpf: cpfDeTeste(),
      colab_data_nascimento: "1990-01-01",
    }).select("id").single();
    if (error) throw error;
    colaboradores.push(data.id);
    if (userId) await admin.from("colaboradores").update({ user_id: userId }).eq("id", data.id);
    return data.id as string;
  };

  const linhasDeTrilha = async (colabId: string) => {
    const { data } = await admin.from("log_reset_senha").select("*").eq("colaborador_id", colabId);
    return data ?? [];
  };

  const sa = await criarConta(`test_runner_reset_sa_${Date.now()}@exemplo.com`);
  await admin.from("user_roles").insert({ user_id: sa.id, role: "superadmin" });
  const ad = await criarConta(`test_runner_reset_admin_${Date.now()}@exemplo.com`);
  await admin.from("user_roles").insert({ user_id: ad.id, role: "admin" });
  const tokenSA = await forgeToken({ sub: sa.id, email: sa.email });
  const tokenAdmin = await forgeToken({ sub: ad.id, email: ad.email });

  try {
    const colabSemConta = await criarColaborador(null);

    await t.step("anon key crua (401): verify_jwt não é autorização", async () => {
      const res = await callFunction("resetar-senha-colaborador", { colaborador_id: colabSemConta });
      const text = await res.text();
      assertEquals(res.status, 401, text);
    });

    await t.step("token inválido (401)", async () => {
      const res = await callFunction("resetar-senha-colaborador", { colaborador_id: colabSemConta }, "lixo");
      await res.text();
      assertEquals(res.status, 401);
    });

    await t.step("admin comum, não superadmin (403)", async () => {
      const res = await callFunction("resetar-senha-colaborador", { colaborador_id: colabSemConta }, tokenAdmin);
      const text = await res.text();
      assertEquals(res.status, 403, text);
    });

    await t.step("colaborador inexistente e id malformado (404)", async () => {
      for (const id of ["00000000-0000-0000-0000-000000000000", "nao-e-uuid"]) {
        const res = await callFunction("resetar-senha-colaborador", { colaborador_id: id }, tokenSA);
        const text = await res.text();
        assertEquals(res.status, 404, `${id}: ${text}`);
      }
    });

    await t.step("sem conta → 409 nomeando a providência, e nada na trilha", async () => {
      const res = await callFunction("resetar-senha-colaborador", { colaborador_id: colabSemConta }, tokenSA);
      const text = await res.text();
      assertEquals(res.status, 409, text);
      assert(JSON.parse(text).error.includes("Estou sem minha senha"));
      assertEquals((await linhasDeTrilha(colabSemConta)).length, 0);
    });

    await t.step("a própria conta → 409, e a senha dele não muda", async () => {
      const colabDoSA = await criarColaborador(sa.id);
      const res = await callFunction("resetar-senha-colaborador", { colaborador_id: colabDoSA }, tokenSA);
      const text = await res.text();
      assertEquals(res.status, 409, text);
      assertEquals((await linhasDeTrilha(colabDoSA)).length, 0);
      const { error } = await anonClient().auth.signInWithPassword({ email: sa.email!, password: "senha-forte-123" });
      assertEquals(error, null);
    });

    await t.step("VINCULADO → senha provisória vale, a antiga não, e a trilha registra quem fez", async () => {
      const email = `test_runner_reset_alvo_${Date.now()}@exemplo.com`;
      const senhaAntiga = "senha-antiga-da-pessoa-123";
      const alvo = await criarConta(email, senhaAntiga);
      const colabId = await criarColaborador(alvo.id);

      // Uma sessão aberta ANTES do reset (a de quem tinha a senha velha — inclusive um
      // invasor, se o reset é por conta comprometida).
      const { data: antes } = await anonClient().auth.signInWithPassword({ email, password: senhaAntiga });
      const refreshAntigo = antes.session!.refresh_token;

      const res = await callFunction("resetar-senha-colaborador", { colaborador_id: colabId }, tokenSA);
      const text = await res.text();
      assertEquals(res.status, 200, text);
      const body = JSON.parse(text);

      // 🔴 A sessão antiga morre com a troca. Quem faz isso é o GoTrue (updateUserById
      // com `password` revoga as sessões; medido em 2026-11-25 com controle: a mesma
      // chamada SEM password as mantém). A EF não revoga nada por conta própria — se
      // uma atualização do GoTrue mudar isso, é ESTE passo que avisa.
      const { error: refreshErr } = await anonClient().auth.refreshSession({ refresh_token: refreshAntigo });
      assertNotEquals(refreshErr, null);
      assertEquals(body.email, email);
      assertEquals(body.nome, NOME);
      assertEquals(typeof body.senha, "string");
      assertEquals(body.senha.length, 12);

      const { error: novaErr } = await anonClient().auth.signInWithPassword({ email, password: body.senha });
      assertEquals(novaErr, null);
      const { error: antigaErr } = await anonClient().auth.signInWithPassword({ email, password: senhaAntiga });
      assertNotEquals(antigaErr, null);

      const trilha = await linhasDeTrilha(colabId);
      assertEquals(trilha.length, 1);
      assertEquals(trilha[0].alvo_user_id, alvo.id);
      assertEquals(trilha[0].alvo_email, email);
      assertEquals(trilha[0].executado_por, sa.id);
      assertEquals(trilha[0].colab_nome, NOME);

      // Duas chamadas, duas senhas diferentes, duas linhas.
      const res2 = await callFunction("resetar-senha-colaborador", { colaborador_id: colabId }, tokenSA);
      const body2 = JSON.parse(await res2.text());
      assertEquals(res2.status, 200);
      assertNotEquals(body2.senha, body.senha);
      assertEquals((await linhasDeTrilha(colabId)).length, 2);
    });
  } finally {
    for (const id of colaboradores) {
      await admin.from("log_reset_senha").delete().eq("colaborador_id", id);
      await admin.from("colaboradores").delete().eq("id", id);
    }
    for (const id of contas) {
      await admin.from("user_roles").delete().eq("user_id", id);
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }
});
