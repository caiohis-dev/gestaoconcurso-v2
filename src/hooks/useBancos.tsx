import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Banco {
  codigo_compe: string;
  nome: string;
  apelido: string;
}

export function useBancos() {
  const query = useQuery({
    queryKey: ['bancos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bancos')
        .select('codigo_compe, nome, apelido')
        .order('apelido', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Banco[];
    },
    staleTime: 1000 * 60 * 60, // 1h — catálogo raramente muda
  });

  return {
    bancos: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export const TIPO_CONTA_OPTIONS = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Conta Poupança' },
] as const;
