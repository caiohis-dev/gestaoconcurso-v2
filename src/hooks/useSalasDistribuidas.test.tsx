import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setTableResultSequence,
  setRpcResult,
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
  mensagemErroSalvarSalas,
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

  /**
   * 🔴 **Este bloco mudou de objeto em 2026-08-03, e os testes que caíram eram a
   * pergunta.** Ele afirmava três coisas como se fossem o contrato: um UPDATE por sala,
   * sala sem `id` ignorada em silêncio, e "o lote não é transacional". As três descreviam
   * um defeito com voz de regra — e a segunda e a terceira eram, elas mesmas, avisos de
   * perda de dado. Hoje o lote é uma chamada só à RPC `salvar_salas_distribuidas`.
   *
   * ⚠️ **O que estes testes NÃO alcançam:** a suíte mocka o Supabase, então nada aqui
   * prova que a troca de números passa, que a unicidade foi adiada ou que o rollback
   * acontece. Isso é banco, e se verifica em `docs/bateria-salas-renumeracao.sql`. O que
   * se prova daqui é o que é do cliente: o lote sai INTEIRO numa chamada só (é o que dá
   * ao banco a chance de checar no fim) e a recusa chega legível.
   */
  describe("salvar alterações em lote", () => {
    it("manda o lote inteiro numa ÚNICA chamada, com os campos editáveis", async () => {
      const { result } = await carregarEDepois([{ data: [], error: null }]);

      result.current.updateSalas([
        { id: "s1", sala_numero: 102, sala_capacidade: 40, sala_fiscal_1: "cp-1" },
        { id: "s2", sala_numero: 101, sala_capacidade: 25 },
      ]);

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Alterações salvas" }),
        ),
      );

      // Nenhum UPDATE direto na tabela: o caminho agora é a RPC.
      expect(chamadasDe(TABELA, "update")).toHaveLength(0);
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);

      const [nome, args] = supabaseMock.rpc.mock.calls[0];
      expect(nome).toBe("salvar_salas_distribuidas");
      expect(args.p_salas).toHaveLength(2);
      expect(args.p_salas[0]).toMatchObject({
        id: "s1",
        sala_numero: 102,
        sala_capacidade: 40,
        sala_fiscal_1: "cp-1",
      });
    });

    it("⭐ a TROCA de números viaja junta — as duas salas na mesma chamada", async () => {
      // Este é o caso que motivou a mudança: 101 ↔ 102 era impossível, porque cada UPDATE
      // saía sozinho e o índice único é checado linha a linha. A parte que o cliente
      // garante é esta — as duas linhas vão juntas, e o banco decide vendo o estado final.
      const { result } = await carregarEDepois([{ data: [], error: null }]);

      result.current.updateSalas([
        { id: "s1", sala_numero: 102 },
        { id: "s2", sala_numero: 101 },
      ]);

      await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledTimes(1));

      const enviadas = supabaseMock.rpc.mock.calls[0][1].p_salas as { sala_numero: number }[];
      const numeros = enviadas.map((s) => s.sala_numero);
      expect(numeros).toEqual([102, 101]);
    });

    it("✅ sala sem id NÃO some mais no cliente — vai para o banco recusar o lote", async () => {
      // Era `if (!sala.id) return null`: sumia sem erro e sem aviso, e a pessoa via
      // "Alterações salvas". Agora ela viaja com `id: null` e a RPC recusa o lote inteiro
      // comparando pedidas × encontradas — a recusa é do banco, não da tela.
      const { result } = await carregarEDepois([{ data: [], error: null }]);

      result.current.updateSalas([{ sala_capacidade: 40 }, { id: "s1", sala_capacidade: 25 }]);

      await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledTimes(1));

      const enviadas = supabaseMock.rpc.mock.calls[0][1].p_salas;
      expect(enviadas).toHaveLength(2);
      expect(enviadas[0].id).toBeNull();
    });

    it("🔴 número repetido chega TRADUZIDO, nomeando a sala", async () => {
      // O que chegava antes: `duplicate key value violates unique constraint
      // "salas_prova_distribuidas_prova_unidade_numero_key"`.
      setRpcResult("salvar_salas_distribuidas", {
        data: null,
        error: {
          code: "23505",
          message: `duplicate key value violates unique constraint "${"salas_prova_distribuidas_prova_unidade_numero_key"}"`,
          details:
            "Key (prova_id, sala_fk_unidade, sala_numero)=(prova-1, unid-1, 203) already exists.",
          hint: "",
        },
      });
      const { result } = await carregarEDepois([{ data: [], error: null }]);

      result.current.updateSalas([{ id: "s1", sala_numero: 203 }]);

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao salvar",
            description: expect.stringContaining("número 203"),
            variant: "destructive",
          }),
        ),
      );
      // O jargão não pode sobrar em lugar nenhum da mensagem.
      const { description } = toastMock.mock.calls.at(-1)![0];
      expect(description).not.toMatch(/duplicate key|unique constraint/);
    });

    it("⭐ CONTROLE POSITIVO: a mensagem da RPC passa adiante intacta", async () => {
      // A tradução vale só para o 23505 daquela chave. As mensagens que a própria RPC
      // escreve já estão em português e dizem o que fazer — engoli-las repetiria o erro
      // que `mensagemErroRemocaoValor` existe para não deixar acontecer de novo.
      setRpcResult("salvar_salas_distribuidas", {
        data: null,
        error: erroPostgrest(
          "P0001",
          "Nenhuma alteração foi salva: 1 de 2 salas não foram encontradas. Recarregue a página e tente de novo.",
        ),
      });
      const { result } = await carregarEDepois([{ data: [], error: null }]);

      result.current.updateSalas([{ id: "sumida", sala_capacidade: 40 }]);

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            description: expect.stringContaining("não foram encontradas"),
          }),
        ),
      );
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

/**
 * A tradução da recusa por número repetido. Função pura de propósito: é a parte que
 * precisa de teste, e renderizar a página para conferir uma frase seria desproporcional
 * — mesma decisão de `avisoFiscalDeSala`.
 */
describe("mensagemErroSalvarSalas", () => {
  const duplicado = (details: string) =>
    Object.assign(
      new Error(
        'duplicate key value violates unique constraint "salas_prova_distribuidas_prova_unidade_numero_key"',
      ),
      { code: "23505", details },
    );

  it("nomeia o número da sala que já existe", () => {
    const msg = mensagemErroSalvarSalas(
      duplicado("Key (prova_id, sala_fk_unidade, sala_numero)=(p-1, u-1, 203) already exists."),
    );

    expect(msg).toContain("número 203");
    expect(msg).toContain("Nenhuma alteração foi salva");
    // O jargão do Postgres não pode vazar para a tela.
    expect(msg).not.toMatch(/duplicate key|unique constraint/);
  });

  it("⭐ sem `details` legível, avisa SEM inventar número", () => {
    // Ler texto de erro é frágil por natureza. Falhar por omissão é a única forma
    // aceitável: uma mensagem que aponta a sala errada é pior que uma genérica.
    const msg = mensagemErroSalvarSalas(duplicado("formato que ninguém previu"));

    expect(msg).toContain("mesmo número");
    expect(msg).not.toMatch(/\d/);
  });

  it("reconhece a duplicata pelo nome da chave mesmo sem `code`", () => {
    // Nem todo caminho entrega o `code` — o erro pode chegar como Error puro vindo do
    // RAISE da própria transação.
    const semCode = new Error(
      'duplicate key value violates unique constraint "salas_prova_distribuidas_prova_unidade_numero_key"',
    );

    expect(mensagemErroSalvarSalas(semCode)).toContain("mesmo número");
  });

  it("🔴 CONTROLE POSITIVO: qualquer outra mensagem passa adiante INTACTA", () => {
    // A regra da casa é repassar o que o banco explicou; a tradução acima é a exceção
    // estreita, para uma mensagem que não explica nada a quem renumera salas.
    const daRpc = new Error(
      "Nenhuma alteração foi salva: 1 de 2 salas não foram encontradas. Recarregue a página e tente de novo.",
    );

    expect(mensagemErroSalvarSalas(daRpc)).toBe(daRpc.message);
    expect(mensagemErroSalvarSalas(new Error("Apenas administradores podem alterar as salas distribuídas."))).toBe(
      "Apenas administradores podem alterar as salas distribuídas.",
    );
  });

  it("cai num texto próprio só quando não há mensagem nenhuma", () => {
    expect(mensagemErroSalvarSalas(new Error(""))).toBe("Erro ao salvar");
  });
});
