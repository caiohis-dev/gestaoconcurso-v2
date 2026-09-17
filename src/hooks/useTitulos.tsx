/**
 * A prova de títulos de um edital.
 *
 * 🔴 **Duas chaves diferentes, de propósito.** A config é do EDITAL (o item 13.4 declara
 * o teto uma vez, para os dois quadros) e os títulos são do CARGO (os Quadros III e IV
 * são listas distintas). Difere da fatia 5, onde tudo pende do cargo — e a razão está no
 * documento, não na conveniência do código. Ver a migration 20260916234302.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ConfigTitulos, NivelTitulo, TituloItem } from "@/lib/edital-titulos";

export interface TituloGravado extends TituloItem {
  id: string;
  edital_cargo_id: string;
  ordem: number;
}

export function useTitulos(editalId: string | undefined, editalCargoIds: readonly string[]) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chave = [...editalCargoIds].sort().join(",");

  const config = useQuery({
    queryKey: ["titulos_config", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("titulos_config").select("*").eq("edital_id", editalId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as (ConfigTitulos & { edital_id: string }) | null;
    },
    enabled: !!editalId,
  });

  const itens = useQuery({
    queryKey: ["titulos_itens", chave],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("titulos_itens")
        .select("id, edital_cargo_id, ordem, nivel, descricao, area_exigida, carga_horaria_minima_horas, pontos_minimo, pontos_maximo")
        .in("edital_cargo_id", editalCargoIds as string[])
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TituloGravado[];
    },
    enabled: editalCargoIds.length > 0,
  });

  // As CHECKs que a tela consegue disparar viram frase acionável. ⚠️ O resto cai no
  // `e.message` cru de propósito: inventar texto para constraint que ninguém alcança
  // criaria mensagem que nunca é lida e envelhece sem ninguém notar.
  const erro = (e: { message: string }) => {
    const desc = /chk_titulo_pontos_coerentes/.test(e.message)
      ? "A pontuação mínima não pode ser maior que a máxima."
      : /chk_titulo_pontos_positivos/.test(e.message)
        ? "Um título precisa valer mais que zero ponto."
        : /chk_titulo_descricao/.test(e.message)
          ? "O título precisa de uma descrição — é a coluna “Títulos Aferíveis” do quadro publicado."
          : /chk_titulos_teto/.test(e.message)
            ? "O teto de pontos precisa ser maior que zero."
            : e.message;
    toast({ title: "Erro ao salvar", description: desc, variant: "destructive" });
  };

  const salvarConfig = useMutation({
    mutationFn: async (c: Partial<ConfigTitulos>) => {
      const { error } = await supabase
        .from("titulos_config")
        .upsert({ ...c, edital_id: editalId! }, { onConflict: "edital_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["titulos_config", editalId] }),
    onError: erro,
  });

  /**
   * ⚠️ `pontos_minimo` e `pontos_maximo` são OBRIGATÓRIOS na assinatura, sem padrão.
   *
   * 🔴 A primeira versão deste hook inseria `0, 0` como ponto de partida — e todo título
   * novo morreria em `chk_titulo_pontos_positivos`, porque zero é justamente o que o
   * banco recusa. A saída fácil seria mandar `1` no lugar; ela é pior: um título que vale
   * 1 ponto porque ninguém escolheu é exatamente o placeholder inventado que este módulo
   * existe para matar. Quem chama preenche, e a tela só habilita o botão quando há valor.
   */
  const salvarTitulo = useMutation({
    mutationFn: async (
      t: Partial<TituloGravado> & {
        edital_cargo_id: string;
        nivel: NivelTitulo;
        descricao: string;
        pontos_minimo: number;
        pontos_maximo: number;
      },
    ) => {
      const { error } = t.id
        ? await supabase.from("titulos_itens").update(t).eq("id", t.id)
        : await supabase.from("titulos_itens").insert(t);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["titulos_itens", chave] }),
    onError: erro,
  });

  const removerTitulo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("titulos_itens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["titulos_itens", chave] }),
    onError: erro,
  });

  return {
    config: config.data ?? null,
    itens: itens.data ?? [],
    isLoading: config.isLoading || itens.isLoading,
    salvarConfig: salvarConfig.mutate,
    salvarTitulo: salvarTitulo.mutate,
    removerTitulo: removerTitulo.mutate,
  };
}
