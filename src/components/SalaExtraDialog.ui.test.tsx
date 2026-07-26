import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SalaExtraDialog } from "@/components/SalaExtraDialog";

/**
 * Interação do SalaExtraDialog — a sala avulsa acrescentada a uma prova já montada
 * (quando a demanda estourou a distribuição prevista).
 *
 * É o único dos diálogos de sala **sem schema Zod**: valida à mão, no `handleSubmit`. Das
 * três checagens escritas ali, só **uma é alcançável pela tela** — a de número duplicado.
 * As outras duas ("valor positivo", "capacidade válida") são precedidas pelo `required` e
 * pelo `min` nativos do input, que impedem o submit antes. Não é código morto: protege
 * quem chamar `handleSubmit` por outro caminho. Mas é a duplicata que trabalha de fato.
 *
 * Outra diferença que vale saber: aqui `sala_andar` é **texto** ("pode conter letras ou
 * números" — "Térreo", "A"), enquanto em `sala_prova` é número. Não misture os dois.
 */
describe("SalaExtraDialog (interação)", () => {
  let onSubmit: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSubmit = vi.fn();
    onOpenChange = vi.fn();
  });

  const abrir = (props: Partial<Parameters<typeof SalaExtraDialog>[0]> = {}) =>
    render(
      <SalaExtraDialog
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        existingNumeros={[101, 102]}
        {...props}
      />,
    );

  async function preencher(
    user: ReturnType<typeof userEvent.setup>,
    { numero = "", descricao = "", andar = "", capacidade = "" } = {},
  ) {
    if (numero) await user.type(screen.getByLabelText("Número da Sala *"), numero);
    if (descricao) await user.type(screen.getByLabelText("Descrição"), descricao);
    if (andar) await user.type(screen.getByLabelText("Andar"), andar);
    if (capacidade) await user.type(screen.getByLabelText("Capacidade *"), capacidade);
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
  }

  describe("a checagem que trabalha: número duplicado", () => {
    it("recusa número que já existe na unidade, sem submeter", async () => {
      const user = userEvent.setup();
      abrir({ existingNumeros: [101, 102] });
      await preencher(user, { numero: "101", capacidade: "30" });

      expect(
        await screen.findByText("Este número de sala já existe nesta unidade"),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("aceita número livre, mesmo próximo dos existentes", async () => {
      const user = userEvent.setup();
      abrir({ existingNumeros: [101, 102] });
      await preencher(user, { numero: "103", capacidade: "30" });

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ sala_numero: 103, sala_capacidade: 30 }),
      );
    });

    it("corrigir o número depois do erro limpa a mensagem e passa", async () => {
      const user = userEvent.setup();
      abrir({ existingNumeros: [101] });
      await preencher(user, { numero: "101", capacidade: "30" });
      await screen.findByText("Este número de sala já existe nesta unidade");

      await user.clear(screen.getByLabelText("Número da Sala *"));
      await user.type(screen.getByLabelText("Número da Sala *"), "105");
      await user.click(screen.getByRole("button", { name: "Adicionar" }));

      expect(
        screen.queryByText("Este número de sala já existe nesta unidade"),
      ).not.toBeInTheDocument();
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sala_numero: 105 }));
    });
  });

  describe("o que é enviado", () => {
    it("campos opcionais vazios viram null, não string vazia", async () => {
      // A coluna aceita NULL; gravar "" faria a tela mostrar um andar em branco em vez
      // de nada, e atrapalharia qualquer contagem por andar.
      const user = userEvent.setup();
      abrir();
      await preencher(user, { numero: "201", capacidade: "25" });

      expect(onSubmit).toHaveBeenCalledWith({
        sala_numero: 201,
        sala_descricao: null,
        sala_andar: null,
        sala_capacidade: 25,
      });
    });

    it("apara os espaços de descrição e andar", async () => {
      const user = userEvent.setup();
      abrir();
      await preencher(user, {
        numero: "202",
        descricao: "  Laboratório  ",
        andar: "  Térreo  ",
        capacidade: "20",
      });

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ sala_descricao: "Laboratório", sala_andar: "Térreo" }),
      );
    });

    it("o andar aceita texto, não só número", async () => {
      // É o que o próprio diálogo promete na descrição — e o que diferencia esta sala
      // da `sala_prova`, cujo andar é numérico.
      const user = userEvent.setup();
      abrir();
      await preencher(user, { numero: "203", andar: "Anexo B", capacidade: "15" });

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sala_andar: "Anexo B" }));
    });

    it("capacidade zero é aceita", async () => {
      // A validação recusa só negativo (`< 0`). Sala com 0 lugares é estranha, mas o
      // diálogo permite — registrado para quem for endurecer isso um dia.
      const user = userEvent.setup();
      abrir();
      await preencher(user, { numero: "204", capacidade: "0" });

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sala_capacidade: 0 }));
    });
  });

  describe("fechar", () => {
    it("Cancelar zera o formulário e fecha", async () => {
      const user = userEvent.setup();
      abrir();
      await user.type(screen.getByLabelText("Número da Sala *"), "301");
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSubmit).not.toHaveBeenCalled();
      // O reset é do próprio diálogo (`handleOpenChange`), não do pai: reabrir não pode
      // trazer o número da tentativa anterior.
      expect(screen.getByLabelText("Número da Sala *")).toHaveValue(null);
    });

    it("durante o salvamento avisa e trava os botões", () => {
      abrir({ isLoading: true });
      expect(screen.getByRole("button", { name: /Adicionando/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    });
  });
});
