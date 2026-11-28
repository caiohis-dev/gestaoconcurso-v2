import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Testes de interação do ValoresFuncaoProvaDialog — metade do **caminho do dinheiro**.
 * Aqui se define quanto cada função recebe naquela prova; a outra metade é o
 * `MetaColaboradoresDialog`, que só oferece as funções que passaram por aqui.
 *
 * Os hooks são mockados: `useValoresFuncaoProva` e `useFuncoesColaboradores` têm teste
 * próprio, e re-testá-los por fora travaria os dois lados. O que se cobre aqui é o que
 * só existe no diálogo — quais funções ele oferece, o que manda ao salvar, e a edição
 * embutida na tabela.
 */
const valoresHook = vi.hoisted(() => ({ atual: null as unknown }));
const funcoesHook = vi.hoisted(() => ({ atual: null as unknown }));
/** A checagem de metas que roda ANTES da confirmação (testada no hook). */
const buscarMetas = vi.hoisted(() => vi.fn());

/** O diálogo usa `sonner` direto para recusar valor inválido antes de chamar o hook. */
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/hooks/useValoresFuncaoProva", () => ({
  useValoresFuncaoProva: () => valoresHook.atual,
  buscarMetasQueImpedemRemocao: buscarMetas,
}));
vi.mock("@/hooks/useFuncoesColaboradores", () => ({
  useFuncoesColaboradores: () => funcoesHook.atual,
}));

import { ValoresFuncaoProvaDialog } from "@/components/ValoresFuncaoProvaDialog";

const FISCAL = { id: "f-fiscal", cargo_nome: "Fiscal de Sala" };
const PORTEIRO = { id: "f-porteiro", cargo_nome: "Porteiro" };

/** Uma linha de `valores_funcao_prova`, com o join que a tabela exibe. */
function valor(over: Record<string, unknown> = {}) {
  return {
    id: "v-1",
    funcao_id: FISCAL.id,
    valor_pagamento: 150.5,
    funcoes_colaboradores: { id: FISCAL.id, cargo_nome: FISCAL.cargo_nome },
    ...over,
  };
}

describe("ValoresFuncaoProvaDialog (interação)", () => {
  let upsertValor: ReturnType<typeof vi.fn>;
  let deleteValor: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  function comHooks(
    valores: Record<string, unknown> = {},
    funcoesOver: Record<string, unknown> = {},
  ) {
    valoresHook.atual = {
      valoresFuncao: [],
      isLoading: false,
      upsertValor,
      deleteValor,
      isUpdating: false,
      ...valores,
    };
    funcoesHook.atual = {
      funcoes: [FISCAL, PORTEIRO],
      isLoading: false,
      ...funcoesOver,
    };
  }

  beforeEach(() => {
    toastMock.error.mockClear();
    toastMock.success.mockClear();
    upsertValor = vi.fn();
    deleteValor = vi.fn();
    onOpenChange = vi.fn();
    buscarMetas.mockReset();
    buscarMetas.mockResolvedValue([]);
    comHooks();
  });

  const abrir = () =>
    render(
      <ValoresFuncaoProvaDialog
        open
        onOpenChange={onOpenChange}
        provaId="prova-1"
        provaEdital="  Edital 01/2026  "
      />,
    );

  const campoValor = () => screen.getByPlaceholderText("Valor R$");
  const botaoAdicionar = () => screen.getByRole("button", { name: "" });

  async function escolherFuncao(user: ReturnType<typeof userEvent.setup>, nome: RegExp) {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: nome }));
  }

  describe("quais funções o diálogo oferece", () => {
    it("oferece só função que AINDA NÃO tem valor nesta prova", async () => {
      // A adição é para função nova; mudar valor existente se faz na tabela, embutido.
      comHooks({ valoresFuncao: [valor()] });
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("combobox"));

      expect(await screen.findByRole("option", { name: "Porteiro" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Fiscal de Sala" })).not.toBeInTheDocument();
    });

    it("quando todas já têm valor, avisa e desabilita o seletor", () => {
      comHooks({
        valoresFuncao: [valor(), valor({ id: "v-2", funcao_id: PORTEIRO.id })],
      });
      abrir();

      expect(screen.getByRole("combobox")).toBeDisabled();
      expect(screen.getByText("Todas as funções já têm valor definido")).toBeInTheDocument();
    });

    it("diz que não há valor definido quando a prova está vazia", () => {
      abrir();
      expect(screen.getByText("Nenhum valor definido para esta prova.")).toBeInTheDocument();
    });

    it("não afirma lista vazia enquanto carrega", () => {
      // "Nenhum valor definido" durante o carregamento seria mentira — e é o padrão
      // "vazio enquanto carrega" que já rendeu defeito neste repo.
      comHooks({ isLoading: true });
      abrir();

      expect(screen.queryByText("Nenhum valor definido para esta prova.")).not.toBeInTheDocument();
    });
  });

  describe("adicionar valor", () => {
    it("exige função E valor antes de habilitar o botão", async () => {
      const user = userEvent.setup();
      abrir();
      expect(botaoAdicionar()).toBeDisabled();

      await escolherFuncao(user, /Fiscal de Sala/);
      expect(botaoAdicionar()).toBeDisabled();

      await user.type(campoValor(), "150");
      expect(botaoAdicionar()).toBeEnabled();
    });

    it("manda a função escolhida e o valor como número", async () => {
      const user = userEvent.setup();
      abrir();
      await escolherFuncao(user, /Fiscal de Sala/);
      await user.type(campoValor(), "150.50");
      await user.click(botaoAdicionar());

      expect(upsertValor).toHaveBeenCalledWith({
        funcaoId: FISCAL.id,
        valorPagamento: 150.5,
      });
    });

    it("limpa o formulário depois de mandar", async () => {
      const user = userEvent.setup();
      abrir();
      await escolherFuncao(user, /Fiscal de Sala/);
      await user.type(campoValor(), "150");
      await user.click(botaoAdicionar());

      expect(campoValor()).toHaveValue(null);
    });

    it("RECUSA valor negativo, sem mandar nada ao servidor", async () => {
      // REGRESSÃO. Até 2026-07-26 o -150 passava: o `min="0"` do input só vale para a
      // validação NATIVA do navegador, que exige submit de <form>, e aqui não há form —
      // o clique chama `handleAdd` direto. O banco também não tinha CHECK. Hoje há os
      // dois: constraint `chk_valor_pagamento_nao_negativo` e esta recusa no cliente.
      //
      // Recusa, e não saturação: virar 150 seria adivinhar a intenção, e virar 0 seria
      // pior, porque 0 é valor VÁLIDO (função não remunerada).
      const user = userEvent.setup();
      abrir();
      await escolherFuncao(user, /Fiscal de Sala/);
      await user.type(campoValor(), "-150");
      await user.click(botaoAdicionar());

      expect(upsertValor).not.toHaveBeenCalled();
      expect(toastMock.error).toHaveBeenCalledWith(
        "O valor de pagamento não pode ser negativo.",
      );
    });

    it("preserva o preenchimento quando recusa, para permitir corrigir", async () => {
      const user = userEvent.setup();
      abrir();
      await escolherFuncao(user, /Fiscal de Sala/);
      await user.type(campoValor(), "-150");
      await user.click(botaoAdicionar());

      expect(campoValor()).toHaveValue(-150);
    });

    it("aceita zero, que é valor válido (função não remunerada)", async () => {
      const user = userEvent.setup();
      abrir();
      await escolherFuncao(user, /Fiscal de Sala/);
      await user.type(campoValor(), "0");
      await user.click(botaoAdicionar());

      expect(upsertValor).toHaveBeenCalledWith({ funcaoId: FISCAL.id, valorPagamento: 0 });
    });

    it("também recusa negativo na edição embutida", async () => {
      comHooks({ valoresFuncao: [valor()] });
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByText(/R\$\s?150,50/));
      const inputs = screen.getAllByRole("spinbutton");
      await user.clear(inputs[1]);
      await user.type(inputs[1], "-9");
      const linha = screen.getByText("Fiscal de Sala").closest("tr")!;
      await user.click(within(linha).getAllByRole("button")[0]);

      expect(upsertValor).not.toHaveBeenCalled();
      expect(toastMock.error).toHaveBeenCalledWith(
        "O valor de pagamento não pode ser negativo.",
      );
    });
  });

  describe("a tabela de valores", () => {
    it("mostra o valor em real, formatado", () => {
      comHooks({ valoresFuncao: [valor()] });
      abrir();
      // `Intl` usa espaço não separável entre "R$" e o número — daí o regex.
      expect(screen.getByText(/R\$\s?150,50/)).toBeInTheDocument();
    });

    it("clicar no valor abre a edição embutida, já preenchida", async () => {
      comHooks({ valoresFuncao: [valor()] });
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByText(/R\$\s?150,50/));

      // Dois campos numéricos passam a existir: o de adicionar e o da linha em edição.
      const inputs = screen.getAllByRole("spinbutton");
      expect(inputs).toHaveLength(2);
      expect(inputs[1]).toHaveValue(150.5);
    });

    it("salvar a edição manda o funcao_id, não o id da linha", async () => {
      // Erro fácil de cometer aqui: `upsertValor` casa por FUNÇÃO (onConflict em
      // prova+função). Mandar `valor.id` criaria linha nova em vez de atualizar.
      comHooks({ valoresFuncao: [valor()] });
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByText(/R\$\s?150,50/));
      const inputs = screen.getAllByRole("spinbutton");
      await user.clear(inputs[1]);
      await user.type(inputs[1], "200");
      const linha = screen.getByText("Fiscal de Sala").closest("tr")!;
      await user.click(within(linha).getAllByRole("button")[0]);

      expect(upsertValor).toHaveBeenCalledWith({
        funcaoId: FISCAL.id,
        valorPagamento: 200,
      });
    });

    describe("excluir valor pede confirmação", () => {
      // REGRESSÃO. Até 2026-07-26 um clique na lixeira apagava direto o dado de
      // pagamento. Ficou em AlertDialog simples, e não no PasswordConfirmDialog, porque
      // só se remove valor de prova aberta (a finalizada o banco recusa, PF001).
      async function clicarLixeira(user: ReturnType<typeof userEvent.setup>) {
        comHooks({ valoresFuncao: [valor()] });
        abrir();
        const linha = screen.getByText("Fiscal de Sala").closest("tr")!;
        const botoes = within(linha).getAllByRole("button");
        await user.click(botoes[botoes.length - 1]);
        return screen.findByRole("alertdialog");
      }

      it("abre a confirmação em vez de apagar", async () => {
        const user = userEvent.setup();
        const confirmacao = await clicarLixeira(user);

        expect(deleteValor).not.toHaveBeenCalled();
        expect(within(confirmacao).getByText("Remover valor da função")).toBeInTheDocument();
        // O texto tem de dizer as duas consequências: quem já está alocado fica sem valor
        // (o DAF e o recibo leem o valor AO VIVO) e a função deixa de aceitar meta.
        // 🔵 Até 2026-11-27 esta asserção exigia "a alocação já feita não muda" — o teste
        // guardava como certa uma promessa falsa (armadilha 8): o valor nunca foi congelado.
        expect(within(confirmacao).getByText(/já está alocado nesta função fica sem valor/)).toBeInTheDocument();
        expect(within(confirmacao).queryByText(/alocação já feita não muda/)).not.toBeInTheDocument();
        expect(within(confirmacao).getByText(/deixa de aceitar meta/)).toBeInTheDocument();
      });

      it("nomeia a função que será removida", async () => {
        const user = userEvent.setup();
        const confirmacao = await clicarLixeira(user);
        expect(within(confirmacao).getByText(/"Fiscal de Sala"/)).toBeInTheDocument();
      });

      it("confirmar apaga pelo id da linha", async () => {
        const user = userEvent.setup();
        const confirmacao = await clicarLixeira(user);
        await user.click(within(confirmacao).getByRole("button", { name: "Remover" }));

        expect(deleteValor).toHaveBeenCalledWith("v-1", expect.any(Function));
      });

      it("cancelar não apaga nada", async () => {
        const user = userEvent.setup();
        const confirmacao = await clicarLixeira(user);
        await user.click(within(confirmacao).getByRole("button", { name: "Cancelar" }));

        expect(deleteValor).not.toHaveBeenCalled();
      });

      it("confere as metas da função NESTA prova antes de abrir", async () => {
        const user = userEvent.setup();
        await clicarLixeira(user);
        expect(buscarMetas).toHaveBeenCalledWith("prova-1", FISCAL.id);
      });
    });

    // REGRESSÃO (2026-11-27). Com meta > 0, a confirmação abria, a pessoa clicava
    // "Remover", e SÓ ENTÃO um toast dizia que não podia. Agora o impedimento vem
    // antes, e em popup — a confirmação de algo impossível nem chega a aparecer.
    describe("com meta cadastrada, bloqueia ANTES da confirmação", () => {
      const METAS = [
        { unidade: "CEF 01 — Escola A", quantidade: 12 },
        { unidade: "EM 02 — Escola B", quantidade: 1 },
      ];

      async function clicarLixeiraComMetas(user: ReturnType<typeof userEvent.setup>) {
        buscarMetas.mockResolvedValue(METAS);
        comHooks({ valoresFuncao: [valor()] });
        abrir();
        await user.click(screen.getByRole("button", { name: "Remover valor" }));
        return screen.findByRole("alertdialog");
      }

      it("abre o popup de bloqueio, não a confirmação", async () => {
        const user = userEvent.setup();
        const popup = await clicarLixeiraComMetas(user);

        expect(within(popup).getByText("Não é possível remover o valor")).toBeInTheDocument();
        expect(within(popup).queryByText("Remover valor da função")).not.toBeInTheDocument();
        expect(within(popup).queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
        expect(toastMock.error).not.toHaveBeenCalled();
        expect(deleteValor).not.toHaveBeenCalled();
      });

      it("diz o que fazer e onde: nomeia a função e lista as unidades com a meta", async () => {
        const user = userEvent.setup();
        const popup = await clicarLixeiraComMetas(user);

        expect(within(popup).getByText(/"Fiscal de Sala"/)).toBeInTheDocument();
        expect(within(popup).getByText(/Zere as metas/)).toBeInTheDocument();
        expect(within(popup).getByText("CEF 01 — Escola A")).toBeInTheDocument();
        expect(within(popup).getByText("12 colaboradores")).toBeInTheDocument();
        expect(within(popup).getByText("1 colaborador")).toBeInTheDocument();
      });

      it("'Entendi' fecha sem apagar", async () => {
        const user = userEvent.setup();
        const popup = await clicarLixeiraComMetas(user);
        await user.click(within(popup).getByRole("button", { name: "Entendi" }));

        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(deleteValor).not.toHaveBeenCalled();
      });
    });

    describe("a recusa do banco também vira popup", () => {
      it("se a checagem falhar, segue para a confirmação (a barreira é o trigger)", async () => {
        buscarMetas.mockRejectedValue(new Error("rede"));
        const user = userEvent.setup();
        comHooks({ valoresFuncao: [valor()] });
        abrir();
        await user.click(screen.getByRole("button", { name: "Remover valor" }));

        const confirmacao = await screen.findByRole("alertdialog");
        expect(within(confirmacao).getByText("Remover valor da função")).toBeInTheDocument();
      });

      it("recusa depois de confirmar abre o popup com a mensagem do banco, sem toast", async () => {
        const MSG = "Ainda há metas de colaboradores definidas para esta função nesta prova. Zere as metas antes de remover o valor.";
        deleteValor.mockImplementation((_id: string, aoFalhar: (m: string) => void) => aoFalhar(MSG));
        const user = userEvent.setup();
        comHooks({ valoresFuncao: [valor()] });
        abrir();
        await user.click(screen.getByRole("button", { name: "Remover valor" }));
        const confirmacao = await screen.findByRole("alertdialog");
        await user.click(within(confirmacao).getByRole("button", { name: "Remover" }));

        const popup = await screen.findByText("Não é possível remover o valor");
        expect(popup).toBeInTheDocument();
        expect(screen.getByText(MSG)).toBeInTheDocument();
        expect(toastMock.error).not.toHaveBeenCalled();
      });
    });

    it("sobrevive a valor cuja função não veio no join", () => {
      comHooks({ valoresFuncao: [valor({ funcoes_colaboradores: null })] });
      abrir();
      expect(screen.getByText("-")).toBeInTheDocument();
    });
  });

  it("avisa que o valor vale para os já alocados, e identifica a prova sem os espaços", () => {
    // O aviso não é decorativo: o DAF e o recibo leem o valor AO VIVO, então mudar aqui
    // muda o pagamento de quem já está alocado. Se ele sair, a tela passa a enganar.
    // 🔵 Até 2026-11-27 este caso exigia "O valor é congelado no momento da alocação" —
    // e a tela ENGANAVA exatamente assim: 977 de 977 alocações tinham o valor congelado
    // nulo. O teste guardava a promessa falsa como certa (armadilha 8).
    abrir();
    expect(
      screen.getByText(/inclusive os já alocados/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/congelado/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Edital 01\/2026$/ }),
    ).toBeInTheDocument();
  });
});
