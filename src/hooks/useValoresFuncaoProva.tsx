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

/**
 * O banco passou a recusar a remoção de um valor enquanto houver meta > 0 daquela função
 * na prova (trigger `check_valor_sem_meta`, migration 20260726200000) — senão a meta fica
 * órfã: some do diálogo, que só lista função com valor, mas segue contando no card da
 * prova como gente faltando, sem que ninguém consiga zerá-la.
 *
 * ⚠️ Este `onError` DESCARTAVA a mensagem e mostrava "Erro ao remover valor" para tudo.
 * É a mesma classe já paga uma vez neste repo (a mensagem da Edge Function jogada fora):
 * o banco explica o que fazer, e o cliente substitui a explicação por um genérico. A
 * regra que fica: mensagem vinda do banco/EF passa adiante; o texto próprio é fallback.
 */
export function mensagemErroRemocaoValor(error: { message?: string }): string {
  const doBanco = error?.message?.trim();
  return doBanco ? doBanco : "Erro ao remover valor";
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
    onError: (error: Error) => {
      toast.error(mensagemErroRemocaoValor(error));
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
