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

import {
  useSalasDistribuidas,
  useSalasDistribuidasCapacidade,
  useFiscaisSala,
  avisoFiscalDeSala,
} from "@/hooks/useSalasDistribuidas";

const TABELA = "salas_prova_distribuidas";
const PROVA = "prova-1";
const UNIDADE = "unid-1";

const sala = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  prova_id: PROVA,
  sala_fk_unidade: UNIDADE,
  sala_numero: 101,
  sala_descricao: "Sala 1",
  sala_capacidade: 30,
  sala_andar: 1,
  sala_fiscal_1: null,
  sala_fiscal_2: null,
  created_at: null,
  updated_at: null,
  created_by: null,
  ...extra,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chamadasDe = (tabela: string, metodo: string): any[][] =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildersDaTabela(tabela).flatMap((b) => ((b as any)[metodo]?.mock.calls ?? []));

/** Armadilha 1 do testes.md: a listagem consome a primeira entrada da sequência. */
async function carregarEDepois(sequencia: Parameters<typeof setTableResultSequence>[1]) {
  setTableResult(TABELA, { data: [], error: null });
  const hook = renderHookWithProviders(() => useSalasDistribuidas(PROVA));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  setTableResultSequence(TABELA, sequencia);
  return hook;
}

/**
 * `salas_prova_distribuidas` é o SNAPSHOT da prova — a cópia editável das salas, onde
 * vivem os fiscais, as capacidades ajustadas e as salas extras que não existem no
 * template (`sala_prova`). É o dado que a remoção de unidade apaga, e que não é
 * recuperável a partir do template.
 */
describe("useSalasDistribuidas", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    setTableResult(TABELA, { data: [], error: null });
    setTableResult("prova_unidades", { data: [], error: null });
    setTableResult("colaboradores_prova", { data: [], error: null });
  });

  describe("listagem", () => {
    it("não consulta nada sem provaId", async () => {
      const { result } = renderHookWithProviders(() => useSalasDistribuidas(""));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it("ordena por andar e depois por número da sala", async () => {
      const { result } = renderHookWithProviders(() => useSalasDistribuidas(PROVA));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Dois `.order` encadeados: a tela lista andar a andar, e dentro do andar em
      // ordem de sala. Inverter isso embaralha o roteiro do dia da prova.
      expect(chamadasDe(TABELA, "order")).toEqual([["sala_andar"], ["sala_numero"]]);
      expect(chamadasDe(TABELA, "eq")).toEqual([["prova_id", PROVA]]);
    });

    it("restringe à unidade quando ela é informada", async () => {
      const { result } = renderHookWithProviders(() => useSalasDistribuidas(PROVA, UNIDADE));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(chamadasDe(TABELA, "eq")).toEqual([
        ["prova_id", PROVA],
        ["sala_fk_unidade", UNIDADE],
      ]);
    });
  });

  describe("salvar alterações em lote", () => {
    it("dispara um UPDATE por sala, cada um filtrado pelo próprio id", async () => {
      const { result } = await carregarEDepois([
        { data: null, error: null },
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.updateSalas([
        { id: "s1", sala_capacidade: 40, sala_fiscal_1: "cp-1" },
        { id: "s2", sala_capacidade: 25 },
      ]);

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Alterações salvas" }),
        ),
      );

      const updates = chamadasDe(TABELA, "update");
      expect(updates).toHaveLength(2);
      expect(updates[0][0]).toMatchObject({ sala_capacidade: 40, sala_fiscal_1: "cp-1" });

      const ids = chamadasDe(TABELA, "eq")
        .filter((c) => c[0] === "id")
        .map((c) => c[1]);
      expect(ids).toEqual(["s1", "s2"]);
    });

    it("ignora em silêncio qualquer sala sem id", async () => {
      // `if (!sala.id) return null` — não é erro, não é aviso: a sala simplesmente não
      // é gravada. Se um formulário passar a mandar linha nova por aqui, ela some sem
      // ninguém perceber. Para sala nova o caminho é `addSala`.
      const { result } = await carregarEDepois([
        { data: null, error: null },
        { data: [], error: null },
      ]);

      result.current.updateSalas([{ sala_capacidade: 40 }, { id: "s1", sala_capacidade: 25 }]);

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Alterações salvas" }),
        ),
      );

      expect(chamadasDe(TABELA, "update")).toHaveLength(1);
    });

    it("⚠️ ATENÇÃO: o lote não é transacional — uma falha no meio deixa o resto salvo", async () => {
      // Os UPDATEs saem em paralelo (`Promise.all`), um por sala. Se um falhar, os
      // outros JÁ FORAM. O usuário vê "Erro ao salvar" e conclui que nada foi gravado
      // — mas parte da edição está no banco.
      //
      // É a mesma classe do que acontece em useProvaUnidades, e a saída real também
      // seria a mesma: uma RPC que faça tudo numa transação.
      const { result } = await carregarEDepois([
        { data: null, error: null }, // s1 grava
        { data: null, error: erroPostgrest("23514", "capacidade inválida") }, // s2 falha
        { data: [], error: null },
      ]);

      result.current.updateSalas([
        { id: "s1", sala_capacidade: 40 },
        { id: "s2", sala_capacidade: -1 },
      ]);

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao salvar", variant: "destructive" }),
        ),
      );

      // A prova de que o primeiro foi gravado assim mesmo: os dois UPDATEs saíram.
      expect(chamadasDe(TABELA, "update")).toHaveLength(2);
    });
  });

  describe("sala extra", () => {
    it("insere a sala e confirma com toast", async () => {
      const { result } = await carregarEDepois([
        { data: sala("s-nova"), error: null },
        { data: [], error: null },
      ]);

      result.current.addSala({
        prova_id: PROVA,
        sala_fk_unidade: UNIDADE,
        sala_numero: 999,
        sala_descricao: "Sala extra",
        sala_andar: 1,
        sala_capacidade: 20,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Sala adicionada" }),
        ),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (builderQueChamou(TABELA, "insert").insert as any).mock.calls[0][0];
      expect(payload).toMatchObject({ sala_numero: 999, sala_capacidade: 20 });
    });

    it("⚠️ ATENÇÃO: NÃO carimba created_by — diferente dos outros hooks do módulo", async () => {
      // `useProvas`, `useProvaUnidades` e `useOcorrencias` leem `auth.getUser()` e
      // gravam a autoria. Este não: a sala extra nasce com `created_by` nulo.
      //
      // Não quebra nada hoje (a coluna é nullable), mas é inconsistência real: quem
      // olhar o snapshot não sabe quem acrescentou a sala à mão. Se a autoria passar a
      // importar, é aqui que falta.
      const { result } = await carregarEDepois([
        { data: sala("s-nova"), error: null },
        { data: [], error: null },
      ]);

      result.current.addSala({
        prova_id: PROVA,
        sala_fk_unidade: UNIDADE,
        sala_numero: 999,
        sala_descricao: null,
        sala_andar: null,
        sala_capacidade: 20,
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Sala adicionada" }),
        ),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (builderQueChamou(TABELA, "insert").insert as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("created_by");
      expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    });
  });
});

describe("useSalasDistribuidasCapacidade", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableResult(TABELA, { data: [], error: null });
  });

  it("soma a capacidade por unidade", async () => {
    setTableResult(TABELA, {
      data: [
        { sala_fk_unidade: "u1", sala_capacidade: 30 },
        { sala_fk_unidade: "u1", sala_capacidade: 25 },
        { sala_fk_unidade: "u2", sala_capacidade: 40 },
      ],
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      useSalasDistribuidasCapacidade(PROVA, ["u1", "u2"]),
    );
    await waitFor(() => expect(result.current.data).toBeTruthy());

    expect(result.current.data).toEqual({ u1: 55, u2: 40 });
  });

  it("✅ CONTRASTE: lista vazia de unidades NÃO consulta — o oposto do useOcorrencias", async () => {
    // Aqui a lista vazia é tratada como "nada a perguntar", em dois lugares: o
    // `enabled` exige `unidadeIds.length > 0`, e a queryFn ainda devolve `{}` antes
    // de montar consulta.
    //
    // Vale como referência porque `useOcorrencias` faz o CONTRÁRIO com a mesma
    // situação — lá, lista vazia cai no ramo "sem restrição" e devolve a prova
    // inteira (defeito registrado no backlog). Mesma entrada, decisões opostas no
    // mesmo módulo: ao mexer em qualquer um dos dois, alinhe-os.
    const { result } = renderHookWithProviders(() => useSalasDistribuidasCapacidade(PROVA, []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("não consulta sem provaId", async () => {
    const { result } = renderHookWithProviders(() => useSalasDistribuidasCapacidade("", ["u1"]));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});

describe("useFiscaisSala", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableResult("prova_unidades", { data: [], error: null });
    setTableResult("colaboradores_prova", { data: [], error: null });
  });

  const alocado = (id: string, nome: string, cargo: string) => ({
    id,
    colaborador_id: `colab-${id}`,
    funcao_id: `f-${id}`,
    colaboradores: { colab_nome_completo: nome },
    funcoes_colaboradores: { cargo_nome: cargo },
  });

  it("não busca alocação quando a prova não tem unidade", async () => {
    setTableResult("prova_unidades", { data: [], error: null });

    const { result } = renderHookWithProviders(() => useFiscaisSala(PROVA));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(buildersDaTabela("colaboradores_prova")).toHaveLength(0);
    expect(result.current.data).toEqual([]);
  });

  it("busca os alocados das unidades da prova", async () => {
    setTableResult("prova_unidades", { data: [{ id: "pu-1" }, { id: "pu-2" }], error: null });
    setTableResult("colaboradores_prova", {
      data: [alocado("cp-1", "Maria", "Fiscal de Sala")],
      error: null,
    });

    const { result } = renderHookWithProviders(() => useFiscaisSala(PROVA));
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(chamadasDe("colaboradores_prova", "in")[0]).toEqual([
      "prova_unidade_id",
      ["pu-1", "pu-2"],
    ]);
    expect(result.current.data?.[0]).toEqual({
      colaborador_prova_id: "cp-1",
      colaborador_nome: "Maria",
    });
  });

  it("⚠️ ATENÇÃO: o fiscal é identificado pelo NOME da função, por substring", async () => {
    // O filtro é `nome.includes("fiscal") && nome.includes("sala")`, em minúsculas e
    // feito em JS — não há id nem flag no banco marcando "esta função é fiscal de
    // sala". Consequências que este teste fixa:
    //
    //   * variações de grafia passam ("FISCAL DE SALA", "fiscal volante de sala");
    //   * uma função legítima com outro nome NÃO passa ("Aplicador", "Fiscal de
    //     Corredor") — e some da lista em silêncio;
    //   * renomear a função no cadastro quebra a tela sem erro nenhum.
    //
    // É a mesma fragilidade dos UUIDs de coordenação em useCoordenadoresProva: papel
    // identificado por dado editável. Ao mexer em funções, lembre-se deste acoplamento.
    setTableResult("prova_unidades", { data: [{ id: "pu-1" }], error: null });
    setTableResult("colaboradores_prova", {
      data: [
        alocado("cp-1", "Maria", "FISCAL DE SALA"),
        alocado("cp-2", "João", "fiscal volante de sala"),
        alocado("cp-3", "Ana", "Fiscal de Corredor"),
        alocado("cp-4", "Bruno", "Coordenador de Unidade"),
      ],
      error: null,
    });

    const { result } = renderHookWithProviders(() => useFiscaisSala(PROVA));
    await waitFor(() => expect(result.current.data).toBeTruthy());

    expect(result.current.data?.map((f) => f.colaborador_nome)).toEqual(["Maria", "João"]);
  });

  it("usa 'Sem nome' quando o join não trouxe o colaborador", async () => {
    setTableResult("prova_unidades", { data: [{ id: "pu-1" }], error: null });
    setTableResult("colaboradores_prova", {
      data: [{ ...alocado("cp-1", "", "Fiscal de Sala"), colaboradores: null }],
      error: null,
    });

    const { result } = renderHookWithProviders(() => useFiscaisSala(PROVA));
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(result.current.data?.[0].colaborador_nome).toBe("Sem nome");
  });
});

describe("avisoFiscalDeSala", () => {
  it("nomeia a pessoa e a sala, e diz o que vai acontecer", () => {
    expect(avisoFiscalDeSala("Maria Silva", [201])).toBe(
      "Maria Silva está como fiscal da sala 201. Removê-lo desta unidade vai retirá-lo dessa sala automaticamente.",
    );
  });

  it("usa plural quando há mais de uma sala", () => {
    // O banco NÃO impede a mesma pessoa de ser fiscal de duas salas — só a UI de
    // distribuição evita. Confiar nessa UI aqui repetiria o erro que este aviso corrige.
    const aviso = avisoFiscalDeSala("Maria", [201, 305]);
    expect(aviso).toContain("das salas 201, 305");
    expect(aviso).toContain("dessas salas");
  });

  it("devolve null quando a pessoa não é fiscal de sala nenhuma", () => {
    // Nesse caso a confirmação segue com o texto padrão — inventar um aviso vazio seria
    // ruído, e ruído em diálogo de confirmação treina a pessoa a ignorar avisos.
    expect(avisoFiscalDeSala("Maria", [])).toBeNull();
  });

  it("cai num sujeito genérico se o nome não vier", () => {
    expect(avisoFiscalDeSala(undefined, [201])).toContain("Este colaborador está como fiscal");
    expect(avisoFiscalDeSala("   ", [201])).toContain("Este colaborador está como fiscal");
  });
});
