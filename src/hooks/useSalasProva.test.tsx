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
  supabaseMock,
} from "@/test/supabase-mock";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useSalasProva } from "@/hooks/useSalasProva";

/**
 * Salas de uma unidade. O que faz este hook merecer teste de verdade não é o CRUD, é a
 * **numeração automática** do `createMultiple`, que é lógica de negócio escondida numa
 * mutation:
 *
 *   número = andar × 100 + sequência   (andar 1, 3ª sala → 103)
 *
 * A sequência continua de onde parou **naquele andar**, e é calculada no cliente a partir
 * das salas existentes — não há `SEQUENCE` no banco.
 */
describe("useSalasProva", () => {
  const UNIDADE = "u-1";

  function sala(numero: number, over: Record<string, unknown> = {}) {
    return {
      id: `s-${numero}`,
      sala_fk_unidade: UNIDADE,
      sala_numero: numero,
      sala_descricao: null,
      sala_arcondicionado: null,
      sala_capacidade: 30,
      sala_andar: Math.floor(numero / 100),
      created_at: null,
      updated_at: null,
      created_by: null,
      ...over,
    };
  }

  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
  });

  /**
   * A sequência só entra depois da carga inicial (armadilha 1 do `testes.md`). No
   * `createMultiple` ela tem TRÊS entradas, porque a mutation consulta as salas
   * existentes antes de inserir: [existentes, insert, refetch].
   */
  async function carregarEDepois(sequencia: Parameters<typeof setTableResultSequence>[1]) {
    setTableResult("sala_prova", { data: [], error: null });
    const hook = renderHookWithProviders(() => useSalasProva(UNIDADE));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    setTableResultSequence("sala_prova", sequencia);
    return hook;
  }

  /** Devolve as linhas que o `insert` recebeu. */
  function linhasInseridas() {
    const builder = builderQueChamou("sala_prova", "insert");
    return (builder.insert as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as Array<Record<string, unknown>>;
  }

  describe("listagem", () => {
    it("lista as salas da unidade, em ordem de número", async () => {
      setTableResult("sala_prova", { data: [sala(101)], error: null });
      const { result } = renderHookWithProviders(() => useSalasProva(UNIDADE));

      expect(result.current.salas).toEqual([]);
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const builder = buildersDaTabela("sala_prova")[0];
      expect(builder.eq).toHaveBeenCalledWith("sala_fk_unidade", UNIDADE);
      expect(builder.order).toHaveBeenCalledWith("sala_numero");
    });

    it("sem unidade, não consulta nada", () => {
      renderHookWithProviders(() => useSalasProva(""));
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });

  describe("numeração automática do createMultiple", () => {
    it("no andar vazio começa em 1 — andar 1 vira 101", async () => {
      const { result } = await carregarEDepois([
        { data: [], error: null },
        { data: [sala(101)], error: null },
        { data: [sala(101)], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 1,
        sala_capacidade: 30,
        sala_andar: 1,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas()).toHaveLength(1);
      expect(linhasInseridas()[0]).toMatchObject({
        sala_numero: 101,
        sala_andar: 1,
        sala_capacidade: 30,
        sala_fk_unidade: UNIDADE,
        created_by: "user-teste-1",
      });
    });

    it("continua a sequência DAQUELE andar, ignorando os outros", async () => {
      // O andar 1 já tem 101 e 102; o andar 2 tem 201. Criar 2 salas no andar 1 tem de
      // dar 103 e 104 — o 201 não pode empurrar a contagem.
      const { result } = await carregarEDepois([
        { data: [sala(101), sala(102), sala(201)], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 2,
        sala_capacidade: 25,
        sala_andar: 1,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas().map((l) => l.sala_numero)).toEqual([103, 104]);
    });

    it("usa o MAIOR número do andar, não a contagem — buraco não é reaproveitado", async () => {
      // Se a sala 102 foi excluída, a próxima é 104, não 102. Reaproveitar número
      // confundiria quem já imprimiu a lista de salas.
      const { result } = await carregarEDepois([
        { data: [sala(101), sala(103)], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 1,
        sala_capacidade: 30,
        sala_andar: 1,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas().map((l) => l.sala_numero)).toEqual([104]);
    });

    it("no térreo (andar 0) a numeração é 1, 2, 3…", async () => {
      const { result } = await carregarEDepois([
        { data: [sala(1, { sala_andar: 0 })], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 2,
        sala_capacidade: 30,
        sala_andar: 0,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas().map((l) => l.sala_numero)).toEqual([2, 3]);
    });

    it("⚠️ ATENÇÃO: o esquema comporta 99 salas por andar, e não avisa ao estourar", async () => {
      // `número = andar × 100 + sequência` implica sequência de 1 a 99. Com a sala 199 já
      // existente, a próxima do andar 1 vira 200 — que é o número do andar 2. Nada barra:
      // não é erro, é o limite do esquema de numeração se manifestando em silêncio.
      //
      // Não abre item de backlog: 99 salas num mesmo andar é caso extremo. Fica
      // registrado para quem for mexer na numeração não achar que pode ignorar o teto.
      const { result } = await carregarEDepois([
        { data: [sala(199)], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 1,
        sala_capacidade: 30,
        sala_andar: 1,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas().map((l) => l.sala_numero)).toEqual([200]);
    });

    it("avisa no singular ou no plural, conforme quantas criou", async () => {
      const { result } = await carregarEDepois([
        { data: [], error: null },
        { data: [sala(101), sala(102), sala(103)], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 3,
        sala_capacidade: 30,
        sala_andar: 1,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Salas criadas",
            description: "3 salas foram criadas com sucesso.",
          }),
        ),
      );
    });

    it("falha ao ler as salas existentes aborta antes de inserir", async () => {
      // Sem saber o que existe, inserir produziria número duplicado.
      const { result } = await carregarEDepois([
        { data: null, error: erroPostgrest("42501", "permission denied") },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 1,
        sala_capacidade: 30,
        sala_andar: 1,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao criar salas", variant: "destructive" }),
        ),
      );
      expect(() => builderQueChamou("sala_prova", "insert")).toThrow();
    });
  });

  describe("atualizar e excluir", () => {
    it("atualiza pelo id", async () => {
      const { result } = await carregarEDepois([
        { data: sala(101, { sala_capacidade: 40 }), error: null },
        { data: [], error: null },
      ]);

      result.current.update({ id: "s-101", data: { sala_capacidade: 40 } });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Sala atualizada" }),
        ),
      );
      const builder = builderQueChamou("sala_prova", "update");
      expect(builder.update).toHaveBeenCalledWith({ sala_capacidade: 40 });
      expect(builder.eq).toHaveBeenCalledWith("id", "s-101");
    });

    it("exclui pelo id", async () => {
      const { result } = await carregarEDepois([
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.delete("s-101");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Sala excluída" }),
        ),
      );
      expect(builderQueChamou("sala_prova", "delete").eq).toHaveBeenCalledWith("id", "s-101");
    });

    it("excluir sala já distribuída mostra o erro do banco", async () => {
      const { result } = await carregarEDepois([
        { data: null, error: erroPostgrest("23503", "sala distribuída em prova") },
        { data: [], error: null },
      ]);

      result.current.delete("s-101");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao excluir sala",
            description: "sala distribuída em prova",
            variant: "destructive",
          }),
        ),
      );
    });
  });
});
