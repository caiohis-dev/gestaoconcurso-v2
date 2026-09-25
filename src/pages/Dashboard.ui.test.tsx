import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/test/utils";
import Dashboard from "@/pages/Dashboard";
import { resetSupabaseMock, setRpcResult, setTableResult, supabaseMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin-1" }, loading: false, isAdmin: true, role: "admin" }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

// O Layout monta header e navegação, que não são o assunto aqui.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/**
 * 🔵 2026-09-24. "Já atuaram" e a capacidade total vêm da RPC `totais_do_dashboard`, que
 * agrega no banco. Até ali a tela lia `colaboradores_prova` e `sala_prova` INTEIRAS e
 * contava no cliente — e o PostgREST corta em 1000 linhas SEM ERRO (`colaboradores_prova`
 * já tinha 977). O que a função calcula e o que a RLS deixa ela ver é a bateria
 * `docs/bateria-totais-do-dashboard.sql`; aqui se afirma só o que a TELA faz.
 */
describe("Dashboard — totais agregados no banco", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableResult("provas", { data: null, error: null, count: 3 } as never);
    setTableResult("unidades_prova", { data: null, error: null, count: 12 } as never);
    setTableResult("colaboradores", { data: null, error: null, count: 821 } as never);
    setTableResult("sala_prova", { data: null, error: null, count: 57 } as never);
    setRpcResult("totais_do_dashboard", {
      data: [{ colaboradores_atuaram: 625, capacidade_total: 1770 }],
      error: null,
    });
  });

  function montar() {
    return render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("mostra os números que a RPC devolve", async () => {
    montar();
    expect(await screen.findByText("625")).toBeInTheDocument();
    // `toLocaleString('pt-BR')` — busca exata, porque "1770" sem ponto não aparece.
    expect(screen.getByText("1.770")).toBeInTheDocument();
    // "Nunca atuaram" = total de colaboradores − os que atuaram.
    expect(screen.getByText("196")).toBeInTheDocument();
  });

  it("🔴 NÃO lê mais colaboradores_prova — a tabela que batia no teto", async () => {
    montar();
    await screen.findByText("625");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("totais_do_dashboard");
    expect(supabaseMock.from.mock.calls.map((c) => c[0])).not.toContain("colaboradores_prova");
  });

  it("🔴 sala_prova só é CONTADA (head), nunca baixada para somar no cliente", async () => {
    montar();
    await screen.findByText("625");
    const selectsDeSala = supabaseMock.from.mock.calls
      .map((c, i) => ({ tabela: c[0], builder: supabaseMock.from.mock.results[i].value }))
      .filter((c) => c.tabela === "sala_prova")
      .map((c) => c.builder.select.mock.calls[0]);
    expect(selectsDeSala).toHaveLength(1);
    expect(selectsDeSala[0][1]).toEqual({ count: "exact", head: true });
  });
});
