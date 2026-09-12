import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setTableResultSequence,
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

import { useCoordenadoresProva } from "@/hooks/useCoordenadoresProva";

const PROVA_ID = "prova-1";

/** Os UUIDs literais de FUNCOES_COORDENACAO, que o hook mantém em constante. */
const COORDENADOR_GERAL = "11a310e5-0fce-46f2-8ad7-769a5e5d7f89";
const AUXILIAR_COORDENACAO = "8d36ef0f-becb-45f3-837b-04eea15489fb";

/** Todos os builders devolvidos por `from(tabela)`, na ordem das chamadas. */
function buildersDe(tabela: string): QueryBuilderMock[] {
  return supabaseMock.from.mock.calls
    .map((c, i) => ({ tabela: c[0], i }))
    .filter((c) => c.tabela === tabela)
    .map(({ i }) => supabaseMock.from.mock.results[i].value as QueryBuilderMock);
}

describe("useCoordenadoresProva", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
  });

  describe("elegibilidade — os UUIDs de coordenação", () => {
    it("filtra os elegíveis exatamente pelos dois UUIDs de FUNCOES_COORDENACAO", async () => {
      // ⚠️ Fragilidade conhecida e deliberadamente fixada aqui: a elegibilidade a
      // coordenador depende de DOIS UUIDs literais no frontend. Se essas linhas de
      // funcoes_colaboradores forem apagadas e recriadas — mesmo com nome idêntico —
      // ganham novo id e a lista de elegíveis fica vazia SEM erro. Este teste não
      // impede isso (não há como, do lado do cliente), mas amarra os valores: quem
      // mudá-los tem de mudar aqui também, e aí a fragilidade fica visível.
      setTableResult("coordenadores_prova", { data: [], error: null });
      setTableResult("colaboradores_prova", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useCoordenadoresProva(PROVA_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const b = buildersDe("colaboradores_prova")[0];
      expect(b.in).toHaveBeenCalledWith("funcao_id", [COORDENADOR_GERAL, AUXILIAR_COORDENACAO]);
      expect(b.eq).toHaveBeenCalledWith("prova_unidades.prova_id", PROVA_ID);
    });

    it("restringe à unidade quando provaUnidadeId é informado", async () => {
      setTableResult("coordenadores_prova", { data: [], error: null });
      setTableResult("colaboradores_prova", { data: [], error: null });

      const { result } = renderHookWithProviders(() =>
        useCoordenadoresProva(PROVA_ID, "pu-7"),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(buildersDe("colaboradores_prova")[0].eq).toHaveBeenCalledWith(
        "prova_unidade_id",
        "pu-7",
      );
    });

    it("não consulta nada sem provaId", async () => {
      const { result } = renderHookWithProviders(() => useCoordenadoresProva(""));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });

  describe("colaboradoresDisponiveis", () => {
    it("subtrai dos elegíveis quem já tem acesso", async () => {
      // A derivação que alimenta o combobox de conceder acesso: mostrar duas vezes
      // a mesma pessoa faria a coordenação tentar conceder um acesso que já existe.
      setTableResult("coordenadores_prova", {
        data: [{ id: "cp-1", colaborador_prova_id: "alocacao-1", user_id: "u1", prova_id: PROVA_ID }],
        error: null,
      });
      setTableResult("colaboradores_prova", {
        data: [
          { id: "alocacao-1", colaborador_id: "colab-1", funcao_id: COORDENADOR_GERAL },
          { id: "alocacao-2", colaborador_id: "colab-2", funcao_id: AUXILIAR_COORDENACAO },
        ],
        error: null,
      });

      const { result } = renderHookWithProviders(() => useCoordenadoresProva(PROVA_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.colaboradoresDisponiveis).toHaveLength(1);
      expect(result.current.colaboradoresDisponiveis[0].id).toBe("alocacao-2");
    });

    it("devolve todos os elegíveis quando ninguém tem acesso ainda", async () => {
      setTableResult("coordenadores_prova", { data: [], error: null });
      setTableResult("colaboradores_prova", {
        data: [{ id: "alocacao-1", colaborador_id: "colab-1", funcao_id: COORDENADOR_GERAL }],
        error: null,
      });

      const { result } = renderHookWithProviders(() => useCoordenadoresProva(PROVA_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.colaboradoresDisponiveis).toHaveLength(1);
    });
  });

  describe("impedimento — quem NÃO pode receber o acesso, e por quê", () => {
    /**
     * ⚠️ O impedido continua na lista. Até 2026-09-12 o diálogo criava a conta do
     * coordenador ali mesmo (e-mail + senha digitados, Edge Function
     * `create-coordenador`), então "não tem conta" não era um estado que aparecesse.
     * Agora o acesso usa a conta que o colaborador já tem — e sumir da lista quem
     * ainda não tem seria perda silenciosa: o admin procuraria o nome e não teria
     * como saber por que ele não está lá.
     */
    async function elegivelCom(colaborador: Record<string, unknown>) {
      setTableResult("coordenadores_prova", { data: [], error: null });
      setTableResult("colaboradores_prova", {
        data: [
          {
            id: "alocacao-1",
            colaborador_id: "colab-1",
            funcao_id: COORDENADOR_GERAL,
            colaboradores: colaborador,
            funcoes_colaboradores: { id: COORDENADOR_GERAL, cargo_nome: "Coordenador Geral" },
          },
        ],
        error: null,
      });

      const { result } = renderHookWithProviders(() => useCoordenadoresProva(PROVA_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      return result;
    }

    it("sem impedimento quando o colaborador já tem conta", async () => {
      const result = await elegivelCom({
        id: "colab-1",
        colab_nome_completo: "MARIA",
        colab_email: "maria@exemplo.com",
        user_id: "u1",
      });

      expect(result.current.colaboradoresDisponiveis[0]).toMatchObject({
        nome: "MARIA",
        funcao: "Coordenador Geral",
        impedimento: null,
      });
    });

    it("'sem-conta' quando tem e-mail mas ainda não reivindicou o acesso", async () => {
      const result = await elegivelCom({
        id: "colab-1",
        colab_nome_completo: "MARIA",
        colab_email: "maria@exemplo.com",
        user_id: null,
      });

      expect(result.current.colaboradoresDisponiveis[0].impedimento).toBe("sem-conta");
    });

    it("'sem-email' quando o cadastro não tem e-mail — a providência é outra", async () => {
      // São 255 colaboradores nesse estado (medido em 2026-09-12). Para eles não
      // adianta "peça que ele reivindique": o acesso nasce pelo e-mail, que não existe.
      const result = await elegivelCom({
        id: "colab-1",
        colab_nome_completo: "MARIA",
        colab_email: null,
        user_id: null,
      });

      expect(result.current.colaboradoresDisponiveis[0].impedimento).toBe("sem-email");
    });

    it("e-mail em branco conta como sem e-mail", async () => {
      const result = await elegivelCom({
        id: "colab-1",
        colab_nome_completo: "MARIA",
        colab_email: "   ",
        user_id: null,
      });

      expect(result.current.colaboradoresDisponiveis[0].impedimento).toBe("sem-email");
    });
  });

  describe("conceder", () => {
    /**
     * A concessão virou a RPC `conceder_coordenador` em 2026-09-12. O cliente manda
     * SÓ o id da alocação: prova e conta são derivadas no banco. Este teste afirma
     * justamente isso — que o `user_id` não trafega mais pelo cliente, que era o
     * campo livre por onde a conta do acesso passava a divergir da do cadastro.
     */
    async function carregado() {
      setTableResult("colaboradores_prova", { data: [], error: null });
      setTableResult("coordenadores_prova", { data: [], error: null });
      const { result } = renderHookWithProviders(() => useCoordenadoresProva(PROVA_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      return result;
    }

    it("chama a RPC com o id da alocação, e só com ele", async () => {
      setRpcResult("conceder_coordenador", { data: "cp-9", error: null });
      const result = await carregado();

      result.current.conceder("alocacao-2");

      await waitFor(() =>
        expect(supabaseMock.rpc).toHaveBeenCalledWith("conceder_coordenador", {
          p_colaborador_prova_id: "alocacao-2",
        }),
      );
    });

    it("avisa em caso de sucesso", async () => {
      setRpcResult("conceder_coordenador", { data: "cp-9", error: null });
      const result = await carregado();

      result.current.conceder("alocacao-2");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Acesso concedido" }),
        ),
      );
    });

    it("a recusa do banco chega ao usuário COM a providência escrita", async () => {
      // A RPC recusa nomeando o que fazer. Trocar isso por uma frase genérica já foi
      // dívida duas vezes neste repo — a mensagem é a metade útil da recusa.
      const recusa =
        'MARIA ainda não tem acesso ao sistema. Peça que ele entre em /auth e use "Estou sem minha senha"';
      setRpcResult("conceder_coordenador", { data: null, error: erroPostgrest("P0001", recusa) });
      const result = await carregado();

      result.current.conceder("alocacao-2");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao conceder acesso",
            description: recusa,
          }),
        ),
      );
    });
  });

  /**
   * A sequência só pode ser instalada DEPOIS da carga inicial: a query de listagem
   * também chama `from("coordenadores_prova")` e consumiria a primeira entrada,
   * entregando ao hook um objeto onde ele espera array. `setTableResultSequence`
   * zera o contador, então instalar aqui alinha o índice 0 com a primeira consulta
   * do mutationFn. A última entrada é sempre um ARRAY, porque o refetch disparado
   * pela invalidação cai nela — e um objeto ali quebraria o `.map` do hook.
   */
  async function carregarEDepois(sequencia: Parameters<typeof setTableResultSequence>[1]) {
    setTableResult("colaboradores_prova", { data: [], error: null });
    setTableResult("coordenadores_prova", { data: [], error: null });

    const hook = renderHookWithProviders(() => useCoordenadoresProva(PROVA_ID));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    setTableResultSequence("coordenadores_prova", sequencia);
    return hook;
  }

  describe("delete — a remoção condicional do papel `coordenador`", () => {
    it("remove o papel quando aquela era a ÚLTIMA prova do usuário", async () => {
      // Ordem exata das consultas do mutationFn:
      //   1. select user_id do registro   2. delete do registro
      //   3. select outras atribuições    (vazio ⇒ remove o papel)
      setTableResult("user_roles", { data: null, error: null });
      const { result } = await carregarEDepois([
        { data: { user_id: "u1" }, error: null },
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.delete("cp-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Acesso removido" }),
        ),
      );

      const roles = buildersDe("user_roles");
      expect(roles).toHaveLength(1);
      expect(roles[0].eq).toHaveBeenCalledWith("user_id", "u1");
      expect(roles[0].eq).toHaveBeenCalledWith("role", "coordenador");
    });

    it("PRESERVA o papel quando o usuário coordena outra prova", async () => {
      // O caso que um refactor descuidado quebra: remover o papel aqui tiraria o
      // acesso da pessoa às outras provas que ela coordena.
      const { result } = await carregarEDepois([
        { data: { user_id: "u1" }, error: null },
        { data: null, error: null },
        { data: [{ id: "cp-outra" }], error: null },
      ]);

      result.current.delete("cp-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Acesso removido" }),
        ),
      );

      expect(buildersDe("user_roles")).toHaveLength(0);
    });

    it("não mexe em papel nenhum se o registro não trouxe user_id", async () => {
      // Ramo defensivo (`if (coordenador?.user_id)`). Vale registrar que o DELETE
      // do vínculo acontece MESMO ASSIM — a remoção do papel é que é pulada.
      const { result } = await carregarEDepois([
        { data: null, error: null },
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.delete("cp-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Acesso removido" }),
        ),
      );
      expect(buildersDe("user_roles")).toHaveLength(0);
    });

    it("informa erro quando o delete do vínculo falha", async () => {
      const { result } = await carregarEDepois([
        { data: { user_id: "u1" }, error: null },
        { data: null, error: erroPostgrest("42501", "permission denied") },
        { data: [], error: null },
      ]);

      result.current.delete("cp-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao remover acesso",
            description: "permission denied",
          }),
        ),
      );
    });
  });
});
