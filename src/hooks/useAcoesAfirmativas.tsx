/**
 * As regras de ação afirmativa de um edital — PCD, cotas raciais e lactantes.
 *
 * 🔴 **Não há COLUNA para a data de corte da lactante.** Ela é derivada da etapa
 * `prova_objetiva` do cronograma — ver `src/lib/edital-acoes-afirmativas.ts` e o defeito
 * do Edital 003/2026 que justificou isso.
 *
 * 🔵 **Desde a rodada 13 (2026-09-19) existe o marcador `{{campo:data_corte_lactante}}`**, e ele
 * não contradiz o de cima: o marcador resolve pela MESMA derivação, em `useCamposDoEdital`.
 * Persistir a data continua proibido — é ela que envelhece calada quando a prova muda de dia.
 *
 * As três tabelas têm PK = `edital_id`: é uma linha por edital, então gravar é upsert.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface RegrasPcdLinha {
  percentual_reserva: number | null;
  leis_base: string | null;
  aceita_laudo_indeterminado: boolean | null;
  validade_meses_laudo_temporario: number | null;
  obriga_rubrica_todas_folhas: boolean | null;
  local_pericia: string | null;
}
export interface RegrasCotasLinha {
  percentual_reserva: number | null;
  lei_base: string | null;
  exige_autodeclaracao_datada_assinada: boolean | null;
}
export interface RegrasLactantesLinha {
  idade_maxima_lactente_meses: number | null;
  permite_compensacao_tempo: boolean | null;
  tempo_maximo_compensacao_minutos: number | null;
  intervalos_permitidos: number | null;
  exige_acompanhante_maior: boolean | null;
}

export function useAcoesAfirmativas(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ⚠️ As três consultas são ESCRITAS UMA A UMA, de propósito. A primeira versão tinha um
  // helper `uma<T>(tabela)` que chamava `useQuery` lá dentro — e o `react-hooks/
  // rules-of-hooks` recusou, com razão: hook dentro de função que não é hook é frágil por
  // construção, e basta alguém pôr o helper num `if` ou num `map` para a ordem dos hooks
  // quebrar em runtime, sem erro de compilação.
  const pcd = useQuery({
    queryKey: ["regras_pcd", editalId],
    queryFn: async () => {
      const { data, error } = await supabase.from("regras_pcd").select("*").eq("edital_id", editalId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as RegrasPcdLinha | null;
    },
    enabled: !!editalId,
  });

  const cotas = useQuery({
    queryKey: ["regras_cotas_raciais", editalId],
    queryFn: async () => {
      const { data, error } = await supabase.from("regras_cotas_raciais").select("*").eq("edital_id", editalId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as RegrasCotasLinha | null;
    },
    enabled: !!editalId,
  });

  const lactantes = useQuery({
    queryKey: ["regras_lactantes", editalId],
    queryFn: async () => {
      const { data, error } = await supabase.from("regras_lactantes").select("*").eq("edital_id", editalId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as RegrasLactantesLinha | null;
    },
    enabled: !!editalId,
  });

  const gravar = useMutation({
    mutationFn: async ({
      tabela,
      dados,
    }: {
      tabela: "regras_pcd" | "regras_cotas_raciais" | "regras_lactantes";
      dados: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from(tabela)
        .upsert({ ...dados, edital_id: editalId! }, { onConflict: "edital_id" });
      if (error) throw error;
      return tabela;
    },
    onSuccess: (tabela) => queryClient.invalidateQueries({ queryKey: [tabela, editalId] }),
    onError: (e: { message: string }) => {
      // A única recusa que o usuário encontra de verdade: tempo de compensação declarado
      // com a compensação desligada. Mensagem crua de CHECK não diz o que fazer.
      const desc = /chk_lactante_tempo_coerente/.test(e.message)
        ? "Este edital declara que NÃO há compensação de tempo, mas tem um tempo máximo preenchido. Escolha um dos dois."
        : e.message;
      toast({ title: "Erro ao salvar a regra", description: desc, variant: "destructive" });
    },
  });

  return {
    pcd: pcd.data ?? null,
    cotas: cotas.data ?? null,
    lactantes: lactantes.data ?? null,
    isLoading: pcd.isLoading || cotas.isLoading || lactantes.isLoading,
    gravar: gravar.mutate,
    isGravando: gravar.isPending,
  };
}
