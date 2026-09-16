/**
 * Bateria da ORDENAÇÃO de `/painel-dados-colaboradores/:provaId`.
 *
 * 🔵 **Por que existe (2026-09-15).** A tabela ganhou link de ordenação nas quatro
 * colunas; antes só Nome e Último Acesso ordenavam, e Email e Unidade eram cabeçalho
 * morto. Ordenação é o tipo de coisa que "parece funcionar" olhando a tela — a lista
 * muda de ordem e o olho aceita —, então o que se afirma aqui é a ORDEM EXATA das linhas
 * em cada coluna, não que algo mudou.
 *
 * ⚠️ **O fixture é desenhado para que as quatro ordens sejam DIFERENTES entre si.** Se
 * duas colunas produzissem a mesma sequência, o teste passaria sem provar qual estava
 * ordenando — é a lição do fixture de `GerenciarProva.ui.test.tsx`, onde dois números
 * iguais deixaram a asserção sem sentido.
 *
 * ⚠️ **`ÁLVARO` no fixture não é enfeite.** `localeCompare(…, "pt-BR")` põe `Á` junto do
 * `A`; uma comparação ingênua com `<` jogaria `ÁLVARO` (U+00C1) depois de `CARLA`. Mexer
 * na comparação e trocar por `<` derruba o primeiro caso desta bateria.
 *
 * Ver `my_rules/estrutura/modulos/aplicacao-provas/documentos-e-relatorios.md` e as
 * armadilhas em `my_rules/estrutura/transversais/testes.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  setTableResult,
  setTableResultSequence,
  resetSupabaseMock,
  erroPostgrest,
} from "@/test/supabase-mock";
import { TAMANHO_FATIA } from "@/lib/buscar-em-fatias";
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

import PainelDadosColaboradores from "./PainelDadosColaboradores";

const PROVA_ID = "prova-1";

/** Uma linha de `colaboradores_prova` como a página a consome (join aninhado). */
function alocacao(
  id: string,
  nome: string,
  email: string,
  unidade: string,
  ultimoAcesso: string | null,
) {
  return {
    colaboradores: {
      id,
      colab_nome_completo: nome,
      colab_email: email,
      colab_ultimo_acesso: ultimoAcesso,
    },
    prova_unidades: { prova_id: PROVA_ID, unidades_prova: { unid_nome: unidade } },
  };
}

/**
 * As quatro ordens que este fixture produz — cada uma distinta das outras:
 *   nome ............ ÁLVARO · ANA · BRUNO · CARLA
 *   email ........... BRUNO · ANA · CARLA · ÁLVARO
 *   unidade ......... BRUNO · ÁLVARO · CARLA · ANA
 *   último acesso ... ANA (nunca) · ÁLVARO · CARLA · BRUNO
 */
const LINHAS = [
  alocacao("c-1", "ÁLVARO PIRES", "ultimo@fevre.test", "ESCOLA MORRO", "2026-01-05T10:00:00Z"),
  alocacao("c-2", "ANA SOUZA", "bruno@fevre.test", "ZONA SUL", null),
  alocacao("c-3", "BRUNO LIMA", "ana@fevre.test", "ARARUAMA", "2026-09-01T10:00:00Z"),
  alocacao("c-4", "CARLA DIAS", "carla@fevre.test", "MORRO AZUL", "2026-05-10T10:00:00Z"),
];

function montar(linhas = LINHAS) {
  setTableResult("colaboradores_prova", { data: linhas, error: null });
  return renderWithProviders(
    <Routes>
      <Route path="/painel-dados-colaboradores/:provaId" element={<PainelDadosColaboradores />} />
      <Route path="*" element={<span>SAIU DA PÁGINA</span>} />
    </Routes>,
    { route: `/painel-dados-colaboradores/${PROVA_ID}` },
  );
}

/** Os primeiros nomes de cada linha do corpo, na ordem em que a tabela os pinta. */
function nomesNaOrdem() {
  return screen
    .getAllByRole("row")
    .slice(1) // a primeira é o cabeçalho
    .map((tr) => tr.querySelectorAll("td")[0]?.textContent?.trim() ?? "");
}

/**
 * ⚠️ A busca é ESCOPADA ao cabeçalho da tabela, e não é zelo: o `Layout` tem um menu com
 * "Unidades de Prova" e "Colaboradores", então `getByRole("button", {name:/Unidade/i})`
 * solto acha dois elementos e o teste morre por ambiguidade — foi o que aconteceu na
 * primeira execução desta bateria.
 */
function botaoColuna(coluna: string) {
  const cabecalho = screen.getAllByRole("row")[0];
  return within(cabecalho).getByRole("button", { name: new RegExp(coluna, "i") });
}

async function clicar(coluna: string) {
  await userEvent.click(botaoColuna(coluna));
}

describe("Painel de dados — ordenação da tabela", () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it("abre ordenado por NOME ascendente, com acento junto da letra base", async () => {
    montar();
    await waitFor(() => expect(nomesNaOrdem()).toHaveLength(4));
    expect(nomesNaOrdem()).toEqual([
      "ÁLVARO PIRES",
      "ANA SOUZA",
      "BRUNO LIMA",
      "CARLA DIAS",
    ]);
  });

  it("ordena por EMAIL — a coluna que não ordenava antes", async () => {
    montar();
    await waitFor(() => expect(nomesNaOrdem()).toHaveLength(4));
    await clicar("Email");
    expect(nomesNaOrdem()).toEqual([
      "BRUNO LIMA", // ana@
      "ANA SOUZA", // bruno@
      "CARLA DIAS", // carla@
      "ÁLVARO PIRES", // ultimo@
    ]);
  });

  it("ordena por UNIDADE — a outra que não ordenava antes", async () => {
    montar();
    await waitFor(() => expect(nomesNaOrdem()).toHaveLength(4));
    await clicar("Unidade");
    expect(nomesNaOrdem()).toEqual([
      "BRUNO LIMA", // ARARUAMA
      "ÁLVARO PIRES", // ESCOLA MORRO
      "CARLA DIAS", // MORRO AZUL
      "ANA SOUZA", // ZONA SUL
    ]);
  });

  it("ordena por ÚLTIMO ACESSO, e quem nunca acessou vem primeiro no ascendente", async () => {
    montar();
    await waitFor(() => expect(nomesNaOrdem()).toHaveLength(4));
    await clicar("Último Acesso");
    expect(nomesNaOrdem()).toEqual([
      "ANA SOUZA", // nunca acessou
      "ÁLVARO PIRES", // 05/01
      "CARLA DIAS", // 10/05
      "BRUNO LIMA", // 01/09
    ]);
  });

  it("o segundo clique na mesma coluna inverte, e trocar de coluna volta para ascendente", async () => {
    montar();
    await waitFor(() => expect(nomesNaOrdem()).toHaveLength(4));

    await clicar("Unidade");
    const asc = nomesNaOrdem();
    await clicar("Unidade");
    expect(nomesNaOrdem()).toEqual([...asc].reverse());

    // Trocar de coluna não herda o "desc" da anterior.
    await clicar("Email");
    expect(nomesNaOrdem()[0]).toBe("BRUNO LIMA");
  });

  it("⚠️ empate na coluna ordenada desempata pelo NOME, não pela ordem de chegada", async () => {
    // As duas primeiras estão na MESMA unidade e chegam do banco em ordem de nome
    // invertida. Sem o desempate explícito, o resultado dependeria da estabilidade do
    // `sort` sobre a ordem da consulta — que é o tipo de garantia que some sem aviso
    // quando alguém mexe no `.order()` da query.
    montar([
      alocacao("c-9", "ZORA VIEIRA", "z@fevre.test", "ARARUAMA", null),
      alocacao("c-8", "BRUNO LIMA", "b@fevre.test", "ARARUAMA", null),
      alocacao("c-7", "ANA SOUZA", "a@fevre.test", "ZONA SUL", null),
    ]);
    await waitFor(() => expect(nomesNaOrdem()).toHaveLength(3));

    await clicar("Unidade");
    expect(nomesNaOrdem()).toEqual(["BRUNO LIMA", "ZORA VIEIRA", "ANA SOUZA"]);
  });

  it("os quatro cabeçalhos são BOTÕES, alcançáveis por teclado, e anunciam a ordem", async () => {
    // Antes o clique vivia num onClick do <th> com um <div> dentro: mouse funcionava,
    // teclado não alcançava e leitor de tela não tinha o que anunciar.
    montar();
    await waitFor(() => expect(nomesNaOrdem()).toHaveLength(4));

    for (const coluna of ["Nome", "Email", "Unidade", "Último Acesso"]) {
      expect(botaoColuna(coluna)).toBeInTheDocument();
    }

    const th = (nome: string) => botaoColuna(nome).closest("th")!;

    expect(th("Nome")).toHaveAttribute("aria-sort", "ascending");
    expect(th("Email")).toHaveAttribute("aria-sort", "none");

    await clicar("Email");
    expect(th("Email")).toHaveAttribute("aria-sort", "ascending");
    expect(th("Nome")).toHaveAttribute("aria-sort", "none");

    await clicar("Email");
    expect(th("Email")).toHaveAttribute("aria-sort", "descending");
  });
});

describe("Painel de dados — o teto de 1000 do PostgREST", () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it("🔴 busca EM FATIAS: uma prova com mais de 1.000 alocações aparece inteira", async () => {
    // O PostgREST devolve no máximo `max_rows` (1000) e NÃO avisa. Uma consulta só
    // mostraria 1000 de 1001 e o painel pareceria completo — com quatro formas de
    // reordenar o pedaço truncado. A primeira fatia vem CHEIA (é o que faz o laço pedir
    // outra) e a segunda vem menor, que é o sinal de fim.
    const fatiaCheia = Array.from({ length: TAMANHO_FATIA }, (_, i) =>
      alocacao(`c-${i}`, `PESSOA ${String(i).padStart(4, "0")}`, `p${i}@fevre.test`, "ARARUAMA", null),
    );
    const ultima = [alocacao("c-fim", "ZZ ULTIMA DA LISTA", "zz@fevre.test", "ZONA SUL", null)];

    setTableResultSequence("colaboradores_prova", [
      { data: fatiaCheia, error: null },
      { data: ultima, error: null },
    ]);
    renderWithProviders(
      <Routes>
        <Route path="/painel-dados-colaboradores/:provaId" element={<PainelDadosColaboradores />} />
      </Routes>,
      { route: `/painel-dados-colaboradores/${PROVA_ID}` },
    );

    // O contador do cabeçalho é a afirmação: 1001, não 1000.
    expect(await screen.findByText(`Colaboradores (${TAMANHO_FATIA + 1})`)).toBeInTheDocument();
    // E a linha que só existe na SEGUNDA fatia está na tela.
    expect(screen.getByText("ZZ ULTIMA DA LISTA")).toBeInTheDocument();
  });

  it("⚠️ falha de consulta APARECE, em vez de virar 'nenhum colaborador encontrado'", async () => {
    // Antes o erro era engolido (`if (!error && data)`) e a tela dizia a mesma frase de
    // uma prova sem ninguém alocado: duas causas, uma mensagem, e a errada indistinguível
    // da normal.
    setTableResult("colaboradores_prova", {
      data: null,
      error: erroPostgrest("42501", "permission denied for table colaboradores_prova"),
    });
    renderWithProviders(
      <Routes>
        <Route path="/painel-dados-colaboradores/:provaId" element={<PainelDadosColaboradores />} />
      </Routes>,
      { route: `/painel-dados-colaboradores/${PROVA_ID}` },
    );

    expect(await screen.findByText("Não foi possível carregar a lista.")).toBeInTheDocument();
    expect(screen.getByText(/permission denied/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum colaborador encontrado.")).not.toBeInTheDocument();
  });
});
