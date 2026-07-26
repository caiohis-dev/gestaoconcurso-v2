import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ─── Quem está chamando? (fechado em 2026-07-25) ──────────────────────────
    // Esta função cria conta no Auth e concede papel com `service_role`, aceitando
    // `role` do corpo — inclusive "superadmin". Até esta data ela NÃO checava nada:
    // o `verify_jwt` padrão do Supabase era o único portão, e ele **não é controle
    // de acesso** — a anon key é um JWT válido e é PÚBLICA (vai no bundle do
    // frontend). Pior: o próprio `useUsers.createUser` mandava a anon key como
    // Authorization. Na prática, qualquer um com aquela chave criava um superadmin.
    //
    // É a mesma falha fechada na `send-email` em 2026-07-20; aqui a consequência era
    // maior. O padrão abaixo é o mesmo da `corrigir-email-acesso`.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp({ error: "Não autenticado" }, 401);
    }

    const supabaseCaller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await supabaseCaller.auth.getUser();
    // A anon key crua cai aqui: ela é um JWT sem usuário, então `getUser` não devolve
    // ninguém. É exatamente o buraco que este bloco fecha.
    if (callerErr || !caller) {
      return jsonResp({ error: "Não autenticado" }, 401);
    }

    // Exige superadmin, não admin. A única porta para esta função é a página
    // `/gerenciar-usuarios`, cujo guard já é `isSuperAdmin` — então isto espelha a UI
    // em vez de afrouxá-la. E é o mínimo defensável: quem cria conta aqui pode criar
    // um superadmin, ou seja, pode se replicar.
    //
    // Via `has_role` (RPC), não por SELECT em `user_roles`: a hierarquia
    // (superadmin ⇒ admin) vive dentro daquela função desde a migration
    // 20260725195530, e consultar a tabela direto contorna a regra.
    const { data: ehSuperadmin, error: papelErr } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "superadmin",
    });
    if (papelErr) {
      console.error("Falha ao verificar permissão do chamador:", papelErr);
      return jsonResp({ error: "Falha ao verificar permissão" }, 500);
    }
    if (!ehSuperadmin) {
      return jsonResp({ error: "Só um superadmin pode criar usuários." }, 403);
    }
    // ──────────────────────────────────────────────────────────────────────────

    const { email, password, fullName, role = "admin" } = await req.json();

    if (!email || !password) {
      return jsonResp({ error: "Email e senha são obrigatórios" }, 400);
    }

    // `coordenador` saiu daqui em 2026-07-26, junto com a concessão pela UI.
    //
    // POR QUE RECUSAR EM VEZ DE SÓ IGNORAR: o papel sozinho NÃO é inofensivo. O
    // `RequireAcesso` deriva `isCoordenador` de `user_roles`, então quem recebe só o
    // papel passa pelos guards das rotas de coordenação e entra — para ver listas
    // vazias, porque as consultas se apoiam em `coordenadores_prova`, que estaria vazia.
    // É exatamente o meio-usuário que levou a fabricar alocação falsa aqui.
    //
    // E recusa explícita, não rebaixamento silencioso: cair no `else` e criar a conta
    // como "user" produziria papel errado sem sinal nenhum.
    const validRoles = ["admin", "user", "superadmin"];
    if (role === "coordenador") {
      return jsonResp(
        {
          error:
            "Acesso de coordenador não é concedido aqui. Aloque a pessoa na prova com função de coordenação e conceda pelo painel da prova.",
        },
        400,
      );
    }
    const selectedRole = validRoles.includes(role) ? role : "user";

    // Create user with admin API
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0] },
    });

    if (createError) {
      // If user already exists, update password
      if (createError.message.includes("already been registered")) {
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u) => u.email === email);
        
        if (existingUser) {
          await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
            password,
            email_confirm: true,
          });
          
          // Ensure role exists
          const { data: existingRoleData } = await supabaseAdmin
            .from("user_roles")
            .select("id")
            .eq("user_id", existingUser.id)
            .eq("role", selectedRole)
            .maybeSingle();

          if (!existingRoleData) {
            await supabaseAdmin.from("user_roles").insert({
              user_id: existingUser.id,
              role: selectedRole,
            });
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: `Usuário atualizado com permissão de ${selectedRole}`, 
              userId: existingUser.id 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      throw createError;
    }

    const userId = userData.user?.id;
    if (!userId) {
      throw new Error("Falha ao obter ID do usuário criado");
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: selectedRole,
    });

    if (roleError) {
      console.error("Error assigning role:", roleError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Usuário criado com sucesso como ${selectedRole}`, 
        userId 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
