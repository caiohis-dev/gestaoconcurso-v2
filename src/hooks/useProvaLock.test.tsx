import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { supabaseMock, setRpcResult, resetSupabaseMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useProvaLock } from "@/hooks/useProvaLock";

const PARAMS = { provaId: "prova-1", userId: "u1", userName: "Maria" };

/** Chamadas de uma RPC específica, para separar heartbeat de aquisição. */
const chamadasDe = (nome: string) =>
  supabaseMock.rpc.mock.calls.filter((c) => c[0] === nome);

/**
 * Lock otimista por prova, para não deixar duas pessoas editando a mesma prova.
 * É o único hook do projeto com lógica dependente de tempo — daí os fake timers.
 *
 * Contexto do banco: o timeout real são 10 minutos, definidos dentro da própria
 * RPC `acquire_prova_lock` (migration 20260122123358). O heartbeat de 30s existe
 * para manter o lock vivo enquanto a aba está aberta.
 */
describe("useProvaLock", () => {
  beforeEach(() => {
    resetSupabaseMock();
    // shouldAdvanceTime deixa o tempo real correr também, para que as promises do
    // React Query/RTL resolvam — sem isso o waitFor trava contra o timer congelado.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setRpcResult("acquire_prova_lock", { data: [{ success: true }], error: null });
    setRpcResult("update_prova_lock_activity", { data: null, error: null });
    setRpcResult("release_prova_lock", { data: null, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("aquisição", () => {
    it("pede o lock no mount com prova, usuário e nome", async () => {
      const { result } = renderHook(() => useProvaLock(PARAMS));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.rpc).toHaveBeenCalledWith("acquire_prova_lock", {
        p_prova_id: "prova-1",
        p_user_id: "u1",
        p_user_name: "Maria",
      });
      expect(result.current.hasAccess).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });

    it("marca como bloqueada e informa quem está editando", async () => {
      const desde = "2026-07-25T10:00:00.000Z";
      setRpcResult("acquire_prova_lock", {
        data: [{ success: false, locked_by_name: "João", locked_since: desde }],
        error: null,
      });

      const { result } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasAccess).toBe(false);
      expect(result.current.isLocked).toBe(true);
      // O nome é o que a UI mostra para a pessoa entender por que não pode editar.
      expect(result.current.lockedByName).toBe("João");
      expect(result.current.lockedSince).toEqual(new Date(desde));
    });

    it("usa 'Outro usuário' quando o nome não vem", async () => {
      setRpcResult("acquire_prova_lock", { data: [{ success: false }], error: null });

      const { result } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.lockedByName).toBe("Outro usuário");
      expect(result.current.lockedSince).toBeNull();
    });

    it("erro da RPC não vira 'bloqueado' — são estados diferentes", async () => {
      // Distinção que importa na UI: `isLocked` significa "outra pessoa está
      // editando"; erro significa "não sabemos". Confundir os dois faria a tela
      // acusar um colega inexistente.
      const consoleErro = vi.spyOn(console, "error").mockImplementation(() => {});
      setRpcResult("acquire_prova_lock", {
        data: null,
        error: { code: "42883", message: "function does not exist", details: "", hint: "" },
      });

      const { result } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBe("function does not exist");
      expect(result.current.hasAccess).toBe(false);
      expect(result.current.isLocked).toBe(false);
      consoleErro.mockRestore();
    });

    it.each([
      ["sem provaId", { ...PARAMS, provaId: undefined }],
      ["sem userId", { ...PARAMS, userId: undefined }],
      ["sem userName", { ...PARAMS, userName: undefined }],
      ["desabilitado", { ...PARAMS, enabled: false }],
    ])("não tenta adquirir %s", async (_rotulo, params) => {
      const { result } = renderHook(() => useProvaLock(params));
      await vi.advanceTimersByTimeAsync(50);

      expect(chamadasDe("acquire_prova_lock")).toHaveLength(0);
      expect(result.current.hasAccess).toBe(false);
    });

    it.each([
      ["sem provaId", { ...PARAMS, provaId: undefined }],
      ["desabilitado", { ...PARAMS, enabled: false }],
    ])("⚠️ DEFEITO: isLoading fica preso em true %s", async (_rotulo, params) => {
      // Comportamento REAL, não desejado — documentado aqui em vez de mascarado.
      //
      // `acquireLock` tem uma guarda que faria `isLoading: false` quando falta
      // parâmetro, mas o useEffect do mount só a CHAMA se todos existirem:
      //     if (enabled && provaId && userId && userName) acquireLock();
      // Logo aquela guarda é código morto e o estado inicial (isLoading: true)
      // nunca é resolvido.
      //
      // Alcançável em produção: GerenciarColaboradoresProva.tsx:413 renderiza
      // tela de carregamento enquanto `unidadeLock.isLoading`, e o `enabled` de
      // lá depende de `userName`, preenchido por um .then() SEM .catch. Se
      // aquela consulta rejeitar, a página fica presa no spinner para sempre.
      //
      // Conserto (fora do escopo de testes): resolver o estado no próprio efeito
      // quando a guarda barrar, ou remover a guarda interna de acquireLock e
      // deixá-la ser chamada sempre.
      const { result } = renderHook(() => useProvaLock(params));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("heartbeat de 30s", () => {
    it("renova o lock a cada intervalo, enquanto a aba está aberta", async () => {
      const { result } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      expect(chamadasDe("update_prova_lock_activity")).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(chamadasDe("update_prova_lock_activity")).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(chamadasDe("update_prova_lock_activity")).toHaveLength(3);

      expect(supabaseMock.rpc).toHaveBeenCalledWith("update_prova_lock_activity", {
        p_prova_id: "prova-1",
        p_user_id: "u1",
      });
    });

    it("não dispara imediatamente ao adquirir", async () => {
      // Margem folgada de propósito: `shouldAdvanceTime: true` deixa o tempo real
      // correr junto com o falso, então uma asserção na fronteira exata (29.999ms)
      // fica à mercê de quanto tempo o waitFor levou. O que importa aqui é que o
      // heartbeat não seja imediato nem frequente demais.
      const { result } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      await vi.advanceTimersByTimeAsync(5_000);
      expect(chamadasDe("update_prova_lock_activity")).toHaveLength(0);
    });

    it("NÃO renova quando a prova está bloqueada por outra pessoa", async () => {
      // Sem esta guarda, quem está apenas olhando a tela ficaria mandando
      // heartbeat de um lock que não é dele.
      setRpcResult("acquire_prova_lock", {
        data: [{ success: false, locked_by_name: "João" }],
        error: null,
      });

      const { result } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.isLocked).toBe(true));

      await vi.advanceTimersByTimeAsync(120_000);
      expect(chamadasDe("update_prova_lock_activity")).toHaveLength(0);
    });

    it("para de renovar depois do unmount", async () => {
      // Intervalo não limpo é vazamento: a aba fechada continuaria segurando o
      // lock por heartbeat, e os 10 minutos de timeout nunca expirariam.
      const { result, unmount } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      await vi.advanceTimersByTimeAsync(30_000);
      const antes = chamadasDe("update_prova_lock_activity").length;

      unmount();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(chamadasDe("update_prova_lock_activity")).toHaveLength(antes);
    });
  });

  describe("liberação", () => {
    it("devolve o lock ao desmontar", async () => {
      const { result, unmount } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      unmount();

      await waitFor(() =>
        expect(supabaseMock.rpc).toHaveBeenCalledWith("release_prova_lock", {
          p_prova_id: "prova-1",
          p_user_id: "u1",
        }),
      );
    });

    it("não tenta liberar um lock que nunca teve", async () => {
      setRpcResult("acquire_prova_lock", { data: [{ success: false }], error: null });

      const { result, unmount } = renderHook(() => useProvaLock(PARAMS));
      await waitFor(() => expect(result.current.isLocked).toBe(true));

      unmount();
      await vi.advanceTimersByTimeAsync(100);

      expect(chamadasDe("release_prova_lock")).toHaveLength(0);
    });
  });
});
