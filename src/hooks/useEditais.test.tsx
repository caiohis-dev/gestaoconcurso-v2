import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  resetSupabaseMock,
  erroPostgrest,
  CODIGOS_POSTGREST,
  type QueryBuilderMock,
} from "@/test/supabase-mock";
import { createTestQueryClient, renderHookWithProviders } from "@/test/utils";

// O client é mockado inteiro: nenhum teste toca banco nem Edge Function. A fábrica
// é async porque `vi.mock` é içado — referência direta daria ReferenceError.
vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

// `vi.hoisted` cria o spy ANTES do içamento do vi.mock, para que a fábrica possa
// fechar sobre ele. Este projeto usa o toast do shadcn (@/hooks/use-toast) na
// esmagadora maioria dos hooks — o `sonner` só aparece em três arquivos.
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import { useEditais } from "@/hooks/useEditais";

const EDITAL = {
  id: "edital-1",
  nome: "Edital 001/2026 SMA",
  n_candidatos: 1500,
  cabecalho_linha1: "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA",
  cabecalho_linha2: "Coordenação de Concursos e Processos Seletivos",
  created_at: "2026-07-24T00:00:00Z",
  updated_at: "2026-07-24T00:00:00Z",
  created_by: "user-teste-1",
};

/** O builder devolvido pela n-ésima chamada de `supabase.from(...)`. */
const builderDaChamada = (i: number) =>
  supabaseMock.from.mock.results[i].value as QueryBuilderMock;

describe("useEditais", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
  });

  describe("listagem", () => {
    it("começa em loading e resolve com os editais", async () => {
      setTableResult("editais", { data: [EDITAL], error: null });

      const { result } = renderHookWithProviders(() => useEditais());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.editais).toEqual([]); // nunca undefined: o hook faz `?? []`

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.editais).toEqual([EDITAL]);
    });

    it("ordena por nome ascendente", async () => {
      setTableResult("editais", { data: [], error: null });
      const { result } = renderHookWithProviders(() => useEditais());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.from).toHaveBeenCalledWith("editais");
      expect(builderDaChamada(0).order).toHaveBeenCalledWith("nome", { ascending: true });
    });

    it("expõe o erro da query e mantém a lista vazia", async () => {
      setTableResult("editais", { data: null, error: erroPostgrest("42501", "permission denied") });

      const { result } = renderHookWithProviders(() => useEditais());

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(result.current.editais).toEqual([]);
    });
  });

  describe("create", () => {
    it("carimba created_by com o usuário da sessão", async () => {
      setTableResult("editais", { data: EDITAL, error: null });
      const { result } = renderHookWithProviders(() => useEditais());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.create({ nome: "Edital 002/2026" });

      await waitFor(() => expect(supabaseMock.auth.getUser).toHaveBeenCalled());
      await waitFor(() =>
        expect(builderDaChamada(1).insert).toHaveBeenCalledWith({
          nome: "Edital 002/2026",
          created_by: "user-teste-1",
        }),
      );
    });

    it("avisa em caso de sucesso", async () => {
      setTableResult("editais", { data: EDITAL, error: null });
      const { result } = renderHookWithProviders(() => useEditais());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.create({ nome: "Edital 002/2026" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Edital criado" }),
        ),
      );
    });

    it("traduz o 23505 para a mensagem de nome duplicado", async () => {
      // Regra de negócio real: o índice único é funcional, sobre lower(btrim(nome)),
      // então "Edital 001" e "  edital 001 " colidem. O usuário precisa entender
      // isso pela mensagem, não pelo erro cru do Postgres.
      setTableResult("editais", {
        data: null,
        error: erroPostgrest(CODIGOS_POSTGREST.DUPLICADO),
      });
      const { result } = renderHookWithProviders(() => useEditais());

      result.current.create({ nome: "Edital 001/2026 SMA" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          title: "Erro ao criar edital",
          description: "Já existe um edital com esse nome.",
          variant: "destructive",
        }),
      );
    });

    it("reconhece o duplicado pela mensagem mesmo sem código", async () => {
      // O hook casa por code OU por regex na mensagem — defesa contra o erro
      // chegar sem `code` (acontece via alguns caminhos do PostgREST).
      setTableResult("editais", {
        data: null,
        error: { code: "", message: "duplicate key value violates unique constraint", details: "", hint: "" },
      });
      const { result } = renderHookWithProviders(() => useEditais());

      result.current.create({ nome: "x" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "Já existe um edital com esse nome." }),
        ),
      );
    });

    it("repassa a mensagem original para erro desconhecido", async () => {
      setTableResult("editais", {
        data: null,
        error: erroPostgrest("42501", "permission denied for table editais"),
      });
      const { result } = renderHookWithProviders(() => useEditais());

      result.current.create({ nome: "x" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "permission denied for table editais" }),
        ),
      );
    });
  });

  describe("update", () => {
    it("invalida TAMBÉM a query de provas", async () => {
      // O nome da prova na UI vem de join com editais. Invalidar só ["editais"]
      // deixaria a tela de provas exibindo o nome antigo até o próximo refetch.
      const queryClient = createTestQueryClient();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      setTableResult("editais", { data: EDITAL, error: null });

      const { result } = renderHookWithProviders(() => useEditais(), { queryClient });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      invalidate.mockClear();

      result.current.update({ id: "edital-1", data: { nome: "Edital 001/2026 SMA - retificado" } });

      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["editais"] }),
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["provas"] });
    });

    it("filtra pelo id do edital", async () => {
      setTableResult("editais", { data: EDITAL, error: null });
      const { result } = renderHookWithProviders(() => useEditais());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.update({ id: "edital-1", data: { nome: "novo" } });

      await waitFor(() =>
        expect(builderDaChamada(1).eq).toHaveBeenCalledWith("id", "edital-1"),
      );
      expect(builderDaChamada(1).update).toHaveBeenCalledWith({ nome: "novo" });
    });

    it("traduz o 23505 na atualização também", async () => {
      setTableResult("editais", {
        data: null,
        error: erroPostgrest(CODIGOS_POSTGREST.DUPLICADO),
      });
      const { result } = renderHookWithProviders(() => useEditais());

      result.current.update({ id: "edital-1", data: { nome: "colide" } });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          title: "Erro ao atualizar edital",
          description: "Já existe um edital com esse nome.",
          variant: "destructive",
        }),
      );
    });
  });

  describe("delete", () => {
    it("avisa em caso de sucesso", async () => {
      setTableResult("editais", { data: null, error: null });
      const { result } = renderHookWithProviders(() => useEditais());

      result.current.delete("edital-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Edital excluído" }),
        ),
      );
    });

    it("traduz o 23503 em instrução acionável, não em erro cru", async () => {
      // É o ON DELETE RESTRICT chegando à UI. A mensagem precisa dizer O QUE FAZER
      // — remover ou realocar as provas —, porque o usuário não tem como saber que
      // "violates foreign key constraint" significa "existe prova vinculada".
      setTableResult("editais", {
        data: null,
        error: erroPostgrest(CODIGOS_POSTGREST.CHAVE_ESTRANGEIRA),
      });
      const { result } = renderHookWithProviders(() => useEditais());

      result.current.delete("edital-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          title: "Erro ao excluir edital",
          description:
            "Há provas vinculadas a este edital. Remova ou realoque as provas antes de excluí-lo.",
          variant: "destructive",
        }),
      );
    });

    it("repassa a mensagem original para erro desconhecido", async () => {
      setTableResult("editais", {
        data: null,
        error: erroPostgrest("42501", "permission denied"),
      });
      const { result } = renderHookWithProviders(() => useEditais());

      result.current.delete("edital-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "permission denied" }),
        ),
      );
    });
  });
});
