/**
 * Bateria da tela do quadro de alocação (`/alocacao-candidatos/:provaId`).
 *
 * ⚠️ **A barreira NÃO é esta tela.** Quem recusa sala lotada, edital errado, prova
 * finalizada e duplicata é o banco (migration 20260804225156), verificado por
 * `docs/bateria-alocacao-candidatos.sql` — a suíte mocka o Supabase. O que se fixa aqui
 * é o dever da tela: mostrar os números certos, EXPLICAR o congelamento em vez de deixar
 * o clique morrer no trigger, e a confirmação do distribuir dizer o que será refeito.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  supabaseMock,
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

import AlocacaoCandidatosProva from "./AlocacaoCandidatosProva";

const PROVA_ID = "prova-1";
const EDITAL_ID = "edital-1";

const prova = (prova_finalizada: boolean) => ({
  id: PROVA_ID,
  prova_edital: "Edital 001/2026 SMA",
  edital_id: EDITAL_ID,
  prova_data: "2026-03-08",
  prova_finalizada,
  finalizada_at: null,
  created_at: null,
  updated_at: null,
  // created_by nulo DE PROPÓSITO: com autor, useProvas dispara a segunda consulta
  // (profiles) e este teste passaria a depender de mais uma fixture sem ganhar nada.
  created_by: null,
  editais: { nome: "Edital 001/2026 SMA" },
});

const VINCULO = {
  id: "pu-1",
  prova_id: PROVA_ID,
  unidade_id: "unid-1",
  unidade_finalizada: false,
  unidade_finalizada_at: null,
  created_at: null,
  created_by: null,
  unidades_prova: { id: "unid-1", unid_nome: "ESCOLA MUNICIPAL X", unid_sigla: "EMX" },
};

const SALAS = [
  {
    id: "sala-1",
    prova_id: PROVA_ID,
    sala_fk_unidade: "unid-1",
    sala_numero: 101,
    sala_capacidade: 30,
    sala_andar: 1,
    sala_descricao: null,
    sala_fiscal_1: null,
    sala_fiscal_2: null,
    created_at: null,
    updated_at: null,
    created_by: null,
  },
  {
    id: "sala-2",
    prova_id: PROVA_ID,
    sala_fk_unidade: "unid-1",
    sala_numero: 102,
    sala_capacidade: 30,
    sala_andar: 1,
    sala_descricao: null,
    sala_fiscal_1: null,
    sala_fiscal_2: null,
    created_at: null,
    updated_at: null,
    created_by: null,
  },
];

const ESPECIAL_PENDENTE = {
  candidato_id: "cand-9",
  n_inscricao: "375",
  nome: "IARA ESPECIAL",
  cargo: "DOCENTE II",
  sala_especial: "Sala térrea e ledor",
  portador_deficiencia: false,
  sala_id: null,
};

function montarCenario({ finalizada = false } = {}) {
  setTableResult("provas", { data: [prova(finalizada)], error: null });
  setTableResult("prova_unidades", { data: [VINCULO], error: null });
  setTableResult("salas_prova_distribuidas", { data: SALAS, error: null });
  setTableResult("candidatos_alocacao", { data: [], error: null });
  setRpcResult("contar_candidatos_por_edital", {
    data: [{ edital_id: EDITAL_ID, total: 7231 }],
    error: null,
  });
  setRpcResult("contar_alocados_por_sala", {
    data: [
      { sala_id: "sala-1", total: 30 },
      { sala_id: "sala-2", total: 12 },
    ],
    error: null,
  });
  setRpcResult("especiais_da_prova", { data: [ESPECIAL_PENDENTE], error: null });
}

function renderPagina() {
  return renderWithProviders(
    <Routes>
      <Route path="/alocacao-candidatos/:provaId" element={<AlocacaoCandidatosProva />} />
      <Route path="*" element={<span>SAIU DA PÁGINA</span>} />
    </Routes>,
    { route: `/alocacao-candidatos/${PROVA_ID}` },
  );
}

beforeEach(() => {
  resetSupabaseMock();
});

describe("o resumo diz os três números", () => {
  it("inscritos do edital, alocados (soma da ocupação) e pendentes", async () => {
    montarCenario();
    renderPagina();

    // 7.231 do edital; 30 + 12 = 42 alocados; 1 pendente de atendimento especial.
    await waitFor(() => {
      expect(screen.getByText(/7\.231 inscrito/)).toBeInTheDocument();
    });
    expect(screen.getByText(/42 alocado/)).toBeInTheDocument();
    expect(screen.getByText(/1 pedido\(s\) de atendimento especial pendente/)).toBeInTheDocument();
  });

  it("a ocupação de cada sala aparece como ocupados / capacidade", async () => {
    montarCenario();
    renderPagina();

    await waitFor(() => {
      expect(screen.getByText("30 / 30")).toBeInTheDocument();
    });
    expect(screen.getByText("12 / 30")).toBeInTheDocument();
  });
});

describe("atendimento especial", () => {
  it("o pendente aparece com o TEXTO do pedido e a ação de incluir", async () => {
    montarCenario();
    renderPagina();

    await waitFor(() => {
      expect(screen.getByText("IARA ESPECIAL")).toBeInTheDocument();
    });
    // O texto do pedido é a informação que decide a sala — sem ele a linha não serve.
    expect(screen.getByText("Sala térrea e ledor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /incluir em sala/i })).toBeInTheDocument();
  });
});

describe("distribuir", () => {
  it("a confirmação diz o que será REFEITO e o que é preservado, e só então chama a RPC", async () => {
    montarCenario();
    setRpcResult("distribuir_candidatos_da_prova", {
      data: [{ alocados: 42, preservados: 1, pendentes_especiais: 1 }],
      error: null,
    });
    const user = userEvent.setup();
    renderPagina();

    await user.click(await screen.findByRole("button", { name: /distribuir automaticamente/i }));

    // As duas metades da promessa: refaz o automático, preserva o manual.
    expect(await screen.findByText(/REFAZ/)).toBeInTheDocument();
    expect(screen.getByText(/feitas à mão são preservadas/)).toBeInTheDocument();
    // Confirmar é o que dispara — abrir o diálogo NÃO pode ter chamado a RPC.
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith(
      "distribuir_candidatos_da_prova",
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: /^distribuir$/i }));
    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledWith("distribuir_candidatos_da_prova", {
        p_prova_id: PROVA_ID,
      });
    });
  });
});

describe("prova finalizada — a tela explica, não deixa o clique morrer no trigger", () => {
  it("banner de somente leitura + distribuir desabilitado + sem incluir", async () => {
    montarCenario({ finalizada: true });
    renderPagina();

    expect(
      await screen.findByText(/finalizada: a alocação é somente leitura/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /distribuir automaticamente/i })).toBeDisabled();
    // O pendente continua LISTADO (informação) e a ação fica DESABILITADA — mesmo
    // tratamento do Distribuir: o controle não some, explica-se pelo banner acima.
    await waitFor(() => {
      expect(screen.getByText("IARA ESPECIAL")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /incluir em sala/i })).toBeDisabled();
  });
});

describe("os vazios são mensagens diferentes", () => {
  it("prova sem salas manda vincular unidades — não confunde com 'ninguém alocado'", async () => {
    montarCenario();
    setTableResult("salas_prova_distribuidas", { data: [], error: null });
    renderPagina();

    expect(
      await screen.findByText(/não tem salas: vincule unidades/i),
    ).toBeInTheDocument();
  });

  it("falha na ocupação vira AVISO, não zeros com cara de verdade", async () => {
    // É o "vazio enquanto carrega" com a segunda porta: erro e vazio dão o mesmo `{}`.
    montarCenario();
    setRpcResult("contar_alocados_por_sala", {
      data: null,
      error: erroPostgrest("42501", "permission denied"),
    });
    renderPagina();

    expect(
      await screen.findByText(/não foi possível carregar a ocupação/i),
    ).toBeInTheDocument();
  });
});
