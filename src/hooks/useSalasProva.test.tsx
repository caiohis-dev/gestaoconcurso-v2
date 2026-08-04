import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderHookWithProviders } from "@/test/utils";
import {
  resetSupabaseMock,
  setTableResult,
  setTableResultSequence,
  buildersDaTabela,
  builderQueChamou,
  erroPostgrest,
  supabaseMock,
} from "@/test/supabase-mock";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import { useSalasProva, useCapacidadeTemplateUnidades } from "@/hooks/useSalasProva";

/**
 * Salas de uma unidade. O que faz este hook merecer teste de verdade não é o CRUD, é a
 * **numeração automática** do `createMultiple`, que é lógica de negócio escondida numa
 * mutation:
 *
 *   número = andar × 100 + sequência   (andar 1, 3ª sala → 103)
 *
 * A sequência continua de onde parou **naquele andar**, e é calculada no cliente a partir
 * das salas existentes — não há `SEQUENCE` no banco.
 */
describe("useSalasProva", () => {
  const UNIDADE = "u-1";

  function sala(numero: number, over: Record<string, unknown> = {}) {
    return {
      id: `s-${numero}`,
      sala_fk_unidade: UNIDADE,
      sala_numero: numero,
      sala_descricao: null,
      sala_arcondicionado: null,
      sala_capacidade: 30,
      sala_andar: Math.floor(numero / 100),
      created_at: null,
      updated_at: null,
      created_by: null,
      ...over,
    };
  }

  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
  });

  /**
   * A sequência só entra depois da carga inicial (armadilha 1 do `testes.md`). No
   * `createMultiple` ela tem TRÊS entradas, porque a mutation consulta as salas
   * existentes antes de inserir: [existentes, insert, refetch].
   */
  async function carregarEDepois(sequencia: Parameters<typeof setTableResultSequence>[1]) {
    setTableResult("sala_prova", { data: [], error: null });
    const hook = renderHookWithProviders(() => useSalasProva(UNIDADE));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    setTableResultSequence("sala_prova", sequencia);
    return hook;
  }

  /** Devolve as linhas que o `insert` recebeu. */
  function linhasInseridas() {
    const builder = builderQueChamou("sala_prova", "insert");
    return (builder.insert as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as Array<Record<string, unknown>>;
  }

  describe("listagem", () => {
    it("lista as salas da unidade, em ordem de número", async () => {
      setTableResult("sala_prova", { data: [sala(101)], error: null });
      const { result } = renderHookWithProviders(() => useSalasProva(UNIDADE));

      expect(result.current.salas).toEqual([]);
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const builder = buildersDaTabela("sala_prova")[0];
      expect(builder.eq).toHaveBeenCalledWith("sala_fk_unidade", UNIDADE);
      expect(builder.order).toHaveBeenCalledWith("sala_numero");
    });

    it("sem unidade, não consulta nada", () => {
      renderHookWithProviders(() => useSalasProva(""));
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });

  /**
   * 🔵 **Reescrito em 2026-08-03**, quando o lote passou a receber uma FAIXA de andares.
   * A conta em si mudou de casa: mora em `lib/salas.ts` (`numerosDoLote`, função pura com
   * bateria própria). O que se mede AQUI é a ligação — que a mutation leia as salas
   * existentes, entregue os números certos ao `insert` e recuse antes de escrever.
   */
  describe("numeração automática do createMultiple", () => {
    it("no andar vazio começa em 1 — andar 1 vira 101", async () => {
      const { result } = await carregarEDepois([
        { data: [], error: null },
        { data: [sala(101)], error: null },
        { data: [sala(101)], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 1,
        sala_capacidade: 30,
        andar_de: 1,
        andar_ate: 1,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas()).toHaveLength(1);
      expect(linhasInseridas()[0]).toMatchObject({
        sala_numero: 101,
        sala_andar: 1,
        sala_capacidade: 30,
        sala_fk_unidade: UNIDADE,
        created_by: "user-teste-1",
      });
    });

    it("🔵 a faixa multiplica, e cada linha leva o SEU andar", async () => {
      // A asserção que importa não é a contagem (6), é o par número↔andar de cada linha:
      // gravar 6 salas todas com `sala_andar: 1` passaria por qualquer teste de tamanho.
      const { result } = await carregarEDepois([
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 2,
        sala_capacidade: 30,
        andar_de: 1,
        andar_ate: 3,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas().map((l) => [l.sala_numero, l.sala_andar])).toEqual([
        [101, 1],
        [102, 1],
        [201, 2],
        [202, 2],
        [301, 3],
        [302, 3],
      ]);
    });

    it("continua a sequência DAQUELE andar, ignorando os outros", async () => {
      // O andar 1 já tem 101 e 102; o andar 2 tem 201. Criar 2 salas no andar 1 tem de
      // dar 103 e 104 — o 201 não pode empurrar a contagem.
      const { result } = await carregarEDepois([
        { data: [sala(101), sala(102), sala(201)], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 2,
        sala_capacidade: 25,
        andar_de: 1,
        andar_ate: 1,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas().map((l) => l.sala_numero)).toEqual([103, 104]);
    });

    it("usa o MAIOR número do andar, não a contagem — buraco não é reaproveitado", async () => {
      // Se a sala 102 foi excluída, a próxima é 104, não 102. Reaproveitar número
      // confundiria quem já imprimiu a lista de salas.
      const { result } = await carregarEDepois([
        { data: [sala(101), sala(103)], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 1,
        sala_capacidade: 30,
        andar_de: 1,
        andar_ate: 1,
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(linhasInseridas().map((l) => l.sala_numero)).toEqual([104]);
    });

    it("🔴 andar 0 é RECUSADO — e o teste anterior afirmava o contrário", async () => {
      // ⚠️ Armadilha 8 em estado puro. Até 03/08 havia aqui um caso verde chamado "no
      // térreo (andar 0) a numeração é 1, 2, 3…", afirmando que o hook gravava
      // `sala_andar: 0`. O banco NUNCA aceitou isso: `chk_sala_andar_min` exige
      // `sala_andar IS NULL OR sala_andar >= 1`. O teste descrevia o que o código fazia,
      // não o que era correto — e o formulário só não deixava chegar lá por causa do
      // `min` nativo do input.
      const { result } = await carregarEDepois([
        { data: [], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 2,
        sala_capacidade: 30,
        andar_de: 0,
        andar_ate: 1,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao criar salas", variant: "destructive" }),
        ),
      );
      expect(() => builderQueChamou("sala_prova", "insert")).toThrow();
    });

    it("🔴 o estouro de 99 salas por andar recusa ANTES de inserir", async () => {
      // ⚠️ Este caso também está invertido de propósito. Ele se chamava "o esquema
      // comporta 99 salas por andar, e não avisa ao estourar" e afirmava que a próxima
      // sala depois da 199 era a **200** — o número da primeira do andar 2. Não era
      // teoria: colidia com o índice único, e o 23505 chegava traduzido como
      // "provavelmente outra pessoa criou salas ao mesmo tempo".
      const { result } = await carregarEDepois([
        { data: [sala(199)], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 1,
        sala_capacidade: 30,
        andar_de: 1,
        andar_ate: 1,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao criar salas",
            description: expect.stringContaining("andar 1"),
          }),
        ),
      );
      // Nenhuma linha escrita: a recusa acontece antes do insert.
      expect(() => builderQueChamou("sala_prova", "insert")).toThrow();
    });

    it("o aviso de sucesso traz os números criados", async () => {
      // "3 salas criadas" não diz onde elas foram parar quando a faixa tem vários andares.
      const { result } = await carregarEDepois([
        { data: [], error: null },
        { data: [sala(101), sala(102), sala(201), sala(202)], error: null },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 2,
        sala_capacidade: 30,
        andar_de: 1,
        andar_ate: 2,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Salas criadas",
            description: "4 salas criadas: 101–102, 201–202.",
          }),
        ),
      );
    });

    it("falha ao ler as salas existentes aborta antes de inserir", async () => {
      // Sem saber o que existe, inserir produziria número duplicado.
      const { result } = await carregarEDepois([
        { data: null, error: erroPostgrest("42501", "permission denied") },
        { data: [], error: null },
      ]);

      result.current.createMultiple({
        sala_fk_unidade: UNIDADE,
        quantidade: 1,
        sala_capacidade: 30,
        andar_de: 1,
        andar_ate: 1,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao criar salas", variant: "destructive" }),
        ),
      );
      expect(() => builderQueChamou("sala_prova", "insert")).toThrow();
    });
  });

  describe("atualizar e excluir", () => {
    it("atualiza pelo id", async () => {
      const { result } = await carregarEDepois([
        { data: sala(101, { sala_capacidade: 40 }), error: null },
        { data: [], error: null },
      ]);

      result.current.update({ id: "s-101", data: { sala_capacidade: 40 } });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Sala atualizada" }),
        ),
      );
      const builder = builderQueChamou("sala_prova", "update");
      expect(builder.update).toHaveBeenCalledWith({ sala_capacidade: 40 });
      expect(builder.eq).toHaveBeenCalledWith("id", "s-101");
    });

    it("exclui pelo id", async () => {
      const { result } = await carregarEDepois([
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.delete("s-101");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Sala excluída" }),
        ),
      );
      expect(builderQueChamou("sala_prova", "delete").eq).toHaveBeenCalledWith("id", "s-101");
    });

    it("excluir sala já distribuída mostra o erro do banco", async () => {
      const { result } = await carregarEDepois([
        { data: null, error: erroPostgrest("23503", "sala distribuída em prova") },
        { data: [], error: null },
      ]);

      result.current.delete("s-101");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao excluir sala",
            description: "sala distribuída em prova",
            variant: "destructive",
          }),
        ),
      );
    });
  });
});

/**
 * Capacidade do CADASTRO das unidades (2026-08-03), usada no seletor de
 * `/gerenciar-prova`.
 *
 * 🔴 O que estes casos guardam é a **fonte**: `sala_prova` (o template do catálogo), não
 * `salas_prova_distribuidas` (o snapshot de uma prova). A unidade que o seletor lista
 * ainda não está vinculada a prova nenhuma — pelo snapshot ela seria sempre zero, um
 * número plausível e sempre errado.
 */
describe("useCapacidadeTemplateUnidades", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
  });

  it("soma a capacidade das salas por unidade", async () => {
    setTableResult("sala_prova", {
      data: [
        { sala_fk_unidade: "u-1", sala_capacidade: 30 },
        { sala_fk_unidade: "u-1", sala_capacidade: 35 },
        { sala_fk_unidade: "u-2", sala_capacidade: 350 },
      ],
      error: null,
    });

    const { result } = renderHookWithProviders(() => useCapacidadeTemplateUnidades());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // As duas somas precisam ser DIFERENTES: com valores iguais, trocar a chave passaria.
    expect(result.current.capacidades).toEqual({ "u-1": 65, "u-2": 350 });
  });

  it("🔴 pergunta a `sala_prova` — o template —, não ao snapshot da prova", async () => {
    // Sabotar a tabela consultada é o que derruba este caso: o mock devolve por NOME de
    // tabela, então ler `salas_prova_distribuidas` traria o default vazio.
    setTableResult("sala_prova", {
      data: [{ sala_fk_unidade: "u-1", sala_capacidade: 30 }],
      error: null,
    });
    setTableResult("salas_prova_distribuidas", {
      data: [{ sala_fk_unidade: "u-1", sala_capacidade: 9999 }],
      error: null,
    });

    const { result } = renderHookWithProviders(() => useCapacidadeTemplateUnidades());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capacidades).toEqual({ "u-1": 30 });
    expect(supabaseMock.from).toHaveBeenCalledWith("sala_prova");
  });

  it("unidade sem sala simplesmente não aparece no mapa (quem lê decide o que é zero)", async () => {
    setTableResult("sala_prova", { data: [], error: null });

    const { result } = renderHookWithProviders(() => useCapacidadeTemplateUnidades());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capacidades).toEqual({});
  });

  it("⚠️ o objeto vazio é a MESMA referência entre renders", () => {
    // Não é preciosismo: `?? {}` devolveria objeto novo a cada render e armaria o laço
    // infinito que o `?? []` de `useSalasDistribuidas` armou em 03/08 para quem o pusesse
    // em deps de efeito. Aqui se mede a referência, que é o que o React compara.
    const { result, rerender } = renderHookWithProviders(() => useCapacidadeTemplateUnidades());

    const primeira = result.current.capacidades;
    rerender();
    expect(result.current.capacidades).toBe(primeira);
  });

  it("🔴 consulta que FALHOU é distinguível de 'nenhuma sala cadastrada'", async () => {
    // As duas chegam como `{}` — é o `error` que separa "não tem sala" de "não deu para
    // perguntar". Sem ele exposto, a tela diria "sem salas cadastradas" em TODAS as
    // unidades diante de um 42501, com a mesma cara de informação correta.
    setTableResult("sala_prova", {
      data: null,
      error: erroPostgrest("42501", "permission denied for table sala_prova"),
    });

    const { result } = renderHookWithProviders(() => useCapacidadeTemplateUnidades());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capacidades).toEqual({});
    expect(result.current.error).toBeTruthy();
  });

  it("⭐ CONTROLE POSITIVO: catálogo vazio de verdade NÃO acusa erro", async () => {
    // O par do caso acima. Sem ele, `error` poderia estar sempre preenchido e o teste
    // anterior passaria sem provar nada.
    setTableResult("sala_prova", { data: [], error: null });

    const { result } = renderHookWithProviders(() => useCapacidadeTemplateUnidades());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capacidades).toEqual({});
    expect(result.current.error).toBeNull();
  });
});
