import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
 * Tamanho do bloco enviado por requisição, para a área de preparo.
 *
 * O arquivo real tem 7.416 linhas. Uma requisição por linha — que é como `CadastroLote`
 * importa colaboradores — daria 7.416 idas ao servidor e uns 20 minutos de espera.
 *
 * MEDIDO em 2026-07-30, para o shape do preparo:
 *
 *     bloco    payload    requisições p/ 7.416    folga em 5 MB
 *       500    0,44 MB                     15          4,56 MB
 *      1000    0,89 MB                      8          4,11 MB   ← aqui
 *      5000    4,44 MB                      2          0,56 MB
 *      7416    6,59 MB                      1          🔴 ESTOURA
 *
 * ⭐ O bloco NÃO cresce com o edital, só o número de requisições: 50.000 inscritos são
 * 50 requisições de 0,89 MB. É o que faz o fluxo escalar sem teto.
 *
 * ⚠️ Fatiar mais grosso reduz as CHANCES de um bloco falhar, mas NÃO elimina o risco de
 * preparo incompleto — quem elimina é a GUARDA 3 da RPC (`p_total_esperado`). São coisas
 * diferentes, e confundi-las levaria alguém a "resolver" o problema mexendo neste número.
 */
export const TAMANHO_BLOCO = 1000;

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

/**
 * O resultado da importação inteira. Existe desde a troca total (2026-07-30) porque
 * "quantos blocos entraram" deixou de ser a resposta: o que interessa é se a LISTA foi
 * trocada, e por quanto.
 */
export interface ResultadoImportacao {
  blocos: ResultadoBloco[];
  /**
   * ⚠️ `false` significa que a lista do edital continua EXATAMENTE como estava — nada
   * foi apagado. É a informação mais importante do relatório quando algo falha, e o
   * oposto do que valia no fluxo antigo (onde falha parcial deixava a lista pela metade).
   */
  trocou: boolean;
  /** Quantos inscritos a troca REMOVEU. Vem do banco, não de contagem do cliente. */
  removidos: number;
  /** Quantos inscritos a troca INSERIU. Vem do banco. */
  inseridos: number;
  /** Preenchido quando `trocou` é false: por que a troca não aconteceu. */
  motivoNaoTrocou: string | null;
}

export interface ProgressoImportacao {
  enviados: number;
  total: number;
}

/**
 * Sobe o lote para a área de preparo, em blocos. Devolve `true` se o usuário interrompeu.
 *
 * Só ENVIA e RELATA — não decide nada. Quem decide se a troca acontece é o gate na
 * `mutationFn`, e manter as duas coisas separadas é o que impede um `return` daqui de
 * virar, sem querer, uma autorização para apagar a lista.
 */
async function subirPreparo({
  candidatos,
  editalId,
  importacaoId,
  createdBy,
  blocos,
  onProgresso,
  deveParar,
}: {
  candidatos: CandidatoResolvido[];
  editalId: string;
  importacaoId: string;
  createdBy: string | null;
  /** Preenchido AQUI, para o chamador ler o relatório mesmo quando interrompemos no meio. */
  blocos: ResultadoBloco[];
  onProgresso?: (p: ProgressoImportacao) => void;
  deveParar?: () => boolean;
}): Promise<boolean> {
  for (let i = 0; i < candidatos.length; i += TAMANHO_BLOCO) {
    if (deveParar?.()) return true;

    const bloco = candidatos.slice(i, i + TAMANHO_BLOCO);
    const { error } = await supabase.from("candidatos_importacao").insert(
      bloco.map((c) => ({
        importacao_id: importacaoId,
        edital_id: editalId,
        // O candidato inteiro vai como jsonb. A RPC reidrata com
        // `jsonb_populate_record`, então coluna nova viaja sem ninguém mexer aqui.
        linha: c as unknown as Json,
        created_by: createdBy,
      })),
    );

    blocos.push({
      bloco: Math.floor(i / TAMANHO_BLOCO) + 1,
      gravados: error ? 0 : bloco.length,
      erro: error ? mensagemErroImportacao(error.message) : null,
    });

    onProgresso?.({
      enviados: Math.min(i + TAMANHO_BLOCO, candidatos.length),
      total: candidatos.length,
    });
  }
  return false;
}

/**
 * Importa a planilha TROCANDO a lista de inscritos do edital.
 *
 * ⭐ O QUE ESTE HOOK FAZ, EM UMA FRASE: sobe a planilha para uma área de PREPARO, em
 * blocos, e então manda o banco apagar a lista atual do edital e reinserir o preparo —
 * tudo numa transação só. Decisão do usuário em 2026-07-30, roadmap
 * `my_rules/analises/roadmap-importacao-troca-total.yaml`.
 *
 * ── POR QUE DEIXOU DE SER UPSERT ────────────────────────────────────────────────────
 *
 * O upsert casava a linha pela chave natural. Como CPF, cargo e inscrição COMPÕEM essa
 * chave, corrigir qualquer um deles na planilha e reimportar NÃO casava: entrava um
 * registro novo e o antigo ficava lá, órfão, sem ninguém ser avisado. A troca total mata
 * a classe inteira, porque não existe "casar linha" — a lista velha sai inteira.
 *
 * A premissa que autoriza isso, confirmada pelo usuário: a planilha é SEMPRE a lista
 * completa do edital, nunca um lote de adição.
 *
 * ── POR QUE O PREPARO EXISTE ────────────────────────────────────────────────────────
 *
 * MEDIDO: o lote inteiro em JSON dá 5,40 MB para 7.416 inscritos, contra o limite padrão
 * de 5 MB do Kong. Mandar tudo numa chamada não cabe hoje e piora com o edital. Por isso
 * os blocos continuam — só que o destino é `candidatos_importacao`, e a atomicidade
 * mudou de lugar: ela agora vive na RPC, no servidor, e não mais em "cada bloco é uma
 * transação sua".
 *
 * ── ⚠️ A INVERSÃO QUE PRECISA ESTAR CLARA PARA QUEM LÊ O RELATÓRIO ─────────────────
 *
 * Antes, um bloco falho deixava a importação PELA METADE e reimportar consertava.
 * Agora, um bloco falho deixa a lista INTACTA: o preparo é descartado e a troca não
 * acontece. É melhor, mas é diferente — e por isso `ResultadoImportacao.trocou` existe.
 *
 * ⚠️ `deduplicar()` e `chaveNatural()` continuam necessários e NÃO mudaram: se a planilha
 * trouxer duas linhas com a mesma chave, o índice único recusa o INSERT — e agora o
 * INSERT é a troca INTEIRA, então uma duplicata no arquivo derruba tudo.
 */
export function useImportarCandidatos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({
      editalId,
      candidatos,
      onProgresso,
      deveParar,
    }: {
      /**
       * ⚠️ Explícito, e não deduzido de `candidatos[0].edital_id`: é o edital cuja lista
       * será APAGADA. Um valor implícito numa operação destrutiva é o tipo de coisa que
       * ninguém confere. A GUARDA 2 da RPC recusa se o preparo não for todo dele.
       */
      editalId: string;
      // ⭐ `CandidatoResolvido`, e não `CandidatoImportado`: o tipo é o que impede um lote
      // SEM `cargo_id` de chegar aqui. Esse campo compõe a chave natural — mandar o lote
      // não-resolvido gravaria linhas com a identidade incompleta, e o TS recusa antes.
      candidatos: CandidatoResolvido[];
      onProgresso?: (p: ProgressoImportacao) => void;
      deveParar?: () => boolean;
    }): Promise<ResultadoImportacao> => {
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id ?? null;
      const importacaoId = crypto.randomUUID();
      const blocos: ResultadoBloco[] = [];

      const semTroca = (motivo: string): ResultadoImportacao => ({
        blocos,
        trocou: false,
        removidos: 0,
        inseridos: 0,
        motivoNaoTrocou: motivo,
      });

      // Preparo abandonado de uma tentativa anterior faria a contagem passar do esperado
      // e a GUARDA 3 recusaria a troca. Como o `importacaoId` é novo a cada chamada, isto
      // é defesa contra um uuid repetido — improvável, mas barato de descartar.
      await supabase.from("candidatos_importacao").delete().eq("importacao_id", importacaoId);

      const interrompida = await subirPreparo({
        candidatos,
        editalId,
        importacaoId,
        createdBy,
        blocos,
        onProgresso,
        deveParar,
      });

      // ── 🔴 O GATE: só troca a lista se o preparo estiver COMPLETO ──────────────────
      // Chamar a RPC aqui com o preparo pela metade apagaria a lista inteira e reporia só
      // uma parte. A GUARDA 3 do banco recusaria (é ela a rede de segurança), mas mandar
      // um pedido que se SABE inválido é pedir para o banco decidir o que já está
      // decidido aqui — e o usuário receberia um erro de banco em vez de uma explicação.
      const limparPreparo = async () => {
        await supabase.from("candidatos_importacao").delete().eq("importacao_id", importacaoId);
      };

      if (interrompida) {
        await limparPreparo();
        return semTroca("A importação foi interrompida antes de terminar de enviar.");
      }

      const blocoComErro = blocos.find((b) => b.erro !== null);
      if (blocoComErro) {
        await limparPreparo();
        return semTroca(`O envio falhou no bloco ${blocoComErro.bloco}: ${blocoComErro.erro}`);
      }

      // ── A troca ────────────────────────────────────────────────────────────────────
      // `p_total_esperado` é a conferência que o banco faz contra o preparo. Ela NÃO é
      // redundante com o gate acima: o gate garante que ESTE cliente enviou tudo; a
      // guarda garante que o que CHEGOU é tudo — bloco aceito mas não persistido, uuid
      // colidido ou escrita concorrente não passam por ela.
      const { data, error } = await supabase.rpc("trocar_candidatos_do_edital", {
        p_edital_id: editalId,
        p_importacao_id: importacaoId,
        p_total_esperado: candidatos.length,
      });

      if (error) {
        await limparPreparo();
        return semTroca(mensagemErroImportacao(error.message));
      }

      // A RPC devolve UMA linha; o PostgREST entrega como array por ser RETURNS TABLE.
      const troca = (Array.isArray(data) ? data[0] : data) as
        | { removidos: number; inseridos: number }
        | undefined;

      return {
        blocos,
        trocou: true,
        removidos: Number(troca?.removidos ?? 0),
        inseridos: Number(troca?.inseridos ?? 0),
        motivoNaoTrocou: null,
      };
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
