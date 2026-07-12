import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface FuncaoColaborador {
  id: string;
  cargo_nome: string;
  cargo_descricao: string | null;
  cargo_cbo: string | null;
  cargo_editavel: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export type FuncaoColaboradorInsert = {
  cargo_nome: string;
  cargo_descricao?: string | null;
  cargo_cbo?: string | null;
  cargo_editavel?: boolean | null;
};

export function useFuncoesColaboradores() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['funcoes_colaboradores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funcoes_colaboradores')
        .select('*')
        .order('cargo_nome', { ascending: true });

      if (error) throw error;
      return data as FuncaoColaborador[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (funcao: FuncaoColaboradorInsert) => {
      const { data, error } = await supabase
        .from('funcoes_colaboradores')
        .insert(funcao)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcoes_colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Função cadastrada com sucesso!',
      });
    },
    onError: (error: Error) => {
      let message = error.message;
      if (error.message.includes('duplicate key')) {
        message = 'Já existe uma função com este nome';
      }
      toast({
        title: 'Erro ao cadastrar',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...funcao }: Partial<FuncaoColaborador> & { id: string }) => {
      const { data, error } = await supabase
        .from('funcoes_colaboradores')
        .update(funcao)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcoes_colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Função atualizada com sucesso!',
      });
    },
    onError: (error: Error) => {
      let message = error.message;
      if (error.message.includes('duplicate key')) {
        message = 'Já existe uma função com este nome';
      }
      toast({
        title: 'Erro ao atualizar',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('funcoes_colaboradores')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcoes_colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Função excluída com sucesso!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    funcoes: query.data ?? [],
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
