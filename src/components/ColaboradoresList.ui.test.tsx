/**
 * Bateria da listagem de Colaboradores.
 *
 * 🔴 O que esta bateria guarda é uma AUSÊNCIA: a tela não pode consultar nada ao abrir.
 *
 * Até 2026-09-10 ela baixava `select('*')` de todos os colaboradores a cada montagem — e
 * de novo a cada volta de foco da janela, porque o `QueryClient` do `App.tsx` nasce sem
 * `staleTime`. Medido contra o banco local (771 linhas): **707 kB**, 33 colunas cada,
 * com CPF, PIS, agência, conta e chave PIX de todo mundo, para exibir 7 campos. Hoje uma
 * página de 50 custa 13 kB, e só depois de o usuário pedir.
 *
 * ⚠️ Ausência é o tipo de garantia que um teste verde perde sem avisar: se alguém puser
 * de volta um `useColaboradores({ fetchAll: true })` aqui, nada quebra visualmente. Por
 * isso o primeiro caso afirma que `colaboradores` NÃO é consultado, e o controle positivo
 * logo abaixo prova que a busca continua funcionando — um sem o outro não vale.
 *
 * Ver as armadilhas em `my_rules/estrutura/transversais/testes.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  supabaseMock,
  setTableResult,
  resetSupabaseMock,
  buildersDaTabela,
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
}));

import ColaboradoresList from "./ColaboradoresList";

const MARIA = {
  id: "colab-1",
  colab_matricula: "0001",
  colab_nome_completo: "Maria da Silva",
  colab_cpf: "12345678901",
  colab_telefone: 11987654321,
  colab_chave_pix: "maria@fevre.test",
  colab_ultimo_acesso: null,
};

/** As tabelas que o componente pediu ao Supabase, na ordem. */
const tabelasConsultadas = (): string[] =>
  supabaseMock.from.mock.calls.map((chamada) => chamada[0] as string);

const buscar = async (user: ReturnType<typeof userEvent.setup>, termo: string) => {
  await user.type(screen.getByLabelText(/buscar por nome/i), termo);
  await user.click(screen.getByRole("button", { name: /^buscar$/i }));
};

describe("ColaboradoresList", () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it("🔴 NÃO consulta `colaboradores` ao abrir a tela", async () => {
    renderWithProviders(<ColaboradoresList />);

    expect(await screen.findByText(/clique em Buscar/i)).toBeInTheDocument();
    expect(tabelasConsultadas()).not.toContain("colaboradores");
  });

  it("ao abrir, a única consulta é o catálogo de bancos — e é do diálogo", async () => {
    // Afirmado de propósito em vez de ignorado: `ColaboradorDialog` fica SEMPRE montado
    // (o `open` decide só a visibilidade), e ele chama `useBancos`, que não tem portão.
    // É anterior à busca sob demanda, é catálogo pequeno e tem `staleTime` de 1h — mas se
    // um dia esta lista crescer, o lugar de consertar é o `useBancos`, não aqui.
    renderWithProviders(<ColaboradoresList />);

    await screen.findByText(/clique em Buscar/i);
    expect(tabelasConsultadas()).toEqual(["bancos"]);
  });

  it("🔴 o botão Buscar não dispara consulta com critério vazio", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ColaboradoresList />);

    const botao = screen.getByRole("button", { name: /^buscar$/i });
    expect(botao).toBeDisabled();

    // Espaços não são critério. A barreira real é o `enabled` do hook — o disabled do
    // botão é conveniência, e conveniência se contorna.
    await user.type(screen.getByLabelText(/buscar por nome/i), "   ");
    expect(botao).toBeDisabled();
    expect(tabelasConsultadas()).not.toContain("colaboradores");
  });

  it("⭐ CONTROLE POSITIVO: com critério, busca e mostra o resultado", async () => {
    setTableResult("colaboradores", { data: [MARIA], error: null, count: 1 });
    const user = userEvent.setup();
    renderWithProviders(<ColaboradoresList />);

    await buscar(user, "maria");

    expect(await screen.findByText("Maria da Silva")).toBeInTheDocument();
    expect(supabaseMock.from).toHaveBeenCalledWith("colaboradores");
  });

  it("distingue 'ainda não busquei' de 'busquei e não achei'", async () => {
    // São estados diferentes com providências diferentes, e confundi-los é o padrão
    // "vazio enquanto carrega" que já se repetiu neste repo.
    setTableResult("colaboradores", { data: [], error: null, count: 0 });
    const user = userEvent.setup();
    renderWithProviders(<ColaboradoresList />);

    expect(screen.getByText(/clique em Buscar/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhum colaborador encontrado/i)).not.toBeInTheDocument();

    await buscar(user, "zzzz");

    expect(await screen.findByText(/nenhum colaborador encontrado/i)).toBeInTheDocument();
    expect(screen.queryByText(/clique em Buscar/i)).not.toBeInTheDocument();
  });

  it("o total exibido vem do `count` do servidor, não do tamanho da página", async () => {
    // Com 320 resultados e 50 por página, dizer "50 colaborador(es)" seria a tela
    // mentindo sobre o tamanho do conjunto.
    setTableResult("colaboradores", { data: [MARIA], error: null, count: 320 });
    const user = userEvent.setup();
    renderWithProviders(<ColaboradoresList />);

    await buscar(user, "maria");

    // `findAllByText`: o número aparece no distintivo E na linha de paginação, e as duas
    // ocorrências são legítimas — `getByText` falharia por ambiguidade, não por defeito.
    expect(await screen.findAllByText(/320 colaborador\(es\)/)).not.toHaveLength(0);
  });

  it("não pagina quando cabe numa página só", async () => {
    setTableResult("colaboradores", { data: [MARIA], error: null, count: 1 });
    const user = userEvent.setup();
    renderWithProviders(<ColaboradoresList />);

    await buscar(user, "maria");
    await screen.findByText("Maria da Silva");

    expect(screen.queryByRole("button", { name: /próxima/i })).not.toBeInTheDocument();
  });

  it("a ordenação vai ao SERVIDOR e volta para a primeira página", async () => {
    setTableResult("colaboradores", { data: [MARIA], error: null, count: 320 });
    const user = userEvent.setup();
    renderWithProviders(<ColaboradoresList />);

    await buscar(user, "maria");
    await screen.findByText("Maria da Silva");

    await user.click(screen.getByRole("button", { name: /próxima/i }));
    await waitFor(() =>
      expect(screen.getByText(/Página 2 de/)).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Último Acesso"));

    // Reordenar com a lista na página 2 deixaria o usuário no meio de um conjunto que
    // acabou de mudar de ordem — a linha que ele procurava está noutro lugar agora.
    await waitFor(() => expect(screen.getByText(/Página 1 de/)).toBeInTheDocument());

    const builders = buildersDaTabela("colaboradores");
    const pediuOrdemNoServidor = builders.some((b) =>
      (b.order as ReturnType<typeof vi.fn>).mock.calls.some(
        ([coluna]) => coluna === "colab_ultimo_acesso",
      ),
    );
    expect(pediuOrdemNoServidor).toBe(true);
  });
});
