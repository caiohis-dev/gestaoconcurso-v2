/**
 * Um edital e a estrutura do seu documento (o Edital Studio).
 *
 * 🔴 **A linha em `edital_capitulos` é um OVERRIDE, não um registro obrigatório.**
 * Capítulo sem linha vale pelo padrão do catálogo (`src/lib/edital-capitulos.ts`). Foi
 * essa escolha que dispensou a RPC de semeadura — e é o que faz os 3 editais que já
 * existem em produção ganharem estrutura de documento sem backfill nenhum, e um capítulo
 * novo no catálogo valer para todos eles sem migration de dados.
 *
 * Consequência prática: gravar capítulo é sempre UPSERT por `(edital_id, chave)`.
 *
 * ⚠️ O CONTEÚDO não está aqui. Cada artigo é um registro em `edital_itens`, servido por
 * `useEditalItens` — e apagar a linha de capítulo NÃO leva os artigos junto, de
 * propósito: desligar um capítulo não pode destruir texto redigido.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { montarDocumento, type CapituloOverride, type CapituloResolvido } from "@/lib/edital-numeracao";

export interface EditalMetadados {
  id: string;
  nome: string;
  numero_edital: string | null;
  ano: number | null;
  natureza_juridica: string | null;
  orgao_demandante: string | null;
  entidade_executora: string | null;
  decreto_autorizador: string | null;
  regime_trabalho: string | null;
  prazo_validade_anos: number | null;
  prorrogavel: boolean | null;
  // 🔵 Os cinco de 2026-09-18 (migration 20260918103305). Resolvem `{{campo:}}` no texto:
  // a sede aparece 7 vezes no Edital 004 e o site 9, e o fecho manuscrito
  // "Volta Redonda, ___ de ________ de 2026" vira estado que o linter acusa.
  site_oficial: string | null;
  executora_endereco: string | null;
  signatario_nome: string | null;
  signatario_cargo: string | null;
  data_publicacao: string | null;
  // 🔵 O modelo padrão (migration 20260918183433). `eh_modelo` marca a linha que serve de
  // texto-base; `modelo_aplicado_em` registra o FATO de um edital tê-la absorvido, e é ele
  // que decide se o convite aparece — não um teste de "está vazio?", que re-ofereceria o
  // modelo a quem apagou os artigos de propósito.
  eh_modelo: boolean;
  modelo_aplicado_em: string | null;
  modelo_versao: string | null;
}

// ⚠️ Lista EXPLÍCITA: coluna que não estiver aqui não chega à tela, e quem a consome vê
// `undefined` sem erro nenhum. Ao acrescentar coluna em `editais`, acrescente aqui também.
const CAMPOS_EDITAL =
  "id, nome, numero_edital, ano, natureza_juridica, orgao_demandante, entidade_executora, decreto_autorizador, regime_trabalho, prazo_validade_anos, prorrogavel, site_oficial, executora_endereco, signatario_nome, signatario_cargo, data_publicacao, eh_modelo, modelo_aplicado_em, modelo_versao";

export function useEdital(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const editalQuery = useQuery({
    queryKey: ["edital", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("editais")
        .select(CAMPOS_EDITAL)
        .eq("id", editalId!)
        .single();
      if (error) throw error;
      return data as EditalMetadados;
    },
    enabled: !!editalId,
  });

  const capitulosQuery = useQuery({
    queryKey: ["edital_capitulos", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edital_capitulos")
        .select("chave, ordem, incluido")
        .eq("edital_id", editalId!);
      if (error) throw error;
      return (data ?? []) as CapituloOverride[];
    },
    enabled: !!editalId,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["edital_capitulos", editalId] });
  };

  const erro = (acao: string) => (e: { message: string }) =>
    toast({ title: acao, description: e.message, variant: "destructive" });

  /**
   * ⚠️ O upsert precisa de `ordem` e `incluido` porque as duas são NOT NULL no banco —
   * e o valor certo para uma linha que ainda não existe é o do CATÁLOGO, não um default
   * inventado aqui. Por isso o chamador passa o capítulo já resolvido.
   *
   * 🔵 Desde 16/09 ele NÃO grava texto: o conteúdo do capítulo são os registros de
   * `edital_itens` (ver `useEditalItens`). Aqui sobrou o que é do capítulo — se ele
   * entra no documento e em que posição.
   */
  const gravar = useMutation({
    mutationFn: async (cap: CapituloResolvido) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("edital_capitulos").upsert(
        {
          edital_id: editalId!,
          chave: cap.chave,
          ordem: cap.ordem,
          incluido: cap.incluido,
          created_by: userData.user?.id,
        },
        { onConflict: "edital_id,chave" },
      );
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: erro("Erro ao gravar o capítulo"),
  });

  const salvarMetadados = useMutation({
    mutationFn: async (dados: Partial<Omit<EditalMetadados, "id" | "nome">>) => {
      const { error } = await supabase.from("editais").update(dados).eq("id", editalId!);
      if (error) throw error;
    },
    // ⚠️ SEM toast de sucesso, e isso é decisão: `DadosDoEdital` grava no `blur` de cada
    // campo, então um aviso por gravação empilharia 14 toasts para quem só percorreu o
    // formulário — o aviso vira o estorvo, não a informação. O ERRO continua avisando:
    // gravação que falha calada é o formato de defeito que este repo mais teme.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edital", editalId] });
      queryClient.invalidateQueries({ queryKey: ["editais"] });
    },
    onError: erro("Erro ao salvar o edital"),
  });

  // O documento é derivado: catálogo + overrides, com a numeração calculada. Nunca vem
  // pronto do banco — ver o cabeçalho de `edital-numeracao.ts`.
  const documento: CapituloResolvido[] = montarDocumento(capitulosQuery.data ?? []);

  return {
    edital: editalQuery.data,
    documento,
    isLoading: editalQuery.isLoading || capitulosQuery.isLoading,
    error: editalQuery.error,
    gravarCapitulo: gravar.mutate,
    isGravando: gravar.isPending,
    salvarMetadados: salvarMetadados.mutate,
    isSalvandoMetadados: salvarMetadados.isPending,
  };
}
