import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  erroPostgrest,
  type QueryBuilderMock,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

// O useAuth real monta um provider que fala com o Supabase; aqui só interessa o
// recorte que o hook consome (user + os dois papéis).
const { authMock } = vi.hoisted(() => ({
  authMock: { user: { id: "u1" } as { id: string } | null, isAdmin: false, isCoordenador: false },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

import { useColaboradores } from "@/hooks/useColaboradores";

const COLABORADOR = { id: "colab-1", colab_nome_completo: "Maria da Silva", colab_cpf: "12345678901" };

const buildersDe = (tabela: string): QueryBuilderMock[] =>
  supabaseMock.from.mock.calls
    .map((c, i) => ({ tabela: c[0], i }))
    .filter((c) => c.tabela === tabela)
    .map(({ i }) => supabaseMock.from.mock.results[i].value as QueryBuilderMock);

describe("useColaboradores", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    authMock.user = { id: "u1" };
    authMock.isAdmin = false;
    authMock.isCoordenador = false;
  });

  /**
   * O recorte por papel é a regra mais importante deste hook. Atenção ao ler: ele é
   * CLIENT-SIDE. A barreira real é a RLS de `colaboradores` (desde a 2D: admin e
   * coordenador veem tudo; qualquer outra conta autenticada vê só a própria linha).
   * Quebrar o que está aqui piora a UX, não abre vazamento — mas o inverso também
   * vale: consertar aqui não substitui policy.
   */
  describe("recorte por papel", () => {
    it("não consulta nada sem usuário logado (enabled: !!user)", async () => {
      authMock.user = null;
      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it("admin busca todos, sem passar pela RPC de coordenador", async () => {
      authMock.isAdmin = true;
      setTableResult("colaboradores", { data: [COLABORADOR], error: null });

      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.colaboradores).toHaveLength(1));

      expect(supabaseMock.rpc).not.toHaveBeenCalled();
      expect(buildersDe("colaboradores")[0].order).toHaveBeenCalledWith(
        "colab_nome_completo",
        { ascending: true },
      );
    });

    it("coordenador resolve os ids pela RPC e filtra por eles", async () => {
      authMock.isCoordenador = true;
      setRpcResult("get_coordenador_colaboradores", { data: ["colab-1", "colab-2"], error: null });
      setTableResult("colaboradores", { data: [COLABORADOR], error: null });

      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.colaboradores).toHaveLength(1));

      expect(supabaseMock.rpc).toHaveBeenCalledWith("get_coordenador_colaboradores", {
        p_user_id: "u1",
      });
      expect(buildersDe("colaboradores")[0].in).toHaveBeenCalledWith("id", [
        "colab-1",
        "colab-2",
      ]);
    });

    it("coordenador sem colaboradores não consulta a tabela", async () => {
      // Curto-circuito importante: sem ele, `.in('id', [])` iria ao banco à toa.
      authMock.isCoordenador = true;
      setRpcResult("get_coordenador_colaboradores", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.colaboradores).toEqual([]);
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it("fetchAll: true tem precedência sobre o recorte de coordenador", async () => {
      // É como as telas que precisam da lista inteira (ex.: alocação) escapam do
      // recorte. Se a precedência inverter, o coordenador deixa de conseguir alocar.
      authMock.isCoordenador = true;
      setTableResult("colaboradores", { data: [COLABORADOR], error: null });

      const { result } = renderHookWithProviders(() => useColaboradores({ fetchAll: true }));
      await waitFor(() => expect(result.current.colaboradores).toHaveLength(1));

      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });

    it("propaga erro da RPC", async () => {
      authMock.isCoordenador = true;
      setRpcResult("get_coordenador_colaboradores", {
        data: null,
        error: erroPostgrest("42883", "function does not exist"),
      });

      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.error).toBeTruthy());
    });
  });

  /**
   * `mensagemDuplicidade` traduz o nome da CONSTRAINT para uma frase acionável.
   * Vale lembrar por que os índices são funcionais (sobre lower(trim(...))): um
   * UNIQUE comum deixaria conviver Joao@x.com e joao@x.com, que o Supabase Auth
   * trata como o MESMO usuário — e o e-mail é âncora de identidade.
   */
  describe("tradução de violação de unicidade", () => {
    async function criarComErro(error: { code?: string; message: string; details?: string }) {
      setTableResult("colaboradores", { data: null, error: error as never });
      const { result } = renderHookWithProviders(() => useColaboradores());
      result.current.create({ colab_cpf: "12345678901" } as never);
      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      return toastMock.mock.calls.at(-1)?.[0] as { description: string };
    }

    it.each([
      ["colaboradores_colab_cpf_key", "CPF já cadastrado"],
      ["colaboradores_colab_matricula_key", "Matrícula já cadastrada"],
      ["colaboradores_colab_pis_key", "PIS já cadastrado"],
    ])("mapeia %s", async (constraint, esperado) => {
      const toast = await criarComErro({
        code: "23505",
        message: `duplicate key value violates unique constraint "${constraint}"`,
      });
      expect(toast.description).toBe(esperado);
    });

    it("dá orientação completa para e-mail duplicado", async () => {
      const toast = await criarComErro({
        code: "23505",
        message: 'duplicate key value violates unique constraint "colaboradores_colab_email_key"',
      });
      expect(toast.description).toBe(
        "Este e-mail já está cadastrado para outro colaborador. Verifique o endereço e tente novamente.",
      );
    });

    it("dá orientação completa para chave PIX duplicada", async () => {
      const toast = await criarComErro({
        code: "23505",
        message: 'duplicate key value violates unique constraint "colaboradores_colab_chave_pix_key"',
      });
      expect(toast.description).toContain("Cada chave pertence a uma única pessoa");
    });

    it("lê a constraint também de `details`, não só de `message`", async () => {
      // O supabase-js entrega o nome da constraint ora num campo, ora no outro —
      // o helper concatena os dois de propósito.
      const toast = await criarComErro({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: 'Key (colab_cpf)=(12345678901) already exists.',
      });
      expect(toast.description).toBe("CPF já cadastrado");
    });

    it("cai numa mensagem genérica para constraint desconhecida", async () => {
      const toast = await criarComErro({
        code: "23505",
        message: 'duplicate key value violates unique constraint "alguma_outra_key"',
      });
      expect(toast.description).toBe(
        "Um dos dados informados já está cadastrado para outro colaborador.",
      );
    });

    it("não mexe em erro que não é de duplicidade", async () => {
      const toast = await criarComErro({ code: "42501", message: "permission denied" });
      expect(toast.description).toBe("permission denied");
    });
  });

  describe("delete — a trava de vínculo com prova", () => {
    it("recusa e NÃO chama delete quando há alocação", async () => {
      // Excluir a pessoa deixaria alocações órfãs e reescreveria histórico de
      // pagamento. A checagem é prévia e client-side.
      setTableResult("colaboradores", { data: [], error: null });
      setTableResult("colaboradores_prova", { data: [{ id: "alocacao-1" }], error: null });

      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      supabaseMock.from.mockClear();

      result.current.delete("colab-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao excluir",
            description:
              "Não é possível excluir este colaborador pois ele está vinculado a uma prova.",
          }),
        ),
      );

      const tabelas = supabaseMock.from.mock.calls.map((c) => c[0]);
      expect(tabelas).toContain("colaboradores_prova");
      expect(tabelas).not.toContain("colaboradores");
    });

    it("exclui quando não há vínculo", async () => {
      setTableResult("colaboradores", { data: [], error: null });
      setTableResult("colaboradores_prova", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.delete("colab-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "Colaborador excluído com sucesso!" }),
        ),
      );
    });

    it("limita a checagem de vínculo a 1 linha", async () => {
      // Só interessa a existência; trazer todas as alocações seria desperdício.
      setTableResult("colaboradores", { data: [], error: null });
      setTableResult("colaboradores_prova", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.delete("colab-1");

      await waitFor(() => expect(buildersDe("colaboradores_prova")).toHaveLength(1));
      const b = buildersDe("colaboradores_prova")[0];
      expect(b.eq).toHaveBeenCalledWith("colaborador_id", "colab-1");
      expect(b.limit).toHaveBeenCalledWith(1);
    });
  });
});
