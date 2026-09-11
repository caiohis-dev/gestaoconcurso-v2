import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";

const colaboradoresHook = vi.hoisted(() => ({ atual: null as unknown }));
// ⚠️ `useColaboradoresMutations`, não `useColaboradores`: em 2026-09-10 as escritas foram
// separadas da listagem, porque este diálogo usava só as mutations e pagava um
// `select` da tabela inteira junto — em `/cadastro-publico`, como anônimo, virava 4
// requisições recusadas por RLS. O diálogo NÃO deve consultar nada.
vi.mock("@/hooks/useColaboradores", () => ({
  useColaboradoresMutations: () => colaboradoresHook.atual,
}));

vi.mock("@/hooks/useBancos", () => ({
  useBancos: () => ({ bancos: [{ codigo_compe: "341", nome: "Itaú", apelido: "Itaú" }] }),
  TIPO_CONTA_OPTIONS: [
    { value: "corrente", label: "Conta Corrente" },
    { value: "poupanca", label: "Conta Poupança" },
  ],
}));

/**
 * O diálogo filho tem teste próprio (`CorrigirEmailAcessoDialog.ui.test.tsx`) e consulta
 * a Edge Function ao abrir. Aqui interessa só que ele é OFERECIDO — não o que faz.
 */
vi.mock("@/components/CorrigirEmailAcessoDialog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="dialogo-corrigir-email" /> : null,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

import ColaboradorDialog from "@/components/ColaboradorDialog";

/**
 * Interação do ColaboradorDialog — 777 linhas, o maior componente do repo, e o
 * formulário central do sistema. Os 33 testes do schema Zod isolado estão em
 * `ColaboradorDialog.test.ts`; aqui estão os três comportamentos que só existem na tela:
 *
 * 1. **A âncora de identidade.** Numa linha já reivindicada (`user_id` preenchido),
 *    `colab_email` É o login. O campo fica somente-leitura e sai do payload — trocá-lo
 *    aqui não alcançaria `auth.users`, só faria cadastro e conta divergirem.
 * 2. **O modo público**, que fala direto com a Edge Function e não se deixa fechar.
 * 3. **A normalização do payload** — CPF com zero à esquerda, data BR→ISO, vazio→null.
 */
describe("ColaboradorDialog (interação)", () => {
  const COLABORADOR = {
    id: "c-1",
    colab_nome_completo: "Fulana de Souza",
    colab_cpf: "01234567890",
    colab_data_nascimento: "1990-05-20",
    colab_email: "fulana@exemplo.com",
    colab_telefone: 24999998888,
    colab_matricula: null,
    colab_nacionalidade: "Brasileira",
    colab_pis: null,
    colab_rua: null,
    colab_numero_casa: null,
    colab_bairro: null,
    colab_cidade: null,
    colab_cep: null,
    colab_estado_civil: null,
    colab_raca: null,
    colab_grau_instrucao: null,
    colab_complemento_endereco: null,
    colab_deficiente: false,
    colab_chave_pix: null,
    codigo_banco: null,
    agencia: null,
    agencia_dv: null,
    conta: null,
    conta_dv: null,
    tipo_conta: null,
    user_id: null,
    colab_ultimo_acesso: null,
    created_at: null,
    updated_at: null,
    created_by: null,
  };

  let create: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    create = vi.fn();
    update = vi.fn();
    onOpenChange = vi.fn();
    colaboradoresHook.atual = { create, update, isCreating: false, isUpdating: false };
  });

  const abrir = (props: Partial<Parameters<typeof ColaboradorDialog>[0]> = {}) =>
    renderWithProviders(
      <ColaboradorDialog open onOpenChange={onOpenChange} {...props} />,
    );

  /** Preenche o mínimo que o schema exige para submeter. */
  async function preencherObrigatorios(
    user: ReturnType<typeof userEvent.setup>,
    { cpf = "01234567890", email = "nova@exemplo.com" } = {},
  ) {
    await user.type(screen.getByLabelText("Nome Completo *"), "Beltrana Silva");
    await user.type(screen.getByLabelText("CPF *"), cpf);
    await user.type(screen.getByLabelText("Data de Nascimento *"), "20051990");
    await user.type(screen.getByLabelText("Telefone *"), "24999998888");
    await user.type(screen.getByLabelText("Email *"), email);
  }

  describe("a âncora de identidade — linha já vinculada a uma conta", () => {
    const VINCULADO = { ...COLABORADOR, user_id: "auth-1" };

    it("deixa o e-mail somente-leitura e explica por quê", () => {
      abrir({ colaborador: VINCULADO });

      expect(screen.getByLabelText("Email *")).toHaveAttribute("readonly");
      expect(screen.getByText(/este e-mail passou a ser o login/)).toBeInTheDocument();
      expect(
        screen.getByText(/só faria o cadastro divergir da conta/),
      ).toBeInTheDocument();
    });

    it("oferece o caminho de correção para quem nunca conseguiu entrar", async () => {
      // Sem esta porta, o e-mail travado viraria beco sem saída para o estado B.
      const user = userEvent.setup();
      abrir({ colaborador: VINCULADO });

      expect(screen.queryByTestId("dialogo-corrigir-email")).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: /O e-mail está errado e ele nunca conseguiu entrar/ }),
      );
      expect(screen.getByTestId("dialogo-corrigir-email")).toBeInTheDocument();
    });

    it("NÃO manda colab_email no update de linha vinculada", async () => {
      // O ponto da proteção: mesmo que o campo chegasse alterado, ele não vai no payload.
      const user = userEvent.setup();
      abrir({ colaborador: VINCULADO });
      await user.clear(screen.getByLabelText("Nome Completo *"));
      await user.type(screen.getByLabelText("Nome Completo *"), "Fulana de Souza Lima");
      await user.click(screen.getByRole("button", { name: "Atualizar" }));

      await waitFor(() => expect(update).toHaveBeenCalled());
      const payload = update.mock.calls[0][0];
      expect(payload).not.toHaveProperty("colab_email");
      expect(payload).toMatchObject({ id: "c-1", colab_nome_completo: "Fulana de Souza Lima" });
    });

    it("linha NÃO vinculada continua editando o e-mail normalmente", async () => {
      const user = userEvent.setup();
      abrir({ colaborador: COLABORADOR });

      expect(screen.getByLabelText("Email *")).not.toHaveAttribute("readonly");
      await user.click(screen.getByRole("button", { name: "Atualizar" }));

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0][0]).toHaveProperty("colab_email", "fulana@exemplo.com");
    });
  });

  describe("normalização do que é enviado", () => {
    it("preserva o zero à esquerda do CPF", async () => {
      // CPF é texto no banco justamente porque há cadastros que começam com 0. Tratá-lo
      // como número comeria o dígito e gravaria o CPF de outra pessoa.
      const user = userEvent.setup();
      abrir();
      await preencherObrigatorios(user, { cpf: "01234567890" });
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0].colab_cpf).toBe("01234567890");
    });

    it("converte a data de BR para ISO", async () => {
      const user = userEvent.setup();
      abrir();
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0].colab_data_nascimento).toBe("1990-05-20");
    });

    it("campos opcionais vazios viram null, não string vazia", async () => {
      // A coluna aceita NULL, e gravar "" atrapalharia buscas e relatórios.
      const user = userEvent.setup();
      abrir();
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const payload = create.mock.calls[0][0];
      expect(payload.colab_rua).toBeNull();
      expect(payload.colab_chave_pix).toBeNull();
      expect(payload.codigo_banco).toBeNull();
      expect(payload.colab_pis).toBeNull();
    });

    it("telefone vira número", async () => {
      const user = userEvent.setup();
      abrir();
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0].colab_telefone).toBe(24999998888);
    });

    it("mostra a data já formatada ao editar", () => {
      abrir({ colaborador: COLABORADOR });
      expect(screen.getByLabelText("Data de Nascimento *")).toHaveValue("20/05/1990");
    });
  });

  describe("validação", () => {
    it("aponta nome e CPF que faltam, campo a campo", async () => {
      // Só `telefone` e `email` têm `required` nativo; os outros chegam ao Zod. Por isso
      // este teste preenche justamente aqueles dois — senão a validação do NAVEGADOR
      // barra o submit antes e o Zod nem roda (armadilha 7 do testes.md).
      const user = userEvent.setup();
      abrir();
      await user.type(screen.getByLabelText("CPF *"), "52998224725");
      await user.type(screen.getByLabelText("Telefone *"), "24999998888");
      await user.type(screen.getByLabelText("Email *"), "nova@exemplo.com");
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      expect(await screen.findByText("Nome completo obrigatório")).toBeInTheDocument();
      expect(screen.getByText("Data de nascimento obrigatória")).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("recusa CPF incompleto em vez de fabricar outro", async () => {
      // REGRESSÃO. Até 2026-07-26 digitar 6 dígitos gravava `00000123456` — o CPF de
      // outra pessoa. A causa era de ORDEM: o `padStart(11, "0")` montava o payload
      // antes do parse, então o `.length(11)` do schema nunca falhava. Agora a checagem
      // roda sobre os dígitos DIGITADOS, antes de qualquer normalização.
      const user = userEvent.setup();
      abrir();
      await user.type(screen.getByLabelText("Nome Completo *"), "Beltrana Silva");
      await user.type(screen.getByLabelText("CPF *"), "123456");
      await user.type(screen.getByLabelText("Data de Nascimento *"), "20051990");
      await user.type(screen.getByLabelText("Telefone *"), "24999998888");
      await user.type(screen.getByLabelText("Email *"), "nova@exemplo.com");
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      expect(await screen.findByText("CPF deve ter 11 dígitos")).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("recusa CPF com dígito verificador errado", async () => {
      // 11 dígitos, formato perfeito, e mesmo assim não existe: é o caso que só o
      // módulo 11 pega. `52998224725` é válido; trocar o último dígito o invalida.
      const user = userEvent.setup();
      abrir();
      await user.type(screen.getByLabelText("Nome Completo *"), "Beltrana Silva");
      await user.type(screen.getByLabelText("CPF *"), "52998224726");
      await user.type(screen.getByLabelText("Data de Nascimento *"), "20051990");
      await user.type(screen.getByLabelText("Telefone *"), "24999998888");
      await user.type(screen.getByLabelText("Email *"), "nova@exemplo.com");
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      expect(
        await screen.findByText("CPF inválido — confira os dígitos"),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("recusa CPF de dígitos repetidos, que passa na aritmética", async () => {
      const user = userEvent.setup();
      abrir();
      await user.type(screen.getByLabelText("Nome Completo *"), "Beltrana Silva");
      await user.type(screen.getByLabelText("CPF *"), "11111111111");
      await user.type(screen.getByLabelText("Data de Nascimento *"), "20051990");
      await user.type(screen.getByLabelText("Telefone *"), "24999998888");
      await user.type(screen.getByLabelText("Email *"), "nova@exemplo.com");
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      expect(
        await screen.findByText("CPF inválido — confira os dígitos"),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("editar cadastro LEGADO com CPF inválido, sem tocar no CPF, continua salvando", async () => {
      // Decisão de escopo, e sem este teste ela se perde: 16 dos 771 cadastros de
      // produção têm CPF inválido de origem. Validar sempre impediria corrigir o
      // telefone deles — travaria atendimento por causa de dado antigo. Só CPF NOVO ou
      // ALTERADO é validado.
      const user = userEvent.setup();
      abrir({ colaborador: { ...COLABORADOR, colab_cpf: "11111111111" } });
      await user.clear(screen.getByLabelText("Telefone *"));
      await user.type(screen.getByLabelText("Telefone *"), "24988887777");
      await user.click(screen.getByRole("button", { name: "Atualizar" }));

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0][0].colab_telefone).toBe(24988887777);
      expect(screen.queryByText(/CPF inválido/)).not.toBeInTheDocument();
    });

    it("mas ALTERAR o CPF de um cadastro legado passa a exigir CPF válido", async () => {
      // O outro lado da mesma decisão: tolerar o legado não é liberar dado novo ruim.
      const user = userEvent.setup();
      abrir({ colaborador: { ...COLABORADOR, colab_cpf: "11111111111" } });
      await user.clear(screen.getByLabelText("CPF *"));
      await user.type(screen.getByLabelText("CPF *"), "22222222222");
      await user.click(screen.getByRole("button", { name: "Atualizar" }));

      expect(
        await screen.findByText("CPF inválido — confira os dígitos"),
      ).toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();
    });

    it("recusa CPF vazio em vez de gravar onze zeros", async () => {
      // REGRESSÃO. Mesma causa, resultado pior: sem digitar nada o padStart entregava
      // onze zeros — 11 dígitos, válido para o Zod E para o CHECK do banco. Hoje morre
      // duas vezes: por tamanho aqui, e pela blacklist de repetidos do `cpfValido`.
      const user = userEvent.setup();
      abrir();
      await user.type(screen.getByLabelText("Nome Completo *"), "Beltrana Silva");
      await user.type(screen.getByLabelText("Data de Nascimento *"), "20051990");
      await user.type(screen.getByLabelText("Telefone *"), "24999998888");
      await user.type(screen.getByLabelText("Email *"), "nova@exemplo.com");
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      expect(await screen.findByText("CPF deve ter 11 dígitos")).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe("modo público", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    function responderEF(body: Record<string, unknown>, ok = true, status = 200) {
      fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok,
        status,
        json: async () => body,
      } as Response);
    }

    it("chega com o CPF já conferido preenchido", () => {
      // Vem do `/cadastro-publico`, que já perguntou o CPF antes de abrir o formulário.
      abrir({ publicMode: true, initialCpf: "01234567890" });
      expect(screen.getByLabelText("CPF *")).toHaveValue("012.345.678-90");
    });

    it("avisa que o link de senha virá por e-mail", () => {
      abrir({ publicMode: true });
      expect(
        screen.getByText(/enviaremos um link para o seu e-mail para você criar a sua senha/),
      ).toBeInTheDocument();
    });

    it("não se deixa fechar pelo Esc", async () => {
      // Fechar no meio deixaria a pessoa sem cadastro e sem saber; o diálogo público
      // impede Esc e clique fora de propósito.
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await user.keyboard("{Escape}");

      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("manda o cadastro para a Edge Function, não pelo hook", async () => {
      // O cadastro público não tem sessão — vai pela EF com a anon key, e é lá que
      // moram o rate limit e o disparo do link de acesso.
      responderEF({ email_mascarado: "n***a@exemplo.com" });
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      expect(String(fetchSpy.mock.calls[0][0])).toContain(
        "/functions/v1/public-create-colaborador",
      );
      expect(create).not.toHaveBeenCalled();
    });

    it("no sucesso mostra o e-mail mascarado e lembra do spam", async () => {
      // O mascarado diz QUAL caixa abrir — quem tem vários e-mails depende disso.
      responderEF({ email_mascarado: "n***a@exemplo.com" });
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      const aviso = await screen.findByText(/Cadastro realizado!/);
      expect(aviso).toBeInTheDocument();
      expect(screen.getByText(/n\*\*\*a@exemplo\.com/)).toBeInTheDocument();
      expect(screen.getByText(/caixa de spam/)).toBeInTheDocument();
    });

    it("traduz 'CPF já cadastrado' em vez de repassar o texto do servidor", async () => {
      responderEF({ error: "duplicate key value: cpf ja cadastrado" }, false, 409);
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      expect(
        await screen.findByText("Este CPF já está cadastrado no sistema."),
      ).toBeInTheDocument();
    });

    it("traduz 'e-mail em uso'", async () => {
      responderEF({ error: "email already cadastrado em uso" }, false, 409);
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      expect(
        await screen.findByText("Este e-mail já está em uso por outro cadastro."),
      ).toBeInTheDocument();
    });

    it("falha de rede vira mensagem, não tela travada", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Failed to fetch"));
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      expect(await screen.findByText(/Erro ao cadastrar/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    });

    it("o aviso é acessível: dentro do diálogo, anunciável e focável", async () => {
      // REGRESSÃO. Até 2026-07-26 o aviso vivia FORA do portal do Radix, e um dialog
      // modal marca todo conteúdo irmão com `aria-hidden="true"` — a mensagem mais
      // importante do fluxo não era anunciada, e o botão só era encontrável com
      // `hidden: true`. Pesava mais aqui do que pesaria em outro lugar: é o cadastro
      // PÚBLICO, e no publicMode o diálogo não se deixa fechar, então quem depende de
      // leitor de tela ficava sem retorno e sem saída.
      responderEF({ email_mascarado: "n***a@exemplo.com" });
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      const aviso = await screen.findByText(/Cadastro realizado!/);
      expect(aviso.closest("[aria-hidden='true']")).toBeNull();
      // Sem `hidden: true` — é o que prova que entrou na árvore de acessibilidade.
      expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
    });

    it("o aviso substitui o formulário, em vez de se empilhar sobre ele", async () => {
      // A troca de camada por substituição é o que dispensou o `z-[60]` e o
      // `pointer-events-auto`: não há mais duas camadas disputando.
      responderEF({ email_mascarado: "n***a@exemplo.com" });
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await screen.findByText(/Cadastro realizado!/);
      expect(screen.queryByLabelText("Nome Completo *")).not.toBeInTheDocument();
      expect(document.querySelector(".z-\\[60\\]")).toBeNull();
    });

    it("'Continuar' encerra o fluxo público — é o que leva ao /auth", async () => {
      responderEF({ email_mascarado: "n***a@exemplo.com" });
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));
      await screen.findByText(/Cadastro realizado!/);

      await user.click(screen.getByRole("button", { name: "Continuar" }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("depois de erro, 'Fechar' devolve o formulário PREENCHIDO", async () => {
      // A pessoa acabou de digitar tudo; perder o preenchimento por causa de um erro de
      // servidor seria punir quem não errou.
      responderEF({ error: "duplicate key value: cpf ja cadastrado" }, false, 409);
      const user = userEvent.setup();
      abrir({ publicMode: true });
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));
      await screen.findByText("Este CPF já está cadastrado no sistema.");

      await user.click(screen.getByRole("button", { name: "Fechar" }));

      expect(screen.getByLabelText("Nome Completo *")).toHaveValue("Beltrana Silva");
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe("modo administrativo", () => {
    it("anuncia-se conforme criação ou edição", () => {
      const { unmount } = abrir();
      expect(screen.getByRole("heading", { name: "Novo Colaborador" })).toBeInTheDocument();
      unmount();

      abrir({ colaborador: COLABORADOR });
      expect(screen.getByRole("heading", { name: "Editar Colaborador" })).toBeInTheDocument();
    });

    it("fecha sozinho depois de gravar", async () => {
      // O fechamento vai no `onSuccess` da mutation: falhar mantém o diálogo aberto com
      // o preenchimento, que é o que permite corrigir.
      const user = userEvent.setup();
      abrir();
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(onOpenChange).not.toHaveBeenCalled();

      create.mock.calls[0][1].onSuccess();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
