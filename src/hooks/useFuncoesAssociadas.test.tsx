import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setRpcResult,
  resetSupabaseMock,
  erroPostgrest,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useFuncoesAssociadas } from "@/hooks/useFuncoesAssociadas";

/** As três que a RPC consulta — do lado de DENTRO do banco. O hook não deve tocá-las. */
const TABELAS = ["valores_funcao_prova", "colaboradores_prova", "meta_colaboradores_unidade"];

/**
 * Este hook responde a UMA pergunta: "esta função já é usada por alguma prova?" — e a
 * resposta decide se o botão de excluir fica habilitado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔵 CORRIGIDO EM 2026-09-10 — e a correção vale mais que o resto do arquivo.
 * ─────────────────────────────────────────────────────────────────────────────
 * Este cabeçalho afirmava, desde 2026-07-25:
 *
 *   "as FKs de `funcao_id` não protegem, apagam:
 *      colaboradores_prova ......... ON DELETE SET NULL
 *      meta_colaboradores_unidade .. ON DELETE CASCADE
 *      valores_funcao_prova ........ ON DELETE CASCADE
 *    Excluir uma função ASSOCIADA não dá erro — zera a função de todas as alocações e
 *    apaga metas e valores, em silêncio. A única barreira contra isso é este hook, no
 *    cliente. NÃO HÁ REDE NO BANCO."
 *
 * **Era verdade quando foi escrito e virou falso UM DIA DEPOIS**, na migration
 * `20260726190000_funcoes_colaboradores_on_delete_restrict.sql`. Medido em 2026-09-10:
 * as **três FKs são `RESTRICT`**. O banco recusa, nomeando
 * `colaboradores_prova_funcao_id_fkey`, e `useFuncoesColaboradores` traduz o `23503`.
 *
 * 🔴 **Este aviso envelhecido cobrou o preço que o `CLAUDE.md` prevê.** Em 2026-09-10 ele
 * foi lido de boa-fé e virou um item de backlog afirmando que truncar a consulta
 * "libera exclusão de função em uso" e que era "bug de correção" — falso nos dois pontos.
 * O item só foi corrigido porque alguém foi medir as FKs antes de executá-lo.
 *
 * ⚠️ **O que este hook é hoje: CONVENIÊNCIA, não barreira.** Se ele falhar ou vier
 * incompleto, o pior caso é um botão habilitado que devia estar cinza — o usuário clica e
 * recebe a recusa do banco. **Não há perda de dado por este caminho.**
 */
describe("useFuncoesAssociadas", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setRpcResult("funcoes_em_uso", { data: [], error: null });
  });

  it("🔴 pergunta à RPC, e NÃO às três tabelas", async () => {
    // O ponto do tema (2026-09-10). Antes, o hook baixava as três tabelas inteiras —
    // 42.778 bytes em 3 requisições, medidos — para montar o Set no cliente. Pior: o
    // PostgREST trunca em `max_rows` SEM ERRO, então passar de 1000 linhas em qualquer
    // uma faria o Set nascer incompleto. Agregar no banco é o que fecha isso; nenhum
    // conserto no cliente alcança.
    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(supabaseMock.rpc).toHaveBeenCalledWith("funcoes_em_uso");
    const consultadas = supabaseMock.from.mock.calls.map((c) => c[0]);
    for (const tabela of TABELAS) {
      expect(consultadas).not.toContain(tabela);
    }
  });

  it("⭐ CONTROLE POSITIVO: monta o Set com o que a RPC devolveu", async () => {
    setRpcResult("funcoes_em_uso", { data: ["f1", "f2", "f3"], error: null });

    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());
    await waitFor(() => expect(result.current.funcoesAssociadas.size).toBe(3));

    expect([...result.current.funcoesAssociadas].sort()).toEqual(["f1", "f2", "f3"]);
    expect(result.current.isFuncaoAssociada("f2")).toBe(true);
    expect(result.current.isFuncaoAssociada("f-livre")).toBe(false);
  });

  it("não repete id, mesmo se a RPC devolver duplicata", async () => {
    // O `UNION` da RPC já deduplica; o `Set` aqui é cinto e suspensório, e custa nada.
    setRpcResult("funcoes_em_uso", { data: ["f1", "f1", "f2"], error: null });

    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect([...result.current.funcoesAssociadas].sort()).toEqual(["f1", "f2"]);
  });

  it("⚠️ ATENÇÃO: isFuncaoAssociada responde FALSE enquanto carrega", async () => {
    // `query.data?.has(id) ?? false` — durante a carga, TODA função parece livre.
    //
    // 🔵 A CONSEQUÊNCIA MUDOU, o aviso não. Quando este caso foi escrito, as FKs apagavam
    // em cascata e um botão habilitado nessa janela era destrutivo. Hoje as FKs são
    // RESTRICT: o pior caso é o usuário clicar e o banco recusar. Continua sendo UX ruim,
    // e o que segura é a PÁGINA, não o hook — `FuncoesColaboradores.tsx` só renderiza a
    // tabela depois de `isLoadingAssociacoes` virar false.
    //
    // Portanto: **quem reusar este hook precisa gatear pelo `isLoading` também.**
    setRpcResult("funcoes_em_uso", { data: ["f1"], error: null });

    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());

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

  it("falha fechada quando a RPC dá erro", async () => {
    // Resposta parcial diria "não associada" para função em uso, e o botão de excluir
    // seria liberado. Falhar por completo é o comportamento certo — a página mostra o
    // estado de carga e não renderiza a tabela.
    setRpcResult("funcoes_em_uso", { data: null, error: erroPostgrest("42501", "sem permissão") });

    const { result } = renderHookWithProviders(() => useFuncoesAssociadas());
    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.funcoesAssociadas.size).toBe(0);
  });
});
