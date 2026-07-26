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

vi.mock("@/hooks/useValoresFuncaoProva", () => ({
  useValoresFuncaoProva: () => valoresHook.atual,
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
    upsertValor = vi.fn();
    deleteValor = vi.fn();
    onOpenChange = vi.fn();
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

    it("⚠️ DEFEITO: aceita valor NEGATIVO de pagamento", async () => {
      // O `min="0"` do input só vale para a validação nativa do navegador, que exige
      // submit de <form> — e aqui não há form nenhum: o clique chama `handleAdd` direto.
      // O `parseFloat` aceita o negativo, e NÃO existe CHECK no banco para
      // `valor_pagamento` (o tema dos 17 CHECKs cobriu formatos, não estes números).
      // Ou seja: -150 chega ao banco e entra na base de pagamento. Item no backlog.
      const user = userEvent.setup();
      abrir();
      await escolherFuncao(user, /Fiscal de Sala/);
      await user.type(campoValor(), "-150");
      await user.click(botaoAdicionar());

      expect(upsertValor).toHaveBeenCalledWith({
        funcaoId: FISCAL.id,
        valorPagamento: -150,
      });
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

    it("⚠️ DEFEITO: excluir valor de pagamento não pede confirmação", async () => {
      // Um clique na lixeira e o dado de pagamento vai embora, sem confirmar nada. O
      // repo tem `PasswordConfirmDialog` exatamente para ação destrutiva, e ele é usado
      // em excluir prova e encerrar ocorrências — mas não aqui.
      //
      // E o efeito não fica contido neste diálogo: sem valor, a função desaparece do
      // MetaColaboradoresDialog, deixando a meta dela órfã (ver o teste de lá).
      comHooks({ valoresFuncao: [valor()] });
      const user = userEvent.setup();
      abrir();
      const linha = screen.getByText("Fiscal de Sala").closest("tr")!;
      const botoes = within(linha).getAllByRole("button");
      await user.click(botoes[botoes.length - 1]);

      expect(deleteValor).toHaveBeenCalledWith("v-1");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("sobrevive a valor cuja função não veio no join", () => {
      comHooks({ valoresFuncao: [valor({ funcoes_colaboradores: null })] });
      abrir();
      expect(screen.getByText("-")).toBeInTheDocument();
    });
  });

  it("avisa que o valor é congelado na alocação, e identifica a prova sem os espaços", () => {
    // O aviso não é decorativo: é o que explica por que mudar o valor aqui não corrige
    // pagamento já alocado. Se ele sair, a tela passa a enganar.
    abrir();
    expect(
      screen.getByText(/O valor é congelado no momento da alocação/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Edital 01\/2026$/ }),
    ).toBeInTheDocument();
  });
});
