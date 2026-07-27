import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CandidatoImportado, mensagemErroImportacao } from "@/lib/candidatos-import";

export interface Candidato {
  id: string;
  edital_id: string;
  n_inscricao: string;
  cargo: string | null;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  identidade_numero: string | null;
  identidade_orgao: string | null;
  identidade_uf: string | null;
  identidade_emissao: string | null;
  data_nascimento: string | null;
  hora_nascimento: string | null;
  sexo: string | null;
  raca: number | null;
  portador_deficiencia: boolean;
  confirmado: boolean;
  concurso_id_origem: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Tamanho do bloco enviado por requisição.
 *
 * O arquivo real tem 7.416 linhas. Uma requisição por linha — que é como `CadastroLote`
 * importa colaboradores — daria 7.416 idas ao servidor e uns 20 minutos de espera. Em
 * blocos de 500 são 15 requisições. O número não é mágico: é grande o bastante para o
 * custo por linha sumir e pequeno o bastante para o relatório dizer ONDE parou quando um
 * bloco falha, e para a barra de progresso se mover.
 */
export const TAMANHO_BLOCO = 500;

export interface FiltroCandidatos {
  editalId: string | null;
  busca?: string;
  pagina?: number;
  porPagina?: number;
}

/**
 * Listagem paginada dos inscritos de UM edital.
 *
 * ⚠️ A paginação não é enfeite: são milhares de linhas por edital, e o PostgREST corta a
 * resposta em 1.000 por padrão. Sem `range`, a tela mostraria 1.000 candidatos e o
 * usuário não teria como saber que os outros 6.416 existem — o pior tipo de erro, o que
 * parece ter funcionado. O total vem do `count: "exact"`, não do tamanho do array.
 */
export function useCandidatos({ editalId, busca = "", pagina = 0, porPagina = 50 }: FiltroCandidatos) {
  const termo = busca.trim();

  const query = useQuery({
    queryKey: ["candidatos", editalId, termo, pagina, porPagina],
    // Sem edital escolhido não há o que listar — e `enabled: false` evita a consulta
    // sem filtro, que traria inscrito de todos os editais misturado.
    enabled: !!editalId,
    queryFn: async () => {
      let q = supabase
        .from("candidatos")
        .select("*", { count: "exact" })
        .eq("edital_id", editalId as string);

      if (termo) {
        // Busca por nome, inscrição ou CPF — os três jeitos de procurar alguém numa lista
        // de inscritos. `%` nas duas pontas porque o usuário costuma lembrar do sobrenome.
        const escapado = termo.replace(/[%,()]/g, " ");
        q = q.or(`nome.ilike.%${escapado}%,n_inscricao.ilike.%${escapado}%,cpf.ilike.%${escapado}%`);
      }

      const { data, error, count } = await q
        .order("nome", { ascending: true })
        .range(pagina * porPagina, pagina * porPagina + porPagina - 1);

      if (error) throw error;
      return { candidatos: (data ?? []) as Candidato[], total: count ?? 0 };
    },
  });

  return {
    candidatos: query.data?.candidatos ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/** Quantos inscritos cada edital tem — alimenta os cards da tela de Candidatos. */
export function useContagemCandidatosPorEdital() {
  const query = useQuery({
    queryKey: ["candidatos", "contagem-por-edital"],
    queryFn: async () => {
      // `head: true` + `count` traz só o número: contar 7 mil linhas não pode custar
      // baixar 7 mil linhas.
      const { data, error } = await supabase.rpc("contar_candidatos_por_edital");
      if (error) throw error;
      const porEdital: Record<string, number> = {};
      for (const linha of (data ?? []) as { edital_id: string; total: number }[]) {
        porEdital[linha.edital_id] = Number(linha.total);
      }
      return porEdital;
    },
  });

  return { contagem: query.data ?? {}, isLoading: query.isLoading };
}

export interface ResultadoBloco {
  gravados: number;
  erro: string | null;
  /** 1-based, para a mensagem: "o 3º bloco falhou". */
  bloco: number;
}

export interface ProgressoImportacao {
  enviados: number;
  total: number;
}

/**
 * Grava os candidatos convertidos, em blocos, por UPSERT.
 *
 * POR QUE UPSERT E NÃO INSERT — o usuário definiu que candidato SEMPRE chega por
 * importação. Isso significa que reimportar é o fluxo normal, não a exceção: a planilha é
 * corrigida e mandada de novo. Com `insert`, a segunda importação bateria no índice único
 * e falharia inteira; com `upsert` sobre a chave natural, ela ATUALIZA os mesmos inscritos.
 *
 * `onConflict` nomeia as três colunas do índice `candidatos_inscricao_cargo_key`, incluindo
 * a gerada `cargo_chave` — ver o comentário dela na migration 20260727000000.
 *
 * ⚠️ Cada bloco é uma transação SUA. Um bloco que falha não desfaz os anteriores, e é por
 * isso que o relatório mostra quantos entraram: dizer só "falhou" deixaria o usuário sem
 * saber se pode reimportar (pode — o upsert é idempotente).
 */
export function useImportarCandidatos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({
      candidatos,
      onProgresso,
      deveParar,
    }: {
      candidatos: CandidatoImportado[];
      onProgresso?: (p: ProgressoImportacao) => void;
      deveParar?: () => boolean;
    }): Promise<ResultadoBloco[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id ?? null;
      const resultados: ResultadoBloco[] = [];

      for (let i = 0; i < candidatos.length; i += TAMANHO_BLOCO) {
        if (deveParar?.()) break;

        const bloco = candidatos.slice(i, i + TAMANHO_BLOCO);
        const { error } = await supabase
          .from("candidatos")
          .upsert(
            bloco.map((c) => ({ ...c, created_by: createdBy })),
            { onConflict: "edital_id,n_inscricao,cargo_chave" },
          );

        resultados.push({
          bloco: Math.floor(i / TAMANHO_BLOCO) + 1,
          gravados: error ? 0 : bloco.length,
          erro: error ? mensagemErroImportacao(error.message) : null,
        });

        onProgresso?.({ enviados: Math.min(i + TAMANHO_BLOCO, candidatos.length), total: candidatos.length });
      }

      return resultados;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidatos"] });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro na importação",
        description: mensagemErroImportacao(error.message),
        variant: "destructive",
      });
    },
  });

  return { importar: mutation.mutateAsync, isImportando: mutation.isPending };
}

/** Exclusão de um inscrito e o "limpar o edital" que antecede uma reimportação do zero. */
export function useExcluirCandidatos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const excluirUm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candidatos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidatos"] });
      toast({ title: "Candidato excluído", description: "O inscrito foi removido da lista." });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro ao excluir candidato",
        description: mensagemErroImportacao(error.message),
        variant: "destructive",
      });
    },
  });

  const excluirDoEdital = useMutation({
    mutationFn: async (editalId: string) => {
      const { error, count } = await supabase
        .from("candidatos")
        .delete({ count: "exact" })
        .eq("edital_id", editalId);
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (quantidade) => {
      queryClient.invalidateQueries({ queryKey: ["candidatos"] });
      toast({
        title: "Inscritos removidos",
        description: `${quantidade} candidato(s) foram removidos deste edital.`,
      });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro ao remover inscritos",
        description: mensagemErroImportacao(error.message),
        variant: "destructive",
      });
    },
  });

  return {
    excluirUm: excluirUm.mutate,
    excluirDoEdital: excluirDoEdital.mutate,
    isExcluindo: excluirUm.isPending || excluirDoEdital.isPending,
  };
}
