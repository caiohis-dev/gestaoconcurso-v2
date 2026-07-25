import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Edital {
  id: string;
  nome: string;
  n_candidatos: number | null;
  cabecalho_linha1: string | null;
  cabecalho_linha2: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface EditalInsert {
  nome: string;
  n_candidatos?: number | null;
  cabecalho_linha1?: string | null;
  cabecalho_linha2?: string | null;
}

export interface EditalUpdate {
  nome?: string;
  n_candidatos?: number | null;
  cabecalho_linha1?: string | null;
  cabecalho_linha2?: string | null;
}

// Traduz o erro de nome duplicado (índice único editais_nome_key, código 23505) para
// PT-BR. Qualquer outro erro cai na própria mensagem, ou no fallback.
function mensagemErroEdital(error: { message: string; code?: string }, fallback: string): string {
  const nomeDuplicado =
    error.code === "23505" || /duplicate key|unique constraint|editais_nome_key/i.test(error.message);
  if (nomeDuplicado) return "Já existe um edital com esse nome.";
  return error.message || fallback;
}

export function useEditais() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["editais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("editais")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw error;
      return data as Edital[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (edital: EditalInsert) => {
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("editais")
        .insert({ ...edital, created_by: userData.user?.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["editais"] });
      toast({ title: "Edital criado", description: "O edital foi criado com sucesso." });
    },
    onError: (error: { message: string; code?: string }) => {
      toast({
        title: "Erro ao criar edital",
        description: mensagemErroEdital(error, "Não foi possível criar o edital."),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditalUpdate }) => {
      const { data: result, error } = await supabase
        .from("editais")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      // Editais alimentam a sugestão do ProvaDialog e o nome exibido nas provas (join),
      // então invalidar provas também mantém a UI coerente.
      queryClient.invalidateQueries({ queryKey: ["editais"] });
      queryClient.invalidateQueries({ queryKey: ["provas"] });
      toast({ title: "Edital atualizado", description: "O edital foi atualizado com sucesso." });
    },
    onError: (error: { message: string; code?: string }) => {
      toast({
        title: "Erro ao atualizar edital",
        description: mensagemErroEdital(error, "Não foi possível atualizar o edital."),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("editais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["editais"] });
      toast({ title: "Edital excluído", description: "O edital foi excluído com sucesso." });
    },
    onError: (error: { message: string; code?: string }) => {
      // ON DELETE RESTRICT (D6): apagar um edital com provas vinculadas devolve
      // violação de FK (23503). Traduz para uma mensagem que diz o que fazer.
      const isFk = error.code === "23503" || /foreign key|violates/i.test(error.message);
      toast({
        title: "Erro ao excluir edital",
        description: isFk
          ? "Há provas vinculadas a este edital. Remova ou realoque as provas antes de excluí-lo."
          : error.message,
        variant: "destructive",
      });
    },
  });

  return {
    editais: query.data ?? [],
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
