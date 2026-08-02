import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// O nome do edital vem do join com `editais` (edital_id). `prova_edital` (CHAR30) ainda
// existe no banco e é escrito como cópia denormalizada durante a transição, até ser
// dropado num passo posterior; os consumidores devem ler `editais?.nome`.
//
// ⚠️ `provas.prova_n_candidatos` e `editais.n_candidatos` EXISTEM no banco e estão fora
// destas interfaces de propósito (02/08): o nº de inscritos é a contagem real de
// `candidatos`, e tipo que não expõe a coluna é o que impede o reconsumo de voltar calado.
// As colunas não foram dropadas porque o dump (`seed.local.sql`) as lista nos INSERTs e o
// backfill do `seed.pos.sql` lê ambas — dropar quebraria o `db reset` local.
export interface EditalDaProva {
  nome: string;
  cabecalho_linha1: string | null;
  cabecalho_linha2: string | null;
}

export interface Prova {
  id: string;
  prova_edital: string;
  edital_id: string | null;
  prova_data: string | null;
  prova_hora_inicio: string | null;
  prova_hora_final: string | null;
  prova_finalizada: boolean;
  finalizada_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  prova_cabecalho_linha1: string | null;
  prova_cabecalho_linha2: string | null;
  editais?: EditalDaProva | null;
  profiles?: {
    full_name: string | null;
  } | null;
}

export interface ProvaInsert {
  edital_id: string;
  // Cópia denormalizada do nome do edital, só para satisfazer o NOT NULL de
  // prova_edital enquanto a coluna não é dropada. Fonte de verdade é edital_id.
  prova_edital: string;
  prova_data?: string | null;
  prova_hora_inicio?: string | null;
  prova_hora_final?: string | null;
  prova_cabecalho_linha1?: string | null;
  prova_cabecalho_linha2?: string | null;
}

export interface ProvaUpdate {
  edital_id?: string;
  prova_edital?: string;
  prova_data?: string | null;
  prova_hora_inicio?: string | null;
  prova_hora_final?: string | null;
  prova_cabecalho_linha1?: string | null;
  prova_cabecalho_linha2?: string | null;
}

export function useProvas() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["provas"],
    queryFn: async () => {
      const { data: provasData, error } = await supabase
        .from("provas")
        .select("*, editais(nome, cabecalho_linha1, cabecalho_linha2)")
        .order("prova_data", { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Fetch creator names for provas with created_by
      const creatorIds = [...new Set(provasData.filter(p => p.created_by).map(p => p.created_by!))];
      
      let profilesMap: Record<string, string | null> = {};
      if (creatorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);
        
        if (profilesData) {
          profilesMap = profilesData.reduce((acc, p) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {} as Record<string, string | null>);
        }
      }

      return provasData.map(prova => ({
        ...prova,
        profiles: prova.created_by ? { full_name: profilesMap[prova.created_by] ?? null } : null,
      })) as Prova[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (prova: ProvaInsert) => {
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("provas")
        .insert({
          ...prova,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provas"] });
      toast({
        title: "Prova criada",
        description: "A prova foi criada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar prova",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProvaUpdate }) => {
      const { data: result, error } = await supabase
        .from("provas")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provas"] });
      toast({
        title: "Prova atualizada",
        description: "A prova foi atualizada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar prova",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // NÃO existe exclusão de prova, por decisão de 2026-07-26. `provas` era a raiz de
  // sete cascatas — apagar uma levava alocações, ocorrências, valores de pagamento,
  // metas, salas e acessos de coordenador. Havia confirmação por senha, e a decisão foi
  // que nem isso basta: o registro de uma prova é permanente.
  //
  // O banco também recusa (migration 20260726240000): a policy de DELETE foi removida e
  // um trigger barra até quem passa por cima da RLS com service_role. Reabrir isto aqui
  // não faria nada além de produzir um erro na tela.

  return {
    provas: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: createMutation.mutate,
    update: updateMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
