import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Testes de interação do MetaColaboradoresDialog — a outra metade do **caminho do
 * dinheiro**. Aqui se define quantos colaboradores de cada função a unidade precisa, e
 * esse número é a base da alocação.
 *
 * O acoplamento que este arquivo fixa, e que é a razão de ele e o
 * `ValoresFuncaoProvaDialog` serem uma unidade de trabalho só: **a meta só existe para
 * função que já tem valor cadastrado na prova**. Quem tira o valor lá, tira a função
 * daqui.
 *
 * Os três hooks são mockados — todos têm teste próprio.
 */
const metasHook = vi.hoisted(() => ({ atual: null as unknown }));
const valoresHook = vi.hoisted(() => ({ atual: null as unknown }));
const funcoesHook = vi.hoisted(() => ({ atual: null as unknown }));

vi.mock("@/hooks/useMetaColaboradoresUnidade", () => ({
  useMetaColaboradoresUnidade: () => metasHook.atual,
}));
vi.mock("@/hooks/useValoresFuncaoProva", () => ({
  useValoresFuncaoProva: () => valoresHook.atual,
}));
vi.mock("@/hooks/useFuncoesColaboradores", () => ({
  useFuncoesColaboradores: () => funcoesHook.atual,
}));

import { MetaColaboradoresDialog } from "@/components/MetaColaboradoresDialog";

const FISCAL = { id: "f-fiscal", cargo_nome: "Fiscal de Sala" };
const PORTEIRO = { id: "f-porteiro", cargo_nome: "Porteiro" };

describe("MetaColaboradoresDialog (interação)", () => {
  let upsertMetas: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  function comHooks({
    metas = [] as Record<string, unknown>[],
    valores = [{ funcao_id: FISCAL.id }, { funcao_id: PORTEIRO.id }],
    funcoes = [FISCAL, PORTEIRO],
    isLoading = false,
    isUpserting = false,
    isLoadingValores = false,
    isLoadingFuncoes = false,
  } = {}) {
    metasHook.atual = { metas, isLoading, upsertMetas, isUpserting };
    valoresHook.atual = { valoresFuncao: valores, isLoading: isLoadingValores };
    funcoesHook.atual = { funcoes, isLoading: isLoadingFuncoes };
  }

  beforeEach(() => {
    upsertMetas = vi.fn();
    onOpenChange = vi.fn();
    comHooks();
  });

  const abrir = () =>
    render(
      <MetaColaboradoresDialog
        open
        onOpenChange={onOpenChange}
        provaUnidadeId="pu-1"
        provaId="prova-1"
        unidadeNome="Escola Central"
      />,
    );

  const botaoSalvar = () => screen.getByRole("button", { name: "Salvar" });

  describe("o acoplamento com os valores da prova", () => {
    it("só oferece função que tem valor cadastrado na prova", () => {
      // Porteiro existe no cadastro geral de funções, mas sem valor nesta prova: não
      // pode receber meta, porque a meta sem valor não vira pagamento.
      comHooks({ valores: [{ funcao_id: FISCAL.id }] });
      abrir();

      expect(screen.getByLabelText("Fiscal de Sala")).toBeInTheDocument();
      expect(screen.queryByLabelText("Porteiro")).not.toBeInTheDocument();
    });

    it("sem nenhuma função com valor, explica e desabilita o Salvar", () => {
      comHooks({ valores: [] });
      abrir();

      expect(screen.getByText(/Nenhuma função cadastrada para esta prova/)).toBeInTheDocument();
      expect(botaoSalvar()).toBeDisabled();
    });

    it("não afirma 'nenhuma função' enquanto qualquer um dos três hooks carrega", () => {
      // São três fontes (metas, valores, funções) e o early return soma as três. Afirmar
      // "nenhuma função" no meio do carregamento seria mentira — o padrão "vazio enquanto
      // carrega" que já rendeu defeito neste repo.
      for (const carregando of [
        { isLoading: true },
        { isLoadingValores: true },
        { isLoadingFuncoes: true },
      ]) {
        comHooks({ valores: [], ...carregando });
        const { unmount } = abrir();
        expect(
          screen.queryByText(/Nenhuma função cadastrada para esta prova/),
        ).not.toBeInTheDocument();
        unmount();
      }
    });

    it("⚠️ ATENÇÃO: meta de função que PERDEU o valor fica órfã, invisível", () => {
      // `upsertMetas` é upsert puro (onConflict prova+função) — nunca apaga. Então a
      // linha em `meta_colaboradores_unidade` de uma função que perdeu o valor CONTINUA
      // no banco, sem aparecer aqui e sem ser reenviada ao salvar.
      //
      // O caminho é real e curto: um clique na lixeira do ValoresFuncaoProvaDialog (que
      // nem pede confirmação) apaga o valor, e a meta do Porteiro fica pendurada.
      // Não é defeito DESTE diálogo — ele não tem como saber. Fica registrado para quem
      // for mexer em meta ou em relatório que leia essa tabela direto.
      comHooks({
        valores: [{ funcao_id: FISCAL.id }],
        metas: [
          { funcao_id: FISCAL.id, quantidade_meta: 4 },
          { funcao_id: PORTEIRO.id, quantidade_meta: 9 },
        ],
      });
      abrir();

      expect(screen.queryByLabelText("Porteiro")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Fiscal de Sala")).toHaveValue(4);
    });
  });

  describe("preenchimento", () => {
    it("carrega a meta já salva, e zero para quem não tem", () => {
      comHooks({ metas: [{ funcao_id: FISCAL.id, quantidade_meta: 12 }] });
      abrir();

      expect(screen.getByLabelText("Fiscal de Sala")).toHaveValue(12);
      expect(screen.getByLabelText("Porteiro")).toHaveValue(0);
    });

    it("digitar '-5' vira 5: o sinal não passa pelo campo numérico", async () => {
      // O campo começa em "0", então o estado intermediário "0-" é inválido para
      // type=number e o navegador descarta o sinal — sobra o 5. Vale registrar porque é
      // o que o usuário observa, e porque contrasta com o ValoresFuncaoProvaDialog: lá o
      // campo começa VAZIO, "-" sozinho é intermediário válido, e o negativo passa
      // (aquele sim é defeito, e tem teste marcado).
      const user = userEvent.setup();
      abrir();
      await user.type(screen.getByLabelText("Fiscal de Sala"), "-5");

      expect(screen.getByLabelText("Fiscal de Sala")).toHaveValue(5);
    });

    it("satura em zero quando um negativo chega por outro caminho", () => {
      // Colar, ou a seta para baixo do spinner, produzem valor negativo sem passar pela
      // digitação — e é aí que o `Math.max(0, …)` do handleChange trabalha. `fireEvent`
      // é o jeito de exercitar o clamp de fato, em vez de afirmá-lo por leitura.
      abrir();
      const campo = screen.getByLabelText("Fiscal de Sala");
      fireEvent.change(campo, { target: { value: "-5" } });

      expect(campo).toHaveValue(0);
    });

    it("trata entrada não-numérica como zero", async () => {
      const user = userEvent.setup();
      abrir();
      const campo = screen.getByLabelText("Fiscal de Sala");
      await user.clear(campo);

      expect(campo).toHaveValue(0);
    });
  });

  describe("salvar", () => {
    it("manda TODAS as funções disponíveis, inclusive as com meta zero", async () => {
      // Mandar o zero é o que permite ZERAR uma meta: omitir a função deixaria o valor
      // antigo no banco, porque o hook faz upsert e não apaga.
      const user = userEvent.setup();
      abrir();
      await user.clear(screen.getByLabelText("Fiscal de Sala"));
      await user.type(screen.getByLabelText("Fiscal de Sala"), "3");
      await user.click(botaoSalvar());

      expect(upsertMetas).toHaveBeenCalledTimes(1);
      expect(upsertMetas.mock.calls[0][0]).toEqual(
        expect.arrayContaining([
          { funcao_id: FISCAL.id, quantidade_meta: 3 },
          { funcao_id: PORTEIRO.id, quantidade_meta: 0 },
        ]),
      );
    });

    it("fecha só no sucesso do upsert", async () => {
      // O fechamento vai no callback `onSuccess` — se a gravação falhar, o diálogo fica
      // aberto com o preenchimento, e não dá a impressão de que salvou.
      const user = userEvent.setup();
      abrir();
      await user.click(botaoSalvar());

      expect(onOpenChange).not.toHaveBeenCalled();
      const opcoes = upsertMetas.mock.calls[0][1];
      expect(opcoes).toHaveProperty("onSuccess");

      opcoes.onSuccess();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("durante a gravação avisa e trava o botão", () => {
      comHooks({ isUpserting: true });
      abrir();

      expect(screen.getByRole("button", { name: /Salvando/ })).toBeDisabled();
    });

    it("Cancelar fecha sem gravar", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(upsertMetas).not.toHaveBeenCalled();
    });
  });

  it("identifica a unidade, que é o escopo da meta", () => {
    // A meta é por unidade da prova, não por prova — sem o nome na tela, é fácil definir
    // a meta da unidade errada.
    abrir();
    expect(screen.getByText("Escola Central")).toBeInTheDocument();
  });
});
