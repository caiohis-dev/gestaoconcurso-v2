import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent, waitFor } from "@/test/utils";
import CadastroPublico from "./CadastroPublico";

/**
 * O passo 1 do `/cadastro-publico` — a ÚNICA porta do sistema aberta ao público.
 *
 * 🔴 O que estes testes guardam é a validação ANTES da consulta (2026-08-02). Até então a
 * tela conferia só o TAMANHO e chamava a Edge Function `check-cpf-colaborador` com
 * qualquer coisa de 11 dígitos.
 *
 * ⚠️ Aqui o mock é do `fetch` GLOBAL, e não do client do Supabase: esta tela não usa o
 * client — ela monta a chamada à Edge Function à mão, com `fetch` e a anon key nos
 * headers (é um fluxo sem login). Mockar `supabase.functions.invoke` não pegaria nada.
 */
describe("CadastroPublico — passo 1 (verificar CPF)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Um CPF com dígitos verificadores CORRETOS. Gerado pelo módulo 11, não inventado. */
  const CPF_VALIDO = "529.982.247-25";
  /** Mesmos 11 dígitos, com o último trocado — passa no tamanho, falha no DV. */
  const CPF_DV_ERRADO = "529.982.247-26";

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ exists: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  const digitar = async (user: ReturnType<typeof userEvent.setup>, valor: string) => {
    await user.type(screen.getByLabelText("CPF"), valor);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
  };

  it("🔴 CPF com dígito verificador errado NÃO chega à Edge Function", async () => {
    // O ponto inteiro da mudança. Se esta asserção cair, a tela voltou a gastar uma ida
    // ao servidor — e a devolver "não encontrado" para quem só errou um dígito.
    const user = userEvent.setup();
    renderWithProviders(<CadastroPublico />);

    await digitar(user, CPF_DV_ERRADO);

    expect(await screen.findByText(/confira os dígitos/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("⭐ CONTROLE POSITIVO: CPF válido CHEGA à Edge Function", async () => {
    // Sem este, a asserção acima passaria mesmo se a tela tivesse parado de chamar a EF
    // por completo — que é o modo de falha mais fácil de introduzir aqui.
    const user = userEvent.setup();
    renderWithProviders(<CadastroPublico />);

    await digitar(user, CPF_VALIDO);

    // ⚠️ Filtra pela URL em vez de contar o `fetch` GLOBAL. Até 2026-09-10 esta asserção
    // era `toHaveBeenCalledTimes(1)`, e passava por um motivo que não tinha nada a ver
    // com o que ela mede: o passo seguinte monta o `ColaboradorDialog`, que chamava
    // `useColaboradores()` → `useAuth()` → EXCEÇÃO, porque `renderWithProviders` não
    // monta o AuthProvider de propósito. O diálogo morria antes de buscar o catálogo de
    // bancos, e o contador parava em 1. Separadas as mutations da listagem, o formulário
    // passou a renderizar de verdade — e a segunda chamada (`/rest/v1/bancos`) é o
    // diálogo FUNCIONANDO, não regressão.
    //
    // Contar tráfego alheio fazia esta asserção depender de um crash. Agora ela mede só
    // o que promete: a Edge Function foi chamada, uma vez (guarda contra duplo envio).
    const chamadasEF = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes("check-cpf-colaborador"));

    await waitFor(() => expect(chamadasEF()).toHaveLength(1));
    const [, init] = chamadasEF()[0];
    // Vai SEM máscara: a EF compara com `colaboradores.colab_cpf`, que guarda só dígitos.
    expect(JSON.parse(init.body)).toEqual({ cpf: "52998224725" });
  });

  it("distingue 'ainda não terminou' de 'terminou e errou'", async () => {
    // ⚠️ A mensagem única de antes ("Digite um CPF válido com 11 dígitos") mentia nos
    // dois casos: dizia "11 dígitos" para quem já tinha digitado 11. São erros com
    // providências diferentes — continuar digitando vs. conferir o que digitou.
    const user = userEvent.setup();
    renderWithProviders(<CadastroPublico />);

    await digitar(user, "529.982");

    expect(await screen.findByText(/Digite os 11 dígitos/i)).toBeInTheDocument();
    expect(screen.queryByText(/confira os dígitos/i)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("⚠️ CPF de dígitos repetidos é recusado — passa na aritmética do módulo 11", async () => {
    // `111.111.111-11` satisfaz os dois DVs; quem barra é a blacklist do `cpfValido`.
    // Ver o cabeçalho de src/lib/cpf.ts, que demonstra a conta.
    const user = userEvent.setup();
    renderWithProviders(<CadastroPublico />);

    await digitar(user, "111.111.111-11");

    expect(await screen.findByText(/confira os dígitos/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
