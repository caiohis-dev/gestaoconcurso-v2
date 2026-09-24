/**
 * Bateria da tela do módulo Financeiro (Fase 3 do roadmap-modulo-financeiro.yaml).
 *
 * O módulo não toca Supabase em lugar nenhum (fronteira registrada em
 * `estrutura/modulos/financeiro/00-modulo.md`): não há `vi.mock("@/integrations/supabase/client")`
 * aqui, só o mock de `useAuth` (que o `Layout` também consome).
 *
 * O arquivo de planilha é montado com `xlsx` de verdade e lido pelo caminho real da página —
 * mesma convenção de `CandidatosImportar.ui.test.tsx` — para exercitar `lerPlanilha` de fato.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";
import { renderWithProviders } from "@/test/utils";

/** Armadilha 9 de testes.md: `XLSX.writeFile` grava arquivo de verdade no jsdom. */
const { escreverXlsx } = vi.hoisted(() => ({ escreverXlsx: vi.fn() }));
vi.mock("xlsx", async () => {
  const real = await vi.importActual<typeof import("xlsx")>("xlsx");
  return { ...real, writeFile: escreverXlsx };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-1", email: "financeiro@fevre.test", user_metadata: {} },
    session: null,
    loading: false,
    role: null,
    roles: ["financeiro"],
    rolesLoaded: true,
    isAdmin: false,
    isSuperAdmin: false,
    isCoordenador: false,
    isColaborador: false,
    isFinanceiro: true,
    isColaboradorSemGestao: false,
    isLoggingOut: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

import Financeiro from "./Financeiro";

/**
 * Cabeçalho com o RÓTULO exato de cada `IdColunaSistema` obrigatória (ver
 * `financeiro-planilha-pagamentos.ts`), para que `sugerirMapeamento` preencha tudo por match
 * exato e a etapa de correspondência já chegue com "Validar" liberado.
 */
const CABECALHO = [
  "Nome Completo",
  "CPF",
  "Valor Líquido",
  "Edital",
  "Sigla Unidade",
  "Função",
  "Matrícula",
  "Telefone",
  "chave_pix",
  "tipo_chave_pix",
];

/**
 * Duas linhas, duas unidades (2 grupos), mesmo edital (exigido pelo conversor):
 *  - Fulano (unidade CJXXIII): chave PIX tipo CPF IGUAL ao CPF do favorecido — sem divergência.
 *  - Beltrano (unidade CIEP): chave PIX tipo CPF DIFERENTE do CPF do favorecido — 1 divergência.
 * Os dois CPFs (`11144477735`, `52998224725`) são valores de teste com dígito verificador válido.
 */
const MATRIZ = [
  CABECALHO,
  ["Fulano de Tal", "11144477735", "1500,00", "Edital 001/2026 SMA", "CJXXIII", "Fiscal", "000123", "24999998888", "11144477735", "03"],
  ["Beltrano da Silva", "52998224725", "2000,00", "Edital 001/2026 SMA", "CIEP", "Fiscal", "000456", "24999997777", "52998224726", "03"],
];

/** A mesma matriz, sem a coluna "Telefone" — deixa uma obrigatória sem mapear. */
const MATRIZ_SEM_TELEFONE = [
  CABECALHO.filter((c) => c !== "Telefone"),
  ["Fulano de Tal", "11144477735", "1500,00", "Edital 001/2026 SMA", "CJXXIII", "Fiscal", "000123", "11144477735", "03"],
];

/** Monta um `.xlsx` de verdade em memória, com o polyfill de `arrayBuffer` do jsdom. */
function planilha(matriz: unknown[][], nome = "recebedores.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matriz), "Planilha1");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const file = new File([buffer], nome, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  }
  return file;
}

function abrir() {
  renderWithProviders(<Financeiro />, { route: "/financeiro" });
}

/** Envia o arquivo. `fireEvent.change`: o input é `.hidden`, e `user.upload` recusa elemento invisível. */
async function enviarArquivo(matriz: unknown[][] = MATRIZ) {
  abrir();
  const input = screen.getByLabelText(/Clique para selecionar a planilha/i) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [planilha(matriz)] } });
  await screen.findByRole("heading", { name: "Correspondência de colunas" });
}

async function irParaValidacao(user: ReturnType<typeof userEvent.setup>, matriz: unknown[][] = MATRIZ) {
  await enviarArquivo(matriz);
  await user.click(screen.getByRole("button", { name: /^Validar$/ }));
  await screen.findByRole("heading", { name: "Resumo da validação" });
}

describe("Financeiro — tela (Fase 3)", () => {
  beforeEach(() => {
    escreverXlsx.mockClear();
    // jsdom não implementa os dois — define antes de espionar quando ausentes.
    if (!("createObjectURL" in URL)) Object.assign(URL, { createObjectURL: vi.fn() });
    if (!("revokeObjectURL" in URL)) Object.assign(URL, { revokeObjectURL: vi.fn() });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upload de planilha real avança para a correspondência de colunas já pré-preenchida", async () => {
    await enviarArquivo();

    // sugerirMapeamento casou todas as colunas por rótulo exato — nenhuma pendência.
    expect(screen.queryByText(/Faltam mapear/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Validar$/ })).toBeEnabled();
  });

  it("coluna obrigatória sem mapear bloqueia o botão Validar", async () => {
    await enviarArquivo(MATRIZ_SEM_TELEFONE);

    expect(screen.getByText(/Faltam mapear: Telefone\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Validar$/ })).toBeDisabled();
  });

  it("fluxo feliz completo até a validação: resumo e geração por unidade", async () => {
    const user = userEvent.setup();
    await irParaValidacao(user);

    expect(screen.getByText("Recebedores válidos").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Linhas ignoradas").nextElementSibling).toHaveTextContent("0");
    expect(screen.getByText("Arquivos (unidades)").nextElementSibling).toHaveTextContent("2");

    expect(screen.getByRole("button", { name: /CJXXIII/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CIEP/ })).toBeInTheDocument();
  });

  it("chave PIX tipo CPF divergente do favorecido aparece no aviso de conferência", async () => {
    const user = userEvent.setup();
    await irParaValidacao(user);

    const titulo = screen.getByText(/1 chave\(s\) PIX do tipo CPF divergem do CPF do favorecido/);
    const aviso = titulo.closest('[role="alert"]');
    expect(aviso).not.toBeNull();
    expect(within(aviso as HTMLElement).getByText("Beltrano da Silva")).toBeInTheDocument();
    // Fulano não diverge (chave igual ao CPF) — não deve aparecer na tabela de aviso.
    expect(within(aviso as HTMLElement).queryByText("Fulano de Tal")).not.toBeInTheDocument();
  });

  it("gerar arquivo de uma unidade baixa o .REM e a planilha de conferência", async () => {
    const user = userEvent.setup();
    await irParaValidacao(user);

    await user.click(screen.getByRole("button", { name: /CJXXIII/ }));

    // .REM: Blob + <a download> — o clique é espionado (armadilha 9 do irmão: também navega no jsdom).
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);

    // .xls de conferência: baixarXls -> XLSX.writeFile, mockado para não gravar no disco.
    expect(escreverXlsx).toHaveBeenCalledTimes(1);
    const [workbook, nomeArquivo] = escreverXlsx.mock.calls[0];
    expect(nomeArquivo).toMatch(/^CJXXIII.*\.xls$/);
    const aba = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(aba, { header: 1 });
    expect(linhas[0]).toEqual(["Nome", "Cargo", "Tipo de chave", "Chave PIX", "Valor"]);
    expect(linhas[1]).toEqual(["Fulano de Tal", "Fiscal", "CPF", "11144477735", 1500]);
  });
});
