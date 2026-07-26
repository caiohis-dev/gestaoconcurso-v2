import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ValorFuncaoProva {
  id: string;
  prova_id: string;
  funcao_id: string;
  valor_pagamento: number;
  created_at: string | null;
  funcoes_colaboradores?: {
    id: string;
    cargo_nome: string;
  };
}

export function useValoresFuncaoProva(provaId: string) {
  const queryClient = useQueryClient();

  const { data: valoresFuncao = [], isLoading } = useQuery({
    queryKey: ["valores-funcao-prova", provaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("valores_funcao_prova")
        .select(`
          *,
          funcoes_colaboradores (
            id,
            cargo_nome
          )
        `)
        .eq("prova_id", provaId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as ValorFuncaoProva[];
    },
    enabled: !!provaId,
  });

  const upsertValor = useMutation({
    mutationFn: async ({
      funcaoId,
      valorPagamento,
    }: {
      funcaoId: string;
      valorPagamento: number;
    }) => {
      const existing = valoresFuncao.find((v) => v.funcao_id === funcaoId);
      
      if (existing) {
        const { error } = await supabase
          .from("valores_funcao_prova")
          .update({ valor_pagamento: valorPagamento })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("valores_funcao_prova")
          .insert({
            prova_id: provaId,
            funcao_id: funcaoId,
            valor_pagamento: valorPagamento,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["valores-funcao-prova", provaId] });
      toast.success("Valor atualizado com sucesso!");
    },
    onError: (error: { code?: string }) => {
      // 23514 = check_violation. Desde a migration 20260726150000 o banco recusa
      // `valor_pagamento < 0`; sem traduzir, o usuário veria só "Erro ao atualizar
      // valor" e não saberia o que corrigir. O diálogo já barra antes de chegar aqui —
      // isto é a rede para quem chamar por outro caminho.
      if (error?.code === "23514") {
        toast.error("O valor de pagamento não pode ser negativo.");
        return;
      }
      toast.error("Erro ao atualizar valor");
    },
  });

  const deleteValor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("valores_funcao_prova")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["valores-funcao-prova", provaId] });
      toast.success("Valor removido com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao remover valor");
    },
  });

  return {
    valoresFuncao,
    isLoading,
    upsertValor: upsertValor.mutate,
    deleteValor: deleteValor.mutate,
    isUpdating: upsertValor.isPending,
    isDeleting: deleteValor.isPending,
  };
}
