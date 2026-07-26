import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderHookWithProviders } from "@/test/utils";
import {
  resetSupabaseMock,
  setTableResult,
  buildersDaTabela,
  supabaseMock,
} from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useUnidadeCapacidade } from "@/hooks/useUnidadeCapacidade";

/**
 * Soma a capacidade das salas distribuídas, por unidade, numa prova. O número aparece na
 * tela de gestão da prova ("quantos candidatos cabem nesta unidade") e alimenta o total.
 *
 * Diferente dos outros hooks do repo, ele devolve o resultado do `useQuery` **cru** — sem
 * o `{ dados, isLoading }` de sempre. É por isso que o consumidor escreve
 * `const { data: capacidadePorUnidade = {} } = ...`: o default é dele, não do hook.
 */
describe("useUnidadeCapacidade", () => {
  const PROVA = "prova-1";
  const UNID_A = "unid-a";
  const UNID_B = "unid-b";

  beforeEach(() => resetSupabaseMock());

  it("soma a capacidade das salas de cada unidade", async () => {
    setTableResult("salas_prova_distribuidas", {
      data: [
        { sala_fk_unidade: UNID_A, sala_capacidade: 30 },
        { sala_fk_unidade: UNID_A, sala_capacidade: 25 },
        { sala_fk_unidade: UNID_B, sala_capacidade: 40 },
      ],
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      useUnidadeCapacidade(PROVA, [UNID_A, UNID_B]),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ [UNID_A]: 55, [UNID_B]: 40 });
  });

  it("unidade sem sala distribuída simplesmente não aparece no mapa", async () => {
    // Por isso o consumidor lê `capacidadePorUnidade[id] || 0` — a chave pode faltar.
    setTableResult("salas_prova_distribuidas", {
      data: [{ sala_fk_unidade: UNID_A, sala_capacidade: 30 }],
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      useUnidadeCapacidade(PROVA, [UNID_A, UNID_B]),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ [UNID_A]: 30 });
    expect(result.current.data?.[UNID_B]).toBeUndefined();
  });

  it("recorta pela prova E pelas unidades pedidas", async () => {
    // Sem o recorte por prova, a soma juntaria salas de outra prova na mesma unidade.
    setTableResult("salas_prova_distribuidas", { data: [], error: null });
    const { result } = renderHookWithProviders(() =>
      useUnidadeCapacidade(PROVA, [UNID_A, UNID_B]),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const builder = buildersDaTabela("salas_prova_distribuidas")[0];
    expect(builder.eq).toHaveBeenCalledWith("prova_id", PROVA);
    expect(builder.in).toHaveBeenCalledWith("sala_fk_unidade", [UNID_A, UNID_B]);
  });

  describe("quando não há o que perguntar", () => {
    it("não consulta o banco sem prova", () => {
      renderHookWithProviders(() => useUnidadeCapacidade("", [UNID_A]));
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it("não consulta o banco com lista de unidades vazia", () => {
      // Aqui `[]` significa mesmo "nada a somar" — e o `enabled` respeita isso, ao
      // contrário do `useOcorrencias`, em que lista vazia virava "sem filtro".
      renderHookWithProviders(() => useUnidadeCapacidade(PROVA, []));
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it("⚠️ ATENÇÃO: desabilitado, `data` é undefined — o default é do consumidor", () => {
      // O hook devolve o useQuery cru. `GerenciarProva` escreve
      // `const { data: capacidadePorUnidade = {} } = ...`, e é só isso que impede um
      // `Object.values(undefined)` na soma do total. Quem for consumir este hook em
      // outra tela precisa repetir o default — ou o hook precisa passar a dá-lo.
      const { result } = renderHookWithProviders(() => useUnidadeCapacidade(PROVA, []));
      expect(result.current.data).toBeUndefined();
    });
  });
});
