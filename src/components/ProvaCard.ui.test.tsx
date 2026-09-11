/**
 * Bateria do cartão de prova.
 *
 * 🔴 O que ela guarda é uma AUSÊNCIA: a listagem de `/provas` não pode consultar nada.
 *
 * Até 2026-09-10 cada cartão fazia TRÊS consultas ao montar (`prova_unidades`,
 * `meta_colaboradores_unidade`, `colaboradores_prova`) e somava no cliente. Medido no
 * banco local (cópia de produção), na maior das 2 provas — 11 unidades, 531 alocações:
 * **122.418 bytes em 3 requisições, por cartão**. E `/provas` renderiza um cartão por
 * prova, sem paginação, num sistema onde provas nunca são apagadas.
 *
 * ⚠️ Ausência é o tipo de garantia que se perde sem nada quebrar visualmente: um
 * `useQuery` novo no cartão volta a multiplicar por prova, e a tela só fica lenta. Por
 * isso o primeiro caso afirma que NADA foi consultado, e o controle positivo logo abaixo
 * prova que o modal continua funcionando — um sem o outro não vale.
 *
 * Precedente do padrão: `RelatorioImportacaoDialog.ui.test.tsx` ("fechado, NÃO consulta").
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  supabaseMock,
  setRpcResult,
  resetSupabaseMock,
  buildersDaTabela,
} from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { authMock } = vi.hoisted(() => ({ authMock: { isAdmin: true } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

import { ProvaCard } from "./ProvaCard";

const PROVA = {
  id: "prova-1",
  prova_data: "2026-10-04",
  prova_hora_inicio: "08:00:00",
  prova_hora_final: "12:00:00",
  editais: { nome: "Edital 001/2026 SMA" },
  profiles: { full_name: "Fulano" },
} as never;

/** Uma linha da RPC: o par (unidade × função). */
const LINHA = {
  prova_unidade_id: "pu-1",
  unid_nome: "Colégio Central",
  unid_sigla: "CC",
  unidade_finalizada: false,
  funcao_id: "f-1",
  funcao_nome: "Fiscal",
  meta: 10,
  ocupadas: 7,
};

const TABELAS_PROIBIDAS = [
  "prova_unidades",
  "meta_colaboradores_unidade",
  "colaboradores_prova",
];

const abrirTotais = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /totais de cargos/i }));

describe("ProvaCard", () => {
  beforeEach(() => {
    resetSupabaseMock();
    authMock.isAdmin = true;
  });

  it("🔴 ao montar, NÃO consulta nada — nem tabela, nem RPC", async () => {
    renderWithProviders(<ProvaCard prova={PROVA} />);

    expect(await screen.findByText("Edital 001/2026 SMA")).toBeInTheDocument();

    for (const tabela of TABELAS_PROIBIDAS) {
      expect(buildersDaTabela(tabela)).toHaveLength(0);
    }
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it("⭐ CONTROLE POSITIVO: a lanterna abre o modal e traz os números", async () => {
    setRpcResult("totais_da_prova", { data: [LINHA], error: null });
    const user = userEvent.setup();
    renderWithProviders(<ProvaCard prova={PROVA} />);

    await abrirTotais(user);

    expect(await screen.findByText(/Colégio Central/)).toBeInTheDocument();
    // ⚠️ DUAS ocorrências, e as duas estão certas: o bloco de totais gerais (só admin) e
    // o da unidade. `getByText` falharia por ambiguidade, não por defeito.
    expect(screen.getAllByText("Total: 7/10")).toHaveLength(2);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("totais_da_prova", {
      p_prova_id: "prova-1",
      p_prova_unidade_ids: null,
    });
  });

  it("a soma vem do BANCO — o cartão não toca nas três tabelas nem depois de abrir", async () => {
    // O ganho não é só adiar: é a agregação ter saído do cliente. Se alguém "consertar"
    // isso voltando a montar os totais no front, estas asserções caem.
    setRpcResult("totais_da_prova", { data: [LINHA], error: null });
    const user = userEvent.setup();
    renderWithProviders(<ProvaCard prova={PROVA} />);

    await abrirTotais(user);
    await screen.findByText(/Colégio Central/);

    for (const tabela of TABELAS_PROIBIDAS) {
      expect(buildersDaTabela(tabela)).toHaveLength(0);
    }
  });

  it("🔴 o recorte do coordenador chega à RPC", async () => {
    // `prova_unidades` tem policy `USING (true)`, e a de `colaboradores_prova` recorta por
    // PROVA, não por unidade — medido em 2026-09-10. Ou seja: a RLS sozinha NÃO esconde a
    // ocupação de unidade alheia. Quem faz isso é este parâmetro.
    setRpcResult("totais_da_prova", { data: [LINHA], error: null });
    const user = userEvent.setup();
    renderWithProviders(
      <ProvaCard prova={PROVA} allowedProvaUnidadeIds={["pu-1", "pu-2"]} />,
    );

    await abrirTotais(user);

    await waitFor(() =>
      expect(supabaseMock.rpc).toHaveBeenCalledWith("totais_da_prova", {
        p_prova_id: "prova-1",
        p_prova_unidade_ids: ["pu-1", "pu-2"],
      }),
    );
  });

  it("a lanterna tem nome acessível e vem ANTES da engrenagem", async () => {
    renderWithProviders(<ProvaCard prova={PROVA} />);

    const lanterna = screen.getByRole("button", { name: /totais de cargos/i });
    const engrenagem = screen.getByRole("link", { name: /gerenciar prova/i });

    // `compareDocumentPosition` responde a ordem real no DOM, que é o que o leitor de
    // tela e a navegação por Tab seguem — a posição visual pode mentir via CSS.
    expect(
      lanterna.compareDocumentPosition(engrenagem) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("coordenador também alcança a lanterna", async () => {
    // Antes da mudança ele já via a lista por unidade dentro do cartão; só o bloco de
    // totais gerais era exclusivo do admin. Esconder o botão dele tiraria o que ele tinha.
    authMock.isAdmin = false;
    renderWithProviders(<ProvaCard prova={PROVA} />);

    expect(screen.getByRole("button", { name: /totais de cargos/i })).toBeInTheDocument();
  });
});
