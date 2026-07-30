/**
 * Bateria dos hooks de dados do módulo Candidatos.
 *
 * O que ela guarda, e por que importa mais do que o CRUD que aparenta:
 *
 *  - **A paginação e o `count`.** São milhares de inscritos por edital e o PostgREST
 *    corta a resposta em 1.000. Se alguém trocar o total pelo `length` do array, a tela
 *    passa a dizer "1000 inscritos" para sempre e ninguém percebe — é o pior tipo de
 *    erro, o que parece ter funcionado. Há teste separado para isso.
 *  - **O `onConflict` do upsert.** É o que faz reimportar ATUALIZAR em vez de duplicar.
 *    Trocar aquela string por `edital_id,n_inscricao` (o que parece certo) faria a
 *    importação perder os 396 inscritos que concorrem a mais de um cargo. Desde
 *    2026-07-27 a chave também leva o `cpf` (migration 20260727200000), e desde
 *    2026-07-28 o cargo entra por `cargo_id` e não pelo texto (migration 20260728100000)
 *    — é essa troca que fez corrigir o nome de um cargo parar de duplicar inscrito.
 *  - **A divisão em blocos.** Sem ela seriam 7.416 requisições.
 *  - **O join do cargo canônico e o recorte por cargo** (etapa 6, 2026-07-29). O primeiro
 *    evita N+1 e precisa continuar sendo join à ESQUERDA; o segundo tem de ir ao servidor,
 *    senão o `count` passa a descrever um conjunto e a tabela, outro.
 *
 * A lógica de CONVERSÃO da planilha não está aqui: ela é pura e tem bateria própria em
 * `lib/candidatos-import.test.ts`. Ver `my_rules/estrutura/modulos/candidatos/00-modulo.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  erroPostgrest,
  CODIGOS_POSTGREST,
  buildersDaTabela,
  builderQueChamou,
  type QueryBuilderMock,
  type QueryResult,
} from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";
import type { CandidatoResolvido } from "@/lib/candidatos-import";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import {
  useCandidatos,
  useContagemCandidatosPorEdital,
  useImportarCandidatos,
  useExcluirCandidatos,
  TAMANHO_BLOCO,
  type Candidato,
  type ResultadoBloco,
} from "@/hooks/useCandidatos";

const EDITAL_ID = "edital-1";

const CARGO_ID = "cargo-historia";

const CANDIDATO: Candidato = {
  id: "cand-1",
  edital_id: EDITAL_ID,
  n_inscricao: "214274",
  // O texto CRU da planilha e o cargo CANÔNICO diferem de propósito: o `¿` é o travessão
  // em cp1252 lido como latin-1, e é o dado real do arquivo de 7.416 linhas.
  cargo: "DOCENTE I ¿ HISTÓRIA",
  cargo_id: CARGO_ID,
  cargos: { id: CARGO_ID, nome: "DOCENTE I — HISTÓRIA" },
  nome: "AGATHA LAMIM DE SOUZA",
  cpf: "22940161739",
  email: "agathalamim86@gmail.com",
  telefone: null,
  celular: "(24) 9982-20527",
  logradouro: "RUA VEREADOR ACÁCIO DA ROCHA",
  numero: "161",
  complemento: null,
  bairro: "AÇUDE",
  cidade: "VOLTA REDONDA",
  uf: "RJ",
  cep: "27276385",
  identidade_numero: "22940161739",
  identidade_orgao: "DETRAN",
  identidade_uf: "RJ",
  identidade_emissao: "2023-12-13",
  data_nascimento: "2005-12-08",
  hora_nascimento: "12:43:00",
  sexo: "1",
  raca: null,
  portador_deficiencia: false,
  confirmado: true,
  concurso_id_origem: "242",
  created_at: null,
  updated_at: null,
};

/**
 * Uma página da listagem.
 *
 * O `count` viaja no MESMO objeto que o `data` — é assim que o PostgREST responde a um
 * `select` com `{ count: "exact" }`, e é assim que o hook o lê. O cast existe só porque
 * `QueryResult` do mock declara apenas `data`/`error`; em tempo de execução o mock
 * devolve o objeto como veio, então basta acrescentar o campo.
 */
function pagina(candidatos: Candidato[], total = candidatos.length) {
  return { data: candidatos, error: null, count: total } as unknown as QueryResult<Candidato[]>;
}

/** Resultado de um `delete` com `{ count: "exact" }` — mesma história do `pagina`. */
function apagados(quantidade: number) {
  return { data: null, error: null, count: quantidade } as unknown as QueryResult<null>;
}

const ultimoBuilder = (tabela: string): QueryBuilderMock => {
  const builders = buildersDaTabela(tabela);
  if (builders.length === 0) throw new Error(`Nenhuma consulta a "${tabela}".`);
  return builders[builders.length - 1];
};

/** Todos os builders em que o método foi chamado — o `builderQueChamou` só dá o 1º. */
const buildersQueChamaram = (tabela: string, metodo: "upsert" | "delete") =>
  buildersDaTabela(tabela).filter((b) => b[metodo].mock.calls.length > 0);

/**
 * Um candidato convertido E RESOLVIDO, pronto para gravar.
 *
 * ⭐ O tipo é `CandidatoResolvido` desde 2026-07-27: `useImportarCandidatos` passou a
 * exigir o lote com `cargo_id` já carimbado, e o TypeScript recusa o não-resolvido. Foi
 * este helper que a mudança de assinatura pegou primeiro — a prova de que o guarda de
 * tipo funciona fora do arquivo onde foi desenhado.
 */
function paraImportar(n: number): CandidatoResolvido {
  return {
    edital_id: EDITAL_ID,
    n_inscricao: String(200000 + n),
    cargo: "DOCENTE II",
    cargo_id: "cargo-docente-ii",
    nome: `INSCRITO ${n}`,
    cpf: null,
    email: null,
    telefone: null,
    celular: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
    identidade_numero: null,
    identidade_orgao: null,
    identidade_uf: null,
    identidade_emissao: null,
    data_nascimento: null,
    hora_nascimento: null,
    sexo: null,
    raca: null,
    portador_deficiencia: false,
    confirmado: false,
    concurso_id_origem: null,
  };
}

const lote = (quantidade: number) =>
  Array.from({ length: quantidade }, (_, i) => paraImportar(i));

describe("useCandidatos", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
  });

  describe("listagem", () => {
    it("resolve com os inscritos do edital", async () => {
      setTableResult("candidatos", pagina([CANDIDATO]));

      const { result } = renderHookWithProviders(() => useCandidatos({ editalId: EDITAL_ID }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.candidatos).toEqual([CANDIDATO]);
    });

    it("NÃO consulta o banco enquanto nenhum edital estiver escolhido", async () => {
      // `enabled: !!editalId`. Sem isto a consulta sairia sem filtro e traria inscrito
      // de todos os editais misturado — e a tela não tem como distinguir depois.
      setTableResult("candidatos", pagina([CANDIDATO]));

      const { result } = renderHookWithProviders(() => useCandidatos({ editalId: null }));

      expect(supabaseMock.from).not.toHaveBeenCalledWith("candidatos");
      expect(result.current.candidatos).toEqual([]);
      expect(result.current.total).toBe(0);
      // E não fica preso num spinner eterno, que é o efeito colateral clássico de
      // `enabled: false` mal tratado.
      expect(result.current.isLoading).toBe(false);
    });

    it("filtra pelo edital e ordena por nome", async () => {
      setTableResult("candidatos", pagina([]));
      const { result } = renderHookWithProviders(() => useCandidatos({ editalId: EDITAL_ID }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const builder = builderQueChamou("candidatos", "select");
      expect(builder.select).toHaveBeenCalledWith("*, cargos ( id, nome )", { count: "exact" });
      expect(builder.eq).toHaveBeenCalledWith("edital_id", EDITAL_ID);
      expect(builder.order).toHaveBeenCalledWith("nome", { ascending: true });
    });

    it("⭐ traz o cargo canônico no MESMO select, não numa consulta por linha", async () => {
      // O join é o que permite a tela mostrar `cargos.nome` em vez do texto sujo sem
      // pagar N+1 (uma ida ao servidor por inscrito exibido, 50 por página). E precisa
      // ser à ESQUERDA: `cargos!inner` sumiria com quem tem `cargo_id` nulo, e sumir da
      // lista é o único erro grave possível nesta tela.
      setTableResult("candidatos", pagina([CANDIDATO]));
      const { result } = renderHookWithProviders(() => useCandidatos({ editalId: EDITAL_ID }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const [select] = builderQueChamou("candidatos", "select").select.mock.calls[0] as [string];
      expect(select).toContain("cargos ( id, nome )");
      expect(select).not.toContain("!inner");
      expect(supabaseMock.from).not.toHaveBeenCalledWith("cargos");
      expect(result.current.candidatos[0].cargos?.nome).toBe("DOCENTE I — HISTÓRIA");
    });

    it("recorta por cargo NO SERVIDOR, mantendo o count e a paginação", async () => {
      // Filtrar no cliente deixaria o `count` falando do edital inteiro enquanto a tabela
      // mostra um subconjunto — a tela mentiria sem quebrar nada, que é o mesmo modo de
      // falha que a paginação já guarda.
      setTableResult("candidatos", pagina([CANDIDATO], 481));
      const { result } = renderHookWithProviders(() =>
        useCandidatos({ editalId: EDITAL_ID, cargoId: CARGO_ID, porPagina: 50 }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const builder = builderQueChamou("candidatos", "select");
      expect(builder.eq).toHaveBeenCalledWith("edital_id", EDITAL_ID);
      expect(builder.eq).toHaveBeenCalledWith("cargo_id", CARGO_ID);
      expect(builder.range).toHaveBeenCalledWith(0, 49);
      expect(result.current.total).toBe(481);
    });

    it("não recorta por cargo quando nenhum está escolhido", async () => {
      // CONTROLE POSITIVO do filtro: sem ele, um teste que só confere a presença do `eq`
      // passaria com um recorte aplicado sempre — e a lista nunca mostraria o edital todo.
      setTableResult("candidatos", pagina([CANDIDATO]));
      const { result } = renderHookWithProviders(() => useCandidatos({ editalId: EDITAL_ID }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const builder = builderQueChamou("candidatos", "select");
      expect(builder.eq).toHaveBeenCalledTimes(1);
      expect(builder.eq).toHaveBeenCalledWith("edital_id", EDITAL_ID);
    });

    it("busca e cargo se acumulam, em vez de um substituir o outro", async () => {
      setTableResult("candidatos", pagina([]));
      const { result } = renderHookWithProviders(() =>
        useCandidatos({ editalId: EDITAL_ID, cargoId: CARGO_ID, busca: "AGATHA" }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const builder = builderQueChamou("candidatos", "select");
      expect(builder.eq).toHaveBeenCalledWith("cargo_id", CARGO_ID);
      expect(builder.or).toHaveBeenCalledWith(expect.stringContaining("nome.ilike.%AGATHA%"));
    });

    it("⭐ o total vem do count do servidor, NÃO do tamanho da página", async () => {
      // O teste que guarda a paginação inteira. A página traz 1 linha e o edital tem
      // 7.416 inscritos; quem trocar `count` por `data.length` faz a tela mentir sem
      // quebrar nada — e o PostgREST ainda corta em 1.000 por conta própria.
      setTableResult("candidatos", pagina([CANDIDATO], 7416));

      const { result } = renderHookWithProviders(() => useCandidatos({ editalId: EDITAL_ID }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.candidatos).toHaveLength(1);
      expect(result.current.total).toBe(7416);
    });

    it("pede a fatia certa na primeira página", async () => {
      setTableResult("candidatos", pagina([]));
      const { result } = renderHookWithProviders(() =>
        useCandidatos({ editalId: EDITAL_ID, porPagina: 50 }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(builderQueChamou("candidatos", "select").range).toHaveBeenCalledWith(0, 49);
    });

    it("pede a fatia certa na terceira página", async () => {
      setTableResult("candidatos", pagina([]));
      const { result } = renderHookWithProviders(() =>
        useCandidatos({ editalId: EDITAL_ID, pagina: 2, porPagina: 50 }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(builderQueChamou("candidatos", "select").range).toHaveBeenCalledWith(100, 149);
    });

    it("busca por nome, inscrição e CPF de uma vez", async () => {
      setTableResult("candidatos", pagina([]));
      const { result } = renderHookWithProviders(() =>
        useCandidatos({ editalId: EDITAL_ID, busca: "AGATHA" }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(ultimoBuilder("candidatos").or).toHaveBeenCalledWith(
        "nome.ilike.%AGATHA%,n_inscricao.ilike.%AGATHA%,cpf.ilike.%AGATHA%",
      );
    });

    it("não aplica filtro de busca quando o termo é só espaço", async () => {
      // Controle positivo do caso comum: campo limpo não pode virar um `or` vazio, que
      // o PostgREST recusaria com erro de sintaxe.
      setTableResult("candidatos", pagina([]));
      const { result } = renderHookWithProviders(() =>
        useCandidatos({ editalId: EDITAL_ID, busca: "   " }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(builderQueChamou("candidatos", "select").or).not.toHaveBeenCalled();
    });

    it("neutraliza os caracteres que quebrariam a sintaxe do filtro", async () => {
      // `%`, vírgula e parênteses são estrutura na linguagem de filtro do PostgREST.
      // Um nome com vírgula (ou alguém buscando "50%") derrubaria a consulta inteira.
      setTableResult("candidatos", pagina([]));
      const { result } = renderHookWithProviders(() =>
        useCandidatos({ editalId: EDITAL_ID, busca: "SOUZA, A (50%)" }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // "SOUZA, A (50%)" -> a vírgula, os dois parênteses e o % viram espaço, CADA UM.
      // São DOIS espaços no fim (do `%` e do `)`), não um: contar errado aqui é fácil, e
      // foi o que deixou este teste vermelho quando o módulo nasceu.
      const [filtro] = ultimoBuilder("candidatos").or.mock.calls.at(-1) as [string];
      const alvo = "SOUZA  A  50  ";
      expect(filtro).toBe(
        `nome.ilike.%${alvo}%,n_inscricao.ilike.%${alvo}%,cpf.ilike.%${alvo}%`,
      );
    });

    it("expõe o erro e mantém a lista vazia", async () => {
      setTableResult("candidatos", {
        data: null,
        error: erroPostgrest("42501", "permission denied for table candidatos"),
      });

      const { result } = renderHookWithProviders(() => useCandidatos({ editalId: EDITAL_ID }));

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(result.current.candidatos).toEqual([]);
      expect(result.current.total).toBe(0);
    });
  });

  describe("useContagemCandidatosPorEdital", () => {
    it("vira um mapa edital → total", async () => {
      setRpcResult("contar_candidatos_por_edital", {
        data: [
          { edital_id: "edital-1", total: 7416 },
          { edital_id: "edital-2", total: 12 },
        ],
        error: null,
      });

      const { result } = renderHookWithProviders(() => useContagemCandidatosPorEdital());

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.contagem).toEqual({ "edital-1": 7416, "edital-2": 12 });
    });

    it("conta pela RPC, não baixando as linhas para contar no cliente", async () => {
      setRpcResult("contar_candidatos_por_edital", { data: [], error: null });

      const { result } = renderHookWithProviders(() => useContagemCandidatosPorEdital());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(supabaseMock.rpc).toHaveBeenCalledWith("contar_candidatos_por_edital");
      expect(supabaseMock.from).not.toHaveBeenCalledWith("candidatos");
    });

    it("devolve mapa vazio quando ainda não há inscrito nenhum", async () => {
      setRpcResult("contar_candidatos_por_edital", { data: null, error: null });

      const { result } = renderHookWithProviders(() => useContagemCandidatosPorEdital());

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.contagem).toEqual({});
    });
  });

  describe("useImportarCandidatos", () => {
    it("⭐ faz UPSERT sobre a chave natural, com o cargo e o CPF dentro", async () => {
      // A string do `onConflict` é o que separa "reimportar atualiza" de "reimportar
      // duplica". E ela precisa dos QUATRO campos: sem o cargo, as inscrições de quem
      // concorre a mais de um cargo colidiriam entre si — 396 sumiriam; e o `cpf` entrou
      // na chave por decisão do usuário em 2026-07-27 (migration 20260727200000).
      //
      // ⭐ O cargo entra por `cargo_id`, e NÃO por `cargo_chave`, desde a etapa 5
      // (migration 20260728100000). É a troca que faz corrigir o nome de um cargo deixar
      // de criar 481 registros novos. Se esta string voltar ao texto, o índice do banco
      // não é mais inferido e o upsert passa a inserir em vez de atualizar.
      setTableResult("candidatos", { data: null, error: null });
      const { result } = renderHookWithProviders(() => useImportarCandidatos());

      await act(async () => {
        await result.current.importar({ candidatos: lote(2) });
      });

      expect(builderQueChamou("candidatos", "upsert").upsert).toHaveBeenCalledWith(
        expect.any(Array),
        { onConflict: "edital_id,cpf,cargo_id,n_inscricao" },
      );
    });

    it("carimba created_by com o usuário da sessão", async () => {
      setTableResult("candidatos", { data: null, error: null });
      const { result } = renderHookWithProviders(() => useImportarCandidatos());

      await act(async () => {
        await result.current.importar({ candidatos: lote(1) });
      });

      expect(supabaseMock.auth.getUser).toHaveBeenCalled();
      const [linhas] = builderQueChamou("candidatos", "upsert").upsert.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(linhas[0]).toMatchObject({ n_inscricao: "200000", created_by: "user-teste-1" });
    });

    it("⭐ divide em blocos em vez de mandar uma requisição por linha", async () => {
      // 7.416 requisições contra 15. É a diferença entre 20 minutos e meio segundo —
      // medido: 7.416 candidatos em 0,4 s no banco local.
      setTableResult("candidatos", { data: null, error: null });
      const { result } = renderHookWithProviders(() => useImportarCandidatos());

      await act(async () => {
        await result.current.importar({ candidatos: lote(TAMANHO_BLOCO + 1) });
      });

      const envios = buildersQueChamaram("candidatos", "upsert");
      expect(envios).toHaveLength(2);
      expect((envios[0].upsert.mock.calls[0] as [unknown[]])[0]).toHaveLength(TAMANHO_BLOCO);
      expect((envios[1].upsert.mock.calls[0] as [unknown[]])[0]).toHaveLength(1);
    });

    it("relata quantos entraram em cada bloco", async () => {
      setTableResult("candidatos", { data: null, error: null });
      const { result } = renderHookWithProviders(() => useImportarCandidatos());

      let resultados: ResultadoBloco[] = [];
      await act(async () => {
        resultados = await result.current.importar({ candidatos: lote(TAMANHO_BLOCO + 3) });
      });

      expect(resultados).toEqual([
        { bloco: 1, gravados: TAMANHO_BLOCO, erro: null },
        { bloco: 2, gravados: 3, erro: null },
      ]);
    });

    it("informa o progresso a cada bloco", async () => {
      setTableResult("candidatos", { data: null, error: null });
      const { result } = renderHookWithProviders(() => useImportarCandidatos());
      const onProgresso = vi.fn();

      await act(async () => {
        await result.current.importar({ candidatos: lote(TAMANHO_BLOCO + 1), onProgresso });
      });

      expect(onProgresso).toHaveBeenNthCalledWith(1, {
        enviados: TAMANHO_BLOCO,
        total: TAMANHO_BLOCO + 1,
      });
      // O último não pode passar do total, senão a barra ultrapassa 100%.
      expect(onProgresso).toHaveBeenLastCalledWith({
        enviados: TAMANHO_BLOCO + 1,
        total: TAMANHO_BLOCO + 1,
      });
    });

    it("para no bloco seguinte quando o usuário manda parar, sem desfazer o que entrou", async () => {
      // "Parar" mantém o que já foi gravado — e isso é seguro justamente porque o
      // upsert é idempotente: reimportar depois atualiza, não duplica.
      setTableResult("candidatos", { data: null, error: null });
      const { result } = renderHookWithProviders(() => useImportarCandidatos());

      // O contador tem de ser incrementado DE FORA da chamada: `deveParar` é avaliado
      // no início de cada volta, então uma variável que só recebe valor quando
      // `importar` resolve continuaria valendo `[]` durante o laço inteiro — e o teste
      // passaria sem nunca ter mandado parar nada.
      let blocosEnviados = 0;
      let resultados: ResultadoBloco[] = [];
      await act(async () => {
        resultados = await result.current.importar({
          candidatos: lote(TAMANHO_BLOCO * 3),
          onProgresso: () => {
            blocosEnviados += 1;
          },
          deveParar: () => blocosEnviados >= 1,
        });
      });

      expect(resultados).toHaveLength(1);
      expect(buildersQueChamaram("candidatos", "upsert")).toHaveLength(1);
    });

    it("traduz o erro do bloco para o que corrigir na planilha", async () => {
      // Regra 4 de invariantes.md: barreira que devolve erro cru transfere o problema.
      setTableResult("candidatos", {
        data: null,
        error: erroPostgrest(
          CODIGOS_POSTGREST.DUPLICADO,
          'duplicate key value violates unique constraint "candidatos_cpf_cargo_id_inscricao_key"',
        ),
      });
      const { result } = renderHookWithProviders(() => useImportarCandidatos());

      let resultados: ResultadoBloco[] = [];
      await act(async () => {
        resultados = await result.current.importar({ candidatos: lote(1) });
      });

      expect(resultados[0].gravados).toBe(0);
      expect(resultados[0].erro).toMatch(/inscrições repetidas/i);
    });

    it("não interrompe a importação porque um bloco falhou", async () => {
      // Cada bloco é uma transação sua. Abortar tudo no primeiro erro faria a pessoa
      // perder milhares de linhas boas por causa de uma ruim.
      setTableResult("candidatos", {
        data: null,
        error: erroPostgrest("23514", 'violates check constraint "chk_candidato_cpf_formato"'),
      });
      const { result } = renderHookWithProviders(() => useImportarCandidatos());

      let resultados: ResultadoBloco[] = [];
      await act(async () => {
        resultados = await result.current.importar({ candidatos: lote(TAMANHO_BLOCO + 1) });
      });

      expect(resultados).toHaveLength(2);
      expect(resultados.every((r) => r.erro !== null)).toBe(true);
    });
  });

  describe("useExcluirCandidatos", () => {
    it("exclui um inscrito pelo id", async () => {
      setTableResult("candidatos", { data: null, error: null });
      const { result } = renderHookWithProviders(() => useExcluirCandidatos());

      result.current.excluirUm("cand-1");

      await waitFor(() =>
        expect(builderQueChamou("candidatos", "delete").eq).toHaveBeenCalledWith("id", "cand-1"),
      );
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Candidato excluído" }),
      );
    });

    it("limpa o edital filtrando por edital_id, e diz quantos saíram", async () => {
      setTableResult("candidatos", apagados(7416));
      const { result } = renderHookWithProviders(() => useExcluirCandidatos());

      result.current.excluirDoEdital(EDITAL_ID);

      await waitFor(() =>
        expect(builderQueChamou("candidatos", "delete").eq).toHaveBeenCalledWith(
          "edital_id",
          EDITAL_ID,
        ),
      );
      // O número vem do `count` do servidor: é a confirmação de que a ação atingiu o
      // que a tela prometeu, e não um "pronto!" sem lastro.
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: expect.stringContaining("7416") }),
        ),
      );
    });

    it("explica o bloqueio de permissão em vez de repetir a mensagem do Postgres", async () => {
      setTableResult("candidatos", {
        data: null,
        error: erroPostgrest("42501", "new row violates row-level security policy"),
      });
      const { result } = renderHookWithProviders(() => useExcluirCandidatos());

      result.current.excluirUm("cand-1");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao excluir candidato",
            description: expect.stringMatching(/administrador/i),
            variant: "destructive",
          }),
        ),
      );
    });
  });
});
