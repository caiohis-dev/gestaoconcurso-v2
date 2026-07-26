import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  resetSupabaseMock,
  erroPostgrest,
  buildersDaTabela,
  builderQueChamou,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

// ⚠️ Este hook usa `sonner`, NÃO o `@/hooks/use-toast` do shadcn. O projeto tem os
// dois sistemas montados lado a lado no App.tsx: use-toast em 25 arquivos, sonner em
// 3 (este, useMetaColaboradoresUnidade e Perfil.tsx). Mockar só um dos dois deixa
// metade das submissões sem verificação de feedback.
const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  useValoresFuncaoProva,
  mensagemErroRemocaoValor,
} from "@/hooks/useValoresFuncaoProva";

const PROVA_ID = "prova-1";
const VALOR_EXISTENTE = {
  id: "vfp-1",
  prova_id: PROVA_ID,
  funcao_id: "func-1",
  valor_pagamento: 150,
  created_at: "2026-07-01T00:00:00Z",
};


/**
 * `valores_funcao_prova` guarda quanto se paga por função, POR PROVA.
 *
 * Regra que atravessa este hook e a alocação: o valor é COPIADO para
 * `colaboradores_prova.valor_pagamento` no momento em que o colaborador é alocado.
 * Mudar o valor aqui NÃO atualiza quem já está alocado. Este hook não tem como
 * saber disso — mas quem mexer nele precisa saber.
 */
describe("useValoresFuncaoProva", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  describe("listagem", () => {
    it("não consulta sem provaId", async () => {
      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(""));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it("filtra pela prova e ordena pela ordem de cadastro", async () => {
      setTableResult("valores_funcao_prova", { data: [VALOR_EXISTENTE], error: null });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      await waitFor(() => expect(result.current.valoresFuncao).toHaveLength(1));

      const b = buildersDaTabela("valores_funcao_prova")[0];
      expect(b.eq).toHaveBeenCalledWith("prova_id", PROVA_ID);
      expect(b.order).toHaveBeenCalledWith("created_at", { ascending: true });
    });
  });

  /**
   * ⚠️ O "upsert" deste hook NÃO é upsert de banco: ele decide entre UPDATE e INSERT
   * procurando a função na LISTA JÁ CARREGADA em memória. Isso tem consequência real
   * — se o cache estiver velho (outra aba, outro usuário), o ramo escolhido é o
   * errado, e o INSERT indevido depende de constraint no banco para não duplicar.
   * Contraste com useMetaColaboradoresUnidade, que usa upsert com onConflict.
   */
  describe("upsertValor — a decisão vem do cache, não do banco", () => {
    it("faz UPDATE quando a função já tem valor na lista carregada", async () => {
      setTableResult("valores_funcao_prova", { data: [VALOR_EXISTENTE], error: null });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      await waitFor(() => expect(result.current.valoresFuncao).toHaveLength(1));

      result.current.upsertValor({ funcaoId: "func-1", valorPagamento: 200 });

      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Valor atualizado com sucesso!"));

      const mutacao = builderQueChamou("valores_funcao_prova", "update");
      expect(mutacao.update).toHaveBeenCalledWith({ valor_pagamento: 200 });
      // Filtra pelo id da LINHA encontrada no cache, não pela funcao_id.
      expect(mutacao.eq).toHaveBeenCalledWith("id", "vfp-1");
      expect(mutacao.insert).not.toHaveBeenCalled();
    });

    it("faz INSERT quando a função ainda não tem valor", async () => {
      setTableResult("valores_funcao_prova", { data: [VALOR_EXISTENTE], error: null });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      await waitFor(() => expect(result.current.valoresFuncao).toHaveLength(1));

      result.current.upsertValor({ funcaoId: "func-NOVA", valorPagamento: 90 });

      await waitFor(() => expect(toastMock.success).toHaveBeenCalled());

      const mutacao = builderQueChamou("valores_funcao_prova", "insert");
      expect(mutacao.insert).toHaveBeenCalledWith({
        prova_id: PROVA_ID,
        funcao_id: "func-NOVA",
        valor_pagamento: 90,
      });
      expect(mutacao.update).not.toHaveBeenCalled();
    });

    it("com a lista vazia, sempre INSERT", async () => {
      setTableResult("valores_funcao_prova", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.upsertValor({ funcaoId: "func-1", valorPagamento: 10 });

      await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
      expect(builderQueChamou("valores_funcao_prova", "insert").insert).toHaveBeenCalled();
    });

    it("aceita valor zero (função sem pagamento é caso legítimo)", async () => {
      setTableResult("valores_funcao_prova", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.upsertValor({ funcaoId: "func-1", valorPagamento: 0 });

      await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
      expect(builderQueChamou("valores_funcao_prova", "insert").insert).toHaveBeenCalledWith(
        expect.objectContaining({ valor_pagamento: 0 }),
      );
    });

    it("avisa erro pelo sonner, sem detalhar a causa", async () => {
      // O onError deste hook ignora o erro recebido e usa mensagem fixa — ao
      // contrário do useEditais, que traduz por código. Registrado como está.
      setTableResult("valores_funcao_prova", {
        data: null,
        error: erroPostgrest("42501", "permission denied"),
      });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      result.current.upsertValor({ funcaoId: "func-1", valorPagamento: 10 });

      await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Erro ao atualizar valor"));
      expect(toastMock.success).not.toHaveBeenCalled();
    });
  });

  describe("deleteValor", () => {
    it("remove pelo id e avisa", async () => {
      setTableResult("valores_funcao_prova", { data: [VALOR_EXISTENTE], error: null });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      await waitFor(() => expect(result.current.valoresFuncao).toHaveLength(1));

      result.current.deleteValor("vfp-1");

      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Valor removido com sucesso!"));
      expect(builderQueChamou("valores_funcao_prova", "delete").eq).toHaveBeenCalledWith("id", "vfp-1");
    });

    it("avisa erro pelo sonner", async () => {
      setTableResult("valores_funcao_prova", {
        data: null,
        error: erroPostgrest("23503", "violates foreign key"),
      });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      result.current.deleteValor("vfp-1");

      await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("violates foreign key"));
    });

    it("mostra a recusa do trigger de meta, em vez de engolir num genérico", async () => {
      setTableResult("valores_funcao_prova", {
        data: null,
        error: erroPostgrest("P0001", MSG_TRIGGER_META),
      });

      const { result } = renderHookWithProviders(() => useValoresFuncaoProva(PROVA_ID));
      result.current.deleteValor("vfp-1");

      // A mensagem diz O QUE FAZER ("zere as metas antes"). Trocá-la por "Erro ao remover
      // valor" deixa a pessoa sem saída: a função sumiu do diálogo de metas, então ela
      // não tem como adivinhar que o obstáculo é uma meta.
      await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(MSG_TRIGGER_META));
      expect(toastMock.error).not.toHaveBeenCalledWith("Erro ao remover valor");
    });
  });
});

/**
 * Mensagem REAL do trigger `check_valor_sem_meta`, capturada do banco local em
 * 2026-07-26 (`BEGIN; DELETE …; ROLLBACK;` num valor cuja função tinha 7 metas > 0).
 */
const MSG_TRIGGER_META =
  "Ainda há metas de colaboradores definidas para esta função nesta prova. Zere as metas antes de remover o valor.";

describe("mensagemErroRemocaoValor", () => {
  it("passa adiante a mensagem do banco", () => {
    expect(mensagemErroRemocaoValor({ message: MSG_TRIGGER_META })).toBe(MSG_TRIGGER_META);
  });

  it("cai no genérico quando não veio mensagem nenhuma", () => {
    expect(mensagemErroRemocaoValor({})).toBe("Erro ao remover valor");
  });

  it("cai no genérico quando a mensagem é só espaço em branco", () => {
    expect(mensagemErroRemocaoValor({ message: "   " })).toBe("Erro ao remover valor");
  });
});
