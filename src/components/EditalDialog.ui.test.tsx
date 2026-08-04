import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditalDialog } from "@/components/EditalDialog";

/**
 * Testes de interação do EditalDialog (o contrato de validação isolado está em
 * EditalDialog.test.ts). Aqui interessa o comportamento que o usuário observa.
 *
 * O componente é puro em relação a dados: recebe `edital` e `onSubmit` por prop e
 * não fala com o Supabase — por isso não precisa de mock do client nem de providers.
 */
describe("EditalDialog (interação)", () => {
  const CABECALHO_1 = "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA";
  const CABECALHO_2 = "Departamento de Concurso e Implementação Tecnológica";

  let onSubmit: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSubmit = vi.fn();
    onOpenChange = vi.fn();
  });

  const abrir = (props: Partial<Parameters<typeof EditalDialog>[0]> = {}) =>
    render(
      <EditalDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />,
    );

  describe("modo criação", () => {
    it("anuncia-se como Novo Edital", () => {
      abrir();
      expect(screen.getByRole("heading", { name: "Novo Edital" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
    });

    it("já vem com os cabeçalhos da FEVRE preenchidos", () => {
      // Pré-preencher é o que evita que cada edital novo nasça com cabeçalho vazio
      // e acabe gerando PDF sem identificação da fundação.
      abrir();
      expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue(CABECALHO_1);
      expect(screen.getByLabelText("Linha 2 do Cabeçalho")).toHaveValue(CABECALHO_2);
      expect(screen.getByLabelText("Nome do Edital *")).toHaveValue("");
    });

    it("explica na tela que o cabeçalho é sugestão herdável, não regra", () => {
      // O texto é a única pista, para quem cadastra, de que a prova pode divergir.
      abrir();
      expect(
        screen.getByText(/Sugestão herdada ao cadastrar uma prova sob este edital/i),
      ).toBeInTheDocument();
    });

    it("bloqueia o envio sem nome e mostra a mensagem", async () => {
      const user = userEvent.setup();
      abrir();

      await user.click(screen.getByRole("button", { name: "Criar" }));

      expect(await screen.findByText("Nome do edital é obrigatório")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("envia o payload já convertido para o formato do banco", async () => {
      const user = userEvent.setup();
      abrir();

      await user.type(screen.getByLabelText("Nome do Edital *"), "  Edital 003/2026  ");
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      // 🔴 O objeto INTEIRO, não um `objectContaining`: desde 2026-08-02 o payload não
      // carrega `n_candidatos`, e é justamente a AUSÊNCIA que precisa ser afirmada.
      expect(onSubmit).toHaveBeenCalledWith({
        // O trim acontece aqui, não no schema — e a unicidade no banco é sobre
        // lower(btrim(nome)), então os dois precisam concordar.
        nome: "Edital 003/2026",
        cabecalho_linha1: CABECALHO_1,
        cabecalho_linha2: CABECALHO_2,
      });
    });

    it("🔴 não oferece campo de nº de candidatos — a contagem real é a fonte", () => {
      abrir();
      // O número de inscritos de um edital passou a ser `count(candidatos)` em toda tela
      // (02/08). Um input aqui aceitaria 200 num edital com 7.231 e não seria lido por
      // ninguém — perda silenciosa da intenção de quem digitou.
      expect(screen.queryByLabelText("Número de Candidatos")).not.toBeInTheDocument();
    });

    it("manda null quando os opcionais ficam em branco", async () => {
      const user = userEvent.setup();
      abrir();

      await user.type(screen.getByLabelText("Nome do Edital *"), "Edital 004/2026");
      await user.clear(screen.getByLabelText("Linha 1 do Cabeçalho"));
      await user.clear(screen.getByLabelText("Linha 2 do Cabeçalho"));
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith({
        nome: "Edital 004/2026",
        cabecalho_linha1: null,
        cabecalho_linha2: null,
      });
    });
  });

  describe("modo edição", () => {
    const EDITAL = {
      id: "e1",
      nome: "Edital 001/2026 SMA",
      cabecalho_linha1: "CABEÇALHO PERSONALIZADO",
      cabecalho_linha2: "Segunda linha",
      created_at: null,
      updated_at: null,
      created_by: null,
    };

    it("anuncia-se como Editar Edital e carrega os valores salvos", () => {
      abrir({ edital: EDITAL });

      expect(screen.getByRole("heading", { name: "Editar Edital" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
      expect(screen.getByLabelText("Nome do Edital *")).toHaveValue("Edital 001/2026 SMA");
      expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue("CABEÇALHO PERSONALIZADO");
    });

    it("NÃO reintroduz os defaults da FEVRE sobre um cabeçalho personalizado", () => {
      // O default só vale para edital novo. Se o reset em modo edição usasse o
      // mesmo objeto do modo criação, editar qualquer edital sobrescreveria o
      // cabeçalho customizado — e o estrago só apareceria no PDF.
      abrir({ edital: EDITAL });
      expect(screen.getByLabelText("Linha 1 do Cabeçalho")).not.toHaveValue(CABECALHO_1);
    });

    it("preserva o cabeçalho vazio de um edital salvo sem cabeçalho", () => {
      abrir({ edital: { ...EDITAL, cabecalho_linha1: null, cabecalho_linha2: null } });
      expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue("");
    });
  });

  describe("estados de controle", () => {
    it("desabilita o botão enquanto salva e troca o rótulo", () => {
      abrir({ isLoading: true });
      const botao = screen.getByRole("button", { name: "Salvando..." });
      expect(botao).toBeDisabled();
    });

    it("fecha pelo Cancelar sem enviar nada", async () => {
      const user = userEvent.setup();
      abrir();

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
