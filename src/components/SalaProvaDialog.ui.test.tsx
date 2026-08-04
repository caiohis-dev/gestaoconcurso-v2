import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { SalaProvaDialog } from "@/components/SalaProvaDialog";

/**
 * Interação do SalaProvaDialog. Os schemas isolados estão em `SalaProvaDialog.test.ts`;
 * aqui interessa o que só a tela mostra.
 *
 * 🔴 **O teto de andar por unidade NÃO EXISTE MAIS (2026-08-03).** Este cabeçalho dizia
 * que ele era "a única barreira que existe para essa regra", montada aqui porque um CHECK
 * não conseguia expressar regra entre tabelas. A regra inteira foi abolida: `unid_andares`
 * saiu do banco, e criar sala em qualquer andar passou a ser legítimo. O que restou é
 * `ANDAR_MAXIMO`, limite de formato da numeração.
 *
 * 🔵 **Reescrito em 2026-08-03**, quando o lote passou a receber uma FAIXA de andares
 * (`De`/`Até`, com `quantidade` por andar). Três casos deste arquivo afirmavam o campo
 * único — estavam certos sobre o código de ontem.
 *
 * 🔴 **A mudança mais importante não é a faixa, é a MENSAGEM.** Os `min`/`max` nativos
 * saíram dos inputs: com eles, o navegador barrava o submit com um balão no idioma dele e
 * a mensagem em português do schema **nunca aparecia** (armadilha 7). Nas 7 unidades
 * cadastradas com 1 andar, isso fazia o campo parecer morto — digitar 2 e clicar em Criar
 * não produzia reação visível nenhuma. Os casos abaixo afirmam a mensagem *e* que a
 * validação nativa não está mais no caminho.
 *
 * ⚠️ Usa `renderWithProviders` (e não `render` cru) por herança do dia 03/08, quando o
 * formulário tinha um `<Link>` para `/unidades-prova` explicando o teto. O link saiu com o
 * teto; o helper fica, porque é o padrão da casa e não custa nada.
 */
describe("SalaProvaDialog (interação)", () => {
  const SALA = {
    id: "s-1",
    sala_fk_unidade: "u-1",
    sala_numero: 101,
    sala_descricao: "Sala de Informática",
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
    renderWithProviders(
      <SalaProvaDialog
        open
        onOpenChange={onOpenChange}
        sala={null}
        onSubmit={onSubmit}
        isLoading={false}
        numerosExistentes={[]}
        {...props}
      />,
    );

  async function preencher(user: ReturnType<typeof userEvent.setup>, label: string, valor: string) {
    const campo = screen.getByLabelText(label);
    await user.clear(campo);
    await user.type(campo, valor);
  }

  /** Preenche o lote inteiro — os quatro campos, na ordem do formulário. */
  async function preencherLote(
    user: ReturnType<typeof userEvent.setup>,
    { quantidade = "1", capacidade = "30", de = "1", ate = "1" } = {},
  ) {
    await preencher(user, "Salas por Andar *", quantidade);
    await preencher(user, "Capacidade *", capacidade);
    await preencher(user, "Do andar *", de);
    await preencher(user, "Até o andar *", ate);
  }

  describe("modo criação (lote em faixa de andares)", () => {
    it("anuncia-se como novas salas e pede a faixa de andares", () => {
      abrir();

      expect(screen.getByRole("heading", { name: "Novas Salas" })).toBeInTheDocument();
      expect(screen.getByLabelText("Do andar *")).toBeInTheDocument();
      expect(screen.getByLabelText("Até o andar *")).toBeInTheDocument();
    });

    it("🔵 submete a faixa: quantidade é POR ANDAR", async () => {
      const user = userEvent.setup();
      abrir();

      await preencherLote(user, { quantidade: "5", capacidade: "30", de: "1", ate: "3" });
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          quantidade: 5,
          sala_capacidade: 30,
          andar_de: 1,
          andar_ate: 3,
        }),
      );
    });

    it("⭐ dá para atender UM andar específico (De 2 Até 2)", async () => {
      // O caso que se perderia se o campo virasse "quantidade de andares a partir do 1º".
      const user = userEvent.setup();
      abrir();

      await preencherLote(user, { quantidade: "4", de: "2", ate: "2" });
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ andar_de: 2, andar_ate: 2 }),
        ),
      );
    });

    describe("🔴 as recusas agora FALAM (o campo não fica mudo)", () => {
      it("andar acima do limite de FORMATO: mensagem do app, não balão do navegador", async () => {
        // ⚠️ Até 03/08 este caso media o teto por unidade (`maxAndares`). Ele sobrevive
        // porque o que ele guarda de verdade é outra coisa: que a recusa **fala**. Os
        // `min`/`max` nativos saíram dos inputs justamente para isso.
        const user = userEvent.setup();
        abrir();

        await preencherLote(user, { ate: "150" });
        await user.click(screen.getByRole("button", { name: "Criar" }));

        expect(await screen.findByText("O andar vai até 99")).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
        // A prova de que quem barrou foi o Zod: o input não tem `max` nativo, então o
        // navegador não tinha o que reclamar.
        const campo = screen.getByLabelText("Até o andar *") as HTMLInputElement;
        expect(campo.validity.rangeOverflow).toBe(false);
      });

      it("faixa invertida diz o que está errado", async () => {
        const user = userEvent.setup();
        abrir();

        await preencherLote(user, { de: "3", ate: "2" });
        await user.click(screen.getByRole("button", { name: "Criar" }));

        expect(
          await screen.findByText("O andar final não pode ser menor que o inicial"),
        ).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("lote acima de 50 por andar: mensagem do Zod, que antes era inalcançável", async () => {
        // Teto de sanidade: um zero a mais criaria 500 linhas sem querer. Este caso
        // afirmava `validity.rangeOverflow` — a validação nativa — até 03/08.
        const user = userEvent.setup();
        abrir();

        await preencherLote(user, { quantidade: "51" });
        await user.click(screen.getByRole("button", { name: "Criar" }));

        expect(await screen.findByText("Máximo 50 salas por andar")).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
      });

      it("recusa capacidade zero", async () => {
        // Sala com 0 lugares não recebe candidato — seria linha inútil na distribuição.
        const user = userEvent.setup();
        abrir();

        await preencherLote(user, { capacidade: "0" });
        await user.click(screen.getByRole("button", { name: "Criar" }));

        expect(await screen.findByText("Capacidade deve ser positiva")).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    describe("🔵 a prévia dos números", () => {
      it("mostra o total e a faixa de cada andar", async () => {
        // Sem ela, "30 salas" não diz quais: o esquema `andar × 100 + sequência` não é
        // adivinhável por quem só usa a tela.
        const user = userEvent.setup();
        abrir();

        await preencherLote(user, { quantidade: "10", de: "1", ate: "3" });

        expect(await screen.findByText("101–110, 201–210, 301–310")).toBeInTheDocument();
        expect(screen.getByText(/Serão criadas/)).toHaveTextContent("30");
      });

      it("⭐ continua de onde a numeração parou, não do 1", async () => {
        // O fixture tem o andar 1 até 105 e o andar 2 vazio: se a prévia ignorasse o que
        // existe, ela prometeria 101 e o banco entregaria 106.
        const user = userEvent.setup();
        abrir({ numerosExistentes: [101, 102, 103, 104, 105] });

        await preencherLote(user, { quantidade: "2", de: "1", ate: "2" });

        expect(await screen.findByText("106–107, 201–202")).toBeInTheDocument();
      });

      it("🔴 avisa do estouro de 99 salas ANTES de tentar criar", async () => {
        const user = userEvent.setup();
        abrir({ numerosExistentes: [196] });

        await preencherLote(user, { quantidade: "5", de: "1", ate: "1" });

        expect(await screen.findByText(/cabem mais 3, não 5/)).toBeInTheDocument();
      });
    });

    /**
     * 🔴 **O bloco "o teto vem do cadastro da unidade" saiu em 2026-08-03**, junto com a
     * coluna `unid_andares`. Eram 3 casos: a unidade de 1 andar explicando e apontando
     * para `/unidades-prova`, o par positivo com 4 andares, e o `maxAndares: 0` que não
     * podia travar o formulário. **Todos afirmavam corretamente um teto que não existe
     * mais** — e os dois primeiros guardavam a MENSAGEM que existia só para explicar o
     * teto. Sem teto, não há o que explicar.
     */
    describe("🔵 sem teto por unidade (2026-08-03)", () => {
      it("⭐ o andar 9 passa — era o caso que a unidade de 1 andar recusava", async () => {
        const user = userEvent.setup();
        abrir();

        await preencherLote(user, { quantidade: "2", de: "9", ate: "9" });
        await user.click(screen.getByRole("button", { name: "Criar" }));

        await waitFor(() =>
          expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ andar_de: 9, andar_ate: 9 }),
          ),
        );
      });

      it("⭐ CONTROLE POSITIVO: a explicação do teto sumiu da tela", async () => {
        // Se ela reaparecer, é sinal de que alguém restaurou o vínculo com o cadastro da
        // unidade — que é o que este tema existiu para desfazer.
        abrir();

        expect(screen.queryByText(/ajuste o número de andares em/)).not.toBeInTheDocument();
        expect(screen.queryByText(/cadastrada com/)).not.toBeInTheDocument();
        expect(
          screen.queryByRole("link", { name: "Unidades de Prova" }),
        ).not.toBeInTheDocument();
      });

      it("a prévia numera o andar alto pelo mesmo esquema", async () => {
        const user = userEvent.setup();
        abrir();

        await preencherLote(user, { quantidade: "3", de: "12", ate: "12" });

        expect(await screen.findByText("1201–1203")).toBeInTheDocument();
      });
    });

    it("🔵 reabrir o formulário limpa o que foi digitado", async () => {
      // Até 03/08 o efeito só rodava quando `sala` mudava: criar → fechar → abrir
      // mantinha os valores, enquanto vir da edição resetava. Duas portas, dois
      // comportamentos.
      const user = userEvent.setup();
      const { rerender } = abrir();
      await preencher(user, "Salas por Andar *", "42");

      const props = {
        onOpenChange,
        sala: null,
        onSubmit,
        isLoading: false,
        numerosExistentes: [],
      };
      rerender(<SalaProvaDialog open={false} {...props} />);
      rerender(<SalaProvaDialog open {...props} />);

      await waitFor(() => expect(screen.getByLabelText("Salas por Andar *")).toHaveValue(1));
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

    it("🔴 APAGAR o andar manda `null`, não `undefined`", async () => {
      // O defeito que este caso guarda: `undefined` some no `JSON.stringify`, o PATCH sai
      // sem a coluna, o toast diz "Sala atualizada" e o andar continua no banco. Apagar
      // parecia funcionar e não fazia nada.
      const user = userEvent.setup();
      abrir({ sala: SALA });

      await user.clear(screen.getByLabelText("Andar"));
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].sala_andar).toBeNull();
    });

    it("🔴 sala acima do teto da unidade continua editável", async () => {
      // Baixar `unid_andares` para 1 numa unidade que tem sala no andar 2 travava aquela
      // sala INTEIRA: nem a capacidade dava para corrigir, porque o formulário recusava
      // um valor que já estava no banco. Corrigir o cadastro da unidade é outro assunto.
      const user = userEvent.setup();
      abrir({ sala: { ...SALA, sala_andar: 2 } });

      await preencher(user, "Capacidade *", "45");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ sala_capacidade: 45, sala_andar: 2 });
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
          numerosExistentes={[]}
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
