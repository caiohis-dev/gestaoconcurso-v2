import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook que verifica quais funções estão associadas a provas.
 * Uma função é considerada associada se existir em qualquer uma das tabelas:
 * - valores_funcao_prova (valores de pagamento definidos)
 * - colaboradores_prova (colaboradores alocados)
 * - meta_colaboradores_unidade (metas definidas)
 * 
 * @returns Map<funcao_id, boolean> indicando se cada função está associada
 */
export function useFuncoesAssociadas() {
  const query = useQuery({
    queryKey: ['funcoes_associadas'],
    queryFn: async () => {
      // Buscar associações de todas as 3 tabelas em paralelo
      const [valoresResult, colaboradoresResult, metasResult] = await Promise.all([
        supabase
          .from('valores_funcao_prova')
          .select('funcao_id'),
        supabase
          .from('colaboradores_prova')
          .select('funcao_id')
          .not('funcao_id', 'is', null),
        supabase
          .from('meta_colaboradores_unidade')
          .select('funcao_id'),
      ]);

      if (valoresResult.error) throw valoresResult.error;
      if (colaboradoresResult.error) throw colaboradoresResult.error;
      if (metasResult.error) throw metasResult.error;

      // Combinar todos os IDs de funções associadas em um Set
      const funcoesAssociadas = new Set<string>();

      valoresResult.data?.forEach((item) => {
        if (item.funcao_id) funcoesAssociadas.add(item.funcao_id);
      });

      colaboradoresResult.data?.forEach((item) => {
        if (item.funcao_id) funcoesAssociadas.add(item.funcao_id);
      });

      metasResult.data?.forEach((item) => {
        if (item.funcao_id) funcoesAssociadas.add(item.funcao_id);
      });

      return funcoesAssociadas;
    },
  });

  return {
    funcoesAssociadas: query.data ?? new Set<string>(),
    isLoading: query.isLoading,
    error: query.error,
    isFuncaoAssociada: (funcaoId: string) => query.data?.has(funcaoId) ?? false,
  };
}
