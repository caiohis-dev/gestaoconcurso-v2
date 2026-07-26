import { describe, it, expect, beforeEach } from "vitest";
import {
  supabaseMock,
  setTableResult,
  setTableResultSequence,
  setRpcResult,
  setFunctionResult,
  resetSupabaseMock,
  erroPostgrest,
  CODIGOS_POSTGREST,
  buildersDaTabela,
  builderQueChamou,
} from "@/test/supabase-mock";

/**
 * O mock do Supabase é infraestrutura usada por todos os testes de hook. Se ele
 * mentir, os testes que dependem dele passam ou falham pelo motivo errado — então
 * ele próprio precisa de teste. Isto valida o contrato que os hooks assumem.
 */
describe("mock do client do Supabase", () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it("resolve o builder encadeado como o supabase-js faz (só ao aguardar)", async () => {
    const editais = [{ id: "e1", nome: "Edital 001/2026" }];
    setTableResult("editais", { data: editais, error: null });

    const resultado = await supabaseMock
      .from("editais")
      .select("*")
      .order("nome", { ascending: true });

    expect(resultado).toEqual({ data: editais, error: null });
  });

  it("suporta .single() como terminal", async () => {
    setTableResult("provas", { data: { id: "p1" }, error: null });

    const { data, error } = await supabaseMock
      .from("provas")
      .select("*")
      .eq("id", "p1")
      .single();

    expect(data).toEqual({ id: "p1" });
    expect(error).toBeNull();
  });

  it("propaga erro do PostgREST com o código, que é o que os hooks traduzem", async () => {
    setTableResult("editais", {
      data: null,
      error: erroPostgrest(CODIGOS_POSTGREST.DUPLICADO),
    });

    const { data, error } = await supabaseMock.from("editais").insert({}).select().single();

    expect(data).toBeNull();
    expect(error?.code).toBe("23505");
  });

  it("isola resultados por tabela", async () => {
    setTableResult("editais", { data: [{ id: "e1" }], error: null });
    setTableResult("provas", { data: [], error: null });

    await expect(supabaseMock.from("editais").select("*")).resolves.toMatchObject({
      data: [{ id: "e1" }],
    });
    await expect(supabaseMock.from("provas").select("*")).resolves.toMatchObject({
      data: [],
    });
  });

  it("devolve resultado vazio para tabela não configurada, sem lançar", async () => {
    await expect(supabaseMock.from("tabela_qualquer").select("*")).resolves.toEqual({
      data: null,
      error: null,
    });
  });

  describe("sequência por tabela", () => {
    it("devolve resultados em ordem para chamadas sucessivas da mesma tabela", async () => {
      // O caso que motivou o recurso: prova_unidades lida primeiro como objeto
      // (.single()) e depois como lista, dentro do mesmo queryFn.
      setTableResultSequence("prova_unidades", [
        { data: { prova_id: "p1" }, error: null },
        { data: [{ id: "pu1" }, { id: "pu2" }], error: null },
      ]);

      const primeira = await supabaseMock.from("prova_unidades").select("prova_id").single();
      const segunda = await supabaseMock.from("prova_unidades").select("id").eq("prova_id", "p1");

      expect(primeira.data).toEqual({ prova_id: "p1" });
      expect(segunda.data).toEqual([{ id: "pu1" }, { id: "pu2" }]);
    });

    it("repete o último resultado depois de esgotada", async () => {
      // Importante para o React Query: um refetch não pode zerar o cenário.
      setTableResultSequence("provas", [{ data: [{ id: "a" }], error: null }]);

      await supabaseMock.from("provas").select("*");
      const terceira = await supabaseMock.from("provas").select("*");

      expect(terceira.data).toEqual([{ id: "a" }]);
    });

    it("é resetada pelo resetSupabaseMock", async () => {
      setTableResultSequence("provas", [{ data: [{ id: "a" }], error: null }]);
      resetSupabaseMock();

      await expect(supabaseMock.from("provas").select("*")).resolves.toEqual({
        data: null,
        error: null,
      });
    });
  });

  it("atende rpc por nome", async () => {
    setRpcResult("get_coordenador_colaboradores", {
      data: [{ id: "c1" }],
      error: null,
    });

    const { data } = await supabaseMock.rpc("get_coordenador_colaboradores", {});
    expect(data).toEqual([{ id: "c1" }]);
  });

  it("registra as chamadas para permitir asserção de argumentos", async () => {
    setTableResult("editais", { data: [], error: null });

    const builder = supabaseMock.from("editais");
    await builder.select("*").eq("id", "e1");

    expect(supabaseMock.from).toHaveBeenCalledWith("editais");
    expect(builder.eq).toHaveBeenCalledWith("id", "e1");
  });

  describe("builderQueChamou", () => {
    it("acha o builder da mutation mesmo com um refetch depois", async () => {
      // Reproduz o padrão real: a mutation faz insert e, ao concluir, a query é
      // invalidada e refaz o select — então o ÚLTIMO builder é o do refetch.
      setTableResult("editais", { data: [], error: null });

      await supabaseMock.from("editais").select("*"); //   listagem inicial
      await supabaseMock.from("editais").insert({ nome: "x" }); // a mutation
      await supabaseMock.from("editais").select("*"); //   refetch

      const mutacao = builderQueChamou("editais", "insert");
      expect(mutacao.insert).toHaveBeenCalledWith({ nome: "x" });
      // O ingênuo `.at(-1)` pegaria o refetch, que nunca chamou insert.
      expect(buildersDaTabela("editais")).toHaveLength(3);
    });

    it("lança mensagem útil quando ninguém chamou o método", () => {
      expect(() => builderQueChamou("editais", "delete")).toThrow(/Nenhum builder/);
    });
  });

  describe("Edge Functions", () => {
    it("atende functions.invoke por nome", async () => {
      setFunctionResult("create-coordenador", { data: { success: true }, error: null });

      await expect(supabaseMock.functions.invoke("create-coordenador", {})).resolves.toEqual({
        data: { success: true },
        error: null,
      });
    });

    it("aceita erro no formato do FunctionsHttpError, não só do PostgREST", async () => {
      // Erro de EF é outra coisa: o supabase-js embrulha o corpo da resposta HTTP em
      // `context.body` como STRING, e quem consome desserializa para achar a mensagem
      // (é o que o CoordenadoresProvaDialog faz). O tipo do mock só cobria erro do
      // PostgREST, então esse teste só compilava com cast — daí o `FunctionErrorLike`.
      setFunctionResult("create-coordenador", {
        data: null,
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: { body: JSON.stringify({ error: "CPF já vinculado" }) },
        },
      });

      const { error } = await supabaseMock.functions.invoke("create-coordenador", {});
      expect(JSON.parse((error as { context: { body: string } }).context.body)).toEqual({
        error: "CPF já vinculado",
      });
    });
  });

  it("resetSupabaseMock limpa resultados e histórico entre testes", async () => {
    setTableResult("editais", { data: [{ id: "e1" }], error: null });
    await supabaseMock.from("editais").select("*");

    resetSupabaseMock();

    expect(supabaseMock.from).not.toHaveBeenCalled();
    await expect(supabaseMock.from("editais").select("*")).resolves.toEqual({
      data: null,
      error: null,
    });
  });
});
