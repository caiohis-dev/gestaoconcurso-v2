/**
 * Inscrição, taxas, isenção e canais de um edital.
 *
 * 🔴 **A taxa NÃO tem tabela própria**: é a coluna `edital_cargos.taxa_inscricao`, porque
 * a relação é 1:1 com o cargo do edital. Quem a grava é `useEditalCargos`; aqui ela só é
 * lida junto do resto, para o linter poder conferir tudo de uma vez.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { CriterioIsencao, TipoCriterioIsencao } from "@/lib/edital-inscricao";

export interface CriterioGravado extends CriterioIsencao {
  id: string;
  observacao: string | null;
  ordem: number;
}

export interface CanalGravado {
  id: string;
  tipo_canal: string;
  rotulo: string;
  endereco: string | null;
  horario_funcionamento: string | null;
  ordem: number;
}

export interface ConfigInscricao {
  documentacao_isencao_vale_para_um_cargo: boolean | null;
  limite_envelopes_por_candidato: number | null;
}

export function useInscricao(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const erro = (e: { message: string }) => {
    const m = /regras_isencao_edital_tipo_key/.test(e.message)
      ? "Este critério de isenção já está no edital."
      : /chk_isencao_doacoes/.test(e.message)
        ? "O mínimo de doações precisa ser maior que zero."
        : /chk_canal_rotulo/.test(e.message)
          ? "O canal precisa de um rótulo — é como ele aparece na lista."
          : e.message;
    toast({ title: "Não foi possível salvar", description: m, variant: "destructive" });
  };

  const criterios = useQuery({
    queryKey: ["regras_isencao", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regras_isencao")
        .select("id, tipo_criterio, lei_referencia, minimo_doacoes_sangue_12m, redome_exige_ano_vigente, observacao, ordem")
        .eq("edital_id", editalId!)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CriterioGravado[];
    },
    enabled: !!editalId,
  });

  const canais = useQuery({
    queryKey: ["edital_canais_atendimento", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edital_canais_atendimento")
        .select("id, tipo_canal, rotulo, endereco, horario_funcionamento, ordem")
        .eq("edital_id", editalId!)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CanalGravado[];
    },
    enabled: !!editalId,
  });

  const config = useQuery({
    queryKey: ["inscricao_config", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscricao_config")
        .select("documentacao_isencao_vale_para_um_cargo, limite_envelopes_por_candidato")
        .eq("edital_id", editalId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ConfigInscricao | null;
    },
    enabled: !!editalId,
  });

  /**
   * ⚠️ O e-mail que a fatia 5 guarda em `regras_vista_prova`, lido aqui SÓ para o linter
   * poder cruzar. Ver a regra `email-da-vista-fora-dos-canais` — é a mitigação do R1, que
   * se materializou quando a fatia 5 veio antes desta.
   *
   * 🔵 **Desde a rodada 15 (2026-09-19) ele também alimenta `{{campo:email_vista_folha}}`**, e
   * o interstício veio junto: os dois aparecem no texto do capítulo 13, e o e-mail é o único
   * valor do modelo que o teste do modelo **proíbe** como literal.
   */
  const regrasDaVista = useQuery({
    queryKey: ["regras_vista_prova", editalId, "email"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regras_vista_prova")
        .select("email_solicitacao, intersticio_minimo_horas")
        .eq("edital_id", editalId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!editalId,
  });

  const invalidar = (chave: string) =>
    queryClient.invalidateQueries({ queryKey: [chave, editalId] });

  const salvarCriterio = useMutation({
    mutationFn: async (c: Partial<CriterioGravado> & { tipo_criterio: TipoCriterioIsencao }) => {
      const { error } = c.id
        ? await supabase.from("regras_isencao").update(c).eq("id", c.id)
        : await supabase.from("regras_isencao").insert({ ...c, edital_id: editalId! });
      if (error) throw error;
    },
    onSuccess: () => invalidar("regras_isencao"),
    onError: erro,
  });

  const removerCriterio = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("regras_isencao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidar("regras_isencao"),
    onError: erro,
  });

  const salvarCanal = useMutation({
    mutationFn: async (c: Partial<CanalGravado> & { tipo_canal: string; rotulo: string }) => {
      const { error } = c.id
        ? await supabase.from("edital_canais_atendimento").update(c).eq("id", c.id)
        : await supabase.from("edital_canais_atendimento").insert({ ...c, edital_id: editalId! });
      if (error) throw error;
    },
    onSuccess: () => invalidar("edital_canais_atendimento"),
    onError: erro,
  });

  const removerCanal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("edital_canais_atendimento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidar("edital_canais_atendimento"),
    onError: erro,
  });

  const salvarConfig = useMutation({
    mutationFn: async (c: Partial<ConfigInscricao>) => {
      const { error } = await supabase
        .from("inscricao_config")
        .upsert({ ...c, edital_id: editalId! }, { onConflict: "edital_id" });
      if (error) throw error;
    },
    onSuccess: () => invalidar("inscricao_config"),
    onError: erro,
  });

  return {
    criterios: criterios.data ?? [],
    canais: canais.data ?? [],
    config: config.data ?? null,
    emailDaVistaDeProva: regrasDaVista.data?.email_solicitacao ?? null,
    intersticioDaVistaHoras: regrasDaVista.data?.intersticio_minimo_horas ?? null,
    // 🔴 `regrasDaVista` ENTROU nesta conta com a rodada 15, e a razão é a armadilha "vazio
    // enquanto carrega": sem ela, `useCamposDoEdital` montaria o mapa antes de a consulta
    // voltar e o capítulo 13 sairia com `[?campo:email_vista_folha]` no primeiro frame.
    isLoading: criterios.isLoading || canais.isLoading || config.isLoading || regrasDaVista.isLoading,
    salvarCriterio: salvarCriterio.mutate,
    removerCriterio: removerCriterio.mutate,
    salvarCanal: salvarCanal.mutate,
    removerCanal: removerCanal.mutate,
    salvarConfig: salvarConfig.mutate,
  };
}
