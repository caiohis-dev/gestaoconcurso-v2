/**
 * O cronograma de um edital.
 *
 * 🔴 **Etapa sem data é estado VÁLIDO no banco e ERRO no linter.** Esse par é deliberado:
 * gravar tem de ser possível enquanto se redige (senão o trabalho trava), e publicar não
 * — é assim que o `"dia XX/xx/2026"` do Edital 004 deixa de ser possível.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { EtapaCronograma } from "@/lib/edital-cronograma";

export interface EtapaGravada extends EtapaCronograma {
  id: string;
}

export function useCronograma(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["cronograma_etapas", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cronograma_etapas")
        .select("id, chave, nome_evento, tipo, datas, ordem")
        .eq("edital_id", editalId!)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EtapaGravada[];
    },
    enabled: !!editalId,
  });

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ["cronograma_etapas", editalId] });

  const traduzir = (e: { message: string }) => {
    if (/chk_cronograma_cardinalidade/.test(e.message))
      return "A quantidade de datas não combina com o tipo: intervalo pede duas, data única pede uma.";
    if (/chk_cronograma_intervalo_ordenado/.test(e.message))
      return "O intervalo termina antes de começar.";
    return e.message;
  };

  const salvar = useMutation({
    mutationFn: async (etapa: Partial<EtapaGravada> & { nome_evento: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const linha = { ...etapa, edital_id: editalId!, created_by: userData.user?.id };
      const { error } = etapa.id
        ? await supabase.from("cronograma_etapas").update(linha).eq("id", etapa.id)
        : await supabase.from("cronograma_etapas").insert(linha);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: { message: string }) =>
      toast({ title: "Erro ao salvar a etapa", description: traduzir(e), variant: "destructive" }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cronograma_etapas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: { message: string }) =>
      toast({ title: "Erro ao remover a etapa", description: e.message, variant: "destructive" }),
  });

  return {
    etapas: query.data ?? [],
    isLoading: query.isLoading,
    salvar: salvar.mutate,
    isSalvando: salvar.isPending,
    remover: remover.mutate,
  };
}
