import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/test/utils";
import PerfilColaborador from "@/pages/PerfilColaborador";
import { resetSupabaseMock, setRpcResult, setTableResult } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const auth = vi.hoisted(() => ({ atual: null as unknown, signOut: null as unknown }));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => auth.atual,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

/**
 * 🔴 O BECO SEM SAÍDA do portal do colaborador.
 *
 * Até 2026-09-18 o ramo "não achei o cadastro" renderizava só `<p>Dados não
 * encontrados.</p>`: sem header, sem logo e **sem botão Sair**. Como `/auth` rebate quem
 * já está logado, a única saída era esperar os 5 minutos do `INACTIVITY_TIMEOUT`.
 *
 * Isso era teórico enquanto ninguém era mandado para cá. Deixou de ser no mesmo dia, ao
 * passar a redirecionar o colaborador sem gestão para esta página: quem tem o papel
 * `colaborador` sem linha em `colaboradores` (1 conta em 53, medido) cai exatamente
 * neste ramo. O papel sobrevive à exclusão da linha e nada o revoga.
 *
 * O contrato que estes testes fixam: **de toda tela deste portal dá para SAIR**, e a
 * recusa diz o que fazer.
 */
describe("PerfilColaborador — sem cadastro vinculado", () => {
  const signOut = vi.fn();

  beforeEach(() => {
    resetSupabaseMock();
    signOut.mockClear();
    // A RPC responde vazio: é a conta com papel `colaborador` e sem linha.
    setRpcResult("get_meu_colaborador", { data: [], error: null });
    setTableResult("bancos", { data: [], error: null });
    auth.atual = {
      user: { id: "u-1", email: "orfa@fevre.test", user_metadata: {} },
      loading: false,
      rolesLoaded: true,
      isColaborador: true,
      isColaboradorSemGestao: true,
      signOut,
    };
  });

  function montar() {
    return render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PerfilColaborador />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("oferece uma saída — o botão Sair, que desloga de verdade", async () => {
    const user = userEvent.setup();
    montar();

    const sair = await screen.findByRole("button", { name: /Sair/i });
    await user.click(sair);

    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("nomeia a providência em vez de só dizer que não achou", async () => {
    montar();

    expect(await screen.findByText(/Cadastro não localizado/i)).toBeInTheDocument();
    // "Dados não encontrados." era verdade e não ajudava ninguém: quem lê precisa saber
    // com quem falar. É a regra do §2 do CLAUDE.md — a recusa nomeia o que fazer.
    expect(screen.getByText(/[Ff]ale com a coordenação/)).toBeInTheDocument();
  });

  it("NÃO oferece a troca de senha neste estado", async () => {
    // O card de senha é do caminho normal. Aqui a pessoa não tem cadastro: o que ela
    // precisa é sair e falar com a coordenação, não mexer na conta.
    montar();

    await screen.findByText(/Cadastro não localizado/i);
    expect(screen.queryByLabelText("Nova Senha")).not.toBeInTheDocument();
  });
});

/**
 * 🔵 2026-09-24. As duas RPCs de gravação recusam de dois jeitos — medidos no banco local,
 * chamando-as como colaborador —, e a tela só entendia um terceiro, que não acontece:
 * - `P0001`: frase escrita pela própria RPC. Era DESCARTADA em favor de "Não foi possível
 *   salvar" — inclusive a duplicidade, que a RPC captura e relança assim.
 * - `23514`: CHECK. Virava a genérica (dados pessoais) ou ia CRUA ao toast (bancários).
 * As mensagens abaixo são as REAIS da medição.
 */
describe("PerfilColaborador — a recusa do banco chega à pessoa", () => {
  // No FORMATO da `get_meu_colaborador`, que faz COALESCE de todo campo: nulo vira '' ou 0.
  // Com null aqui a tela quebra no contador de caracteres — mas a RPC real nunca o manda.
  const CADASTRO = {
    id: "c-1", colab_matricula: "", colab_nome_completo: "MARIA DA SILVA",
    colab_cpf: "52998224725", colab_nacionalidade: "Brasileira", colab_pis: "",
    colab_rua: "Rua A", colab_numero_casa: 10, colab_complemento_endereco: "",
    colab_bairro: "Centro", colab_cidade: "Barra do Piraí", colab_cep: 27100000,
    colab_telefone: 24999990000, colab_grau_instrucao: 2, colab_estado_civil: 1, colab_raca: 1,
    colab_deficiente: false, colab_data_nascimento: "1980-01-01", colab_email: "maria@x.com",
    colab_chave_pix: "", codigo_banco: "", agencia: "12", agencia_dv: "",
    conta: "123", conta_dv: "1", tipo_conta: "corrente",
  };

  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    setRpcResult("get_meu_colaborador", { data: [CADASTRO], error: null });
    setRpcResult("update_meu_colaborador", { data: true, error: null });
    setRpcResult("update_meus_dados_bancarios", { data: true, error: null });
    setTableResult("bancos", { data: [], error: null });
    auth.atual = {
      user: { id: "u-1", email: "maria@x.com", user_metadata: {} },
      loading: false,
      rolesLoaded: true,
      isColaborador: true,
      isColaboradorSemGestao: true,
      signOut: vi.fn(),
    };
  });

  async function salvar() {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PerfilColaborador />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /Salvar Alterações/i }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    return toastMock.mock.calls.at(-1)?.[0] as { title: string; description: string };
  }

  it("a duplicidade relançada pela RPC (P0001) chega como a RPC escreveu", async () => {
    setRpcResult("update_meu_colaborador", {
      data: null,
      error: { code: "P0001", message: "Este e-mail ou chave PIX já está em uso por outro colaborador." } as never,
    });
    const toast = await salvar();
    expect(toast.title).toBe("Erro ao salvar");
    expect(toast.description).toBe("Este e-mail ou chave PIX já está em uso por outro colaborador.");
  });

  it("a CHECK dos dados pessoais nomeia o campo, em vez da frase genérica", async () => {
    setRpcResult("update_meu_colaborador", {
      data: null,
      error: {
        code: "23514",
        message: 'new row for relation "colaboradores" violates check constraint "chk_colab_telefone_positivo"',
      } as never,
    });
    const toast = await salvar();
    expect(toast.description).toMatch(/^Telefone inválido/);
  });

  it("a CHECK dos dados bancários chega traduzida, não crua", async () => {
    setRpcResult("update_meus_dados_bancarios", {
      data: null,
      error: {
        code: "23514",
        message: 'new row for relation "colaboradores" violates check constraint "chk_agencia_apenas_numeros"',
      } as never,
    });
    const toast = await salvar();
    expect(toast.title).toBe("Erro nos dados bancários");
    expect(toast.description).toMatch(/^Agência inválida/);
    expect(toast.description).not.toContain("violates");
  });

  it("a frase P0001 da RPC bancária segue chegando como está", async () => {
    setRpcResult("update_meus_dados_bancarios", {
      data: null,
      error: { code: "P0001", message: "Banco selecionado não existe." } as never,
    });
    const toast = await salvar();
    expect(toast.description).toBe("Banco selecionado não existe.");
  });

  it("erro técnico desconhecido NÃO vai cru: cai na frase genérica", async () => {
    setRpcResult("update_meus_dados_bancarios", {
      data: null,
      error: { code: "08006", message: "connection failure" } as never,
    });
    const toast = await salvar();
    expect(toast.description).toBe("Não foi possível salvar os dados bancários.");
  });

  it("🟢 CONTROLE POSITIVO: gravação aceita segue confirmando", async () => {
    const toast = await salvar();
    expect(toast.description).toBe("Suas alterações foram salvas.");
  });
});
