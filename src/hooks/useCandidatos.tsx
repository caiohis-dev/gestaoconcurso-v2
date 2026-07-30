import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CandidatoResolvido, mensagemErroImportacao } from "@/lib/candidatos-import";

/** O cargo canônico do catálogo, trazido pelo join da listagem. */
export interface CargoDoCandidato {
  id: string;
  nome: string;
}

export interface Candidato {
  id: string;
  edital_id: string;
  n_inscricao: string;
  /**
   * O texto do cargo **como veio na planilha** — procedência, não identidade (D2 do
   * roadmap de cargos). Costuma vir sujo (`DOCENTE I ¿ HISTÓRIA`, travessão em cp1252
   * lido como latin-1). ⚠️ **Não é isto que a tela deve exibir**: quem responde "qual é
   * o cargo" é `cargos.nome`, o nome canônico. Este campo existe para explicar ao
   * usuário por que ele viu o texto sujo antes, e para o mapeamento ser refazível.
   */
  cargo: string | null;
  cargo_id: string | null;
  /**
   * O cargo do catálogo, embutido pelo `select` da listagem.
   *
   * ⚠️ **É um join à esquerda, e tem de continuar sendo.** Trocar por `cargos!inner`
   * sumiria com todo inscrito de `cargo_id` nulo — e sumir da lista é o único erro grave
   * possível nesta tela.
   */
  cargos: CargoDoCandidato | null;
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
  /** TEXT desde 30/07: o código impossível entra cru, então não presuma número. */
  raca: string | null;
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
  /** Recorte por cargo do catálogo. `null` = todos. */
  cargoId?: string | null;
  pagina?: number;
  porPagina?: number;
}

/**
 * O `select` da listagem, com o cargo canônico embutido.
 *
 * O join evita o N+1 (uma consulta a `cargos` por linha exibida) e não custa paginação: o
 * PostgREST resolve a relação na mesma requisição, então o `count: "exact"` continua sendo
 * o do servidor. `cargos` tem RLS de SELECT para `authenticated`, e quem já lê `candidatos`
 * é admin — a relação não esbarra em policy.
 */
const SELECT_LISTAGEM = "*, cargos ( id, nome )";

/**
 * Listagem paginada dos inscritos de UM edital.
 *
 * ⚠️ A paginação não é enfeite: são milhares de linhas por edital, e o PostgREST corta a
 * resposta em 1.000 por padrão. Sem `range`, a tela mostraria 1.000 candidatos e o
 * usuário não teria como saber que os outros 6.416 existem — o pior tipo de erro, o que
 * parece ter funcionado. O total vem do `count: "exact"`, não do tamanho do array.
 */
export function useCandidatos({
  editalId,
  busca = "",
  cargoId = null,
  pagina = 0,
  porPagina = 50,
}: FiltroCandidatos) {
  const termo = busca.trim();

  const query = useQuery({
    queryKey: ["candidatos", editalId, termo, cargoId, pagina, porPagina],
    // Sem edital escolhido não há o que listar — e `enabled: false` evita a consulta
    // sem filtro, que traria inscrito de todos os editais misturado.
    enabled: !!editalId,
    queryFn: async () => {
      let q = supabase
        .from("candidatos")
        .select(SELECT_LISTAGEM, { count: "exact" })
        .eq("edital_id", editalId as string);

      // O recorte por cargo vai ao SERVIDOR, e é por isso que o contador continua
      // valendo: filtrar no cliente deixaria o `count` falando do conjunto inteiro
      // enquanto a tabela mostra um subconjunto — a tela mentiria sem quebrar nada.
      if (cargoId) q = q.eq("cargo_id", cargoId);

      if (termo) {
        // Busca por nome, inscrição ou CPF — os três jeitos de procurar alguém numa lista
        // de inscritos. `%` nas duas pontas porque o usuário costuma lembrar do sobrenome.
        //
        // ⚠️ O nome do CARGO está fora deste `or` de propósito. Filtrar por coluna de
        // tabela embutida tem sintaxe própria no PostgREST e não entra no mesmo `or`; e
        // quem quer "os inscritos de DOCENTE II" tem o filtro por cargo, que é exato.
        // Improvisar isso no cliente quebraria o `count` do servidor.
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
 * `onConflict` nomeia as quatro colunas do índice `candidatos_cpf_cargo_id_inscricao_key`
 * — ver a migration 20260728100000 (etapa 5 do roadmap-cargos), que trocou o TEXTO do
 * cargo pela REFERÊNCIA a ele. É essa troca que faz corrigir o nome de um cargo deixar de
 * duplicar inscrito.
 *
 * ⚠️ QUATRO coisas precisam concordar, e mexer numa obriga a mexer nas quatro:
 *   1. o índice único do banco;
 *   2. esta string de `onConflict`;
 *   3. `chaveNatural()` de `candidatos-import.ts`, que deduplica o lote ANTES de enviar;
 *   4. a ORDEM do pipeline — o dedup roda DEPOIS de resolver o cargo (`resolverLinhas`).
 * Se qualquer par discordar, uma chave repetida escapa da deduplicação e o Postgres recusa
 * o bloco inteiro de 500 com "ON CONFLICT DO UPDATE command cannot affect row a second
 * time".
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
      // ⭐ `CandidatoResolvido`, e não `CandidatoImportado`: o tipo é o que impede um lote
      // SEM `cargo_id` de chegar aqui. A partir da etapa 5 do roadmap de cargos, esse
      // campo compõe a chave natural — mandar o lote não-resolvido gravaria milhares de
      // linhas com a identidade incompleta, e o TypeScript recusa antes disso.
      candidatos: CandidatoResolvido[];
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
            { onConflict: "edital_id,cpf,cargo_id,n_inscricao" },
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
