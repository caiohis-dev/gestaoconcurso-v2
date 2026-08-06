/**
 * Bateria do assistente de importação de candidatos.
 *
 * ⭐ **O teste que justifica este arquivo é o do cargo sem parear.** Todos os outros
 * defeitos possíveis aqui são barulhentos — a importação falha, aparece erro, alguém
 * percebe. Aquele era **silencioso**: sem o campo *Cargo*, as inscrições da mesma pessoa
 * em cargos diferentes colidiam na chave natural, a barra chegava a 100%, o relatório
 * dizia "concluída" e **396 inscritos do arquivo real simplesmente não estavam lá**.
 *
 * Desde 2026-07-27 (decisão D4) o cargo é OBRIGATÓRIO e essa perda deixou de ser possível:
 * a tela impede em vez de avisar. O teste ⭐⭐ mudou de forma junto — mede o impedimento —,
 * mas continua exigindo que a tela EXPLIQUE e diga onde o cargo costuma estar. Barrar sem
 * orientar apenas troca um problema por outro.
 *
 * O arquivo de teste é montado com o `xlsx` de verdade e lido pelo caminho real da
 * página — nada de injetar matriz pronta. É o único jeito de exercitar as duas colunas
 * chamadas `NOME`, que são a origem da armadilha.
 *
 * A conversão em si tem bateria própria e pura em `lib/candidatos-import.test.ts`; aqui
 * se testa a TELA. Ver `my_rules/estrutura/modulos/candidatos/00-modulo.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";
import {
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  erroPostgrest,
  buildersDaTabela,
  supabaseMock,
} from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...real, useNavigate: () => navigateMock };
});

/**
 * O jsPDF não roda no jsdom sem tropeçar em canvas, e o objeto de teste aqui não é o PDF
 * — é o que a TELA faz quando gerar o documento falha. Por isso só
 * `criarDocumentoPaisagem` é trocada, e o resto do módulo (inclusive `useLogoBase64`, que
 * roda no mount) fica real. `vi.hoisted` porque `vi.mock` é içado.
 */
const { pdfDeveFalhar, salvarPdf } = vi.hoisted(() => ({
  pdfDeveFalhar: { valor: false },
  salvarPdf: vi.fn(),
}));
vi.mock("@/lib/pdf-timbre", async () => {
  const real = await vi.importActual<typeof import("@/lib/pdf-timbre")>("@/lib/pdf-timbre");
  return {
    ...real,
    // ⚠️ Calado de propósito: o `useLogoBase64` real faz `fetch` da URL do asset, que no
    // jsdom não é resolvível, e cada teste do arquivo cuspia um TypeError no stderr. O
    // erro é tratado (o PDF sai sem logo), mas 42 avisos por execução viram ruído que
    // esconde problema de verdade — é a armadilha 3 de `testes.md`.
    useLogoBase64: () => "",
    criarDocumentoPaisagem: () => {
      if (pdfDeveFalhar.valor) throw new Error("canvas indisponível");
      const doc = real.criarDocumentoPaisagem();
      // ⚠️ `save` é NEUTRALIZADO: no jsdom ele grava o arquivo DE VERDADE, e a suíte
      // passou a sujar a raiz do repo com um PDF por execução. Vira spy, que de quebra
      // permite afirmar o nome do arquivo.
      doc.save = salvarPdf as unknown as typeof doc.save;
      return doc;
    },
  };
});

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

import CandidatosImportar from "./CandidatosImportar";

const EDITAL = {
  id: "edital-1",
  nome: "Edital 001/2026 SMA",
  n_candidatos: 7000,
  cabecalho_linha1: null,
  cabecalho_linha2: null,
  created_at: null,
  updated_at: null,
  created_by: null,
};

/**
 * O recorte do arquivo real que contém a armadilha inteira:
 *  - coluna A sem título;
 *  - DUAS colunas `NOME` — a C é a pessoa, a E é o cargo;
 *  - a mesma PESSOA (`ID` 213946) concorrendo a dois cargos, que é o caso dos 382 do
 *    arquivo real — com um nº de inscrição PRÓPRIO para cada uma das duas inscrições.
 *
 * 🔴 **Os números de inscrição eram iguais nas duas linhas da CASSIA até 2026-08-01**, e
 * isso descrevia mal o arquivo: os 382 casos repetem o `ID` (a pessoa), não a inscrição.
 * Medido no arquivo real — os 7.416 números de inscrição são distintos, e quem concorre a
 * dois cargos faz duas inscrições. O fixture antigo era o resquício da leitura que trocava
 * as duas colunas, e com a chave natural virando só o nº de inscrição ele passou a
 * descrever uma fusão que o arquivo não produz.
 *
 * ⚠️ Aqui o nº de inscrição auto-mapeia para a coluna B (`ID`), porque a A está sem título
 * e `'id'` é sinônimo do campo. No arquivo real a A chama-se `N_INSCRICAO` e é ela que
 * casa. É uma diferença do fixture, não do sistema — o que os testes daqui medem é o
 * comportamento da tela dado um mapeamento, não qual coluna o palpite escolhe.
 *
 * ⚠️ `CONFIRMADO` entrou em 2026-08-01, quando o campo virou obrigatório e passou a
 * FILTRAR a importação. Aqui vem `"1"` em todas as linhas de propósito: assim os testes
 * que já existiam continuam medindo o que mediam, sem o filtro no meio. Quem quiser
 * exercitar o filtro usa `MATRIZ_COM_NAO_PAGANTE`.
 */
const MATRIZ = [
  ["   ", "ID", "NOME", "CPF", "NOME", "CONFIRMADO"],
  ["1", "213946", "CASSIA ANDREA", "99528037704", "DOCENTE II", "1"],
  ["2", "213947", "CASSIA ANDREA", "99528037704", "DOCENTE I - HISTÓRIA", "1"],
  ["3", "214274", "AGATHA LAMIM", "22940161739", "DOCENTE II", "1"],
];

/**
 * A mesma matriz com UM não-pagante, para exercitar o filtro de 2026-08-01.
 *
 * ⚠️ A não-pagante é a AGATHA (linha 4), e a escolha não é indiferente: ela é a única que
 * não divide a PESSOA com outra linha. Marcar uma das duas linhas da CASSIA misturaria o
 * filtro com o caso das duas inscrições da mesma pessoa, e um teste que falhasse não diria
 * qual dos dois errou.
 */
const MATRIZ_COM_NAO_PAGANTE = [
  ["   ", "ID", "NOME", "CPF", "NOME", "CONFIRMADO"],
  ["1", "213946", "CASSIA ANDREA", "99528037704", "DOCENTE II", "1"],
  ["2", "213947", "CASSIA ANDREA", "99528037704", "DOCENTE I - HISTÓRIA", "1"],
  ["3", "214274", "AGATHA LAMIM", "22940161739", "DOCENTE II", "0"],
];

/**
 * A mesma matriz com a coluna de SALA ESPECIAL (2026-08-04), preenchida em UMA linha.
 *
 * ⚠️ Fixture próprio pelo mesmo motivo do não-pagante: uma variável por vez. Acrescentar a
 * coluna ao `MATRIZ` padrão faria todos os testes anteriores passarem a exercitar também a
 * origem nova do relatório, e um deles que falhasse não diria qual das duas coisas quebrou.
 *
 * ⚠️ A coluna vem em G, DEPOIS de `CONFIRMADO`, e preenchida só na CASSIA da linha 2 — a
 * primeira das duas inscrições dela. Isso põe o pedido numa pessoa que tem OUTRA inscrição
 * no mesmo arquivo, que é o caso em que um filtro mal escrito duplicaria a linha.
 */
const MATRIZ_COM_SALA_ESPECIAL = [
  ["   ", "ID", "NOME", "CPF", "NOME", "CONFIRMADO", "SALA_ESPECIAL"],
  ["1", "213946", "CASSIA ANDREA", "99528037704", "DOCENTE II", "1", "Ledor e prova ampliada"],
  ["2", "213947", "CASSIA ANDREA", "99528037704", "DOCENTE I - HISTÓRIA", "1", ""],
  ["3", "214274", "AGATHA LAMIM", "22940161739", "DOCENTE II", "1", ""],
];

/** O catálogo de cargos já cadastrados, que o passo 3 oferece no Select. */
const CATALOGO = [
  {
    id: "cargo-docente-ii",
    nome: "DOCENTE II",
    nome_chave: "docente ii",
    ativo: true,
    created_at: null,
    updated_at: null,
  },
  {
    id: "cargo-historia",
    nome: "DOCENTE I — HISTÓRIA",
    nome_chave: "docente i — história",
    ativo: true,
    created_at: null,
    updated_at: null,
  },
];

/**
 * Monta um .xlsx de verdade em memória.
 *
 * O `arrayBuffer` é redefinido quando o jsdom não o traz: a página chama
 * `file.arrayBuffer()`, e nem toda versão de jsdom implementa `Blob.arrayBuffer`. Sem
 * esta rede o teste falharia por causa do ambiente, não do código.
 */
function planilha(matriz: unknown[][], nome = "inscritos.xlsx"): File {
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

/**
 * O combobox de um campo, alcançado PELO RÓTULO — que é como uma pessoa o encontra.
 *
 * Isto só é possível porque cada `SelectTrigger` tem `id` e o `<label>` tem o `htmlFor`
 * correspondente (`<button>` é elemento rotulável). Antes disso, o teste precisava andar
 * do rótulo até o combobox irmão pelo DOM — e aquele contorno era o sintoma de que os 25
 * campos da tela não tinham nome acessível nenhum.
 *
 * O matcher é uma função porque o rótulo dos obrigatórios termina em "*", que é
 * decoração (`aria-hidden`) e não faz parte do nome do campo.
 */
function comboboxDoCampo(rotulo: string): HTMLElement {
  return screen.getByLabelText((texto) => texto.replace(/\*$/, "").trim() === rotulo);
}

async function escolher(
  user: ReturnType<typeof userEvent.setup>,
  campo: string,
  opcao: string | RegExp,
) {
  await user.click(comboboxDoCampo(campo));
  await user.click(await screen.findByRole("option", { name: opcao }));
}

/** Abre a tela e espera o carregamento dos editais. */
async function abrir() {
  const user = userEvent.setup();
  renderWithProviders(<CandidatosImportar />, { route: "/candidatos/importar" });
  await screen.findByRole("heading", { name: "Importar Candidatos" });
  return user;
}

/** Passo 1 completo: escolhe o edital e entrega o arquivo. */
async function passo1(user: ReturnType<typeof userEvent.setup>, matriz = MATRIZ) {
  await escolher(user, "Edital de destino", EDITAL.nome);

  // `fireEvent.change`, e não `user.upload`: o input é `.hidden` (display:none) e o
  // userEvent recusa interagir com elemento invisível. O que interessa é o `onChange`.
  const input = screen.getByLabelText(/Escolher planilha/i) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [planilha(matriz)] } });

  await screen.findByText(/inscritos\.xlsx/);
}

/** Passo 1 → passo 2. */
async function irParaPareamento(user: ReturnType<typeof userEvent.setup>, matriz = MATRIZ) {
  await passo1(user, matriz);
  await user.click(screen.getByRole("button", { name: /Parear colunas/i }));
  await screen.findByText("Pareamento de colunas");
}

/**
 * Passo 1 → 2 → 3, com a coluna de cargo pareada.
 *
 * O cargo é apontado à mão porque o auto-pareamento o deixa em branco de propósito (a
 * coluna E chama-se `NOME`, igual à C).
 */
async function irParaCargos(user: ReturnType<typeof userEvent.setup>, matriz = MATRIZ) {
  await irParaPareamento(user, matriz);
  await escolher(user, "Cargo", "NOME (coluna E)");
  await user.click(await screen.findByRole("button", { name: /^Continuar$/i }));
  await screen.findByRole("heading", { name: "Cargos" });
}

/** O Select de um cargo lido, alcançado pelo rótulo acessível. */
function comboboxDoCargo(textoNaPlanilha: string): HTMLElement {
  return screen.getByLabelText(`Cargo do sistema para “${textoNaPlanilha}”`);
}

/** Associa um cargo da planilha a um do catálogo. */
async function associar(
  user: ReturnType<typeof userEvent.setup>,
  textoNaPlanilha: string,
  nomeDoCargo: string,
) {
  await user.click(comboboxDoCargo(textoNaPlanilha));
  await user.click(await screen.findByRole("option", { name: nomeDoCargo }));
}

/** Resolve os dois cargos do MATRIZ padrão. */
async function associarTodos(user: ReturnType<typeof userEvent.setup>) {
  // "DOCENTE II" já vem pré-preenchido por casamento exato; só o do travessão sobra.
  await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE I — HISTÓRIA");
}

/**
 * Clica em "Importar" E confirma a substituição.
 *
 * ⚠️ Desde a TROCA TOTAL (2026-07-30) o botão NÃO importa: ele abre a confirmação
 * destrutiva, porque importar apaga a lista atual do edital. Um teste que só clique no
 * botão passa a não importar nada — e é exatamente o que se quer que aconteça se alguém
 * remover a confirmação sem querer.
 */
async function importarEConfirmar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Importar 3 candidato\(s\)/i }));
  await user.click(await screen.findByRole("button", { name: /Substituir os inscritos/i }));
}

describe("CandidatosImportar (interação)", () => {
  beforeEach(() => {
    resetSupabaseMock();
    navigateMock.mockClear();
    pdfDeveFalhar.valor = false;
    salvarPdf.mockClear();
    setTableResult("editais", { data: [EDITAL], error: null });
    setTableResult("candidatos", { data: null, error: null });
    setTableResult("candidatos_importacao", { data: null, error: null });
    setTableResult("cargos", { data: CATALOGO, error: null });
    setRpcResult("contar_candidatos_por_edital", { data: [], error: null });
    setRpcResult("trocar_candidatos_do_edital", {
      data: [{ removidos: 0, inseridos: 3 }],
      error: null,
    });
  });

  describe("passo 1 — edital e arquivo", () => {
    it("não deixa avançar sem os dois", async () => {
      const user = await abrir();

      expect(screen.getByRole("button", { name: /Parear colunas/i })).toBeDisabled();

      await escolher(user, "Edital de destino", EDITAL.nome);
      // Só o edital não basta: ainda falta a planilha.
      expect(screen.getByRole("button", { name: /Parear colunas/i })).toBeDisabled();
    });

    it("confirma o que leu do arquivo antes de prosseguir", async () => {
      const user = await abrir();
      await passo1(user);

      // 3 linhas de dados e 5 colunas — a contagem é a evidência de que a leitura
      // aconteceu, e de que o cabeçalho não foi contado como dado.
      expect(await screen.findByText(/3 linha\(s\) de dados, 6 coluna\(s\)/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Parear colunas/i })).toBeEnabled();
    });

    it("sem edital cadastrado, explica e oferece o caminho", async () => {
      setTableResult("editais", { data: [], error: null });
      await abrir();

      expect(await screen.findByText("Nenhum edital cadastrado")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Cadastrar Edital/i })).toBeInTheDocument();
    });
  });

  describe("passo 2 — pareamento", () => {
    it("⚠️ distingue as DUAS colunas NOME pela letra", async () => {
      // Sem a letra, o usuário vê duas opções idênticas e não tem como escolher a certa
      // — e a errada é justamente a que faz todo mundo se chamar "DOCENTE II".
      const user = await abrir();
      await irParaPareamento(user);

      await user.click(comboboxDoCampo("Cargo"));
      expect(await screen.findByRole("option", { name: "NOME (coluna C)" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "NOME (coluna E)" })).toBeInTheDocument();
    });

    it("dá nome à coluna sem título", async () => {
      const user = await abrir();
      await irParaPareamento(user);

      await user.click(comboboxDoCampo("Cargo"));
      expect(
        await screen.findByRole("option", { name: "(sem título — coluna A)" }),
      ).toBeInTheDocument();
    });

    it("cada campo é alcançável pelo próprio rótulo", async () => {
      // REGRESSÃO (2026-07-27). Até esta data os 25 `<label>` do pareamento não tinham
      // `htmlFor`, e o gatilho do Select não tinha `id`: para um leitor de tela a página
      // era uma fileira de 25 "combobox" indistinguíveis. Este teste é o que impede a
      // volta — sem a associação, `getByLabelText` simplesmente não acha o campo.
      const user = await abrir();
      await irParaPareamento(user);

      for (const rotulo of ["Nº de Inscrição", "Nome", "Cargo", "CPF", "Identidade — Número"]) {
        expect(comboboxDoCampo(rotulo)).toHaveAttribute("role", "combobox");
      }
    });

    it("o asterisco de obrigatório não entra no nome do campo", async () => {
      // O `*` é decoração e leva `aria-hidden`: o leitor deve anunciar "Nº de Inscrição",
      // não "Nº de Inscrição asterisco". A obrigatoriedade viaja no `aria-required`.
      const user = await abrir();
      await irParaPareamento(user);

      const obrigatorio = screen.getByRole("combobox", { name: "Nº de Inscrição" });
      expect(obrigatorio).toBe(comboboxDoCampo("Nº de Inscrição"));
      expect(obrigatorio).toHaveAttribute("aria-required", "true");

      // Cargo também é obrigatório desde D4 (2026-07-27).
      expect(comboboxDoCampo("Cargo")).toHaveAttribute("aria-required", "true");
      // CONTROLE POSITIVO: campo de fato opcional não se anuncia como obrigatório.
      expect(comboboxDoCampo("CPF")).not.toHaveAttribute("aria-required", "true");
    });

    it("⭐ Sala Especial é campo do pareamento, alcançável e OPCIONAL", async () => {
      // O campo entrou em 2026-08-04. Ele aparece na tela sem ninguém tocar no JSX: o
      // passo 2 itera `CAMPOS_CANDIDATO`. O que este teste guarda é o que NÃO é
      // automático — que ele tenha rótulo próprio (senão vira mais um "combobox" na
      // fileira de 26) e que NÃO se anuncie como obrigatório.
      const user = await abrir();
      await irParaPareamento(user, MATRIZ_COM_SALA_ESPECIAL);

      const campo = comboboxDoCampo("Sala Especial");
      expect(campo).toHaveAttribute("role", "combobox");
      expect(campo).not.toHaveAttribute("aria-required", "true");
      // E auto-mapeia quando o cabeçalho é o previsto.
      expect(campo).toHaveTextContent("SALA_ESPECIAL");
    });

    it("⚠️ sem a coluna na planilha, Sala Especial fica em branco e não trava o passo", async () => {
      // MEDIDO: o arquivo real de 7.416 linhas NÃO tem esta coluna. O comportamento certo
      // é o campo ficar vazio e o assistente seguir — se um dia ele passar a barrar, esta
      // planilha (a mesma de todos os outros testes) deixa de importar.
      const user = await abrir();
      await irParaPareamento(user);

      expect(comboboxDoCampo("Sala Especial")).toHaveTextContent("— não importar —");
      await escolher(user, "Cargo", "NOME (coluna E)");
      await user.click(await screen.findByRole("button", { name: /^Continuar$/i }));
      expect(await screen.findByRole("heading", { name: "Cargos" })).toBeInTheDocument();
    });

    it("adivinha os campos óbvios sozinho", async () => {
      const user = await abrir();
      await irParaPareamento(user);

      expect(comboboxDoCampo("Nº de Inscrição")).toHaveTextContent("ID");
      expect(comboboxDoCampo("CPF")).toHaveTextContent("CPF");
      expect(comboboxDoCampo("Nome")).toHaveTextContent("NOME (coluna C)");
    });

    it("⭐ NÃO adivinha o cargo — deixa em branco esperando o usuário", async () => {
      // No arquivo real o cargo mora na segunda coluna NOME, e `TIPOPROVA` existe mas é
      // 100% vazia. Um palpite ali pareceria acertar e zeraria o cargo de todas as
      // linhas. Em branco, o usuário é obrigado a escolher conscientemente.
      const user = await abrir();
      await irParaPareamento(user);

      expect(comboboxDoCampo("Cargo")).toHaveTextContent("— não importar —");
    });

    it("⭐⭐ sem o cargo pareado NÃO DÁ para avançar, e a tela diz por quê", async () => {
      // ESTE é o teste que não pode cair, e ele mudou de forma em 2026-07-27 (D4).
      //
      // ANTES: o cargo era opcional, e como ele COMPUNHA a chave natural, deixá-lo em
      // branco fundia linhas num registro só — a única defesa era um alerta vermelho que o
      // usuário podia ignorar, e a importação terminava em verde tendo perdido gente.
      //
      // AGORA: o cargo é obrigatório e a perda por essa via é IMPOSSÍVEL, não improvável.
      //
      // ⚠️ Desde 2026-08-01 o cargo saiu da chave natural, então a fusão descrita acima não
      // pode mais acontecer NEM se o cargo voltasse a ser opcional — o motivo original de
      // D4 caiu. O impedimento FICA, e não por inércia: `candidatos.cargo_id` é NULLABLE no
      // banco (conferido no information_schema), então nada lá embaixo barra um inscrito
      // sem cargo, e um inscrito sem cargo não entra em lista de presença nem em nada que a
      // Aplicação de Provas recorte por cargo. A barreira é só esta tela.
      // O teste mede o impedimento, mas a explicação e o "onde o cargo está" continuam
      // sendo exigidos, porque barrar sem orientar só troca um problema por outro.
      const user = await abrir();
      await irParaPareamento(user);

      expect(await screen.findByText(/O campo Cargo precisa ser pareado/i)).toBeInTheDocument();
      expect(screen.getByText(/segunda coluna chamada NOME/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Continuar$/i })).toBeDisabled();

      // CONTROLE POSITIVO: pareado, o impedimento some e o caminho abre.
      await escolher(user, "Cargo", "NOME (coluna E)");
      await waitFor(() =>
        expect(screen.queryByText(/O campo Cargo precisa ser pareado/i)).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: /^Continuar$/i })).toBeEnabled();
    });

    it("⭐⭐ as duas inscrições da mesma pessoa chegam INTEIRAS ao fim", async () => {
      // ⚠️ ESTE TESTE SE CHAMAVA "parear o cargo desfaz a colisão e recupera o inscrito", e
      // a afirmação morreu em 2026-08-01. Enquanto o cargo compunha a chave natural, deixar
      // de pareá-lo fundia linhas e pareá-lo as recuperava — havia uma colisão para desfazer.
      // Com a chave sendo só o nº de inscrição, o cargo não influencia mais a contagem: as
      // três linhas são três candidatos com ou sem associação.
      //
      // O que o teste guarda AGORA é o que realmente importa e não depende do mecanismo: a
      // mesma pessoa (`ID` 213946) inscrita em dois cargos chega ao fim como DUAS linhas.
      // Se cair, 380 segundas inscrições de pagantes do arquivo real somem na importação.
      //
      // ⚠️ ONDE A CONTAGEM É LIDA continua sendo passo 3, não passo 2 — o passo 2 anuncia
      // "linha(s) lida(s)", um fato do arquivo. Isso é anterior à mudança da chave e não
      // depende dela: o total só é afirmado depois que o usuário decidiu os cargos.
      const user = await abrir();
      await irParaPareamento(user);

      expect(screen.queryByText(/linha\(s\) lida\(s\)/)).not.toBeInTheDocument();

      await escolher(user, "Cargo", "NOME (coluna E)");
      expect(await screen.findByText("3 linha(s) lida(s)")).toBeInTheDocument();

      await user.click(await screen.findByRole("button", { name: /^Continuar$/i }));
      await screen.findByRole("heading", { name: "Cargos" });
      await associarTodos(user);

      expect(
        await screen.findByRole("button", { name: /Importar 3 candidato\(s\)/i }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText(/repetem um nº de inscrição/i)).not.toBeInTheDocument(),
      );
    });

    it("a prévia mostra a pessoa no nome e o cargo no cargo", async () => {
      // A prova visível de que a leitura por índice funcionou: se a página lesse a
      // planilha como objeto, a coluna E teria sobrescrito a C e o nome exibido seria
      // "DOCENTE II".
      const user = await abrir();
      await irParaPareamento(user);
      await escolher(user, "Cargo", "NOME (coluna E)");

      const previa = (await screen.findByText("Prévia das 5 primeiras linhas"))
        .parentElement as HTMLElement;

      // A asserção precisa ser na MESMA LINHA: é isso que prova que as colunas C e E
      // foram lidas como duas coisas distintas. Uma contagem solta de "DOCENTE II" na
      // tela passaria mesmo se o cargo tivesse sobrescrito o nome.
      const linha = within(previa).getAllByText("CASSIA ANDREA")[0].closest("tr") as HTMLElement;
      expect(within(linha).getByText("213946")).toBeInTheDocument();
      expect(within(linha).getByText("DOCENTE II")).toBeInTheDocument();
    });

    it("avisa quando uma coluna alimenta dois campos", async () => {
      const user = await abrir();
      await irParaPareamento(user);

      await escolher(user, "Cargo", "NOME (coluna C)");

      expect(
        await screen.findByText(/Uma mesma coluna alimenta mais de um campo/i),
      ).toBeInTheDocument();
    });

    it("linha sem o que identifica é anunciada antes de importar, não depois", async () => {
      const user = await abrir();
      // A coluna de cargo entra na matriz porque, desde D9, linha sem cargo também é
      // descartada — e o que este teste mede é o descarte por FALTA DE INSCRIÇÃO.
      // ⚠️ `CONFIRMADO` entrou aqui em 2026-08-01 por NECESSIDADE, não por simetria: o
      // campo virou obrigatório, e a prévia inteira — inclusive o alerta que este teste
      // mede — só renderiza com `mapeamentoCompleto`. Sem a coluna, o teste mediria a
      // ausência da prévia, não o descarte por falta de inscrição.
      await irParaPareamento(user, [
        ["ID", "NOME", "CPF", "CARGO", "CONFIRMADO"],
        ["", "SEM INSCRIÇÃO", "99528037704", "DOCENTE II", "1"],
        ["214274", "AGATHA LAMIM", "22940161739", "DOCENTE II", "1"],
      ]);
      await escolher(user, "Cargo", "CARGO");

      expect(
        await screen.findByText(/1 linha\(s\) não serão importadas/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/linha 2 \(Nº de inscrição vazio\)/i)).toBeInTheDocument();
    });
  });

  describe("passo 2 — o filtro de pagamento", () => {
    it("🔴 sem parear 'Inscrição Confirmada' NÃO dá para avançar", async () => {
      // A barreira que impede o pior caso possível deste fluxo: sem a coluna, toda linha
      // conta como não paga, o filtro descarta o arquivo inteiro e a TROCA TOTAL apaga a
      // lista do edital sem pôr ninguém no lugar.
      const user = await abrir();
      await irParaPareamento(user, [
        ["ID", "NOME", "CPF", "CARGO"],
        ["214274", "AGATHA LAMIM", "22940161739", "DOCENTE II"],
      ]);
      await escolher(user, "Cargo", "CARGO");

      expect(screen.getByRole("button", { name: /^Continuar$/i })).toBeDisabled();
    });

    it("🔴 controle positivo: com a coluna presente, avança", async () => {
      // Sem este par, o teste acima passaria mesmo se o botão estivesse quebrado e nunca
      // habilitasse — mediria "está desabilitado" sem provar que é o `confirmado` que o
      // desabilita.
      const user = await abrir();
      await irParaPareamento(user, [
        ["ID", "NOME", "CPF", "CARGO", "CONFIRMADO"],
        ["214274", "AGATHA LAMIM", "22940161739", "DOCENTE II", "1"],
      ]);
      await escolher(user, "Cargo", "CARGO");

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /^Continuar$/i })).toBeEnabled(),
      );
    });

    it("⭐ diz quantos entram e quantos ficam de fora, antes de qualquer coisa", async () => {
      // O "usuário deve ser informado" do pedido, no ponto em que ele acabou de escolher
      // qual coluna responde "pagou?".
      const user = await abrir();
      await irParaPareamento(user, MATRIZ_COM_NAO_PAGANTE);
      await escolher(user, "Cargo", "NOME (coluna E)");

      expect(
        await screen.findByText(/Só inscrições pagas serão importadas — 2 de 3/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/não serão importadas/i)).toBeInTheDocument();
      expect(screen.getByText(/seção/i)).toBeInTheDocument();
    });

    it("ninguém de fora: o aviso aparece MESMO ASSIM, dizendo que ninguém fica", async () => {
      // Aviso que só surge às vezes é aviso que ninguém aprende a procurar — e a pessoa
      // ficaria sem saber que a regra existe justamente quando ela não mordeu.
      const user = await abrir();
      await irParaPareamento(user, MATRIZ);
      await escolher(user, "Cargo", "NOME (coluna E)");

      expect(
        await screen.findByText(/Só inscrições pagas serão importadas — 3 de 3/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/ninguém fica de fora/i)).toBeInTheDocument();
    });

    it("🔴 o não-pagante NÃO chega ao lote importado", async () => {
      // A asserção que fecha o circuito: não basta a tela avisar, o filtro tem de agir.
      const user = await abrir();
      await irParaCargos(user, MATRIZ_COM_NAO_PAGANTE);
      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE I — HISTÓRIA");

      // Das 3 linhas, 1 é não-pagante e as outras 2 são a mesma pessoa em cargos
      // diferentes — logo, 2 entram.
      expect(
        await screen.findByRole("button", { name: /Importar 2 candidato\(s\)/i }),
      ).toBeInTheDocument();
    });
  });

  describe("passo 3 — cargos", () => {
    it("⭐ lista UM item por cargo distinto, com contagem e exemplos", async () => {
      // O MATRIZ tem 3 linhas em 2 cargos: DOCENTE II aparece 2×, HISTÓRIA 1×.
      const user = await abrir();
      await irParaCargos(user);

      expect(comboboxDoCargo("DOCENTE II")).toBeInTheDocument();
      expect(comboboxDoCargo("DOCENTE I - HISTÓRIA")).toBeInTheDocument();

      const linhaDocente = comboboxDoCargo("DOCENTE II").closest("tr") as HTMLElement;
      expect(within(linhaDocente).getByText("2")).toBeInTheDocument();
      expect(within(linhaDocente).getByText(/CASSIA ANDREA/)).toBeInTheDocument();
      expect(within(linhaDocente).getByText(/AGATHA LAMIM/)).toBeInTheDocument();
    });

    it("⭐ o botão fica desabilitado enquanto houver cargo sem associação, e DIZ quantos", async () => {
      // Botão cinza e mudo deixa o usuário procurando o que fazer. Decisão D4: com
      // cargo_id na chave natural, seguir com um cargo nulo funde inscritos em silêncio.
      const user = await abrir();
      await irParaCargos(user);

      // "DOCENTE II" já chega pré-preenchido por casamento exato com o catálogo; sobra
      // "DOCENTE I - HISTÓRIA", cujo hífen não casa com o travessão do cargo cadastrado.
      const importar = screen.getByRole("button", { name: /Importar 3 candidato\(s\)/i });
      expect(importar).toBeDisabled();
      expect(await screen.findByText(/Resolva 1 cargo\(s\) para importar/i)).toBeInTheDocument();

      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE I — HISTÓRIA");
      await waitFor(() => expect(importar).toBeEnabled());
      expect(screen.queryByText(/Resolva .* cargo\(s\)/i)).not.toBeInTheDocument();
    });

    it("marca o cargo sem associação com TEXTO, não só com cor", async () => {
      // Acessibilidade: a borda vermelha não é anunciada por leitor de tela.
      const user = await abrir();
      await irParaCargos(user);

      // "DOCENTE I - HISTÓRIA" é o que sobra sem associação: o hífen da planilha não casa
      // com o travessão do catálogo, então o pré-preenchimento não o alcança.
      const linha = comboboxDoCargo("DOCENTE I - HISTÓRIA").closest("tr") as HTMLElement;
      expect(within(linha).getByText("sem associação")).toBeInTheDocument();

      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE I — HISTÓRIA");
      await waitFor(() =>
        expect(within(linha).queryByText("sem associação")).not.toBeInTheDocument(),
      );
    });

    it("⭐ voltar ao pareamento e avançar de novo PRESERVA as associações", async () => {
      // Refazer nove associações por ter conferido uma coluna seria punir quem checa o
      // próprio trabalho.
      const user = await abrir();
      await irParaCargos(user);
      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE I — HISTÓRIA");
      await waitFor(() =>
        expect(screen.queryByText(/Resolva .* cargo\(s\)/i)).not.toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: /Voltar ao pareamento/i }));
      await screen.findByText("Pareamento de colunas");
      await user.click(await screen.findByRole("button", { name: /^Continuar$/i }));
      await screen.findByRole("heading", { name: "Cargos" });

      const linha = comboboxDoCargo("DOCENTE I - HISTÓRIA").closest("tr") as HTMLElement;
      expect(within(linha).queryByText("sem associação")).not.toBeInTheDocument();
      expect(screen.queryByText(/Resolva .* cargo\(s\)/i)).not.toBeInTheDocument();
    });

    it("⭐ avisa quando duas grafias apontam para o MESMO cargo", async () => {
      // É o efeito pretendido de padronizar, mas precisa ser visível ANTES de importar:
      // a partir da etapa 5 essas inscrições passam a compartilhar a chave natural.
      const user = await abrir();
      await irParaCargos(user);

      expect(
        screen.queryByText(/Grafias diferentes tratadas como o mesmo cargo/i),
      ).not.toBeInTheDocument();

      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE II");

      expect(
        await screen.findByText(/Grafias diferentes tratadas como o mesmo cargo/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/passa a contar uma vez só/i)).toBeInTheDocument();
    });

    it("⚠️ enquanto o catálogo carrega, NÃO mostra a tabela como se não houvesse cargo", async () => {
      // O padrão de defeito mais repetido deste repo: "vazio enquanto carrega"
      // indistinguível da resposta real. Aqui levaria o usuário a criar duplicata.
      const user = await abrir();
      await irParaPareamento(user);
      await escolher(user, "Cargo", "NOME (coluna E)");

      // A query de `cargos` só é disparada ao montar a página; para observar o estado de
      // carregamento, basta que o passo 3 apareça antes de ela responder — o que o teste
      // garante conferindo que o texto de carregamento é o que existe no primeiro frame.
      await user.click(await screen.findByRole("button", { name: /^Continuar$/i }));
      await screen.findByRole("heading", { name: "Cargos" });

      // Depois de carregado, a tabela está lá e o alerta de "nenhum cargo cadastrado" não.
      expect(comboboxDoCargo("DOCENTE II")).toBeInTheDocument();
      expect(screen.queryByText(/Nenhum cargo cadastrado ainda/i)).not.toBeInTheDocument();
    });

    it("catálogo vazio é anunciado como tal, e não confundido com erro", async () => {
      setTableResult("cargos", { data: [], error: null });
      const user = await abrir();
      await irParaCargos(user);

      expect(await screen.findByText(/Nenhum cargo cadastrado ainda/i)).toBeInTheDocument();
      // A tabela continua lá: o usuário vê o que a planilha trouxe, mesmo sem ter a quem
      // associar ainda. Criar cargo é a subetapa 4b.
      expect(comboboxDoCargo("DOCENTE II")).toBeInTheDocument();
    });

    it("a trilha mostra os cinco passos, na ordem", async () => {
      // A renumeração toca três lugares; errar um deixa um passo inalcançável.
      const user = await abrir();
      await irParaCargos(user);

      for (const rotulo of ["1. Arquivo", "2. Pareamento", "3. Cargos", "4. Importação", "5. Relatório"]) {
        expect(screen.getByText(rotulo)).toBeInTheDocument();
      }
    });
  });

  describe("passo 3 — criar cargo e memória de apelidos", () => {
    it("⭐ 'Criar novo…' abre o campo JÁ PREENCHIDO com o texto da planilha", async () => {
      // Campo em branco obrigaria a redigitar o nome inteiro. Partir do texto sujo
      // transforma a tarefa em "conserte o que está errado", que é o que ela de fato é.
      const user = await abrir();
      await irParaCargos(user);

      await associar(user, "DOCENTE I - HISTÓRIA", "+ Criar novo…");

      const campo = (await screen.findByLabelText("Nome do cargo novo")) as HTMLInputElement;
      expect(campo).toHaveValue("DOCENTE I - HISTÓRIA");
      expect(campo).toHaveFocus();
    });

    it("⭐ cria com o nome EDITADO, não com o texto sujo", async () => {
      setTableResult("cargos", { data: CATALOGO, error: null });
      const user = await abrir();
      await irParaCargos(user);
      await associar(user, "DOCENTE I - HISTÓRIA", "+ Criar novo…");

      const campo = await screen.findByLabelText("Nome do cargo novo");
      await user.clear(campo);
      await user.type(campo, "DOCENTE I — HISTÓRIA");
      await user.click(screen.getByRole("button", { name: /Criar e associar/i }));

      await waitFor(() => {
        const upsert = buildersDaTabela("cargos").find((b) => b.upsert.mock.calls.length > 0);
        expect(upsert?.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ nome: "DOCENTE I — HISTÓRIA" }),
          { onConflict: "nome_chave", ignoreDuplicates: true },
        );
      });
    });

    it("Esc fecha o campo e devolve o Select", async () => {
      const user = await abrir();
      await irParaCargos(user);
      await associar(user, "DOCENTE I - HISTÓRIA", "+ Criar novo…");
      await screen.findByLabelText("Nome do cargo novo");

      await user.keyboard("{Escape}");

      await waitFor(() =>
        expect(screen.queryByLabelText("Nome do cargo novo")).not.toBeInTheDocument(),
      );
      expect(comboboxDoCargo("DOCENTE I - HISTÓRIA")).toBeInTheDocument();
    });

    it("não deixa criar cargo com nome em branco", async () => {
      const user = await abrir();
      await irParaCargos(user);
      await associar(user, "DOCENTE I - HISTÓRIA", "+ Criar novo…");

      const campo = await screen.findByLabelText("Nome do cargo novo");
      await user.clear(campo);

      expect(screen.getByRole("button", { name: /Criar e associar/i })).toBeDisabled();
    });

    it("⭐ falha ao criar NÃO avança e mostra a mensagem do banco", async () => {
      // Seguir com o cargo por resolver produziria um lote com cargo_id nulo — o que D4
      // existe para impedir.
      setTableResult("cargos", {
        data: null,
        error: erroPostgrest("42501", "new row violates row-level security policy"),
      });
      const user = await abrir();
      await irParaCargos(user);
      await associar(user, "DOCENTE I - HISTÓRIA", "+ Criar novo…");
      await user.click(await screen.findByRole("button", { name: /Criar e associar/i }));

      expect(await screen.findByText(/Não foi possível criar o cargo/i)).toBeInTheDocument();
      expect(screen.getByText(/administrador/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Importar \d+ candidato/i })).toBeDisabled();
    });

    it("⭐ apelido guardado chega pré-selecionado, com o selo 'lembrado'", async () => {
      // O selo diz que a decisão é do próprio usuário, de outra importação — não um
      // palpite do sistema. Sem ele, discordar exige confiar que veio de algum lugar.
      setTableResult("cargo_apelidos", {
        data: [
          {
            texto_origem: "DOCENTE I - HISTÓRIA",
            texto_chave: "docente i - história",
            cargo_id: "cargo-historia",
          },
        ],
        error: null,
      });
      const user = await abrir();
      await irParaCargos(user);

      const linha = comboboxDoCargo("DOCENTE I - HISTÓRIA").closest("tr") as HTMLElement;
      await waitFor(() => expect(within(linha).getByText("lembrado")).toBeInTheDocument());
      expect(comboboxDoCargo("DOCENTE I - HISTÓRIA")).toHaveTextContent("DOCENTE I — HISTÓRIA");
      expect(screen.queryByText(/Resolva .* cargo\(s\)/i)).not.toBeInTheDocument();
    });

    it("trocar uma associação lembrada tira o selo — a decisão nova é do usuário", async () => {
      setTableResult("cargo_apelidos", {
        data: [
          {
            texto_origem: "DOCENTE I - HISTÓRIA",
            texto_chave: "docente i - história",
            cargo_id: "cargo-historia",
          },
        ],
        error: null,
      });
      const user = await abrir();
      await irParaCargos(user);
      const linha = comboboxDoCargo("DOCENTE I - HISTÓRIA").closest("tr") as HTMLElement;
      await waitFor(() => expect(within(linha).getByText("lembrado")).toBeInTheDocument());

      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE II");

      await waitFor(() => expect(within(linha).queryByText("lembrado")).not.toBeInTheDocument());
    });

    it("⚠️ pré-preenchimento NÃO chuta: texto sem casamento fica vazio", async () => {
      // A mesma regra que mantém TIPOPROVA fora dos sinônimos do pareamento — sugerir
      // errado é pior que não sugerir, porque o que parece decidido é conferido com
      // menos atenção.
      const user = await abrir();
      await irParaCargos(user);

      const linha = comboboxDoCargo("DOCENTE I - HISTÓRIA").closest("tr") as HTMLElement;
      expect(within(linha).getByText("sem associação")).toBeInTheDocument();
      expect(comboboxDoCargo("DOCENTE I - HISTÓRIA")).toHaveTextContent("— selecione —");
    });

    it("⭐ guarda os apelidos de TODAS as associações ao importar", async () => {
      const user = await abrir();
      await irParaCargos(user);
      await associarTodos(user);
      await importarEConfirmar(user);
      await screen.findByText("Lista do edital substituída");

      const upsert = buildersDaTabela("cargo_apelidos").find(
        (b) => b.upsert.mock.calls.length > 0,
      );
      const pares = upsert?.upsert.mock.calls[0][0];
      expect(pares).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ texto_origem: "DOCENTE II", cargo_id: "cargo-docente-ii" }),
          expect.objectContaining({
            texto_origem: "DOCENTE I - HISTÓRIA",
            cargo_id: "cargo-historia",
          }),
        ]),
      );
      expect(upsert?.upsert).toHaveBeenCalledWith(expect.any(Array), {
        onConflict: "texto_chave",
      });
    });

    it("⭐ o lote enviado leva o cargo_id do cargo escolhido", async () => {
      const user = await abrir();
      await irParaCargos(user);
      await associarTodos(user);
      await importarEConfirmar(user);
      await screen.findByText("Lista do edital substituída");

      // ⚠️ O lote vai para o PREPARO, e o candidato viaja dentro de `linha` (jsonb).
      const envio = buildersDaTabela("candidatos_importacao").find(
        (b) => b.insert.mock.calls.length > 0,
      );
      const linhas = (envio?.insert.mock.calls[0][0] as { linha: Record<string, unknown> }[]).map(
        (l) => l.linha,
      );
      expect(linhas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cargo: "DOCENTE II", cargo_id: "cargo-docente-ii" }),
          expect.objectContaining({
            cargo: "DOCENTE I - HISTÓRIA",
            cargo_id: "cargo-historia",
          }),
        ]),
      );
    });

    it("⭐ (4c) o relatório conta lembrados e definidos agora", async () => {
      setTableResult("cargo_apelidos", {
        data: [
          {
            texto_origem: "DOCENTE I - HISTÓRIA",
            texto_chave: "docente i - história",
            cargo_id: "cargo-historia",
          },
        ],
        error: null,
      });
      const user = await abrir();
      await irParaCargos(user);
      await waitFor(() =>
        expect(screen.queryByText(/Resolva .* cargo\(s\)/i)).not.toBeInTheDocument(),
      );
      await importarEConfirmar(user);
      await screen.findByText("Lista do edital substituída");

      // "DOCENTE II" veio do casamento exato com o catálogo (definido agora);
      // "DOCENTE I - HISTÓRIA" veio do apelido guardado (lembrado).
      expect(
        screen.getByText(/2 cargo\(s\): 1 lembrado\(s\), 1 definido\(s\) agora/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/aba/i)).toBeInTheDocument();
    });

    it("falhar ao guardar o apelido NÃO barra a importação", async () => {
      // Assimetria deliberada com a criação de cargo: o apelido é atalho para a próxima
      // vez; a importação é o objetivo. Perder o atalho não pode custar as 7.416 linhas.
      setTableResult("cargo_apelidos", {
        data: null,
        error: erroPostgrest("42501", "permission denied for table cargo_apelidos"),
      });
      const user = await abrir();
      await irParaCargos(user);
      await associarTodos(user);
      await importarEConfirmar(user);

      expect(await screen.findByText("Lista do edital substituída")).toBeInTheDocument();
    });
  });

  describe("🔴 o aviso de perda das marcações de 'fora do automático'", () => {
    it("conta as marcações e avisa ANTES de trocar a lista", async () => {
      // A FK é CASCADE: a troca total leva as marcações junto, sem erro nenhum. E como os
      // inscritos voltam com ids NOVOS, não há como preservá-las. Este aviso é a mitigação
      // INTEIRA — sem ele a pessoa refaz trabalho manual sem saber que o perdeu.
      setTableResult("candidatos_fora_do_automatico", {
        data: [],
        error: null,
        count: 37,
      });
      const user = await abrir();
      await irParaCargos(user);
      await associarTodos(user);
      await user.click(await screen.findByRole("button", { name: /Importar 3 candidato\(s\)/i }));

      expect(await screen.findByText(/37 marcação\(ões\)/)).toBeInTheDocument();
      // E diz POR QUE não dá para preservar — senão parece descuido, não consequência.
      expect(screen.getByText(/identificadores novos/i)).toBeInTheDocument();
    });

    it("⭐ CONTROLE: sem marcação nenhuma, o aviso NÃO aparece", async () => {
      // Aviso que aparece sempre vira ruído e deixa de ser lido — inclusive quando é real.
      setTableResult("candidatos_fora_do_automatico", { data: [], error: null, count: 0 });
      const user = await abrir();
      await irParaCargos(user);
      await associarTodos(user);
      await user.click(await screen.findByRole("button", { name: /Importar 3 candidato\(s\)/i }));

      expect(await screen.findByText(/serão \*?\*?apagados|serão/i)).toBeInTheDocument();
      expect(screen.queryByText(/marcação\(ões\)/)).not.toBeInTheDocument();
    });
  });

  describe("importação e relatório", () => {
    async function importar(user: ReturnType<typeof userEvent.setup>) {
      await irParaCargos(user);
      await associarTodos(user);
      await importarEConfirmar(user);
      await screen.findByText("Lista do edital substituída");
    }

    it("relata os números vindos do BANCO, não contagem do cliente", async () => {
      setRpcResult("trocar_candidatos_do_edital", {
        data: [{ removidos: 12, inseridos: 3 }],
        error: null,
      });
      const user = await abrir();
      await importar(user);

      expect(screen.getByText("Inseridos").previousElementSibling).toHaveTextContent("3");
      expect(screen.getByText("Removidos").previousElementSibling).toHaveTextContent("12");
    });

    it("⭐ sobe para o preparo e chama a troca com o total esperado", async () => {
      // A lista do edital NÃO é escrita pelo cliente: quem a troca é a RPC, numa
      // transação. Se algum dia voltar a haver escrita direta em `candidatos` aqui, a
      // atomicidade da troca some.
      const user = await abrir();
      await importar(user);

      const envio = buildersDaTabela("candidatos_importacao").find(
        (b) => b.insert.mock.calls.length > 0,
      );
      expect(envio?.insert).toHaveBeenCalled();
      expect(buildersDaTabela("candidatos").filter((b) => b.upsert.mock.calls.length > 0)).toEqual(
        [],
      );
    });

    it("🔴 o relatório PERSISTIDO vai na MESMA chamada da troca, e bate com o que a tela mostraria", async () => {
      // Fecha o circuito inteiro: passo 2 filtra a AGATHA por não-pagamento -> a tela usa
      // o MESMO `relatorio` (useMemo) para export e para a persistência -> a RPC recebe a
      // linha dela, já traduzida para o formato snake_case do banco.
      const user = await abrir();
      await irParaCargos(user, MATRIZ_COM_NAO_PAGANTE);
      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE I — HISTÓRIA");
      await user.click(await screen.findByRole("button", { name: /Importar 2 candidato\(s\)/i }));
      await user.click(await screen.findByRole("button", { name: /Substituir os inscritos/i }));
      await screen.findByText("Lista do edital substituída");

      const chamada = supabaseMock.rpc.mock.calls.find(
        ([nome]) => nome === "trocar_candidatos_do_edital",
      );
      const relatorioEnviado = (chamada?.[1] as { p_relatorio: unknown[] }).p_relatorio;
      expect(relatorioEnviado).toContainEqual(
        expect.objectContaining({
          situacao: "Não importada (inscrição não paga)",
          campo: "Pagamento",
          detalhe: expect.stringContaining("AGATHA LAMIM"),
        }),
      );
      // ⚠️ NÃO os rótulos do export ("Situação", "Campo" com acento) — se este assert
      // falhar com as chaves acentuadas, o hook parou de traduzir antes de mandar.
      expect(Object.keys(relatorioEnviado[0])).toEqual(["n_inscricao", "situacao", "campo", "detalhe"]);
    });

    it("⭐ o pedido de SALA ESPECIAL chega ao relatório persistido, uma linha por pedido", async () => {
      // O circuito inteiro do campo novo (2026-08-04): a coluna auto-mapeia no passo 2 ->
      // `converterLinha` guarda o texto cru -> `inscritosComSalaEspecial` monta a quinta
      // origem -> a MESMA variável que alimenta os exports vai para a RPC.
      const user = await abrir();
      await irParaCargos(user, MATRIZ_COM_SALA_ESPECIAL);
      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE I — HISTÓRIA");
      await importarEConfirmar(user);
      await screen.findByText("Lista do edital substituída");

      const chamada = supabaseMock.rpc.mock.calls.find(
        ([nome]) => nome === "trocar_candidatos_do_edital",
      );
      const relatorioEnviado = (chamada?.[1] as { p_relatorio: unknown[] }).p_relatorio;

      const pedidos = relatorioEnviado.filter(
        (l) => (l as { campo: string }).campo === "Sala Especial",
      );
      // UMA linha, e não duas: a CASSIA tem duas inscrições no arquivo, e só uma delas
      // trouxe pedido. Duas linhas aqui significariam que o pedido vazou para a outra.
      expect(pedidos).toHaveLength(1);
      expect(pedidos[0]).toEqual(
        expect.objectContaining({
          situacao: "Importada com sala especial",
          campo: "Sala Especial",
          detalhe: expect.stringContaining("Ledor e prova ampliada"),
        }),
      );
      // O NOME junto do pedido: quem vai montar as salas precisa saber de quem é cada um.
      expect((pedidos[0] as { detalhe: string }).detalhe).toContain("CASSIA ANDREA");
    });

    it("🔴 quem NÃO pediu sala especial não vira linha do relatório", async () => {
      // CONTROLE: sem este teste, um filtro invertido (listar quem tem o campo NULO)
      // encheria o relatório com a lista inteira de inscritos e o teste acima passaria.
      const user = await abrir();
      await irParaCargos(user, MATRIZ_COM_SALA_ESPECIAL);
      await associar(user, "DOCENTE I - HISTÓRIA", "DOCENTE I — HISTÓRIA");
      await importarEConfirmar(user);
      await screen.findByText("Lista do edital substituída");

      const chamada = supabaseMock.rpc.mock.calls.find(
        ([nome]) => nome === "trocar_candidatos_do_edital",
      );
      const relatorioEnviado = (chamada?.[1] as { p_relatorio: unknown[] }).p_relatorio;
      expect(
        relatorioEnviado.filter((l) => (l as { detalhe: string }).detalhe.includes("AGATHA")),
      ).toEqual([]);
    });

    it("🔴 bloco que falha: a tela diz que NINGUÉM foi removido", async () => {
      // ⚠️ A INVERSÃO da troca total. Antes, um bloco falho deixava a importação pela
      // metade; agora a lista fica INTACTA. Sem dizer isso, o usuário assume o pior e
      // pode ir "consertar" à mão uma lista que ninguém tocou.
      setTableResult("candidatos_importacao", {
        data: null,
        error: erroPostgrest("23505", "duplicate key value violates unique constraint"),
      });
      const user = await abrir();
      await irParaCargos(user);
      await associarTodos(user);
      await importarEConfirmar(user);

      expect(await screen.findByText("A lista NÃO foi alterada")).toBeInTheDocument();
      expect(
        screen.getByText(/A troca não foi executada — ninguém foi removido/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/continua exatamente como estava/i)).toBeInTheDocument();
    });

    it("⭐ a confirmação mostra o CONTRASTE, e cancelar não importa nada", async () => {
      // É a proteção contra arquivo truncado: quem esperava trocar 7.416 por 7.416 e lê
      // "por 3" para na hora. E o diálogo tem de ser cancelável de verdade.
      setRpcResult("contar_candidatos_por_edital", {
        data: [{ edital_id: EDITAL.id, total: 7416 }],
        error: null,
      });
      const user = await abrir();
      await irParaCargos(user);
      await associarTodos(user);
      await user.click(await screen.findByRole("button", { name: /Importar 3 candidato\(s\)/i }));

      expect(await screen.findByText(/no edital hoje/i)).toBeInTheDocument();
      // O número aparece duas vezes de propósito: no contraste e na frase que diz o que
      // vai acontecer com ele. `getAllByText` em vez de `getByText` por isso.
      expect(screen.getAllByText("7.416").length).toBeGreaterThan(0);
      // ⚠️ Era `/nesta planilha/`. O rótulo mudou em 2026-08-01 junto com o filtro de
      // pagamento: o número deixou de ser o tamanho da planilha e passou a ser quantos
      // VÃO ENTRAR. Asserção nova mede o rótulo novo — e o par negativo garante que o
      // antigo, que virou promessa falsa, não voltou.
      expect(screen.getByText(/vão entrar/i)).toBeInTheDocument();
      expect(screen.queryByText(/nesta planilha/i)).not.toBeInTheDocument();
      // A planilha traz menos da metade: o aviso de arquivo possivelmente incompleto.
      expect(screen.getByText(/menos da metade dos inscritos/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Cancelar/i }));
      expect(
        buildersDaTabela("candidatos_importacao").filter((b) => b.insert.mock.calls.length > 0),
      ).toEqual([]);
    });

    it("leva de volta à listagem no fim", async () => {
      const user = await abrir();
      await importar(user);

      await user.click(screen.getByRole("button", { name: /Ver candidatos/i }));
      expect(navigateMock).toHaveBeenCalledWith("/candidatos");
    });

    it("oferece os DOIS formatos de relatório, nomeando cada um", async () => {
      // Planilha e documento não são o mesmo relatório em dois arquivos: o XLS entrega
      // lista plana para o Excel filtrar, o PDF vem timbrado e agrupado por campo, para
      // anexar a processo. O rótulo tem de dizer qual é qual antes do clique.
      const user = await abrir();
      await importar(user);

      expect(screen.getByRole("button", { name: /Baixar Planilha \(XLS\)/i })).toBeEnabled();
      expect(screen.getByRole("button", { name: /Baixar Documento \(PDF\)/i })).toBeEnabled();
    });

    it("🔴 PDF que falha DIZ que falhou — e que os inscritos estão salvos", async () => {
      // ⚠️ A primeira versão engolia a exceção num `console.error`: o botão voltava ao
      // normal, nada baixava, e nada explicava. Perda silenciosa — a pessoa fica sem
      // saber se o problema foi o download ou a importação.
      //
      // As duas metades da mensagem são o objeto do teste. Dizer só "falhou" faria o
      // usuário refazer a importação inteira, que JÁ terminou com sucesso neste ponto:
      // o que falhou é o documento, e a planilha continua disponível com os mesmos dados.
      pdfDeveFalhar.valor = true;
      const user = await abrir();
      await importar(user);

      await user.click(screen.getByRole("button", { name: /Baixar Documento \(PDF\)/i }));

      const titulo = await screen.findByText(/Não foi possível gerar o documento/i);
      // ⚠️ Escopado ao alerta: "planilha (XLS)" também é o rótulo do outro botão, e uma
      // busca solta morreria por ambiguidade em vez de medir a mensagem.
      const alerta = titulo.closest('[role="alert"]') as HTMLElement;
      expect(within(alerta).getByText(/já foram importados e estão salvos/i)).toBeInTheDocument();
      expect(within(alerta).getByText(/planilha \(XLS\)/i)).toBeInTheDocument();
      // E o botão volta a ficar clicável: falha não pode deixar a tela travada no spinner.
      expect(screen.getByRole("button", { name: /Baixar Documento \(PDF\)/i })).toBeEnabled();
    });

    it("PDF que dá certo NÃO deixa mensagem de erro na tela", async () => {
      // Controle positivo do teste acima: sem ele, um <Alert> renderizado sempre passaria
      // por lá e ninguém veria.
      const user = await abrir();
      await importar(user);

      await user.click(screen.getByRole("button", { name: /Baixar Documento \(PDF\)/i }));

      await waitFor(() => expect(salvarPdf).toHaveBeenCalled());
      expect(screen.queryByText(/Não foi possível gerar o documento/i)).not.toBeInTheDocument();

      // O nome carrega o arquivo de origem e o carimbo de quando foi gerado: duas
      // exportações da mesma planilha não se sobrescrevem na pasta de downloads.
      expect(salvarPdf.mock.calls[0][0]).toMatch(/^inscritos_relatorio_\d{2}-\d{2}-\d{4} .+\.pdf$/);
    });
  });
});
