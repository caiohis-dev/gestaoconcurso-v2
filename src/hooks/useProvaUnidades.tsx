import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ProvaUnidade {
  id: string;
  prova_id: string;
  unidade_id: string;
  created_at: string | null;
  created_by: string | null;
}

export interface ProvaUnidadeWithDetails extends ProvaUnidade {
  unidades_prova: {
    id: string;
    unid_nome: string;
    unid_sigla: string;
  };
}

export function useProvaUnidades(provaId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["prova_unidades", provaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prova_unidades")
        .select(`
          *,
          unidades_prova (
            id,
            unid_nome,
            unid_sigla
          )
        `)
        .eq("prova_id", provaId)
        .order("created_at");

      if (error) throw error;
      return data as ProvaUnidadeWithDetails[];
    },
    enabled: !!provaId,
  });

  const addUnidadeMutation = useMutation({
    mutationFn: async (unidadeId: string) => {
      const { data: userData } = await supabase.auth.getUser();

      // 1. Inserir na prova_unidades
      const { data, error } = await supabase
        .from("prova_unidades")
        .insert({
          prova_id: provaId,
          unidade_id: unidadeId,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Buscar salas da unidade
      const { data: salas, error: salasError } = await supabase
        .from("sala_prova")
        .select("*")
        .eq("sala_fk_unidade", unidadeId);

      if (salasError) throw salasError;

      // 3. Copiar salas para salas_prova_distribuidas
      if (salas && salas.length > 0) {
        const salasDistribuidas = salas.map((sala) => ({
          prova_id: provaId,
          sala_fk_unidade: sala.sala_fk_unidade,
          sala_numero: sala.sala_numero,
          sala_descricao: sala.sala_descricao,
          sala_capacidade: sala.sala_capacidade,
          sala_andar: sala.sala_andar,
          created_by: userData.user?.id,
        }));

        const { error: insertError } = await supabase
          .from("salas_prova_distribuidas")
          .insert(salasDistribuidas);

        if (insertError) throw insertError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prova_unidades", provaId] });
      queryClient.invalidateQueries({ queryKey: ["salas_prova_distribuidas", provaId] });
      queryClient.invalidateQueries({ queryKey: ["salas_prova_distribuidas_capacidade", provaId] });
      toast({
        title: "Unidade adicionada",
        description: "A unidade foi vinculada à prova com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar unidade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeUnidadeMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. Buscar dados do prova_unidade para pegar o unidade_id
      const { data: provaUnidade, error: fetchError } = await supabase
        .from("prova_unidades")
        .select("unidade_id")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      // 2. Deletar salas distribuídas da unidade para esta prova
      const { error: deleteSalasError } = await supabase
        .from("salas_prova_distribuidas")
        .delete()
        .eq("prova_id", provaId)
        .eq("sala_fk_unidade", provaUnidade.unidade_id);

      if (deleteSalasError) throw deleteSalasError;

      // 3. Deletar o vínculo prova_unidades
      const { error } = await supabase
        .from("prova_unidades")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prova_unidades", provaId] });
      queryClient.invalidateQueries({ queryKey: ["salas_prova_distribuidas", provaId] });
      queryClient.invalidateQueries({ queryKey: ["salas_prova_distribuidas_capacidade", provaId] });
      toast({
        title: "Unidade removida",
        description: "A unidade foi desvinculada da prova com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover unidade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    provaUnidades: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addUnidade: addUnidadeMutation.mutate,
    removeUnidade: removeUnidadeMutation.mutate,
    isAdding: addUnidadeMutation.isPending,
    isRemoving: removeUnidadeMutation.isPending,
  };
}
