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

/** Uma unidade da prova cuja meta (> 0) impede remover o valor de uma função. */
export interface MetaQueImpedeRemocao {
  unidade: string;
  quantidade: number;
}

/**
 * Antecipa, ANTES da confirmação, a recusa do trigger `check_valor_sem_meta`: até
 * 2026-11-27 a pessoa confirmava "Remover", e só depois um toast dizia que não podia.
 *
 * ⚠️ É conveniência, não barreira — a barreira continua sendo o trigger. Por isso a
 * condição tem de ser a DELE, fielmente (CLAUDE.md §8): mesma prova, mesma função,
 * `quantidade_meta > 0` (não "existe linha": meta zerada não bloqueia). Mudou o trigger,
 * muda aqui.
 *
 * A leitura vê tudo o que o trigger vê porque o diálogo só existe para admin (a rota
 * `/gerenciar-prova` é `papeis={["admin"]}`) e a RLS de `meta_colaboradores_unidade`
 * só recorta coordenador. Se um dia ela recortar menos do que o trigger enxerga, o
 * pior caso é o de antes: a confirmação abre e a recusa vem do banco — agora em popup.
 */
export async function buscarMetasQueImpedemRemocao(
  provaId: string,
  funcaoId: string,
): Promise<MetaQueImpedeRemocao[]> {
  const { data, error } = await supabase
    .from("meta_colaboradores_unidade")
    .select("quantidade_meta, prova_unidades!inner(prova_id, unidades_prova(unid_sigla, unid_nome))")
    .eq("funcao_id", funcaoId)
    .eq("prova_unidades.prova_id", provaId)
    .gt("quantidade_meta", 0);

  if (error) throw error;

  return (data ?? [])
    .map((linha) => {
      const unidade = linha.prova_unidades?.unidades_prova;
      return {
        unidade:
          // `trim`: a sigla chega com espaços à direita (`'IEMM      '`, medido no banco local).
          [unidade?.unid_sigla?.trim(), unidade?.unid_nome?.trim()].filter(Boolean).join(" — ") ||
          "Unidade sem nome",
        quantidade: linha.quantidade_meta,
      };
    })
    .sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR"));
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
    onError: (error: { code?: string; message?: string }) => {
      // 23514 = check_violation. Desde a migration 20260726150000 o banco recusa
      // `valor_pagamento < 0`; sem traduzir, o usuário veria só "Erro ao atualizar
      // valor" e não saberia o que corrigir. O diálogo já barra antes de chegar aqui —
      // isto é a rede para quem chamar por outro caminho.
      if (error?.code === "23514") {
        toast.error("O valor de pagamento não pode ser negativo.");
        return;
      }
      // PF001 = prova finalizada (trigger `check_valor_de_prova_finalizada`, 2026-11-27).
      // A tela de prova finalizada nem mostra este diálogo, mas uma aba aberta antes da
      // finalização ainda chega aqui — e a mensagem do banco diz o que fazer (reabrir).
      if (error?.code === "PF001" && error.message) {
        toast.error(error.message);
        return;
      }
      toast.error("Erro ao atualizar valor");
    },
  });

  // Sem `onError` aqui de propósito: a recusa vira POPUP no diálogo, não toast (decisão
  // do usuário, 2026-11-27). Por isso `deleteValor` EXIGE o callback `aoFalhar` — um
  // chamador que esquecesse de tratar o erro o perderia em silêncio, e o `tsc` barra isso.
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
  });

  return {
    valoresFuncao,
    isLoading,
    upsertValor: upsertValor.mutate,
    deleteValor: (id: string, aoFalhar: (mensagem: string) => void) =>
      deleteValor.mutate(id, { onError: (error: Error) => aoFalhar(mensagemErroRemocaoValor(error)) }),
    isUpdating: upsertValor.isPending,
    isDeleting: deleteValor.isPending,
  };
}
