/**
 * As ementas do Anexo de conteúdo programático.
 *
 * ⚠️ **Sem `buscar-em-fatias`, e isso é medido.** O R2 do roadmap mandava conferir o teto
 * de 1.000 linhas do PostgREST, como na fatia 7. Medido: as ementas são POUCAS e LONGAS —
 * o Anexo I do Edital 002 tem ~11 delas, o do 003 tem 6. Duas ordens de grandeza abaixo do
 * teto, e paginar aqui seria cerimônia sobre um risco que o dado não sustenta.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Ementa } from "@/lib/edital-conteudo";

export interface EmentaGravada extends Ementa {
  ordem: number;
}

export function useConteudoProgramatico(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chave = ["conteudo_programatico", editalId];

  const ementas = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conteudo_programatico")
        .select("id, cargo_id, aplica_a_todos_os_cargos, nome_disciplina, texto_ementa, ordem")
        .eq("edital_id", editalId!)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmentaGravada[];
    },
    enabled: !!editalId,
  });

  const erro = (e: { message: string }) => {
    const m = /conteudo_programatico_comum_key/.test(e.message)
      ? "Já existe uma ementa comum para esta disciplina neste edital."
      : /conteudo_programatico_por_cargo_key/.test(e.message)
        ? "Este cargo já tem uma ementa para esta disciplina."
        : /chk_conteudo_ementa/.test(e.message)
          ? "A ementa não pode ficar em branco — uma disciplina sem programa deixa o candidato sem o que estudar."
          : /chk_conteudo_escopo/.test(e.message)
            ? "Escolha se a ementa vale para um cargo específico ou para todos."
            : e.message;
    toast({ title: "Não foi possível salvar", description: m, variant: "destructive" });
  };

  const salvar = useMutation({
    mutationFn: async (
      e: Partial<EmentaGravada> & { nome_disciplina: string; texto_ementa: string },
    ) => {
      const { error } = e.id
        ? await supabase.from("conteudo_programatico").update(e).eq("id", e.id)
        : await supabase.from("conteudo_programatico").insert({ ...e, edital_id: editalId! });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: erro,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conteudo_programatico").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: erro,
  });

  return {
    ementas: ementas.data ?? [],
    isLoading: ementas.isLoading,
    salvar: salvar.mutate,
    remover: remover.mutate,
    isSalvando: salvar.isPending,
  };
}
