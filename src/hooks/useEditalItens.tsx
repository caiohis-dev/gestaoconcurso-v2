/**
 * Os ARTIGOS de um edital — um registro por artigo, em `edital_itens`.
 *
 * 🔴 **Uma consulta só, para o edital inteiro.** Os três editais reais têm de 270 a 330
 * artigos: é uma página de dado, e buscá-los por capítulo obrigaria a prévia e o linter
 * — que olham o documento TODO — a disparar 19 consultas. A numeração e o agrupamento
 * são feitos em memória (`agruparPorCapitulo`), que é onde a regra já mora.
 *
 * ⚠️ **A ordem vem do banco E é reordenada aqui.** O `order()` da consulta não basta:
 * não há UNIQUE em `(edital_id, capitulo_chave, ordem)`, então o desempate estável por
 * `created_at` é de `ordenarItens`. Confiar só no servidor faria a numeração pular
 * sozinha entre consultas quando duas ordens empatassem.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  agruparPorCapitulo,
  ordenarItens,
  parsearCapitulo,
  type ItemBruto,
  type QuadroFonte,
  type TipoItem,
} from "@/lib/edital-itens";

const CAMPOS = "id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte, created_at";

/** O que a tela altera num artigo. O resto (ordem, nível) tem ação própria. */
export interface ArtigoEditado {
  id: string;
  texto: string;
  ancora: string | null;
}

export interface NovoArtigo {
  capituloChave: string;
  tipo: TipoItem;
  quadroFonte?: QuadroFonte;
  texto?: string;
  nivel?: number;
}

export function useEditalItens(editalId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const itensQuery = useQuery({
    queryKey: ["edital_itens", editalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edital_itens")
        .select(CAMPOS)
        .eq("edital_id", editalId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as ItemBruto[];
    },
    enabled: !!editalId,
  });

  const itens = itensQuery.data ?? [];
  const porCapitulo = agruparPorCapitulo(itens);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["edital_itens", editalId] });

  const erro = (acao: string) => (e: { message: string }) =>
    toast({ title: acao, description: e.message, variant: "destructive" });

  /** A próxima posição livre do capítulo. */
  const proximaOrdem = (capituloChave: string) =>
    (porCapitulo.get(capituloChave) ?? []).reduce((max, i) => Math.max(max, i.ordem + 1), 0);

  const adicionar = useMutation({
    mutationFn: async (novo: NovoArtigo) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("edital_itens").insert({
        edital_id: editalId!,
        capitulo_chave: novo.capituloChave,
        ordem: proximaOrdem(novo.capituloChave),
        nivel: novo.nivel ?? 0,
        tipo: novo.tipo,
        // ⚠️ Nasce VAZIO de propósito. Um texto-placeholder de boas-vindas seria
        // exatamente o "dia XX/xx/2026" que este módulo existe para matar.
        texto: novo.texto ?? "",
        quadro_fonte: novo.quadroFonte ?? null,
        created_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: erro("Erro ao adicionar o artigo"),
  });

  /**
   * Grava vários artigos de uma vez — é o que o botão "Salvar capítulo" chama.
   *
   * ⚠️ `upsert` e não `update`: um `update` por linha seriam N chamadas, e com 30 artigos
   * num capítulo a falha no meio deixaria metade salva sem ninguém saber qual metade.
   */
  const gravar = useMutation({
    mutationFn: async (editados: readonly ArtigoEditado[]) => {
      if (editados.length === 0) return;
      const atual = new Map(itens.map((i) => [i.id, i]));
      const linhas = editados.map((e) => {
        const base = atual.get(e.id);
        if (!base) throw new Error(`Artigo ${e.id} não está mais na lista — recarregue a página.`);
        return {
          id: e.id,
          edital_id: editalId!,
          capitulo_chave: base.capitulo_chave,
          ordem: base.ordem,
          nivel: base.nivel,
          tipo: base.tipo,
          quadro_fonte: base.quadro_fonte,
          texto: e.texto,
          // Campo vazio é âncora AUSENTE, não string vazia: o índice único é parcial
          // (`WHERE ancora IS NOT NULL`), e `''` colidiria entre todos os sem âncora.
          ancora: e.ancora?.trim() ? e.ancora.trim() : null,
        };
      });
      const { error } = await supabase.from("edital_itens").upsert(linhas);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: erro("Erro ao salvar os artigos"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("edital_itens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: erro("Erro ao remover o artigo"),
  });

  /**
   * Sobe ou desce um artigo dentro do capítulo.
   *
   * 🔴 Vai pela RPC `reordenar_itens_do_capitulo`, e não por dois `update`: reescrever a
   * ordem é operação de vários passos, e fora de transação a falha no meio deixa dois
   * artigos disputando a mesma posição (§2). A RPC ainda recusa lista incompleta (EI002),
   * que é o erro que deixaria um buraco na numeração.
   */
  const mover = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: -1 | 1 }) => {
      const item = itens.find((i) => i.id === id);
      if (!item) return;
      const lista = ordenarItens(porCapitulo.get(item.capitulo_chave) ?? []);
      const de = lista.findIndex((i) => i.id === id);
      const para = de + delta;
      if (de < 0 || para < 0 || para >= lista.length) return;

      const nova = [...lista];
      [nova[de], nova[para]] = [nova[para], nova[de]];

      const { error } = await supabase.rpc("reordenar_itens_do_capitulo", {
        p_edital_id: editalId!,
        p_capitulo_chave: item.capitulo_chave,
        p_ids: nova.map((i) => i.id),
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: erro("Erro ao mover o artigo"),
  });

  /** Recua ou avança um nível (item ↔ subitem ↔ alínea). */
  const mudarNivel = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: -1 | 1 }) => {
      const item = itens.find((i) => i.id === id);
      if (!item) return;
      const nivel = Math.min(2, Math.max(0, item.nivel + delta));
      if (nivel === item.nivel) return;
      const { error } = await supabase.from("edital_itens").update({ nivel }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: erro("Erro ao mudar o nível do artigo"),
  });

  /**
   * Cola um capítulo inteiro em lista e o transforma em artigos.
   *
   * Sem isto, montar um edital real seria clicar "adicionar" de 270 a 330 vezes. O
   * parser é o mesmo `parsearCapitulo` de sempre — ele deixou de numerar e passou a
   * servir só a esta porta de entrada.
   */
  const importarColagem = useMutation({
    mutationFn: async ({ capituloChave, texto }: { capituloChave: string; texto: string }) => {
      const linhas = parsearCapitulo(texto);
      if (linhas.length === 0) throw new Error("Nada a importar: o texto colado não tem linhas.");
      const { data: userData } = await supabase.auth.getUser();
      const base = proximaOrdem(capituloChave);
      const { error } = await supabase.from("edital_itens").insert(
        linhas.map((l, i) => ({
          edital_id: editalId!,
          capitulo_chave: capituloChave,
          ordem: base + i,
          nivel: l.nivel,
          tipo: l.tipo,
          texto: l.texto,
          ancora: l.ancora,
          created_by: userData.user?.id,
        })),
      );
      if (error) throw error;
      return linhas.length;
    },
    onSuccess: (n) => {
      invalidar();
      toast({ title: `${n} artigo(s) importado(s)` });
    },
    onError: erro("Erro ao importar os artigos"),
  });

  return {
    itens,
    porCapitulo,
    isLoading: itensQuery.isLoading,
    adicionar: adicionar.mutate,
    gravar: gravar.mutate,
    remover: remover.mutate,
    mover: mover.mutate,
    mudarNivel: mudarNivel.mutate,
    importarColagem: importarColagem.mutate,
    isGravando: gravar.isPending,
    isMexendo: mover.isPending || mudarNivel.isPending || adicionar.isPending || remover.isPending,
  };
}
