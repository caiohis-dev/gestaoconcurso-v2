import { describe, it, expect, beforeEach } from "vitest";
import {
  supabaseMock,
  setTableResult,
  setTableResultSequence,
  setRpcResult,
  resetSupabaseMock,
  erroPostgrest,
  CODIGOS_POSTGREST,
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
