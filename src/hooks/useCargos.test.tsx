/**
 * Bateria dos hooks de CARGOS.
 *
 * O que esta bateria guarda, e por que cada caso está aqui:
 *
 *  - **A assimetria dos dois upserts.** `criarCargo` usa `ignoreDuplicates: true` e
 *    `salvarApelidos` usa o padrão (`merge-duplicates`). Não é inconsistência: medido
 *    contra o banco real, um upsert com `merge` em `cargos` **RENOMEIA o cargo existente**
 *    quando o usuário digita outra grafia — criar viraria renomear, em silêncio, para
 *    milhares de inscritos. Em `cargo_apelidos`, sobrescrever é justamente o desejado.
 *    Se alguém "uniformizar" as duas chamadas, os testes daqui caem.
 *  - **As strings de `onConflict`.** São o que faz o banco casar com o índice certo. Uma
 *    string errada não dá erro de compilação e só aparece como dado duplicado.
 *  - **`isLoading` distinguível de lista vazia.** O padrão de defeito mais repetido deste
 *    repo (3 ocorrências em 26/07). Aqui a consequência seria o usuário criar duplicata do
 *    cargo que já existe, porque a tela mostrou o catálogo como vazio enquanto carregava.
 *
 * Ler `my_rules/estrutura/transversais/testes.md` (as 7 armadilhas) antes de estender.
 * Contrato da feature: `my_rules/estrutura/modulos/candidatos/cargos.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setTableResultSequence,
  resetSupabaseMock,
  erroPostgrest,
  builderQueChamou,
  buildersDaTabela,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import {
  useCargos,
  useCargoApelidos,
  useCriarCargo,
  useSalvarApelidos,
  mensagemErroCargo,
  type Cargo,
} from "@/hooks/useCargos";

const ID_DOCENTE = "aaaaaaaa-0000-0000-0000-000000000001";
const ID_ARTE = "aaaaaaaa-0000-0000-0000-000000000002";

const cargo = (id: string, nome: string): Cargo => ({
  id,
  nome,
  nome_chave: nome.trim().toLowerCase(),
  ativo: true,
  created_at: "2026-07-27T00:00:00Z",
  updated_at: "2026-07-27T00:00:00Z",
});

beforeEach(() => {
  resetSupabaseMock();
  toastMock.mockClear();
});

describe("useCargos", () => {
  it("lista o catálogo ordenado por nome", async () => {
    setTableResult("cargos", {
      data: [cargo(ID_ARTE, "ARTE"), cargo(ID_DOCENTE, "DOCENTE II")],
      error: null,
    });
    const { result } = renderHookWithProviders(() => useCargos());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cargos.map((c) => c.nome)).toEqual(["ARTE", "DOCENTE II"]);

    const builder = builderQueChamou("cargos", "select");
    expect(builder.order).toHaveBeenCalledWith("nome", { ascending: true });
  });

  it("⚠️ isLoading é distinguível de catálogo vazio", async () => {
    // O defeito que este teste impede: a tela do passo 3 tratar "carregando" como "não há
    // cargos", mostrar tudo como não-associado e o usuário criar duplicata do que existe.
    setTableResult("cargos", { data: [], error: null });
    const { result } = renderHookWithProviders(() => useCargos());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.cargos).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cargos).toEqual([]);
  });

  it("NÃO filtra por ativo — cargo inativo continua listado", async () => {
    // Filtrar aqui esconderia o cargo de inscritos já gravados. A coluna `ativo` existe
    // para uma futura tela de gestão (etapa 7) e não tem consumidor hoje.
    setTableResult("cargos", {
      data: [{ ...cargo(ID_ARTE, "ARTE"), ativo: false }],
      error: null,
    });
    const { result } = renderHookWithProviders(() => useCargos());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cargos).toHaveLength(1);
    expect(builderQueChamou("cargos", "select").eq).not.toHaveBeenCalledWith("ativo", true);
  });

  it("erro do banco chega ao consumidor", async () => {
    setTableResult("cargos", {
      data: null,
      error: erroPostgrest("42501", "permission denied for table cargos"),
    });
    const { result } = renderHookWithProviders(() => useCargos());

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.cargos).toEqual([]);
  });
});

describe("useCargoApelidos", () => {
  it("devolve o mapa texto_chave → cargo_id, pronto para o pré-preenchimento", async () => {
    setTableResult("cargo_apelidos", {
      data: [
        { texto_origem: "DOCENTE I ¿ HISTÓRIA", texto_chave: "docente i ¿ história", cargo_id: ID_DOCENTE },
        { texto_origem: "ARTE", texto_chave: "arte", cargo_id: ID_ARTE },
      ],
      error: null,
    });
    const { result } = renderHookWithProviders(() => useCargoApelidos());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.apelidos.get("docente i ¿ história")).toBe(ID_DOCENTE);
    expect(result.current.apelidos.get("arte")).toBe(ID_ARTE);
  });

  it("⭐ a chave do mapa casa com a normalização de cargosDaPlanilha", async () => {
    // Se as duas divergirem, o cargo aparece como não-associado mesmo já tendo sido
    // resolvido numa importação anterior — e o usuário refaz trabalho sem entender por quê.
    // `cargosDaPlanilha` normaliza com `.trim().toLowerCase()`; o banco, com lower(btrim()).
    setTableResult("cargo_apelidos", {
      data: [{ texto_origem: "  DOCENTE II  ", texto_chave: "docente ii", cargo_id: ID_DOCENTE }],
      error: null,
    });
    const { result } = renderHookWithProviders(() => useCargoApelidos());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.apelidos.get("  DOCENTE II  ".trim().toLowerCase())).toBe(ID_DOCENTE);
  });

  it("⚠️ isLoading é distinguível de 'nenhum apelido guardado'", async () => {
    setTableResult("cargo_apelidos", { data: [], error: null });
    const { result } = renderHookWithProviders(() => useCargoApelidos());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.apelidos.size).toBe(0);
  });
});

describe("useCriarCargo", () => {
  it("⭐ usa ignoreDuplicates — criar NÃO pode renomear o cargo existente", async () => {
    // Medido contra o banco real em 2026-07-27: com `merge-duplicates`, criar "docente ii"
    // quando existe "DOCENTE II" faz o ON CONFLICT DO UPDATE trocar o nome da linha, e o
    // catálogo inteiro passa a exibir a grafia nova. É a asserção mais importante do
    // arquivo — se alguém trocar para `false`, o efeito é invisível na tela de criação e
    // só aparece depois, como cargo renomeado.
    setTableResult("cargos", { data: [cargo(ID_DOCENTE, "DOCENTE II")], error: null });
    const { result } = renderHookWithProviders(() => useCriarCargo());

    await act(async () => {
      await result.current.criarCargo("DOCENTE II");
    });

    expect(builderQueChamou("cargos", "upsert").upsert).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "DOCENTE II" }),
      { onConflict: "nome_chave", ignoreDuplicates: true },
    );
  });

  it("devolve o cargo recém-criado quando o nome é inédito", async () => {
    setTableResult("cargos", { data: [cargo(ID_ARTE, "ARTE")], error: null });
    const { result } = renderHookWithProviders(() => useCriarCargo());

    let criado: Cargo | undefined;
    await act(async () => {
      criado = await result.current.criarCargo("ARTE");
    });

    expect(criado?.id).toBe(ID_ARTE);
    expect(criado?.nome).toBe("ARTE");
  });

  it("⭐ nome que já existe devolve o id EXISTENTE, sem erro (D10)", async () => {
    // Dois caminhos chegam aqui: o usuário digita um nome que já está no catálogo sem ver,
    // ou dois admins importam ao mesmo tempo e ambos tentam criar. Nos dois casos a
    // intenção é "quero ESTE cargo" — devolver 'duplicate key' trataria intenção certa
    // como erro. O upsert com DO NOTHING volta `[]`; daí a busca pelo dono do nome.
    setTableResultSequence("cargos", [
      { data: [], error: null }, // o upsert não inseriu: já existia
      { data: cargo(ID_DOCENTE, "DOCENTE II"), error: null }, // a busca pelo nome_chave
    ]);
    const { result } = renderHookWithProviders(() => useCriarCargo());

    let obtido: Cargo | undefined;
    await act(async () => {
      obtido = await result.current.criarCargo("docente ii");
    });

    expect(obtido?.id).toBe(ID_DOCENTE);
    // E o nome devolvido é o CANÔNICO já cadastrado, não o que o usuário acabou de digitar.
    expect(obtido?.nome).toBe("DOCENTE II");
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("busca o existente pela chave normalizada", async () => {
    setTableResultSequence("cargos", [
      { data: [], error: null },
      { data: cargo(ID_DOCENTE, "DOCENTE II"), error: null },
    ]);
    const { result } = renderHookWithProviders(() => useCriarCargo());

    await act(async () => {
      await result.current.criarCargo("  Docente II  ");
    });

    const busca = buildersDaTabela("cargos").find(
      (b) => (b.eq as ReturnType<typeof vi.fn>).mock.calls.length > 0,
    );
    expect(busca?.eq).toHaveBeenCalledWith("nome_chave", "docente ii");
  });

  it("tira espaços das pontas antes de gravar", async () => {
    setTableResult("cargos", { data: [cargo(ID_ARTE, "ARTE")], error: null });
    const { result } = renderHookWithProviders(() => useCriarCargo());

    await act(async () => {
      await result.current.criarCargo("   ARTE   ");
    });

    expect(builderQueChamou("cargos", "upsert").upsert).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "ARTE" }),
      expect.anything(),
    );
  });

  it("carimba created_by com o usuário da sessão", async () => {
    setTableResult("cargos", { data: [cargo(ID_ARTE, "ARTE")], error: null });
    const { result } = renderHookWithProviders(() => useCriarCargo());

    await act(async () => {
      await result.current.criarCargo("ARTE");
    });

    expect(builderQueChamou("cargos", "upsert").upsert).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: "user-teste-1" }),
      expect.anything(),
    );
  });

  it("invalida ['cargos'] — senão o Select não mostra o recém-criado", async () => {
    setTableResult("cargos", { data: [cargo(ID_ARTE, "ARTE")], error: null });
    const { result } = renderHookWithProviders(() => useCriarCargo());

    const antes = supabaseMock.from.mock.calls.length;
    await act(async () => {
      await result.current.criarCargo("ARTE");
    });

    await waitFor(() => expect(supabaseMock.from.mock.calls.length).toBeGreaterThan(antes));
  });

  it("erro do banco chega à UI com a MENSAGEM DO BANCO, não com texto genérico", async () => {
    // Regra que este repo já teve de aprender duas vezes: mensagem de banco passa adiante.
    setTableResult("cargos", {
      data: null,
      error: erroPostgrest("42501", "new row violates row-level security policy"),
    });
    const { result } = renderHookWithProviders(() => useCriarCargo());

    await act(async () => {
      await result.current.criarCargo("ARTE").catch(() => undefined);
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringMatching(/administrador/i) }),
    );
  });

  it("acusa em vez de devolver undefined quando não cria nem acha", async () => {
    // Estado que não deveria existir (o upsert não inseriu, logo havia conflito). Falhar
    // com mensagem é melhor do que devolver undefined e quebrar a tela mais adiante.
    setTableResultSequence("cargos", [
      { data: [], error: null },
      { data: null, error: null },
    ]);
    const { result } = renderHookWithProviders(() => useCriarCargo());

    await expect(
      act(async () => {
        await result.current.criarCargo("FANTASMA");
      }),
    ).rejects.toThrow(/FANTASMA/);
  });
});

describe("useSalvarApelidos", () => {
  it("⭐ usa merge-duplicates — reassociar uma grafia ATUALIZA, não duplica", async () => {
    // A assimetria deliberada com `criarCargo`: lá sobrescrever apagaria o nome canônico;
    // aqui sobrescrever é o desejado, porque a decisão NOVA do usuário vence a antiga.
    setTableResult("cargo_apelidos", { data: null, error: null });
    const { result } = renderHookWithProviders(() => useSalvarApelidos());

    await act(async () => {
      await result.current.salvarApelidos([
        { texto_origem: "DOCENTE I ¿ HISTÓRIA", cargo_id: ID_DOCENTE },
      ]);
    });

    const chamada = builderQueChamou("cargo_apelidos", "upsert").upsert;
    expect(chamada).toHaveBeenCalledWith(expect.any(Array), { onConflict: "texto_chave" });
    // Sem `ignoreDuplicates: true` — é o que permite a atualização.
    expect(chamada).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  it("manda todos os pares num lote só", async () => {
    setTableResult("cargo_apelidos", { data: null, error: null });
    const { result } = renderHookWithProviders(() => useSalvarApelidos());

    await act(async () => {
      await result.current.salvarApelidos([
        { texto_origem: "DOCENTE II", cargo_id: ID_DOCENTE },
        { texto_origem: "ARTE", cargo_id: ID_ARTE },
      ]);
    });

    const linhas = builderQueChamou("cargo_apelidos", "upsert").upsert.mock.calls[0][0];
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ texto_origem: "DOCENTE II", cargo_id: ID_DOCENTE });
    expect(linhas[1]).toMatchObject({ texto_origem: "ARTE", cargo_id: ID_ARTE });
  });

  it("preserva o texto de origem como veio, só tirando espaço das pontas", async () => {
    // O '¿' NÃO pode ser limpo aqui: é justamente ele que precisa casar com a planilha
    // na próxima importação.
    setTableResult("cargo_apelidos", { data: null, error: null });
    const { result } = renderHookWithProviders(() => useSalvarApelidos());

    await act(async () => {
      await result.current.salvarApelidos([
        { texto_origem: "  DOCENTE I ¿ HISTÓRIA  ", cargo_id: ID_DOCENTE },
      ]);
    });

    const linhas = builderQueChamou("cargo_apelidos", "upsert").upsert.mock.calls[0][0];
    expect(linhas[0].texto_origem).toBe("DOCENTE I ¿ HISTÓRIA");
  });

  it("lote vazio não chama o banco", async () => {
    const { result } = renderHookWithProviders(() => useSalvarApelidos());

    await act(async () => {
      await result.current.salvarApelidos([]);
    });

    expect(supabaseMock.from).not.toHaveBeenCalledWith("cargo_apelidos");
  });

  it("erro do banco vira toast com a mensagem do banco", async () => {
    setTableResult("cargo_apelidos", {
      data: null,
      error: erroPostgrest("42501", "permission denied for table cargo_apelidos"),
    });
    const { result } = renderHookWithProviders(() => useSalvarApelidos());

    await act(async () => {
      await result.current
        .salvarApelidos([{ texto_origem: "ARTE", cargo_id: ID_ARTE }])
        .catch(() => undefined);
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringMatching(/administrador/i) }),
    );
  });
});

describe("mensagemErroCargo", () => {
  it("nomeia o obstáculo quando o cargo está em uso", () => {
    // Como `mensagemErroExclusaoFuncao`: dizer QUAL uso bloqueia, porque cada um pede uma
    // providência diferente.
    expect(
      mensagemErroCargo(
        'update or delete on table "cargos" violates foreign key constraint "candidatos_cargo_id_fkey"',
      ),
    ).toMatch(/em uso por candidatos/i);
  });

  it("explica o bloqueio de permissão em vez de repetir 'RLS'", () => {
    expect(mensagemErroCargo("new row violates row-level security policy")).toMatch(
      /administrador/i,
    );
    expect(mensagemErroCargo("permission denied for table cargos")).toMatch(/administrador/i);
  });

  it("traduz o CHECK de nome em branco", () => {
    expect(
      mensagemErroCargo('violates check constraint "chk_cargo_nome_preenchido"'),
    ).toMatch(/branco/i);
  });

  it("⭐ NÃO traduz a violação de nome único — ela nunca chega aqui como erro", () => {
    // `criarCargo` transforma o conflito em sucesso (D10). Se um dia esta mensagem
    // aparecer para o usuário, é sinal de que aquele caminho quebrou.
    const cru = 'duplicate key value violates unique constraint "cargos_nome_chave_key"';
    expect(mensagemErroCargo(cru)).toBe(cru);
  });

  it("devolve a mensagem original quando não conhece o erro", () => {
    expect(mensagemErroCargo("erro esquisito")).toBe("erro esquisito");
  });
});
