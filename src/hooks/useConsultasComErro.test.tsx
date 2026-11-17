/**
 * O portão da exportação depende disto para distinguir FALHA de VAZIO — os hooks do
 * módulo leem falha como `[]`. O contrato:
 * - consulta ativa em erro aparece; consulta que voltou vazia, NÃO (o controle positivo:
 *   vazio é um estado legítimo, e confundi-lo com erro bloquearia todo edital novo);
 * - consulta em erro SEM observador (de outra tela, parada no cache) não aparece;
 * - quando a consulta se recupera, sai da lista.
 */
import { describe, expect, it } from "vitest";
import { useQuery, QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { renderHookWithProviders } from "@/test/utils";
import { useConsultasComErro } from "@/hooks/useConsultasComErro";

const cliente = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

describe("useConsultasComErro", () => {
  it("🔴 lista a consulta que FALHOU e não a que voltou VAZIA", async () => {
    const { result } = renderHookWithProviders(
      () => {
        const vazia = useQuery({ queryKey: ["vazia", "e1"], queryFn: async () => [] });
        const falha = useQuery({
          queryKey: ["edital_itens", "e1"],
          queryFn: async (): Promise<unknown[]> => {
            throw new Error("rede");
          },
        });
        return { erros: useConsultasComErro(), prontas: !vazia.isLoading && !falha.isLoading };
      },
      { queryClient: cliente() },
    );
    await waitFor(() => expect(result.current.prontas).toBe(true));
    expect(result.current.erros).toEqual(["edital_itens"]);
  });

  it("consulta em erro SEM observador (outra tela) não bloqueia", async () => {
    const qc = cliente();
    await qc
      .fetchQuery({
        queryKey: ["de_outra_tela"],
        queryFn: async () => {
          throw new Error("x");
        },
      })
      .catch(() => undefined);
    expect(qc.getQueryCache().find({ queryKey: ["de_outra_tela"] })?.state.status).toBe("error"); // controle
    const { result } = renderHookWithProviders(() => useConsultasComErro(), { queryClient: qc });
    expect(result.current).toEqual([]);
  });

  it("quando a consulta se recupera, sai da lista", async () => {
    let falhar = true;
    const { result } = renderHookWithProviders(
      () => {
        const q = useQuery({
          queryKey: ["cargos"],
          queryFn: async () => {
            if (falhar) throw new Error("rede");
            return [1];
          },
        });
        return { erros: useConsultasComErro(), refetch: q.refetch };
      },
      { queryClient: cliente() },
    );
    await waitFor(() => expect(result.current.erros).toEqual(["cargos"]));
    falhar = false;
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.erros).toEqual([]));
  });
});
