import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/test/utils";
import PerfilColaborador from "@/pages/PerfilColaborador";
import { resetSupabaseMock, setRpcResult, setTableResult } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const auth = vi.hoisted(() => ({ atual: null as unknown, signOut: null as unknown }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => auth.atual,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

/**
 * 🔴 O BECO SEM SAÍDA do portal do colaborador.
 *
 * Até 2026-09-18 o ramo "não achei o cadastro" renderizava só `<p>Dados não
 * encontrados.</p>`: sem header, sem logo e **sem botão Sair**. Como `/auth` rebate quem
 * já está logado, a única saída era esperar os 5 minutos do `INACTIVITY_TIMEOUT`.
 *
 * Isso era teórico enquanto ninguém era mandado para cá. Deixou de ser no mesmo dia, ao
 * passar a redirecionar o colaborador sem gestão para esta página: quem tem o papel
 * `colaborador` sem linha em `colaboradores` (1 conta em 53, medido) cai exatamente
 * neste ramo. O papel sobrevive à exclusão da linha e nada o revoga.
 *
 * O contrato que estes testes fixam: **de toda tela deste portal dá para SAIR**, e a
 * recusa diz o que fazer.
 */
describe("PerfilColaborador — sem cadastro vinculado", () => {
  const signOut = vi.fn();

  beforeEach(() => {
    resetSupabaseMock();
    signOut.mockClear();
    // A RPC responde vazio: é a conta com papel `colaborador` e sem linha.
    setRpcResult("get_meu_colaborador", { data: [], error: null });
    setTableResult("bancos", { data: [], error: null });
    auth.atual = {
      user: { id: "u-1", email: "orfa@fevre.test", user_metadata: {} },
      loading: false,
      rolesLoaded: true,
      isColaborador: true,
      isColaboradorSemGestao: true,
      signOut,
    };
  });

  function montar() {
    return render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PerfilColaborador />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("oferece uma saída — o botão Sair, que desloga de verdade", async () => {
    const user = userEvent.setup();
    montar();

    const sair = await screen.findByRole("button", { name: /Sair/i });
    await user.click(sair);

    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("nomeia a providência em vez de só dizer que não achou", async () => {
    montar();

    expect(await screen.findByText(/Cadastro não localizado/i)).toBeInTheDocument();
    // "Dados não encontrados." era verdade e não ajudava ninguém: quem lê precisa saber
    // com quem falar. É a regra do §2 do CLAUDE.md — a recusa nomeia o que fazer.
    expect(screen.getByText(/[Ff]ale com a coordenação/)).toBeInTheDocument();
  });

  it("NÃO oferece a troca de senha neste estado", async () => {
    // O card de senha é do caminho normal. Aqui a pessoa não tem cadastro: o que ela
    // precisa é sair e falar com a coordenação, não mexer na conta.
    montar();

    await screen.findByText(/Cadastro não localizado/i);
    expect(screen.queryByLabelText("Nova Senha")).not.toBeInTheDocument();
  });
});
