/**
 * O aviso de saída por inatividade na porta única (2026-11-03). O motivo chega pela URL
 * (`/auth?sessao=inatividade`) porque o `signOut` faz reload duro, que apaga toast e state.
 */
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    role: null,
    roles: [],
    rolesLoaded: true,
    isAdmin: false,
    isSuperAdmin: false,
    isCoordenador: false,
    isColaborador: false,
    isFinanceiro: false,
    isColaboradorSemGestao: false,
    isLoggingOut: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

import Auth from "./Auth";

const AVISO = /Você foi desconectado por inatividade/;

describe("Auth — aviso de saída por inatividade", () => {
  it("🔴 chegando de uma saída por inatividade, explica o porquê", () => {
    renderWithProviders(<Auth />, { route: "/auth?sessao=inatividade" });
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it("⭐ CONTROLE POSITIVO: entrada normal em /auth não mostra o aviso", () => {
    renderWithProviders(<Auth />, { route: "/auth" });
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });
});
