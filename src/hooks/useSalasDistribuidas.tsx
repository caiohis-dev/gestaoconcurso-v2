import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SalaDistribuida {
  id: string;
  prova_id: string;
  sala_fk_unidade: string;
  sala_numero: number;
  sala_descricao: string | null;
  sala_capacidade: number;
  sala_andar: number | null;
  sala_andar_texto?: string | null;
  sala_fiscal_1: string | null;
  sala_fiscal_2: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export function useSalasDistribuidas(provaId: string, unidadeId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["salas_prova_distribuidas", provaId, unidadeId],
    queryFn: async () => {
      let queryBuilder = supabase
        .from("salas_prova_distribuidas")
        .select("*")
        .eq("prova_id", provaId)
        .order("sala_andar")
        .order("sala_numero");

      if (unidadeId) {
        queryBuilder = queryBuilder.eq("sala_fk_unidade", unidadeId);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as SalaDistribuida[];
    },
    enabled: !!provaId,
  });

  const updateSalasMutation = useMutation({
    mutationFn: async (salas: Partial<SalaDistribuida>[]) => {
      const updates = salas.map(async (sala) => {
        if (!sala.id) return null;
        
        const { error } = await supabase
          .from("salas_prova_distribuidas")
          .update({
            sala_numero: sala.sala_numero,
            sala_capacidade: sala.sala_capacidade,
            sala_descricao: sala.sala_descricao,
            sala_andar: sala.sala_andar,
            sala_fiscal_1: sala.sala_fiscal_1,
            sala_fiscal_2: sala.sala_fiscal_2,
          })
          .eq("id", sala.id);

        if (error) throw error;
        return sala;
      });

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova_distribuidas", provaId] });
      toast({
        title: "Alterações salvas",
        description: "As salas foram atualizadas com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addSalaMutation = useMutation({
    mutationFn: async (sala: {
      prova_id: string;
      sala_fk_unidade: string;
      sala_numero: number;
      sala_descricao: string | null;
      sala_andar: number | null;
      sala_capacidade: number;
    }) => {
      const { data, error } = await supabase
        .from("salas_prova_distribuidas")
        .insert(sala)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova_distribuidas", provaId] });
      toast({
        title: "Sala adicionada",
        description: "A sala extra foi adicionada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar sala",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    salas: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    updateSalas: updateSalasMutation.mutate,
    isSaving: updateSalasMutation.isPending,
    addSala: addSalaMutation.mutate,
    isAddingSala: addSalaMutation.isPending,
  };
}

export function useSalasDistribuidasCapacidade(provaId: string, unidadeIds: string[]) {
  return useQuery({
    queryKey: ["salas_prova_distribuidas_capacidade", provaId, unidadeIds],
    queryFn: async () => {
      if (unidadeIds.length === 0) return {};

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

export interface FiscalSala {
  colaborador_prova_id: string;
  colaborador_nome: string;
}

export function useFiscaisSala(provaId: string) {
  return useQuery({
    queryKey: ["fiscais_sala", provaId],
    queryFn: async () => {
      // First get all prova_unidades for this prova
      const { data: provaUnidades, error: puError } = await supabase
        .from("prova_unidades")
        .select("id")
        .eq("prova_id", provaId);

      if (puError) throw puError;

      if (!provaUnidades || provaUnidades.length === 0) return [];

      const provaUnidadeIds = provaUnidades.map((pu) => pu.id);

      // Get colaboradores_prova with funcao "fiscal de sala" for this prova
      const { data, error } = await supabase
        .from("colaboradores_prova")
        .select(`
          id,
          colaborador_id,
          funcao_id,
          colaboradores!inner(colab_nome_completo),
          funcoes_colaboradores!inner(cargo_nome)
        `)
        .in("prova_unidade_id", provaUnidadeIds);

      if (error) throw error;

      // Filter only "fiscal de sala" function (case insensitive)
      const fiscais = data?.filter((cp) => {
        const funcao = (cp.funcoes_colaboradores as any)?.cargo_nome?.toLowerCase() || "";
        return funcao.includes("fiscal") && funcao.includes("sala");
      }) || [];

      return fiscais.map((f) => ({
        colaborador_prova_id: f.id,
        colaborador_nome: (f.colaboradores as any)?.colab_nome_completo || "Sem nome",
      })) as FiscalSala[];
    },
    enabled: !!provaId,
  });
}
