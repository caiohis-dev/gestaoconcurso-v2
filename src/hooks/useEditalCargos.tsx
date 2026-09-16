/**
 * Os cargos de um edital — o Quadro I.
 *
 * 🔴 **`cargos` é do módulo Candidatos e é a FONTE DE VERDADE** (decisão D2 do usuário,
 * 2026-09-16). Este hook lê o catálogo e escreve a parametrização por edital em
 * `edital_cargos`; ele NUNCA cria um segundo catálogo.
 *
 * ⚠️ Escrever `escolaridade_minima` ou `conselho_classe_obrigatorio` num cargo COM
 * inscritos passou a ser permitido em 2026-09-16 — a CG001 foi estreitada para barrar só
 * a troca do NOME (migration 20260916184254). Renomear continua recusado com `CG001`.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface EditalCargo {
  id: string;
  cargo_id: string;
  codigo_inscricao: string | null;
  habilitacao: string | null;
  carga_horaria_valor: number | null;
  carga_horaria_unidade: string | null;
  regime_plantao_permitido: boolean | null;
  vencimento_base: number | null;
  vagas_total: number | null;
  vagas_ampla_concorrencia: number | null;
  vagas_pcd: number | null;
  vagas_negros: number | null;
  cadastro_reserva: boolean | null;
}

const CAMPOS =
  "id, cargo_id, codigo_inscricao, habilitacao, carga_horaria_valor, carga_horaria_unidade, regime_plantao_permitido, vencimento_base, vagas_total, vagas_ampla_concorrencia, vagas_pcd, vagas_negros, cadastro_reserva";

export function useEditalCargos(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["edital_cargos", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edital_cargos")
        .select(CAMPOS)
        .eq("edital_id", editalId!);
      if (error) throw error;
      return (data ?? []) as EditalCargo[];
    },
    enabled: !!editalId,
  });

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ["edital_cargos", editalId] });

  /**
   * Traduz as duas recusas do banco que o usuário realmente encontra. Mensagem crua de
   * Postgres numa tela de redação de edital não diz o que fazer — é dívida que este repo
   * já pagou duas vezes.
   */
  const traduzir = (e: { message: string; code?: string }) => {
    if (e.code === "CG001" || /CG001/.test(e.message)) return e.message;
    if (/chk_edital_cargo_vagas_somam/.test(e.message))
      return "As vagas não somam o total declarado. Ajuste ampla concorrência, PCD ou cotas raciais.";
    if (/edital_cargos_edital_cargo_key/.test(e.message))
      return "Este cargo já está no Quadro I deste edital.";
    return e.message;
  };

  const salvar = useMutation({
    mutationFn: async (linha: Partial<EditalCargo> & { cargo_id: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("edital_cargos")
        .upsert(
          { ...linha, edital_id: editalId!, created_by: userData.user?.id },
          { onConflict: "edital_id,cargo_id" },
        );
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: { message: string; code?: string }) =>
      toast({ title: "Erro ao salvar o cargo", description: traduzir(e), variant: "destructive" }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("edital_cargos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: { message: string }) =>
      toast({ title: "Erro ao remover o cargo", description: e.message, variant: "destructive" }),
  });

  return {
    cargosDoEdital: query.data ?? [],
    isLoading: query.isLoading,
    salvar: salvar.mutate,
    isSalvando: salvar.isPending,
    remover: remover.mutate,
  };
}
