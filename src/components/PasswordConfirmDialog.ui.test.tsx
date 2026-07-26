import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { resetSupabaseMock, supabaseMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

/**
 * Testes de interação do PasswordConfirmDialog — a **barreira de confirmação de ação
 * destrutiva**. Sete usos hoje, em cinco páginas: excluir edital, excluir prova,
 * finalizar/reabrir prova e unidade, encerrar ocorrências.
 *
 * Por que ele merece atenção especial: é o único diálogo em que uma regressão silenciosa
 * **destrói dado**. Se a verificação de senha deixar passar, ou se `onConfirm` rodar
 * antes dela, o clique errado apaga uma prova — e nada no resto da suíte acusaria.
 *
 * O contrato que estes testes fixam, em uma frase: **`onConfirm` só roda depois de a
 * senha ser aceita pelo servidor**, e um erro em qualquer etapa NÃO fecha o diálogo.
 */
describe("PasswordConfirmDialog (interação)", () => {
  const EMAIL_DA_SESSAO = "teste@fevre.test";

  let onConfirm: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetSupabaseMock();
    onConfirm = vi.fn().mockResolvedValue(undefined);
    onOpenChange = vi.fn();
    // O default do mock: sessão com e-mail e senha aceita. Cada teste que precisa do
    // contrário sobrescreve — deixar explícito aqui evita depender da ordem dos arquivos.
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-teste-1", email: EMAIL_DA_SESSAO } },
      error: null,
    });
    supabaseMock.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
  });

  const abrir = (props: Partial<Parameters<typeof PasswordConfirmDialog>[0]> = {}) =>
    render(
      <PasswordConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Excluir prova"
        description="Esta ação não pode ser desfeita."
        onConfirm={onConfirm}
        {...props}
      />,
    );

  const campoSenha = () => screen.getByLabelText("Digite sua senha para confirmar");
  const botaoConfirmar = (nome = "Confirmar") => screen.getByRole("button", { name: nome });

  describe("a barreira", () => {
    it("não chama onConfirm nem o servidor com senha vazia", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(botaoConfirmar());

      expect(await screen.findByText("Digite sua senha")).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();
      // Nem chega a bater no servidor: a recusa é local, não custa requisição.
      expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it("trata senha só de espaços como vazia", async () => {
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "   ");
      await user.click(botaoConfirmar());

      expect(await screen.findByText("Digite sua senha")).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("com senha incorreta não chama onConfirm e MANTÉM o diálogo aberto", async () => {
      // O teste mais importante do arquivo. Se isto quebrar, senha errada apaga dado.
      supabaseMock.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      });
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-errada");
      await user.click(botaoConfirmar());

      expect(await screen.findByText("Senha incorreta")).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();
      // Não fechar importa: fechar sem executar pareceria sucesso.
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("sem e-mail na sessão, recusa antes de tentar autenticar", async () => {
      supabaseMock.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "qualquer");
      await user.click(botaoConfirmar());

      expect(await screen.findByText("Usuário não autenticado")).toBeInTheDocument();
      expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("com senha correta chama onConfirm uma vez e fecha", async () => {
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-certa");
      await user.click(botaoConfirmar());

      await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("verifica contra o e-mail da SESSÃO, não contra algo digitado", async () => {
      // Não há campo de e-mail no diálogo, e não deve haver: a confirmação é "prove que
      // é você", não "entre como alguém".
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-certa");
      await user.click(botaoConfirmar());

      await waitFor(() =>
        expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
          email: EMAIL_DA_SESSAO,
          password: "senha-certa",
        }),
      );
    });
  });

  describe("quando a própria ação falha", () => {
    it("mostra a mensagem do erro e NÃO fecha", async () => {
      // Distinção que custa dado: senha aceita não significa ação concluída. Se o
      // diálogo fechasse aqui, o usuário acharia que a prova foi excluída.
      onConfirm.mockRejectedValue(new Error("Prova tem unidades vinculadas"));
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-certa");
      await user.click(botaoConfirmar());

      expect(await screen.findByText("Prova tem unidades vinculadas")).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("tem mensagem de reserva para erro que não é Error", async () => {
      onConfirm.mockRejectedValue("string solta");
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-certa");
      await user.click(botaoConfirmar());

      expect(await screen.findByText("Ocorreu um erro inesperado")).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("libera o botão depois da falha, para permitir nova tentativa", async () => {
      onConfirm.mockRejectedValue(new Error("falhou"));
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-certa");
      await user.click(botaoConfirmar());

      await screen.findByText("falhou");
      expect(botaoConfirmar()).toBeEnabled();
    });
  });

  describe("interação", () => {
    it("Enter no campo confirma", async () => {
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-certa{Enter}");

      await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    it("Cancelar fecha sem executar nada", async () => {
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-certa");
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it("durante a verificação, desabilita os dois botões e avisa", async () => {
      // Sem isso, dois cliques rápidos executam a ação destrutiva duas vezes.
      let liberar: () => void = () => {};
      supabaseMock.auth.signInWithPassword.mockReturnValue(
        new Promise((resolve) => {
          liberar = () => resolve({ data: { user: null, session: null }, error: null });
        }),
      );
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "senha-certa");
      await user.click(botaoConfirmar());

      expect(await screen.findByRole("button", { name: /Verificando/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

      liberar();
      await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    const recusarSenha = () =>
      supabaseMock.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      });

    it("Cancelar limpa a senha e o erro da tentativa anterior", async () => {
      // O diálogo não pode guardar rastro da tentativa recusada: reabrir com "Senha
      // incorreta" na tela acusaria um erro que não aconteceu.
      recusarSenha();
      const user = userEvent.setup();
      abrir();
      await user.type(campoSenha(), "errada");
      await user.click(botaoConfirmar());
      await screen.findByText("Senha incorreta");

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(screen.queryByText("Senha incorreta")).not.toBeInTheDocument();
      expect(campoSenha()).toHaveValue("");
    });

    it("⚠️ ATENÇÃO: fechar pelo prop `open` NÃO limpa o estado", async () => {
      // Não é defeito hoje, e é por um detalhe: `handleClose` é quem zera senha e erro, e
      // ele roda no Cancelar e no Esc (o Radix chama `onOpenChange`) — os dois caminhos
      // que o usuário tem. Nenhuma das 5 páginas fecha o diálogo por conta própria
      // depois de uma falha, então o estado velho nunca chega à tela.
      //
      // Existe para quem for mexer aqui: se alguma página passar a fechar via prop (num
      // efeito, num "cancelar tudo"), ela vai reabrir mostrando "Senha incorreta" de uma
      // tentativa antiga. A saída seria zerar o estado quando `open` vira true.
      recusarSenha();
      const user = userEvent.setup();
      const props = {
        onOpenChange,
        title: "Excluir prova",
        description: "Esta ação não pode ser desfeita.",
        onConfirm,
      };
      const { rerender } = render(<PasswordConfirmDialog open {...props} />);
      await user.type(campoSenha(), "errada");
      await user.click(botaoConfirmar());
      await screen.findByText("Senha incorreta");

      rerender(<PasswordConfirmDialog open={false} {...props} />);
      rerender(<PasswordConfirmDialog open {...props} />);

      // O que se gostaria: campo vazio e sem erro. O que acontece:
      expect(screen.getByText("Senha incorreta")).toBeInTheDocument();
      expect(campoSenha()).toHaveValue("errada");
    });
  });

  describe("o que a página manda", () => {
    it("mostra título, descrição e o texto de confirmação escolhido", async () => {
      abrir({ confirmText: "Excluir definitivamente", confirmVariant: "destructive" });

      expect(screen.getByRole("heading", { name: /Excluir prova/ })).toBeInTheDocument();
      expect(screen.getByText("Esta ação não pode ser desfeita.")).toBeInTheDocument();
      expect(botaoConfirmar("Excluir definitivamente")).toBeInTheDocument();
    });

    it("aceita descrição em JSX, não só texto", async () => {
      // Várias páginas passam ReactNode (listas do que será apagado). Se a prop virasse
      // string, elas perderiam o detalhamento silenciosamente.
      abrir({
        description: (
          <ul>
            <li>3 unidades</li>
            <li>12 alocações</li>
          </ul>
        ),
      });

      expect(screen.getByText("3 unidades")).toBeInTheDocument();
      expect(screen.getByText("12 alocações")).toBeInTheDocument();
    });
  });
});
