import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface UnidadeProva {
  id: string;
  unid_nome: string;
  unid_sigla: string;
  unid_andares: number;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface UnidadeProvaInsert {
  unid_nome: string;
  unid_sigla: string;
  unid_andares: number;
}

export interface UnidadeProvaUpdate {
  unid_nome?: string;
  unid_sigla?: string;
  unid_andares?: number;
}

export function useUnidadesProva() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["unidades_prova"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades_prova")
        .select("*")
        .order("unid_nome");

      if (error) throw error;
      return data as UnidadeProva[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (unidade: UnidadeProvaInsert) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("unidades_prova")
        .insert({
          ...unidade,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unidades_prova"] });
      toast({
        title: "Unidade criada",
        description: "A unidade de prova foi criada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar unidade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UnidadeProvaUpdate }) => {
      const { data: result, error } = await supabase
        .from("unidades_prova")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unidades_prova"] });
      toast({
        title: "Unidade atualizada",
        description: "A unidade de prova foi atualizada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar unidade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("unidades_prova")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unidades_prova"] });
      toast({
        title: "Unidade excluída",
        description: "A unidade de prova foi excluída com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir unidade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    unidades: query.data ?? [],
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
