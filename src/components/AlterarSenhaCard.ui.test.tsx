import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AlterarSenhaCard from "@/components/AlterarSenhaCard";
import { resetSupabaseMock, supabaseMock } from "@/test/supabase-mock";
import { toast } from "sonner";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/**
 * O card de troca de senha, usado por `/perfil` (gestão) e `/perfil-colaborador`.
 *
 * Por que ele tem teste próprio: nasceu extraído do `Perfil.tsx` em 2026-09-18 para que
 * mandar o colaborador sem gestão ao portal não virasse regressão — aquela página não
 * monta o `Layout`, logo não alcança o link "Alterar Cadastro" do menu. Se este card
 * parar de funcionar, 40 pessoas voltam a depender de sair e pedir link por e-mail para
 * trocar a própria senha, e nada mais na suíte acusaria.
 *
 * O contrato que estes testes fixam: **nada é enviado ao servidor sem passar pelas duas
 * validações**, e o que o servidor recusa NÃO é anunciado como sucesso.
 */
describe("AlterarSenhaCard (interação)", () => {
  beforeEach(() => {
    resetSupabaseMock();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    supabaseMock.auth.updateUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  async function preencher(nova: string, confirma: string) {
    const user = userEvent.setup();
    render(<AlterarSenhaCard />);
    await user.type(screen.getByLabelText("Nova Senha"), nova);
    await user.type(screen.getByLabelText("Confirmar Nova Senha"), confirma);
    await user.click(screen.getByRole("button", { name: /Atualizar Senha/i }));
    return user;
  }

  it("troca a senha e limpa os campos", async () => {
    await preencher("senha-nova-123", "senha-nova-123");

    await waitFor(() =>
      expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({ password: "senha-nova-123" }),
    );
    expect(toast.success).toHaveBeenCalled();
    // Limpar importa: o campo fica visível na página inteira depois do sucesso.
    await waitFor(() => expect(screen.getByLabelText("Nova Senha")).toHaveValue(""));
    expect(screen.getByLabelText("Confirmar Nova Senha")).toHaveValue("");
  });

  it("recusa senhas que não coincidem SEM chamar o servidor", async () => {
    await preencher("senha-nova-123", "senha-nova-124");

    expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("As senhas não coincidem");
  });

  it("recusa senha com menos de 6 caracteres SEM chamar o servidor", async () => {
    // 6 é o `minimum_password_length` do Auth em produção. Deixar passar só trocaria a
    // nossa mensagem pela do GoTrue, em inglês.
    await preencher("12345", "12345");

    expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("A nova senha deve ter pelo menos 6 caracteres");
  });

  it("erro do servidor NÃO vira mensagem de sucesso", async () => {
    // A armadilha clássica aqui: anunciar sucesso e a pessoa descobrir no próximo login.
    supabaseMock.auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "New password should be different from the old password." },
    });

    await preencher("senha-nova-123", "senha-nova-123");

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    // E os campos NÃO são limpos: a pessoa corrige o que digitou em vez de redigitar.
    expect(screen.getByLabelText("Nova Senha")).toHaveValue("senha-nova-123");
  });
});
