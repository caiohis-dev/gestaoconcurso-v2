/**
 * Bateria da coluna "Vagas" e do totalizador de `/unidades-prova` (2026-08-04).
 *
 * O que se fixa aqui NÃO é o leiaute: é que a tela **nunca afirme zero sem ter contado**.
 * A consulta de capacidades devolve o mesmo `{}` em três situações diferentes — ainda
 * carregando, falhou, e nenhuma sala cadastrada —, e confundi-las produziria a classe de
 * defeito que mais se repete neste repo ("vazio enquanto carrega"), agora sobre um número
 * que decide onde caberão milhares de inscritos.
 *
 * ⚠️ A fonte é o CADASTRO (`sala_prova`), nunca o snapshot da prova: aqui não há prova no
 * contexto. Ler `salas_prova_distribuidas` mostraria zero para toda unidade não vinculada
 * — número plausível e sempre errado.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import {
  setTableResult,
  resetSupabaseMock,
  erroPostgrest,
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

import UnidadesProva from "./UnidadesProva";

const UNIDADES = [
  {
    id: "u-1",
    unid_nome: "CGV - Bloco Central",
    // CHAR(10) no banco: vem preenchido com espaços à direita.
    unid_sigla: "CGV       ",
    created_at: null,
    updated_at: null,
    created_by: null,
  },
  {
    id: "u-2",
    unid_nome: "UGB - Bloco II",
    unid_sigla: "UGB-II    ",
    created_at: null,
    updated_at: null,
    created_by: null,
  },
];

/** Duas salas na u-1 (480 + 780) e NENHUMA na u-2 — o caso comum, medido em 03/08. */
const SALAS_DO_CADASTRO = [
  { sala_fk_unidade: "u-1", sala_capacidade: 480 },
  { sala_fk_unidade: "u-1", sala_capacidade: 780 },
];

const linhaDa = (nome: string) => screen.getByText(nome).closest("tr") as HTMLElement;

/**
 * O bloco do totalizador. Escopar é necessário, não estético: com uma só unidade servida,
 * o total e a célula daquela unidade são o MESMO texto — buscar solto acharia os dois e
 * o teste passaria olhando para a célula, provando outra coisa.
 */
const totalizador = () =>
  screen.getByText("Total de vagas cadastradas").parentElement as HTMLElement;

beforeEach(() => {
  resetSupabaseMock();
  setTableResult("unidades_prova", { data: UNIDADES, error: null });
});

describe("a coluna Vagas", () => {
  it("soma as salas do CADASTRO por unidade", async () => {
    setTableResult("sala_prova", { data: SALAS_DO_CADASTRO, error: null });
    renderWithProviders(<UnidadesProva />);

    await waitFor(() => {
      expect(within(linhaDa("CGV - Bloco Central")).getByText("1.260")).toBeInTheDocument();
    });
  });

  it("🔴 unidade sem sala diz POR QUE está zerada, em vez de mostrar 0", async () => {
    // Medido em 03/08: 7 das 11 unidades do banco não têm sala nenhuma. Um "0" seria
    // verdade e não ajudaria; a frase manda a pessoa para /salas-prova.
    setTableResult("sala_prova", { data: SALAS_DO_CADASTRO, error: null });
    renderWithProviders(<UnidadesProva />);

    await waitFor(() => {
      expect(
        within(linhaDa("UGB - Bloco II")).getByText("sem salas cadastradas"),
      ).toBeInTheDocument();
    });
  });
});

describe("o totalizador do topo", () => {
  it("soma as unidades EXIBIDAS e diz quantas ainda não têm sala", async () => {
    setTableResult("sala_prova", { data: SALAS_DO_CADASTRO, error: null });
    renderWithProviders(<UnidadesProva />);

    await waitFor(() => {
      expect(within(totalizador()).getByText("1.260")).toBeInTheDocument();
    });
    expect(within(totalizador()).getByText(/em 1 de 2 unidades/)).toBeInTheDocument();
    expect(within(totalizador()).getByText(/1 sem salas cadastradas/)).toBeInTheDocument();
  });

  it("⭐ CONTROLE POSITIVO: com todas as unidades servidas, não sobra a ressalva", async () => {
    setTableResult("sala_prova", {
      data: [...SALAS_DO_CADASTRO, { sala_fk_unidade: "u-2", sala_capacidade: 350 }],
      error: null,
    });
    renderWithProviders(<UnidadesProva />);

    await waitFor(() => {
      expect(within(totalizador()).getByText("1.610")).toBeInTheDocument();
    });
    expect(within(totalizador()).getByText(/em 2 de 2 unidades/)).toBeInTheDocument();
    expect(screen.queryByText(/sem salas cadastradas/)).not.toBeInTheDocument();
  });
});

describe("🔴 a consulta que FALHOU não vira zero", () => {
  it("avisa que não deu para contar, e não exibe o totalizador", async () => {
    setTableResult("sala_prova", {
      data: null,
      error: erroPostgrest("42501", "permission denied for table sala_prova"),
    });
    renderWithProviders(<UnidadesProva />);

    expect(await screen.findByText(/não foi possível contar as vagas/i)).toBeInTheDocument();
    // O par que importa: nem o total nem um "0" aparecem no lugar dele.
    expect(screen.queryByText(/Total de vagas cadastradas/)).not.toBeInTheDocument();
    expect(screen.queryByText("sem salas cadastradas")).not.toBeInTheDocument();
  });

  it("com a falha, a célula de cada unidade fica em '—' — nunca em 0", async () => {
    setTableResult("sala_prova", {
      data: null,
      error: erroPostgrest("42501", "permission denied for table sala_prova"),
    });
    renderWithProviders(<UnidadesProva />);

    await waitFor(() => {
      expect(within(linhaDa("CGV - Bloco Central")).getByText("—")).toBeInTheDocument();
    });
    expect(within(linhaDa("UGB - Bloco II")).getByText("—")).toBeInTheDocument();
  });
});
