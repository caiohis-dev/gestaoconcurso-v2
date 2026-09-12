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
    colab_telefone: number | null;
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
            colab_cpf,
            colab_telefone
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

  // 🔵 A query `colaboradoresAlocadosQuery` saiu daqui em 2026-09-12.
  //
  // Ela fazia TRÊS requisições — prova_id da unidade, todas as prova_unidades da prova,
  // e todas as alocações delas — para montar, no cliente, um `Map` de "quem já está em
  // que unidade". Só servia ao picker de `GerenciarColaboradoresProva`, e o último passo
  // (`colaboradores_prova` filtrado por `.in(...)`, sem `.range()`) batia no teto
  // `max_rows` do PostgREST, que corta SEM ERRO: 531 alocações na maior prova, contra um
  // teto de 1000. Truncar ali fazia alguém já alocado em outra unidade aparecer como
  // livre. ⚠️ O estrago é de UX, não de dado: o trigger `check_colaborador_prova_unique`
  // recusa a alocação no banco, nomeando o motivo — o que se perde é o aviso preventivo.
  //
  // O cruzamento agora vem pronto da RPC `buscar_colaboradores_para_alocacao`, junto com
  // a busca — ver `useBuscarColaboradoresParaAlocacao` em `useColaboradores.tsx`.

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


    create: createMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
