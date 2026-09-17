/**
 * Os critérios de desempate de um edital.
 *
 * 🔴 **Mover um critério troca DUAS posições, e o índice único não deixa passar pelo
 * estado intermediário.** Trocar A(1)↔B(2) direto falharia: ao gravar A=2, B ainda está em
 * 2. Por isso `mover` faz a troca em três passos, e o passo do meio usa uma posição
 * TEMPORÁRIA alta — é a mesma classe de problema que a RPC de reordenação de artigos
 * resolveu em transação na fatia 1.
 *
 * ⚠️ Aqui NÃO há RPC, e é escolha: a lista tem 4 a 7 itens, a troca é entre DOIS vizinhos,
 * e uma falha no meio deixa um critério na posição temporária — visível na tela, não
 * perdido. Na fatia 1 eram 300 artigos e a reescrita era da lista inteira.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Criterio, ListaDeDesempate } from "@/lib/edital-desempate";

export type CriterioGravado = Criterio;

/** Fora da faixa publicável, para o passo do meio da troca não colidir. */
const POSICAO_TEMPORARIA = 9999;

export function useDesempate(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chave = ["criterios_desempate", editalId];

  const criterios = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("criterios_desempate")
        .select("id, lista, ordem_prioridade, criterio_tipo, disciplina_referencia, cargo_id, aplica_a_todos_os_cargos")
        .eq("edital_id", editalId!)
        .order("ordem_prioridade", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CriterioGravado[];
    },
    enabled: !!editalId,
  });

  const erro = (e: { message: string }) => {
    const m = /criterios_desempate_(geral|cargo)_ordem_key/.test(e.message)
      ? "Já existe um critério nesta posição — um desempate não pode ter dois critérios empatados."
      : /chk_desempate_disciplina/.test(e.message)
        ? "Escolha a disciplina do critério. Um desempate por pontuação sem dizer em quê é inaplicável."
        : /chk_desempate_tipo_da_lista/.test(e.message)
          ? "Este critério pertence à outra lista."
          : e.message;
    toast({ title: "Não foi possível salvar", description: m, variant: "destructive" });
  };

  const salvar = useMutation({
    // ⚠️ `ordem_prioridade` é OBRIGATÓRIA na assinatura, e não por acaso: a coluna não tem
    // DEFAULT no banco. Uma posição omitida não teria para onde cair — e a posição é o
    // conteúdo deste capítulo, não um detalhe de apresentação.
    mutationFn: async (
      c: Partial<CriterioGravado> & {
        lista: ListaDeDesempate;
        criterio_tipo: string;
        ordem_prioridade: number;
      },
    ) => {
      const { error } = c.id
        ? await supabase.from("criterios_desempate").update(c).eq("id", c.id)
        : await supabase.from("criterios_desempate").insert({
            ...c, edital_id: editalId!, aplica_a_todos_os_cargos: true, cargo_id: null,
          });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: erro,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("criterios_desempate").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: erro,
  });

  const mover = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: -1 | 1 }) => {
      const todos = criterios.data ?? [];
      const atual = todos.find((x) => x.id === id);
      if (!atual) return;
      const vizinho = todos.find(
        (x) => x.lista === atual.lista && x.ordem_prioridade === atual.ordem_prioridade + delta,
      );
      if (!vizinho) return;

      const passo = async (alvo: string, ordem: number) => {
        const { error } = await supabase
          .from("criterios_desempate").update({ ordem_prioridade: ordem }).eq("id", alvo);
        if (error) throw error;
      };
      // Os três passos. Sem o do meio, o índice único recusa a primeira gravação.
      await passo(atual.id, POSICAO_TEMPORARIA);
      await passo(vizinho.id, atual.ordem_prioridade);
      await passo(atual.id, vizinho.ordem_prioridade);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: erro,
  });

  return {
    criterios: criterios.data ?? [],
    isLoading: criterios.isLoading,
    salvar: salvar.mutate,
    remover: remover.mutate,
    mover: mover.mutate,
    isMexendo: mover.isPending || salvar.isPending,
  };
}
