/**
 * Bateria do assistente de importação de candidatos.
 *
 * ⭐ **O teste que justifica este arquivo é o do alerta de chave repetida.** Todos os
 * outros defeitos possíveis aqui são barulhentos — a importação falha, aparece erro,
 * alguém percebe. Aquele é **silencioso**: se o campo *Cargo* ficar sem parear, as
 * inscrições da mesma pessoa em cargos diferentes colidem na chave natural, a barra
 * chega a 100%, o relatório diz "concluída" e **396 inscritos do arquivo real
 * simplesmente não estão lá**. O alerta é a única coisa entre o usuário e essa perda.
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
  resetSupabaseMock,
  erroPostgrest,
  buildersDaTabela,
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
 *  - a mesma inscrição (213946) em dois cargos, que é o caso dos 382 do arquivo real.
 */
const MATRIZ = [
  ["   ", "ID", "NOME", "CPF", "NOME"],
  ["1", "213946", "CASSIA ANDREA", "99528037704", "DOCENTE II"],
  ["2", "213946", "CASSIA ANDREA", "99528037704", "DOCENTE I - HISTÓRIA"],
  ["3", "214274", "AGATHA LAMIM", "22940161739", "DOCENTE II"],
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

describe("CandidatosImportar (interação)", () => {
  beforeEach(() => {
    resetSupabaseMock();
    navigateMock.mockClear();
    setTableResult("editais", { data: [EDITAL], error: null });
    setTableResult("candidatos", { data: null, error: null });
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
      expect(await screen.findByText(/3 linha\(s\) de dados, 5 coluna\(s\)/)).toBeInTheDocument();
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

      // CONTROLE POSITIVO: campo opcional não se anuncia como obrigatório.
      expect(comboboxDoCampo("Cargo")).not.toHaveAttribute("aria-required", "true");
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

    it("⭐⭐ ALERTA EM VERMELHO quando as chaves colidem e o cargo está sem parear", async () => {
      // ESTE é o teste que não pode cair. Com o cargo em branco, as duas inscrições
      // 213946 viram uma só: 3 linhas na planilha, 2 candidatos. No arquivo real isso
      // são 396 pessoas sumindo sem erro nenhum.
      const user = await abrir();
      await irParaPareamento(user);

      const alerta = await screen.findByText(
        /1 linha\(s\) têm o mesmo nº de inscrição e o mesmo cargo/i,
      );
      const bloco = alerta.closest('[role="alert"]') ?? alerta.parentElement!;
      expect(within(bloco as HTMLElement).getByText(/não foi pareado/i)).toBeInTheDocument();
      // E aponta onde o cargo costuma estar, em vez de só reclamar.
      expect(
        within(bloco as HTMLElement).getByText(/segunda coluna chamada NOME/i),
      ).toBeInTheDocument();
    });

    it("⭐⭐ parear o cargo desfaz a colisão e recupera o inscrito", async () => {
      // O controle positivo do teste acima: prova que o alerta some porque o problema
      // acabou, e não porque a condição do alerta está quebrada.
      const user = await abrir();
      await irParaPareamento(user);

      expect(
        await screen.findByRole("button", { name: /Importar 2 candidato\(s\)/i }),
      ).toBeInTheDocument();

      await escolher(user, "Cargo", "NOME (coluna E)");

      expect(
        await screen.findByRole("button", { name: /Importar 3 candidato\(s\)/i }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByText(/têm o mesmo nº de inscrição e o mesmo cargo/i),
        ).not.toBeInTheDocument(),
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
      await irParaPareamento(user, [
        ["ID", "NOME", "CPF"],
        ["", "SEM INSCRIÇÃO", "99528037704"],
        ["214274", "AGATHA LAMIM", "22940161739"],
      ]);

      expect(
        await screen.findByText(/1 linha\(s\) não serão importadas/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/linha 2 \(Nº de inscrição vazio\)/i)).toBeInTheDocument();
    });
  });

  describe("importação e relatório", () => {
    async function importar(user: ReturnType<typeof userEvent.setup>) {
      await irParaPareamento(user);
      await escolher(user, "Cargo", "NOME (coluna E)");
      await user.click(await screen.findByRole("button", { name: /Importar 3 candidato\(s\)/i }));
      await screen.findByText("Importação concluída");
    }

    it("grava e relata quantos entraram", async () => {
      const user = await abrir();
      await importar(user);

      expect(screen.getByText("Gravados").previousElementSibling).toHaveTextContent("3");
    });

    it("manda tudo num bloco só, com o onConflict da chave natural", async () => {
      const user = await abrir();
      await importar(user);

      const envio = buildersDaTabela("candidatos").find((b) => b.upsert.mock.calls.length > 0);
      expect(envio?.upsert).toHaveBeenCalledWith(expect.any(Array), {
        onConflict: "edital_id,n_inscricao,cargo_chave",
      });
    });

    it("traduz a falha do bloco e diz que dá para reimportar", async () => {
      // Reimportar é sempre seguro porque o upsert é idempotente — a mensagem precisa
      // dizer isso, senão a pessoa fica sem saber se vai duplicar tudo ao tentar de novo.
      setTableResult("candidatos", {
        data: null,
        error: erroPostgrest("23514", 'violates check constraint "chk_candidato_cpf_formato"'),
      });
      const user = await abrir();
      await importar(user);

      expect(screen.getByText(/1 bloco\(s\) falharam/i)).toBeInTheDocument();
      expect(screen.getByText(/CPF fora do formato de 11 dígitos/i)).toBeInTheDocument();
      expect(screen.getByText(/o que já entrou será atualizado, não/i)).toBeInTheDocument();
    });

    it("leva de volta à listagem no fim", async () => {
      const user = await abrir();
      await importar(user);

      await user.click(screen.getByRole("button", { name: /Ver candidatos/i }));
      expect(navigateMock).toHaveBeenCalledWith("/candidatos");
    });
  });
});
