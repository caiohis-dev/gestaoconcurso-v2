import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  resetSupabaseMock,
  erroPostgrest,
  buildersDaTabela,
  builderQueChamou,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

// Segundo dos três arquivos que usam `sonner` em vez do use-toast do shadcn.
const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import { useMetaColaboradoresUnidade } from "@/hooks/useMetaColaboradoresUnidade";

const PROVA_UNIDADE_ID = "pu-1";


/**
 * `meta_colaboradores_unidade` é a meta de headcount por função, **por unidade da
 * prova** — não por prova inteira. É o que permite comparar planejado × alocado.
 *
 * Contraste deliberado com useValoresFuncaoProva: lá o "upsert" é decidido no
 * cliente, olhando a lista em cache; aqui é upsert de verdade, com onConflict
 * sobre a chave composta. Este é o padrão mais seguro dos dois.
 */
describe("useMetaColaboradoresUnidade", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  it("não consulta sem provaUnidadeId", async () => {
    const { result } = renderHookWithProviders(() => useMetaColaboradoresUnidade(""));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("filtra as metas pela unidade da prova", async () => {
    setTableResult("meta_colaboradores_unidade", {
      data: [{ id: "m1", prova_unidade_id: PROVA_UNIDADE_ID, funcao_id: "f1", quantidade_meta: 4 }],
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      useMetaColaboradoresUnidade(PROVA_UNIDADE_ID),
    );
    await waitFor(() => expect(result.current.metas).toHaveLength(1));

    expect(buildersDaTabela("meta_colaboradores_unidade")[0].eq).toHaveBeenCalledWith(
      "prova_unidade_id",
      PROVA_UNIDADE_ID,
    );
  });

  describe("upsertMetas", () => {
    it("resolve o conflito pela chave composta unidade+função", async () => {
      // A chave é (prova_unidade_id, funcao_id) — a meta é única por unidade DA
      // PROVA e função, não por prova. Se o onConflict perder um dos dois campos,
      // salvar de novo passa a duplicar ou a sobrescrever a unidade errada.
      setTableResult("meta_colaboradores_unidade", { data: [], error: null });

      const { result } = renderHookWithProviders(() =>
        useMetaColaboradoresUnidade(PROVA_UNIDADE_ID),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.upsertMetas([
        { funcao_id: "f1", quantidade_meta: 4 },
        { funcao_id: "f2", quantidade_meta: 2 },
      ]);

      await waitFor(() =>
        expect(toastMock.success).toHaveBeenCalledWith("Metas de colaboradores salvas com sucesso!"),
      );

      const mutacao = builderQueChamou("meta_colaboradores_unidade", "upsert");
      expect(mutacao.upsert).toHaveBeenCalledWith(expect.any(Array), {
        onConflict: "prova_unidade_id,funcao_id",
      });
    });

    it("carimba unidade e autor em cada item do lote", async () => {
      setTableResult("meta_colaboradores_unidade", { data: [], error: null });

      const { result } = renderHookWithProviders(() =>
        useMetaColaboradoresUnidade(PROVA_UNIDADE_ID),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.upsertMetas([
        { funcao_id: "f1", quantidade_meta: 4 },
        { funcao_id: "f2", quantidade_meta: 2 },
      ]);

      await waitFor(() => expect(supabaseMock.auth.getUser).toHaveBeenCalled());
      await waitFor(() =>
        expect(builderQueChamou("meta_colaboradores_unidade", "upsert").upsert).toHaveBeenCalledWith(
          [
            {
              prova_unidade_id: PROVA_UNIDADE_ID,
              funcao_id: "f1",
              quantidade_meta: 4,
              created_by: "user-teste-1",
            },
            {
              prova_unidade_id: PROVA_UNIDADE_ID,
              funcao_id: "f2",
              quantidade_meta: 2,
              created_by: "user-teste-1",
            },
          ],
          expect.anything(),
        ),
      );
    });

    it("aceita lote vazio sem quebrar", async () => {
      setTableResult("meta_colaboradores_unidade", { data: [], error: null });

      const { result } = renderHookWithProviders(() =>
        useMetaColaboradoresUnidade(PROVA_UNIDADE_ID),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.upsertMetas([]);

      await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
      expect(builderQueChamou("meta_colaboradores_unidade", "upsert").upsert).toHaveBeenCalledWith(
        [],
        expect.anything(),
      );
    });

    it("aceita meta zero — é como se zera o planejamento de uma função", async () => {
      setTableResult("meta_colaboradores_unidade", { data: [], error: null });

      const { result } = renderHookWithProviders(() =>
        useMetaColaboradoresUnidade(PROVA_UNIDADE_ID),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.upsertMetas([{ funcao_id: "f1", quantidade_meta: 0 }]);

      await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
      expect(builderQueChamou("meta_colaboradores_unidade", "upsert").upsert).toHaveBeenCalledWith(
        [expect.objectContaining({ quantidade_meta: 0 })],
        expect.anything(),
      );
    });

    it("INCLUI a mensagem do erro no toast, diferente do useValoresFuncaoProva", async () => {
      // Os dois hooks usam sonner, mas só este concatena o erro real. Divergência
      // de estilo entre hooks vizinhos — registrada, não uniformizada.
      setTableResult("meta_colaboradores_unidade", {
        data: null,
        error: erroPostgrest("23503", "violates foreign key constraint"),
      });

      const { result } = renderHookWithProviders(() =>
        useMetaColaboradoresUnidade(PROVA_UNIDADE_ID),
      );
      result.current.upsertMetas([{ funcao_id: "f1", quantidade_meta: 1 }]);

      await waitFor(() =>
        expect(toastMock.error).toHaveBeenCalledWith(
          "Erro ao salvar metas: violates foreign key constraint",
        ),
      );
    });
  });
});
