/**
 * Bateria do LOCK DE EDIÇÃO de `GerenciarColaboradoresProva`.
 *
 * 🔴 **Por que esta tela ganhou teste de página em 2026-09-16.** O lock nunca
 * funcionou: a página passava o `prova_unidades.id` da rota para o hook no campo
 * `provaId`, e ele ia parar numa coluna com FK para `provas(id)`. Todo mount morria em
 * 23503 — 500+ erros por dia no log de produção, desde o commit inicial. E falhava
 * CALADO: o erro não é `isLocked`, e o portão da tela só barra em `isLocked`, então a
 * página abria normalmente com a proteção inexistente.
 *
 * ⚠️ **Nenhum dos 14 testes de `useProvaUnidadeLock.test.tsx` podia pegar isso** — eles
 * exercitam o hook com os parâmetros que o próprio teste passa. O defeito estava na
 * LIGAÇÃO: qual id a página entrega. É só isso que se testa aqui, de propósito;
 * `GerenciarColaboradoresProva` é uma página de ~1000 linhas e testá-la inteira
 * compraria fragilidade sem comprar garantia (mesma escolha de `GerenciarProva`).
 *
 * A outra metade da prova é `docs/bateria-lock-edicao-unidade.sql`, contra o banco de
 * verdade: aqui o Supabase é mock e aceitaria qualquer string como uuid.
 *
 * Ver as 12 armadilhas em `my_rules/estrutura/transversais/testes.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import {
  supabaseMock,
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
} from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-1", email: "admin@fevre.test", user_metadata: {} },
    session: null,
    loading: false,
    role: "admin",
    roles: ["admin"],
    rolesLoaded: true,
    isAdmin: true,
    isSuperAdmin: false,
    isCoordenador: false,
    isColaborador: false,
    isLoggingOut: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

import GerenciarColaboradoresProva from "./GerenciarColaboradoresProva";

/**
 * Os dois ids são DIFERENTES de propósito, e é esse o ponto da bateria: o defeito era
 * mandar um onde o banco exige o outro. Se algum dia forem iguais no fixture, o teste
 * passa a não provar nada.
 */
const PROVA_UNIDADE_ID = "pu-da-rota";
const PROVA_ID = "prova-dona-da-unidade";

const chamadasDe = (nome: string) =>
  supabaseMock.rpc.mock.calls.filter((c) => c[0] === nome);

function renderizar() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/gerenciar-colaboradores-prova/:provaUnidadeId"
        element={<GerenciarColaboradoresProva />}
      />
    </Routes>,
    { route: `/gerenciar-colaboradores-prova/${PROVA_UNIDADE_ID}` },
  );
}

describe("GerenciarColaboradoresProva — lock de edição", () => {
  beforeEach(() => {
    resetSupabaseMock();

    // A unidade da rota pertence a uma prova de id DIFERENTE.
    setTableResult("prova_unidades", {
      data: {
        prova_id: PROVA_ID,
        unidade_id: "unid-1",
        unidade_finalizada: false,
        unidade_finalizada_by: null,
        provas: { created_by: "u-1" },
      },
      error: null,
    });
    // 🔵 Não há mais consulta a `profiles` para o lock: o nome exibido sai de
    // `auth.uid()` dentro da RPC desde 2026-09-16.

    // As listas da página não são o assunto aqui, mas precisam existir: o mock devolve
    // `data: null` para tabela não configurada, e a página faz `.some()` em cima.
    for (const tabela of [
      "meta_colaboradores_unidade",
      "valores_funcao_prova",
      "colaboradores_prova",
      "funcoes_colaboradores",
      "provas",
      "unidades_prova",
      "salas_prova_distribuidas",
    ]) {
      setTableResult(tabela, { data: [], error: null });
    }
    setRpcResult("buscar_colaboradores_para_alocacao", { data: [], error: null });

    setRpcResult("acquire_prova_unidade_lock", { data: [{ success: true }], error: null });
  });

  it("pede o lock com o id da UNIDADE que veio da rota — nunca com o id da prova", async () => {
    renderizar();

    await waitFor(() => expect(chamadasDe("acquire_prova_unidade_lock")).toHaveLength(1));

    const [, params] = chamadasDe("acquire_prova_unidade_lock")[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(params).toEqual({ p_prova_unidade_id: PROVA_UNIDADE_ID });
    // A asserção que descreve o defeito de 2026-09-16 pelo nome.
    expect(params.p_prova_unidade_id).not.toBe(PROVA_ID);
  });

  it("AVISA na tela quando não consegue reservar a unidade", async () => {
    // O defeito não era só o id errado: era o erro não chegar a ninguém. Enquanto a
    // mensagem não aparecer, a tela mente por omissão — abre igual, sem proteção.
    const consoleErro = vi.spyOn(console, "error").mockImplementation(() => {});
    setRpcResult("acquire_prova_unidade_lock", {
      data: null,
      error: {
        code: "23503",
        message: 'insert or update on table "prova_unidade_edit_locks" violates foreign key constraint',
        details: "",
        hint: "",
      },
    });

    renderizar();

    expect(await screen.findByText(/Edição exclusiva indisponível/i)).toBeInTheDocument();
    consoleErro.mockRestore();
  });

  it("barra a tela quando outra pessoa está editando a unidade", async () => {
    setRpcResult("acquire_prova_unidade_lock", {
      data: [{ success: false, locked_by_name: "Bruno", locked_since: "2026-09-16T10:00:00.000Z" }],
      error: null,
    });

    renderizar();

    expect(await screen.findByText(/Unidade em edição/i)).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
  });
});
