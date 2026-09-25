import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { buscarEmFatias } from "@/lib/buscar-em-fatias";

export type AppRole = "admin" | "user" | "coordenador" | "superadmin" | "financeiro";

/** Os papéis que `conceder-papel-sistema` aceita. Coordenador é concedido pela prova. */
export const PAPEIS_SISTEMA = ["superadmin", "admin", "financeiro"] as const;
export type PapelSistema = (typeof PAPEIS_SISTEMA)[number];

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
      // 🔴 As três leituras vão EM FATIAS desde 2026-09-24: o PostgREST corta em `max_rows`
      // (1000) SEM ERRO. `user_roles` é a que dói — ~2 linhas por conta, e 526 colaboradores
      // prontos para reivindicar a sua. Cortada, ela esconderia papéis, e quem ficasse sem
      // linha nenhuma apareceria como "user" (ver o ramo abaixo): um admin exibido como
      // usuário comum. Cada consulta ordena por coluna ÚNICA, ou o laço repete e pula linhas.
      const profiles = await buscarEmFatias((de, ate) =>
        supabase
          .from("profiles")
          .select("id, email, full_name, created_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(de, ate),
      );

      const roles = await buscarEmFatias((de, ate) =>
        supabase
          .from("user_roles")
          .select("user_id, role")
          .order("id", { ascending: true })
          .range(de, ate),
      );

      // `profiles.full_name` só nasce preenchido quando a conta vem com nome nos metadados —
      // e a conta criada pelo convite de colaborador (generateLink) vem sem. Medido em
      // 2026-09-24: 40 de 58 contas sem nome no perfil, todas com nome no cadastro. O nome
      // de verdade é o do cadastro de colaborador, então é ele o reserva aqui.
      const colaboradores = await buscarEmFatias((de, ate) =>
        supabase
          .from("colaboradores")
          .select("user_id, colab_nome_completo")
          .not("user_id", "is", null)
          .order("id", { ascending: true })
          .range(de, ate),
      );

      const nomeDoCadastro = new Map(
        (colaboradores || []).map((c) => [c.user_id as string, c.colab_nome_completo as string]),
      );

      // Map roles to users
      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const userRoles = (roles || [])
          .filter((r) => r.user_id === profile.id)
          .map((r) => r.role as AppRole);

        return {
          id: profile.id,
          email: profile.email || "",
          full_name: profile.full_name?.trim() || nomeDoCadastro.get(profile.id) || null,
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
      // Em fatias pelo mesmo motivo — é a lista de TODAS as coordenações de todas as provas.
      const coordenadoresProva = await buscarEmFatias((de, ate) =>
        supabase
          .from("coordenadores_prova")
          .select(`
            user_id,
            prova_id,
            provas:prova_id (
              editais:edital_id (
                nome
              )
            )
          `)
          .order("id", { ascending: true })
          .range(de, ate),
      );

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

  // Conta de sistema nasce de COLABORADOR (2026-09-24). A EF deriva o e-mail do cadastro
  // e nunca recebe senha: vinculado ganha só o papel; sem conta recebe o convite e define
  // a própria senha. Substitui o "criar usuário" da `create-admin`, que sobrescrevia a
  // senha de quem já tinha conta.
  const concederPapelSistema = useMutation({
    mutationFn: async ({
      colaboradorId,
      role,
    }: {
      colaboradorId: string;
      role: PapelSistema;
    }): Promise<{ message: string; situacao: string }> => {
      // Manda o token DA SESSÃO, não a anon key. A EF concede papel com service_role
      // (inclusive superadmin) e exige que o chamador seja superadmin — o que só é
      // verificável se o JWT identificar uma pessoa. A anon key é um JWT válido mas
      // anônimo e público: mandá-la era o que permitia a qualquer um criar um superadmin.
      const { data: sessao } = await supabase.auth.getSession();
      const accessToken = sessao.session?.access_token;
      if (!accessToken) {
        throw new Error("Sessão expirada. Entre novamente para conceder acesso.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conceder-papel-sistema`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // A `apikey` continua sendo a pública — é o que identifica o PROJETO no
            // gateway. Quem identifica a PESSOA é o Authorization.
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ colaborador_id: colaboradorId, role }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao conceder acesso");
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores", "busca-acesso"] });
      // O papel entrou, mas o e-mail não saiu: é sucesso com providência, não erro —
      // desfazer a concessão não ajudaria ninguém.
      toast({
        title: data.situacao === "convite-falhou" ? "Acesso concedido — e-mail não enviado" : "Acesso concedido",
        description: data.message,
        variant: data.situacao === "convite-falhou" ? "destructive" : undefined,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao conceder acesso",
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
    concederPapelSistema,
    userCoordenadorProvas,
  };
}
