import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setTableResultSequence,
  resetSupabaseMock,
  buildersDaTabela,
  builderQueChamou,
  setRpcResult,
  erroPostgrest,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { useUsers } from "@/hooks/useUsers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chamadasDe = (tabela: string, metodo: string): any[][] =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildersDaTabela(tabela).flatMap((b) => ((b as any)[metodo]?.mock.calls ?? []));

const perfil = (id: string, nome: string) => ({
  id,
  email: `${id}@fevre.test`,
  full_name: nome,
  created_at: "2026-01-01T00:00:00Z",
});

/** Deixa as duas queries de listagem resolverem antes de instalar sequências. */
async function carregar() {
  const hook = renderHookWithProviders(() => useUsers());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe("useUsers", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    setTableResult("profiles", { data: [], error: null });
    setTableResult("user_roles", { data: [], error: null });
    setTableResult("coordenadores_prova", { data: [], error: null });
  });

  describe("listagem", () => {
    it("junta perfis e papéis no cliente", async () => {
      setTableResult("profiles", { data: [perfil("u1", "Ana"), perfil("u2", "Bruno")], error: null });
      setTableResult("user_roles", {
        data: [
          { user_id: "u1", role: "admin" },
          { user_id: "u1", role: "superadmin" },
          { user_id: "u2", role: "coordenador" },
        ],
        error: null,
      });

      const { result } = await carregar();

      expect(result.current.users[0].roles).toEqual(["admin", "superadmin"]);
      expect(result.current.users[1].roles).toEqual(["coordenador"]);
    });

    it("⚠️ ATENÇÃO: quem não tem NENHUMA linha de papel é exibido como 'user'", async () => {
      // `roles.length > 0 ? roles : ["user"]` — é uma ficção de exibição, não o estado
      // do banco. A pessoa não tem linha em `user_roles`; a tela diz que ela é `user`.
      //
      // Onde isso importa: `useAuth.resolveRoleGestao` devolve `null` para essa mesma
      // pessoa (nenhum papel casa), e o hub trata `null` diferente de `'user'`. Então
      // esta tela e o resto do app discordam sobre a mesma conta. Ao mexer em papéis,
      // não tome a lista daqui como fonte de verdade.
      setTableResult("profiles", { data: [perfil("u3", "Sem papel")], error: null });
      setTableResult("user_roles", { data: [], error: null });

      const { result } = await carregar();

      expect(result.current.users[0].roles).toEqual(["user"]);
    });

    it("ordena do perfil mais recente para o mais antigo", async () => {
      await carregar();
      expect(chamadasDe("profiles", "order")[0]).toEqual([
        "created_at",
        { ascending: false },
      ]);
    });

    it("agrupa as provas do coordenador por usuário, sem repetir edital", async () => {
      setTableResult("coordenadores_prova", {
        data: [
          { user_id: "u1", prova_id: "p1", provas: { editais: { nome: "Concurso A" } } },
          { user_id: "u1", prova_id: "p2", provas: { editais: { nome: "Concurso A" } } },
          { user_id: "u1", prova_id: "p3", provas: { editais: { nome: "Concurso B" } } },
        ],
        error: null,
      });

      const { result } = await carregar();
      await waitFor(() => expect(result.current.userCoordenadorProvas.u1).toBeTruthy());

      // Duas provas do mesmo edital aparecem uma vez só — a tela lista editais.
      expect(result.current.userCoordenadorProvas.u1).toEqual(["Concurso A", "Concurso B"]);
    });
  });

  describe("conceder e revogar papel", () => {
    it("concede inserindo a linha do papel", async () => {
      const { result } = await carregar();
      setTableResultSequence("user_roles", [
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.updateRole.mutate({ userId: "u1", role: "admin", action: "add" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Permissão atualizada" }),
        ),
      );
      expect(chamadasDe("user_roles", "insert")[0][0]).toEqual({ user_id: "u1", role: "admin" });
    });

    it("avisa quando o papel já existe (índice único user_id+role)", async () => {
      const { result } = await carregar();
      setTableResultSequence("user_roles", [
        { data: null, error: erroPostgrest("23505", "duplicate key") },
        { data: [], error: null },
      ]);

      result.current.updateRole.mutate({ userId: "u1", role: "admin", action: "add" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao atualizar permissão",
            variant: "destructive",
          }),
        ),
      );
    });

    it("revoga filtrando por usuário E papel", async () => {
      const { result } = await carregar();
      setTableResultSequence("user_roles", [
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.updateRole.mutate({ userId: "u1", role: "admin", action: "remove" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Permissão atualizada" }),
        ),
      );

      // Sem o filtro de papel, revogar "admin" apagaria TODOS os papéis da pessoa.
      const filtros = chamadasDe("user_roles", "eq");
      expect(filtros).toEqual([
        ["user_id", "u1"],
        ["role", "admin"],
      ]);
    });

    it("revogar 'coordenador' vai pela RPC transacional, não por dois DELETEs", async () => {
      // REGRESSÃO. Até 2026-07-26 eram dois DELETEs soltos — `user_roles` primeiro,
      // `coordenadores_prova` depois — e falhar no segundo deixava o PIOR estado: papel
      // removido da tela, acesso real de pé. Não era cosmético, porque
      // `is_coordenador_prova(uid, prova_id)` — usada na policy de
      // `ocorrencias_colaborador` e nas RPCs `finalizar_prova_unidade` e
      // `encerrar_ocorrencias_unidade` — consulta **só `coordenadores_prova`** e nunca
      // olha o papel. A pessoa sumia da lista de coordenadores e seguia entrando.
      //
      // Agora é uma transação só (migration 20260726160000): o corpo da função roda
      // dentro de uma transação, então falhar em qualquer DELETE desfaz o outro.
      const { result } = await carregar();
      setRpcResult("revogar_coordenador", { data: null, error: null });
      setTableResult("user_roles", { data: [], error: null });

      result.current.updateRole.mutate({ userId: "u1", role: "coordenador", action: "remove" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Permissão atualizada" }),
        ),
      );

      expect(supabaseMock.rpc).toHaveBeenCalledWith("revogar_coordenador", { p_user_id: "u1" });
      // O ponto da correção: o cliente não apaga mais nada por conta própria.
      expect(() => builderQueChamou("coordenadores_prova", "delete")).toThrow();
      expect(() => builderQueChamou("user_roles", "delete")).toThrow();
    });

    it("falha na revogação não deixa estado parcial — nada é apagado pelo cliente", async () => {
      // Com a RPC, um erro significa que NADA foi aplicado. Antes, o mesmo toast de erro
      // convivia com o papel já removido.
      const { result } = await carregar();
      setRpcResult("revogar_coordenador", {
        data: null,
        error: erroPostgrest("42501", "sem permissão"),
      });

      result.current.updateRole.mutate({ userId: "u1", role: "coordenador", action: "remove" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao atualizar permissão",
            variant: "destructive",
          }),
        ),
      );
      expect(() => builderQueChamou("user_roles", "delete")).toThrow();
    });

    it("revogar OUTRO papel continua sendo DELETE direto, sem a RPC", async () => {
      // A RPC é específica do coordenador, porque só ele tem o vínculo em cascata.
      // Admin e user seguem no caminho simples — que já é atômico, é um DELETE só.
      const { result } = await carregar();
      setTableResultSequence("user_roles", [
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.updateRole.mutate({ userId: "u1", role: "admin", action: "remove" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Permissão atualizada" }),
        ),
      );
      expect(supabaseMock.rpc).not.toHaveBeenCalledWith(
        "revogar_coordenador",
        expect.anything(),
      );
      expect(chamadasDe("user_roles", "delete")).toHaveLength(1);
    });
  });

  /**
   * O bloco "acesso de coordenador a uma prova" foi REMOVIDO em 2026-07-26, junto com
   * `useUsers.addCoordenadorAccess`. Ele cobria a concessão pela UI de
   * /gerenciar-usuarios, incluindo um teste marcado `⚠️ DEFEITO` que afirmava a
   * fabricação de alocação falsa.
   *
   * ✅ O DEFEITO FOI CORRIGIDO no mesmo dia, dos dois lados. A cópia da fabricação em
   * `supabase/functions/create-admin/index.ts` (`createCoordenadorAccess`) também saiu,
   * e a EF passou a RECUSAR `role: "coordenador"` com 400.
   *
   * ⚠️ MAS A COBERTURA NÃO VOLTOU. Aquilo é Deno, fora do alcance desta suíte — um teste
   * aqui afirmaria o mock, não a function. Quem mexer na `create-admin` roda a bateria
   * manual `docs/bateria-create-admin-autorizacao.md` (casos A9/A10), e confere a
   * CONTAGEM de colaboradores_prova/coordenadores_prova antes e depois: o 400 sozinho
   * não prova que nada foi escrito.
   */

  describe("criar usuário (Edge Function)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("manda o token DA SESSÃO no Authorization, nunca a anon key", async () => {
      // REGRESSÃO (corrigida em 2026-07-25): o hook mandava
      // `Authorization: Bearer ${VITE_SUPABASE_PUBLISHABLE_KEY}` — a chave pública, que
      // vai no bundle do frontend. Como a `create-admin` cria conta e concede papel com
      // service_role (aceitando "superadmin" do corpo) e não checava o chamador,
      // qualquer um com aquela chave criava um superadmin.
      //
      // O conserto tem dois lados e ESTE TESTE cobre só o daqui: mandar o JWT da
      // sessão, que identifica a pessoa. O outro lado é a EF exigir superadmin — não
      // testável por Vitest (roda em Deno), coberto pela bateria manual em docs/.
      //
      // A `apikey` continua sendo a pública de propósito: ela identifica o PROJETO no
      // gateway. Quem identifica a PESSOA é o Authorization.
      supabaseMock.auth.getSession.mockResolvedValueOnce({
        data: { session: { access_token: "jwt-da-sessao" } },
        error: null,
      } as never);
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const { result } = await carregar();
      result.current.createUser.mutate({
        email: "novo@fevre.test",
        password: "senha123",
        fullName: "Novo",
        role: "superadmin",
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Usuário criado" }),
        ),
      );

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:54321/functions/v1/create-admin");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer jwt-da-sessao");
      expect(headers.Authorization).not.toContain("test-anon-key");
      expect(headers.apikey).toBe("test-anon-key");
    });

    it("recusa sem sessão, sem chegar a chamar a Edge Function", async () => {
      // `getSession` do mock devolve `session: null` por padrão. Falha fechada: melhor
      // erro claro do que uma requisição que a EF vai recusar com 401.
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const { result } = await carregar();
      result.current.createUser.mutate({
        email: "novo@fevre.test",
        password: "senha123",
        fullName: "Novo",
        role: "admin",
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao criar usuário",
            description: "Sessão expirada. Entre novamente para criar usuários.",
          }),
        ),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("propaga a mensagem de erro da Edge Function", async () => {
      // Precisa de sessão: sem ela o hook nem chega a chamar a function (caso acima).
      supabaseMock.auth.getSession.mockResolvedValueOnce({
        data: { session: { access_token: "jwt-da-sessao" } },
        error: null,
      } as never);
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "E-mail já cadastrado" }), { status: 400 }),
      );

      const { result } = await carregar();
      result.current.createUser.mutate({
        email: "existente@fevre.test",
        password: "senha123",
        fullName: "Existente",
        role: "admin",
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao criar usuário",
            description: "E-mail já cadastrado",
            variant: "destructive",
          }),
        ),
      );
    });
  });
});
