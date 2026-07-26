import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SalaProvaDialog } from "@/components/SalaProvaDialog";

/**
 * Interação do SalaProvaDialog. Os schemas isolados estão em `SalaProvaDialog.test.ts`;
 * aqui interessa o que só a tela mostra — e uma coisa em especial:
 *
 * **O teto de andar é a única barreira que existe para essa regra.** `sala_andar` não
 * pode passar do `unid_andares` da unidade, e isso é regra ENTRE TABELAS: a migration
 * dos CHECKs deixou de fora de propósito, porque um `CHECK` com função consultando outra
 * tabela **não é reavaliado** quando aquela tabela muda — passaria a mentir em silêncio.
 * Então o limite vive aqui, montado dinamicamente a partir de `maxAndares`.
 *
 * O componente é puro: recebe `sala`, `maxAndares` e `onSubmit` por prop.
 */
describe("SalaProvaDialog (interação)", () => {
  const SALA = {
    id: "s-1",
    sala_fk_unidade: "u-1",
    sala_numero: 101,
    sala_descricao: "Sala de Informática",
    sala_arcondicionado: true,
    sala_capacidade: 30,
    sala_andar: 1,
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

  const abrir = (props: Partial<Parameters<typeof SalaProvaDialog>[0]> = {}) =>
    render(
      <SalaProvaDialog
        open
        onOpenChange={onOpenChange}
        sala={null}
        onSubmit={onSubmit}
        isLoading={false}
        maxAndares={3}
        {...props}
      />,
    );

  async function preencher(user: ReturnType<typeof userEvent.setup>, label: string, valor: string) {
    const campo = screen.getByLabelText(label);
    await user.clear(campo);
    await user.type(campo, valor);
  }

  describe("modo criação (lote)", () => {
    it("anuncia-se como novas salas e mostra o intervalo de andares permitido", () => {
      // O rótulo carrega o limite — é onde o usuário descobre o teto antes de errar.
      abrir({ maxAndares: 3 });
      expect(screen.getByRole("heading", { name: "Novas Salas" })).toBeInTheDocument();
      expect(screen.getByLabelText("Andar * (1-3)")).toBeInTheDocument();
    });

    it("submete quantidade, capacidade e andar", async () => {
      const user = userEvent.setup();
      abrir();
      await preencher(user, "Quantidade de Salas *", "5");
      await preencher(user, "Andar * (1-3)", "2");
      await preencher(user, "Capacidade *", "30");
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          quantidade: 5,
          sala_capacidade: 30,
          sala_andar: 2,
        }),
      );
    });

    it("recusa andar acima do que a unidade tem", async () => {
      // A asserção central do arquivo: sem esta checagem, nada impede uma sala no 5º
      // andar de um prédio de 3 — nem o banco, que não expressa a regra.
      const user = userEvent.setup();
      abrir({ maxAndares: 3 });
      await preencher(user, "Quantidade de Salas *", "1");
      await preencher(user, "Capacidade *", "30");
      await preencher(user, "Andar * (1-3)", "9");
      await user.click(screen.getByRole("button", { name: "Criar" }));

      // O `max` nativo do input barra antes do Zod (há <form> com submit), então o que
      // se afirma é o essencial: não passa.
      expect(onSubmit).not.toHaveBeenCalled();
      const campo = screen.getByLabelText("Andar * (1-3)") as HTMLInputElement;
      expect(campo.validity.rangeOverflow).toBe(true);
    });

    it("o limite acompanha a unidade — outra unidade, outro teto", async () => {
      // O schema é montado a partir de `maxAndares`; não é constante.
      abrir({ maxAndares: 12 });
      expect(screen.getByLabelText("Andar * (12)".replace("(12)", "(1-12)"))).toBeInTheDocument();
    });

    it("unidade com andares zerado não trava o formulário em 0", () => {
      // `safeMaxAndares` protege: dado ruim viraria um campo impossível de preencher.
      abrir({ maxAndares: 0 });
      expect(screen.getByLabelText("Andar * (1-1)")).toBeInTheDocument();
    });

    it("recusa capacidade zero", async () => {
      // Sala com 0 lugares não recebe candidato — seria linha inútil na distribuição.
      const user = userEvent.setup();
      abrir();
      await preencher(user, "Quantidade de Salas *", "1");
      await preencher(user, "Andar * (1-3)", "1");
      await preencher(user, "Capacidade *", "0");
      await user.click(screen.getByRole("button", { name: "Criar" }));

      expect(await screen.findByText("Capacidade deve ser positiva")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("recusa lote acima de 50 salas", async () => {
      // Teto de sanidade: um zero a mais no campo criaria 500 linhas sem querer.
      // Como o input tem `max={50}` e há <form> com submit, quem barra é a validação
      // NATIVA — o "Máximo 50 salas" do Zod é a segunda linha de defesa, não a primeira.
      const user = userEvent.setup();
      abrir();
      await preencher(user, "Quantidade de Salas *", "51");
      await preencher(user, "Andar * (1-3)", "1");
      await preencher(user, "Capacidade *", "30");
      await user.click(screen.getByRole("button", { name: "Criar" }));

      expect(onSubmit).not.toHaveBeenCalled();
      const campo = screen.getByLabelText("Quantidade de Salas *") as HTMLInputElement;
      expect(campo.validity.rangeOverflow).toBe(true);
    });
  });

  describe("modo edição", () => {
    it("anuncia-se como edição e preenche com a sala", () => {
      abrir({ sala: SALA });

      expect(screen.getByRole("heading", { name: "Editar Sala" })).toBeInTheDocument();
      expect(screen.getByLabelText("Número *")).toHaveValue(101);
      expect(screen.getByLabelText("Capacidade *")).toHaveValue(30);
      expect(screen.getByLabelText("Descrição")).toHaveValue("Sala de Informática");
    });

    it("descrição e andar nulos viram vazio, não 'null'", () => {
      abrir({ sala: { ...SALA, sala_descricao: null, sala_andar: null } });

      expect(screen.getByLabelText("Descrição")).toHaveValue("");
      expect(screen.getByLabelText("Andar")).toHaveValue(null);
    });

    it("na edição o andar é opcional — sala sem andar continua salvável", async () => {
      // Diferente da criação, em que o andar é obrigatório: aqui há salas antigas
      // cadastradas sem andar, e exigir o campo travaria a edição delas.
      const user = userEvent.setup();
      abrir({ sala: { ...SALA, sala_andar: null } });
      await preencher(user, "Capacidade *", "40");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ sala_capacidade: 40 });
    });

    it("trocar de sala sem fechar repreenche o formulário", async () => {
      const { rerender } = abrir({ sala: SALA });
      expect(screen.getByLabelText("Número *")).toHaveValue(101);

      rerender(
        <SalaProvaDialog
          open
          onOpenChange={onOpenChange}
          sala={{ ...SALA, id: "s-2", sala_numero: 202, sala_capacidade: 25 }}
          onSubmit={onSubmit}
          isLoading={false}
          maxAndares={3}
        />,
      );

      await waitFor(() => expect(screen.getByLabelText("Número *")).toHaveValue(202));
      expect(screen.getByLabelText("Capacidade *")).toHaveValue(25);
    });
  });

  it("durante o salvamento trava o botão", () => {
    abrir({ isLoading: true });
    expect(screen.getByRole("button", { name: /Criar/ })).toBeDisabled();
  });
});
