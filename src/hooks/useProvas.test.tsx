import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setTableResultSequence,
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

import { useProvas } from "@/hooks/useProvas";

const prova = (id: string, createdBy: string | null = null) => ({
  id,
  prova_edital: "CONCURSO 2026",
  edital_id: "ed-1",
  prova_data: "2026-08-10",
  prova_hora_inicio: "09:00",
  prova_hora_final: "13:00",
  prova_n_candidatos: 500,
  prova_finalizada: false,
  finalizada_at: null,
  created_at: "2026-07-01T10:00:00Z",
  updated_at: null,
  created_by: createdBy,
  prova_cabecalho_linha1: null,
  prova_cabecalho_linha2: null,
  editais: { nome: "Concurso 2026", n_candidatos: 500, cabecalho_linha1: null, cabecalho_linha2: null },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chamadasDe = (tabela: string, metodo: string): any[][] =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildersDaTabela(tabela).flatMap((b) => ((b as any)[metodo]?.mock.calls ?? []));

describe("useProvas", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    setTableResult("provas", { data: [], error: null });
    setTableResult("profiles", { data: [], error: null });
  });

  describe("listagem", () => {
    it("traz o nome do edital pelo join e ordena da prova mais recente para a mais antiga", async () => {
      setTableResult("provas", { data: [prova("p1")], error: null });

      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.provas).toHaveLength(1));

      // O nome do edital vem do JOIN, não da cópia denormalizada `prova_edital` —
      // que só existe para satisfazer o NOT NULL até a coluna ser dropada.
      expect(chamadasDe("provas", "select")[0][0]).toContain("editais(nome");
      expect(result.current.provas[0].editais?.nome).toBe("Concurso 2026");

      // `nullsFirst: false` importa: prova sem data marcada iria para o topo da tela
      // se o padrão do Postgres valesse, empurrando as provas reais para baixo.
      expect(chamadasDe("provas", "order")[0]).toEqual([
        "prova_data",
        { ascending: false, nullsFirst: false },
      ]);
    });

    it("devolve lista vazia — nunca undefined — antes de resolver", () => {
      const { result } = renderHookWithProviders(() => useProvas());
      expect(result.current.provas).toEqual([]);
    });
  });

  /**
   * O nome de quem criou a prova não vem por join: é uma segunda consulta a
   * `profiles`, feita à mão. Vale testar porque é a parte com mais decisões
   * implícitas do hook — e a que degrada em silêncio quando falha.
   */
  describe("enriquecimento com o nome de quem criou", () => {
    it("consulta profiles uma vez só, com os autores distintos", async () => {
      setTableResult("provas", {
        data: [prova("p1", "user-a"), prova("p2", "user-a"), prova("p3", "user-b")],
        error: null,
      });
      setTableResult("profiles", {
        data: [
          { id: "user-a", full_name: "Ana" },
          { id: "user-b", full_name: "Bruno" },
        ],
        error: null,
      });

      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.provas).toHaveLength(3));

      // Três provas, dois autores: a consulta pede DOIS ids, não três.
      expect(chamadasDe("profiles", "in")[0]).toEqual(["id", ["user-a", "user-b"]]);
      expect(result.current.provas[0].profiles?.full_name).toBe("Ana");
      expect(result.current.provas[2].profiles?.full_name).toBe("Bruno");
    });

    it("não consulta profiles quando nenhuma prova tem autor", async () => {
      setTableResult("provas", { data: [prova("p1", null)], error: null });

      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.provas).toHaveLength(1));

      expect(buildersDaTabela("profiles")).toHaveLength(0);
      expect(result.current.provas[0].profiles).toBeNull();
    });

    it("deixa o nome nulo quando o autor não tem profile correspondente", async () => {
      // Acontece de verdade: `created_by` aponta para auth.users, e a linha de
      // `profiles` pode não existir (ou a RLS pode não devolvê-la).
      setTableResult("provas", { data: [prova("p1", "user-fantasma")], error: null });
      setTableResult("profiles", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.provas).toHaveLength(1));

      expect(result.current.provas[0].profiles).toEqual({ full_name: null });
    });

    it("⚠️ ATENÇÃO: erro ao buscar profiles é engolido — a lista vem sem os nomes", async () => {
      // Não é defeito: é degradação deliberada. O hook desestrutura só `data` da
      // consulta a `profiles` e IGNORA o `error`, então uma falha ali não derruba a
      // listagem de provas — que é o dado importante da tela.
      //
      // O que registrar: a falha é SILENCIOSA. Não há toast nem log; a coluna "criado
      // por" simplesmente aparece vazia, e ninguém distingue "sem autor" de "não
      // consegui ler o autor". Se um dia essa coluna virar informação crítica, este é
      // o ponto a mexer.
      setTableResult("provas", { data: [prova("p1", "user-a")], error: null });
      setTableResult("profiles", { data: null, error: erroPostgrest("42501", "sem permissão") });

      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.provas).toHaveLength(1));

      expect(result.current.error).toBeNull();
      expect(result.current.provas[0].profiles).toEqual({ full_name: null });
      expect(toastMock).not.toHaveBeenCalled();
    });

    it("propaga erro da consulta de provas — este NÃO é engolido", async () => {
      setTableResult("provas", { data: null, error: erroPostgrest("42501", "sem permissão") });

      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.error).toBeTruthy());

      expect(result.current.provas).toEqual([]);
    });
  });

  describe("mutations", () => {
    it("carimba created_by com o usuário logado ao criar", async () => {
      setTableResultSequence("provas", [
        { data: [], error: null },
        { data: { id: "p-nova" }, error: null },
        { data: [], error: null },
      ]);

      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.create({ edital_id: "ed-1", prova_edital: "CONCURSO 2026" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Prova criada" })),
      );

      expect(supabaseMock.auth.getUser).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (builderQueChamou("provas", "insert").insert as any).mock.calls[0][0];
      expect(payload).toMatchObject({
        edital_id: "ed-1",
        prova_edital: "CONCURSO 2026",
        created_by: "user-teste-1",
      });
    });

    it("atualiza pelo id", async () => {
      setTableResultSequence("provas", [
        { data: [], error: null },
        { data: { id: "p1" }, error: null },
        { data: [], error: null },
      ]);

      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.update({ id: "p1", data: { prova_data: "2026-09-01" } });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Prova atualizada" }),
        ),
      );

      const builder = builderQueChamou("provas", "update");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builder.update as any).mock.calls[0][0]).toEqual({ prova_data: "2026-09-01" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builder.eq as any).mock.calls[0]).toEqual(["id", "p1"]);
    });

    it("exclui pelo id", async () => {
      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.delete("p1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Prova excluída" })),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builderQueChamou("provas", "delete").eq as any).mock.calls[0]).toEqual(["id", "p1"]);
    });

    it("avisa com toast destrutivo quando a exclusão esbarra em vínculo", async () => {
      const { result } = renderHookWithProviders(() => useProvas());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Caso real: prova com unidades/alocações vinculadas.
      setTableResult("provas", {
        data: null,
        error: erroPostgrest("23503", "violates foreign key constraint"),
      });
      result.current.delete("p1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao excluir prova", variant: "destructive" }),
        ),
      );
    });
  });
});
