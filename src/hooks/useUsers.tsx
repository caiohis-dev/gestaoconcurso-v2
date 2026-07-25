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
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;

        // Se removendo coordenador, remover também os acessos às provas
        if (role === "coordenador") {
          const { error: coordError } = await supabase
            .from("coordenadores_prova")
            .delete()
            .eq("user_id", userId);
          if (coordError) throw coordError;
        }
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

  const addCoordenadorAccess = useMutation({
    mutationFn: async ({ userId, provaId }: { userId: string; provaId: string }) => {
      // Primeiro, verificar se o usuário já tem a role de coordenador
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "coordenador")
        .maybeSingle();

      // Se não tem, adicionar a role
      if (!existingRole) {
        const { error: roleError } = await supabase.from("user_roles").insert({
          user_id: userId,
          role: "coordenador",
        });
        if (roleError) throw roleError;
      }

      // Verificar se já tem acesso a essa prova
      const { data: existingAccess } = await supabase
        .from("coordenadores_prova")
        .select("id")
        .eq("user_id", userId)
        .eq("prova_id", provaId)
        .maybeSingle();

      if (existingAccess) {
        throw new Error("Este usuário já tem acesso de coordenador nesta prova.");
      }

      // Buscar uma unidade da prova para vincular
      const { data: provaUnidade, error: unidadeError } = await supabase
        .from("prova_unidades")
        .select("id")
        .eq("prova_id", provaId)
        .limit(1)
        .maybeSingle();

      if (unidadeError || !provaUnidade) {
        throw new Error("Esta prova não possui unidades vinculadas. Adicione uma unidade primeiro.");
      }

      // Buscar um colaboradores_prova existente ou criar um
      const { data: existingColabProva } = await supabase
        .from("colaboradores_prova")
        .select("id")
        .eq("prova_unidade_id", provaUnidade.id)
        .limit(1)
        .maybeSingle();

      let colaboradorProvaId = existingColabProva?.id;

      if (!colaboradorProvaId) {
        // Buscar qualquer colaborador para criar o vínculo
        const { data: anyColab } = await supabase
          .from("colaboradores")
          .select("id")
          .limit(1)
          .maybeSingle();

        if (!anyColab) {
          throw new Error("Não há colaboradores cadastrados. Cadastre um colaborador primeiro.");
        }

        // Criar colaboradores_prova entry
        const { data: newColabProva, error: colabProvaError } = await supabase
          .from("colaboradores_prova")
          .insert({
            prova_unidade_id: provaUnidade.id,
            colaborador_id: anyColab.id,
          })
          .select("id")
          .single();

        if (colabProvaError) throw colabProvaError;
        colaboradorProvaId = newColabProva.id;
      }

      // Inserir no coordenadores_prova
      const { error: coordError } = await supabase
        .from("coordenadores_prova")
        .insert({
          user_id: userId,
          prova_id: provaId,
          colaborador_prova_id: colaboradorProvaId,
        });

      if (coordError) throw coordError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-coordenador-provas"] });
      toast({
        title: "Acesso de coordenador adicionado",
        description: "O usuário agora tem acesso à prova selecionada.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar acesso",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createUser = useMutation({
    mutationFn: async ({ 
      email, 
      password, 
      fullName, 
      role,
      provaId,
    }: { 
      email: string; 
      password: string; 
      fullName: string; 
      role: AppRole;
      provaId?: string;
    }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ email, password, fullName, role, provaId }),
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
    addCoordenadorAccess,
    userCoordenadorProvas,
  };
}
