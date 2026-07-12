import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MetaColaborador {
  id: string;
  prova_unidade_id: string;
  funcao_id: string;
  quantidade_meta: number;
  created_at: string | null;
  updated_at: string | null;
}

export function useMetaColaboradoresUnidade(provaUnidadeId: string) {
  const queryClient = useQueryClient();

  const { data: metas = [], isLoading } = useQuery({
    queryKey: ["meta_colaboradores_unidade", provaUnidadeId],
    queryFn: async () => {
      if (!provaUnidadeId) return [];
      
      const { data, error } = await supabase
        .from("meta_colaboradores_unidade")
        .select("*")
        .eq("prova_unidade_id", provaUnidadeId);
      
      if (error) throw error;
      return data as MetaColaborador[];
    },
    enabled: !!provaUnidadeId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (items: { funcao_id: string; quantidade_meta: number }[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const upsertData = items.map(item => ({
        prova_unidade_id: provaUnidadeId,
        funcao_id: item.funcao_id,
        quantidade_meta: item.quantidade_meta,
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from("meta_colaboradores_unidade")
        .upsert(upsertData, {
          onConflict: "prova_unidade_id,funcao_id",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta_colaboradores_unidade", provaUnidadeId] });
      toast.success("Metas de colaboradores salvas com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar metas: " + error.message);
    },
  });

  return {
    metas,
    isLoading,
    upsertMetas: upsertMutation.mutate,
    isUpserting: upsertMutation.isPending,
  };
}
