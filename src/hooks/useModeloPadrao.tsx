/**
 * O edital modelo, e a absorção dele por um edital novo.
 *
 * 🔴 **O modelo é um edital de VERDADE** — uma linha em `editais` com `eh_modelo = true`,
 * nascida da migration `20260918183433` com UUID fixo. Decisão do usuário em 2026-09-18:
 * assim a FEVRE ajusta o texto padrão pela própria tela, sem desenvolvedor no caminho.
 *
 * 🔴 **A absorção é UM CLIQUE, nunca um efeito.** Também decisão do usuário. Um
 * `useEffect` que escrevesse centenas de artigos ao montar a tela dispararia duas vezes em
 * StrictMode e duas vezes de verdade em duas abas — e, pior, não teria onde dizer que o
 * texto vem do Edital 004 e precisa de revisão. `EditalStudio` não tem nenhum `useEffect`
 * de escrita, e essa propriedade se mantém.
 *
 * ⚠️ **A RPC não recebe o texto nem a versão.** A cópia é `INSERT … SELECT` dentro do
 * banco, de uma linha de `editais` para outra: nenhum byte de texto atravessa o PostgREST,
 * e a versão é lida da própria linha do modelo. Versão declarada pelo cliente ficaria
 * gravada como se fosse fato — a mesma classe de erro de `p_user_id` (§8).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface EditalModelo {
  id: string;
  nome: string;
  modelo_versao: string | null;
}

/**
 * O edital modelo deste banco, se existir.
 *
 * ⚠️ `null` é estado possível e não é erro de programação: o modelo nasce por migration, e
 * um banco cujo `db push` não correu ainda não o tem. Quem chama tem de saber dizer isso na
 * tela em vez de oferecer um botão que não funciona.
 */
export function useEditalModelo() {
  const query = useQuery({
    queryKey: ["edital_modelo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("editais")
        .select("id, nome, modelo_versao")
        .eq("eh_modelo", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as EditalModelo | null;
    },
  });

  return { modelo: query.data ?? null, isLoading: query.isLoading };
}

/**
 * Traduz as guardas da RPC. O código vem em `message`, não em `code`: o PostgREST devolve
 * `P0001` para todo `RAISE EXCEPTION` de PL/pgSQL, então o SQLSTATE próprio (EM00x) chega
 * embutido no texto. Deixar a mensagem crua vazar é a dívida do §2 que este repo já pagou
 * duas vezes — a do banco tem de chegar ao usuário nomeando o que fazer.
 */
function mensagemDaAbsorcao(erro: { message: string; code?: string }): string {
  const m = erro.message ?? "";
  if (/EM002/.test(m) || /já absorveu o modelo/i.test(m)) {
    return "Este edital já absorveu o modelo padrão. Para trazer um capítulo novo, aplique só aquele capítulo.";
  }
  if (/EM003/.test(m) || /já têm texto redigido/i.test(m)) {
    // A mensagem do banco nomeia as chaves ocupadas — e é por isso que ela passa adiante
    // inteira, em vez de ser trocada por um texto genérico.
    return m;
  }
  if (/EM004/.test(m)) return "Este é o próprio edital modelo — ele não absorve a si mesmo.";
  if (/EM005/.test(m)) {
    return "Não existe edital modelo neste banco. Confira se as migrations foram aplicadas.";
  }
  if (/EM001/.test(m) || /Edital não encontrado/i.test(m)) {
    return "Edital não encontrado, ou você não tem permissão para editá-lo.";
  }
  if (erro.code === "23505" || /edital_itens_ancora_key/.test(m)) {
    // 🔴 A colisão de âncora aborta a cópia INTEIRA — e é isso que a mensagem precisa dizer,
    // senão o autor fica sem saber se ficou meio documento no edital dele.
    return "Um artigo deste edital usa uma âncora que o modelo também usa. Nada foi copiado; renomeie a âncora e tente de novo.";
  }
  return m || "Não foi possível aplicar o edital padrão.";
}

export function useAplicarModeloPadrao(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const aplicar = useMutation({
    /**
     * `capitulos` ausente = o documento inteiro, que é a primeira absorção. Preenchido = só
     * aqueles capítulos, que é como um capítulo NOVO do modelo alcança um edital que já
     * absorveu a versão anterior — sem tocar no que já foi redigido.
     */
    mutationFn: async (capitulos?: readonly string[]) => {
      const { data, error } = await supabase.rpc("aplicar_edital_modelo", {
        p_destino: editalId!,
        ...(capitulos ? { p_capitulos_alvo: [...capitulos] } : {}),
      });
      if (error) throw new Error(mensagemDaAbsorcao(error));
      return (data ?? 0) as number;
    },
    onSuccess: (quantos) => {
      queryClient.invalidateQueries({ queryKey: ["edital_itens", editalId] });
      queryClient.invalidateQueries({ queryKey: ["edital", editalId] });
      // ⚠️ Este toast FICA, ao contrário do de `salvarMetadados`: a absorção é um ato
      // deliberado e raro, e o número copiado é a única confirmação de que o clique
      // funcionou. O que se aposentou foi o aviso por gravação de campo.
      toast({
        title: "Edital padrão aplicado",
        description: `${quantos} artigo(s) copiados. Revise cada capítulo antes de publicar.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Não foi possível aplicar", description: e.message, variant: "destructive" }),
  });

  return {
    aplicar: aplicar.mutateAsync,
    isAplicando: aplicar.isPending,
  };
}
