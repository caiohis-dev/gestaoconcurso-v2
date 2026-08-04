import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SalaDistribuida {
  id: string;
  prova_id: string;
  sala_fk_unidade: string;
  sala_numero: number;
  sala_descricao: string | null;
  sala_capacidade: number;
  sala_andar: number | null;
  // ⚠️ `sala_andar_texto` foi REMOVIDO daqui em 2026-08-03: a coluna NÃO EXISTE na
  // tabela. As 12 colunas reais são as declaradas nesta interface. Por ser opcional,
  // o `tsc` nunca reclamou e o `select("*")` nunca a trouxe — quem confiasse nela
  // leria `undefined` para sempre. Se um dia a coluna existir, ela nasce na migration
  // primeiro.
  sala_fiscal_1: string | null;
  sala_fiscal_2: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

/**
 * Salas em que uma alocação está como fiscal. Usado pela confirmação de remoção em
 * `/gerenciar-colaboradores-prova`.
 *
 * POR QUE ISTO EXISTE: `salas_prova_distribuidas.sala_fiscal_1/2` aponta para
 * `colaboradores_prova` com **ON DELETE SET NULL**. Remover alguém da unidade esvazia o
 * fiscal da sala — o que está CERTO (quem saiu da unidade não pode ser fiscal nela), mas
 * acontecia **em silêncio**, e em outra tela: quem remove costuma não saber que a pessoa
 * era fiscal, porque isso se decide em `/gerenciar-salas-distribuidas`.
 *
 * Decisão do usuário (2026-07-26): **avisar, não bloquear**. Bloquear obrigaria a passar
 * por duas telas numa operação que costuma ser urgente no dia da prova. O defeito real
 * era o silêncio, não o SET NULL.
 */
export function useSalasDoFiscal(colaboradorProvaId: string | null) {
  return useQuery({
    queryKey: ["salas-do-fiscal", colaboradorProvaId],
    enabled: !!colaboradorProvaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salas_prova_distribuidas")
        .select("sala_numero")
        .or(`sala_fiscal_1.eq.${colaboradorProvaId},sala_fiscal_2.eq.${colaboradorProvaId}`)
        .order("sala_numero");

      if (error) throw error;
      return (data ?? []).map((s) => s.sala_numero);
    },
  });
}

/**
 * Monta o aviso da confirmação de remoção. Puro de propósito — é a parte que precisa de
 * teste, e renderizar a página inteira para checar uma frase seria desproporcional.
 *
 * Devolve `null` quando não há sala: nesse caso a confirmação segue com o texto padrão,
 * sem inventar um aviso vazio.
 */
export function avisoFiscalDeSala(nome: string | undefined, salas: number[]): string | null {
  if (!salas.length) return null;

  const quem = nome?.trim() || 'Este colaborador';
  // O plural existe porque o banco não impede a mesma pessoa de ser fiscal de duas salas
  // — só a UI de distribuição evita. Confiar nessa UI aqui repetiria o erro que este
  // aviso existe para corrigir.
  const lista = salas.join(', ');
  return salas.length === 1
    ? `${quem} está como fiscal da sala ${lista}. Removê-lo desta unidade vai retirá-lo dessa sala automaticamente.`
    : `${quem} está como fiscal das salas ${lista}. Removê-lo desta unidade vai retirá-lo dessas salas automaticamente.`;
}

/** O que o supabase-js entrega no `onError`: `Error`, com os campos do Postgrest quando vem do banco. */
interface ErroDoBanco extends Error {
  code?: string;
  details?: string;
}

/** A chave única de (prova_id, sala_fk_unidade, sala_numero) — 20260726220000/20260803001556. */
const CHAVE_NUMERO_DA_SALA = "salas_prova_distribuidas_prova_unidade_numero_key";

/**
 * Traduz a recusa por número repetido. **Esta é a exceção à regra da casa**, e vale
 * explicar por quê: aqui o padrão é repassar a mensagem do banco (`mensagemErroRemocaoValor`
 * existe justamente porque descartá-la já custou caro duas vezes). A regra existe para
 * não trocar uma EXPLICAÇÃO por um genérico — e é exatamente o que se faz abaixo, ao
 * contrário: `duplicate key value violates unique constraint "salas_prova_..."` não
 * explica nada a quem está renumerando salas. Só o 23505 desta chave é traduzido; todo o
 * resto — inclusive as mensagens que a própria RPC escreve, que já estão em português e
 * dizem o que fazer — passa adiante intacto.
 *
 * Nomeia o número quando o `details` do Postgres o traz: "corrija a sala 203" é acionável,
 * "existe um número repetido" manda procurar.
 */
export function mensagemErroSalvarSalas(error: ErroDoBanco): string {
  const ehNumeroRepetido =
    error?.code === "23505" || (error?.message ?? "").includes(CHAVE_NUMERO_DA_SALA);

  if (!ehNumeroRepetido) {
    return error?.message?.trim() || "Erro ao salvar";
  }

  const numero = numeroDaChaveDuplicada(error?.details);

  return numero
    ? `Já existe outra sala com o número ${numero} nesta unidade. Nenhuma alteração foi salva: escolha outro número e salve de novo.`
    : "Duas salas desta unidade ficariam com o mesmo número. Nenhuma alteração foi salva: corrija a numeração e salve de novo.";
}

/**
 * Extrai o `sala_numero` de um `details` como
 * `Key (prova_id, sala_fk_unidade, sala_numero)=(uuid, uuid, 203) already exists.`
 *
 * ⚠️ É leitura de texto de erro, então falha por omissão de propósito: sem casar, devolve
 * `null` e a mensagem cai na versão sem número — nunca inventa um.
 */
function numeroDaChaveDuplicada(details?: string): string | null {
  const valores = details?.match(/\)=\(([^)]*)\)/)?.[1];
  if (!valores) return null;

  const ultimo = valores.split(",").pop()?.trim();
  return ultimo && /^\d+$/.test(ultimo) ? ultimo : null;
}

/** Referência estável para "sem salas" — ver a nota no `return` do hook. */
const SEM_SALAS: SalaDistribuida[] = [];

export function useSalasDistribuidas(provaId: string, unidadeId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["salas_prova_distribuidas", provaId, unidadeId],
    queryFn: async () => {
      let queryBuilder = supabase
        .from("salas_prova_distribuidas")
        .select("*")
        .eq("prova_id", provaId)
        .order("sala_andar")
        .order("sala_numero");

      if (unidadeId) {
        queryBuilder = queryBuilder.eq("sala_fk_unidade", unidadeId);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as SalaDistribuida[];
    },
    enabled: !!provaId,
  });

  /**
   * 🔴 UMA chamada, UMA transação (2026-08-03). Eram N `UPDATE` em `Promise.all`, e isso
   * tornava **impossível a operação mais banal da tela: trocar o número de duas salas**.
   * O índice único é verificado linha a linha, então uma das escritas sempre encontrava a
   * outra ainda no número antigo e estourava 23505 — com a outra JÁ GRAVADA, porque não
   * havia transação. A RPC `salvar_salas_distribuidas` resolve isso **renumerando em dois
   * passos** dentro da transação — os números do lote saem de circulação antes de os
   * finais entrarem. ⚠️ Não é constraint `DEFERRABLE`: essa era a saída canônica e foi
   * rejeitada porque quebra o `db reset` (o dump usa `ON CONFLICT DO NOTHING`, que não
   * aceita árbitro deferrable). Ver o cabeçalho da migration 20260803001556.
   *
   * ⚠️ Sala sem `id` NÃO é mais ignorada em silêncio: a RPC compara o que foi pedido com
   * o que encontrou e recusa o lote inteiro. Para sala nova o caminho continua sendo
   * `addSala`.
   */
  const updateSalasMutation = useMutation({
    mutationFn: async (salas: Partial<SalaDistribuida>[]) => {
      const { error } = await supabase.rpc("salvar_salas_distribuidas", {
        p_salas: salas.map((sala) => ({
          id: sala.id ?? null,
          sala_numero: sala.sala_numero,
          sala_capacidade: sala.sala_capacidade,
          sala_descricao: sala.sala_descricao ?? null,
          sala_andar: sala.sala_andar ?? null,
          sala_fiscal_1: sala.sala_fiscal_1 ?? null,
          sala_fiscal_2: sala.sala_fiscal_2 ?? null,
        })),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova_distribuidas", provaId] });
      toast({
        title: "Alterações salvas",
        description: "As salas foram atualizadas com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: mensagemErroSalvarSalas(error),
        variant: "destructive",
      });
    },
  });

  const addSalaMutation = useMutation({
    mutationFn: async (sala: {
      prova_id: string;
      sala_fk_unidade: string;
      sala_numero: number;
      sala_descricao: string | null;
      sala_andar: number | null;
      sala_capacidade: number;
    }) => {
      const { data, error } = await supabase
        .from("salas_prova_distribuidas")
        .insert(sala)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova_distribuidas", provaId] });
      toast({
        title: "Sala adicionada",
        description: "A sala extra foi adicionada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar sala",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    // ⚠️ `SEM_SALAS` é constante de módulo, NÃO `?? []`. Um literal aqui cria array novo a
    // cada render, e quem tiver `useEffect(..., [salas])` entra em laço infinito enquanto
    // a query não tiver dado. Em `GerenciarSalasDistribuidas` isso ficou escondido por
    // anos atrás de um `if (salas.length > 0)` — que também impedia a tela de reagir à
    // lista voltar vazia. Ao remover aquele guarda (03/08), o laço apareceu na hora: o
    // worker do Vitest morreu por falta de memória.
    salas: query.data ?? SEM_SALAS,
    isLoading: query.isLoading,
    error: query.error,
    updateSalas: updateSalasMutation.mutate,
    isSaving: updateSalasMutation.isPending,
    addSala: addSalaMutation.mutate,
    isAddingSala: addSalaMutation.isPending,
  };
}

export function useSalasDistribuidasCapacidade(provaId: string, unidadeIds: string[]) {
  return useQuery({
    queryKey: ["salas_prova_distribuidas_capacidade", provaId, unidadeIds],
    queryFn: async () => {
      if (unidadeIds.length === 0) return {};

      const { data, error } = await supabase
        .from("salas_prova_distribuidas")
        .select("sala_fk_unidade, sala_capacidade")
        .eq("prova_id", provaId)
        .in("sala_fk_unidade", unidadeIds);

      if (error) throw error;

      const capacidadePorUnidade: Record<string, number> = {};

      data?.forEach((sala) => {
        const unidadeId = sala.sala_fk_unidade;
        capacidadePorUnidade[unidadeId] = (capacidadePorUnidade[unidadeId] || 0) + sala.sala_capacidade;
      });

      return capacidadePorUnidade;
    },
    enabled: !!provaId && unidadeIds.length > 0,
  });
}

export interface FiscalSala {
  colaborador_prova_id: string;
  colaborador_nome: string;
}

export function useFiscaisSala(provaId: string) {
  return useQuery({
    queryKey: ["fiscais_sala", provaId],
    queryFn: async () => {
      // First get all prova_unidades for this prova
      const { data: provaUnidades, error: puError } = await supabase
        .from("prova_unidades")
        .select("id")
        .eq("prova_id", provaId);

      if (puError) throw puError;

      if (!provaUnidades || provaUnidades.length === 0) return [];

      const provaUnidadeIds = provaUnidades.map((pu) => pu.id);

      // Get colaboradores_prova with funcao "fiscal de sala" for this prova
      const { data, error } = await supabase
        .from("colaboradores_prova")
        .select(`
          id,
          colaborador_id,
          funcao_id,
          colaboradores!inner(colab_nome_completo),
          funcoes_colaboradores!inner(cargo_nome)
        `)
        .in("prova_unidade_id", provaUnidadeIds);

      if (error) throw error;

      // Filter only "fiscal de sala" function (case insensitive)
      const fiscais = data?.filter((cp) => {
        const funcao = (cp.funcoes_colaboradores as any)?.cargo_nome?.toLowerCase() || "";
        return funcao.includes("fiscal") && funcao.includes("sala");
      }) || [];

      return fiscais.map((f) => ({
        colaborador_prova_id: f.id,
        colaborador_nome: (f.colaboradores as any)?.colab_nome_completo || "Sem nome",
      })) as FiscalSala[];
    },
    enabled: !!provaId,
  });
}
