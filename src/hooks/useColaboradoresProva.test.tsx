import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setTableResultSequence,
  resetSupabaseMock,
  erroPostgrest,
  type QueryBuilderMock,
} from "@/test/supabase-mock";
import { createTestQueryClient, renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { useColaboradoresProva } from "@/hooks/useColaboradoresProva";

const PROVA_UNIDADE_ID = "pu-1";

/**
 * `colaboradores_prova` é a alocação real: colaborador × unidade-da-prova × função.
 * Duas regras de negócio deste hook NÃO existem no banco — são checagens do cliente —,
 * e por isso são as que mais importam aqui:
 *   1. a tradução do erro "já está alocado" (que vem do banco) para PT-BR;
 *   2. o bloqueio de exclusão quando o colaborador tem acesso de coordenador, que é
 *      uma consulta prévia feita à mão antes do DELETE.
 */
describe("useColaboradoresProva", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
  });

  /** Cenário mínimo para as duas queries do hook resolverem sem ruído. */
  function cenarioBase() {
    setTableResultSequence("prova_unidades", [
      { data: { prova_id: "prova-1" }, error: null },
      { data: [{ id: PROVA_UNIDADE_ID, unidades_prova: { unid_nome: "Escola A", unid_sigla: "EA" } }], error: null },
    ]);
    setTableResult("colaboradores_prova", { data: [], error: null });
  }

  const builderDaTabela = (tabela: string, ocorrencia = 0) => {
    const chamadas = supabaseMock.from.mock.calls
      .map((c, i) => ({ tabela: c[0], i }))
      .filter((c) => c.tabela === tabela);
    return supabaseMock.from.mock.results[chamadas[ocorrencia].i].value as QueryBuilderMock;
  };

  describe("listagem", () => {
    it("não consulta nada sem provaUnidadeId (enabled: !!id)", async () => {
      cenarioBase();
      const { result } = renderHookWithProviders(() => useColaboradoresProva(""));

      // Sem id, as duas queries ficam desabilitadas — evita disparar consulta
      // com filtro vazio, que traria a tabela inteira.
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it("filtra pela unidade da prova e ordena do mais recente", async () => {
      cenarioBase();
      const { result } = renderHookWithProviders(() => useColaboradoresProva(PROVA_UNIDADE_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const b = builderDaTabela("colaboradores_prova");
      expect(b.eq).toHaveBeenCalledWith("prova_unidade_id", PROVA_UNIDADE_ID);
      expect(b.order).toHaveBeenCalledWith("created_at", { ascending: false });
    });
  });

  describe("colaboradores já alocados em outra unidade da mesma prova", () => {
    it("monta ids e a sigla da unidade onde cada um está", async () => {
      // É o que permite ao combobox mostrar o colaborador DESABILITADO, com a sigla
      // de onde ele já está — em vez de simplesmente escondê-lo, o que faria o
      // usuário procurar por alguém que "sumiu".
      setTableResultSequence("prova_unidades", [
        { data: { prova_id: "prova-1" }, error: null },
        {
          data: [
            { id: "pu-1", unidades_prova: { unid_nome: "Escola A", unid_sigla: "EA" } },
            { id: "pu-2", unidades_prova: { unid_nome: "Escola B", unid_sigla: "EB" } },
          ],
          error: null,
        },
      ]);
      setTableResultSequence("colaboradores_prova", [
        { data: [], error: null }, // a listagem da unidade atual
        { data: [{ colaborador_id: "colab-9", prova_unidade_id: "pu-2" }], error: null },
      ]);

      const { result } = renderHookWithProviders(() => useColaboradoresProva(PROVA_UNIDADE_ID));

      // O hook achata o retorno: `colaboradoresAlocados` é o ARRAY de ids, e a
      // informação da unidade vem separada em `colaboradoresAlocadosInfo`.
      await waitFor(() => expect(result.current.colaboradoresAlocados).toHaveLength(1));
      expect(result.current.colaboradoresAlocados).toEqual(["colab-9"]);
      expect(result.current.colaboradoresAlocadosInfo["colab-9"]).toEqual({
        prova_unidade_id: "pu-2",
        unid_nome: "Escola B",
        unid_sigla: "EB",
      });
    });
  });

  describe("create", () => {
    it("carimba created_by com o usuário da sessão", async () => {
      cenarioBase();
      const { result } = renderHookWithProviders(() => useColaboradoresProva(PROVA_UNIDADE_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.create({
        prova_unidade_id: PROVA_UNIDADE_ID,
        colaborador_id: "colab-1",
        funcao_id: "func-1",
        valor_pagamento: 150,
      });

      await waitFor(() => expect(supabaseMock.auth.getUser).toHaveBeenCalled());
    });

    it("traduz o erro de alocação duplicada vindo do banco", async () => {
      // Um colaborador só pode estar numa unidade por prova; quem impõe é o banco.
      // A mensagem crua não diria à coordenação o que fazer.
      cenarioBase();
      setTableResult("colaboradores_prova", {
        data: null,
        error: erroPostgrest("P0001", 'colaborador já está alocado nesta prova'),
      });
      const { result } = renderHookWithProviders(() => useColaboradoresProva(PROVA_UNIDADE_ID));

      result.current.create({
        prova_unidade_id: PROVA_UNIDADE_ID,
        colaborador_id: "colab-1",
        funcao_id: "func-1",
        valor_pagamento: 150,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          title: "Erro ao adicionar colaborador",
          description: "Este colaborador já está alocado em outra unidade desta prova.",
          variant: "destructive",
        }),
      );
    });

    it("repassa a mensagem original para outros erros", async () => {
      cenarioBase();
      setTableResult("colaboradores_prova", {
        data: null,
        error: erroPostgrest("42501", "permission denied"),
      });
      const { result } = renderHookWithProviders(() => useColaboradoresProva(PROVA_UNIDADE_ID));

      result.current.create({
        prova_unidade_id: PROVA_UNIDADE_ID,
        colaborador_id: "c",
        funcao_id: "f",
        valor_pagamento: 1,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "permission denied" }),
        ),
      );
    });
  });

  describe("delete — a trava do acesso de coordenador", () => {
    it("recusa a exclusão e NÃO chama delete quando há acesso de coordenador", async () => {
      cenarioBase();
      // A consulta prévia em coordenadores_prova encontra vínculo.
      setTableResult("coordenadores_prova", { data: { id: "cp-1" }, error: null });

      const { result } = renderHookWithProviders(() => useColaboradoresProva(PROVA_UNIDADE_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      supabaseMock.from.mockClear();

      result.current.delete("alocacao-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao remover colaborador",
            description: expect.stringContaining("possui acesso como Coordenador"),
          }),
        ),
      );

      // O ponto do teste: a guarda dispara ANTES do DELETE. Se alguém inverter a
      // ordem, o registro some e o acesso de coordenador vira órfão.
      const tabelasTocadas = supabaseMock.from.mock.calls.map((c) => c[0]);
      expect(tabelasTocadas).toContain("coordenadores_prova");
      expect(tabelasTocadas).not.toContain("colaboradores_prova");
    });

    it("exclui normalmente quando não há acesso de coordenador", async () => {
      cenarioBase();
      setTableResult("coordenadores_prova", { data: null, error: null });

      const { result } = renderHookWithProviders(() => useColaboradoresProva(PROVA_UNIDADE_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.delete("alocacao-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Colaborador removido" }),
        ),
      );
    });
  });

  describe("invalidação de cache", () => {
    it("propaga para as listas de coordenação, não só para a própria lista", async () => {
      // Alocar/desalocar muda quem é ELEGÍVEL a coordenador. Sem estas duas chaves,
      // a tela de acesso de coordenadores mostraria uma lista velha.
      const queryClient = createTestQueryClient();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      cenarioBase();

      const { result } = renderHookWithProviders(
        () => useColaboradoresProva(PROVA_UNIDADE_ID),
        { queryClient },
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      invalidate.mockClear();

      result.current.create({
        prova_unidade_id: PROVA_UNIDADE_ID,
        colaborador_id: "c",
        funcao_id: "f",
        valor_pagamento: 1,
      });

      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: ["colaboradores-elegiveis-coordenacao"],
        }),
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["coordenadores-prova"] });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["colaboradores_prova", PROVA_UNIDADE_ID],
      });
    });
  });
});
