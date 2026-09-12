import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { resetSupabaseMock, supabaseMock } from "@/test/supabase-mock";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

/**
 * O hook é mockado; o diálogo, não. Quem é ELEGÍVEL e por que está IMPEDIDO são
 * derivações do `useCoordenadoresProva`, com teste próprio. O que este arquivo cobre é
 * o que só existe no diálogo: o impedido aparecer desabilitado e com o motivo escrito,
 * a concessão mandar só o id da alocação, e o fluxo de remoção.
 *
 * ⚠️ Este arquivo mudou de assunto em 2026-09-12. Antes ele cobria o e-mail, a senha
 * gerada, a barreira do e-mail de admin e os dois formatos de erro da Edge Function
 * `create-coordenador` — que CRIAVA a conta do coordenador. A conta agora vem do
 * cadastro do colaborador, a EF foi removida, e a barreira do admin virou recusa da RPC
 * `conceder_coordenador` (onde não se contorna pelo PostgREST). Os casos não foram
 * "consertados": o comportamento que eles afirmavam deixou de ser o desejado.
 */
const hookMock = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock("@/hooks/useCoordenadoresProva", () => ({
  useCoordenadoresProva: () => hookMock.atual,
}));

import { CoordenadoresProvaDialog } from "@/components/CoordenadoresProvaDialog";

const PROVA_ID = "prova-1";

/** Um item de `colaboradoresDisponiveis` — alocação elegível ainda sem acesso. */
function elegivel(over: Record<string, unknown> = {}) {
  return {
    id: "cp-1",
    nome: "Fulana de Souza",
    funcao: "Coordenador Geral",
    impedimento: null as null | "sem-conta" | "sem-email",
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
  let conceder: ReturnType<typeof vi.fn>;
  let deleteCoordenador: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  function comHook(over: Record<string, unknown> = {}) {
    hookMock.atual = {
      coordenadores: [],
      colaboradoresDisponiveis: [elegivel()],
      isLoading: false,
      conceder,
      delete: deleteCoordenador,
      isConcedendo: false,
      isDeleting: false,
      ...over,
    };
  }

  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    conceder = vi.fn();
    deleteCoordenador = vi.fn();
    onOpenChange = vi.fn();
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

  const botaoConceder = () => screen.getByRole("button", { name: /Conceder Acesso/ });

  /** Escolhe o colaborador no Select do Radix. */
  async function escolherColaborador(user: ReturnType<typeof userEvent.setup>, nome: RegExp) {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: nome }));
  }

  describe("a concessão usa a conta que o colaborador JÁ tem", () => {
    it("não pede e-mail nem senha", () => {
      // REGRESSÃO do tema de 2026-09-12. Enquanto existiram, esses dois campos criavam
      // uma conta nova a cada concessão — com senha escolhida pelo admin e o e-mail
      // digitado à mão, que podia divergir do cadastro. Se voltarem, isto cai.
      abrir();

      expect(screen.queryByPlaceholderText("email@exemplo.com")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Senha de acesso")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Gerar" })).not.toBeInTheDocument();
      expect(screen.getByText(/nenhuma senha é criada aqui/i)).toBeInTheDocument();
    });

    it("concede mandando só o id da alocação", async () => {
      // Controle positivo do tema: o caminho legítimo tem de continuar funcionando.
      const user = userEvent.setup();
      abrir();
      await escolherColaborador(user, /Fulana de Souza/);
      await user.click(botaoConceder());

      expect(conceder).toHaveBeenCalledWith("cp-1");
      // Nenhuma Edge Function no caminho: a concessão é uma RPC, dentro do hook.
      expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
    });

    it("o botão fica travado enquanto ninguém foi escolhido", () => {
      abrir();
      expect(botaoConceder()).toBeDisabled();
    });

    it("mostra a função junto do nome, porque é ela que dá a elegibilidade", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("combobox"));

      expect(
        await screen.findByRole("option", { name: "Fulana de Souza (Coordenador Geral)" }),
      ).toBeInTheDocument();
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

  describe("quem está impedido APARECE, desabilitado e com o motivo", () => {
    /**
     * ⚠️ O ponto todo destes casos: sumir da lista seria perda silenciosa. O admin
     * procuraria o nome do coordenador, não o acharia, e nada na tela diria por quê —
     * o formato de defeito que este repo mais teme.
     */
    it("'sem conta' fica visível, desabilitado, e a tela diz o que fazer", async () => {
      comHook({
        colaboradoresDisponiveis: [elegivel({ nome: "Sem Conta", impedimento: "sem-conta" })],
      });
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("combobox"));

      const opcao = await screen.findByRole("option", { name: /Sem Conta/ });
      expect(opcao).toHaveTextContent("ainda sem acesso ao sistema");
      expect(opcao).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText(/Estou sem minha senha/)).toBeInTheDocument();
    });

    it("'sem e-mail' recebe instrução DIFERENTE, porque a providência é outra", async () => {
      // Para quem não tem e-mail no cadastro não adianta "peça que ele reivindique":
      // o acesso nasce pelo e-mail. Alguém tem de cadastrá-lo antes.
      comHook({
        colaboradoresDisponiveis: [elegivel({ nome: "Sem Email", impedimento: "sem-email" })],
      });
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("combobox"));

      const opcao = await screen.findByRole("option", { name: /Sem Email/ });
      expect(opcao).toHaveTextContent("sem e-mail no cadastro");
      expect(screen.getByText(/Cadastre o e-mail na ficha do colaborador/)).toBeInTheDocument();
    });

    it("não mostra instrução de impedimento quando ninguém está impedido", () => {
      abrir();
      expect(screen.queryByText(/Estou sem minha senha/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Cadastre o e-mail na ficha do colaborador/),
      ).not.toBeInTheDocument();
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
