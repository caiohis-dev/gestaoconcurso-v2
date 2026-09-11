import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { removerAcentos } from '@/lib/texto';

// Traduz a violação de índice único (CPF, matrícula, PIS, e-mail e chave PIX são
// UNIQUE) numa frase para a pessoa. Devolve null quando o erro não é de duplicidade,
// para o chamador manter a própria mensagem. A constraint violada vem no nome do índice
// (ex.: colaboradores_colab_email_key), que o supabase-js pode entregar em .message ou
// em .details — olhamos os dois.
function mensagemDuplicidade(error: Error): string | null {
  const raw = `${error.message} ${(error as { details?: string }).details ?? ''}`;
  if (!raw.includes('duplicate key')) return null;
  if (raw.includes('colab_cpf')) return 'CPF já cadastrado';
  if (raw.includes('colab_matricula')) return 'Matrícula já cadastrada';
  if (raw.includes('colab_pis')) return 'PIS já cadastrado';
  if (raw.includes('colab_email')) return 'Este e-mail já está cadastrado para outro colaborador. Verifique o endereço e tente novamente.';
  if (raw.includes('colab_chave_pix')) return 'Esta chave PIX já está cadastrada para outro colaborador. Cada chave pertence a uma única pessoa — verifique e tente novamente.';
  return 'Um dos dados informados já está cadastrado para outro colaborador.';
}

/**
 * Traduz a recusa do banco ao excluir um colaborador com histórico (migration
 * 20260726210000, que trocou CASCADE/SET NULL por RESTRICT nas FKs de participação).
 *
 * Nomeia o obstáculo porque as três situações são diferentes para quem está na tela:
 * alocação tem saída (desalocar), ocorrência e substituição não têm — são registro de
 * algo que aconteceu numa prova, e a decisão do usuário é que isso torne a exclusão
 * impossível, não apenas difícil. Por isso a frase muda de "remova antes" para "não pode
 * ser excluído": prometer uma saída que não existe é pior que recusar com clareza.
 *
 * ⚠️ `substituto_id` vem antes na ordem: o nome da constraint de substituto contém
 * "ocorrencias_colaborador", então casar por essa tabela primeiro engoliria o caso.
 */
export function mensagemErroExclusaoColaborador(error: { message: string; code?: string }): string {
  const comHistorico =
    error.code === '23503' || /foreign key constraint|violates foreign key/i.test(error.message);
  if (!comHistorico) return error.message;

  if (/substituto_id_fkey/.test(error.message)) {
    return 'Este colaborador consta como substituto em uma ocorrência de prova e, por isso, não pode ser excluído.';
  }
  if (/ocorrencias_colaborador/.test(error.message)) {
    return 'Este colaborador tem histórico de ocorrência em prova e, por isso, não pode ser excluído.';
  }
  if (/colaboradores_prova/.test(error.message)) {
    return 'Este colaborador está alocado em uma prova. Remova a alocação antes de excluí-lo.';
  }
  return 'Este colaborador tem histórico registrado e não pode ser excluído.';
}

export interface Colaborador {
  id: string;
  /** Conta do Auth que reivindicou este cadastro. Não-nulo = colab_email é a âncora do login. */
  user_id: string | null;
  colab_matricula: string | null;
  colab_nome_completo: string | null;
  colab_cpf: string;
  colab_data_nascimento: string;
  colab_nacionalidade: string | null;
  colab_pis: string | null;
  colab_rua: string | null;
  colab_numero_casa: number | null;
  colab_bairro: string | null;
  colab_cidade: string | null;
  colab_cep: number | null;
  colab_estado_civil: number | null;
  colab_raca: number | null;
  colab_grau_instrucao: number | null;
  colab_telefone: number | null;
  colab_complemento_endereco: string | null;
  colab_deficiente: boolean;
  colab_email: string | null;
  colab_chave_pix: string | null;
  colab_ultimo_acesso: string | null;
  codigo_banco: string | null;
  agencia: string | null;
  agencia_dv: string | null;
  conta: string | null;
  conta_dv: string | null;
  tipo_conta: string | null;
  created_at: string;
  updated_at: string;
}

export type ColaboradorInsert = Omit<Colaborador, 'id' | 'created_at' | 'updated_at' | 'colab_ultimo_acesso' | 'user_id'>;

/**
 * As colunas que as LISTAGENS realmente exibem — 7 das 33 da tabela.
 *
 * 🔴 Não é micro-otimização: `select('*')` traz CPF, PIS, banco, agência, conta e chave
 * PIX de todo mundo para o navegador de qualquer coordenador. Medido em 2026-09-10
 * contra o banco local (771 linhas): 707 kB com `*` contra 198 kB com estas 7 — e o que
 * sai do fio é a base bancária inteira, que nenhuma listagem mostra.
 *
 * ⚠️ Serve os DOIS consumidores de listagem: a busca de `/colaboradores` (nome,
 * matrícula, CPF, telefone, PIX, último acesso) e o picker de alocação de
 * `GerenciarColaboradoresProva`, que usa só nome, CPF e telefone — subconjunto deste.
 * Antes de tirar uma coluna daqui, confira os dois.
 *
 * A EDIÇÃO não depende disto: `ColaboradoresList.handleEdit` busca a linha completa com
 * `.eq('id').single()` no momento do clique.
 */
const COLUNAS_LISTAGEM =
  'id, colab_matricula, colab_nome_completo, colab_cpf, colab_telefone, colab_chave_pix, colab_ultimo_acesso';

/** O recorte que as listagens recebem. Ver {@link COLUNAS_LISTAGEM}. */
export type ColaboradorListagem = Pick<
  Colaborador,
  | 'id'
  | 'colab_matricula'
  | 'colab_nome_completo'
  | 'colab_cpf'
  | 'colab_telefone'
  | 'colab_chave_pix'
  | 'colab_ultimo_acesso'
>;

export interface UseColaboradoresOptions {
  /** When true, fetches all collaborators regardless of role (for adding to exams) */
  fetchAll?: boolean;
}

/**
 * Só as escritas, sem consulta nenhuma.
 *
 * 🔴 Existe porque `ColaboradorDialog` usava `useColaboradores()` apenas pelas mutations
 * — e pagava a listagem inteira junto, sob outra `queryKey`, para jogar fora. Em
 * `/cadastro-publico` era pior: o diálogo monta para visitante ANÔNIMO, a consulta batia
 * na RLS (`42501 permission denied`) e o React Query, sem `retry` configurado, repetia
 * 4 vezes por visita. Medido em 2026-09-10.
 *
 * Quem precisa das duas coisas usa `useColaboradores`, que compõe este hook.
 */
export function useColaboradoresMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (colaborador: ColaboradorInsert) => {
      const { data, error } = await supabase
        .from('colaboradores')
        .insert(colaborador)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Colaborador cadastrado com sucesso!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao cadastrar',
        description: mensagemDuplicidade(error) ?? error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...colaborador }: Partial<Colaborador> & { id: string }) => {
      const { data, error } = await supabase
        .from('colaboradores')
        .update(colaborador)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Colaborador atualizado com sucesso!',
      });
    },
    onError: (error: Error) => {
      let message = error.message;

      if (error.message.includes('row-level security policy')) {
        message = 'Você não tem permissão para editar este colaborador.';
      } else {
        message = mensagemDuplicidade(error) ?? message;
      }

      toast({
        title: 'Erro ao atualizar',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // O pré-check que existia aqui (SELECT em colaboradores_prova e throw) foi removido
      // em 2026-07-26, junto com a migration que pôs RESTRICT nas FKs de participação.
      //
      // Ele protegia menos do que aparentava: checava alocação e NÃO checava ocorrência,
      // então quem tinha histórico de ocorrência sem alocação era excluído POR ESTA TELA,
      // levando o histórico junto. E, sendo "leio e então decido", era uma corrida — o
      // vínculo podia nascer entre o SELECT e o DELETE.
      //
      // Agora quem recusa é o banco, e a mensagem dele nomeia o obstáculo com mais
      // precisão do que o pré-check conseguia.
      const { error } = await supabase
        .from('colaboradores')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
      toast({
        title: 'Sucesso',
        description: 'Colaborador excluído com sucesso!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir',
        description: mensagemErroExclusaoColaborador(error),
        variant: 'destructive',
      });
    },
  });

  return {
    create: createMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Listagem completa dos colaboradores — o PICKER de alocação.
 *
 * ⚠️ Isto NÃO é o que `/colaboradores` usa. Aquela tela passou a buscar sob demanda em
 * 2026-09-10 (ver {@link useBuscarColaboradores}); este hook ficou para
 * `GerenciarColaboradoresProva`, que precisa NAVEGAR o conjunto para escolher quem
 * alocar, e por isso não comporta "só busca com critério".
 *
 * 🔴 O teto do PostgREST (`max_rows`, 1000 por padrão) vale aqui e ele TRUNCA EM
 * SILÊNCIO. Com ~774 colaboradores ainda cabe, mas este hook é o próximo a estourar —
 * e o sintoma será um colaborador que "não existe" no picker, sem erro nenhum.
 */
export function useColaboradores(options: UseColaboradoresOptions = {}) {
  const { fetchAll = false } = options;
  const { user, isAdmin, isCoordenador } = useAuth();
  const mutations = useColaboradoresMutations();

  const query = useQuery({
    queryKey: ['colaboradores', user?.id, isAdmin, isCoordenador, fetchAll],
    queryFn: async () => {
      // If fetchAll is true or user is admin, get all colaboradores
      if (fetchAll || isAdmin) {
        const { data, error } = await supabase
          .from('colaboradores')
          .select(COLUNAS_LISTAGEM)
          .order('colab_nome_completo', { ascending: true });

        if (error) throw error;
        return data as unknown as ColaboradorListagem[];
      }

      // If user is coordenador, get only their colaboradores
      if (isCoordenador && user?.id) {
        // Get the list of colaborador IDs that this coordinator can see
        const { data: allowedIds, error: idsError } = await supabase.rpc(
          'get_coordenador_colaboradores',
          { p_user_id: user.id }
        );

        if (idsError) throw idsError;

        if (!allowedIds || allowedIds.length === 0) {
          return [] as ColaboradorListagem[];
        }

        const { data, error } = await supabase
          .from('colaboradores')
          .select(COLUNAS_LISTAGEM)
          .in('id', allowedIds)
          .order('colab_nome_completo', { ascending: true });

        if (error) throw error;
        return data as unknown as ColaboradorListagem[];
      }

      // Regular users can see all colaboradores (read-only)
      const { data, error } = await supabase
        .from('colaboradores')
        .select(COLUNAS_LISTAGEM)
        .order('colab_nome_completo', { ascending: true });

      if (error) throw error;
      return data as unknown as ColaboradorListagem[];
    },
    enabled: !!user,
  });

  return {
    colaboradores: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    ...mutations,
  };
}

export type OrdemColaboradores = 'nome' | 'ultimo_acesso';

const COLUNA_ORDEM: Record<OrdemColaboradores, string> = {
  nome: 'colab_nome_completo',
  ultimo_acesso: 'colab_ultimo_acesso',
};

export const POR_PAGINA_COLABORADORES = 50;

export interface FiltroColaboradores {
  /** Critério digitado. Vazio (ou só espaços) NÃO consulta — ver `enabled` abaixo. */
  termo: string;
  pagina?: number;
  porPagina?: number;
  ordenarPor?: OrdemColaboradores | null;
  direcao?: 'asc' | 'desc';
}

/**
 * Busca paginada de colaboradores, SOB DEMANDA.
 *
 * 🔴 `enabled` é a barreira, não o botão desabilitado. A tela não consulta no load nem
 * com critério vazio — decisão do usuário em 2026-09-10, depois de medir que a listagem
 * antiga baixava 707 kB (33 colunas × 771 linhas) a cada montagem E a cada volta de foco
 * da janela, já que o `QueryClient` do `App.tsx` nasce sem `staleTime`.
 *
 * 🔵 A busca IGNORA ACENTO desde 2026-09-10: "jose" acha "José", e vice-versa. ⚠️ Isso
 * depende de DOIS lados casarem — `colab_nome_busca`, a coluna computada do PostgREST
 * (migration `20260911011204`), tira o acento do DADO; `removerAcentos` tira o do que foi
 * DIGITADO. Mexer num só faz a busca parar de achar, sem erro. Medido: 97 dos 771 nomes
 * têm acento, e enviar o termo cru devolve lista vazia.
 *
 * ⚠️ Só o NOME ignora acento. `colab_matricula` e `colab_cpf` continuam comparados como
 * estão — não têm acento, e normalizá-los seria trabalho sem efeito.
 *
 * A paginação não é enfeite: uma busca por "a" volta a encostar no teto de 1000 linhas
 * que o PostgREST aplica em silêncio.
 */
export function useBuscarColaboradores({
  termo,
  pagina = 0,
  porPagina = POR_PAGINA_COLABORADORES,
  ordenarPor = null,
  direcao = 'asc',
}: FiltroColaboradores) {
  const { user } = useAuth();
  const criterio = termo.trim();

  const query = useQuery({
    queryKey: ['colaboradores', 'busca', user?.id, criterio, pagina, porPagina, ordenarPor, direcao],
    enabled: !!user && criterio.length > 0,
    queryFn: async () => {
      // Mesmo escape de `useCandidatos`: `%`, `,` e parênteses são sintaxe do `or` do
      // PostgREST, e um deles digitado na busca quebraria a expressão inteira.
      const escapado = criterio.replace(/[%,()]/g, ' ');
      // O termo sem acento só serve para o NOME, que é o lado normalizado no banco.
      const semAcento = removerAcentos(escapado);

      const coluna = ordenarPor ? COLUNA_ORDEM[ordenarPor] : 'colab_nome_completo';

      const { data, error, count } = await supabase
        .from('colaboradores')
        .select(COLUNAS_LISTAGEM, { count: 'exact' })
        .or(
          `colab_nome_busca.ilike.%${semAcento}%,colab_matricula.ilike.%${escapado}%,colab_cpf.ilike.%${escapado}%`
        )
        // `nullsFirst: false` põe quem NUNCA acessou no fim, não no topo — ordenar por
        // "último acesso" existe justamente para achar essa gente, e o padrão do Postgres
        // (NULLS FIRST no DESC) entregaria a lista ao contrário do esperado.
        .order(coluna, { ascending: direcao === 'asc', nullsFirst: false })
        // Desempate estável: sem ele, duas linhas com o mesmo nome podem trocar de lugar
        // entre uma página e outra, repetindo uma e escondendo a outra.
        .order('id', { ascending: true })
        .range(pagina * porPagina, pagina * porPagina + porPagina - 1);

      if (error) throw error;
      return {
        colaboradores: (data ?? []) as unknown as ColaboradorListagem[],
        total: count ?? 0,
      };
    },
  });

  return {
    colaboradores: query.data?.colaboradores ?? [],
    total: query.data?.total ?? 0,
    isFetching: query.isFetching,
    error: query.error,
    /** Houve uma busca concluída? Distingue "ainda não buscou" de "não achou nada". */
    buscou: query.isSuccess,
  };
}
