/**
 * Bateria da tela de listagem de Candidatos.
 *
 * É o primeiro teste de COMPORTAMENTO de página deste projeto — até aqui, das páginas só
 * o guard era testado (`guards.test.tsx`). O que justifica abrir a exceção nesta tela são
 * três coisas que só existem aqui e somem sem quebrar nada:
 *
 *  1. **O total exibido vem do `count` do servidor**, não do tamanho da página. Uma
 *     regressão aqui faz a tela dizer "50 inscritos" num edital com 7.416.
 *  2. **As duas confirmações são deliberadamente diferentes** — excluir um inscrito não
 *     pede senha, limpar o edital inteiro pede. Uniformizar as duas (em qualquer
 *     direção) é a mudança "inofensiva" que alguém faz sem saber que era decisão.
 *  3. **A data é formatada sem `new Date`**, senão o Brasil inteiro vê o dia anterior.
 *
 * Ver `my_rules/estrutura/modulos/candidatos/00-modulo.md` e as 7 armadilhas em
 * `my_rules/estrutura/transversais/testes.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  supabaseMock,
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  buildersDaTabela,
  type QueryResult,
} from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

/**
 * O `Layout` (que a página envolve) consome o `useAuth` inteiro. Mockar o hook — e não
 * montar o AuthProvider — segue o padrão do `guards.test.tsx`: o objeto de teste aqui é
 * a LISTAGEM, não a sessão.
 */
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

import Candidatos from "./Candidatos";

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
 * O catálogo de cargos, que alimenta o filtro.
 *
 * `DOCENTE I — HISTÓRIA` com travessão de verdade é o nome CANÔNICO; o que veio na planilha
 * é `DOCENTE I ¿ HISTÓRIA`, com o travessão cp1252 lido como latin-1. A diferença entre os
 * dois é o assunto inteiro da etapa 6.
 */
const CARGO_HISTORIA = {
  id: "cargo-historia",
  nome: "DOCENTE I — HISTÓRIA",
  nome_chave: "docente i — história",
  ativo: true,
  created_at: null,
  updated_at: null,
};

const CARGO_DOCENTE_II = {
  id: "cargo-docente-ii",
  nome: "DOCENTE II",
  nome_chave: "docente ii",
  ativo: true,
  created_at: null,
  updated_at: null,
};

const AGATHA = {
  id: "cand-1",
  edital_id: "edital-1",
  n_inscricao: "214274",
  cargo: "DOCENTE I ¿ HISTÓRIA",
  cargo_id: CARGO_HISTORIA.id,
  cargos: { id: CARGO_HISTORIA.id, nome: CARGO_HISTORIA.nome },
  nome: "AGATHA LAMIM DE SOUZA",
  cpf: "22940161739",
  email: "agathalamim86@gmail.com",
  telefone: null,
  celular: "(24) 9982-20527",
  logradouro: "RUA VEREADOR ACÁCIO DA ROCHA",
  numero: "161",
  complemento: null,
  bairro: "AÇUDE",
  cidade: "VOLTA REDONDA",
  uf: "RJ",
  cep: "27276385",
  identidade_numero: "22940161739",
  identidade_orgao: "DETRAN",
  identidade_uf: "RJ",
  identidade_emissao: "2023-12-13",
  data_nascimento: "2005-12-08",
  hora_nascimento: "12:43:00",
  sexo: "1",
  raca: 2,
  portador_deficiencia: false,
  confirmado: true,
  concurso_id_origem: "242",
  created_at: null,
  updated_at: null,
};

/** Ver o helper homônimo em `useCandidatos.test.tsx`: o `count` viaja junto do `data`. */
function pagina(candidatos: unknown[], total = candidatos.length) {
  return { data: candidatos, error: null, count: total } as unknown as QueryResult<unknown[]>;
}

/** Monta o cenário completo da tela: editais, contagem por edital e uma página. */
function cenario({
  editais = [EDITAL],
  candidatos = [AGATHA],
  total = candidatos.length,
  contagem = [{ edital_id: "edital-1", total: 7416 }],
  cargos = [CARGO_HISTORIA, CARGO_DOCENTE_II],
}: {
  editais?: unknown[];
  candidatos?: unknown[];
  total?: number;
  contagem?: { edital_id: string; total: number }[];
  cargos?: unknown[];
} = {}) {
  setTableResult("editais", { data: editais, error: null });
  setTableResult("candidatos", pagina(candidatos, total));
  setTableResult("cargos", { data: cargos, error: null });
  setRpcResult("contar_candidatos_por_edital", { data: contagem, error: null });
}

/**
 * Renderiza a tela. NÃO espera nada aqui de propósito: sem edital cadastrado a página
 * troca o cabeçalho inteiro pelo estado vazio, então qualquer espera fixa neste helper
 * valeria para metade dos cenários e travaria a outra. Cada teste espera pelo que ele
 * mesmo afirma — é a armadilha 6 de `testes.md` (espera positiva, nunca timeout).
 */
function abrir() {
  const user = userEvent.setup();
  renderWithProviders(<Candidatos />, { route: "/candidatos" });
  return user;
}

/** Seleciona o edital pelo card — é assim que a tela filtra. */
async function escolherEdital(user: ReturnType<typeof userEvent.setup>, nome = EDITAL.nome) {
  await user.click(await screen.findByRole("button", { name: new RegExp(nome, "i") }));
}

describe("Candidatos (interação)", () => {
  beforeEach(() => {
    resetSupabaseMock();
    navigateMock.mockClear();
  });

  describe("sem edital cadastrado", () => {
    beforeEach(() => cenario({ editais: [], candidatos: [], contagem: [] }));

    it("explica que o inscrito pertence a um edital e oferece a saída", async () => {
      // Candidato não existe solto: é sempre inscrito de um concurso. Mandar para
      // /editais é a mesma saída que o ProvaDialog dá quando falta edital.
      abrir();

      expect(await screen.findByText(/Nenhum edital cadastrado/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cadastrar Edital" })).toBeInTheDocument();
    });

    it("não consulta candidatos quando não há edital nenhum", async () => {
      abrir();
      await screen.findByText(/Nenhum edital cadastrado/i);

      expect(supabaseMock.from).not.toHaveBeenCalledWith("candidatos");
    });
  });

  describe("com editais, antes de escolher um", () => {
    beforeEach(() => cenario());

    it("pede que se escolha o edital", async () => {
      abrir();

      expect(await screen.findByText("Escolha um edital")).toBeInTheDocument();
    });

    it("não consulta candidatos antes da escolha", async () => {
      // `enabled: !!editalId` no hook. Sem isso a tela traria inscrito de todos os
      // editais misturado, sem nada indicando a mistura.
      abrir();
      await screen.findByText("Escolha um edital");

      expect(supabaseMock.from).not.toHaveBeenCalledWith("candidatos");
    });

    it("mostra em cada card quantos inscritos o edital já tem", async () => {
      // A contagem vem da RPC, não de `editais.n_candidatos` — que é a PREVISÃO
      // digitada à mão no edital e não tem relação com a lista real.
      abrir();

      expect(await screen.findByText(/7416 inscrito\(s\) importado\(s\)/i)).toBeInTheDocument();
      expect(screen.queryByText(/7000/)).not.toBeInTheDocument();
    });
  });

  describe("com o edital escolhido", () => {
    beforeEach(() => cenario({ total: 7416 }));

    it("⭐ lista o cargo CANÔNICO, não o texto sujo da planilha", async () => {
      // O ganho da etapa 6, e ele só é visível como par: mostrar o nome do catálogo E não
      // mostrar mais o texto de origem. Sem a segunda asserção, um `?? c.cargo` deixado
      // para trás passaria — e a tela continuaria exibindo `¿` como sempre exibiu.
      const user = abrir();
      await escolherEdital(user);

      expect(await screen.findByText("AGATHA LAMIM DE SOUZA")).toBeInTheDocument();
      expect(screen.getByText("214274")).toBeInTheDocument();
      expect(screen.getByText("DOCENTE I — HISTÓRIA")).toBeInTheDocument();
      expect(screen.queryByText("DOCENTE I ¿ HISTÓRIA")).not.toBeInTheDocument();
    });

    it("inscrito sem cargo no catálogo mostra '—' e não quebra a linha", async () => {
      // `cargo_id` é NULLABLE no banco — obrigatório só no assistente. Uma linha assim não
      // tem cargo canônico a exibir, e o traço é preciso: quem quiser saber o que veio na
      // origem abre a ficha, que mostra o texto cru.
      cenario({ candidatos: [{ ...AGATHA, cargo_id: null, cargos: null }] });
      const user = abrir();
      await escolherEdital(user);

      const linha = (await screen.findByText("AGATHA LAMIM DE SOUZA")).closest("tr");
      expect(within(linha as HTMLElement).getByText("—")).toBeInTheDocument();
      expect(screen.queryByText("DOCENTE I ¿ HISTÓRIA")).not.toBeInTheDocument();
    });

    it("formata o CPF", async () => {
      const user = abrir();
      await escolherEdital(user);

      expect(await screen.findByText("229.401.617-39")).toBeInTheDocument();
    });

    it("⭐ mostra a data de nascimento SEM voltar um dia", async () => {
      // '2005-12-08' passado a `new Date` é lido como UTC e, em qualquer fuso negativo
      // — o Brasil inteiro —, volta para 07/12. Por isso a página fatia a string em vez
      // de construir Date. Quem "melhorar" isso com toLocaleDateString reintroduz o bug.
      const user = abrir();
      await escolherEdital(user);

      expect(await screen.findByText("08/12/2005")).toBeInTheDocument();
      expect(screen.queryByText("07/12/2005")).not.toBeInTheDocument();
    });

    it("⭐ mostra o total do servidor, não o tamanho da página", async () => {
      const user = abrir();
      await escolherEdital(user);

      // Busca EXATA, não regex: o card do edital diz "7416 inscrito(s) importado(s)" e o
      // cabeçalho da lista diz "7416 inscrito(s)". Um regex de substring casa com os dois
      // e derruba o teste por ambiguidade — foi o que o deixou vermelho quando o módulo
      // nasceu. Os dois contadores coexistem de propósito: um é do edital, outro da lista.
      expect(await screen.findByText("7416 inscrito(s)")).toBeInTheDocument();
    });

    it("não marca com badge quem está confirmado e não é PcD", async () => {
      // CONTROLE POSITIVO das badges: sem ele, um teste que só verifica a presença
      // passaria com uma badge que aparece para todo mundo.
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      expect(screen.queryByText("PcD")).not.toBeInTheDocument();
      expect(screen.queryByText("não confirmada")).not.toBeInTheDocument();
    });

    it("marca PcD e inscrição não confirmada", async () => {
      cenario({ candidatos: [{ ...AGATHA, portador_deficiencia: true, confirmado: false }] });
      const user = abrir();
      await escolherEdital(user);

      expect(await screen.findByText("PcD")).toBeInTheDocument();
      expect(screen.getByText("não confirmada")).toBeInTheDocument();
    });

    it("as ações da linha dizem EM QUEM se está clicando", async () => {
      // REGRESSÃO (2026-07-27). O botão de excluir só tinha o ícone de lixeira — nenhum
      // nome acessível —, e o de ver dizia só "Ver". Numa página de até 50 inscritos,
      // quem navega por leitor de tela ouvia "botão" e "Ver" repetidos 50 vezes, sem
      // saber de quem era a linha. Antes disso o teste precisava clicar por POSIÇÃO, o
      // que era o sintoma. Se os rótulos sumirem, estas duas buscas param de achar.
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      expect(
        screen.getByRole("button", { name: "Excluir AGATHA LAMIM DE SOUZA" }),
      ).toBeInTheDocument();
      // "Ver ficha de …" começa com a palavra que aparece na tela ("Ver"), como a WCAG
      // 2.5.3 exige de quem tem texto visível — quem usa comando de voz fala o que vê.
      expect(
        screen.getByRole("button", { name: "Ver ficha de AGATHA LAMIM DE SOUZA" }),
      ).toHaveTextContent("Ver");
    });

    it("abre a ficha completa com os campos que a tabela não mostra", async () => {
      const user = abrir();
      await escolherEdital(user);
      await user.click(await screen.findByRole("button", { name: "Ver ficha de AGATHA LAMIM DE SOUZA" }));

      const ficha = await screen.findByRole("dialog");
      expect(within(ficha).getByText("agathalamim86@gmail.com")).toBeInTheDocument();
      expect(within(ficha).getByText("AÇUDE")).toBeInTheDocument();
      // O código 2 de RACA_MAP é "Branca" — a ficha traduz em vez de exibir o número.
      expect(within(ficha).getByText("Branca")).toBeInTheDocument();
    });

    it("⭐ a ficha mostra o cargo canônico E o texto que veio na planilha", async () => {
      // A lista responde "qual é o cargo"; a ficha responde também "por que eu via `¿`
      // aqui antes". O texto cru é PROCEDÊNCIA (D2) e continua guardado — é o que torna o
      // mapeamento refazível, e o que explica ao usuário o que a etapa 6 mudou.
      const user = abrir();
      await escolherEdital(user);
      await user.click(
        await screen.findByRole("button", { name: "Ver ficha de AGATHA LAMIM DE SOUZA" }),
      );

      const ficha = await screen.findByRole("dialog");
      expect(within(ficha).getByText("Cargo")).toBeInTheDocument();
      expect(within(ficha).getByText("DOCENTE I — HISTÓRIA")).toBeInTheDocument();
      expect(within(ficha).getByText("Cargo como veio na planilha")).toBeInTheDocument();
      expect(within(ficha).getByText("DOCENTE I ¿ HISTÓRIA")).toBeInTheDocument();
    });

    it("a ficha NÃO repete a linha da planilha quando o texto já é o nome canônico", async () => {
      // CONTROLE POSITIVO do par acima: em 8 dos 9 cargos reais os dois textos coincidem,
      // e uma linha repetindo o valor anterior seria ruído na maioria das fichas.
      cenario({
        candidatos: [
          {
            ...AGATHA,
            cargo: CARGO_DOCENTE_II.nome,
            cargo_id: CARGO_DOCENTE_II.id,
            cargos: { id: CARGO_DOCENTE_II.id, nome: CARGO_DOCENTE_II.nome },
          },
        ],
      });
      const user = abrir();
      await escolherEdital(user);
      await user.click(
        await screen.findByRole("button", { name: "Ver ficha de AGATHA LAMIM DE SOUZA" }),
      );

      const ficha = await screen.findByRole("dialog");
      expect(within(ficha).getByText("DOCENTE II")).toBeInTheDocument();
      expect(within(ficha).queryByText("Cargo como veio na planilha")).not.toBeInTheDocument();
    });
  });

  describe("busca", () => {
    beforeEach(() => cenario({ total: 7416 }));

    it("filtra pelo termo digitado", async () => {
      // Espera POSITIVA pelo efeito (armadilha 6): o campo tem 350ms de folga antes de
      // consultar, e afirmar isso por timeout mediria carga da máquina, não a regra.
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      await user.type(screen.getByPlaceholderText(/Buscar por nome/i), "SOUZA");

      await waitFor(() => {
        const consultas = buildersDaTabela("candidatos");
        const comFiltro = consultas.filter((b) => b.or.mock.calls.length > 0);
        expect(comFiltro.length).toBeGreaterThan(0);
        expect(comFiltro[comFiltro.length - 1].or).toHaveBeenCalledWith(
          expect.stringContaining("nome.ilike.%SOUZA%"),
        );
      });
    });

    it("avisa que a busca não achou ninguém, sem sugerir que o edital está vazio", async () => {
      // Os dois vazios são diferentes e a tela precisa distingui-los: "não achei" manda
      // corrigir o termo, "não importei" manda importar a planilha.
      cenario({ candidatos: [], total: 0 });
      const user = abrir();
      await escolherEdital(user);

      await user.type(screen.getByPlaceholderText(/Buscar por nome/i), "ZZZZ");

      expect(await screen.findByText("Nenhum inscrito encontrado")).toBeInTheDocument();
    });

    it("sem busca, o vazio manda importar a planilha", async () => {
      cenario({ candidatos: [], total: 0 });
      const user = abrir();
      await escolherEdital(user);

      expect(await screen.findByText("Nenhum inscrito neste edital")).toBeInTheDocument();
      expect(screen.getByText(/Importe a planilha de inscritos/i)).toBeInTheDocument();
    });
  });

  describe("⭐ filtro por cargo", () => {
    /** Abre o combobox do filtro e escolhe uma opção pelo nome. */
    async function filtrarPor(user: ReturnType<typeof userEvent.setup>, nome: string) {
      await user.click(screen.getByRole("combobox", { name: "Filtrar por cargo" }));
      await user.click(await screen.findByRole("option", { name: nome }));
    }

    it("recorta no SERVIDOR pelo cargo escolhido", async () => {
      // "Quantos inscritos de DOCENTE II?" é a primeira pergunta real da operação. O
      // recorte vai ao servidor porque é o que mantém o contador e a paginação honestos —
      // filtrar as 50 linhas da página no cliente responderia outra pergunta.
      cenario({ total: 7416 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      await filtrarPor(user, "DOCENTE II");

      await waitFor(() => {
        const comCargo = buildersDaTabela("candidatos").filter((b) =>
          b.eq.mock.calls.some(([coluna]) => coluna === "cargo_id"),
        );
        expect(comCargo.length).toBeGreaterThan(0);
        expect(comCargo[comCargo.length - 1].eq).toHaveBeenCalledWith(
          "cargo_id",
          CARGO_DOCENTE_II.id,
        );
      });
    });

    it("o combobox tem nome acessível e oferece o catálogo mais a saída 'todos'", async () => {
      // O `aria-label` é o único nome que este campo tem: placeholder não rotula campo, e
      // sem ele um leitor de tela anuncia só "combobox". Mesma lição dos 25 comboboxes do
      // passo 2 do assistente.
      cenario({ total: 7416 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      await user.click(screen.getByRole("combobox", { name: "Filtrar por cargo" }));

      expect(await screen.findByRole("option", { name: "Todos os cargos" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "DOCENTE I — HISTÓRIA" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "DOCENTE II" })).toBeInTheDocument();
    });

    it("com o filtro ligado o contador diz X de Y, e não um número solto", async () => {
      // 481 sozinho, ao lado de um card que diz 7416, se parece com inscrito perdido na
      // importação. O "de 7416" é o que distingue recorte de perda.
      cenario({ total: 481 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");
      expect(screen.getByText("481 inscrito(s)")).toBeInTheDocument();

      await filtrarPor(user, "DOCENTE II");

      expect(await screen.findByText("481 de 7416 inscrito(s)")).toBeInTheDocument();
    });

    it("⭐ o vazio filtrado NOMEIA o cargo em vez de dizer que o edital está vazio", async () => {
      // O erro que este teste impede: "Nenhum inscrito neste edital" com um filtro ligado
      // faz o usuário concluir que a importação falhou e reimportar 7.416 linhas à toa.
      cenario({ candidatos: [], total: 0 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("Nenhum inscrito neste edital");

      await filtrarPor(user, "DOCENTE II");

      expect(await screen.findByText(/está no cargo "DOCENTE II"/i)).toBeInTheDocument();
      expect(screen.queryByText("Nenhum inscrito neste edital")).not.toBeInTheDocument();
      expect(screen.queryByText(/Importe a planilha de inscritos/i)).not.toBeInTheDocument();
    });

    it("'Todos os cargos' solta o recorte", async () => {
      // CONTROLE POSITIVO: sem esta saída o filtro seria uma armadilha de mão única.
      cenario({ total: 7416 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");
      await filtrarPor(user, "DOCENTE II");
      await screen.findByText("7416 de 7416 inscrito(s)");

      await filtrarPor(user, "Todos os cargos");

      expect(await screen.findByText("7416 inscrito(s)")).toBeInTheDocument();
      await waitFor(() => {
        const ultimo = buildersDaTabela("candidatos").at(-1);
        expect(ultimo?.eq.mock.calls.some(([coluna]) => coluna === "cargo_id")).toBe(false);
      });
    });

    it("trocar de edital solta o filtro herdado", async () => {
      // O catálogo é global (D1): o cargo filtrado pode não existir no edital novo, e uma
      // lista vazia por filtro herdado se parece com importação que falhou.
      const OUTRO = { ...EDITAL, id: "edital-2", nome: "Edital 002/2026 SME" };
      cenario({ editais: [EDITAL, OUTRO], total: 7416 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");
      await filtrarPor(user, "DOCENTE II");
      await screen.findByText("7416 de 7416 inscrito(s)");

      await escolherEdital(user, OUTRO.nome);

      expect(await screen.findByText("7416 inscrito(s)")).toBeInTheDocument();
      await waitFor(() => {
        const ultimo = buildersDaTabela("candidatos").at(-1);
        expect(ultimo?.eq).toHaveBeenCalledWith("edital_id", OUTRO.id);
        expect(ultimo?.eq.mock.calls.some(([coluna]) => coluna === "cargo_id")).toBe(false);
      });
    });
  });

  describe("paginação", () => {
    it("não deixa voltar da primeira página, mas deixa avançar", async () => {
      cenario({ total: 7416 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      expect(screen.getByRole("button", { name: /Anterior/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Próxima/i })).toBeEnabled();
      expect(screen.getByText(/Página 1 de 149/)).toBeInTheDocument();
    });

    it("avançar pede a fatia seguinte ao servidor", async () => {
      cenario({ total: 7416 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      await user.click(screen.getByRole("button", { name: /Próxima/i }));

      await waitFor(() => {
        const ultimo = buildersDaTabela("candidatos").at(-1);
        expect(ultimo?.range).toHaveBeenCalledWith(50, 99);
      });
    });

    it("não oferece avanço quando tudo cabe numa página", async () => {
      cenario({ total: 1 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      expect(screen.getByRole("button", { name: /Próxima/i })).toBeDisabled();
    });
  });

  describe("⭐ as duas exclusões são diferentes de propósito", () => {
    beforeEach(() => cenario({ total: 7416 }));

    it("excluir UM inscrito confirma sem pedir senha", async () => {
      // A ação atinge uma linha e é reversível — basta reimportar. Pedir senha aqui
      // ensinaria a digitá-la no automático, e aí a barreira do caso grave (abaixo)
      // deixaria de valer na prática.
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      await user.click(screen.getByRole("button", { name: "Excluir AGATHA LAMIM DE SOUZA" }));

      const confirmacao = await screen.findByRole("alertdialog");
      expect(within(confirmacao).getByText("Excluir candidato")).toBeInTheDocument();
      expect(
        within(confirmacao).queryByLabelText(/Digite sua senha/i),
      ).not.toBeInTheDocument();
    });

    it("limpar o edital inteiro EXIGE a senha", async () => {
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      await user.click(screen.getByRole("button", { name: /Limpar edital/i }));

      const confirmacao = await screen.findByRole("alertdialog");
      expect(within(confirmacao).getByLabelText(/Digite sua senha/i)).toBeInTheDocument();
      // E a confirmação diz o tamanho do estrago, com o número real.
      expect(within(confirmacao).getByText(/7416 inscritos/)).toBeInTheDocument();
    });

    it("não oferece 'limpar edital' quando não há o que limpar", async () => {
      // Edital vazio de verdade: a contagem da RPC também é zero. É ela que decide se o
      // botão aparece — não o count filtrado, que some com uma busca qualquer.
      cenario({ candidatos: [], total: 0, contagem: [] });
      const user = abrir();
      await escolherEdital(user);

      await screen.findByText("Nenhum inscrito neste edital");
      expect(screen.queryByRole("button", { name: /Limpar edital/i })).not.toBeInTheDocument();
    });

    it("⭐ REGRESSÃO: a confirmação anuncia o total do EDITAL, não o da lista filtrada", async () => {
      // O defeito: "limpar edital" apaga o edital inteiro (`delete().eq('edital_id', …)`),
      // mas a confirmação anunciava `total`, que é o count da consulta FILTRADA. Com uma
      // busca ligada ela prometia remover 12 inscritos e removia 7.416 — a barreira de
      // senha existe justamente para esta ação, e ela estava informando o tamanho errado
      // do estrago. Já era defeito com a busca; o filtro por cargo só o tornaria fácil de
      // encontrar. Agora o número vem da RPC de contagem, que ignora os filtros.
      cenario({ total: 12 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");

      await user.click(screen.getByRole("button", { name: /Limpar edital/i }));

      const confirmacao = await screen.findByRole("alertdialog");
      expect(within(confirmacao).getByText(/TODOS os 7416 inscritos/)).toBeInTheDocument();
      expect(within(confirmacao).queryByText(/TODOS os 12 inscritos/)).not.toBeInTheDocument();
    });

    it("com filtro ligado, a confirmação avisa que apaga o que está escondido", async () => {
      cenario({ total: 481 });
      const user = abrir();
      await escolherEdital(user);
      await screen.findByText("AGATHA LAMIM DE SOUZA");
      await user.click(screen.getByRole("combobox", { name: "Filtrar por cargo" }));
      await user.click(await screen.findByRole("option", { name: "DOCENTE II" }));
      await screen.findByText("481 de 7416 inscrito(s)");

      await user.click(screen.getByRole("button", { name: /Limpar edital/i }));

      const confirmacao = await screen.findByRole("alertdialog");
      expect(
        within(confirmacao).getByText(/inclusive os que os filtros atuais escondem/i),
      ).toBeInTheDocument();
    });
  });

  it("leva ao assistente de importação", async () => {
    cenario();
    const user = abrir();

    await user.click(await screen.findByRole("button", { name: /Importar Planilha/i }));

    expect(navigateMock).toHaveBeenCalledWith("/candidatos/importar");
  });
});
