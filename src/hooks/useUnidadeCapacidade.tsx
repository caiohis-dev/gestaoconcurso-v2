import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UnidadeCapacidade {
  unidade_id: string;
  capacidade_total: number;
}

export function useUnidadeCapacidade(provaId: string, unidadeIds: string[]) {
  return useQuery({
    queryKey: ["unidade_capacidade", provaId, unidadeIds],
    queryFn: async () => {
      if (!provaId || unidadeIds.length === 0) return {};

      const { data, error } = await supabase
        .from("salas_prova_distribuidas")
        .select("sala_fk_unidade, sala_capacidade")
        .eq("prova_id", provaId)
        .in("sala_fk_unidade", unidadeIds);

      if (error) throw error;

      const capacidadePorUnidade: Record<string, number> = {};
      
      data?.forEach((sala) => {
        const unidadeId = sala.sala_fk_unidade;
        capacidadePorUnidade[unidadeId] = (capacidadePorUnidade[unidadeId] || 0) + sala.sala_capacidade;
      });

      return capacidadePorUnidade;
    },
    enabled: !!provaId && unidadeIds.length > 0,
  });
}
