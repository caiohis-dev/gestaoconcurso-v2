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

/**
 * Traduz o 23503 que o banco passou a devolver ao recusar a exclusão de uma função em
 * uso (migration 20260726190000, que trocou SET NULL/CASCADE por RESTRICT nas três FKs).
 *
 * Nomeia QUAL uso está bloqueando, porque as três origens pedem providências diferentes:
 * desalocar gente, apagar meta ou apagar valor de pagamento. O nome da constraint é o
 * que identifica a tabela — a mensagem crua do Postgres cita as duas tabelas e não serve
 * para quem está na tela.
 *
 * ⚠️ Casar por `/colaboradores/` em vez de `/colaboradores_prova/` troca a instrução:
 * `meta_colaboradores_unidade` também contém "colaboradores", e a pessoa seria mandada
 * desalocar gente quando o obstáculo é uma meta. Há teste guardando exatamente isso.
 *
 * ⚠️ O Postgres reporta só a PRIMEIRA violação encontrada. Resolvida aquela, uma nova
 * tentativa pode esbarrar em outra tabela — daí o "ainda" na frase, em vez de dar a
 * entender que aquele é o único obstáculo.
 */
export function mensagemErroExclusaoFuncao(error: { message: string; code?: string }): string {
  const emUso =
    error.code === '23503' || /foreign key constraint|violates foreign key/i.test(error.message);
  if (!emUso) return error.message;

  if (/colaboradores_prova/.test(error.message)) {
    return 'Ainda há colaboradores alocados com esta função. Troque a função deles (ou desaloque) antes de excluí-la.';
  }
  if (/meta_colaboradores_unidade/.test(error.message)) {
    return 'Ainda há metas de colaboradores definidas para esta função. Remova as metas antes de excluí-la.';
  }
  if (/valores_funcao_prova/.test(error.message)) {
    return 'Ainda há valores de pagamento cadastrados para esta função. Remova os valores antes de excluí-la.';
  }
  return 'Esta função está em uso e não pode ser excluída.';
}

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
        description: mensagemErroExclusaoFuncao(error),
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
