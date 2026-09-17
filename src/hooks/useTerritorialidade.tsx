/**
 * Unidades de lotação, a distribuição do Quadro II e a abrangência do Anexo I.
 *
 * 🔴 **A leitura da abrangência passa por `buscarEmFatias`, sempre.** O Edital 004
 * publica 843 logradouros — 84% do `max_rows` de 1000 do PostgREST, que corta **sem erro
 * nenhum**. Um `.select()` solto devolveria 1000 e o anexo sairia incompleto, com uma rua
 * sumindo e ninguém percebendo. Já mordeu este repo duas vezes.
 *
 * ⚠️ E `buscarEmFatias` exige ORDEM ESTÁVEL: sem desempate único, o laço repete uma linha
 * e pula outra, também calado. Por isso `.order('ordem').order('id')`.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { buscarEmFatias } from "@/lib/buscar-em-fatias";
import type { VagasNaUnidade } from "@/lib/edital-territorialidade";

export interface UnidadeLotacao {
  id: string;
  nome: string;
  sigla: string | null;
  endereco: string | null;
  bairro: string | null;
}

export interface VagasGravadas extends VagasNaUnidade {
  id: string;
  edital_cargo_id: string;
  ordem: number;
}

export interface LinhaDeAbrangencia {
  id: string;
  unidade_lotacao_id: string;
  bairro: string | null;
  logradouro: string;
  ordem: number;
}

export function useUnidadesLotacao() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const unidades = useQuery({
    queryKey: ["unidades_lotacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades_lotacao").select("id, nome, sigla, endereco, bairro").order("nome");
      if (error) throw error;
      return (data ?? []) as UnidadeLotacao[];
    },
  });

  const salvar = useMutation({
    mutationFn: async (u: Partial<UnidadeLotacao> & { nome: string }) => {
      const { error } = u.id
        ? await supabase.from("unidades_lotacao").update(u).eq("id", u.id)
        : await supabase.from("unidades_lotacao").insert(u);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["unidades_lotacao"] }),
    onError: (e: { message: string }) =>
      toast({
        title: "Erro ao salvar a unidade",
        description: /unidades_lotacao_nome_key/.test(e.message)
          ? "Já existe uma unidade com este nome."
          : e.message,
        variant: "destructive",
      }),
  });

  return { unidades: unidades.data ?? [], isLoading: unidades.isLoading, salvar: salvar.mutate };
}

export function useTerritorialidade(editalId: string | undefined, editalCargoIds: readonly string[]) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chave = [...editalCargoIds].sort().join(",");
  const erro = (e: { message: string }) =>
    toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });

  const distribuicao = useQuery({
    queryKey: ["edital_cargo_unidades", chave],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edital_cargo_unidades")
        .select("id, edital_cargo_id, unidade_lotacao_id, codigo_inscricao, ordem, vagas_ampla_concorrencia, vagas_pcd, vagas_negros")
        .in("edital_cargo_id", editalCargoIds as string[])
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as VagasGravadas[];
    },
    enabled: editalCargoIds.length > 0,
  });

  const abrangencia = useQuery({
    queryKey: ["territorialidade_abrangencia", editalId],
    queryFn: () =>
      // 🔴 EM FATIAS. Ver o cabeçalho: 843 linhas num edital só.
      buscarEmFatias<LinhaDeAbrangencia>((de, ate) =>
        supabase
          .from("territorialidade_abrangencia")
          .select("id, unidade_lotacao_id, bairro, logradouro, ordem")
          .eq("edital_id", editalId!)
          .order("ordem", { ascending: true })
          .order("id", { ascending: true })
          .range(de, ate),
      ),
    enabled: !!editalId,
  });

  const salvarVagas = useMutation({
    mutationFn: async (v: Partial<VagasGravadas> & { edital_cargo_id: string; unidade_lotacao_id: string }) => {
      const { error } = v.id
        ? await supabase.from("edital_cargo_unidades").update(v).eq("id", v.id)
        : await supabase.from("edital_cargo_unidades").insert(v);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["edital_cargo_unidades", chave] }),
    onError: (e: { message: string }) =>
      toast({
        title: "Erro ao salvar",
        description: /edital_cargo_unidades_par_key/.test(e.message)
          ? "Esta unidade já está na distribuição deste cargo."
          : e.message,
        variant: "destructive",
      }),
  });

  const removerVagas = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("edital_cargo_unidades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["edital_cargo_unidades", chave] }),
    onError: erro,
  });

  /**
   * Importa o Anexo I de uma unidade em lote.
   *
   * 🔴 **TROCA TOTAL daquela unidade, e o número de linhas volta para quem chamou.** É o
   * que a importação de candidatos ensinou: quem importa precisa saber quantas entraram,
   * senão uma linha perdida no caminho não aparece em lugar nenhum.
   */
  const importarAbrangencia = useMutation({
    mutationFn: async (p: { unidadeId: string; linhas: { bairro: string | null; logradouro: string }[] }) => {
      const { error: eDel } = await supabase
        .from("territorialidade_abrangencia").delete()
        .eq("edital_id", editalId!).eq("unidade_lotacao_id", p.unidadeId);
      if (eDel) throw eDel;
      if (p.linhas.length === 0) return 0;
      const { data, error } = await supabase
        .from("territorialidade_abrangencia")
        .insert(p.linhas.map((l, i) => ({
          edital_id: editalId!, unidade_lotacao_id: p.unidadeId,
          bairro: l.bairro, logradouro: l.logradouro, ordem: i,
        })))
        .select("id");
      if (error) throw error;
      return (data ?? []).length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["territorialidade_abrangencia", editalId] });
      toast({ title: `${n} logradouro(s) importado(s)` });
    },
    onError: erro,
  });

  return {
    distribuicao: distribuicao.data ?? [],
    abrangencia: abrangencia.data ?? [],
    isLoading: distribuicao.isLoading || abrangencia.isLoading,
    salvarVagas: salvarVagas.mutate,
    removerVagas: removerVagas.mutate,
    importarAbrangencia: importarAbrangencia.mutate,
    isImportando: importarAbrangencia.isPending,
  };
}
