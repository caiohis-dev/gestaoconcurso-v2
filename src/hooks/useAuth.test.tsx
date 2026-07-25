import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { supabaseMock, setTableResult, resetSupabaseMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { AuthProvider, useAuth } from "@/hooks/useAuth";

type Papel = "superadmin" | "admin" | "coordenador" | "user" | "colaborador";

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const SESSAO = {
  user: { id: "u1", email: "pessoa@fevre.test" },
  access_token: "t",
} as never;

/** Prepara a sessão e os papéis que o provider vai encontrar ao montar. */
function comSessao(papeis: Papel[] | null) {
  if (papeis === null) {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    return;
  }
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: SESSAO }, error: null });
  setTableResult("user_roles", { data: papeis.map((role) => ({ role })), error: null });
}

/** Monta o provider e espera os papéis resolverem. */
async function montar() {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.rolesLoaded).toBe(true));
  return hook;
}

describe("useAuth", () => {
  let locationOriginal: Location;

  beforeEach(() => {
    resetSupabaseMock();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    supabaseMock.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    // signOut faz `window.location.href = '/auth'`, que no jsdom emite "Not
    // implemented: navigation". Substituímos por um objeto observável.
    locationOriginal = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...locationOriginal, href: "http://localhost/", origin: "http://localhost" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: locationOriginal,
    });
  });

  it("exige estar dentro do AuthProvider", () => {
    // O erro é proposital: sem provider o hook devolveria undefined e a falha
    // apareceria longe da causa.
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });

  describe("sem sessão", () => {
    it("resolve para deslogado e libera o roteamento", async () => {
      comSessao(null);
      const { result } = await montar();

      expect(result.current.user).toBeNull();
      expect(result.current.role).toBeNull();
      expect(result.current.roles).toEqual([]);
      expect(result.current.loading).toBe(false);
      // rolesLoaded true mesmo sem usuário: quem espera por ele para navegar não
      // pode ficar preso na tela de carregamento do login.
      expect(result.current.rolesLoaded).toBe(true);
    });

    it("não consulta user_roles", async () => {
      comSessao(null);
      await montar();
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });

  /**
   * `role` é a ESCADA de gestão: superadmin > admin > coordenador > user.
   * `colaborador` NÃO entra nela — é dimensão paralela, exposta como isColaborador.
   * O motivo é concreto: dos 12 colaboradores com conta, 10 são coordenadores e 2
   * são admins. Espremer tudo num papel único rebaixaria a gestão deles.
   */
  describe("hierarquia de papéis", () => {
    it("superadmin ganha também isAdmin", async () => {
      comSessao(["superadmin"]);
      const { result } = await montar();

      expect(result.current.role).toBe("superadmin");
      expect(result.current.isSuperAdmin).toBe(true);
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isCoordenador).toBe(false);
    });

    it("admin não vira superadmin", async () => {
      comSessao(["admin"]);
      const { result } = await montar();

      expect(result.current.role).toBe("admin");
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isSuperAdmin).toBe(false);
    });

    it("escolhe o degrau mais alto quando há vários papéis", async () => {
      comSessao(["user", "coordenador", "admin"]);
      const { result } = await montar();
      expect(result.current.role).toBe("admin");
    });

    it("respeita a ordem superadmin > admin", async () => {
      comSessao(["admin", "superadmin"]);
      const { result } = await montar();
      expect(result.current.role).toBe("superadmin");
    });

    it("coordenador é o degrau abaixo de admin", async () => {
      comSessao(["coordenador"]);
      const { result } = await montar();
      expect(result.current.role).toBe("coordenador");
      expect(result.current.isCoordenador).toBe(true);
      expect(result.current.isAdmin).toBe(false);
    });

    it("conta sem papel nenhum fica com role null", async () => {
      comSessao([]);
      const { result } = await montar();
      expect(result.current.role).toBeNull();
      expect(result.current.roles).toEqual([]);
    });
  });

  describe("`colaborador` é dimensão paralela, não degrau", () => {
    it("colaborador puro tem role NULL e isColaborador true", async () => {
      // Esta é a definição de "colaborador puro" (isColaborador && role === null)
      // usada pelo Auth.tsx no pós-login e pelo guard do Inicio.tsx: quem cai aqui
      // vai direto a /perfil-colaborador e nunca vê o hub. As duas telas precisam
      // concordar; se esta resolução mudar, elas divergem.
      comSessao(["colaborador"]);
      const { result } = await montar();

      expect(result.current.role).toBeNull();
      expect(result.current.isColaborador).toBe(true);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isCoordenador).toBe(false);
    });

    it("coordenador + colaborador mantém a gestão (o caso dos 10)", async () => {
      comSessao(["coordenador", "colaborador"]);
      const { result } = await montar();

      expect(result.current.role).toBe("coordenador");
      expect(result.current.isColaborador).toBe(true);
    });

    it("user + colaborador resolve para `user`, NÃO para colaborador puro", async () => {
      // Decisão explícita de 2026-07-24: a dimensão de gestão manda na escolha do
      // destino. Esta pessoa cai no HUB (estado vazio, pois `user` não tem módulo),
      // não no portal do colaborador — e alcança o próprio cadastro pelo item
      // "Meu Cadastro" do header.
      comSessao(["user", "colaborador"]);
      const { result } = await montar();

      expect(result.current.role).toBe("user");
      expect(result.current.isColaborador).toBe(true);
    });

    it("admin + colaborador mantém admin", async () => {
      comSessao(["admin", "colaborador"]);
      const { result } = await montar();

      expect(result.current.role).toBe("admin");
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isColaborador).toBe(true);
    });

    it("expõe o array completo de papéis, não só o resolvido", async () => {
      // O array existe justamente porque uma pessoa acumula gestão + colaborador.
      comSessao(["coordenador", "colaborador"]);
      const { result } = await montar();
      expect(result.current.roles).toEqual(["coordenador", "colaborador"]);
    });
  });

  /**
   * A janela do rolesLoaded: entre `setUser` e o fim do fetch, o usuário já existe e
   * os papéis ainda não. Quem decide para onde navegar sem esperar decide sobre um
   * conjunto VAZIO — e manda um admin para o lugar errado.
   */
  describe("rolesLoaded", () => {
    it("começa false e só vira true depois dos papéis chegarem", async () => {
      comSessao(["admin"]);
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.rolesLoaded).toBe(false);

      await waitFor(() => expect(result.current.rolesLoaded).toBe(true));
      expect(result.current.role).toBe("admin");
    });

    it("vira true mesmo se a consulta de papéis falhar — não trava a navegação", async () => {
      // Se ficasse false, a tela de login nunca navegaria e a pessoa ficaria presa
      // sem mensagem de erro. Foi exatamente o sintoma do bug de GRANT de 2026-07-12.
      supabaseMock.auth.getSession.mockResolvedValue({ data: { session: SESSAO }, error: null });
      setTableResult("user_roles", {
        data: null,
        error: { code: "42501", message: "permission denied", details: "", hint: "" },
      });

      const { result } = await montar();

      expect(result.current.rolesLoaded).toBe(true);
      expect(result.current.role).toBeNull();
      expect(result.current.roles).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it("consulta os papéis pelo id do usuário da sessão", async () => {
      comSessao(["admin"]);
      await montar();

      expect(supabaseMock.from).toHaveBeenCalledWith("user_roles");
      const builder = supabaseMock.from.mock.results[0].value;
      expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    });
  });

  describe("signIn", () => {
    it("delega ao Supabase Auth e devolve o erro sem interpretar", async () => {
      comSessao(null);
      const { result } = await montar();

      supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: new Error("Invalid login credentials"),
      });

      const { error } = await result.current.signIn("a@b.com", "senha");

      expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "a@b.com",
        password: "senha",
      });
      expect(error?.message).toBe("Invalid login credentials");
    });
  });

  describe("signOut", () => {
    it("limpa as chaves do Supabase no localStorage e vai para a porta única", async () => {
      localStorage.setItem("sb-projeto-auth-token", "x");
      localStorage.setItem("supabase.auth.token", "y");
      localStorage.setItem("preferencia-do-usuario", "manter");

      comSessao(["admin"]);
      const { result } = await montar();

      await act(async () => {
        await result.current.signOut();
      });

      expect(localStorage.getItem("sb-projeto-auth-token")).toBeNull();
      expect(localStorage.getItem("supabase.auth.token")).toBeNull();
      // Só as chaves do Supabase saem — o resto do localStorage é preservado.
      expect(localStorage.getItem("preferencia-do-usuario")).toBe("manter");
    });

    it("desloga em escopo global, não só nesta aba", async () => {
      comSessao(["admin"]);
      const { result } = await montar();

      await act(async () => {
        await result.current.signOut();
      });

      expect(supabaseMock.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    });

    it("força recarga em /auth, a porta única", async () => {
      // O reload duro existe para não deixar estado React fantasma. Efeito colateral
      // herdado: ele destrói qualquer navigate(..., { state }) chamado logo depois.
      comSessao(["admin"]);
      const { result } = await montar();

      await act(async () => {
        await result.current.signOut();
      });

      expect(window.location.href).toBe("/auth");
    });

    it("navega mesmo se o signOut do Supabase falhar", async () => {
      // O hook loga o erro por design; silenciamos para não poluir a saída com um
      // erro que o próprio teste provocou.
      const consoleErro = vi.spyOn(console, "error").mockImplementation(() => {});
      comSessao(["admin"]);
      const { result } = await montar();
      supabaseMock.auth.signOut.mockRejectedValueOnce(new Error("rede caiu"));

      await act(async () => {
        await result.current.signOut();
      });

      // Deixar a pessoa presa numa sessão que ela pediu para encerrar seria pior
      // que sair sem confirmar do servidor.
      expect(window.location.href).toBe("/auth");
      expect(consoleErro).toHaveBeenCalled();
      consoleErro.mockRestore();
    });
  });
});
