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

      result.current.create({ unid_nome: "Anexo", unid_sigla: "AN" });

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
          created_by: "user-teste-1",
        }),
      );
    });

    it("🔴 NÃO manda `unid_andares` — a coluna não existe mais (2026-08-03)", async () => {
      // ⚠️ Não é zelo: a coluna era `NOT NULL` **sem default**. Enquanto existiu, todo
      // INSERT era obrigado a mandar um número — e era esse número que virava teto para
      // criar salas. Se alguém reintroduzir o campo no formulário, é aqui que aparece.
      // O `objectContaining` do caso acima NÃO pegaria isso: ele ignora chave a mais.
      const { result } = await carregarEDepois([
        { data: { ...UNIDADE, id: "u-2" }, error: null },
        { data: [UNIDADE], error: null },
      ]);

      result.current.create({ unid_nome: "Anexo", unid_sigla: "AN" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unidade criada" }),
        ),
      );
      const builder = builderQueChamou("unidades_prova", "insert");
      const payload = (builder.insert as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty("unid_andares");
      expect(Object.keys(payload).sort()).toEqual(["created_by", "unid_nome", "unid_sigla"]);
    });

    it("erro do banco chega ao usuário com a mensagem, não genérico", async () => {
      const { result } = await carregarEDepois([
        { data: null, error: erroPostgrest(CODIGOS_POSTGREST.DUPLICADO, "sigla repetida") },
        { data: [UNIDADE], error: null },
      ]);

      result.current.create({ unid_nome: "Anexo", unid_sigla: "EC" });

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
        { data: { ...UNIDADE, unid_nome: "Anexo Norte" }, error: null },
        { data: [UNIDADE], error: null },
      ]);

      result.current.update({ id: "u-1", data: { unid_nome: "Anexo Norte" } });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unidade atualizada" }),
        ),
      );
      // `builderQueChamou`, não `.at(-1)`: o refetch da invalidação viraria o último.
      const builder = builderQueChamou("unidades_prova", "update");
      expect(builder.update).toHaveBeenCalledWith({ unid_nome: "Anexo Norte" });
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

    it("traduz a recusa do banco quando a unidade está em uso", async () => {
      // ⚠️ Este teste dizia "a FK das salas/provas é quem barra" e afirmava a mensagem
      // crua. A premissa era FALSA até 2026-07-26: as FKs eram CASCADE, então nada
      // barrava — a unidade era apagada levando alocações e ocorrências junto. Passava
      // porque o mock devolvia o 23503 que o próprio teste mandou devolver.
      //
      // A migration 20260726240000 pôs RESTRICT, e agora o erro é real. A mensagem crua
      // deixou de servir: ela não diz que a regra é "só unidade sem nenhum uso".
      const { result } = await carregarEDepois([
        {
          data: null,
          error: erroPostgrest(
            CODIGOS_POSTGREST.CHAVE_ESTRANGEIRA,
            'update or delete on table "unidades_prova" violates foreign key constraint "prova_unidades_unidade_id_fkey" on table "prova_unidades"',
          ),
        },
        { data: [UNIDADE], error: null },
      ]);

      result.current.delete("u-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao excluir unidade",
            description: expect.stringContaining("vinculada a uma prova"),
            variant: "destructive",
          }),
        ),
      );
      const ultimo = toastMock.mock.calls.at(-1)?.[0];
      expect(ultimo.description).not.toContain("foreign key");
    });
  });
});
