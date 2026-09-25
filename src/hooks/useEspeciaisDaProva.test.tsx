import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  resetSupabaseMock,
  setRpcResult,
  setRpcResultSequence,
  supabaseMock,
  type QueryBuilderMock,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";
import { TAMANHO_FATIA } from "@/lib/buscar-em-fatias";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useEspeciaisDaProva } from "@/hooks/useAlocacaoCandidatos";

const especiais = (n: number, prefixo: string) =>
  Array.from({ length: n }, (_, i) => ({
    candidato_id: `${prefixo}${i}`,
    n_inscricao: `${prefixo}${i}`,
    nome: `NOME ${prefixo}${i}`,
    cargo: "DOCENTE II",
    sala_especial: null,
    portador_deficiencia: true,
    sala_id: null,
    origem: null,
  }));

/**
 * 🔵 2026-09-24. A RPC `especiais_da_prova` devolve TODOS os especiais do edital, sem
 * LIMIT, e o PostgREST corta em 1000 linhas SEM ERRO. A lista de especiais da alocação
 * perderia gente calada — então ela passou a vir em fatias (`buscarEmFatias`).
 */
describe("useEspeciaisDaProva — em fatias", () => {
  beforeEach(() => resetSupabaseMock());

  it("🔴 com a 1ª fatia CHEIA, busca a 2ª e entrega todos", async () => {
    setRpcResultSequence("especiais_da_prova", [
      { data: especiais(TAMANHO_FATIA, "a"), error: null },
      { data: especiais(7, "b"), error: null },
    ]);
    const { result } = renderHookWithProviders(() => useEspeciaisDaProva("prova-1"));

    await waitFor(() => expect(result.current.especiais).toHaveLength(TAMANHO_FATIA + 7));
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(2);
    expect(result.current.especiais.at(-1)?.candidatoId).toBe("b6");
  });

  it("pede as janelas certas e ordena por nome com desempate ÚNICO", async () => {
    // Sem o desempate por `candidato_id`, duas pessoas de mesmo nome podiam trocar de
    // lugar entre as fatias — uma repetida, outra sumida.
    setRpcResultSequence("especiais_da_prova", [
      { data: especiais(TAMANHO_FATIA, "a"), error: null },
      { data: [], error: null },
    ]);
    const { result } = renderHookWithProviders(() => useEspeciaisDaProva("prova-1"));
    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const builders = supabaseMock.rpc.mock.results.map((r) => r.value as QueryBuilderMock);
    expect(builders.map((b) => b.range.mock.calls[0])).toEqual([
      [0, TAMANHO_FATIA - 1],
      [TAMANHO_FATIA, 2 * TAMANHO_FATIA - 1],
    ]);
    expect(builders[0].order.mock.calls).toEqual([
      ["nome", { ascending: true }],
      ["candidato_id", { ascending: true }],
    ]);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("especiais_da_prova", { p_prova_id: "prova-1" });
  });

  it("🟢 CONTROLE: conjunto pequeno faz UMA requisição só", async () => {
    setRpcResult("especiais_da_prova", { data: especiais(3, "a"), error: null });
    const { result } = renderHookWithProviders(() => useEspeciaisDaProva("prova-1"));

    await waitFor(() => expect(result.current.especiais).toHaveLength(3));
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
  });
});
