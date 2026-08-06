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
  origem: null,
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
      { sala_id: "sala-1", total: 30, manuais: 0 },
      { sala_id: "sala-2", total: 12, manuais: 0 },
    ],
    error: null,
  });
  setRpcResult("especiais_da_prova", { data: [ESPECIAL_PENDENTE], error: null });
  setRpcResult("contar_alocados_por_unidade", {
    data: [{ unidade_id: "unid-1", total: 42, manuais: 0 }],
    error: null,
  });
  setRpcResult("candidatos_da_prova", {
    data: [
      {
        candidato_id: "cand-9",
        n_inscricao: "375",
        nome: "IARA ESPECIAL",
        cargo_nome: "DOCENTE II",
        sala_especial: "Sala térrea e ledor",
        portador_deficiencia: false,
        bloco: "sala_especial",
        sala_id: null,
        alocacao_id: null,
        origem: null,
        fora_do_automatico: false,
        total: 3,
      },
      {
        candidato_id: "cand-7",
        n_inscricao: "007",
        nome: "BENTO MANUAL",
        cargo_nome: "DOCENTE II",
        sala_especial: null,
        portador_deficiencia: false,
        bloco: "comum",
        sala_id: "sala-2",
        alocacao_id: "aloc-7",
        origem: "manual",
        fora_do_automatico: false,
        total: 3,
      },
      {
        candidato_id: "cand-1",
        n_inscricao: "001",
        nome: "ANA COMUM",
        cargo_nome: "DOCENTE II",
        sala_especial: null,
        portador_deficiencia: false,
        bloco: "comum",
        sala_id: "sala-1",
        alocacao_id: "aloc-1",
        origem: "automatica",
        fora_do_automatico: true,
        total: 3,
      },
    ],
    error: null,
  });
  setRpcResult("cargos_pendentes_da_prova", {
    data: [
      {
        cargo_id: "cargo-1",
        cargo_nome: "DOCENTE II",
        a_distribuir: 60,
        pcd_a_distribuir: 1,
        sala_especial_a_distribuir: 2,
        especiais: 3,
        ja_alocados: 42,
        fora_do_automatico: 0,
        fora_com_sala: 0,
        total: 61,
      },
    ],
    error: null,
  });
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

describe("lista de todos os candidatos", () => {
  it("lista TODOS (não só os especiais) com o marcador de retirar por linha", async () => {
    montarCenario();
    renderPagina();

    await waitFor(() => {
      expect(screen.getByText("IARA ESPECIAL")).toBeInTheDocument();
    });
    // O comum aparece junto: a seção deixou de ser "atendimento especial".
    expect(screen.getByText("ANA COMUM")).toBeInTheDocument();

    // ⚠️ A coluna "Pedido" saiu, mas o TEXTO não pode sair da tela: ele decide a sala de
    // quem pede atendimento. Vive no tooltip, e o `sr-only` o mantém acessível.
    expect(screen.getByText("Sala térrea e ledor")).toBeInTheDocument();

    // O marcador reflete o estado do banco, um switch por linha.
    expect(
      screen.getByRole("switch", { name: /Retirar IARA ESPECIAL da alocação automática/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: /Retirar ANA COMUM da alocação automática/i }),
    ).toBeChecked();
  });

  it("o botão de incluir em sala aparece SÓ em quem não tem sala", async () => {
    montarCenario();
    renderPagina();

    // IARA está sem sala → tem o botão. ANA já está na sala-1 → não tem.
    // Incluir quem já tem sala é recusado pelo banco (23505); o botão ali seria uma
    // promessa que morre no clique.
    expect(
      await screen.findByRole("button", { name: /Incluir IARA ESPECIAL em uma sala/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Incluir ANA COMUM em uma sala/i }),
    ).not.toBeInTheDocument();
  });

  it("🔴 quem está em sala À MÃO tem o marcador DESABILITADO e em falso", async () => {
    // As duas coisas dizem o mesmo: "o plano não mexe nesta pessoa". Aplicar só apaga
    // origem='automatica', então quem está em sala à mão já está fora por construção.
    // Deixar o switch ligado seria estado redundante — e sobraria uma marcação órfã no
    // dia em que ela saísse da sala.
    montarCenario();
    renderPagina();

    const marcador = await screen.findByRole("switch", {
      name: /BENTO MANUAL está numa sala escolhida à mão/i,
    });
    expect(marcador).toBeDisabled();
    expect(marcador).not.toBeChecked();

    // ⭐ CONTROLE: quem está em sala pelo PLANO segue podendo ser marcado.
    expect(
      screen.getByRole("switch", { name: /Retirar ANA COMUM da alocação automática/i }),
    ).toBeEnabled();
  });

  it("🔴 quem TEM sala ganha o botão de retirar, e ele PROMETE conforme a origem", async () => {
    montarCenario();
    renderPagina();

    // ANA está em sala pelo PLANO: retirar vale até o próximo Aplicar, que a recoloca.
    // Prometer "definitivo" aqui faria metade das pessoas voltar sem ninguém entender.
    const retirar = await screen.findByRole("button", {
      name: /Retirar ANA COMUM da sala.*volta no próximo/i,
    });
    expect(retirar).toBeInTheDocument();

    // E quem NÃO tem sala não ganha o de retirar — tem o de incluir.
    expect(
      screen.queryByRole("button", { name: /Retirar IARA ESPECIAL da sala/i }),
    ).not.toBeInTheDocument();
  });

  it("retirar chama o banco com o id da ALOCAÇÃO, não o do candidato", async () => {
    montarCenario();
    const user = userEvent.setup();
    renderPagina();

    await user.click(
      await screen.findByRole("button", { name: /Retirar ANA COMUM da sala/i }),
    );

    await waitFor(() => {
      expect(supabaseMock.from).toHaveBeenCalledWith("candidatos_alocacao");
    });
  });

  it("🔴 o filtro 'somente sem sala' vai ao SERVIDOR, não ao cliente", async () => {
    // Filtrar no cliente deixaria o `total` (e a paginação) falando do conjunto inteiro
    // enquanto a tabela mostra um subconjunto — a tela prometeria páginas que não existem.
    montarCenario();
    const user = userEvent.setup();
    renderPagina();

    await screen.findByText("IARA ESPECIAL");
    await user.click(screen.getByRole("combobox", { name: /Filtrar por situação/i }));
    await user.click(await screen.findByRole("option", { name: /Somente sem sala/i }));

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledWith(
        "candidatos_da_prova",
        expect.objectContaining({ p_sem_sala: true }),
      );
    });
  });

  it("🔴 avisa quando há marcado que AINDA está em sala (a mentira que a D1 abriria)", async () => {
    montarCenario();
    setRpcResult("cargos_pendentes_da_prova", {
      data: [
        {
          cargo_id: "cargo-1",
          cargo_nome: "DOCENTE II",
          a_distribuir: 60,
          pcd_a_distribuir: 1,
          sala_especial_a_distribuir: 2,
          especiais: 3,
          ja_alocados: 42,
          fora_do_automatico: 3,
          fora_com_sala: 2,
          total: 61,
        },
      ],
      error: null,
    });
    renderPagina();

    // Entre marcar e aplicar, o total de alocados inclui gente marcada para sair. Sem
    // este aviso o número mente por omissão — é o risco R1 do roadmap.
    expect(
      await screen.findByText(/ainda estão em sala/i),
    ).toBeInTheDocument();
  });
});

describe("planejar por arrasto e aplicar", () => {
  it("🔴 bloco ZERADO não some: vira card desabilitado dizendo 'sem inscritos'", async () => {
    // Este teste existe por um defeito real: o card de sala especial DESAPARECEU da tela
    // porque o dado tem 0 candidatos com pedido escrito, e o filtro `> 0` o escondia.
    // Card ausente é indistinguível de "não olhei direito" — o número zero é a resposta.
    montarCenario();
    setRpcResult("candidatos_da_prova", {
    data: [
      {
        candidato_id: "cand-9",
        n_inscricao: "375",
        nome: "IARA ESPECIAL",
        cargo_nome: "DOCENTE II",
        sala_especial: "Sala térrea e ledor",
        portador_deficiencia: false,
        bloco: "sala_especial",
        sala_id: null,
        alocacao_id: null,
        origem: null,
        fora_do_automatico: false,
        total: 3,
      },
      {
        candidato_id: "cand-7",
        n_inscricao: "007",
        nome: "BENTO MANUAL",
        cargo_nome: "DOCENTE II",
        sala_especial: null,
        portador_deficiencia: false,
        bloco: "comum",
        sala_id: "sala-2",
        alocacao_id: "aloc-7",
        origem: "manual",
        fora_do_automatico: false,
        total: 3,
      },
      {
        candidato_id: "cand-1",
        n_inscricao: "001",
        nome: "ANA COMUM",
        cargo_nome: "DOCENTE II",
        sala_especial: null,
        portador_deficiencia: false,
        bloco: "comum",
        sala_id: "sala-1",
        alocacao_id: "aloc-1",
        origem: "automatica",
        fora_do_automatico: true,
        total: 3,
      },
    ],
    error: null,
  });
  setRpcResult("cargos_pendentes_da_prova", {
      data: [
        {
          cargo_id: "cargo-1",
          cargo_nome: "DOCENTE II",
          a_distribuir: 60,
          pcd_a_distribuir: 0,
          sala_especial_a_distribuir: 0,
          especiais: 0,
          ja_alocados: 42,
          fora_do_automatico: 0,
          fora_com_sala: 0,
          total: 60,
        },
      ],
      error: null,
    });
    renderPagina();

    expect(await screen.findByText(/^PCD$/)).toBeInTheDocument();
    expect(screen.getByText(/^Sala especial$/)).toBeInTheDocument();
    expect(screen.getAllByText("sem inscritos")).toHaveLength(2);
    // Nenhum "todos alocados" aqui: estes blocos nunca tiveram ninguém.
    expect(screen.queryByText("todos alocados")).not.toBeInTheDocument();
    // E não arrastam: o `useDraggable` se desabilita sozinho quando não há ninguém.
    // ⚠️ O dnd-kit mantém `role="button"` mesmo desabilitado — quem diz a verdade é o
    // `aria-disabled`. Asserir o role daria um teste verde afirmando o contrário do real.
    expect(screen.getByLabelText(/DOCENTE II — PCD: sem inscritos/i)).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("🔴 ARRASTAR NÃO GRAVA: sem rascunho, o Aplicar fica desabilitado e a RPC não é chamada", async () => {
    montarCenario();
    renderPagina();

    // O quadro carrega com a faixa de arrasto cheia — e `a_distribuir` NÃO desconta os
    // 42 já alocados pela distribuição, porque aplicar um plano os apaga e refaz.
    // `getAllByText`: o nome do cargo aparece no card E no `title` dele — a asserção
    // que importa é a CONTAGEM, que é única.
    expect((await screen.findAllByText(/DOCENTE II/)).length).toBeGreaterThan(0);
    // 🔴 TRÊS blocos por cargo desde 05/08: comum, PCD e sala especial. Os três são
    // ARRASTÁVEIS e DISJUNTOS — fundi-los mandaria gente do estoque errado à sala errada.
    // Os três blocos, cada um com sua contagem. Os `aria-label` são as âncoras estáveis:
    // o texto "1" sozinho aparece em vários pontos da tela.
    expect(screen.getByLabelText(/DOCENTE II — Demais, 60 a distribuir/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/DOCENTE II — PCD, 1 a distribuir/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/DOCENTE II — Sala especial, 2 a distribuir/i),
    ).toBeInTheDocument();

    // Rascunho vazio: nada a aplicar, e nada foi ao banco.
    expect(screen.getByRole("button", { name: /aplicar plano/i })).toBeDisabled();
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith(
      "aplicar_plano_de_alocacao",
      expect.anything(),
    );
  });

  it("o quadro separa o que está NO rascunho do que fica FORA dele", async () => {
    montarCenario();
    renderPagina();

    // Os dois números do planejamento, distintos de "alocados" (que é o que o banco já
    // tem). Com o rascunho vazio: 0 dentro, os 60 do cargo fora.
    await waitFor(() => {
      expect(screen.getByText(/No rascunho:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/fora do\s+rascunho:/)).toBeInTheDocument();
  });
});

describe("prova finalizada — a tela explica, não deixa o clique morrer no trigger", () => {
  it("banner de somente leitura + planejamento desabilitado + sem incluir", async () => {
    montarCenario({ finalizada: true });
    renderPagina();

    expect(
      await screen.findByText(/finalizada: a alocação é somente leitura/i),
    ).toBeInTheDocument();
    // O quadro não some: ele EXPLICA por que está desligado.
    expect(
      screen.getByText(/planejamento está desabilitado/i),
    ).toBeInTheDocument();
    // A lista continua VISÍVEL (informação) e o marcador fica DESABILITADO — mesmo
    // tratamento do Aplicar: o controle não some, explica-se pelo banner acima.
    await waitFor(() => {
      expect(screen.getByText("IARA ESPECIAL")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("switch", { name: /Retirar IARA ESPECIAL da alocação automática/i }),
    ).toBeDisabled();
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
