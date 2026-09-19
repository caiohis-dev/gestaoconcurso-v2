/**
 * O edital modelo e a absorção dele.
 *
 * 🔴 **O que este arquivo guarda é a MENSAGEM.** As cinco guardas da RPC (EM001–EM005) e a
 * colisão de âncora estão provadas contra o banco em `docs/bateria-edital-modelo.sql` — aqui
 * se verifica que cada recusa chega ao usuário dizendo **o que fazer**, em vez de vazar o
 * texto cru do Postgres. É a dívida do §2 do CLAUDE.md, que este repo já pagou duas vezes.
 *
 * ⚠️ O código próprio chega em `message`, não em `code`: o PostgREST devolve `P0001` para
 * todo `RAISE EXCEPTION` de PL/pgSQL, então o SQLSTATE vem embutido no texto. Um teste que
 * montasse o erro com `code: "EM002"` passaria e não descreveria nada do que acontece.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  erroPostgrest,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import { useEditalModelo, useAplicarModeloPadrao } from "@/hooks/useModeloPadrao";

const MODELO = {
  id: "00000000-0000-4000-8000-000000000001",
  nome: "Modelo padrão de edital",
  modelo_versao: "0.0",
};

/** Um erro de `RAISE EXCEPTION` como o PostgREST o entrega: código no TEXTO, `P0001` no `code`. */
const erroDaGuarda = (texto: string) => erroPostgrest("P0001", texto);

beforeEach(() => {
  resetSupabaseMock();
  toastMock.mockClear();
});

describe("useEditalModelo", () => {
  it("acha o modelo do banco", async () => {
    setTableResult("editais", { data: MODELO, error: null });
    const { result } = renderHookWithProviders(() => useEditalModelo());
    await waitFor(() => expect(result.current.modelo).not.toBeNull());
    expect(result.current.modelo?.id).toBe(MODELO.id);
  });

  it("🔴 `null` quando não há modelo — é estado possível, não erro de programação", async () => {
    // Banco sem as migrations aplicadas. Quem chama tem de dizer isso na tela, em vez de
    // oferecer um botão que não funciona — ver `FaixaDoModeloPadrao`.
    setTableResult("editais", { data: null, error: null });
    const { result } = renderHookWithProviders(() => useEditalModelo());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.modelo).toBeNull();
  });
});

describe("useAplicarModeloPadrao — o caminho feliz", () => {
  it("chama a RPC com o destino e anuncia quantos artigos entraram", async () => {
    setRpcResult("aplicar_edital_modelo", { data: 334, error: null });
    const { result } = renderHookWithProviders(() => useAplicarModeloPadrao("edital-1"));

    await result.current.aplicar(undefined);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Edital padrão aplicado" }),
      ),
    );
    // O número é a única confirmação de que o clique funcionou.
    expect(toastMock.mock.calls[0][0].description).toContain("334");
  });

  it("aplicação por CAPÍTULO é o caminho de uma rodada nova alcançar edital que já absorveu", async () => {
    setRpcResult("aplicar_edital_modelo", { data: 27, error: null });
    const { result } = renderHookWithProviders(() => useAplicarModeloPadrao("edital-1"));

    const quantos = await result.current.aplicar(["vagas_pcd"]);
    expect(quantos).toBe(27);
  });
});

describe("useAplicarModeloPadrao — cada recusa diz o que fazer", () => {
  const casos: { sigla: string; texto: string; esperado: RegExp }[] = [
    {
      sigla: "EM001",
      texto: "EM001: Edital não encontrado.",
      esperado: /não encontrado|permissão/i,
    },
    {
      sigla: "EM002",
      texto: "EM002: Este edital já absorveu o modelo padrão em 2026-09-18.",
      esperado: /já absorveu.*aplique só aquele capítulo/is,
    },
    {
      sigla: "EM004",
      texto: "EM004: Este é o próprio edital modelo — ele não absorve a si mesmo.",
      esperado: /não absorve a si mesmo/i,
    },
    {
      sigla: "EM005",
      texto: "EM005: Não existe edital modelo neste banco.",
      esperado: /migrations/i,
    },
  ];

  for (const caso of casos) {
    it(`${caso.sigla} chega traduzido`, async () => {
      setRpcResult("aplicar_edital_modelo", { data: null, error: erroDaGuarda(caso.texto) });
      const { result } = renderHookWithProviders(() => useAplicarModeloPadrao("edital-1"));

      await expect(result.current.aplicar(undefined)).rejects.toThrow(caso.esperado);
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ variant: "destructive" }),
        ),
      );
    });
  }

  it("🔴 EM003 passa a mensagem do banco INTEIRA, porque ela nomeia os capítulos ocupados", async () => {
    // Trocá-la por um texto genérico mandaria o autor procurar em 19 capítulos qual tem
    // texto. A recusa é útil justamente por nomear.
    setRpcResult("aplicar_edital_modelo", {
      data: null,
      error: erroDaGuarda(
        "EM003: Estes capítulos já têm texto redigido e não serão sobrescritos: isencao_taxa, vagas_pcd.",
      ),
    });
    const { result } = renderHookWithProviders(() => useAplicarModeloPadrao("edital-1"));

    await expect(result.current.aplicar(undefined)).rejects.toThrow(/isencao_taxa, vagas_pcd/);
  });

  it("🔴 a colisão de âncora diz que NADA foi copiado", async () => {
    // O índice `edital_itens_ancora_key` aborta a transação inteira. Sem essa frase, o autor
    // fica sem saber se ficou meio documento no edital dele — e meio documento é pior que
    // nenhum, porque parece ter funcionado.
    setRpcResult("aplicar_edital_modelo", {
      data: null,
      error: erroPostgrest(
        "23505",
        'duplicate key value violates unique constraint "edital_itens_ancora_key"',
      ),
    });
    const { result } = renderHookWithProviders(() => useAplicarModeloPadrao("edital-1"));

    await expect(result.current.aplicar(undefined)).rejects.toThrow(/Nada foi copiado/i);
  });

  it("⭐ CONTROLE: erro que não é guarda conhecida não some — vai adiante como veio", async () => {
    // O contrário seria engolir o desconhecido num "não foi possível aplicar" e perder a
    // única pista de diagnóstico.
    setRpcResult("aplicar_edital_modelo", {
      data: null,
      error: erroPostgrest("42501", "permission denied for table edital_itens"),
    });
    const { result } = renderHookWithProviders(() => useAplicarModeloPadrao("edital-1"));

    await expect(result.current.aplicar(undefined)).rejects.toThrow(/permission denied/i);
  });
});
