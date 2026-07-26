import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderHookWithProviders } from "@/test/utils";
import {
  resetSupabaseMock,
  setTableResult,
  setTableResultSequence,
  buildersDaTabela,
  builderQueChamou,
  erroPostgrest,
  CODIGOS_POSTGREST,
  supabaseMock,
} from "@/test/supabase-mock";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useUnidadesProva } from "@/hooks/useUnidadesProva";

/**
 * CRUD das unidades de prova (os locais onde a prova acontece). É a base sobre a qual se
 * penduram salas, alocação e ocorrências — daí valer teste apesar de simples.
 */
describe("useUnidadesProva", () => {
  const UNIDADE = {
    id: "u-1",
    unid_nome: "Escola Central",
    unid_sigla: "EC",
    unid_andares: 3,
    created_at: null,
    updated_at: null,
    created_by: null,
  };

  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
  });

  /**
   * Instala a sequência SÓ depois da carga inicial — armadilha 1 do `testes.md`: a query
   * de listagem também chama `from("unidades_prova")` e comeria a primeira entrada.
   */
  async function carregarEDepois(sequencia: Parameters<typeof setTableResultSequence>[1]) {
    setTableResult("unidades_prova", { data: [UNIDADE], error: null });
    const hook = renderHookWithProviders(() => useUnidadesProva());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    setTableResultSequence("unidades_prova", sequencia);
    return hook;
  }

  describe("listagem", () => {
    it("começa vazia e entrega as unidades ordenadas por nome", async () => {
      setTableResult("unidades_prova", { data: [UNIDADE], error: null });
      const { result } = renderHookWithProviders(() => useUnidadesProva());

      expect(result.current.unidades).toEqual([]);
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.unidades).toEqual([UNIDADE]);
      expect(buildersDaTabela("unidades_prova")[0].order).toHaveBeenCalledWith("unid_nome");
    });

    it("erro na listagem não vira lista vazia silenciosa", async () => {
      setTableResult("unidades_prova", {
        data: null,
        error: erroPostgrest("42501", "permission denied"),
      });
      const { result } = renderHookWithProviders(() => useUnidadesProva());

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(result.current.unidades).toEqual([]);
    });
  });

  describe("criar", () => {
    it("carimba quem criou, a partir da sessão", async () => {
      // `created_by` é o que permite auditar quem cadastrou a unidade.
      const { result } = await carregarEDepois([
        { data: { ...UNIDADE, id: "u-2" }, error: null },
        { data: [UNIDADE], error: null },
      ]);

      result.current.create({ unid_nome: "Anexo", unid_sigla: "AN", unid_andares: 2 });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unidade criada" }),
        ),
      );
      expect(supabaseMock.auth.getUser).toHaveBeenCalled();
      const builder = builderQueChamou("unidades_prova", "insert");
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          unid_nome: "Anexo",
          unid_sigla: "AN",
          unid_andares: 2,
          created_by: "user-teste-1",
        }),
      );
    });

    it("erro do banco chega ao usuário com a mensagem, não genérico", async () => {
      const { result } = await carregarEDepois([
        { data: null, error: erroPostgrest(CODIGOS_POSTGREST.DUPLICADO, "sigla repetida") },
        { data: [UNIDADE], error: null },
      ]);

      result.current.create({ unid_nome: "Anexo", unid_sigla: "EC", unid_andares: 1 });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao criar unidade",
            description: "sigla repetida",
            variant: "destructive",
          }),
        ),
      );
    });
  });

  describe("atualizar e excluir", () => {
    it("atualiza pelo id, mandando só o que mudou", async () => {
      const { result } = await carregarEDepois([
        { data: { ...UNIDADE, unid_andares: 5 }, error: null },
        { data: [UNIDADE], error: null },
      ]);

      result.current.update({ id: "u-1", data: { unid_andares: 5 } });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unidade atualizada" }),
        ),
      );
      // `builderQueChamou`, não `.at(-1)`: o refetch da invalidação viraria o último.
      const builder = builderQueChamou("unidades_prova", "update");
      expect(builder.update).toHaveBeenCalledWith({ unid_andares: 5 });
      expect(builder.eq).toHaveBeenCalledWith("id", "u-1");
    });

    it("exclui pelo id", async () => {
      const { result } = await carregarEDepois([
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.delete("u-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unidade excluída" }),
        ),
      );
      expect(builderQueChamou("unidades_prova", "delete").eq).toHaveBeenCalledWith("id", "u-1");
    });

    it("excluir unidade em uso mostra o erro do banco em vez de fingir sucesso", async () => {
      // A FK das salas/provas é quem barra — e a mensagem precisa aparecer.
      const { result } = await carregarEDepois([
        {
          data: null,
          error: erroPostgrest(CODIGOS_POSTGREST.CHAVE_ESTRANGEIRA, "unidade tem salas"),
        },
        { data: [UNIDADE], error: null },
      ]);

      result.current.delete("u-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao excluir unidade",
            description: "unidade tem salas",
            variant: "destructive",
          }),
        ),
      );
    });
  });
});
