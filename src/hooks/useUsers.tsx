import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type AppRole = "admin" | "user" | "coordenador" | "superadmin";

export interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  roles: AppRole[];
}

export function useUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Map roles to users
      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const userRoles = (roles || [])
          .filter((r) => r.user_id === profile.id)
          .map((r) => r.role as AppRole);

        return {
          id: profile.id,
          email: profile.email || "",
          full_name: profile.full_name,
          created_at: profile.created_at || "",
          roles: userRoles.length > 0 ? userRoles : ["user"],
        };
      });

      return usersWithRoles;
    },
  });

  // Query para buscar as provas dos coordenadores
  const { data: userCoordenadorProvas = {} } = useQuery({
    queryKey: ["user-coordenador-provas"],
    queryFn: async () => {
      const { data: coordenadoresProva, error: coordError } = await supabase
        .from("coordenadores_prova")
        .select(`
          user_id,
          prova_id,
          provas:prova_id (
            editais:edital_id (
              nome
            )
          )
        `);

      if (coordError) throw coordError;

      // Agrupar por user_id
      const provasByUser: Record<string, string[]> = {};
      
      (coordenadoresProva || []).forEach((cp) => {
        if (!provasByUser[cp.user_id]) {
          provasByUser[cp.user_id] = [];
        }
        const provaEdital = (cp.provas as any)?.editais?.nome;
        if (provaEdital && !provasByUser[cp.user_id].includes(provaEdital)) {
          provasByUser[cp.user_id].push(provaEdital);
        }
      });

      return provasByUser;
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role, action }: { userId: string; role: AppRole; action: "add" | "remove" }) => {
      if (action === "add") {
        const { error } = await supabase.from("user_roles").insert({
          user_id: userId,
          role,
        });
        if (error) throw error;
      } else if (role === "coordenador") {
        // Uma transação só. Antes eram dois DELETEs soltos, e falhar no segundo deixava
        // o papel removido da tela com o ACESSO REAL de pé — `is_coordenador_prova`
        // consulta apenas `coordenadores_prova` e nunca olha `user_roles`.
        // Ver a migration 20260726160000.
        const { error } = await supabase.rpc("revogar_coordenador", { p_user_id: userId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-coordenador-provas"] });
      toast({
        title: "Permissão atualizada",
        description: variables.action === "add" 
          ? `Permissão "${variables.role}" adicionada.`
          : `Permissão "${variables.role}" removida.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar permissão",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // `addCoordenadorAccess` foi REMOVIDO em 2026-07-26, junto com a concessão de
  // coordenador pela UI de /gerenciar-usuarios. Ele fabricava uma linha em
  // `colaboradores_prova` — a tabela de alocação real, base do pagamento — pegando
  // um colaborador arbitrário (`.limit(1)`) só para satisfazer a FK NOT NULL de
  // `coordenadores_prova`. A concessão passou a ser exclusiva do
  // CoordenadoresProvaDialog, que exige alocação de verdade com função de coordenação.
  //
  // ✅ A cópia da EF `create-admin` também foi apagada em 2026-07-26, e a EF passou a
  // RECUSAR role "coordenador" com 400. Não existe mais caminho que fabrique alocação.

  const createUser = useMutation({
    mutationFn: async ({ 
      email, 
      password, 
      fullName, 
      role,
    }: { 
      email: string; 
      password: string; 
      fullName: string; 
      role: AppRole;
    }) => {
      // Manda o token DA SESSÃO, não a anon key. A `create-admin` cria conta e concede
      // papel com service_role (inclusive superadmin) e, desde 2026-07-25, exige que o
      // chamador seja superadmin — o que só é verificável se o JWT identificar uma
      // pessoa. A anon key é um JWT válido mas anônimo e público: mandá-la aqui era o
      // que permitia a qualquer um criar um superadmin.
      const { data: sessao } = await supabase.auth.getSession();
      const accessToken = sessao.session?.access_token;
      if (!accessToken) {
        throw new Error("Sessão expirada. Entre novamente para criar usuários.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // A `apikey` continua sendo a pública — é o que identifica o PROJETO no
            // gateway. Quem identifica a PESSOA é o Authorization.
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ email, password, fullName, role }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Erro ao criar usuário");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-coordenador-provas"] });
      toast({
        title: "Usuário criado",
        description: "O novo usuário foi cadastrado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar usuário",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    users,
    isLoading,
    error,
    updateRole,
    createUser,
    userCoordenadorProvas,
  };
}
