/**
 * O checklist de investidura de um edital.
 *
 * 🔴 **`IN001` tem tradução própria e acionável.** É a recusa que impede o defeito do
 * Edital 004, e mensagem de banco crua ("new row violates…") não diz a quem lê o que
 * fazer. Já foi dívida duas vezes neste repo (CLAUDE.md §2).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { DocumentoInvestidura } from "@/lib/edital-investidura";

export interface DocumentoGravado extends DocumentoInvestidura {
  edital_id: string;
  observacao: string | null;
  ordem: number;
}

export function useInvestidura(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chave = ["documentos_investidura", editalId];

  const documentos = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos_investidura")
        .select("id, edital_id, cargo_id, aplica_a_todos_os_cargos, nome_documento, conselho_exigido, obrigatorio, observacao, ordem")
        .eq("edital_id", editalId!)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentoGravado[];
    },
    enabled: !!editalId,
  });

  const erro = (e: { message: string }) => {
    const m = /IN001/.test(e.message)
      // A mensagem do trigger já é acionável e nomeia o caso real; repassa-se inteira,
      // tirando só o prefixo do código, que é para o log e não para quem lê.
      ? e.message.replace(/^.*IN001:\s*/, "")
      : /chk_doc_inv_escopo/.test(e.message)
        ? "Escolha se o documento vale para um cargo específico ou para todos."
        : /chk_doc_inv_nome/.test(e.message)
          ? "O documento precisa de um nome."
          : e.message;
    toast({ title: "Não foi possível salvar", description: m, variant: "destructive" });
  };

  const salvar = useMutation({
    mutationFn: async (d: Partial<DocumentoGravado> & { nome_documento: string }) => {
      const { error } = d.id
        ? await supabase.from("documentos_investidura").update(d).eq("id", d.id)
        : await supabase.from("documentos_investidura").insert({ ...d, edital_id: editalId! });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: erro,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documentos_investidura").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: erro,
  });

  /**
   * Insere vários de uma vez — o núcleo comum e os documentos de um conselho.
   *
   * ⚠️ Não é troca total: acrescenta ao que já existe, pulando o que já está lá pelo
   * nome. Quem clica "pré-preencher" duas vezes não deve acabar com o checklist em
   * duplicata, e também não deve perder o que já escreveu.
   */
  const acrescentarVarios = useMutation({
    mutationFn: async (nomes: { nome_documento: string; conselho_exigido?: string | null }[]) => {
      const jaTem = new Set(
        (documentos.data ?? []).map((d) => d.nome_documento.trim().toLowerCase()),
      );
      const novos = nomes.filter((n) => !jaTem.has(n.nome_documento.trim().toLowerCase()));
      if (novos.length === 0) return 0;
      const base = documentos.data?.length ?? 0;
      const { error } = await supabase.from("documentos_investidura").insert(
        novos.map((n, i) => ({
          edital_id: editalId!,
          aplica_a_todos_os_cargos: true,
          cargo_id: null,
          nome_documento: n.nome_documento,
          conselho_exigido: n.conselho_exigido ?? null,
          ordem: base + i,
        })),
      );
      if (error) throw error;
      return novos.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: chave });
      toast({
        title: n === 0 ? "Nada a acrescentar" : `${n} documento(s) acrescentado(s)`,
        description: n === 0 ? "Todos já estavam no checklist." : undefined,
      });
    },
    onError: erro,
  });

  return {
    documentos: documentos.data ?? [],
    isLoading: documentos.isLoading,
    salvar: salvar.mutate,
    remover: remover.mutate,
    acrescentarVarios: acrescentarVarios.mutate,
    isSalvando: salvar.isPending || acrescentarVarios.isPending,
  };
}
