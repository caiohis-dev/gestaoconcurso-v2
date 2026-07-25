import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  buildersDaTabela,
  erroPostgrest,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { authMock } = vi.hoisted(() => ({
  authMock: { user: { id: "u1" } as { id: string } | null, isCoordenador: true },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

import { useCoordenadorUnidades } from "@/hooks/useCoordenadorUnidades";

const RPC = "get_coordenador_prova_unidade_ids";

const unidade = (id: string, provaId: string) => ({
  id,
  prova_id: provaId,
  unidade_id: `u-${id}`,
  unidades_prova: { id: `u-${id}`, unid_nome: `Unidade ${id}`, unid_sigla: id.toUpperCase() },
});

/**
 * Este hook decide O QUE UM COORDENADOR ENXERGA — as provas e unidades a que foi
 * vinculado. Errar aqui não é bug cosmético: ou some trabalho legítimo da tela, ou
 * aparece unidade que não é dele.
 *
 * Ele resolve em DOIS passos: uma RPC devolve os ids permitidos, e só então a tabela
 * `prova_unidades` é lida com `.in(...)`. Boa parte dos testes existe para garantir que
 * o segundo passo não acontece quando o primeiro não autorizou nada.
 */
describe("useCoordenadorUnidades", () => {
  beforeEach(() => {
    resetSupabaseMock();
    authMock.user = { id: "u1" };
    authMock.isCoordenador = true;
    setRpcResult(RPC, { data: [], error: null });
    setTableResult("prova_unidades", { data: [], error: null });
  });

  describe("quando nem consulta", () => {
    it("não consulta sem usuário logado", async () => {
      authMock.user = null;

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.rpc).not.toHaveBeenCalled();
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it("não consulta para quem não é coordenador", async () => {
      // Admin não passa por aqui: ele vê tudo por outro caminho. Disparar a RPC para
      // ele seria trabalho jogado fora a cada carregamento de página.
      authMock.isCoordenador = false;

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });
  });

  describe("resolução em dois passos", () => {
    it("pergunta os ids ao banco passando o usuário e só então busca as unidades", async () => {
      setRpcResult(RPC, { data: ["pu-1", "pu-2"], error: null });
      setTableResult("prova_unidades", {
        data: [unidade("pu-1", "prova-1"), unidade("pu-2", "prova-1")],
        error: null,
      });

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());
      await waitFor(() => expect(result.current.provaUnidades).toHaveLength(2));

      expect(supabaseMock.rpc).toHaveBeenCalledWith(RPC, { p_user_id: "u1" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder = buildersDaTabela("prova_unidades")[0] as any;
      expect(builder.in.mock.calls[0]).toEqual(["id", ["pu-1", "pu-2"]]);
    });

    it("NÃO lê prova_unidades quando a RPC não devolve id nenhum", async () => {
      // Sem esta parada, `.in("id", [])` seria uma consulta inútil — e, pior, um
      // `.in` vazio é o tipo de coisa que alguém "simplifica" para nenhum filtro.
      setRpcResult(RPC, { data: [], error: null });

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.rpc).toHaveBeenCalled();
      expect(buildersDaTabela("prova_unidades")).toHaveLength(0);
      expect(result.current.provaUnidades).toEqual([]);
    });

    it("trata null da RPC como 'nenhuma unidade', sem quebrar", async () => {
      setRpcResult(RPC, { data: null, error: null });

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(buildersDaTabela("prova_unidades")).toHaveLength(0);
      expect(result.current.provaUnidades).toEqual([]);
    });
  });

  describe("derivados", () => {
    it("deduplica as provas — várias unidades da mesma prova contam uma vez", async () => {
      setRpcResult(RPC, { data: ["pu-1", "pu-2", "pu-3"], error: null });
      setTableResult("prova_unidades", {
        data: [
          unidade("pu-1", "prova-1"),
          unidade("pu-2", "prova-1"),
          unidade("pu-3", "prova-2"),
        ],
        error: null,
      });

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());
      await waitFor(() => expect(result.current.provaUnidades).toHaveLength(3));

      expect(result.current.provaIds).toEqual(["prova-1", "prova-2"]);
      expect(result.current.provaUnidadeIds).toEqual(["pu-1", "pu-2", "pu-3"]);
    });

    it("devolve listas vazias — nunca undefined — antes de resolver", () => {
      // Quem consome espalha `.map()` em cima destes valores sem checar; undefined
      // aqui viraria erro de render.
      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());

      expect(result.current.provaUnidades).toEqual([]);
      expect(result.current.provaIds).toEqual([]);
      expect(result.current.provaUnidadeIds).toEqual([]);
    });

    it("⚠️ ATENÇÃO: lista vazia ENQUANTO CARREGA é indistinguível de 'não coordena nada'", async () => {
      // Não é defeito deste hook — é uma característica dele que MORDE quem consome.
      // `provaUnidades` é `query.data ?? []`, então durante o carregamento ele diz
      // exatamente o mesmo que diria um coordenador sem nenhuma unidade: lista vazia.
      //
      // Quem precisa distinguir os dois casos TEM de olhar `isLoading`. O
      // `OcorrenciasProva.tsx` não olha, e é daí que nasce o defeito registrado no
      // backlog (`useOcorrencias` com lista vazia não filtra nada, e a página abre
      // uma janela sem recorte a cada carregamento).
      setRpcResult(RPC, { data: ["pu-1"], error: null });
      setTableResult("prova_unidades", { data: [unidade("pu-1", "prova-1")], error: null });

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());

      // Primeiro render: já responde, e responde "vazio".
      expect(result.current.provaUnidadeIds).toEqual([]);
      expect(result.current.isLoading).toBe(true); // <- o único sinal que diferencia

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.provaUnidadeIds).toEqual(["pu-1"]);
    });
  });

  describe("erros", () => {
    it("propaga erro da RPC sem inventar unidade nenhuma", async () => {
      setRpcResult(RPC, { data: null, error: erroPostgrest("42883", "função não existe") });

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());
      await waitFor(() => expect(result.current.error).toBeTruthy());

      // Falha fechada: sem ids, nada de unidades — nunca o contrário.
      expect(result.current.provaUnidades).toEqual([]);
      expect(buildersDaTabela("prova_unidades")).toHaveLength(0);
    });

    it("propaga erro da leitura de prova_unidades", async () => {
      setRpcResult(RPC, { data: ["pu-1"], error: null });
      setTableResult("prova_unidades", {
        data: null,
        error: erroPostgrest("42501", "sem permissão"),
      });

      const { result } = renderHookWithProviders(() => useCoordenadorUnidades());
      await waitFor(() => expect(result.current.error).toBeTruthy());

      expect(result.current.provaUnidades).toEqual([]);
    });
  });
});
