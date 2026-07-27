import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ColaboradorProva {
  id: string;
  prova_unidade_id: string;
  colaborador_id: string;
  funcao_id: string | null;
  valor_pagamento: number | null;
  created_at: string | null;
  created_by: string | null;
  colaboradores?: {
    id: string;
    colab_nome_completo: string;
    colab_cpf: string;
  };
  funcoes_colaboradores?: {
    id: string;
    cargo_nome: string;
  } | null;
}

export interface ColaboradorProvaInsert {
  prova_unidade_id: string;
  colaborador_id: string;
  funcao_id?: string | null;
  valor_pagamento?: number | null;
}

export interface ColaboradorProvaUpdate {
  funcao_id?: string | null;
  valor_pagamento?: number | null;
}

/**
 * Traduz a recusa do banco ao desalocar quem tem acesso de coordenador (migration
 * 20260726250000, que trocou CASCADE por RESTRICT em `coordenadores_prova`).
 *
 * A instrução aponta a tela onde se resolve — sem ela, a pessoa lê um erro de FK e não
 * tem como adivinhar que o obstáculo é a coordenação, que se administra em outro lugar.
 */
export function mensagemErroDesalocacao(error: { message: string; code?: string }): string {
  const temCoordenacao =
    error.code === '23503' || /foreign key constraint|violates foreign key/i.test(error.message);
  if (!temCoordenacao) return error.message;

  if (/coordenadores_prova/.test(error.message)) {
    return "Este colaborador possui acesso como Coordenador desta prova. Remova o acesso em 'Acesso dos Coordenadores' antes de removê-lo da unidade.";
  }
  return 'Este colaborador não pode ser removido da unidade porque há registros vinculados a esta alocação.';
}

export function useColaboradoresProva(provaUnidadeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["colaboradores_prova", provaUnidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores_prova")
        .select(`
          id,
          prova_unidade_id,
          colaborador_id,
          funcao_id,
          valor_pagamento,
          created_at,
          created_by,
          colaboradores (
            id,
            colab_nome_completo,
            colab_cpf
          ),
          funcoes_colaboradores (
            id,
            cargo_nome
          )
        `)
        .eq("prova_unidade_id", provaUnidadeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ColaboradorProva[];
    },
    enabled: !!provaUnidadeId,
  });

  // Get prova_id from prova_unidade to check colaboradores already assigned to the same prova
  const colaboradoresAlocadosQuery = useQuery({
    queryKey: ["colaboradores_alocados_prova_unidade", provaUnidadeId],
    queryFn: async () => {
      // First get the prova_id from prova_unidades
      const { data: provaUnidade, error: puError } = await supabase
        .from("prova_unidades")
        .select("prova_id")
        .eq("id", provaUnidadeId)
        .single();

      if (puError) throw puError;

      // Get all prova_unidades for this prova with unit names and siglas
      const { data: allProvaUnidades, error: allPuError } = await supabase
        .from("prova_unidades")
        .select("id, unidades_prova(unid_nome, unid_sigla)")
        .eq("prova_id", provaUnidade.prova_id);

      if (allPuError) throw allPuError;

      if (!allProvaUnidades || allProvaUnidades.length === 0) {
        return { ids: [] as string[], info: {} as Record<string, { prova_unidade_id: string; unid_nome: string; unid_sigla: string }> };
      }

      const puMap = new Map<string, { unid_nome: string; unid_sigla: string }>();
      allProvaUnidades.forEach((pu: { id: string; unidades_prova: { unid_nome: string; unid_sigla: string } | null }) => {
        puMap.set(pu.id, {
          unid_nome: pu.unidades_prova?.unid_nome ?? "",
          unid_sigla: pu.unidades_prova?.unid_sigla ?? "",
        });
      });

      // Get all colaboradores already assigned to any unit of this prova
      const { data: colaboradores, error: colabError } = await supabase
        .from("colaboradores_prova")
        .select("colaborador_id, prova_unidade_id")
        .in("prova_unidade_id", Array.from(puMap.keys()));

      if (colabError) throw colabError;

      const info: Record<string, { prova_unidade_id: string; unid_nome: string; unid_sigla: string }> = {};
      const ids: string[] = [];
      (colaboradores ?? []).forEach((c) => {
        const unitInfo = puMap.get(c.prova_unidade_id) ?? { unid_nome: "", unid_sigla: "" };
        ids.push(c.colaborador_id);
        info[c.colaborador_id] = {
          prova_unidade_id: c.prova_unidade_id,
          unid_nome: unitInfo.unid_nome,
          unid_sigla: unitInfo.unid_sigla,
        };
      });

      return { ids, info };
    },
    enabled: !!provaUnidadeId,
  });


  const createMutation = useMutation({
    mutationFn: async (data: ColaboradorProvaInsert) => {
      const { data: userData } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("colaboradores_prova")
        .insert({
          ...data,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) {
        if (error.message.includes("já está alocado")) {
          throw new Error("Este colaborador já está alocado em outra unidade desta prova.");
        }
        throw error;
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colaboradores_prova", provaUnidadeId] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores_alocados_prova_unidade", provaUnidadeId] });
      // Invalidate coordinators eligible list so it updates automatically
      queryClient.invalidateQueries({ queryKey: ["colaboradores-elegiveis-coordenacao"] });
      queryClient.invalidateQueries({ queryKey: ["coordenadores-prova"] });
      toast({
        title: "Colaborador adicionado",
        description: "O colaborador foi vinculado à unidade com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar colaborador",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ColaboradorProvaUpdate }) => {
      const { data: result, error } = await supabase
        .from("colaboradores_prova")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colaboradores_prova", provaUnidadeId] });
      // Invalidate coordinators eligible list so it updates automatically
      queryClient.invalidateQueries({ queryKey: ["colaboradores-elegiveis-coordenacao"] });
      queryClient.invalidateQueries({ queryKey: ["coordenadores-prova"] });
      toast({
        title: "Colaborador atualizado",
        description: "Os dados do colaborador foram atualizados com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar colaborador",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // O pré-check que existia aqui (SELECT em coordenadores_prova e throw) saiu em
      // 2026-07-26, junto com o RESTRICT da migration 20260726250000. Ele valia só para
      // quem passava por esta tela, e era "leio e então decido" — o acesso podia ser
      // concedido entre o SELECT e o DELETE. Agora quem recusa é o banco.
      const { error } = await supabase
        .from("colaboradores_prova")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colaboradores_prova", provaUnidadeId] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores_alocados_prova_unidade", provaUnidadeId] });
      // Invalidate coordinators eligible list so it updates automatically
      queryClient.invalidateQueries({ queryKey: ["colaboradores-elegiveis-coordenacao"] });
      queryClient.invalidateQueries({ queryKey: ["coordenadores-prova"] });
      toast({
        title: "Colaborador removido",
        description: "O colaborador foi removido da unidade com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover colaborador",
        description: mensagemErroDesalocacao(error),
        variant: "destructive",
      });
    },
  });

  return {
    colaboradoresProva: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    colaboradoresAlocados: colaboradoresAlocadosQuery.data?.ids ?? [],
    colaboradoresAlocadosInfo: colaboradoresAlocadosQuery.data?.info ?? {},
    isLoadingAlocados: colaboradoresAlocadosQuery.isLoading,


    create: createMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
