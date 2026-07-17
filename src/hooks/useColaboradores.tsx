import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

// Traduz a violação de índice único (CPF, matrícula, PIS, e-mail e chave PIX são
// UNIQUE) numa frase para a pessoa. Devolve null quando o erro não é de duplicidade,
// para o chamador manter a própria mensagem. A constraint violada vem no nome do índice
// (ex.: colaboradores_colab_email_key), que o supabase-js pode entregar em .message ou
// em .details — olhamos os dois.
function mensagemDuplicidade(error: Error): string | null {
  const raw = `${error.message} ${(error as { details?: string }).details ?? ''}`;
  if (!raw.includes('duplicate key')) return null;
  if (raw.includes('colab_cpf')) return 'CPF já cadastrado';
  if (raw.includes('colab_matricula')) return 'Matrícula já cadastrada';
  if (raw.includes('colab_pis')) return 'PIS já cadastrado';
  if (raw.includes('colab_email')) return 'Este e-mail já está cadastrado para outro colaborador. Verifique o endereço e tente novamente.';
  if (raw.includes('colab_chave_pix')) return 'Esta chave PIX já está cadastrada para outro colaborador. Cada chave pertence a uma única pessoa — verifique e tente novamente.';
  return 'Um dos dados informados já está cadastrado para outro colaborador.';
}

export interface Colaborador {
  id: string;
  colab_matricula: string | null;
  colab_nome_completo: string | null;
  colab_cpf: string;
  colab_data_nascimento: string;
  colab_nacionalidade: string | null;
  colab_pis: string | null;
  colab_rua: string | null;
  colab_numero_casa: number | null;
  colab_bairro: string | null;
  colab_cidade: string | null;
  colab_cep: number | null;
  colab_estado_civil: number | null;
  colab_raca: number | null;
  colab_grau_instrucao: number | null;
  colab_telefone: number | null;
  colab_complemento_endereco: string | null;
  colab_deficiente: boolean;
  colab_email: string | null;
  colab_chave_pix: string | null;
  colab_ultimo_acesso: string | null;
  codigo_banco: string | null;
  agencia: string | null;
  agencia_dv: string | null;
  conta: string | null;
  conta_dv: string | null;
  tipo_conta: string | null;
  created_at: string;
  updated_at: string;
}

export type ColaboradorInsert = Omit<Colaborador, 'id' | 'created_at' | 'updated_at' | 'colab_ultimo_acesso'>;

export interface UseColaboradoresOptions {
  /** When true, fetches all collaborators regardless of role (for adding to exams) */
  fetchAll?: boolean;
}

export function useColaboradores(options: UseColaboradoresOptions = {}) {
  const { fetchAll = false } = options;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isAdmin, isCoordenador } = useAuth();

  const query = useQuery({
    queryKey: ['colaboradores', user?.id, isAdmin, isCoordenador, fetchAll],
    queryFn: async () => {
      // If fetchAll is true or user is admin, get all colaboradores
      if (fetchAll || isAdmin) {
        const { data, error } = await supabase
          .from('colaboradores')
          .select('*')
          .order('colab_nome_completo', { ascending: true });

        if (error) throw error;
        return data as Colaborador[];
      }

      // If user is coordenador, get only their colaboradores
      if (isCoordenador && user?.id) {
        // Get the list of colaborador IDs that this coordinator can see
        const { data: allowedIds, error: idsError } = await supabase.rpc(
          'get_coordenador_colaboradores',
          { p_user_id: user.id }
        );

        if (idsError) throw idsError;

        if (!allowedIds || allowedIds.length === 0) {
          return [] as Colaborador[];
        }

        const { data, error } = await supabase
          .from('colaboradores')
          .select('*')
          .in('id', allowedIds)
          .order('colab_nome_completo', { ascending: true });

        if (error) throw error;
        return data as Colaborador[];
      }

      // Regular users can see all colaboradores (read-only)
      const { data, error } = await supabase
        .from('colaboradores')
        .select('*')
        .order('colab_nome_completo', { ascending: true });

      if (error) throw error;
      return data as Colaborador[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (colaborador: ColaboradorInsert) => {
      const { data, error } = await supabase
        .from('colaboradores')
        .insert(colaborador)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Colaborador cadastrado com sucesso!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao cadastrar',
        description: mensagemDuplicidade(error) ?? error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...colaborador }: Partial<Colaborador> & { id: string }) => {
      const { data, error } = await supabase
        .from('colaboradores')
        .update(colaborador)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Colaborador atualizado com sucesso!',
      });
    },
    onError: (error: Error) => {
      let message = error.message;

      if (error.message.includes('row-level security policy')) {
        message = 'Você não tem permissão para editar este colaborador.';
      } else {
        message = mensagemDuplicidade(error) ?? message;
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
      // Check if collaborator is linked to any exam
      const { data: provaLinks, error: checkError } = await supabase
        .from('colaboradores_prova')
        .select('id')
        .eq('colaborador_id', id)
        .limit(1);

      if (checkError) throw checkError;

      if (provaLinks && provaLinks.length > 0) {
        throw new Error('COLABORADOR_VINCULADO_PROVA');
      }

      const { error } = await supabase
        .from('colaboradores')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Colaborador excluído com sucesso!',
      });
    },
    onError: (error: Error) => {
      let message = error.message;
      
      if (error.message === 'COLABORADOR_VINCULADO_PROVA') {
        message = 'Não é possível excluir este colaborador pois ele está vinculado a uma prova.';
      }
      
      toast({
        title: 'Erro ao excluir',
        description: message,
        variant: 'destructive',
      });
    },
  });

  return {
    colaboradores: query.data ?? [],
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
