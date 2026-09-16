import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { supabaseMock, setRpcResult, resetSupabaseMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useProvaUnidadeLock } from "@/hooks/useProvaUnidadeLock";

const PARAMS = { provaUnidadeId: "prova-unidade-1" };

/** Chamadas de uma RPC específica, para separar heartbeat de aquisição. */
const chamadasDe = (nome: string) =>
  supabaseMock.rpc.mock.calls.filter((c) => c[0] === nome);

/**
 * Lock otimista por UNIDADE DE PROVA, para não deixar duas pessoas editando a mesma
 * unidade. É o único hook do projeto com lógica dependente de tempo — daí os fake timers.
 *
 * Contexto do banco: o timeout real são 10 minutos, definidos dentro da própria
 * RPC `acquire_prova_unidade_lock` (migration 20260916100732). O heartbeat de 30s existe
 * para manter o lock vivo enquanto a aba está aberta.
 *
 * ⚠️ Estes testes mockam o Supabase, então NENHUM deles poderia ter pego o defeito de
 * 2026-09-16 (id de unidade indo para uma coluna com FK para `provas`): o mock aceita
 * qualquer string. Quem pega isso é `docs/bateria-lock-edicao-unidade.sql`, contra o
 * banco de verdade, e o teste de ligação em `GerenciarColaboradoresProva.ui.test.tsx`.
 *
 * ⚠️ **O hook não manda mais `p_user_id` nem `p_user_name`** (migration 20260916102407):
 * dono e nome exibido saem de `auth.uid()` dentro da RPC. Os casos "sem userId" e "sem
 * userName" do `it.each` SUMIRAM porque os parâmetros sumiram — não foram consertados,
 * o contrato é que mudou (armadilha 8). Que os payloads NÃO carreguem identidade é
 * asserção explícita aqui: é o que impede alguém de "devolver" os parâmetros.
 */
describe("useProvaUnidadeLock", () => {
  beforeEach(() => {
    resetSupabaseMock();
    // shouldAdvanceTime deixa o tempo real correr também, para que as promises do
    // React Query/RTL resolvam — sem isso o waitFor trava contra o timer congelado.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setRpcResult("acquire_prova_unidade_lock", { data: [{ success: true }], error: null });
    setRpcResult("update_prova_unidade_lock_activity", { data: null, error: null });
    setRpcResult("release_prova_unidade_lock", { data: null, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("aquisição", () => {
    it("pede o lock no mount com unidade, usuário e nome", async () => {
      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.rpc).toHaveBeenCalledWith("acquire_prova_unidade_lock", {
        p_prova_unidade_id: "prova-unidade-1",
      });
      expect(result.current.hasAccess).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });

    it("marca como bloqueada e informa quem está editando", async () => {
      const desde = "2026-07-25T10:00:00.000Z";
      setRpcResult("acquire_prova_unidade_lock", {
        data: [{ success: false, locked_by_name: "João", locked_since: desde }],
        error: null,
      });

      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasAccess).toBe(false);
      expect(result.current.isLocked).toBe(true);
      // O nome é o que a UI mostra para a pessoa entender por que não pode editar.
      expect(result.current.lockedByName).toBe("João");
      expect(result.current.lockedSince).toEqual(new Date(desde));
    });

    it("usa 'Outro usuário' quando o nome não vem", async () => {
      setRpcResult("acquire_prova_unidade_lock", { data: [{ success: false }], error: null });

      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.lockedByName).toBe("Outro usuário");
      expect(result.current.lockedSince).toBeNull();
    });

    it("erro da RPC não vira 'bloqueado' — são estados diferentes", async () => {
      // Distinção que importa na UI: `isLocked` significa "outra pessoa está
      // editando"; erro significa "não sabemos". Confundir os dois faria a tela
      // acusar um colega inexistente.
      const consoleErro = vi.spyOn(console, "error").mockImplementation(() => {});
      setRpcResult("acquire_prova_unidade_lock", {
        data: null,
        error: { code: "42883", message: "function does not exist", details: "", hint: "" },
      });

      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBe("function does not exist");
      expect(result.current.hasAccess).toBe(false);
      expect(result.current.isLocked).toBe(false);
      consoleErro.mockRestore();
    });

    it("NÃO manda identidade nenhuma no payload — ela vem de auth.uid()", async () => {
      // A guarda contra "devolver" `p_user_id`/`p_user_name`. Enquanto vinham do
      // cliente, dava para liberar o lock alheio e tomar a unidade, ou assinar o
      // bloqueio com o nome de outra pessoa.
      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      for (const [, params] of supabaseMock.rpc.mock.calls) {
        expect(params).not.toHaveProperty("p_user_id");
        expect(params).not.toHaveProperty("p_user_name");
      }
    });

    it.each([
      ["sem provaUnidadeId", { ...PARAMS, provaUnidadeId: undefined }],
      ["desabilitado", { ...PARAMS, enabled: false }],
    ])("não tenta adquirir, mas resolve isLoading %s", async (_rotulo, params) => {
      // O `isLoading` faz parte do contrato: REGRESSÃO corrigida em 2026-07-25 —
      // o estado nascia `isLoading: true` e só era resolvido DENTRO de
      // `acquireLock`, que o efeito de mount não chama quando falta parâmetro.
      // Ficava preso em true para sempre.
      //
      // Não era teórico: GerenciarColaboradoresProva.tsx renderiza tela de
      // carregamento enquanto `unidadeLock.isLoading`, e o `enabled` de lá dependia
      // de um `userName` buscado de forma assíncrona. Enquanto ele não chegasse, a
      // página ficava presa no spinner — sem erro, sem timeout e sem saída.
      // 🔵 Essa consulta não existe mais (16/09), mas o contrato do `else` continua
      // valendo para `enabled: false` e para a rota sem parâmetro.
      const { result } = renderHook(() => useProvaUnidadeLock(params));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(chamadasDe("acquire_prova_unidade_lock")).toHaveLength(0);
      expect(result.current.hasAccess).toBe(false);
    });
  });

  describe("heartbeat de 30s", () => {
    it("renova o lock a cada intervalo, enquanto a aba está aberta", async () => {
      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      expect(chamadasDe("update_prova_unidade_lock_activity")).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(chamadasDe("update_prova_unidade_lock_activity")).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(chamadasDe("update_prova_unidade_lock_activity")).toHaveLength(3);

      expect(supabaseMock.rpc).toHaveBeenCalledWith("update_prova_unidade_lock_activity", {
        p_prova_unidade_id: "prova-unidade-1",
      });
    });

    it("não dispara imediatamente ao adquirir", async () => {
      // Margem folgada de propósito: `shouldAdvanceTime: true` deixa o tempo real
      // correr junto com o falso, então uma asserção na fronteira exata (29.999ms)
      // fica à mercê de quanto tempo o waitFor levou. O que importa aqui é que o
      // heartbeat não seja imediato nem frequente demais.
      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      await vi.advanceTimersByTimeAsync(5_000);
      expect(chamadasDe("update_prova_unidade_lock_activity")).toHaveLength(0);
    });

    it("NÃO renova quando a unidade está bloqueada por outra pessoa", async () => {
      // Sem esta guarda, quem está apenas olhando a tela ficaria mandando
      // heartbeat de um lock que não é dele.
      setRpcResult("acquire_prova_unidade_lock", {
        data: [{ success: false, locked_by_name: "João" }],
        error: null,
      });

      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.isLocked).toBe(true));

      await vi.advanceTimersByTimeAsync(120_000);
      expect(chamadasDe("update_prova_unidade_lock_activity")).toHaveLength(0);
    });

    it("para de renovar depois do unmount", async () => {
      // Intervalo não limpo é vazamento: a aba fechada continuaria segurando o
      // lock por heartbeat, e os 10 minutos de timeout nunca expirariam.
      const { result, unmount } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      await vi.advanceTimersByTimeAsync(30_000);
      const antes = chamadasDe("update_prova_unidade_lock_activity").length;

      unmount();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(chamadasDe("update_prova_unidade_lock_activity")).toHaveLength(antes);
    });
  });

  describe("liberação", () => {
    it("devolve o lock ao desmontar", async () => {
      const { result, unmount } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      unmount();

      await waitFor(() =>
        expect(supabaseMock.rpc).toHaveBeenCalledWith("release_prova_unidade_lock", {
          p_prova_unidade_id: "prova-unidade-1",
        }),
      );
    });

    it("não tenta liberar um lock que nunca teve", async () => {
      setRpcResult("acquire_prova_unidade_lock", { data: [{ success: false }], error: null });

      const { result, unmount } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.isLocked).toBe(true));

      unmount();
      await vi.advanceTimersByTimeAsync(100);

      expect(chamadasDe("release_prova_unidade_lock")).toHaveLength(0);
    });
  });

  describe("saída da página (pagehide)", () => {
    /**
     * O caminho do unload NÃO passa pelo cliente do Supabase: é `fetch` cru com
     * `keepalive`, porque uma promise comum morre junto com a aba. Daí as asserções
     * serem sobre `fetch`, e não sobre `supabaseMock.rpc`.
     *
     * REGRESSÃO: até 2026-07-25 isto era `navigator.sendBeacon`, que **não permite
     * header nenhum** — a requisição saía sem `apikey`/`Authorization` e o PostgREST
     * recusava. O lock só era devolvido pelo timeout de 10 minutos.
     */
    const RELEASE_URL = "http://localhost:54321/rest/v1/rpc/release_prova_unidade_lock";

    const montarComSessao = async () => {
      supabaseMock.auth.getSession.mockResolvedValueOnce({
        data: { session: { access_token: "token-abc" } },
        error: null,
      } as never);

      const view = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(view.result.current.hasAccess).toBe(true));
      return view;
    };

    it("libera o lock com credenciais quando a aba é fechada", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
      await montarComSessao();

      window.dispatchEvent(new Event("pagehide"));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(RELEASE_URL);
      expect(init).toMatchObject({
        method: "POST",
        keepalive: true,
        headers: {
          apikey: "test-anon-key",
          Authorization: "Bearer token-abc",
        },
      });
      // O corpo do unload também não leva identidade: quem é o dono sai do JWT que
      // acompanha a requisição, e é por isso que o `Authorization` acima é obrigatório.
      expect(JSON.parse(init?.body as string)).toEqual({
        p_prova_unidade_id: "prova-unidade-1",
      });

      fetchMock.mockRestore();
    });

    it("não libera duas vezes se o evento repetir", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
      await montarComSessao();

      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("pagehide"));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockRestore();
    });

    it("não tenta liberar sem lock nem sem sessão", async () => {
      // Sem sessão: `getSession` do mock devolve session null por padrão.
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
      const { result } = renderHook(() => useProvaUnidadeLock(PARAMS));
      await waitFor(() => expect(result.current.hasAccess).toBe(true));

      window.dispatchEvent(new Event("pagehide"));

      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    });

    it("readquire o lock ao voltar do bfcache", async () => {
      // `update_prova_unidade_lock_activity` é um UPDATE: não recria a linha apagada pelo
      // release. Sem readquirir, a tela voltaria editável com o servidor achando
      // que a unidade está livre.
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
      await montarComSessao();

      window.dispatchEvent(new Event("pagehide"));
      const antes = chamadasDe("acquire_prova_unidade_lock").length;

      const restore = new Event("pageshow") as Event & { persisted?: boolean };
      restore.persisted = true;
      window.dispatchEvent(restore);

      await waitFor(() =>
        expect(chamadasDe("acquire_prova_unidade_lock").length).toBe(antes + 1),
      );
      fetchMock.mockRestore();
    });
  });
});
