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
  setRpcResult,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import {
  useProvaUnidades,
  mensagemErroDesvinculoUnidade,
} from "@/hooks/useProvaUnidades";

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

  /**
   * ⚠️ Havia aqui 6 testes, dois deles marcados `⚠️ ATENÇÃO`, que fixavam a sequência de
   * 3 passos soltos e AFIRMAVAM o estado corrompido: "o vínculo fica sem as salas se a
   * cópia falhar" e "as salas são apagadas ANTES do vínculo". Eles caíram de propósito
   * em 2026-07-26, quando as duas operações viraram RPC transacional (migration
   * 20260726230000). Não eram testes errados — eram a testemunha de um defeito que agora
   * não existe mais, e por isso viraram o oposto: garantem que a transação seja usada.
   *
   * A atomicidade em si NÃO é testável aqui — o mock não tem transação. Ela foi
   * verificada contra o banco real, sabotando a cópia com um CHECK NOT VALID e
   * confirmando que o vínculo não sobra (registrado no backlog e no doc do módulo).
   * O que esta suíte guarda é que o cliente CHAMA a RPC em vez de encadear os passos.
   */
  describe("adicionar unidade — uma RPC, não três passos", () => {
    it("chama a RPC com prova e unidade, e não toca nas tabelas direto", async () => {
      setRpcResult("vincular_unidade_a_prova", { data: "pu-nova", error: null });

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      supabaseMock.from.mockClear();

      result.current.addUnidade("unid-1");

      await waitFor(() =>
        expect(supabaseMock.rpc).toHaveBeenCalledWith("vincular_unidade_a_prova", {
          p_prova_id: PROVA,
          p_unidade_id: "unid-1",
        }),
      );
      // O ponto do conserto: nenhuma ESCRITA solta sobrou no cliente. A leitura de
      // `prova_unidades` continua acontecendo — é o refetch da listagem depois da
      // invalidação, e mirar em `from` puro acusaria isso como se fosse regressão.
      const insercoes = buildersDaTabela("prova_unidades")
        .concat(buildersDaTabela("salas_prova_distribuidas"))
        .filter((b) => (b.insert as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0);
      expect(insercoes).toHaveLength(0);
      expect(supabaseMock.from.mock.calls.map((c) => c[0])).not.toContain("sala_prova");
    });

    it("avisa quando a RPC recusa", async () => {
      setRpcResult("vincular_unidade_a_prova", {
        data: null,
        error: erroPostgrest("P0001", "Apenas administradores podem vincular unidades a uma prova."),
      });

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.addUnidade("unid-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ variant: "destructive" }),
        ),
      );
    });
  });

  describe("remover unidade — uma RPC, não três passos", () => {
    it("chama a RPC só com o id do vínculo", async () => {
      setRpcResult("desvincular_unidade_da_prova", { data: null, error: null });

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      supabaseMock.from.mockClear();

      result.current.removeUnidade("pu-1");

      await waitFor(() =>
        expect(supabaseMock.rpc).toHaveBeenCalledWith("desvincular_unidade_da_prova", {
          p_prova_unidade_id: "pu-1",
        }),
      );
      // `prova_id` NÃO vai como parâmetro: a RPC o deriva da própria linha, para o
      // cliente não conseguir mandar um que não corresponde ao vínculo e apagar salas
      // distribuídas de outra prova.
      const params = supabaseMock.rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(params).not.toHaveProperty("p_prova_id");
      const exclusoes = buildersDaTabela("salas_prova_distribuidas").filter(
        (b) => (b.delete as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0,
      );
      expect(exclusoes).toHaveLength(0);
    });

    it("avisa quando a RPC recusa", async () => {
      setRpcResult("desvincular_unidade_da_prova", {
        data: null,
        error: erroPostgrest("P0001", "Vínculo de unidade não encontrado."),
      });

      const { result } = renderHookWithProviders(() => useProvaUnidades(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      result.current.removeUnidade("pu-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ variant: "destructive" }),
        ),
      );
    });
  });
});

describe("mensagemErroDesvinculoUnidade", () => {
  // Este obstáculo é INDIRETO e nasceu em 2026-07-26: `colaboradores_prova` cascateia de
  // `prova_unidades`, então o RESTRICT de `coordenadores_prova` faz a cascata esbarrar.
  // A pessoa está desvinculando uma UNIDADE e o erro fala de coordenação — sem tradução,
  // não há como ligar uma coisa à outra.
  const MSG_COORD =
    'update or delete on table "colaboradores_prova" violates foreign key constraint "coordenadores_prova_colaborador_prova_id_fkey" on table "coordenadores_prova"';

  it("aponta a tela de acesso dos coordenadores", () => {
    expect(mensagemErroDesvinculoUnidade({ code: "23503", message: MSG_COORD })).toContain(
      "Acesso dos Coordenadores",
    );
  });

  it("aponta a tela de Alocação de Candidatos quando quem barra é a alocação (2026-08-04)", () => {
    // Segundo dependente indireto: desvincular apaga as salas do snapshot, e a FK
    // RESTRICT de `candidatos_alocacao.sala_id` barra o DELETE. Sem este ramo, o erro
    // cairia no genérico e mandaria procurar "registros vinculados" sem dizer onde.
    const msg =
      'update or delete on table "salas_prova_distribuidas" violates foreign key constraint "candidatos_alocacao_sala_prova_fkey" on table "candidatos_alocacao"';
    expect(mensagemErroDesvinculoUnidade({ code: "23503", message: msg })).toContain(
      "Alocação de Candidatos",
    );
  });

  it("cai numa frase genérica para outra FK", () => {
    const outra =
      'update or delete on table "prova_unidades" violates foreign key constraint "tabela_nova_fkey" on table "tabela_nova"';
    expect(mensagemErroDesvinculoUnidade({ code: "23503", message: outra })).toContain(
      "registros vinculados",
    );
  });

  it("não mexe em erro que não é de FK", () => {
    expect(mensagemErroDesvinculoUnidade({ code: "42501", message: "permission denied" })).toBe(
      "permission denied",
    );
  });
});
