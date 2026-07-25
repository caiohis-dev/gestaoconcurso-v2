import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  setTableResult,
  setTableResultSequence,
  resetSupabaseMock,
  buildersDaTabela,
  builderQueChamou,
  erroPostgrest,
  supabaseMock,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { useFuncoesColaboradores } from "@/hooks/useFuncoesColaboradores";

const TABELA = "funcoes_colaboradores";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chamadasDe = (tabela: string, metodo: string): any[][] =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildersDaTabela(tabela).flatMap((b) => ((b as any)[metodo]?.mock.calls ?? []));

async function carregarEDepois(sequencia: Parameters<typeof setTableResultSequence>[1]) {
  setTableResult(TABELA, { data: [], error: null });
  const hook = renderHookWithProviders(() => useFuncoesColaboradores());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  setTableResultSequence(TABELA, sequencia);
  return hook;
}

/**
 * O cadastro de funções é a tabela de que DUAS telas dependem em silêncio:
 * `useCoordenadoresProva` casa por UUID hardcoded, e `useFiscaisSala` casa pelo NOME,
 * por substring. Mexer aqui pode esvaziar aquelas telas sem erro nenhum — ver o ponto
 * frágil 1 do contrato do módulo.
 */
describe("useFuncoesColaboradores", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    setTableResult(TABELA, { data: [], error: null });
  });

  it("lista em ordem alfabética de nome", async () => {
    const { result } = renderHookWithProviders(() => useFuncoesColaboradores());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(chamadasDe(TABELA, "order")[0]).toEqual(["cargo_nome", { ascending: true }]);
    expect(result.current.funcoes).toEqual([]);
  });

  describe("criação", () => {
    it("insere a função", async () => {
      const { result } = await carregarEDepois([
        { data: { id: "f-nova" }, error: null },
        { data: [], error: null },
      ]);

      result.current.create({ cargo_nome: "Aplicador", cargo_cbo: "1234567" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Sucesso" })),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (builderQueChamou(TABELA, "insert").insert as any).mock.calls[0][0];
      expect(payload).toEqual({ cargo_nome: "Aplicador", cargo_cbo: "1234567" });
    });

    it("não carimba created_by — a coluna existe e fica nula", async () => {
      // Mesmo padrão do `addSala` de useSalasDistribuidas, e diferente de useProvas /
      // useProvaUnidades / useOcorrencias, que leem `auth.getUser()`. Registrado para
      // que a inconsistência seja escolha, não descuido.
      const { result } = await carregarEDepois([
        { data: { id: "f-nova" }, error: null },
        { data: [], error: null },
      ]);

      result.current.create({ cargo_nome: "Aplicador" });
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Sucesso" })),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (builderQueChamou(TABELA, "insert").insert as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("created_by");
      expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    });

    it("traduz nome repetido para mensagem amigável", async () => {
      // `cargo_nome` tem índice único (funcoes_colaboradores_cargo_nome_key).
      const { result } = await carregarEDepois([
        {
          data: null,
          error: erroPostgrest(
            "23505",
            'duplicate key value violates unique constraint "funcoes_colaboradores_cargo_nome_key"',
          ),
        },
        { data: [], error: null },
      ]);

      result.current.create({ cargo_nome: "Fiscal de Sala" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao cadastrar",
            description: "Já existe uma função com este nome",
            variant: "destructive",
          }),
        ),
      );
    });

    it("⚠️ ATENÇÃO: a tradução casa a MENSAGEM, não o código 23505", async () => {
      // O hook faz `error.message.includes('duplicate key')`. O `useEditais`, para o
      // mesmo problema, casa **também** `error.code === "23505"` — é a versão robusta.
      //
      // Consequência: se a mensagem do Postgres/PostgREST mudar de forma (ou vier
      // localizada), este hook para de traduzir e joga o texto cru do banco na cara do
      // usuário — sem nada quebrar em teste ou build. Este teste fixa o comportamento
      // atual; se um dia alinharem os dois hooks, ele quebra e é esse o sinal.
      const { result } = await carregarEDepois([
        { data: null, error: erroPostgrest("23505", "chave duplicada viola restrição") },
        { data: [], error: null },
      ]);

      result.current.create({ cargo_nome: "Fiscal de Sala" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "chave duplicada viola restrição" }),
        ),
      );
    });
  });

  describe("edição", () => {
    it("manda os campos alterados e filtra pelo id", async () => {
      const { result } = await carregarEDepois([
        { data: { id: "f1" }, error: null },
        { data: [], error: null },
      ]);

      result.current.update({ id: "f1", cargo_nome: "Aplicador Sênior", cargo_cbo: "7654321" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Sucesso" })),
      );

      const builder = builderQueChamou(TABELA, "update");
      // O `id` é desestruturado para fora do payload: vai no filtro, não no SET.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builder.update as any).mock.calls[0][0]).toEqual({
        cargo_nome: "Aplicador Sênior",
        cargo_cbo: "7654321",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builder.eq as any).mock.calls[0]).toEqual(["id", "f1"]);
    });

    it("⚠️ ATENÇÃO: o erro do trigger de função de sistema chega CRU ao usuário", async () => {
      // O banco tem o trigger `check_system_funcao_changes`, que recusa renomear as 7
      // funções básicas com a mensagem "Não é permitido alterar o nome de funções
      // básicas do sistema." (descoberto na bateria de constraints, em 2026-07-25).
      //
      // O hook não traduz nada além de "duplicate key", então essa frase do banco vai
      // direto para o toast. Aqui ela até é legível em português — mas é sorte, não
      // desenho: qualquer outro erro de trigger apareceria como texto técnico.
      const { result } = await carregarEDepois([
        {
          data: null,
          error: erroPostgrest("P0001", "Não é permitido alterar o nome de funções básicas do sistema."),
        },
        { data: [], error: null },
      ]);

      result.current.update({ id: "f-sistema", cargo_nome: "Outro Nome" });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao atualizar",
            description: "Não é permitido alterar o nome de funções básicas do sistema.",
            variant: "destructive",
          }),
        ),
      );
    });
  });

  describe("exclusão", () => {
    it("exclui pelo id", async () => {
      const { result } = renderHookWithProviders(() => useFuncoesColaboradores());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.delete("f1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Sucesso" })),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((builderQueChamou(TABELA, "delete").eq as any).mock.calls[0]).toEqual(["id", "f1"]);
    });

    it("avisa com toast destrutivo quando o banco recusa a exclusão", async () => {
      const { result } = renderHookWithProviders(() => useFuncoesColaboradores());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      setTableResult(TABELA, { data: null, error: erroPostgrest("P0001", "função do sistema") });
      result.current.delete("f1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao excluir", variant: "destructive" }),
        ),
      );
    });
  });
});
