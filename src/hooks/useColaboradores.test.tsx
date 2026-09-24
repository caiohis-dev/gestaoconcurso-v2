import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  erroPostgrest,
  type QueryBuilderMock,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

// O useAuth real monta um provider que fala com o Supabase; aqui só interessa o
// recorte que o hook consome (user + os dois papéis).
const { authMock } = vi.hoisted(() => ({
  authMock: { user: { id: "u1" } as { id: string } | null, isAdmin: false, isCoordenador: false },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

import {
  useColaboradoresMutations,
  useBuscarColaboradores,
  useBuscarColaboradoresParaAlocacao,
  useBuscarColaboradoresParaAcesso,
  LIMITE_PICKER_ALOCACAO,
  POR_PAGINA_COLABORADORES,
  mensagemErroExclusaoColaborador,
} from "@/hooks/useColaboradores";

const COLABORADOR = { id: "colab-1", colab_nome_completo: "Maria da Silva", colab_cpf: "12345678901" };

const buildersDe = (tabela: string): QueryBuilderMock[] =>
  supabaseMock.from.mock.calls
    .map((c, i) => ({ tabela: c[0], i }))
    .filter((c) => c.tabela === tabela)
    .map(({ i }) => supabaseMock.from.mock.results[i].value as QueryBuilderMock);

describe("useColaboradores", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    authMock.user = { id: "u1" };
    authMock.isAdmin = false;
    authMock.isCoordenador = false;
  });

  /**
   * O recorte por papel é a regra mais importante deste hook. Atenção ao ler: ele é
   * CLIENT-SIDE. A barreira real é a RLS de `colaboradores` (desde a 2D: admin e
   * coordenador veem tudo; qualquer outra conta autenticada vê só a própria linha).
   * Quebrar o que está aqui piora a UX, não abre vazamento — mas o inverso também
   * vale: consertar aqui não substitui policy.
   */
  /**
   * 🔵 O describe "recorte por papel" saiu em 2026-09-12, com o `useColaboradores()` que
   * ele testava — a listagem inteira, que batia no teto `max_rows` do PostgREST. Ele
   * cobria o ramo de coordenador (`get_coordenador_colaboradores` + `.in('id', ids)`) e a
   * precedência do `fetchAll`. Nada disso existe mais: o recorte do coordenador agora é a
   * RLS, respeitada porque a RPC nova é SECURITY INVOKER, e não precisa ser remontado no
   * cliente. Ver `useBuscarColaboradoresParaAlocacao` abaixo.
   */

  /**
   * `mensagemDuplicidade` traduz o nome da CONSTRAINT para uma frase acionável.
   * Vale lembrar por que os índices são funcionais (sobre lower(trim(...))): um
   * UNIQUE comum deixaria conviver Joao@x.com e joao@x.com, que o Supabase Auth
   * trata como o MESMO usuário — e o e-mail é âncora de identidade.
   */
  describe("tradução de violação de unicidade", () => {
    async function criarComErro(error: { code?: string; message: string; details?: string }) {
      setTableResult("colaboradores", { data: null, error: error as never });
      const { result } = renderHookWithProviders(() => useColaboradoresMutations());
      result.current.create({ colab_cpf: "12345678901" } as never);
      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      return toastMock.mock.calls.at(-1)?.[0] as { description: string };
    }

    it.each([
      ["colaboradores_colab_cpf_key", "CPF já cadastrado"],
      ["colaboradores_colab_matricula_key", "Matrícula já cadastrada"],
      ["colaboradores_colab_pis_key", "PIS já cadastrado"],
    ])("mapeia %s", async (constraint, esperado) => {
      const toast = await criarComErro({
        code: "23505",
        message: `duplicate key value violates unique constraint "${constraint}"`,
      });
      expect(toast.description).toBe(esperado);
    });

    it("dá orientação completa para e-mail duplicado", async () => {
      const toast = await criarComErro({
        code: "23505",
        message: 'duplicate key value violates unique constraint "colaboradores_colab_email_key"',
      });
      expect(toast.description).toBe(
        "Este e-mail já está cadastrado para outro colaborador. Verifique o endereço e tente novamente.",
      );
    });

    it("dá orientação completa para chave PIX duplicada", async () => {
      const toast = await criarComErro({
        code: "23505",
        message: 'duplicate key value violates unique constraint "colaboradores_colab_chave_pix_key"',
      });
      expect(toast.description).toContain("Cada chave pertence a uma única pessoa");
    });

    it("lê a constraint também de `details`, não só de `message`", async () => {
      // O supabase-js entrega o nome da constraint ora num campo, ora no outro —
      // o helper concatena os dois de propósito.
      const toast = await criarComErro({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: 'Key (colab_cpf)=(12345678901) already exists.',
      });
      expect(toast.description).toBe("CPF já cadastrado");
    });

    it("cai numa mensagem genérica para constraint desconhecida", async () => {
      const toast = await criarComErro({
        code: "23505",
        message: 'duplicate key value violates unique constraint "alguma_outra_key"',
      });
      expect(toast.description).toBe(
        "Um dos dados informados já está cadastrado para outro colaborador.",
      );
    });

    it("não mexe em erro que não é de duplicidade", async () => {
      const toast = await criarComErro({ code: "42501", message: "permission denied" });
      expect(toast.description).toBe("permission denied");
    });
  });

  describe("delete — a trava passou do cliente para o banco", () => {
    /**
     * Havia aqui três testes do PRÉ-CHECK client-side (SELECT em colaboradores_prova e
     * throw "COLABORADOR_VINCULADO_PROVA"), inclusive um garantindo o `.limit(1)`.
     * Foram removidos em 2026-07-26 junto com o próprio pré-check: ele checava alocação
     * e NÃO checava ocorrência, então quem tinha histórico de ocorrência sem alocação
     * era excluído por esta tela levando o histórico junto — 18 das 19 ocorrências do
     * banco estavam nessa situação. Quem recusa agora é o RESTRICT das FKs.
     *
     * Mensagens REAIS do Postgres, capturadas do banco local em 2026-07-26 após a
     * migration 20260726210000.
     */
    async function excluirComErro(message: string, code = "23503") {
      setTableResult("colaboradores", { data: null, error: { code, message } as never });
      const { result } = renderHookWithProviders(() => useColaboradoresMutations());
      result.current.delete("colab-1");
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Erro ao excluir" }),
        ),
      );
      return toastMock.mock.calls.at(-1)?.[0] as { description: string };
    }

    const MSG = {
      alocacao:
        'update or delete on table "colaboradores" violates foreign key constraint "colaboradores_prova_colaborador_id_fkey" on table "colaboradores_prova"',
      ocorrencia:
        'update or delete on table "colaboradores" violates foreign key constraint "ocorrencias_colaborador_colaborador_id_fkey" on table "ocorrencias_colaborador"',
      substituto:
        'update or delete on table "colaboradores" violates foreign key constraint "ocorrencias_colaborador_substituto_id_fkey" on table "ocorrencias_colaborador"',
    };

    it("não consulta mais colaboradores_prova antes de excluir", async () => {
      // O pré-check era "leio e então decido": o vínculo podia nascer entre o SELECT e o
      // DELETE. Deixar de consultar é parte do conserto, não detalhe de performance.
      setTableResult("colaboradores", { data: [], error: null });

      // `useColaboradoresMutations` não tem consulta nenhuma para esperar — é só escrita.
      const { result } = renderHookWithProviders(() => useColaboradoresMutations());
      supabaseMock.from.mockClear();

      result.current.delete("colab-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "Colaborador excluído com sucesso!" }),
        ),
      );
      expect(supabaseMock.from.mock.calls.map((c) => c[0])).not.toContain("colaboradores_prova");
    });

    it("traduz a recusa por alocação oferecendo a saída que existe", async () => {
      const toast = await excluirComErro(MSG.alocacao);
      expect(toast.description).toBe(
        "Este colaborador está alocado em uma prova. Remova a alocação antes de excluí-lo.",
      );
    });

    it("traduz a recusa por ocorrência SEM prometer saída", async () => {
      // Diferença deliberada: desalocar é possível, apagar ocorrência não. Dizer "remova
      // antes" aqui mandaria a pessoa procurar um botão que não existe.
      const toast = await excluirComErro(MSG.ocorrencia);
      expect(toast.description).toContain("não pode ser excluído");
      expect(toast.description).not.toContain("Remova");
    });

    it("distingue substituto de ocorrência titular", async () => {
      // O nome da constraint de substituto contém "ocorrencias_colaborador"; casar por
      // essa tabela primeiro engoliria este caso.
      const toast = await excluirComErro(MSG.substituto);
      expect(toast.description).toContain("substituto");
    });

    it("deixa passar erro que não é de vínculo", async () => {
      const toast = await excluirComErro("permission denied", "42501");
      expect(toast.description).toBe("permission denied");
    });
  });
});

describe("mensagemErroExclusaoColaborador", () => {
  it("cai numa frase genérica se a FK for de uma tabela nova", () => {
    const futura =
      'update or delete on table "colaboradores" violates foreign key constraint "tabela_nova_colaborador_id_fkey" on table "tabela_nova"';
    expect(mensagemErroExclusaoColaborador({ code: "23503", message: futura })).toBe(
      "Este colaborador tem histórico registrado e não pode ser excluído.",
    );
  });

  it("reconhece pelo texto quando o código não vem", () => {
    const msg =
      'update or delete on table "colaboradores" violates foreign key constraint "colaboradores_prova_colaborador_id_fkey" on table "colaboradores_prova"';
    expect(mensagemErroExclusaoColaborador({ message: msg })).toContain("Remova a alocação");
  });
});

/**
 * A busca sob demanda de `/colaboradores` (2026-09-10).
 *
 * 🔴 O que estes testes guardam é que a tela NÃO consulta sozinha. Antes, ela baixava os
 * 774 colaboradores inteiros ao montar — 707 kB, 33 colunas cada, com CPF, PIS e dados
 * bancários de todo mundo — e refazia isso a cada volta de foco da janela, porque o
 * `QueryClient` do `App.tsx` nasce sem `staleTime`.
 */
describe("useBuscarColaboradores", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    authMock.user = { id: "u1" };
    authMock.isAdmin = true;
    authMock.isCoordenador = false;
  });

  it("🔴 critério VAZIO não consulta nada", async () => {
    // A barreira é o `enabled` do hook, não o botão desabilitado da tela: quem chamar o
    // hook com termo vazio por qualquer caminho também não pode disparar consulta.
    const { result } = renderHookWithProviders(() => useBuscarColaboradores({ termo: "" }));

    await waitFor(() => expect(result.current.buscou).toBe(false));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("🔴 critério só com espaços também não consulta", async () => {
    const { result } = renderHookWithProviders(() => useBuscarColaboradores({ termo: "   " }));

    await waitFor(() => expect(result.current.buscou).toBe(false));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("não consulta sem usuário logado", async () => {
    authMock.user = null;
    const { result } = renderHookWithProviders(() => useBuscarColaboradores({ termo: "maria" }));

    await waitFor(() => expect(result.current.buscou).toBe(false));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("⭐ CONTROLE POSITIVO: com critério, consulta e devolve o registro", async () => {
    // Sem este, todas as asserções acima passariam mesmo se o hook tivesse parado de
    // buscar por completo — que é o modo de falha mais fácil de introduzir aqui.
    setTableResult("colaboradores", { data: [COLABORADOR], error: null, count: 1 });

    const { result } = renderHookWithProviders(() => useBuscarColaboradores({ termo: "maria" }));

    await waitFor(() => expect(result.current.colaboradores).toHaveLength(1));
    expect(result.current.total).toBe(1);
    expect(result.current.buscou).toBe(true);
  });

  it("procura nos três campos e ESCAPA a sintaxe do `or`", async () => {
    // `%`, `,` e parênteses são sintaxe do PostgREST: um deles digitado na busca
    // quebraria a expressão inteira, e o erro sairia como 400 sem explicação.
    setTableResult("colaboradores", { data: [], error: null, count: 0 });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradores({ termo: "ma%ria,(x)" }),
    );
    await waitFor(() => expect(result.current.buscou).toBe(true));

    const or = buildersDe("colaboradores")[0].or as ReturnType<typeof vi.fn>;
    const expressao = or.mock.calls[0][0] as string;
    expect(expressao).not.toMatch(/[%,()]ria/);
    // O NOME vai pela coluna computada (sem acento); matrícula e CPF, pela coluna crua.
    expect(expressao).toContain("colab_nome_busca.ilike");
    expect(expressao).toContain("colab_matricula.ilike");
    expect(expressao).toContain("colab_cpf.ilike");
  });

  it("🔵 o termo digitado vai SEM ACENTO para o lado do nome", async () => {
    // O par: a coluna computada `colab_nome_busca` tira o acento do DADO, isto tira do
    // que foi DIGITADO. Enviar o termo cru devolve lista vazia — medido contra o banco
    // local, com "josé ribeiro" não achando "JOSÉ RIBEIRO DOS SANTOS NETO".
    setTableResult("colaboradores", { data: [], error: null, count: 0 });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradores({ termo: "José Antônio" }),
    );
    await waitFor(() => expect(result.current.buscou).toBe(true));

    const or = buildersDe("colaboradores")[0].or as ReturnType<typeof vi.fn>;
    const expressao = or.mock.calls[0][0] as string;
    // ⚠️ Olhar só o SEGMENTO do nome: matrícula e CPF recebem o termo CRU de propósito,
    // então "Antônio" aparece na expressão inteira — e aparecer ali está certo.
    const segmentoNome = expressao
      .split(",")
      .find((parte) => parte.startsWith("colab_nome_busca"));

    expect(segmentoNome).toBe("colab_nome_busca.ilike.%jose antonio%");
  });

  it("matrícula e CPF NÃO são normalizados — não têm acento", async () => {
    // Normalizá-los seria trabalho sem efeito, e mascararia um bug se um dia a matrícula
    // passasse a aceitar letra acentuada.
    setTableResult("colaboradores", { data: [], error: null, count: 0 });

    const { result } = renderHookWithProviders(() => useBuscarColaboradores({ termo: "ABC123" }));
    await waitFor(() => expect(result.current.buscou).toBe(true));

    const or = buildersDe("colaboradores")[0].or as ReturnType<typeof vi.fn>;
    const expressao = or.mock.calls[0][0] as string;
    expect(expressao).toContain("colab_matricula.ilike.%ABC123%");
    expect(expressao).toContain("colab_cpf.ilike.%ABC123%");
  });

  it("🔴 NÃO seleciona `*` — a listagem não carrega dado bancário", async () => {
    // O ponto é PII, não bytes: `select('*')` mandava CPF, PIS, agência, conta e chave
    // PIX de 774 pessoas para o navegador de qualquer coordenador, para exibir 7 campos.
    setTableResult("colaboradores", { data: [], error: null, count: 0 });

    const { result } = renderHookWithProviders(() => useBuscarColaboradores({ termo: "maria" }));
    await waitFor(() => expect(result.current.buscou).toBe(true));

    const select = buildersDe("colaboradores")[0].select as ReturnType<typeof vi.fn>;
    const colunas = select.mock.calls[0][0] as string;
    expect(colunas).not.toBe("*");
    for (const proibida of ["colab_pis", "agencia", "conta", "codigo_banco", "colab_email"]) {
      expect(colunas).not.toContain(proibida);
    }
    expect(colunas).toContain("colab_nome_completo");
  });

  it("pede ao servidor só a fatia da página", async () => {
    setTableResult("colaboradores", { data: [], error: null, count: 320 });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradores({ termo: "maria", pagina: 2 }),
    );
    await waitFor(() => expect(result.current.buscou).toBe(true));

    expect(buildersDe("colaboradores")[0].range).toHaveBeenCalledWith(
      2 * POR_PAGINA_COLABORADORES,
      3 * POR_PAGINA_COLABORADORES - 1,
    );
    // O total é do SERVIDOR: é ele que diz que existe mais além desta página.
    expect(result.current.total).toBe(320);
  });

  it("a ordenação vai ao SERVIDOR, com desempate estável", async () => {
    setTableResult("colaboradores", { data: [], error: null, count: 0 });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradores({ termo: "maria", ordenarPor: "ultimo_acesso", direcao: "desc" }),
    );
    await waitFor(() => expect(result.current.buscou).toBe(true));

    const order = buildersDe("colaboradores")[0].order as ReturnType<typeof vi.fn>;
    // `nullsFirst: false` põe quem nunca acessou no FIM — ordenar por último acesso
    // existe para achar essa gente, e o padrão do Postgres entregaria a lista invertida.
    expect(order).toHaveBeenCalledWith("colab_ultimo_acesso", {
      ascending: false,
      nullsFirst: false,
    });
    // Sem desempate, duas linhas empatadas trocam de lugar entre páginas: uma se repete
    // e a outra some. Silenciosamente.
    expect(order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("sem ordenação escolhida, ordena por nome", async () => {
    setTableResult("colaboradores", { data: [], error: null, count: 0 });

    const { result } = renderHookWithProviders(() => useBuscarColaboradores({ termo: "maria" }));
    await waitFor(() => expect(result.current.buscou).toBe(true));

    expect(buildersDe("colaboradores")[0].order).toHaveBeenCalledWith("colab_nome_completo", {
      ascending: true,
      nullsFirst: false,
    });
  });
});

describe("useBuscarColaboradoresParaAcesso", () => {
  beforeEach(() => {
    resetSupabaseMock();
    authMock.user = { id: "u1" };
  });

  it("critério vazio não consulta nada", async () => {
    const { result } = renderHookWithProviders(() => useBuscarColaboradoresParaAcesso("  "));
    await waitFor(() => expect(result.current.buscou).toBe(false));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("usa o MESMO filtro da busca de /colaboradores — nome sem acento", async () => {
    // As duas buscas compartilham `filtroBuscaColaborador`. Se esta ganhasse cópia
    // própria, "jose" deixaria de achar "José" só aqui, sem erro.
    setTableResult("colaboradores", { data: [], error: null, count: 0 });
    const { result } = renderHookWithProviders(() => useBuscarColaboradoresParaAcesso("José Antônio"));
    await waitFor(() => expect(result.current.buscou).toBe(true));

    const expressao = (buildersDe("colaboradores")[0].or as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(expressao.split(",")[0]).toBe("colab_nome_busca.ilike.%jose antonio%");
  });

  it("traz o que a tela precisa para antecipar a EF — e nada de dado bancário", async () => {
    setTableResult("colaboradores", { data: [], error: null, count: 0 });
    const { result } = renderHookWithProviders(() => useBuscarColaboradoresParaAcesso("maria"));
    await waitFor(() => expect(result.current.buscou).toBe(true));

    const colunas = (buildersDe("colaboradores")[0].select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(colunas).toContain("colab_email");
    expect(colunas).toContain("user_id");
    for (const proibida of ["colab_pis", "agencia", "conta", "codigo_banco", "colab_cpf", "chave_pix"]) {
      expect(colunas).not.toContain(proibida);
    }
  });
});

describe("useBuscarColaboradoresParaAlocacao", () => {
  /**
   * 🔴 Este hook existe para tirar os pickers do teto `max_rows` do PostgREST, que corta
   * a resposta SEM ERRO. Medido em 2026-09-12: 771 colaboradores contra um teto de 1000.
   * O que ele substituiu baixava a lista inteira e filtrava em memória.
   */
  beforeEach(() => {
    authMock.user = { id: "u1" };
    authMock.isAdmin = false;
    authMock.isCoordenador = false;
  });

  const LINHA = {
    id: "colab-1",
    colab_nome_completo: "José da Silva",
    colab_cpf: "12345678901",
    alocado_prova_unidade_id: null,
    alocado_unid_sigla: null,
  };

  it("manda o termo SEM ACENTO — é o lado do cliente do par", async () => {
    // ⚠️ O dado é normalizado no banco (`colab_nome_busca`). Se o termo for cru, a busca
    // simplesmente não acha, sem erro nenhum. Os dois lados ou nenhum.
    setRpcResult("buscar_colaboradores_para_alocacao", { data: [LINHA], error: null });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradoresParaAlocacao({ provaId: "prova-1", termo: "  José  " }),
    );
    await waitFor(() => expect(result.current.colaboradores).toHaveLength(1));

    expect(supabaseMock.rpc).toHaveBeenCalledWith("buscar_colaboradores_para_alocacao", {
      p_prova_id: "prova-1",
      p_termo: "jose",
      p_excluir_prova_unidade_id: null,
      p_limite: LIMITE_PICKER_ALOCACAO,
    });
  });

  it("repassa a unidade a excluir, que é o que tira da lista quem já está nela", async () => {
    setRpcResult("buscar_colaboradores_para_alocacao", { data: [], error: null });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradoresParaAlocacao({
        provaId: "prova-1",
        termo: "",
        excluirProvaUnidadeId: "pu-7",
      }),
    );
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "buscar_colaboradores_para_alocacao",
      expect.objectContaining({ p_excluir_prova_unidade_id: "pu-7" }),
    );
  });

  it("termo vazio CONSULTA — não é a mesma regra de /colaboradores", async () => {
    // Lá o `enabled` exige critério porque a tela montava sozinha e baixava 707 kB. Aqui
    // o picker só consulta quando é aberto, e quem aloca costuma escolher sem digitar.
    setRpcResult("buscar_colaboradores_para_alocacao", { data: [LINHA], error: null });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradoresParaAlocacao({ provaId: "prova-1", termo: "" }),
    );

    await waitFor(() => expect(result.current.colaboradores).toHaveLength(1));
  });

  it("não consulta sem prova, nem quando o picker está fechado", async () => {
    const semProva = renderHookWithProviders(() =>
      useBuscarColaboradoresParaAlocacao({ provaId: undefined, termo: "a" }),
    );
    await waitFor(() => expect(semProva.result.current.isFetching).toBe(false));

    const fechado = renderHookWithProviders(() =>
      useBuscarColaboradoresParaAlocacao({ provaId: "prova-1", termo: "a", habilitado: false }),
    );
    await waitFor(() => expect(fechado.result.current.isFetching).toBe(false));

    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it("avisa que pode haver mais quando a resposta encosta no limite", async () => {
    // É o que impede o novo engano: sem este sinal, quem não aparece "não existe" —
    // exatamente o que o teto de 1000 fazia, só que menor.
    const cheia = Array.from({ length: LIMITE_PICKER_ALOCACAO }, (_, i) => ({
      ...LINHA,
      id: `colab-${i}`,
    }));
    setRpcResult("buscar_colaboradores_para_alocacao", { data: cheia, error: null });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradoresParaAlocacao({ provaId: "prova-1", termo: "a" }),
    );
    await waitFor(() => expect(result.current.podeHaverMais).toBe(true));
  });

  it("resposta menor que o limite NÃO avisa", async () => {
    setRpcResult("buscar_colaboradores_para_alocacao", { data: [LINHA], error: null });

    const { result } = renderHookWithProviders(() =>
      useBuscarColaboradoresParaAlocacao({ provaId: "prova-1", termo: "jose" }),
    );
    await waitFor(() => expect(result.current.colaboradores).toHaveLength(1));
    expect(result.current.podeHaverMais).toBe(false);
  });
});
