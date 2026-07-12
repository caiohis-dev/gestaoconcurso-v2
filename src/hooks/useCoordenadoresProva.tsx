import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CoordenadorProva {
  id: string;
  colaborador_prova_id: string;
  user_id: string;
  prova_id: string;
  created_at: string | null;
  created_by: string | null;
  colaboradores_prova?: {
    id: string;
    colaborador_id: string;
    funcao_id: string | null;
    colaboradores?: {
      id: string;
      colab_nome_completo: string;
      colab_cpf: string;
      colab_email: string | null;
    };
    funcoes_colaboradores?: {
      id: string;
      cargo_nome: string;
    };
  };
}

export interface CoordenadorProvaInsert {
  colaborador_prova_id: string;
  user_id: string;
  prova_id: string;
}

// IDs das funções de coordenação (Coordenador Geral e Auxiliar de Coordenação)
const FUNCOES_COORDENACAO = [
  "11a310e5-0fce-46f2-8ad7-769a5e5d7f89", // Coordenador Geral
  "8d36ef0f-becb-45f3-837b-04eea15489fb", // Auxiliar de Coordenação
];

export function useCoordenadoresProva(provaId: string, provaUnidadeId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all coordenadores for this prova
  const { data: coordenadores = [], isLoading } = useQuery({
    queryKey: ["coordenadores-prova", provaId],
    queryFn: async () => {
      if (!provaId) return [];

      const { data, error } = await supabase
        .from("coordenadores_prova")
        .select(`
          *,
          colaboradores_prova!inner (
            id,
            colaborador_id,
            funcao_id,
            colaboradores (
              id,
              colab_nome_completo,
              colab_cpf,
              colab_email
            ),
            funcoes_colaboradores (
              id,
              cargo_nome
            )
          )
        `)
        .eq("prova_id", provaId);

      if (error) throw error;
      return data as CoordenadorProva[];
    },
    enabled: !!provaId,
  });

  // Fetch colaboradores elegíveis (Coordenador Geral ou Auxiliar de Coordenação)
  const { data: colaboradoresElegiveis = [], isLoading: isLoadingElegiveis } = useQuery({
    queryKey: ["colaboradores-elegiveis-coordenacao", provaId, provaUnidadeId],
    queryFn: async () => {
      if (!provaId) return [];

      // Build query for colaboradores_prova with coordenação functions
      let query = supabase
        .from("colaboradores_prova")
        .select(`
          id,
          colaborador_id,
          funcao_id,
          prova_unidade_id,
          colaboradores (
            id,
            colab_nome_completo,
            colab_cpf,
            colab_email
          ),
          funcoes_colaboradores (
            id,
            cargo_nome
          ),
          prova_unidades!inner (
            prova_id
          )
        `)
        .eq("prova_unidades.prova_id", provaId)
        .in("funcao_id", FUNCOES_COORDENACAO);

      // Filter by specific prova_unidade if provided
      if (provaUnidadeId) {
        query = query.eq("prova_unidade_id", provaUnidadeId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    enabled: !!provaId,
  });

  // Get colaboradores that already have coordinator access
  const coordenadoresIds = coordenadores.map((c) => c.colaborador_prova_id);

  // Filter to only show eligible colaboradores not yet with access
  const colaboradoresDisponiveis = colaboradoresElegiveis.filter(
    (c) => !coordenadoresIds.includes(c.id)
  );

  // Create coordenador access
  const createMutation = useMutation({
    mutationFn: async (data: CoordenadorProvaInsert) => {
      const { data: result, error } = await supabase
        .from("coordenadores_prova")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coordenadores-prova", provaId] });
      toast({
        title: "Acesso concedido",
        description: "O colaborador agora tem acesso como Coordenador.",
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

  // Remove coordenador access
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First get the user_id to remove the role
      const { data: coordenador } = await supabase
        .from("coordenadores_prova")
        .select("user_id")
        .eq("id", id)
        .single();

      // Delete the coordenador_prova record
      const { error } = await supabase
        .from("coordenadores_prova")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Check if user has other coordenador assignments
      if (coordenador?.user_id) {
        const { data: otherAssignments } = await supabase
          .from("coordenadores_prova")
          .select("id")
          .eq("user_id", coordenador.user_id);

        // If no other assignments, remove the coordenador role
        if (!otherAssignments || otherAssignments.length === 0) {
          await supabase
            .from("user_roles")
            .delete()
            .eq("user_id", coordenador.user_id)
            .eq("role", "coordenador");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coordenadores-prova", provaId] });
      toast({
        title: "Acesso removido",
        description: "O acesso do coordenador foi removido com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover acesso",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    coordenadores,
    colaboradoresDisponiveis,
    isLoading: isLoading || isLoadingElegiveis,
    create: createMutation.mutate,
    delete: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
