import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { numerosDoLote, resumoDoLote } from "@/lib/salas";

/**
 * ⚠️ **`sala_arcondicionado` saiu em 2026-08-03** — coluna dropada (migration
 * `20260803...`), decisão do usuário ("é lixo, não existe mais"). As 52 salas do banco
 * tinham `false`; ninguém nunca usou. Não a reintroduza: ela também **nunca existiu** em
 * `salas_prova_distribuidas`, ou seja, jamais chegou a uma prova.
 */
export interface SalaProva {
  id: string;
  sala_fk_unidade: string;
  sala_numero: number;
  sala_descricao: string | null;
  sala_capacidade: number;
  sala_andar: number | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface SalaProvaInsert {
  sala_fk_unidade: string;
  sala_numero: number;
  sala_descricao?: string | null;
  sala_capacidade: number;
  sala_andar?: number | null;
}

/**
 * 🔵 **A faixa `andar_de..andar_ate` é de 2026-08-03.** `quantidade` é **por andar**: o
 * total gravado é `quantidade × (andar_ate − andar_de + 1)`. Antes havia um `sala_andar`
 * só, e o lote inteiro caía nele.
 */
export interface SalaProvaCreateMultiple {
  sala_fk_unidade: string;
  quantidade: number;
  sala_capacidade: number;
  andar_de: number;
  andar_ate: number;
}

export interface SalaProvaUpdate {
  sala_numero?: number;
  sala_descricao?: string | null;
  sala_capacidade?: number;
  // 🔴 `null`, não `undefined`: chave com `undefined` some no `JSON.stringify` e o PATCH
  // sai sem a coluna — o toast dizia "Sala atualizada" e o andar continuava lá.
  sala_andar?: number | null;
}

/**
 * Traduz o 23505 do índice único criado em 2026-07-26 (`sala_prova_unidade_numero_key`).
 *
 * Dois caminhos chegam aqui, e a saída de cada um é diferente:
 *
 * - **Criação:** a numeração é calculada no cliente (lê o maior número do andar e insere
 *   max+1), o que é uma corrida — duas sessões leem o mesmo max e gravam os mesmos
 *   números. O índice não conserta a corrida, ele a torna VISÍVEL, e a saída é repetir a
 *   ação: na segunda vez o max já mudou.
 * - **Edição:** a pessoa digitou um número que já existe. Repetir não adianta; ela
 *   precisa escolher outro.
 *
 * Sem esta tradução, os dois casos chegariam como texto cru do Postgres.
 */
export function mensagemErroSala(
  error: { message: string; code?: string },
  acao: 'criacao' | 'edicao',
): string {
  const numeroRepetido =
    error.code === '23505' ||
    /duplicate key|unique constraint|sala_prova_unidade_numero_key/i.test(error.message);
  if (!numeroRepetido) return error.message;

  return acao === 'criacao'
    ? 'Já existe sala com esse número nesta unidade — provavelmente outra pessoa criou salas ao mesmo tempo. Nenhuma sala foi criada; tente novamente.'
    : 'Já existe sala com esse número nesta unidade. Escolha outro número.';
}

/**
 * ⚠️ Referência estável para o caso vazio. `?? {}` devolveria objeto novo a cada render, e
 * é a mesma bomba que o `?? []` de `useSalasDistribuidas` armou em 03/08: quem puser este
 * valor em deps de `useEffect` ganha um laço infinito. Ver `provas-e-unidades.md`.
 */
const SEM_CAPACIDADES: Readonly<Record<string, number>> = Object.freeze({});

/**
 * Capacidade **do cadastro** de cada unidade: a soma de `sala_capacidade` das salas de
 * `sala_prova`, que é o template reutilizável.
 *
 * 🔴 **Não confundir com `useUnidadeCapacidade`**, que soma `salas_prova_distribuidas` — o
 * snapshot de UMA prova. Os dois respondem "quantos lugares tem esta unidade" e dão
 * números diferentes de propósito: medido em 03/08, a CGV tem 480 no cadastro e 960
 * somando as duas provas do dump. Este hook é o certo para falar de unidade que **ainda
 * não foi vinculada** a prova nenhuma (o seletor de `/gerenciar-prova`); o outro é o certo
 * para falar dos lugares de uma prova.
 *
 * Traz o catálogo inteiro numa consulta só (52 linhas em 03/08) em vez de uma por unidade:
 * a agregação é no cliente, como em `useUnidadeCapacidade`. ⚠️ Se `sala_prova` passar de
 * 1.000 linhas, o limite padrão do PostgREST trunca e a soma fica calada a menos — nesse
 * dia isto vira uma RPC de agregação, não uma paginação no cliente.
 */
export function useCapacidadeTemplateUnidades() {
  const query = useQuery({
    queryKey: ["sala_prova_capacidade"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sala_prova")
        .select("sala_fk_unidade, sala_capacidade");

      if (error) throw error;

      const porUnidade: Record<string, number> = {};
      (data ?? []).forEach((sala) => {
        porUnidade[sala.sala_fk_unidade] =
          (porUnidade[sala.sala_fk_unidade] ?? 0) + sala.sala_capacidade;
      });

      return porUnidade;
    },
  });

  return {
    capacidades: query.data ?? SEM_CAPACIDADES,
    isLoading: query.isLoading,
    // 🔴 O erro FAZ PARTE do contrato: consulta que falhou devolve o mesmo `{}` de
    // "nenhuma sala cadastrada", e quem exibir um sem olhar o outro afirma que as
    // unidades estão vazias quando na verdade não deu para perguntar.
    error: query.error,
  };
}

export function useSalasProva(unidadeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["salas_prova", unidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sala_prova")
        .select("*")
        .eq("sala_fk_unidade", unidadeId)
        .order("sala_numero");

      if (error) throw error;
      return data as SalaProva[];
    },
    enabled: !!unidadeId,
  });

  const createMultipleMutation = useMutation({
    mutationFn: async (params: SalaProvaCreateMultiple) => {
      const { data: userData } = await supabase.auth.getUser();
      
      // As salas que já existem na unidade — é delas que sai a sequência de cada andar.
      const { data: existingSalas, error: fetchError } = await supabase
        .from("sala_prova")
        .select("sala_numero")
        .eq("sala_fk_unidade", params.sala_fk_unidade);

      if (fetchError) throw fetchError;

      // A numeração mora em `lib/salas.ts`, pura e com teste próprio: é ela que sabe do
      // esquema `andar × 100 + sequência` e do teto de 99 salas por andar.
      const calculo = numerosDoLote(
        {
          quantidade: params.quantidade,
          andarDe: params.andar_de,
          andarAte: params.andar_ate,
        },
        (existingSalas ?? []).map((s) => s.sala_numero),
      );

      // ⚠️ Recusa ANTES de escrever. Sem isto, o estouro de andar virava colisão no índice
      // único e chegava ao usuário como corrida entre dois admins.
      if (calculo.erro) throw new Error(calculo.erro);

      const salasToInsert = calculo.andares.flatMap(({ andar, numeros }) =>
        numeros.map(
          (sala_numero) =>
            ({
              sala_fk_unidade: params.sala_fk_unidade,
              sala_numero,
              sala_capacidade: params.sala_capacidade,
              sala_andar: andar,
              created_by: userData.user?.id,
            }) as SalaProvaInsert & { created_by: string | undefined },
        ),
      );

      // Um único INSERT: uma instrução é atômica, então não há lote pela metade.
      const { data, error } = await supabase
        .from("sala_prova")
        .insert(salasToInsert)
        .select();

      if (error) throw error;
      return { salas: data, resumo: resumoDoLote(calculo.andares) };
    },
    onSuccess: ({ salas: data, resumo }) => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova", unidadeId] });
      // Mexer nas salas muda a capacidade do cadastro, que outra tela exibe.
      queryClient.invalidateQueries({ queryKey: ["sala_prova_capacidade"] });
      toast({
        title: data.length === 1 ? "Sala criada" : "Salas criadas",
        // Os números entram na mensagem: com a faixa de andares, "30 salas criadas" não
        // diz onde elas foram parar.
        description:
          data.length === 1
            ? `A sala ${resumo} foi criada com sucesso.`
            : `${data.length} salas criadas: ${resumo}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar salas",
        description: mensagemErroSala(error, 'criacao'),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SalaProvaUpdate }) => {
      const { data: result, error } = await supabase
        .from("sala_prova")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova", unidadeId] });
      // Mexer nas salas muda a capacidade do cadastro, que outra tela exibe.
      queryClient.invalidateQueries({ queryKey: ["sala_prova_capacidade"] });
      toast({
        title: "Sala atualizada",
        description: "A sala foi atualizada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar sala",
        description: mensagemErroSala(error, 'edicao'),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sala_prova")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salas_prova", unidadeId] });
      // Mexer nas salas muda a capacidade do cadastro, que outra tela exibe.
      queryClient.invalidateQueries({ queryKey: ["sala_prova_capacidade"] });
      toast({
        title: "Sala excluída",
        description: "A sala foi excluída com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir sala",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    salas: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createMultiple: createMultipleMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
    isCreating: createMultipleMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
