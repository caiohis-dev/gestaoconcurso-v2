import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  resetSupabaseMock,
  buildersDaTabela,
  builderQueChamou,
  erroPostgrest,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { useOcorrencias } from "@/hooks/useOcorrencias";

const TABELA = "ocorrencias_colaborador";

const ocorrencia = (id: string, provaUnidadeId: string) => ({
  id,
  colaborador_id: "colab-1",
  prova_id: "prova-1",
  prova_unidade_id: provaUnidadeId,
  descricao: "Chegou atrasado",
  tipo_ocorrencia: "atraso",
  data_ocorrencia: "2026-07-25",
  substituido: 0,
  substituto_id: null,
  created_by: "user-teste-1",
  created_at: "2026-07-25T10:00:00Z",
  updated_at: "2026-07-25T10:00:00Z",
});

/** Argumentos da primeira chamada do método na query de listagem. */
const argsDaListagem = (metodo: "eq" | "in" | "order") => {
  const builder = buildersDaTabela(TABELA)[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (builder[metodo] as any).mock.calls[0];
};

const chamou = (metodo: "in") =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildersDaTabela(TABELA).some((b) => ((b[metodo] as any).mock.calls.length ?? 0) > 0);

describe("useOcorrencias", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    setTableResult(TABELA, { data: [], error: null });
  });

  describe("listagem", () => {
    it("não consulta nada sem provaId (enabled: !!provaId)", async () => {
      const { result } = renderHookWithProviders(() => useOcorrencias(""));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(supabaseMock.from).not.toHaveBeenCalled();
      expect(result.current.ocorrencias).toEqual([]);
    });

    it("filtra pela prova e ordena da ocorrência mais recente para a mais antiga", async () => {
      setTableResult(TABELA, { data: [ocorrencia("o1", "pu-1")], error: null });

      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1"));
      await waitFor(() => expect(result.current.ocorrencias).toHaveLength(1));

      expect(argsDaListagem("eq")).toEqual(["prova_id", "prova-1"]);
      // A ordem importa para a tela: a ocorrência de agora tem de aparecer no topo.
      expect(argsDaListagem("order")).toEqual(["data_ocorrencia", { ascending: false }]);
    });

    it("devolve lista vazia — nunca undefined — antes de a consulta resolver", () => {
      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1"));
      expect(result.current.ocorrencias).toEqual([]);
    });

    it("restringe às unidades informadas quando recebe a lista", async () => {
      const { result } = renderHookWithProviders(() =>
        useOcorrencias("prova-1", ["pu-1", "pu-2"]),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(argsDaListagem("in")).toEqual(["prova_unidade_id", ["pu-1", "pu-2"]]);
    });

    it("NÃO restringe quando não recebe lista alguma — é o caso do admin", async () => {
      // A página passa `undefined` de propósito para admin/superadmin: ele vê a prova
      // inteira. Filtrar aqui esconderia unidade legítima.
      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1", undefined));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(chamou("in")).toBe(false);
    });

    it("⚠️ DEFEITO: lista VAZIA de unidades não restringe nada — devolve a prova inteira", async () => {
      // Comportamento REAL, não desejado — documentado aqui em vez de mascarado.
      //
      // A guarda é `if (provaUnidadeIds && provaUnidadeIds.length > 0)`. Uma lista
      // vazia significa "nenhuma unidade permitida", mas cai no mesmo ramo do
      // `undefined` do admin: NENHUM filtro é aplicado, e a consulta devolve todas as
      // ocorrências da prova.
      //
      // Por que não é teórico: em OcorrenciasProva.tsx o segundo argumento vem de
      // `scopedUnidadeIds`, derivado de `useCoordenadorUnidades` — que devolve `[]`
      // ENQUANTO CARREGA. Ou seja, em todo carregamento da página por um coordenador
      // existe uma janela em que a consulta roda sem filtro. A RLS não segura: a
      // policy de `ocorrencias_colaborador` é `is_coordenador_prova(uid, prova_id)`,
      // que autoriza por PROVA, não por unidade — então o recorte por unidade é
      // client-side e só existe aqui.
      //
      // Conserto (fora do escopo de testes): tratar `[]` como "nada permitido" —
      // `.in("prova_unidade_id", [])` devolve zero linhas — ou não disparar a consulta
      // enquanto o escopo do coordenador não tiver resolvido. Item no backlog.
      const deOutraUnidade = ocorrencia("o9", "pu-que-nao-e-minha");
      setTableResult(TABELA, { data: [deOutraUnidade], error: null });

      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1", []));
      await waitFor(() => expect(result.current.ocorrencias).toHaveLength(1));

      expect(chamou("in")).toBe(false);
      expect(result.current.ocorrencias[0].prova_unidade_id).toBe("pu-que-nao-e-minha");
    });

    it("refaz a consulta quando o escopo de unidades muda", async () => {
      // O callback tolera `undefined` na primeira renderização porque o
      // `renderHookWithProviders` do projeto não repassa `initialProps` — ele só
      // recebe `queryClient`/`route`. Sem isso, o primeiro render explode.
      const { result, rerender } = renderHookWithProviders(
        (props?: { ids?: string[] }) => useOcorrencias("prova-1", props?.ids),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const antes = buildersDaTabela(TABELA).length;

      rerender({ ids: ["pu-1"] });

      // O queryKey inclui as unidades, então mudar o escopo é uma consulta nova — e
      // não o reaproveitamento silencioso do resultado anterior, mais amplo.
      await waitFor(() => expect(buildersDaTabela(TABELA).length).toBeGreaterThan(antes));
      expect(argsDaListagem("in")).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ultimo = buildersDaTabela(TABELA).at(-1) as any;
      expect(ultimo.in.mock.calls[0]).toEqual(["prova_unidade_id", ["pu-1"]]);
    });
  });

  describe("criação", () => {
    it("carimba created_by com o usuário logado", async () => {
      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.create({
        colaborador_id: "colab-1",
        prova_id: "prova-1",
        prova_unidade_id: "pu-1",
        descricao: "Faltou",
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Ocorrência registrada" }),
        ),
      );

      // A autoria não vem do formulário: é lida do Auth no momento da gravação.
      expect(supabaseMock.auth.getUser).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insert = (builderQueChamou(TABELA, "insert").insert as any).mock.calls[0][0];
      expect(insert).toMatchObject({
        colaborador_id: "colab-1",
        descricao: "Faltou",
        created_by: "user-teste-1",
      });
    });

    it("avisa com toast destrutivo quando a gravação falha", async () => {
      setTableResult(TABELA, { data: null, error: erroPostgrest("23503", "prova_unidade inválida") });

      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.create({
        colaborador_id: "colab-1",
        prova_id: "prova-1",
        prova_unidade_id: "pu-1",
        descricao: "Faltou",
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao registrar ocorrência",
            description: "prova_unidade inválida",
            variant: "destructive",
          }),
        ),
      );
    });
  });

  describe("edição e exclusão", () => {
    it("atualiza pelo id e confirma com toast", async () => {
      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.update({ id: "o1", data: { descricao: "Corrigido" } });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Ocorrência atualizada" }),
        ),
      );

      const builder = builderQueChamou(TABELA, "update");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builder.update as any).mock.calls[0][0]).toEqual({ descricao: "Corrigido" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builder.eq as any).mock.calls[0]).toEqual(["id", "o1"]);
    });

    it("exclui pelo id e confirma com toast", async () => {
      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.remove("o1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Ocorrência excluída" }),
        ),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builderQueChamou(TABELA, "delete").eq as any).mock.calls[0]).toEqual(["id", "o1"]);
    });

    it("avisa com toast destrutivo quando a exclusão falha", async () => {
      const { result } = renderHookWithProviders(() => useOcorrencias("prova-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      setTableResult(TABELA, { data: null, error: erroPostgrest("42501", "sem permissão") });
      result.current.remove("o1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao excluir ocorrência",
            variant: "destructive",
          }),
        ),
      );
    });
  });
});
