import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** O que `handleSubmit` decide para a alocação — ver `registrar_ocorrencia_colaborador`. */
export type EfeitoOcorrencia = "nenhum" | "substituicao" | "falta";

export interface Ocorrencia {
  id: string;
  colaborador_id: string;
  prova_id: string;
  prova_unidade_id: string;
  descricao: string;
  tipo_ocorrencia: string | null;
  data_ocorrencia: string;
  substituido: number;
  substituto_id: string | null;
  falta: boolean;
  funcao_id_congelada: string | null;
  valor_pagamento_congelado: number | null;
  /** Salas em que era fiscal 1/2 ao sair — devolvidas se a ocorrência for excluída. */
  salas_fiscal_1_congeladas: string[];
  salas_fiscal_2_congeladas: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  colaboradores?: {
    id: string;
    colab_nome_completo: string;
    colab_cpf: string;
  } | null;
  substituto?: {
    id: string;
    colab_nome_completo: string;
  } | null;
  prova_unidades?: {
    id: string;
    unidades_prova?: {
      unid_sigla: string;
      unid_nome: string;
    } | null;
  } | null;
}

export interface OcorrenciaInsert {
  colaborador_id: string;
  prova_unidade_id: string;
  descricao: string;
  tipo_ocorrencia?: string | null;
  data_ocorrencia?: string;
  efeito?: EfeitoOcorrencia;
  substituto_id?: string | null;
}

export interface OcorrenciaUpdate {
  colaborador_id?: string;
  prova_unidade_id?: string;
  descricao?: string;
  tipo_ocorrencia?: string | null;
  data_ocorrencia?: string;
  substituido?: number;
}


export function useOcorrencias(provaId: string, provaUnidadeIds?: string[]) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["ocorrencias_colaborador", provaId, provaUnidadeIds ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("ocorrencias_colaborador")
        .select(`
          *,
          colaboradores!ocorrencias_colaborador_colaborador_id_fkey ( id, colab_nome_completo, colab_cpf ),
          substituto:colaboradores!ocorrencias_colaborador_substituto_id_fkey ( id, colab_nome_completo ),
          prova_unidades ( id, unidades_prova ( unid_sigla, unid_nome ) )
        `)
        .eq("prova_id", provaId)
        .order("data_ocorrencia", { ascending: false });

      // `undefined` e `[]` significam coisas OPOSTAS, e até 2026-07-26 caíam no mesmo
      // ramo — o filtro só era aplicado quando havia ids, então lista vazia devolvia a
      // prova INTEIRA. Quem passa `undefined` é o admin ("sem restrição"); quem passa
      // `[]` é o coordenador sem unidade nenhuma visível, e aí o certo é ZERO linha.
      //
      // Não era teórico: `useCoordenadorUnidades` devolve `[]` enquanto carrega, então
      // todo carregamento por coordenador tinha uma janela mostrando ocorrências de
      // unidades que não são dele. A RLS não segura — ela autoriza por PROVA, não por
      // unidade, então este filtro é a única barreira do recorte.
      if (provaUnidadeIds !== undefined) {
        q = q.in("prova_unidade_id", provaUnidadeIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown) as Ocorrencia[];
    },
    enabled: !!provaId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ocorrencias_colaborador", provaId] });
  };

  // Passa pelo RPC `registrar_ocorrencia_colaborador` mesmo quando `efeito` é "nenhum":
  // é o único caminho, e o que garante `prova_id` correto (derivado da unidade no
  // banco) e a autorização por unidade — ver o cabeçalho da migration
  // 20260923232343_falta_remove_colaborador_da_prova.
  const create = useMutation({
    mutationFn: async (data: OcorrenciaInsert) => {
      const { data: result, error } = await supabase.rpc("registrar_ocorrencia_colaborador", {
        p_prova_unidade_id: data.prova_unidade_id,
        p_colaborador_id: data.colaborador_id,
        p_tipo_ocorrencia: data.tipo_ocorrencia ?? null,
        p_data_ocorrencia: data.data_ocorrencia ?? null,
        p_descricao: data.descricao,
        p_efeito: data.efeito ?? "nenhum",
        p_substituto_id: data.substituto_id ?? null,
      });
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Ocorrência registrada", description: "A ocorrência foi registrada com sucesso." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao registrar ocorrência", description: error.message, variant: "destructive" });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: OcorrenciaUpdate }) => {
      const { data: result, error } = await supabase
        .from("ocorrencias_colaborador")
        .update(data)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Ocorrência atualizada", description: "A ocorrência foi atualizada com sucesso." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar ocorrência", description: error.message, variant: "destructive" });
    },
  });

  // Reverte, dentro da mesma transação, o efeito que a ocorrência teve sobre
  // `colaboradores_prova` (substituição ou falta) antes de excluí-la — ver
  // `excluir_ocorrencia_colaborador`. Os postos de fiscal de sala também voltam, mas só
  // os que ainda estão vagos: o RPC devolve quantos não voltaram, e isso não pode
  // passar calado (migration 20261008222929).
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("excluir_ocorrencia_colaborador", { p_ocorrencia_id: id });
      if (error) throw error;
      const retorno = data as { postos_fiscal_nao_devolvidos?: number } | null;
      return { postosFiscalNaoDevolvidos: retorno?.postos_fiscal_nao_devolvidos ?? 0 };
    },
    onSuccess: ({ postosFiscalNaoDevolvidos }) => {
      invalidate();
      if (postosFiscalNaoDevolvidos > 0) {
        toast({
          title: "Ocorrência excluída — confira a sala",
          description:
            postosFiscalNaoDevolvidos === 1
              ? "O colaborador voltou à lista, mas 1 posto de fiscal de sala que ele ocupava não pôde ser devolvido: já foi preenchido por outra pessoa ou a sala não existe mais. Ajuste em Salas Distribuídas, se for o caso."
              : `O colaborador voltou à lista, mas ${postosFiscalNaoDevolvidos} postos de fiscal de sala que ele ocupava não puderam ser devolvidos: já foram preenchidos por outra pessoa ou as salas não existem mais. Ajuste em Salas Distribuídas, se for o caso.`,
        });
        return;
      }
      toast({ title: "Ocorrência excluída", description: "A ocorrência foi excluída com sucesso." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir ocorrência", description: error.message, variant: "destructive" });
    },
  });

  return {
    ocorrencias: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: create.mutate,
    update: update.mutate,
    remove: remove.mutate,
    isCreating: create.isPending,
    isUpdating: update.isPending,
    isRemoving: remove.isPending,
  };
}
