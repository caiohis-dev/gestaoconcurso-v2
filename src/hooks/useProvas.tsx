import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// O nome do edital vem do join com `editais` (edital_id). `prova_edital` (CHAR30) ainda
// existe no banco e é escrito como cópia denormalizada durante a transição, até ser
// dropado num passo posterior; os consumidores devem ler `editais?.nome`.
export interface EditalDaProva {
  nome: string;
  n_candidatos: number | null;
  cabecalho_linha1: string | null;
  cabecalho_linha2: string | null;
}

export interface Prova {
  id: string;
  prova_edital: string;
  edital_id: string | null;
  prova_data: string | null;
  prova_hora_inicio: string | null;
  prova_hora_final: string | null;
  prova_n_candidatos: number | null;
  prova_finalizada: boolean;
  finalizada_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  prova_cabecalho_linha1: string | null;
  prova_cabecalho_linha2: string | null;
  editais?: EditalDaProva | null;
  profiles?: {
    full_name: string | null;
  } | null;
}

export interface ProvaInsert {
  edital_id: string;
  // Cópia denormalizada do nome do edital, só para satisfazer o NOT NULL de
  // prova_edital enquanto a coluna não é dropada. Fonte de verdade é edital_id.
  prova_edital: string;
  prova_data?: string | null;
  prova_hora_inicio?: string | null;
  prova_hora_final?: string | null;
  prova_n_candidatos?: number | null;
  prova_cabecalho_linha1?: string | null;
  prova_cabecalho_linha2?: string | null;
}

export interface ProvaUpdate {
  edital_id?: string;
  prova_edital?: string;
  prova_data?: string | null;
  prova_hora_inicio?: string | null;
  prova_hora_final?: string | null;
  prova_n_candidatos?: number | null;
  prova_cabecalho_linha1?: string | null;
  prova_cabecalho_linha2?: string | null;
}

export function useProvas() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["provas"],
    queryFn: async () => {
      const { data: provasData, error } = await supabase
        .from("provas")
        .select("*, editais(nome, n_candidatos, cabecalho_linha1, cabecalho_linha2)")
        .order("prova_data", { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Fetch creator names for provas with created_by
      const creatorIds = [...new Set(provasData.filter(p => p.created_by).map(p => p.created_by!))];
      
      let profilesMap: Record<string, string | null> = {};
      if (creatorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);
        
        if (profilesData) {
          profilesMap = profilesData.reduce((acc, p) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {} as Record<string, string | null>);
        }
      }

      return provasData.map(prova => ({
        ...prova,
        profiles: prova.created_by ? { full_name: profilesMap[prova.created_by] ?? null } : null,
      })) as Prova[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (prova: ProvaInsert) => {
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("provas")
        .insert({
          ...prova,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provas"] });
      toast({
        title: "Prova criada",
        description: "A prova foi criada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar prova",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProvaUpdate }) => {
      const { data: result, error } = await supabase
        .from("provas")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provas"] });
      toast({
        title: "Prova atualizada",
        description: "A prova foi atualizada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar prova",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("provas").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provas"] });
      toast({
        title: "Prova excluída",
        description: "A prova foi excluída com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir prova",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    provas: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: createMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
