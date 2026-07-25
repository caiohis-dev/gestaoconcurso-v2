/**
 * Mock reutilizável do client do Supabase.
 *
 * Todas as requisições do app passam pelo client exportado em
 * `src/integrations/supabase/client.ts`, então mockar aquele módulo cobre 100% do
 * acesso a dados. Uso, no topo do arquivo de teste:
 *
 *   vi.mock("@/integrations/supabase/client", async () => {
 *     const { supabaseMock } = await import("@/test/supabase-mock");
 *     return { supabase: supabaseMock };
 *   });
 *
 * A fábrica é `async` de propósito: `vi.mock` é içado para o topo do arquivo, então
 * uma referência direta a `supabaseMock` no escopo do módulo daria ReferenceError.
 * O `await import` adia a resolução para depois do içamento.
 *
 * Depois, no teste, defina o que cada tabela/RPC devolve:
 *
 *   setTableResult("editais", { data: [umEdital], error: null });
 *   setTableResult("editais", { data: null, error: erroPostgrest("23505") });
 */
import { vi, type Mock } from "vitest";

export interface PostgrestErrorLike {
  code: string;
  message: string;
  details: string;
  hint: string;
}

export interface QueryResult<T = unknown> {
  data: T | null;
  error: PostgrestErrorLike | null;
}

/** Códigos que os hooks deste projeto traduzem para mensagem em PT-BR. */
export const CODIGOS_POSTGREST = {
  /** unique_violation — nome de edital repetido, CPF/e-mail/PIX duplicado. */
  DUPLICADO: "23505",
  /** foreign_key_violation — ex.: apagar edital com provas (ON DELETE RESTRICT). */
  CHAVE_ESTRANGEIRA: "23503",
} as const;

export function erroPostgrest(
  code: string,
  message = `erro simulado ${code}`,
): PostgrestErrorLike {
  return { code, message, details: "", hint: "" };
}

const RESULTADO_VAZIO: QueryResult = { data: null, error: null };

// Resultado corrente por tabela e por RPC. Um Map por chave, resetado entre testes.
const resultadosPorTabela = new Map<string, QueryResult>();
const resultadosPorRpc = new Map<string, QueryResult>();
const resultadosPorFunction = new Map<string, QueryResult>();

/**
 * Métodos do PostgrestFilterBuilder que devolvem o próprio builder (encadeáveis).
 * Não é a lista exaustiva do supabase-js — é a que este codebase usa, mais os
 * vizinhos óbvios. Se um teste quebrar com "x is not a function", acrescente aqui.
 */
const METODOS_ENCADEAVEIS = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte",
  "like", "ilike", "is", "in", "contains", "containedBy",
  "not", "or", "and", "filter", "match",
  "order", "limit", "range", "abortSignal", "returns", "overrideTypes",
] as const;

type NomeEncadeavel = (typeof METODOS_ENCADEAVEIS)[number];

/** Método que devolve o próprio builder, e ainda é um spy inspecionável. */
type Encadeavel = Mock & ((...args: unknown[]) => QueryBuilderMock);
/** Terminal que resolve o resultado configurado. */
type Terminal = Mock & (() => Promise<QueryResult>);

/**
 * Builder encadeável e "thenable": `await supabase.from('x').select('*').eq(...)`
 * resolve para o resultado configurado, exatamente como o supabase-js real, que
 * também só dispara a requisição quando o builder é aguardado.
 */
export type QueryBuilderMock = { [K in NomeEncadeavel]: Encadeavel } & {
  single: Terminal;
  maybeSingle: Terminal;
  csv: Terminal;
} & PromiseLike<QueryResult>;

function criarQueryBuilder(obterResultado: () => QueryResult): QueryBuilderMock {
  const builder = {} as Record<string, unknown>;

  for (const metodo of METODOS_ENCADEAVEIS) {
    builder[metodo] = vi.fn(() => builder);
  }

  // Terminais que resolvem para um único registro.
  builder.single = vi.fn(() => Promise.resolve(obterResultado()));
  builder.maybeSingle = vi.fn(() => Promise.resolve(obterResultado()));
  builder.csv = vi.fn(() => Promise.resolve(obterResultado()));

  // Torna o próprio builder aguardável.
  builder.then = (
    onFulfilled?: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(obterResultado()).then(onFulfilled, onRejected);
  builder.catch = (onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(obterResultado()).catch(onRejected);
  builder.finally = (onFinally?: () => void) =>
    Promise.resolve(obterResultado()).finally(onFinally);

  // Duplo cast: o objeto é montado dinamicamente num Record, então o TS não vê as
  // 30 propriedades que o loop acabou de criar. O contrato de verdade é garantido
  // pelo supabase-mock.test.ts, não pelo compilador.
  return builder as unknown as QueryBuilderMock;
}

export const supabaseMock = {
  from: vi.fn((tabela: string) =>
    criarQueryBuilder(() => resultadosPorTabela.get(tabela) ?? RESULTADO_VAZIO),
  ),

  // Assinatura espelha a real: rpc(nome, params?). Vários hooks passam params.
  rpc: vi.fn((nome: string, _params?: Record<string, unknown>) =>
    criarQueryBuilder(() => resultadosPorRpc.get(nome) ?? RESULTADO_VAZIO),
  ),

  auth: {
    getUser: vi.fn(async () => ({
      data: { user: { id: "user-teste-1", email: "teste@fevre.test" } },
      error: null,
    })),
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({
      data: { user: null, session: null },
      error: null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  },

  functions: {
    invoke: vi.fn(
      async (nome: string, _options?: { body?: unknown; headers?: unknown }) =>
        resultadosPorFunction.get(nome) ?? RESULTADO_VAZIO,
    ),
  },
};

/** Define o que `supabase.from(<tabela>)` vai resolver. */
export function setTableResult<T>(tabela: string, resultado: QueryResult<T>): void {
  resultadosPorTabela.set(tabela, resultado as QueryResult);
}

/** Define o que `supabase.rpc(<nome>)` vai resolver. */
export function setRpcResult<T>(nome: string, resultado: QueryResult<T>): void {
  resultadosPorRpc.set(nome, resultado as QueryResult);
}

/** Define o que `supabase.functions.invoke(<nome>)` vai resolver. */
export function setFunctionResult<T>(nome: string, resultado: QueryResult<T>): void {
  resultadosPorFunction.set(nome, resultado as QueryResult);
}

/**
 * Limpa resultados configurados e o histórico de chamadas. Chame no `beforeEach`
 * — `restoreMocks` do vitest.config zera os spies, mas não estes Maps.
 */
export function resetSupabaseMock(): void {
  resultadosPorTabela.clear();
  resultadosPorRpc.clear();
  resultadosPorFunction.clear();
  supabaseMock.from.mockClear();
  supabaseMock.rpc.mockClear();
  supabaseMock.functions.invoke.mockClear();
  Object.values(supabaseMock.auth).forEach((fn) => {
    if (typeof fn === "function" && "mockClear" in fn) fn.mockClear();
  });
}
