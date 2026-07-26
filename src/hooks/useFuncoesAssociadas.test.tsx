import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  resetSupabaseMock,
  buildersDaTabela,
  erroPostgrest,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useFuncoesAssociadas } from "@/hooks/useFuncoesAssociadas";

const TABELAS = ["valores_funcao_prova", "colaboradores_prova", "meta_colaboradores_unidade"];

const vazio = () => TABELAS.forEach((t) => setTableResult(t, { data: [], error: null }));

/**
 * Este hook responde a UMA pergunta: "esta função já é usada por alguma prova?" — e a
 * resposta decide se o botão de excluir fica habilitado.
 *
 * ⚠️ O CONTEXTO QUE TORNA ISSO CRÍTICO: as FKs de `funcao_id` **não protegem, apagam**
 * (verificado no banco em 2026-07-25):
 *
 *   colaboradores_prova.funcao_id ......... ON DELETE SET NULL
 *   meta_colaboradores_unidade.funcao_id .. ON DELETE CASCADE
 *   valores_funcao_prova.funcao_id ........ ON DELETE CASCADE
 *
 * Ou seja: excluir uma função ASSOCIADA não dá erro — ela **zera a função de todas as
 * alocações** e **apaga metas e valores de pagamento** de todas as provas, em silêncio.
 * A única barreira contra isso é este hook, no cliente. Não há rede no banco.
 */
describe("useFuncoesAssociadas", () => {
  beforeEach(() => {
    resetSupabaseMock();
    vazio();
  });

  it("pergunta às três tabelas que podem vincular uma função", async () => {
    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Se uma tabela nova passar a referenciar funcao_id e não entrar aqui, a exclusão
    // volta a ser liberada para funções em uso — sem nada acusar.
    const consultadas = supabaseMock.from.mock.calls.map((c) => c[0]);
    expect(consultadas.sort()).toEqual([...TABELAS].sort());
  });

  it("une os ids das três origens, sem repetir", async () => {
    setTableResult("valores_funcao_prova", { data: [{ funcao_id: "f1" }], error: null });
    setTableResult("colaboradores_prova", {
      data: [{ funcao_id: "f1" }, { funcao_id: "f2" }],
      error: null,
    });
    setTableResult("meta_colaboradores_unidade", { data: [{ funcao_id: "f3" }], error: null });

    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());
    await waitFor(() => expect(result.current.funcoesAssociadas.size).toBe(3));

    // f1 aparece em duas tabelas e conta uma vez só.
    expect([...result.current.funcoesAssociadas].sort()).toEqual(["f1", "f2", "f3"]);
    expect(result.current.isFuncaoAssociada("f2")).toBe(true);
    expect(result.current.isFuncaoAssociada("f-livre")).toBe(false);
  });

  it("ignora vínculo com funcao_id nulo", async () => {
    // `colaboradores_prova.funcao_id` é nullable — e fica nulo justamente quando uma
    // função é excluída (ON DELETE SET NULL). Um nulo não associa ninguém a nada.
    setTableResult("colaboradores_prova", {
      data: [{ funcao_id: null }, { funcao_id: "f1" }],
      error: null,
    });

    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect([...result.current.funcoesAssociadas]).toEqual(["f1"]);
  });

  it("⚠️ ATENÇÃO: isFuncaoAssociada responde FALSE enquanto carrega", async () => {
    // `query.data?.has(id) ?? false` — durante a carga, TODA função parece livre.
    //
    // Como as FKs apagam em cascata (ver o cabeçalho), um botão de excluir habilitado
    // nessa janela é destrutivo de verdade. O que segura hoje é a PÁGINA, não o hook:
    // `FuncoesColaboradores.tsx` só renderiza a tabela depois de `isLoadingAssociacoes`
    // virar false.
    //
    // Portanto: **quem reusar este hook precisa gatear pelo `isLoading` também.**
    // Confiar só em `isFuncaoAssociada` reabre a janela num lugar novo.
    setTableResult("valores_funcao_prova", { data: [{ funcao_id: "f1" }], error: null });

    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());

    // Primeiro render: já responde, e responde "não associada" para uma função que É.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFuncaoAssociada("f1")).toBe(false);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFuncaoAssociada("f1")).toBe(true);
  });

  it("devolve Set vazio — nunca undefined — antes de resolver", () => {
    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());

    expect(result.current.funcoesAssociadas).toBeInstanceOf(Set);
    expect(result.current.funcoesAssociadas.size).toBe(0);
  });

  it.each(TABELAS)("falha fechada quando %s dá erro", async (tabela) => {
    // Falhar por completo é o comportamento certo aqui: uma resposta PARCIAL diria
    // "não associada" para funções que estão em uso na tabela que falhou — e o botão
    // de excluir seria liberado sobre um cascade destrutivo.
    setTableResult(tabela, { data: null, error: erroPostgrest("42501", "sem permissão") });

    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());
    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.funcoesAssociadas.size).toBe(0);
    expect(buildersDaTabela(tabela).length).toBeGreaterThan(0);
  });
});
