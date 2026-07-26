import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders, createTestQueryClient } from "@/test/utils";
import { resetSupabaseMock, setFunctionResult, supabaseMock } from "@/test/supabase-mock";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import CorrigirEmailAcessoDialog from "@/components/CorrigirEmailAcessoDialog";

/**
 * Testes de interação do CorrigirEmailAcessoDialog — o único lugar do app que mexe na
 * **âncora de identidade** do colaborador. `colab_email` é o que liga a linha de
 * `colaboradores` à conta do Auth; corrigi-lo RENOMEIA a conta, não a apaga.
 *
 * O diálogo é uma máquina de três estados, e quem decide o estado é a Edge Function — o
 * front **nunca lê o Auth**. Por isso o mock aqui é do `functions.invoke`, não de hook:
 *
 *   A — não existe conta de acesso  → nada a corrigir, edite no cadastro
 *   B — conta pendente, nunca usada → **é o único caso corrigível**
 *   C — conta confirmada, em uso    → recusa: trocar seria trocar o login de alguém
 *
 * A recusa do estado C é o que mais importa não regredir. Ela é decidida no servidor (a
 * EF responde 409 mesmo se alguém forçar a chamada); o que se testa aqui é que a UI não
 * oferece o caminho.
 */
const COLABORADOR_ID = "colab-1";

describe("CorrigirEmailAcessoDialog (interação)", () => {
  let onOpenChange: ReturnType<typeof vi.fn>;
  let queryClient: QueryClient;

  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    onOpenChange = vi.fn();
    queryClient = createTestQueryClient();
  });

  /** O que a EF devolve no modo 'consultar'. */
  function consultaResponde(estado: "A" | "B" | "C", over: Record<string, unknown> = {}) {
    setFunctionResult("corrigir-email-acesso", {
      data: {
        estado,
        email_cadastro: "novo@exemplo.com",
        email_conta: "velho@exemplo.com",
        divergentes: true,
        ...over,
      },
      error: null,
    });
  }

  const abrir = () =>
    renderWithProviders(
      <CorrigirEmailAcessoDialog
        open
        onOpenChange={onOpenChange}
        colaboradorId={COLABORADOR_ID}
        colaboradorNome="Fulana de Souza"
      />,
      { queryClient },
    );

  const campoEmail = () => screen.getByLabelText("E-mail correto");
  const botaoCorrigir = () => screen.getByRole("button", { name: "Corrigir e reenviar" });

  /** Abre e espera a consulta resolver. */
  async function abrirEConsultar(estado: "A" | "B" | "C", over: Record<string, unknown> = {}) {
    consultaResponde(estado, over);
    abrir();
    await waitFor(() =>
      expect(screen.queryByText(/Consultando a conta de acesso/)).not.toBeInTheDocument(),
    );
  }

  describe("a consulta de abertura", () => {
    it("pergunta o estado à Edge Function, sem ler o Auth", async () => {
      await abrirEConsultar("B");

      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("corrigir-email-acesso", {
        body: { acao: "consultar", colaborador_id: COLABORADOR_ID },
      });
    });

    it("avisa que está consultando antes de decidir qualquer coisa", async () => {
      consultaResponde("B");
      abrir();

      // Enquanto não sabe o estado, não pode oferecer correção nem afirmar recusa.
      expect(screen.getByText(/Consultando a conta de acesso/)).toBeInTheDocument();
      expect(screen.queryByLabelText("E-mail correto")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText(/Consultando a conta de acesso/)).not.toBeInTheDocument(),
      );
    });

    it("falha na consulta não abre o formulário", async () => {
      setFunctionResult("corrigir-email-acesso", {
        data: { error: "Colaborador não encontrado." },
        error: null,
      });
      abrir();

      expect(await screen.findByText("Colaborador não encontrado.")).toBeInTheDocument();
      expect(screen.queryByLabelText("E-mail correto")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Corrigir e reenviar" })).not.toBeInTheDocument();
    });
  });

  describe("estado C — conta já confirmada: a recusa", () => {
    it("não oferece caminho nenhum para trocar o login de alguém", async () => {
      await abrirEConsultar("C");

      expect(screen.queryByLabelText("E-mail correto")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Corrigir e reenviar" })).not.toBeInTheDocument();
      // Sem ação possível, o botão de saída deixa de ser "Cancelar".
      expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    });

    it("diz com que e-mail a pessoa entra hoje, e de quem é a decisão", async () => {
      await abrirEConsultar("C");

      expect(screen.getByText("velho@exemplo.com")).toBeInTheDocument();
      expect(screen.getByText(/já foi confirmada/)).toBeInTheDocument();
      expect(screen.getByText(/pertence ao próprio colaborador/)).toBeInTheDocument();
    });
  });

  describe("estado A — sem conta de acesso", () => {
    it("manda editar no próprio cadastro, sem oferecer correção", async () => {
      await abrirEConsultar("A");

      expect(screen.getByText(/ainda não tem conta de acesso/)).toBeInTheDocument();
      expect(screen.queryByLabelText("E-mail correto")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    });
  });

  describe("estado B — conta pendente: o único caso corrigível", () => {
    it("mostra onde a conta foi criada e por que a pessoa não entra", async () => {
      await abrirEConsultar("B");

      expect(screen.getByText(/pendente, nunca usada/)).toBeInTheDocument();
      expect(screen.getByText("velho@exemplo.com")).toBeInTheDocument();
      expect(screen.getByText("novo@exemplo.com")).toBeInTheDocument();
      expect(screen.getByText(/é essa divergência que deixa a pessoa sem entrar/)).toBeInTheDocument();
    });

    it("pré-preenche com o e-mail do CADASTRO quando os dois divergem", async () => {
      // É o caso típico: alguém já corrigiu o cadastro e a conta ficou no endereço
      // velho. O cadastro é o palpite certo, e poupa digitar de novo.
      await abrirEConsultar("B");
      expect(campoEmail()).toHaveValue("novo@exemplo.com");
    });

    it("não adivinha quando não há divergência", async () => {
      // Sem divergência não existe palpite óbvio — quem abriu sabe o endereço certo.
      await abrirEConsultar("B", { divergentes: false, email_cadastro: "velho@exemplo.com" });

      expect(campoEmail()).toHaveValue("");
      expect(
        screen.queryByText(/é essa divergência que deixa a pessoa sem entrar/),
      ).not.toBeInTheDocument();
    });

    it("não deixa submeter e-mail vazio nem só de espaços", async () => {
      const user = userEvent.setup();
      await abrirEConsultar("B", { divergentes: false, email_cadastro: null });
      expect(botaoCorrigir()).toBeDisabled();

      await user.type(campoEmail(), "   ");
      expect(botaoCorrigir()).toBeDisabled();
    });

    it("manda a correção com o e-mail aparado", async () => {
      const user = userEvent.setup();
      await abrirEConsultar("B");
      await user.clear(campoEmail());
      await user.type(campoEmail(), "  certo@exemplo.com  ");
      setFunctionResult("corrigir-email-acesso", {
        data: { ok: true, email_mascarado: "c***o@exemplo.com" },
        error: null,
      });
      await user.click(botaoCorrigir());

      await waitFor(() =>
        expect(supabaseMock.functions.invoke).toHaveBeenLastCalledWith("corrigir-email-acesso", {
          body: {
            acao: "corrigir",
            colaborador_id: COLABORADOR_ID,
            novo_email: "certo@exemplo.com",
          },
        }),
      );
    });
  });

  describe("depois de corrigir", () => {
    async function corrigirCom(resposta: Record<string, unknown>) {
      const user = userEvent.setup();
      await abrirEConsultar("B");
      setFunctionResult("corrigir-email-acesso", { data: resposta, error: null });
      await user.click(botaoCorrigir());
      return user;
    }

    it("no sucesso avisa, atualiza a lista de colaboradores e fecha", async () => {
      const invalidar = vi.spyOn(queryClient, "invalidateQueries");
      await corrigirCom({ ok: true, email_mascarado: "n***o@exemplo.com" });

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ["colaboradores"] });
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "E-mail de acesso corrigido" }),
      );
    });

    it("quando o e-mail muda mas o link NÃO sai, avisa em tom de erro — e ainda fecha", async () => {
      // Distinção que importa: a conta já foi movida, então reabrir e tentar de novo não
      // desfaz nada. O aviso vem do servidor, que sabe o que falhou; o fechamento é
      // correto porque a correção em si aconteceu.
      await corrigirCom({ ok: false, aviso: "Conta movida, mas o e-mail do link falhou." });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "E-mail corrigido, mas o link não saiu",
            description: "Conta movida, mas o e-mail do link falhou.",
            variant: "destructive",
          }),
        ),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("erro na correção mantém o diálogo aberto, com o preenchimento", async () => {
      await corrigirCom({ error: "Este e-mail já pertence a outro cadastro." });

      expect(
        await screen.findByText("Este e-mail já pertence a outro cadastro."),
      ).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(campoEmail()).toHaveValue("novo@exemplo.com");
    });

    it("mostra a mensagem do servidor mesmo quando a EF responde não-2xx", async () => {
      // REGRESSÃO. A EF recusa com 409/400 e o motivo no corpo (as recusas de estado A e
      // C, "Informe o e-mail correto.", e-mail já em uso). Nesse caso o supabase-js
      // devolve `{ data: null, error: FunctionsHttpError }` com o corpo em
      // `error.context.body` como STRING.
      //
      // Até 2026-07-26 o diálogo fazia `setErro(data?.error || <genérica>)`, e como
      // `data` é null caía SEMPRE na genérica — o servidor explicava e o cliente jogava
      // fora. Agora passa pelo `mensagemDeErroDaFuncao`, que tem teste próprio.
      const user = userEvent.setup();
      await abrirEConsultar("B");
      setFunctionResult("corrigir-email-acesso", {
        data: null,
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: {
            body: JSON.stringify({
              error: "Esta conta já foi confirmada e está em uso.",
            }),
          },
        },
      });
      await user.click(botaoCorrigir());

      expect(
        await screen.findByText("Esta conta já foi confirmada e está em uso."),
      ).toBeInTheDocument();
      // A genérica não pode aparecer junto, nem no lugar.
      expect(
        screen.queryByText("Não foi possível corrigir o e-mail de acesso."),
      ).not.toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("também desembrulha o motivo na CONSULTA, não só na correção", async () => {
      // A consulta tem o mesmo padrão de erro e sofria do mesmo problema.
      setFunctionResult("corrigir-email-acesso", {
        data: null,
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: { body: JSON.stringify({ error: "Colaborador não encontrado." }) },
        },
      });
      abrir();

      expect(await screen.findByText("Colaborador não encontrado.")).toBeInTheDocument();
    });
  });

  it("explica que a conta segue pendente até a pessoa abrir o link", async () => {
    // É o que garante que a correção não vira porta de entrada: mover a conta não
    // autentica ninguém — quem abre o link prova que a caixa é dela.
    await abrirEConsultar("B");
    expect(screen.getByText(/continua pendente até a pessoa abrir o link/)).toBeInTheDocument();
  });
});
