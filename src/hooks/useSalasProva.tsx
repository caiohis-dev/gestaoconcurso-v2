import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SalaProva {
  id: string;
  sala_fk_unidade: string;
  sala_numero: number;
  sala_descricao: string | null;
  sala_arcondicionado: boolean | null;
  sala_capacidade: number;
  sala_andar: number | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface SalaProvaInsert {
  sala_fk_unidade: string;
  sala_numero: number;
  sala_descricao?: string | null;
  sala_arcondicionado?: boolean;
  sala_capacidade: number;
  sala_andar?: number | null;
}

export interface SalaProvaCreateMultiple {
  sala_fk_unidade: string;
  quantidade: number;
  sala_capacidade: number;
  sala_andar: number;
}

export interface SalaProvaUpdate {
  sala_numero?: number;
  sala_descricao?: string | null;
  sala_arcondicionado?: boolean;
  sala_capacidade?: number;
  sala_andar?: number | null;
}

/**
 * Traduz o 23505 do índice único criado em 2026-07-26 (`sala_prova_unidade_numero_key`).
 *
 * Dois caminhos chegam aqui, e a saída de cada um é diferente:
 *
 * - **Criação:** a numeração é calculada no cliente (lê o maior número do andar e insere
 *   max+1), o que é uma corrida — duas sessões leem o mesmo max e gravam os mesmos
 *   números. O índice não conserta a corrida, ele a torna VISÍVEL, e a saída é repetir a
 *   ação: na segunda vez o max já mudou.
 * - **Edição:** a pessoa digitou um número que já existe. Repetir não adianta; ela
 *   precisa escolher outro.
 *
 * Sem esta tradução, os dois casos chegariam como texto cru do Postgres.
 */
export function mensagemErroSala(
  error: { message: string; code?: string },
  acao: 'criacao' | 'edicao',
): string {
  const numeroRepetido =
    error.code === '23505' ||
    /duplicate key|unique constraint|sala_prova_unidade_numero_key/i.test(error.message);
  if (!numeroRepetido) return error.message;

  return acao === 'criacao'
    ? 'Já existe sala com esse número nesta unidade — provavelmente outra pessoa criou salas ao mesmo tempo. Nenhuma sala foi criada; tente novamente.'
    : 'Já existe sala com esse número nesta unidade. Escolha outro número.';
}

export function useSalasProva(unidadeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["salas_prova", unidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sala_prova")
        .select("*")
        .eq("sala_fk_unidade", unidadeId)
        .order("sala_numero");

      if (error) throw error;
      return data as SalaProva[];
    },
    enabled: !!unidadeId,
  });

  const createMultipleMutation = useMutation({
    mutationFn: async (params: SalaProvaCreateMultiple) => {
      const { data: userData } = await supabase.auth.getUser();
      
      // Buscar salas existentes no andar para determinar a sequência
      const { data: existingSalas, error: fetchError } = await supabase
        .from("sala_prova")
        .select("sala_numero")
        .eq("sala_fk_unidade", params.sala_fk_unidade);

      if (fetchError) throw fetchError;

      // Filtrar salas do mesmo andar (primeiro dígito = andar)
      const andarPrefix = params.sala_andar * 100;
      const salasNoAndar = (existingSalas ?? [])
        .map(s => s.sala_numero)
        .filter(num => num >= andarPrefix && num < andarPrefix + 100);

      // Encontrar o maior número sequencial no andar
      let maxSequencia = 0;
      salasNoAndar.forEach(num => {
        const sequencia = num % 100;
        if (sequencia > maxSequencia) {
          maxSequencia = sequencia;
        }
      });

      // Criar as salas com números sequenciais
      const salasToInsert: SalaProvaInsert[] = [];
      for (let i = 0; i < params.quantidade; i++) {
        const sequencia = maxSequencia + 1 + i;
        // Formato: andar * 100 + sequência (ex: andar 1 + seq 1 = 101)
        const salaNumero = andarPrefix + sequencia;
        
        salasToInsert.push({
          sala_fk_unidade: params.sala_fk_unidade,
          sala_numero: salaNumero,
          sala_capacidade: params.sala_capacidade,
          sala_andar: params.sala_andar,
          created_by: userData.user?.id,
        } as SalaProvaInsert & { created_by: string | undefined });
      }

      const { data, error } = await supabase
        .from("sala_prova")
        .insert(salasToInsert)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova", unidadeId] });
      toast({
        title: data.length === 1 ? "Sala criada" : "Salas criadas",
        description: data.length === 1 
          ? "A sala foi criada com sucesso." 
          : `${data.length} salas foram criadas com sucesso.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar salas",
        description: mensagemErroSala(error, 'criacao'),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SalaProvaUpdate }) => {
      const { data: result, error } = await supabase
        .from("sala_prova")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova", unidadeId] });
      toast({
        title: "Sala atualizada",
        description: "A sala foi atualizada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar sala",
        description: mensagemErroSala(error, 'edicao'),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sala_prova")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova", unidadeId] });
      toast({
        title: "Sala excluída",
        description: "A sala foi excluída com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir sala",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    salas: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createMultiple: createMultipleMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
    isCreating: createMultipleMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
