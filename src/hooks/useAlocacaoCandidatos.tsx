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
  /**
   * COMO ele foi parar na sala. `manual` = alguém olhou o pedido e escolheu; `automatica`
   * = o PLANO o colocou lá, e o pedido individual NÃO foi conferido; `null` = pendente.
   * Tratar os dois primeiros como a mesma coisa daria por resolvido o que não está.
   */
  origem: "automatica" | "manual" | null;
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
      const manuais: Record<string, number> = {};
      for (const linha of data ?? []) {
        porSala[linha.sala_id] = Number(linha.total);
        manuais[linha.sala_id] = Number(linha.manuais);
      }
      // Dois números, não um: `total` é o que os cards de sala mostram; `manuais` é a base
      // do rascunho, porque aplicar o plano apaga as automáticas.
      return { porSala, manuais };
    },
  });

  // `error` exposto de propósito: carregando e falhou dariam o mesmo `{}` que "ninguém
  // alocado" — é o "vazio enquanto carrega" com a segunda porta de entrada (a lição de
  // useCapacidadeTemplateUnidades).
  return {
    ocupacao: query.data?.porSala ?? {},
    manuaisPorSala: query.data?.manuais ?? {},
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
        origem: e.origem as "automatica" | "manual" | null,
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
  /** PCD SEM texto de pedido — o bloco próprio deles. */
  pcdADistribuir: number;
  /** Quem escreveu um pedido de sala; ganha do PCD no desempate (blocos são disjuntos). */
  salaEspecialADistribuir: number;
  especiais: number;
  jaAlocados: number;
  /** Quantos foram RETIRADOS da alocação automática à mão. */
  foraDoAutomatico: number;
  /**
   * Marcados que AINDA estão em sala. É o estado transitório da decisão D1 (marcar não
   * mexe em sala; quem tira é o próximo "Aplicar"), e a tela PRECISA anunciá-lo: enquanto
   * for > 0, o total de alocados inclui gente que sai na próxima aplicação.
   */
  foraComSala: number;
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
        pcdADistribuir: Number(c.pcd_a_distribuir),
        salaEspecialADistribuir: Number(c.sala_especial_a_distribuir),
        especiais: Number(c.especiais),
        jaAlocados: Number(c.ja_alocados),
        foraDoAutomatico: Number(c.fora_do_automatico),
        foraComSala: Number(c.fora_com_sala),
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

/** Uma linha da lista de todos os inscritos da prova. */
export interface CandidatoDaProva {
  candidatoId: string;
  nInscricao: string;
  nome: string;
  cargoNome: string;
  salaEspecial: string | null;
  portadorDeficiencia: boolean;
  bloco: "comum" | "pcd" | "sala_especial";
  salaId: string | null;
  /** O id da linha de alocação — é por ele que se retira, sem segunda consulta. */
  alocacaoId: string | null;
  /**
   * COMO ele foi parar na sala. Decide o que a tela promete ao retirar: `automatica`
   * volta no próximo "Aplicar"; `manual` é definitivo.
   */
  origem: "automatica" | "manual" | null;
  foraDoAutomatico: boolean;
}

/**
 * A listagem paginada de TODOS os inscritos do edital da prova.
 *
 * ⚠️ É RPC e não `useCandidatos` porque as colunas de que a tela precisa são POR PROVA
 * (a marcação e a sala), e `candidatos` não sabe de prova. As REGRAS DE BUSCA são as
 * mesmas de propósito — duas telas discordando sobre quem é "o inscrito" é dívida cara.
 *
 * ⚠️ Sem paginação a tela morre: são 7.231 linhas. O `total` vem da RPC (window function)
 * e fala do conjunto INTEIRO, nunca da página — é ele que diz que os outros existem.
 */
export function useCandidatosDaProva({
  provaId,
  busca = "",
  cargoId = null,
  pagina = 0,
  porPagina = 25,
  semSala = false,
}: {
  provaId: string;
  busca?: string;
  cargoId?: string | null;
  pagina?: number;
  porPagina?: number;
  /** Recorta quem ainda não tem sala. Vai ao SERVIDOR — ver o comentário do queryFn. */
  semSala?: boolean;
}) {
  const termo = busca.trim();

  const query = useQuery({
    queryKey: [
      "candidatos_alocacao",
      provaId,
      "lista",
      termo,
      cargoId,
      pagina,
      porPagina,
      semSala,
    ],
    enabled: !!provaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("candidatos_da_prova", {
        p_prova_id: provaId,
        p_busca: termo || null,
        p_cargo_id: cargoId,
        p_pagina: pagina,
        p_por_pagina: porPagina,
        // 🔴 O recorte vai ao SERVIDOR. Filtrá-lo aqui deixaria o `total` falando do
        // conjunto inteiro enquanto a tabela mostra um subconjunto — a paginação passaria
        // a prometer páginas que não existem, e a tela mentiria sem quebrar nada.
        p_sem_sala: semSala,
      });
      if (error) throw error;
      const linhas = (data ?? []).map((c) => ({
        candidatoId: c.candidato_id,
        nInscricao: c.n_inscricao,
        nome: c.nome,
        cargoNome: c.cargo_nome,
        salaEspecial: c.sala_especial,
        portadorDeficiencia: c.portador_deficiencia,
        bloco: c.bloco as CandidatoDaProva["bloco"],
        salaId: c.sala_id,
        alocacaoId: c.alocacao_id,
        origem: c.origem as CandidatoDaProva["origem"],
        foraDoAutomatico: c.fora_do_automatico,
      })) as CandidatoDaProva[];
      // O total repete em cada linha; página vazia significa zero de verdade.
      return { linhas, total: data?.length ? Number(data[0].total) : 0 };
    },
  });

  return {
    candidatos: query.data?.linhas ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/**
 * Retirar / devolver um inscrito à alocação automática.
 *
 * 🔴 Marcar NÃO MEXE EM SALA (decisão D1). Ele sai dos contadores dos blocos na hora, mas
 * a alocação que já tenha só é desfeita no próximo "Aplicar" — a regra de que apenas o
 * Aplicar escreve em sala continua valendo. Enquanto isso, `foraComSala` avisa.
 *
 * INSERT/DELETE direto via PostgREST, o padrão dominante do repo: as barreiras são o
 * trigger (PF001 congelamento, AL005 edital errado) e a RLS. Pré-check aqui seria corrida.
 */
export function useForaDoAutomatico() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ["candidatos_alocacao"] });

  const mutation = useMutation({
    mutationFn: async ({
      provaId,
      candidatoId,
      retirar,
    }: {
      provaId: string;
      candidatoId: string;
      retirar: boolean;
    }) => {
      if (retirar) {
        const { error } = await supabase
          .from("candidatos_fora_do_automatico")
          .insert({ prova_id: provaId, candidato_id: candidatoId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("candidatos_fora_do_automatico")
          .delete()
          .eq("prova_id", provaId)
          .eq("candidato_id", candidatoId);
        if (error) throw error;
      }
    },
    // Invalida a árvore inteira: os contadores dos blocos mudam junto com a lista.
    onSuccess: invalidar,
    onError: (error: { message: string; code?: string }) => {
      toast({
        title: "Não foi possível mudar a marcação",
        description: mensagemErroAlocacao(error),
        variant: "destructive",
      });
    },
  });

  return { alternar: mutation.mutateAsync, isAlternando: mutation.isPending };
}

/**
 * Quantas marcações de "fora da alocação automática" existem para os inscritos de um
 * edital — somando TODAS as provas dele.
 *
 * 🔴 EXISTE PARA UM AVISO, não para uma tela. A FK de `candidato_id` é ON DELETE CASCADE
 * (decisão P1 do roadmap), então a troca total apaga os candidatos e leva as marcações
 * junto, EM SILÊNCIO — e como a reimportação recria todo mundo com ids novos, elas não
 * teriam como ser preservadas de qualquer jeito. A mitigação combinada foi avisar antes,
 * e este contador é o aviso.
 *
 * ⚠️ A contagem atravessa provas de propósito: o Edital 001 tem DUAS, e a troca total
 * apaga os candidatos das duas de uma vez. Contar só a prova aberta prometeria um número
 * menor que a perda real.
 *
 * O filtro vai por embed `!inner` porque a tabela não tem `edital_id` — quem tem é o
 * candidato. `head: true` traz só o número: contar não pode custar baixar as linhas.
 */
export function useMarcacoesDoEdital(editalId: string | null) {
  const query = useQuery({
    queryKey: ["candidatos_fora_do_automatico", "por-edital", editalId],
    enabled: !!editalId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("candidatos_fora_do_automatico")
        .select("candidato_id, candidatos!inner(edital_id)", { count: "exact", head: true })
        .eq("candidatos.edital_id", editalId as string);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // `error` exposto: falha e "nenhuma marcação" dariam o mesmo 0, e este número existe
  // justamente para avisar de uma perda. Zero silencioso aqui esconde o aviso.
  return { marcacoes: query.data ?? 0, isLoading: query.isLoading, error: query.error };
}
