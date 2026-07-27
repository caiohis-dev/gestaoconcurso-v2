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

/**
 * Traduz a recusa ao desvincular uma unidade da prova.
 *
 * ⚠️ Este caso NASCEU em 2026-07-26 como efeito colateral do RESTRICT em
 * `coordenadores_prova` (migration 20260726250000): `colaboradores_prova` cascateia de
 * `prova_unidades`, então desvincular uma unidade que tenha um coordenador alocado faz a
 * cascata esbarrar no acesso de coordenador. É o comportamento certo — desvincular não
 * deve revogar coordenação em silêncio — mas é obstáculo INDIRETO: o erro fala de uma
 * tabela que a pessoa não estava mexendo, e sem tradução ela não teria como ligar uma
 * coisa à outra.
 */
export function mensagemErroDesvinculoUnidade(error: { message: string; code?: string }): string {
  const bloqueado =
    error.code === '23503' || /foreign key constraint|violates foreign key/i.test(error.message);
  if (!bloqueado) return error.message;

  if (/coordenadores_prova/.test(error.message)) {
    return "Há um coordenador com acesso vinculado a esta unidade. Remova o acesso em 'Acesso dos Coordenadores' antes de desvincular a unidade.";
  }
  return 'Esta unidade não pode ser desvinculada porque há registros vinculados a ela.';
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
      // Eram 3 passos soltos (insere vínculo, lê as salas, insere as cópias). Falhar no
      // último deixava a unidade vinculada SEM SALA — estado que a tela não distingue de
      // "unidade sem salas cadastradas", então o erro só aparecia ao distribuir fiscais.
      // Virou RPC, cujo corpo roda em transação (migration 20260726230000).
      const { data, error } = await supabase.rpc("vincular_unidade_a_prova", {
        p_prova_id: provaId,
        p_unidade_id: unidadeId,
      });

      if (error) throw error;
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
      // Mesmo defeito na ordem inversa: lia o unidade_id, apagava as salas distribuídas
      // e só então o vínculo. Falhar no último passo produzia o MESMO estado corrompido
      // — vínculo vivo, zero salas. A RPC faz os dois DELETEs numa transação só, e
      // deriva o prova_id da própria linha em vez de recebê-lo do cliente.
      const { error } = await supabase.rpc("desvincular_unidade_da_prova", {
        p_prova_unidade_id: id,
      });

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
        description: mensagemErroDesvinculoUnidade(error),
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
