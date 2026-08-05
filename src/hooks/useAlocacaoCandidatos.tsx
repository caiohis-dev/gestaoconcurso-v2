import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { mensagemErroAlocacao } from "@/lib/alocacao-candidatos";
import type { EntradaPlano } from "@/lib/alocacao-dnd";

/**
 * O módulo Alocação de Candidatos — o vínculo candidato ↔ sala (`candidatos_alocacao`).
 *
 * ⚠️ Todas as leituras aqui são RPC SECURITY INVOKER ou tabela com RLS de admin: para
 * quem não é admin elas voltam VAZIAS SEM ERRO. As rotas do módulo são guardadas em
 * admin no App.tsx, mas qualquer tela futura de coordenador que consumir estes hooks
 * mostraria "0 alocados" com convicção — é a mesma armadilha do painel `isAdmin &&`
 * de GerenciarProva.
 */

/** Uma linha da lista de uma sala: a alocação + o inscrito por trás dela. */
export interface CandidatoAlocado {
  alocacaoId: string;
  candidatoId: string;
  nome: string;
  nInscricao: string;
  cargo: string | null;
  origem: "automatica" | "manual";
}

/** Um candidato de atendimento especial da prova, pendente (salaId nula) ou atendido. */
export interface EspecialDaProva {
  candidatoId: string;
  nInscricao: string;
  nome: string;
  cargo: string | null;
  salaEspecial: string | null;
  portadorDeficiencia: boolean;
  salaId: string | null;
}

/** Quantos alocados cada sala da prova tem. RPC: o PostgREST não agrega com GROUP BY. */
export function useOcupacaoPorSala(provaId: string) {
  const query = useQuery({
    queryKey: ["candidatos_alocacao", provaId, "ocupacao"],
    enabled: !!provaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contar_alocados_por_sala", {
        p_prova_id: provaId,
      });
      if (error) throw error;
      const porSala: Record<string, number> = {};
      for (const linha of data ?? []) {
        porSala[linha.sala_id] = Number(linha.total);
      }
      return porSala;
    },
  });

  // `error` exposto de propósito: carregando e falhou dariam o mesmo `{}` que "ninguém
  // alocado" — é o "vazio enquanto carrega" com a segunda porta de entrada (a lição de
  // useCapacidadeTemplateUnidades).
  return {
    ocupacao: query.data ?? {},
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Os especiais do edital da prova (a MESMA definição da RPC de distribuição). */
export function useEspeciaisDaProva(provaId: string) {
  const query = useQuery({
    queryKey: ["candidatos_alocacao", provaId, "especiais"],
    enabled: !!provaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("especiais_da_prova", {
        p_prova_id: provaId,
      });
      if (error) throw error;
      return (data ?? []).map((e) => ({
        candidatoId: e.candidato_id,
        nInscricao: e.n_inscricao,
        nome: e.nome,
        cargo: e.cargo,
        salaEspecial: e.sala_especial,
        portadorDeficiencia: e.portador_deficiencia,
        salaId: e.sala_id,
      })) as EspecialDaProva[];
    },
  });

  return {
    especiais: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Quem está numa sala. Sem paginação, e é decisão: uma sala física tem dezenas de
 * lugares — o limite de 1.000 do PostgREST está ordens de grandeza acima. A ordenação
 * é no cliente pelo mesmo motivo (a lista inteira já está na mão).
 */
export function useCandidatosDaSala(salaId: string | null) {
  const query = useQuery({
    queryKey: ["candidatos_alocacao", "sala", salaId],
    enabled: !!salaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidatos_alocacao")
        .select("id, origem, candidato_id, candidatos ( nome, n_inscricao, cargos ( nome ) )")
        .eq("sala_id", salaId as string);
      if (error) throw error;
      const linhas = (data ?? []).map((a) => ({
        alocacaoId: a.id,
        candidatoId: a.candidato_id,
        nome: a.candidatos?.nome ?? "(inscrito não legível)",
        nInscricao: a.candidatos?.n_inscricao ?? "—",
        cargo: a.candidatos?.cargos?.nome ?? null,
        origem: a.origem as "automatica" | "manual",
      }));
      linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      return linhas as CandidatoAlocado[];
    },
  });

  return {
    candidatos: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Onde está fulano: busca por nome ou nº de inscrição ENTRE OS ALOCADOS da prova. */
export function useOndeEsta(provaId: string, busca: string) {
  const termo = busca.trim();

  const query = useQuery({
    queryKey: ["candidatos_alocacao", provaId, "busca", termo],
    enabled: !!provaId && termo.length >= 2,
    queryFn: async () => {
      // Mesma sanitização de useCandidatos: o termo entra numa expressão .or.
      const escapado = termo.replace(/[%,()]/g, " ");
      const { data, error } = await supabase
        .from("candidatos_alocacao")
        .select("id, sala_id, candidatos!inner ( id, nome, n_inscricao )")
        .eq("prova_id", provaId)
        .or(`nome.ilike.%${escapado}%,n_inscricao.ilike.%${escapado}%`, {
          referencedTable: "candidatos",
        })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((a) => ({
        alocacaoId: a.id,
        salaId: a.sala_id,
        nome: a.candidatos.nome,
        nInscricao: a.candidatos.n_inscricao,
      }));
    },
  });

  return {
    resultados: query.data ?? [],
    isLoading: query.isLoading,
  };
}

/**
 * Ocupação por UNIDADE, separando `manuais` (que o plano preserva) do total.
 *
 * ⚠️ O quadro de arrasto parte das MANUAIS, não do total: aplicar o plano apaga as
 * automáticas, então contá-las diria "sem vaga" numa unidade que o plano vai esvaziar.
 */
export function useOcupacaoPorUnidade(provaId: string) {
  const query = useQuery({
    queryKey: ["candidatos_alocacao", provaId, "ocupacao-unidade"],
    enabled: !!provaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contar_alocados_por_unidade", {
        p_prova_id: provaId,
      });
      if (error) throw error;
      const por: Record<string, { total: number; manuais: number }> = {};
      for (const l of data ?? []) {
        por[l.unidade_id] = { total: Number(l.total), manuais: Number(l.manuais) };
      }
      return por;
    },
  });

  return { porUnidade: query.data ?? {}, isLoading: query.isLoading, error: query.error };
}

/** Um cargo na faixa de arrasto. `aDistribuir` é o que o PLANO pode colocar. */
export interface CargoDaProva {
  cargoId: string | null;
  nome: string;
  aDistribuir: number;
  especiais: number;
  jaAlocados: number;
  total: number;
}

/**
 * Os cargos do edital para a faixa de arrasto.
 *
 * ⚠️ `aDistribuir` NÃO desconta quem já está alocado pela distribuição — só os especiais
 * e os alocados à mão. Aplicar um plano apaga `origem='automatica'` e reinsere, então
 * quem está lá volta a estar disponível. Descontá-los abriria a tela com a faixa vazia
 * numa prova já distribuída.
 */
export function useCargosDaProva(provaId: string) {
  const query = useQuery({
    queryKey: ["candidatos_alocacao", provaId, "cargos"],
    enabled: !!provaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cargos_pendentes_da_prova", {
        p_prova_id: provaId,
      });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        cargoId: c.cargo_id,
        nome: c.cargo_nome,
        aDistribuir: Number(c.a_distribuir),
        especiais: Number(c.especiais),
        jaAlocados: Number(c.ja_alocados),
        total: Number(c.total),
      })) as CargoDaProva[];
    },
  });

  return { cargos: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/**
 * Aplica o RASCUNHO montado por arrasto. Roda INTEIRO no banco, em transação: ou o plano
 * todo entra, ou nada muda. As recusas (AL001..AL004, AL008..AL010, PF001) já chegam em
 * português dizendo o que fazer — o toast as repassa intactas.
 */
export function useAplicarPlano() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({ provaId, plano }: { provaId: string; plano: EntradaPlano[] }) => {
      const { data, error } = await supabase.rpc("aplicar_plano_de_alocacao", {
        p_prova_id: provaId,
        p_plano: plano as unknown as Json,
      });
      if (error) throw error;
      // RETURNS TABLE com uma linha: o PostgREST entrega como array.
      const linha = Array.isArray(data) ? data[0] : data;
      return linha as {
        alocados: number;
        preservados: number;
        pendentes_especiais: number;
        sem_sala: number;
      };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["candidatos_alocacao"] });
      toast({
        title: "Plano aplicado",
        description:
          `${r.alocados} candidato(s) alocado(s)` +
          (r.preservados > 0 ? `, ${r.preservados} alocação(ões) manual(is) preservada(s)` : "") +
          // Os dois pendentes são coisas DIFERENTES e não podem virar um número só:
          // especial espera decisão humana, sem_sala espera outro arrasto.
          (r.sem_sala > 0 ? `. ${r.sem_sala} inscrito(s) ficaram sem sala` : "") +
          (r.pendentes_especiais > 0
            ? `. ${r.pendentes_especiais} pedido(s) de atendimento especial aguardam alocação manual.`
            : "."),
      });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Plano recusado",
        description: mensagemErroAlocacao(error),
        variant: "destructive",
      });
    },
  });

  return { aplicar: mutation.mutateAsync, isAplicando: mutation.isPending };
}

/**
 * Incluir à mão. INSERT direto via PostgREST — as barreiras (sala lotada, edital errado,
 * prova finalizada, já alocado) são os triggers e constraints do banco, não um pré-check
 * aqui: pré-check é corrida, e é para ser removido, não estendido.
 */
export function useIncluirNaSala() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({
      candidatoId,
      salaId,
      provaId,
    }: {
      candidatoId: string;
      salaId: string;
      provaId: string;
    }) => {
      const { error } = await supabase.from("candidatos_alocacao").insert({
        candidato_id: candidatoId,
        sala_id: salaId,
        prova_id: provaId,
        origem: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidatos_alocacao"] });
      toast({ title: "Candidato incluído na sala" });
    },
    onError: (error: { message: string; code?: string }) => {
      toast({
        title: "Inclusão recusada",
        description: mensagemErroAlocacao(error),
        variant: "destructive",
      });
    },
  });

  return { incluir: mutation.mutateAsync, isIncluindo: mutation.isPending };
}

/** Retirar da sala. A prova finalizada recusa (PF001) — a mensagem passa intacta. */
export function useRetirarDaSala() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (alocacaoId: string) => {
      const { error } = await supabase
        .from("candidatos_alocacao")
        .delete()
        .eq("id", alocacaoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidatos_alocacao"] });
      toast({ title: "Candidato retirado da sala" });
    },
    onError: (error: { message: string; code?: string }) => {
      toast({
        title: "Retirada recusada",
        description: mensagemErroAlocacao(error),
        variant: "destructive",
      });
    },
  });

  return { retirar: mutation.mutateAsync, isRetirando: mutation.isPending };
}
