import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { resetSupabaseMock, setFunctionResult, supabaseMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import ResetarSenhaDialog from "@/components/ResetarSenhaDialog";

/**
 * Testes de interação do ResetarSenhaDialog ("Resetar senha" do superadmin, 2026-11-25).
 *
 * Toda a regra — quem pode, quem não pode ser alvo, a senha, a trilha — vive na EF
 * `resetar-senha-colaborador`, que tem teste de integração próprio (Deno, `npm run
 * test:ef`). Este arquivo guarda só o que existe na tela:
 *
 *   - nada é chamado antes da confirmação (resetar é destrutivo: a senha velha morre);
 *   - o corpo da requisição leva SÓ o `colaborador_id` — o alvo é derivado no servidor;
 *   - a recusa da EF (409, motivo no corpo) chega ao usuário, não a genérica;
 *   - a senha e o login aparecem, e o clique fora não fecha (ela só aparece uma vez).
 */
const COLAB = "colab-1";

describe("ResetarSenhaDialog (interação)", () => {
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetSupabaseMock();
    onOpenChange = vi.fn();
  });

  const abrir = () =>
    renderWithProviders(
      <ResetarSenhaDialog
        open
        onOpenChange={onOpenChange}
        colaboradorId={COLAB}
        colaboradorNome="FULANA DE SOUZA"
      />,
    );

  const confirmar = () => screen.getByRole("button", { name: "Resetar senha" });

  it("abre na confirmação, sem chamar a Edge Function", () => {
    abrir();
    expect(screen.getByText(/senha atual deixa de valer/)).toBeInTheDocument();
    expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
  });

  it("⭐ confirmar chama a EF só com o colaborador_id e mostra login e senha", async () => {
    setFunctionResult("resetar-senha-colaborador", {
      data: { success: true, senha: "Ab3dEf7hJk9m", email: "fulana@exemplo.com", nome: "FULANA DE SOUZA" },
      error: null,
    });
    const user = userEvent.setup();
    abrir();
    await user.click(confirmar());

    expect(await screen.findByLabelText("Senha provisória")).toHaveTextContent("Ab3dEf7hJk9m");
    expect(screen.getByText("fulana@exemplo.com")).toBeInTheDocument();
    expect(screen.getByText(/não será exibida de novo/)).toBeInTheDocument();
    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("resetar-senha-colaborador", {
      body: { colaborador_id: COLAB },
    });
  });

  it("mostra o motivo que a EF escreveu quando ela responde não-2xx", async () => {
    // Sem `mensagemDeErroDaFuncao`, o `data` é null e cairia na genérica.
    setFunctionResult("resetar-senha-colaborador", {
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: {
          body: JSON.stringify({ error: "FULANA DE SOUZA ainda não tem acesso ao sistema." }),
        },
      },
    });
    const user = userEvent.setup();
    abrir();
    await user.click(confirmar());

    expect(await screen.findByRole("alert")).toHaveTextContent("ainda não tem acesso ao sistema");
    expect(screen.queryByText("Não foi possível resetar a senha.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Senha provisória")).not.toBeInTheDocument();
  });

  it("resposta 200 sem senha NÃO vira sucesso", async () => {
    // Defensivo: mostrar "senha trocada" sem senha deixaria o superadmin sem o que
    // repassar, e a senha velha já morta.
    setFunctionResult("resetar-senha-colaborador", { data: { success: true }, error: null });
    const user = userEvent.setup();
    abrir();
    await user.click(confirmar());

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível resetar a senha.");
  });

  it("🔴 com a senha na tela, o clique fora NÃO fecha", async () => {
    setFunctionResult("resetar-senha-colaborador", {
      data: { success: true, senha: "Ab3dEf7hJk9m", email: "f@exemplo.com", nome: "F" },
      error: null,
    });
    const user = userEvent.setup();
    abrir();
    await user.click(confirmar());
    await screen.findByLabelText("Senha provisória");

    // O Radix registra o listener de clique fora num setTimeout(0): disparar antes
    // passaria verde sem a proteção (ver ColaboradorDialog.ui.test.tsx).
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.getByLabelText("Senha provisória")).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalled();

    // Controle positivo: o botão Concluir fecha.
    await user.click(screen.getByRole("button", { name: "Concluir" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
