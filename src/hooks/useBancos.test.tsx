import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderHookWithProviders } from "@/test/utils";
import {
  resetSupabaseMock,
  setTableResult,
  buildersDaTabela,
  erroPostgrest,
} from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useBancos, TIPO_CONTA_OPTIONS } from "@/hooks/useBancos";

/**
 * Catálogo de bancos, usado no cadastro de dados bancários do colaborador. É o hook mais
 * simples do repo: só leitura, sem mutation. O que interessa é a ordenação (o `Select` é
 * longo demais para procurar sem ordem) e o `?? []`, que é o que impede a tela de quebrar
 * antes de a lista chegar.
 */
describe("useBancos", () => {
  const ITAU = { codigo_compe: "341", nome: "Banco Itaú S.A.", apelido: "Itaú" };
  const BB = { codigo_compe: "001", nome: "Banco do Brasil S.A.", apelido: "Banco do Brasil" };

  beforeEach(() => resetSupabaseMock());

  it("devolve lista vazia enquanto carrega, não undefined", async () => {
    // O `?? []` é o que permite `bancos.map(...)` no primeiro render.
    setTableResult("bancos", { data: [BB, ITAU], error: null });
    const { result } = renderHookWithProviders(() => useBancos());

    expect(result.current.bancos).toEqual([]);
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bancos).toEqual([BB, ITAU]);
  });

  it("pede ao banco em ordem de apelido — é o nome que o usuário procura", async () => {
    setTableResult("bancos", { data: [], error: null });
    const { result } = renderHookWithProviders(() => useBancos());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const builder = buildersDaTabela("bancos")[0];
    expect(builder.select).toHaveBeenCalledWith("codigo_compe, nome, apelido");
    expect(builder.order).toHaveBeenCalledWith("apelido", { ascending: true });
  });

  it("expõe o erro em vez de fingir lista vazia", async () => {
    setTableResult("bancos", { data: null, error: erroPostgrest("42501", "permission denied") });
    const { result } = renderHookWithProviders(() => useBancos());

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.bancos).toEqual([]);
  });

  it("as opções de tipo de conta são as duas que o banco aceita", () => {
    // Constante exportada porque o `tipo_conta` tem CHECK no banco: divergir daqui
    // produziria erro de constraint na hora de salvar.
    expect(TIPO_CONTA_OPTIONS.map((o) => o.value)).toEqual(["corrente", "poupanca"]);
  });
});
