import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { forgeToken, callFunction, getAdminClient } from "../_shared/test-utils.ts";

Deno.test("create-admin Edge Function Autorização", async (t) => {
  const supabaseAdmin = getAdminClient();
  let testUserId: string | undefined;

  // Cleanup block para remover o usuário criado nos testes de sucesso (A5, A6)
  const cleanup = async () => {
    if (testUserId) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", testUserId);
      await supabaseAdmin.auth.admin.deleteUser(testUserId);
      testUserId = undefined;
    }
  };

  const getCounts = async () => {
    const { count: countColab } = await supabaseAdmin
      .from("colaboradores_prova")
      .select("*", { count: "exact", head: true });
    const { count: countCoord } = await supabaseAdmin
      .from("coordenadores_prova")
      .select("*", { count: "exact", head: true });
    return { countColab, countCoord };
  };

  let superadminUser: any;
  let normalAdminUser: any;

  await t.step("Setup temporário: Cria superadmin e admin reais", async () => {
    // Cria superadmin
    const { data: { user: saUser }, error: saErr } = await supabaseAdmin.auth.admin.createUser({
      email: "test_runner_superadmin@exemplo.com",
      password: "senha-forte-123",
      email_confirm: true,
    });
    if (saErr) throw saErr;
    superadminUser = saUser;
    await supabaseAdmin.from("user_roles").insert({
      user_id: superadminUser.id,
      role: "superadmin",
    });

    // Cria admin comum
    const { data: { user: aUser }, error: aErr } = await supabaseAdmin.auth.admin.createUser({
      email: "test_runner_admin@exemplo.com",
      password: "senha-forte-123",
      email_confirm: true,
    });
    if (aErr) throw aErr;
    normalAdminUser = aUser;
    await supabaseAdmin.from("user_roles").insert({
      user_id: normalAdminUser.id,
      role: "admin",
    });
  });

  const getSuperToken = () => forgeToken({ sub: superadminUser.id, email: superadminUser.email });
  const getAdminToken = () => forgeToken({ sub: normalAdminUser.id, email: normalAdminUser.email });

  await t.step("A1 - Anon Key crua pedindo superadmin (401)", async () => {
    const res = await callFunction("create-admin", {
      email: "lixo@test.com", password: "123", fullName: "Lixo", role: "superadmin",
    });
    const text = await res.text();
    assertEquals(res.status, 401, text);
    assertEquals(JSON.parse(text).error, "Não autenticado");
  });

  await t.step("A3 - Token inválido (lixo) pedindo admin (401)", async () => {
    const res = await callFunction(
      "create-admin",
      { email: "lixo@test.com", password: "123", fullName: "Lixo", role: "admin" },
      "lixo-token"
    );
    assertEquals(res.status, 401);
  });

  await t.step("A4 - Admin comum (NÃO superadmin) pedindo admin (403)", async () => {
    const token = await getAdminToken();
    const res = await callFunction(
      "create-admin",
      { email: "lixo@test.com", password: "123", fullName: "Lixo", role: "admin" },
      token
    );
    const text = await res.text();
    assertEquals(res.status, 403, text);
    assertEquals(JSON.parse(text).error, "Só um superadmin pode criar usuários.");
  });

  await t.step("A5 - Superadmin criando admin (200)", async () => {
    const token = await getSuperToken();
    const emailToCreate = `novo_admin_${Date.now()}@exemplo.com`;
    const res = await callFunction(
      "create-admin",
      { email: emailToCreate, password: "123", fullName: "Novo Admin", role: "admin" },
      token
    );
    const text = await res.text();
    assertEquals(res.status, 200, text);
    const body = JSON.parse(text);
    assertEquals(body.success, true);
    assertNotEquals(body.userId, undefined);
    
    testUserId = body.userId;
    
    const { data: roleData } = await supabaseAdmin.from("user_roles").select("*").eq("user_id", testUserId);
    const roles = roleData?.map(r => r.role) || [];
    assertEquals(roles.includes("admin"), true);
    
    await cleanup();
  });

  await t.step("A6 - Superadmin criando superadmin (200)", async () => {
    const token = await getSuperToken();
    const emailToCreate = `novo_super_${Date.now()}@exemplo.com`;
    const res = await callFunction(
      "create-admin",
      { email: emailToCreate, password: "123", fullName: "Novo Super", role: "superadmin" },
      token
    );
    const text = await res.text();
    assertEquals(res.status, 200, text);
    const body = JSON.parse(text);
    testUserId = body.userId;
    
    const { data: roleData } = await supabaseAdmin.from("user_roles").select("*").eq("user_id", testUserId);
    const roles = roleData?.map(r => r.role) || [];
    assertEquals(roles.includes("superadmin"), true);
    
    await cleanup();
  });

  await t.step("A9 e A10 - Coordenador (Fabricação de Alocação barrada) (400)", async () => {
    const token = await getSuperToken();
    const countsAntes = await getCounts();

    const res = await callFunction(
      "create-admin",
      { email: "tentativa_coord@exemplo.com", password: "123", role: "coordenador" },
      token
    );
    const text = await res.text();
    assertEquals(res.status, 400, text);
    
    const body = JSON.parse(text);
    assertEquals(body.error.includes("Acesso de coordenador não é concedido aqui"), true);

    const countsDepois = await getCounts();
    assertEquals(countsAntes.countColab, countsDepois.countColab);
    assertEquals(countsAntes.countCoord, countsDepois.countCoord);
  });

  await t.step("Teardown temporário: Apaga o superadmin e o admin do teste", async () => {
    if (superadminUser) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", superadminUser.id);
      await supabaseAdmin.auth.admin.deleteUser(superadminUser.id);
    }
    if (normalAdminUser) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", normalAdminUser.id);
      await supabaseAdmin.auth.admin.deleteUser(normalAdminUser.id);
    }
  });
});
