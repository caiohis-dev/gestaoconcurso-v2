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

import {
  useColaboradores,
  mensagemErroExclusaoColaborador,
} from "@/hooks/useColaboradores";

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

  describe("delete — a trava passou do cliente para o banco", () => {
    /**
     * Havia aqui três testes do PRÉ-CHECK client-side (SELECT em colaboradores_prova e
     * throw "COLABORADOR_VINCULADO_PROVA"), inclusive um garantindo o `.limit(1)`.
     * Foram removidos em 2026-07-26 junto com o próprio pré-check: ele checava alocação
     * e NÃO checava ocorrência, então quem tinha histórico de ocorrência sem alocação
     * era excluído por esta tela levando o histórico junto — 18 das 19 ocorrências do
     * banco estavam nessa situação. Quem recusa agora é o RESTRICT das FKs.
     *
     * Mensagens REAIS do Postgres, capturadas do banco local em 2026-07-26 após a
     * migration 20260726210000.
     */
    async function excluirComErro(message: string, code = "23503") {
      setTableResult("colaboradores", { data: null, error: { code, message } as never });
      const { result } = renderHookWithProviders(() => useColaboradores());
      result.current.delete("colab-1");
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao excluir" }),
        ),
      );
      return toastMock.mock.calls.at(-1)?.[0] as { description: string };
    }

    const MSG = {
      alocacao:
        'update or delete on table "colaboradores" violates foreign key constraint "colaboradores_prova_colaborador_id_fkey" on table "colaboradores_prova"',
      ocorrencia:
        'update or delete on table "colaboradores" violates foreign key constraint "ocorrencias_colaborador_colaborador_id_fkey" on table "ocorrencias_colaborador"',
      substituto:
        'update or delete on table "colaboradores" violates foreign key constraint "ocorrencias_colaborador_substituto_id_fkey" on table "ocorrencias_colaborador"',
    };

    it("não consulta mais colaboradores_prova antes de excluir", async () => {
      // O pré-check era "leio e então decido": o vínculo podia nascer entre o SELECT e o
      // DELETE. Deixar de consultar é parte do conserto, não detalhe de performance.
      setTableResult("colaboradores", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useColaboradores());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      supabaseMock.from.mockClear();

      result.current.delete("colab-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "Colaborador excluído com sucesso!" }),
        ),
      );
      expect(supabaseMock.from.mock.calls.map((c) => c[0])).not.toContain("colaboradores_prova");
    });

    it("traduz a recusa por alocação oferecendo a saída que existe", async () => {
      const toast = await excluirComErro(MSG.alocacao);
      expect(toast.description).toBe(
        "Este colaborador está alocado em uma prova. Remova a alocação antes de excluí-lo.",
      );
    });

    it("traduz a recusa por ocorrência SEM prometer saída", async () => {
      // Diferença deliberada: desalocar é possível, apagar ocorrência não. Dizer "remova
      // antes" aqui mandaria a pessoa procurar um botão que não existe.
      const toast = await excluirComErro(MSG.ocorrencia);
      expect(toast.description).toContain("não pode ser excluído");
      expect(toast.description).not.toContain("Remova");
    });

    it("distingue substituto de ocorrência titular", async () => {
      // O nome da constraint de substituto contém "ocorrencias_colaborador"; casar por
      // essa tabela primeiro engoliria este caso.
      const toast = await excluirComErro(MSG.substituto);
      expect(toast.description).toContain("substituto");
    });

    it("deixa passar erro que não é de vínculo", async () => {
      const toast = await excluirComErro("permission denied", "42501");
      expect(toast.description).toBe("permission denied");
    });
  });
});

describe("mensagemErroExclusaoColaborador", () => {
  it("cai numa frase genérica se a FK for de uma tabela nova", () => {
    const futura =
      'update or delete on table "colaboradores" violates foreign key constraint "tabela_nova_colaborador_id_fkey" on table "tabela_nova"';
    expect(mensagemErroExclusaoColaborador({ code: "23503", message: futura })).toBe(
      "Este colaborador tem histórico registrado e não pode ser excluído.",
    );
  });

  it("reconhece pelo texto quando o código não vem", () => {
    const msg =
      'update or delete on table "colaboradores" violates foreign key constraint "colaboradores_prova_colaborador_id_fkey" on table "colaboradores_prova"';
    expect(mensagemErroExclusaoColaborador({ message: msg })).toContain("Remova a alocação");
  });
});
