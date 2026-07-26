import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create regular client to verify the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user is authenticated and is an admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Exige admin — e via `has_role` (RPC), NÃO por SELECT em `user_roles`.
    //
    // Por que isto foi trocado em 2026-07-26: a checagem anterior era
    // `.eq("role", "admin")`, match literal na tabela. Um superadmin não tem linha
    // `admin` em `user_roles` (a `create-admin` insere só o papel escolhido), então
    // levava 403 e NÃO CONSEGUIA conceder acesso de coordenador — sendo que este é o
    // caminho canônico da concessão. A hierarquia (superadmin ⇒ admin) vive dentro do
    // `has_role` desde a migration 20260725195530, e consultar a tabela direto contorna
    // a regra. Mesma classe de falha já corrigida na `send-email` e na `create-admin`.
    const { data: ehAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError) {
      console.error("Role check error:", roleError);
      return new Response(
        JSON.stringify({ error: "Falha ao verificar permissão" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ehAdmin) {
      return new Response(
        JSON.stringify({ error: "Only admins can create coordinators" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { email, password, fullName, colaboradorProvaId, provaId, colaboradorId } = await req.json();

    if (!email || !password || !colaboradorProvaId || !provaId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Creating user for coordinator:", { email, colaboradorProvaId, provaId });

    let newUserId: string;
    let isExistingUser = false;

    // First, check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      console.log("User already exists, reusing:", existingUser.id);
      newUserId = existingUser.id;
      isExistingUser = true;

      // Check if this user already has coordinator access to this specific prova
      const { data: existingCoord } = await supabaseAdmin
        .from("coordenadores_prova")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("prova_id", provaId)
        .single();

      if (existingCoord) {
        return new Response(
          JSON.stringify({ error: "Este coordenador já possui acesso a esta prova." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update user metadata for existing user (without touching the password)
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        user_metadata: {
          full_name: fullName || existingUser.user_metadata?.full_name || "",
        },
      });

      if (updateError) {
        console.error("Error updating user password:", updateError);
      }
    } else {
      // Create the user using admin API (doesn't affect current session)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || "",
        },
      });

      if (authError) {
        console.error("Error creating user:", authError);
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!authData.user) {
        return new Response(
          JSON.stringify({ error: "Failed to create user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      newUserId = authData.user.id;
      console.log("User created successfully:", newUserId);
    }

    // Insert coordenador role
    const { error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUserId,
        role: "coordenador",
      });

    if (roleInsertError && !roleInsertError.message.includes("duplicate")) {
      console.error("Error inserting role:", roleInsertError);
    }

    // Insert coordenadores_prova record
    const { error: coordError } = await supabaseAdmin
      .from("coordenadores_prova")
      .insert({
        colaborador_prova_id: colaboradorProvaId,
        user_id: newUserId,
        prova_id: provaId,
        created_by: user.id,
      });

    if (coordError) {
      console.error("Error inserting coordenadores_prova:", coordError);
      // Rollback: delete the created user
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Failed to create coordinator record: " + coordError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update colaborador email if provided
    if (colaboradorId && email) {
      await supabaseAdmin
        .from("colaboradores")
        .update({ colab_email: email })
        .eq("id", colaboradorId)
        .is("colab_email", null);
    }

    console.log("Coordinator created successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: newUserId,
        message: "Coordenador criado com sucesso" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
