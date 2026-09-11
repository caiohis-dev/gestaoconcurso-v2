import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Quais funções de colaborador já estão em uso — e portanto não podem ser excluídas.
 *
 * "Em uso" = aparece em `valores_funcao_prova`, `colaboradores_prova` ou
 * `meta_colaboradores_unidade`. A conta é feita NO BANCO, pela RPC `funcoes_em_uso`.
 *
 * 🔴 Até 2026-09-10 este hook baixava as TRÊS tabelas inteiras e montava o `Set` no
 * cliente. Medido no banco local (cópia de produção): **42.778 bytes em 3 requisições**
 * (554 + 186 + 24 linhas) para produzir um punhado de booleanos. Hoje são **680 bytes em
 * uma**, com 17 ids.
 *
 * ⚠️ O ganho maior não é o tamanho: é o **teto de `max_rows`**. O PostgREST trunca a
 * resposta em 1000 linhas **sem erro**, e com as três consultas cruas passar desse teto
 * faria o `Set` nascer incompleto — o botão de excluir deixaria de desabilitar. Nenhum
 * conserto no cliente alcança isso; agregar no banco é o que fecha.
 *
 * ⚠️ **Isto é CONVENIÊNCIA, não barreira** — e é importante não confundir. Quem impede a
 * exclusão de função em uso são as **FKs `RESTRICT`** das três tabelas; o banco recusa
 * com `23503`, e `useFuncoesColaboradores` traduz a mensagem. Se este hook falhar ou
 * vier incompleto, o pior caso é um botão habilitado que devia estar cinza: o usuário
 * clica e recebe a recusa do banco. **Não há perda de dado por este caminho.**
 */
export function useFuncoesAssociadas() {
  const query = useQuery({
    queryKey: ['funcoes_associadas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('funcoes_em_uso');
      if (error) throw error;
      return new Set<string>((data ?? []) as string[]);
    },
  });

  return {
    funcoesAssociadas: query.data ?? new Set<string>(),
    isLoading: query.isLoading,
    error: query.error,
    isFuncaoAssociada: (funcaoId: string) => query.data?.has(funcaoId) ?? false,
  };
}
