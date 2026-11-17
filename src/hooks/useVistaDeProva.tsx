/**
 * As regras da vista da folha de respostas — `regras_vista_prova`, uma linha por edital.
 *
 * 🔴 **Por que existe (2026-11-16).** A tabela nasceu na fatia 5 e dois `{{campo:}}` do
 * capítulo de recursos dependem dela (`email_vista_folha`, `intersticio_vista_horas`), mas
 * NENHUMA tela a escrevia: `useInscricao` só a LIA, para o linter cruzar o e-mail com os
 * canais. Medido no banco local: zero linhas. O documento só podia sair com `[?campo:…]`, e
 * o linter mandava a pessoa a um capítulo sem formulário.
 *
 * ⚠️ Grava SÓ as duas colunas que o documento usa. `tipo_procedimento` e
 * `exige_termo_visita_assinado` existem na tabela e nenhum texto do modelo as lê — expô-las
 * seria um formulário cujo efeito ninguém vê. O upsert do PostgREST atualiza só as colunas
 * enviadas, então não as apaga.
 *
 * ⚠️ A chave da consulta é prefixo da de `useInscricao` (`["regras_vista_prova", id,
 * "email"]`): invalidar esta invalida aquela, e o campo resolvido e a regra do linter
 * enxergam o valor novo sem recarregar.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface RegrasVista {
  email_solicitacao: string | null;
  intersticio_minimo_horas: number | null;
}

export function useVistaDeProva(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const vista = useQuery({
    queryKey: ["regras_vista_prova", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regras_vista_prova")
        .select("email_solicitacao, intersticio_minimo_horas")
        .eq("edital_id", editalId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RegrasVista | null;
    },
    enabled: !!editalId,
  });

  const salvar = useMutation({
    mutationFn: async (campos: Partial<RegrasVista>) => {
      const { error } = await supabase
        .from("regras_vista_prova")
        .upsert({ ...campos, edital_id: editalId! }, { onConflict: "edital_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regras_vista_prova", editalId] }),
    onError: (e: { message: string }) =>
      toast({ title: "Erro ao salvar a vista da folha de respostas", description: e.message, variant: "destructive" }),
  });

  return { vista: vista.data ?? null, isLoading: vista.isLoading, salvar: salvar.mutate };
}
