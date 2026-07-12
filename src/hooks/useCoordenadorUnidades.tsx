import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useCoordenadorUnidades() {
  const { user, isCoordenador } = useAuth();

  const query = useQuery({
    queryKey: ["coordenador-prova-unidades", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get prova_unidade_ids from the function
      const { data: unidadeIds, error: idsError } = await supabase.rpc(
        "get_coordenador_prova_unidade_ids",
        { p_user_id: user.id }
      );

      if (idsError) throw idsError;
      if (!unidadeIds || unidadeIds.length === 0) return [];

      // Get full prova_unidade data
      const { data, error } = await supabase
        .from("prova_unidades")
        .select(`
          id,
          prova_id,
          unidade_id,
          unidades_prova (
            id,
            unid_nome,
            unid_sigla
          )
        `)
        .in("id", unidadeIds);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && isCoordenador,
  });

  // Get unique prova_ids the coordinator has access to
  const provaIds = [...new Set(query.data?.map((pu) => pu.prova_id) || [])];

  // Get prova_unidade_ids
  const provaUnidadeIds = query.data?.map((pu) => pu.id) || [];

  return {
    provaUnidades: query.data ?? [],
    provaIds,
    provaUnidadeIds,
    isLoading: query.isLoading,
    error: query.error,
  };
}
