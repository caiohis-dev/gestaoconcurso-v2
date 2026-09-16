/**
 * A matriz da prova objetiva de um edital.
 *
 * 🔴 A configuração é **por cargo**, não por edital: os editais dizem "A Prova Objetiva
 * PARA OS CANDIDATOS ÀS VAGAS DE <cargo> constará de…". Medido nos três.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ConfigProva, Disciplina } from "@/lib/edital-prova";

export interface DisciplinaGravada extends Disciplina {
  id: string;
  edital_cargo_id: string;
  ordem: number;
}
export interface ConfigGravada extends ConfigProva {
  edital_cargo_id: string;
}

export function useProvaObjetiva(editalCargoIds: readonly string[]) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chave = [...editalCargoIds].sort().join(",");

  const configs = useQuery({
    queryKey: ["provas_objetivas_config", chave],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provas_objetivas_config").select("*").in("edital_cargo_id", editalCargoIds as string[]);
      if (error) throw error;
      return (data ?? []) as ConfigGravada[];
    },
    enabled: editalCargoIds.length > 0,
  });

  const disciplinas = useQuery({
    queryKey: ["provas_disciplinas", chave],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provas_disciplinas")
        .select("id, edital_cargo_id, nome_disciplina, quantidade_questoes, peso_por_questao, ordem")
        .in("edital_cargo_id", editalCargoIds as string[])
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DisciplinaGravada[];
    },
    enabled: editalCargoIds.length > 0,
  });

  const erro = (e: { message: string }) => {
    const desc = /provas_disciplinas_cargo_nome_key/.test(e.message)
      ? "Esta disciplina já está na matriz deste cargo."
      : /chk_prova_caderno_dentro_da_duracao/.test(e.message)
        ? "O candidato não pode levar o caderno depois do fim da prova."
        : e.message;
    toast({ title: "Erro ao salvar", description: desc, variant: "destructive" });
  };

  const salvarConfig = useMutation({
    mutationFn: async (c: Partial<ConfigGravada> & { edital_cargo_id: string }) => {
      const { error } = await supabase
        .from("provas_objetivas_config").upsert(c, { onConflict: "edital_cargo_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["provas_objetivas_config", chave] }),
    onError: erro,
  });

  const salvarDisciplina = useMutation({
    mutationFn: async (d: Partial<DisciplinaGravada> & { edital_cargo_id: string; nome_disciplina: string; quantidade_questoes: number }) => {
      const { error } = d.id
        ? await supabase.from("provas_disciplinas").update(d).eq("id", d.id)
        : await supabase.from("provas_disciplinas").insert(d);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["provas_disciplinas", chave] }),
    onError: erro,
  });

  const removerDisciplina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("provas_disciplinas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["provas_disciplinas", chave] }),
    onError: erro,
  });

  return {
    configs: configs.data ?? [],
    disciplinas: disciplinas.data ?? [],
    isLoading: configs.isLoading || disciplinas.isLoading,
    salvarConfig: salvarConfig.mutate,
    salvarDisciplina: salvarDisciplina.mutate,
    removerDisciplina: removerDisciplina.mutate,
  };
}
