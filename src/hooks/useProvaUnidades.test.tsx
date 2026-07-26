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

import { useProvaUnidades } from "@/hooks/useProvaUnidades";

const PROVA = "prova-1";
const UNIDADE = "unid-1";

/** Sala do TEMPLATE (`sala_prova`), que é o que a adição copia. */
const salaTemplate = (numero: number) => ({
  id: `sala-${numero}`,
  sala_fk_unidade: UNIDADE,
  sala_numero: numero,
  sala_descricao: `Sala ${numero}`,
  sala_capacidade: 30,
  sala_andar: 1,
  created_at: "2026-01-01T00:00:00Z",
  created_by: "alguem",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chamadasDe = (tabela: string, metodo: string): any[][] =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildersDaTabela(tabela).flatMap((b) => ((b as any)[metodo]?.mock.calls ?? []));

/**
 * Este hook faz o vínculo prova↔unidade — e, junto, a **materialização das salas**.
 *
 * A distinção que organiza tudo aqui (e que o doc do módulo chama de erro mais fácil
 * de cometer): `sala_prova` é o **template reutilizável** da unidade;
 * `salas_prova_distribuidas` é o **snapshot daquela prova**. Adicionar a unidade
 * COPIA o template para o snapshot; removê-la APAGA o snapshot.
 *
 * As duas operações têm três passos e **não são transacionais** — o supabase-js manda
 * uma requisição por passo. Vários testes existem só para fixar essa fragilidade por
 * escrito, porque ela não aparece no caminho feliz.
 */
describe("useProvaUnidades", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    setTableResult("prova_unidades", { data: [], error: null });
    setTableResult("sala_prova", { data: [], error: null });
    setTableResult("salas_prova_distribuidas", { data: null, error: null });
  });

  describe("listagem", () => {
    it("não consulta nada sem provaId (enabled: !!provaId)", async () => {
      const { result } = renderHookWithProviders(() => useProvaUnidades(""));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.from).not.toHaveBeenCalled();
      expect(result.current.provaUnidades).toEqual([]);
    });

    it("filtra pela prova e ordena por created_at", async () => {
      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(chamadasDe("prova_unidades", "eq")[0]).toEqual(["prova_id", PROVA]);
      expect(chamadasDe("prova_unidades", "order")[0]).toEqual(["created_at"]);
    });
  });

  describe("adicionar unidade — copia o template para o snapshot", () => {
    it("vincula a unidade e copia as salas do template", async () => {
      setTableResultSequence("prova_unidades", [
        { data: [], error: null }, // listagem no mount
        { data: { id: "pu-1" }, error: null }, // insert do vínculo
        { data: [], error: null }, // refetch depois da invalidação
      ]);
      setTableResult("sala_prova", { data: [salaTemplate(1), salaTemplate(2)], error: null });

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.addUnidade(UNIDADE);
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unidade adicionada" }),
        ),
      );

      // 1. o vínculo, com autoria lida do Auth
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vinculo = (builderQueChamou("prova_unidades", "insert").insert as any).mock.calls[0][0];
      expect(vinculo).toEqual({
        prova_id: PROVA,
        unidade_id: UNIDADE,
        created_by: "user-teste-1",
      });

      // 2. as salas do template daquela unidade
      expect(chamadasDe("sala_prova", "eq")[0]).toEqual(["sala_fk_unidade", UNIDADE]);

      // 3. a cópia para o snapshot, em UM insert com as duas salas
      const copia = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        builderQueChamou("salas_prova_distribuidas", "insert").insert as any
      ).mock.calls[0][0];
      expect(copia).toHaveLength(2);
      expect(copia[0]).toEqual({
        prova_id: PROVA,
        sala_fk_unidade: UNIDADE,
        sala_numero: 1,
        sala_descricao: "Sala 1",
        sala_capacidade: 30,
        sala_andar: 1,
        created_by: "user-teste-1",
      });
      // O `id` e o `created_at` do template NÃO são copiados: o snapshot tem vida
      // própria e pode ser editado sem afetar a unidade.
      expect(copia[0]).not.toHaveProperty("id");
    });

    it("não tenta inserir snapshot quando a unidade não tem sala cadastrada", async () => {
      setTableResultSequence("prova_unidades", [
        { data: [], error: null },
        { data: { id: "pu-1" }, error: null },
        { data: [], error: null },
      ]);
      setTableResult("sala_prova", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.addUnidade(UNIDADE);
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unidade adicionada" }),
        ),
      );

      // Um insert vazio seria erro do PostgREST, não no-op.
      expect(buildersDaTabela("salas_prova_distribuidas")).toHaveLength(0);
    });

    it("⚠️ ATENÇÃO: a operação não é transacional — o vínculo fica sem as salas se a cópia falhar", async () => {
      // Comportamento REAL, e é o que precisa estar escrito em algum lugar.
      //
      // São três requisições independentes. Se a terceira (a cópia das salas) falhar,
      // a PRIMEIRA já foi gravada: a unidade aparece vinculada à prova, mas sem sala
      // nenhuma. O toast de erro aparece, mas nada desfaz o vínculo.
      //
      // Não marcamos como DEFEITO porque o estado é recuperável pela UI (remover e
      // adicionar a unidade de novo refaz a cópia) e uma transação de verdade exigiria
      // uma RPC. Mas quem for refatorar precisa saber: o toast de erro NÃO significa
      // "nada aconteceu".
      setTableResultSequence("prova_unidades", [
        { data: [], error: null },
        { data: { id: "pu-1" }, error: null },
        { data: [], error: null },
      ]);
      setTableResult("sala_prova", { data: [salaTemplate(1)], error: null });
      setTableResult("salas_prova_distribuidas", {
        data: null,
        error: erroPostgrest("23514", "violates check constraint"),
      });

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.addUnidade(UNIDADE);
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao adicionar unidade", variant: "destructive" }),
        ),
      );

      // A prova de que o vínculo ficou: o insert do passo 1 aconteceu e não houve
      // nenhum delete para desfazê-lo.
      expect(builderQueChamou("prova_unidades", "insert")).toBeTruthy();
      expect(chamadasDe("prova_unidades", "delete")).toHaveLength(0);
    });

    it("para no primeiro passo quando o vínculo em si falha", async () => {
      setTableResultSequence("prova_unidades", [
        { data: [], error: null },
        { data: null, error: erroPostgrest("23505", "já vinculada") },
      ]);

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.addUnidade(UNIDADE);
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao adicionar unidade" }),
        ),
      );

      // Não chegou a ler o template nem a escrever snapshot.
      expect(buildersDaTabela("sala_prova")).toHaveLength(0);
      expect(buildersDaTabela("salas_prova_distribuidas")).toHaveLength(0);
    });
  });

  describe("remover unidade — apaga o snapshot antes do vínculo", () => {
    it("descobre a unidade pelo vínculo e apaga as salas daquela prova", async () => {
      setTableResultSequence("prova_unidades", [
        { data: [], error: null }, // listagem
        { data: { unidade_id: UNIDADE }, error: null }, // leitura do vínculo
        { data: null, error: null }, // delete do vínculo
        { data: [], error: null }, // refetch
      ]);

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.removeUnidade("pu-1");
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unidade removida" }),
        ),
      );

      // O delete do snapshot é dobrado: prova E unidade. Sem o `prova_id`, apagaria
      // as salas daquela unidade em TODAS as provas.
      const eqDoDelete = chamadasDe("salas_prova_distribuidas", "eq");
      expect(eqDoDelete).toEqual([
        ["prova_id", PROVA],
        ["sala_fk_unidade", UNIDADE],
      ]);
    });

    it("⚠️ ATENÇÃO: as salas são apagadas ANTES do vínculo — falhar no fim perde o snapshot", async () => {
      // A ordem dos três passos é: (1) ler o vínculo, (2) apagar as salas do snapshot,
      // (3) apagar o vínculo. Se o passo 3 falhar, o 2 já aconteceu: a unidade
      // continua vinculada à prova, agora com ZERO salas.
      //
      // Por que isso é pior que o caso da adição: o snapshot pode ter sido EDITADO —
      // salas extras adicionadas à mão pelo SalaExtraDialog, capacidades ajustadas — e
      // nada disso está no template. Reverter recriando pelo template não devolve o
      // que foi customizado.
      setTableResultSequence("prova_unidades", [
        { data: [], error: null },
        { data: { unidade_id: UNIDADE }, error: null },
        { data: null, error: erroPostgrest("42501", "sem permissão") }, // delete do vínculo falha
        { data: [], error: null },
      ]);

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.removeUnidade("pu-1");
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao remover unidade", variant: "destructive" }),
        ),
      );

      // O delete das salas foi emitido mesmo assim — é isso que o teste fixa.
      expect(chamadasDe("salas_prova_distribuidas", "delete")).toHaveLength(1);
    });

    it("não apaga sala nenhuma se não conseguir ler o vínculo", async () => {
      // Falha fechada, e é o comportamento certo: sem saber a unidade, um delete
      // filtrado só por `prova_id` varreria o snapshot inteiro da prova.
      setTableResultSequence("prova_unidades", [
        { data: [], error: null },
        { data: null, error: erroPostgrest("PGRST116", "não encontrado") },
      ]);

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.removeUnidade("pu-1");
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao remover unidade" }),
        ),
      );

      expect(buildersDaTabela("salas_prova_distribuidas")).toHaveLength(0);
    });
  });
});
