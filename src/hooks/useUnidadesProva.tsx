import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * ⚠️ **`unid_andares` saiu em 2026-08-03** (migration `20260804001559`). A unidade não
 * declara mais quantos andares tem: o andar é atributo da sala. Ver `provas-e-unidades.md`.
 */
export interface UnidadeProva {
  id: string;
  unid_nome: string;
  unid_sigla: string;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface UnidadeProvaInsert {
  unid_nome: string;
  unid_sigla: string;
}

export interface UnidadeProvaUpdate {
  unid_nome?: string;
  unid_sigla?: string;
}

/**
 * Traduz a recusa do banco ao excluir uma unidade em uso (migration 20260726240000, que
 * trocou CASCADE por RESTRICT em `prova_unidades` e `salas_prova_distribuidas`).
 *
 * O que existia antes era um AlertDialog genérico e uma cascata: excluir a unidade "ICT"
 * levaria 110 alocações e 10 ocorrências, em silêncio. A decisão do usuário foi que
 * unidade só se exclui **sem nenhum uso** — e "uso" é estar vinculada a alguma prova.
 *
 * ⚠️ As salas cadastradas da unidade NÃO são uso: `sala_prova` segue CASCADE de
 * propósito, senão nenhuma unidade com sala poderia sair do catálogo.
 */
export function mensagemErroExclusaoUnidade(error: { message: string; code?: string }): string {
  const emUso =
    error.code === '23503' || /foreign key constraint|violates foreign key/i.test(error.message);
  if (!emUso) return error.message;

  return 'Esta unidade está vinculada a uma prova e não pode ser excluída. Só é possível excluir unidades que nunca foram usadas.';
}

export function useUnidadesProva() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["unidades_prova"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades_prova")
        .select("*")
        .order("unid_nome");

      if (error) throw error;
      return data as UnidadeProva[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (unidade: UnidadeProvaInsert) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("unidades_prova")
        .insert({
          ...unidade,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unidades_prova"] });
      toast({
        title: "Unidade criada",
        description: "A unidade de prova foi criada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar unidade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UnidadeProvaUpdate }) => {
      const { data: result, error } = await supabase
        .from("unidades_prova")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unidades_prova"] });
      toast({
        title: "Unidade atualizada",
        description: "A unidade de prova foi atualizada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar unidade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("unidades_prova")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unidades_prova"] });
      toast({
        title: "Unidade excluída",
        description: "A unidade de prova foi excluída com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir unidade",
        description: mensagemErroExclusaoUnidade(error),
        variant: "destructive",
      });
    },
  });

  return {
    unidades: query.data ?? [],
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
