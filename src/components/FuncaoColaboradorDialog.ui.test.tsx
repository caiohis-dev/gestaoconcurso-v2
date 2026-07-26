import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FuncaoColaboradorDialog from "@/components/FuncaoColaboradorDialog";

/**
 * Interação do FuncaoColaboradorDialog. O schema isolado está em
 * `FuncaoColaboradorDialog.test.ts`; aqui interessa a proteção que só existe na tela:
 * **função do sistema tem o nome travado**.
 *
 * Por que essa trava importa: as duas funções de coordenação são identificadas por UUID
 * fixo em `FUNCOES_COORDENACAO` (`useCoordenadoresProva`), e é a partir delas que se
 * decide quem pode receber acesso de coordenador. Renomear "Coordenador Geral" não
 * quebraria a consulta — ela é por id —, e é justamente esse o risco: a tela passaria a
 * chamar de outra coisa a função que o sistema continua tratando como coordenação.
 */
describe("FuncaoColaboradorDialog (interação)", () => {
  const FUNCAO = {
    id: "f-1",
    cargo_nome: "Fiscal de Sala",
    cargo_cbo: "2410-05",
    cargo_descricao: "Acompanha a aplicação na sala.",
    cargo_editavel: true,
    created_at: null,
    updated_at: null,
    created_by: null,
  };

  let onSubmit: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSubmit = vi.fn();
    onOpenChange = vi.fn();
  });

  const abrir = (props: Partial<Parameters<typeof FuncaoColaboradorDialog>[0]> = {}) =>
    render(
      <FuncaoColaboradorDialog
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        {...props}
      />,
    );

  const campoNome = () => screen.getByLabelText("Nome da Função *");

  describe("modo criação", () => {
    it("anuncia-se como nova, com os campos vazios", () => {
      abrir();
      expect(screen.getByRole("heading", { name: "Nova Função" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cadastrar" })).toBeInTheDocument();
      expect(campoNome()).toHaveValue("");
      expect(campoNome()).toBeEnabled();
    });

    it("submete os três campos", async () => {
      const user = userEvent.setup();
      abrir();
      await user.type(campoNome(), "Apoio Logístico");
      await user.type(screen.getByLabelText("CBO"), "4110-10");
      await user.type(screen.getByLabelText("Descrição"), "Apoia a montagem.");
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          cargo_nome: "Apoio Logístico",
          cargo_cbo: "4110-10",
          cargo_descricao: "Apoia a montagem.",
        }),
      );
    });

    it("exige o nome, mas aceita CBO e descrição vazios", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));
      expect(await screen.findByText("Nome é obrigatório")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      await user.type(campoNome(), "Apoio");
      await user.click(screen.getByRole("button", { name: "Cadastrar" }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ cargo_nome: "Apoio", cargo_cbo: "", cargo_descricao: "" }),
        ),
      );
    });
  });

  describe("modo edição", () => {
    it("preenche com a função e troca os rótulos", () => {
      abrir({ funcao: FUNCAO });

      expect(screen.getByRole("heading", { name: "Editar Função" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
      expect(campoNome()).toHaveValue("Fiscal de Sala");
      expect(screen.getByLabelText("CBO")).toHaveValue("2410-05");
    });

    it("campos nulos no banco viram string vazia, não 'null' na tela", async () => {
      abrir({ funcao: { ...FUNCAO, cargo_cbo: null, cargo_descricao: null } });

      expect(screen.getByLabelText("CBO")).toHaveValue("");
      expect(screen.getByLabelText("Descrição")).toHaveValue("");
    });

    it("trocar de função sem fechar repreenche o formulário", async () => {
      const { rerender } = abrir({ funcao: FUNCAO });
      expect(campoNome()).toHaveValue("Fiscal de Sala");

      rerender(
        <FuncaoColaboradorDialog
          open
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
          funcao={{ ...FUNCAO, id: "f-2", cargo_nome: "Porteiro" }}
        />,
      );

      await waitFor(() => expect(campoNome()).toHaveValue("Porteiro"));
    });
  });

  describe("função do sistema — a trava do nome", () => {
    const SISTEMA = { ...FUNCAO, id: "f-sys", cargo_nome: "Coordenador Geral", cargo_editavel: false };

    it("trava o campo de nome e diz por quê", () => {
      abrir({ funcao: SISTEMA });

      expect(campoNome()).toBeDisabled();
      // O aviso aparece em dois lugares de propósito: na descrição do diálogo e colado
      // no campo travado — quem chega direto ao campo não precisa reler o cabeçalho.
      expect(
        screen.getByText("Função básica do sistema: o nome não pode ser alterado."),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Função básica do sistema - nome não pode ser alterado"),
      ).toBeInTheDocument();
    });

    it("deixa editar CBO e descrição — só o nome é intocável", async () => {
      // A trava é sobre a identidade da função, não sobre os metadados dela.
      const user = userEvent.setup();
      abrir({ funcao: SISTEMA });

      expect(screen.getByLabelText("CBO")).toBeEnabled();
      await user.clear(screen.getByLabelText("Descrição"));
      await user.type(screen.getByLabelText("Descrição"), "Coordena a unidade.");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            cargo_nome: "Coordenador Geral",
            cargo_descricao: "Coordena a unidade.",
          }),
        ),
      );
    });

    it("função comum NÃO é travada", () => {
      // A trava vem de `cargo_editavel === false`; qualquer outro valor libera.
      abrir({ funcao: FUNCAO });
      expect(campoNome()).toBeEnabled();
      expect(screen.queryByText(/nome não pode ser alterado/)).not.toBeInTheDocument();
    });
  });

  it("Cancelar fecha sem submeter", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
