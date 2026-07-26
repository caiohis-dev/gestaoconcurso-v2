import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// O diálogo chama `useQueryClient()` direto para invalidar as listas depois de conceder
// acesso, então precisa do QueryClientProvider mesmo com o hook de dados mockado.
import { renderWithProviders } from "@/test/utils";
import {
  resetSupabaseMock,
  setTableResult,
  setFunctionResult,
  supabaseMock,
} from "@/test/supabase-mock";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

/**
 * O hook é mockado; o diálogo, não. A lógica de quem é ELEGÍVEL (as duas funções de
 * coordenação, e excluir quem já tem acesso) vive no `useCoordenadoresProva` e tem teste
 * próprio — repeti-la aqui seria testar o mesmo contrato duas vezes e travar o hook por
 * fora. O que este arquivo cobre é o que só existe no diálogo: a barreira do e-mail de
 * admin, a montagem do body da Edge Function, o tratamento dos dois formatos de erro
 * dela, e o fluxo de remoção.
 */
const hookMock = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock("@/hooks/useCoordenadoresProva", () => ({
  useCoordenadoresProva: () => hookMock.atual,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin-1", email: "admin@fevre.test" } }),
}));

import { CoordenadoresProvaDialog } from "@/components/CoordenadoresProvaDialog";

const PROVA_ID = "prova-1";

/** Um item de `colaboradoresDisponiveis` — alocação elegível ainda sem acesso. */
function elegivel(over: Record<string, unknown> = {}) {
  return {
    id: "cp-1",
    colaborador_id: "colab-1",
    funcao_id: "11a310e5-0fce-46f2-8ad7-769a5e5d7f89",
    colaboradores: {
      id: "colab-1",
      colab_nome_completo: "Fulana de Souza",
      colab_cpf: "12345678901",
      colab_email: "fulana@exemplo.com",
    },
    funcoes_colaboradores: { id: "f-1", cargo_nome: "Coordenador Geral" },
    ...over,
  };
}

/** Um item de `coordenadores` — quem já tem acesso. */
function comAcesso(over: Record<string, unknown> = {}) {
  return {
    id: "coord-1",
    colaborador_prova_id: "cp-9",
    user_id: "user-9",
    prova_id: PROVA_ID,
    created_at: null,
    created_by: null,
    colaboradores_prova: {
      id: "cp-9",
      colaborador_id: "colab-9",
      funcao_id: "f-1",
      colaboradores: {
        id: "colab-9",
        colab_nome_completo: "Ciclana Pereira",
        colab_cpf: "98765432100",
        colab_email: "ciclana@exemplo.com",
      },
      funcoes_colaboradores: { id: "f-1", cargo_nome: "Auxiliar de Coordenação" },
    },
    ...over,
  };
}

describe("CoordenadoresProvaDialog (interação)", () => {
  let deleteCoordenador: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  function comHook(over: Record<string, unknown> = {}) {
    hookMock.atual = {
      coordenadores: [],
      colaboradoresDisponiveis: [elegivel()],
      isLoading: false,
      create: vi.fn(),
      delete: deleteCoordenador,
      isCreating: false,
      isDeleting: false,
      ...over,
    };
  }

  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    deleteCoordenador = vi.fn();
    onOpenChange = vi.fn();
    // Nenhum profile com esse e-mail: o caminho normal, em que a barreira não dispara.
    setTableResult("profiles", { data: null, error: null });
    setTableResult("user_roles", { data: null, error: null });
    setFunctionResult("create-coordenador", { data: { success: true }, error: null });
    comHook();
  });

  const abrir = () =>
    renderWithProviders(
      <CoordenadoresProvaDialog
        open
        onOpenChange={onOpenChange}
        provaId={PROVA_ID}
        provaEdital="  Edital 01/2026  "
      />,
    );

  const campoEmail = () => screen.getByPlaceholderText("email@exemplo.com");
  const campoSenha = () => screen.getByPlaceholderText("Senha de acesso");
  const botaoConceder = () => screen.getByRole("button", { name: /Conceder Acesso/ });

  /** Escolhe o colaborador no Select do Radix. */
  async function escolherColaborador(user: ReturnType<typeof userEvent.setup>, nome: RegExp) {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: nome }));
  }

  describe("o formulário só abre depois de escolher o colaborador", () => {
    it("mantém e-mail, senha e Gerar travados até a escolha", () => {
      abrir();
      expect(campoEmail()).toBeDisabled();
      expect(campoSenha()).toBeDisabled();
      expect(screen.getByRole("button", { name: "Gerar" })).toBeDisabled();
      expect(botaoConceder()).toBeDisabled();
    });

    it("escolher o colaborador preenche o e-mail do cadastro dele", async () => {
      // É o que evita digitar e-mail errado na mão: o acesso nasce amarrado ao e-mail
      // que já está no cadastro do colaborador.
      const user = userEvent.setup();
      abrir();
      await escolherColaborador(user, /Fulana de Souza/);

      expect(campoEmail()).toHaveValue("fulana@exemplo.com");
      expect(campoEmail()).toBeEnabled();
    });

    it("colaborador sem e-mail no cadastro deixa o campo vazio para digitar", async () => {
      comHook({
        colaboradoresDisponiveis: [
          elegivel({
            colaboradores: {
              id: "colab-1",
              colab_nome_completo: "Sem Email",
              colab_cpf: "11122233344",
              colab_email: null,
            },
          }),
        ],
      });
      const user = userEvent.setup();
      abrir();
      await escolherColaborador(user, /Sem Email/);

      expect(campoEmail()).toHaveValue("");
      expect(campoEmail()).toBeEnabled();
    });

    it("mostra a função junto do nome, porque é ela que dá a elegibilidade", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("combobox"));

      expect(
        await screen.findByRole("option", { name: "Fulana de Souza (Coordenador Geral)" }),
      ).toBeInTheDocument();
    });

    it("gera senha de 8 caracteres sem os ambíguos", async () => {
      // O alfabeto omite O/0/o, I/l/1 — senha ditada por telefone ou copiada à mão.
      const user = userEvent.setup();
      abrir();
      await escolherColaborador(user, /Fulana/);
      await user.click(screen.getByRole("button", { name: "Gerar" }));

      const gerada = (campoSenha() as HTMLInputElement).value;
      expect(gerada).toHaveLength(8);
      expect(gerada).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{8}$/);
    });

    it("sem colaborador elegível, explica o porquê e desabilita o Select", () => {
      comHook({ colaboradoresDisponiveis: [] });
      abrir();

      expect(screen.getByRole("combobox")).toBeDisabled();
      expect(
        screen.getByText(/Não há colaboradores com função de Coordenador Geral/),
      ).toBeInTheDocument();
    });

    it("enquanto carrega, não afirma que não há elegível", () => {
      // A frase "não há colaboradores" durante o carregamento seria mentira — e é o
      // padrão "vazio enquanto carrega" que já rendeu defeito neste repo.
      comHook({ colaboradoresDisponiveis: [], isLoading: true });
      abrir();

      expect(
        screen.queryByText(/Não há colaboradores com função de Coordenador Geral/),
      ).not.toBeInTheDocument();
    });
  });

  describe("a barreira do e-mail de administrador", () => {
    async function preencherEEnviar() {
      const user = userEvent.setup();
      abrir();
      await escolherColaborador(user, /Fulana/);
      await user.clear(campoEmail());
      await user.type(campoEmail(), "chefe@fevre.test");
      await user.type(campoSenha(), "Senha123");
      await user.click(botaoConceder());
      return user;
    }

    it("recusa e-mail que já é de admin, sem chamar a Edge Function", async () => {
      // Dar acesso de coordenador ao e-mail de um admin rebaixaria uma conta de gestão.
      setTableResult("profiles", { data: { id: "admin-9" }, error: null });
      setTableResult("user_roles", { data: { role: "admin" }, error: null });
      await preencherEEnviar();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Email já cadastrado como Administrador" }),
        ),
      );
      expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
    });

    it("⚠️ DEFEITO: a barreira NÃO pega superadmin", async () => {
      // A consulta é `.eq("role", "admin")` — match LITERAL, sem hierarquia. Um
      // superadmin não tem linha 'admin' em user_roles (o `isAdmin` do useAuth é que
      // deriva a hierarquia no cliente; o banco resolve em `has_role`). Resultado: o
      // e-mail de um superadmin passa reto pela barreira e a EF é chamada.
      //
      // É a mesma armadilha já documentada no módulo de Editais: papel checado por
      // igualdade em user_roles ignora que superadmin ⊇ admin. Item no backlog.
      setTableResult("profiles", { data: { id: "super-9" }, error: null });
      // Filtrando por role=admin, um superadmin não retorna nada:
      setTableResult("user_roles", { data: null, error: null });
      await preencherEEnviar();

      await waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenCalled());
      expect(toastMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "Email já cadastrado como Administrador" }),
      );
    });

    it("e-mail de conta que existe mas não é admin segue em frente", async () => {
      setTableResult("profiles", { data: { id: "user-9" }, error: null });
      setTableResult("user_roles", { data: null, error: null });
      await preencherEEnviar();

      await waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenCalled());
    });
  });

  describe("a chamada da Edge Function", () => {
    async function conceder() {
      const user = userEvent.setup();
      abrir();
      await escolherColaborador(user, /Fulana/);
      await user.type(campoSenha(), "Senha123");
      await user.click(botaoConceder());
      return user;
    }

    it("manda o body completo para create-coordenador", async () => {
      await conceder();

      await waitFor(() =>
        expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("create-coordenador", {
          body: {
            email: "fulana@exemplo.com",
            password: "Senha123",
            fullName: "Fulana de Souza",
            colaboradorProvaId: "cp-1",
            provaId: PROVA_ID,
            colaboradorId: "colab-1",
          },
        }),
      );
    });

    it("no sucesso, avisa e limpa o formulário", async () => {
      await conceder();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Coordenador cadastrado" }),
        ),
      );
      // Limpar importa: sem isso, um segundo clique repetiria a concessão.
      await waitFor(() => expect(campoSenha()).toHaveValue(""));
      expect(campoEmail()).toHaveValue("");
      expect(campoEmail()).toBeDisabled();
    });

    it("entrega as credenciais no aviso, porque é o único momento em que a senha existe", async () => {
      // A senha não é recuperável depois — o admin tem de repassá-la. Se este texto
      // sumir, o coordenador fica sem como entrar.
      await conceder();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            description: expect.stringContaining("fulana@exemplo.com"),
          }),
        ),
      );
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining("Senha123") }),
      );
    });

    it("erro dentro do corpo da resposta vira aviso, e o formulário NÃO é limpo", async () => {
      setFunctionResult("create-coordenador", {
        data: { error: "Este e-mail já tem conta" },
        error: null,
      });
      await conceder();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erro ao criar acesso",
            description: "Este e-mail já tem conta",
          }),
        ),
      );
      // Preservar o preenchimento é o que permite corrigir e tentar de novo.
      expect(campoSenha()).toHaveValue("Senha123");
    });

    it("extrai a mensagem de dentro do context.body do FunctionsHttpError", async () => {
      // O supabase-js embrulha o corpo do erro HTTP em `context.body` como STRING. Sem
      // desembrulhar, o usuário veria "Edge Function returned a non-2xx status code".
      setFunctionResult("create-coordenador", {
        data: null,
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: { body: JSON.stringify({ error: "CPF já vinculado a outra conta" }) },
        },
      });
      await conceder();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "CPF já vinculado a outra conta" }),
        ),
      );
    });

    it("cai na mensagem do erro quando não há context.body", async () => {
      setFunctionResult("create-coordenador", {
        data: null,
        error: { message: "Failed to fetch" },
      });
      await conceder();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "Failed to fetch" }),
        ),
      );
    });
  });

  describe("a lista de quem já tem acesso", () => {
    it("mostra nome, CPF formatado e função", () => {
      comHook({ coordenadores: [comAcesso()] });
      abrir();

      expect(screen.getByText("Ciclana Pereira")).toBeInTheDocument();
      expect(screen.getByText("987.654.321-00")).toBeInTheDocument();
      expect(screen.getByText("Auxiliar de Coordenação")).toBeInTheDocument();
    });

    it("completa com zeros à esquerda o CPF que veio curto do banco", () => {
      // `colab_cpf` é texto e há CPFs salvos sem o zero inicial; sem o padStart a
      // formatação embaralharia os grupos.
      comHook({
        coordenadores: [
          comAcesso({
            colaboradores_prova: {
              ...comAcesso().colaboradores_prova,
              colaboradores: {
                id: "colab-9",
                colab_nome_completo: "Zero à Esquerda",
                colab_cpf: "1234567890",
                colab_email: null,
              },
            },
          }),
        ],
      });
      abrir();

      expect(screen.getByText("012.345.678-90")).toBeInTheDocument();
    });

    it("diz que não há ninguém quando a lista está vazia", () => {
      abrir();
      expect(
        screen.getByText("Nenhum coordenador com acesso para esta prova."),
      ).toBeInTheDocument();
    });
  });

  describe("remoção de acesso", () => {
    async function abrirConfirmacao(user: ReturnType<typeof userEvent.setup>) {
      comHook({ coordenadores: [comAcesso()] });
      abrir();
      const linha = screen.getByText("Ciclana Pereira").closest("tr")!;
      await user.click(within(linha).getByRole("button"));
      return screen.getByRole("alertdialog");
    }

    it("pede confirmação antes de remover", async () => {
      const user = userEvent.setup();
      const confirmacao = await abrirConfirmacao(user);

      expect(within(confirmacao).getByText("Remover acesso")).toBeInTheDocument();
      // O texto tem de deixar claro que o COLABORADOR não é excluído — só o acesso.
      expect(
        within(confirmacao).getByText(/O colaborador não será excluído/),
      ).toBeInTheDocument();
      expect(deleteCoordenador).not.toHaveBeenCalled();
    });

    it("confirmar remove pelo id do vínculo de coordenação", async () => {
      const user = userEvent.setup();
      const confirmacao = await abrirConfirmacao(user);
      await user.click(within(confirmacao).getByRole("button", { name: "Remover Acesso" }));

      expect(deleteCoordenador).toHaveBeenCalledWith("coord-1");
    });

    it("cancelar não remove nada", async () => {
      const user = userEvent.setup();
      const confirmacao = await abrirConfirmacao(user);
      await user.click(within(confirmacao).getByRole("button", { name: "Cancelar" }));

      expect(deleteCoordenador).not.toHaveBeenCalled();
    });
  });

  it("identifica a prova no cabeçalho, sem os espaços do edital", () => {
    // `provaEdital` vem do banco com espaços em volta em vários registros.
    abrir();
    expect(screen.getByText("Prova: Edital 01/2026")).toBeInTheDocument();
  });
});
