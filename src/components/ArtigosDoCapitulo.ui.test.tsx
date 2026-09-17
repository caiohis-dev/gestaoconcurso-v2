/**
 * Bateria da LISTA DE ARTIGOS — a fiação da tela, que os testes de `src/lib/` não alcançam.
 *
 * 🔴 **Por que ela existe.** `edital-itens.test.ts` prova que `numerarItens` numera
 * certo; nada ali prova que a TELA mostra esse número, que ele é read-only, ou que o
 * botão "subir" do primeiro artigo está desabilitado. É a mesma distinção que custou o
 * lock de edição em 2026-09-16: 14 testes do hook verdes enquanto a página entregava o
 * id errado — o defeito estava na LIGAÇÃO.
 *
 * O componente recebe props puras, então não há Supabase para mockar: o que se verifica
 * aqui é exatamente a ligação, e nada além.
 *
 * Ver as 12 armadilhas em `my_rules/estrutura/transversais/testes.md`.
 */
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { ArtigosDoCapitulo } from "@/components/ArtigosDoCapitulo";
import type { ItemBruto } from "@/lib/edital-itens";

const item = (id: string, extra: Partial<ItemBruto> = {}): ItemBruto => ({
  id,
  capitulo_chave: "vagas_pcd",
  ordem: 0,
  nivel: 0,
  tipo: "item",
  texto: `Texto de ${id}`,
  ancora: null,
  quadro_fonte: null,
  ...extra,
});

const TRES = [
  item("a", { ordem: 0 }),
  item("b", { ordem: 1 }),
  item("c", { ordem: 2, nivel: 1 }),
];

function montar(props: Partial<Parameters<typeof ArtigosDoCapitulo>[0]> = {}) {
  const espioes = {
    setRascunhos: vi.fn(),
    onAdicionar: vi.fn(),
    onRemover: vi.fn(),
    onMover: vi.fn(),
    onNivel: vi.fn(),
    onImportar: vi.fn(),
  };
  renderWithProviders(
    <ArtigosDoCapitulo
      itens={TRES}
      numeroCapitulo={7}
      capituloChave="vagas_pcd"
      rascunhos={{}}
      travado={false}
      {...espioes}
      {...props}
    />,
  );
  return espioes;
}

describe("a numeração na tela", () => {
  it("🔴 mostra o número CALCULADO, e ele não é campo editável", () => {
    montar();
    expect(screen.getByText("7.1.")).toBeInTheDocument();
    expect(screen.getByText("7.2.")).toBeInTheDocument();
    expect(screen.getByText("7.2.1.")).toBeInTheDocument();
    // Nenhum input contém o número: se contivesse, alguém o digitaria — e é exatamente
    // o defeito que o módulo inteiro existe para eliminar.
    for (const campo of screen.getAllByRole("textbox")) {
      expect((campo as HTMLInputElement).value).not.toContain("7.1");
    }
  });

  it("o texto do artigo chega ao input certo, identificado pelo número", () => {
    montar();
    expect(screen.getByLabelText("Texto do item 7.1")).toHaveValue("Texto de a");
    expect(screen.getByLabelText("Texto do item 7.2.1")).toHaveValue("Texto de c");
  });

  it("parágrafo sem número aparece sem marcador e com rótulo próprio", () => {
    montar({ itens: [item("p", { tipo: "prosa", texto: "Parágrafo solto." })] });
    expect(screen.getByLabelText("Texto do parágrafo")).toHaveValue("Parágrafo solto.");
    expect(screen.queryByText("7.1.")).not.toBeInTheDocument();
  });
});

describe("mover e aninhar", () => {
  it("🔴 o PRIMEIRO não sobe e o ÚLTIMO não desce", () => {
    montar();
    const subir = screen.getAllByLabelText("Subir artigo");
    const descer = screen.getAllByLabelText("Descer artigo");
    expect(subir[0]).toBeDisabled();
    expect(subir[1]).toBeEnabled();
    expect(descer[2]).toBeDisabled();
    expect(descer[1]).toBeEnabled();
  });

  it("recuar está desabilitado no nível 0 e avançar no nível 2", () => {
    montar({ itens: [item("a"), item("z", { ordem: 1, nivel: 2 })] });
    expect(screen.getAllByLabelText("Recuar um nível")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("Recuar um nível")[1]).toBeEnabled();
    expect(screen.getAllByLabelText("Avançar um nível")[1]).toBeDisabled();
  });

  it("⭐ cada botão chama a ação com o ID do artigo e o sentido certo", () => {
    const e = montar();
    screen.getAllByLabelText("Descer artigo")[0].click();
    expect(e.onMover).toHaveBeenCalledWith("a", 1);

    screen.getAllByLabelText("Avançar um nível")[1].click();
    expect(e.onNivel).toHaveBeenCalledWith("b", 1);

    screen.getAllByLabelText("Remover artigo")[2].click();
    expect(e.onRemover).toHaveBeenCalledWith("c");
  });

  it("🔴 com uma gravação em curso, TUDO que muda a lista fica travado", () => {
    // Sem isto, dois cliques rápidos em "descer" mandariam duas reordenações a partir do
    // MESMO estado — e a segunda desfaria a primeira sem ninguém ver.
    montar({ travado: true });
    for (const rotulo of ["Subir artigo", "Descer artigo", "Avançar um nível", "Remover artigo"]) {
      for (const b of screen.getAllByLabelText(rotulo)) expect(b).toBeDisabled();
    }
  });
});

describe("rascunho e âncora", () => {
  it("digitar propaga o rascunho SEM tocar no artigo salvo", async () => {
    const e = montar();
    await userEvent.type(screen.getByLabelText("Texto do item 7.1"), "!");
    expect(e.setRascunhos).toHaveBeenCalled();
    const ultimo = e.setRascunhos.mock.calls.at(-1)![0];
    expect(ultimo.a.texto).toBe("Texto de a!");
    expect(ultimo.a.ancora).toBe("");
  });

  it("artigo com rascunho é marcado como não salvo; sem rascunho, não", () => {
    montar({ rascunhos: { b: { texto: "mexido", ancora: "" } } });
    expect(screen.getAllByText("não salvo")).toHaveLength(1);
    expect(screen.getByLabelText("Texto do item 7.2")).toHaveValue("mexido");
  });

  it("a âncora aparece como INPUT, e a tela mostra como referenciá-la", () => {
    // Até 16/09 a âncora era sintaxe embutida no texto (`{#laudo}`); virou campo.
    montar({ itens: [item("a", { ancora: "laudo" })] });
    expect(screen.getByLabelText("Âncora para referência cruzada")).toHaveValue("laudo");
    expect(screen.getByText("{{item:laudo}}")).toBeInTheDocument();
  });
});

describe("o artigo do tipo QUADRO", () => {
  const comQuadro = [
    item("q", { tipo: "quadro", quadro_fonte: "cargos", texto: "QUADRO I: DOS CARGOS" }),
  ];

  it("🔴 mostra a FONTE do dado, e o campo é só a legenda", () => {
    montar({ itens: comQuadro });
    expect(screen.getByLabelText("Legenda do quadro")).toHaveValue("QUADRO I: DOS CARGOS");
    expect(screen.getByText("Quadro de cargos, vagas e vencimentos")).toBeInTheDocument();
    // Não há textarea de conteúdo: as linhas vêm de `edital_cargos`, nunca da digitação.
    expect(screen.queryByLabelText(/^Texto do item/)).not.toBeInTheDocument();
  });

  it("🔵 TODA fonte nomeia a origem do dado — não há mais fonte pendente", () => {
    // 🔴 Este caso mudou DUAS VEZES em dois dias, e as duas por motivo legítimo — é
    // armadilha 8 acontecendo à vista:
    //   · nasceu afirmando que `titulos` era fonte PENDENTE. A fatia 6 a tornou pronta e
    //     o caso caiu; foi reapontado para `vagas_por_area`, com a anotação de que cairia
    //     de novo na fatia 7.
    //   · a fatia 7 entrou, e ele caiu de novo. Não existe mais fonte pendente, então a
    //     afirmação original deixou de ter objeto: o campo `pronto` saiu de
    //     `QUADRO_FONTES` por ser constante `true`.
    //
    // O que SOBREVIVE das duas versões, e é o que este caso guarda agora: a linha do
    // artigo diz de ONDE a tabela vem. Sem isso o artigo aparece como um campo de legenda
    // solto, e quem edita não sabe o que será publicado ali.
    montar({ itens: [item("q", { tipo: "quadro", quadro_fonte: "vagas_por_area", texto: "" })] });
    expect(screen.getByText("Vagas por área de abrangência")).toBeInTheDocument();
  });

  it("é numerado como artigo — no Edital 002 o Quadro I é o item 2.1", () => {
    montar({ itens: comQuadro, numeroCapitulo: 2 });
    expect(screen.getByText("2.1.")).toBeInTheDocument();
  });
});

describe("acrescentar artigo", () => {
  it("os três tipos têm porta própria, e o quadro exige escolher a fonte antes", async () => {
    const e = montar();
    await userEvent.click(screen.getByRole("button", { name: "Artigo" }));
    expect(e.onAdicionar).toHaveBeenCalledWith("item");

    await userEvent.click(screen.getByRole("button", { name: "Parágrafo sem número" }));
    expect(e.onAdicionar).toHaveBeenCalledWith("prosa");

    // Sem fonte escolhida, "Inserir" está desabilitado: um quadro sem fonte é recusado
    // pelo banco (`chk_edital_item_quadro`), e a tela não deve nem oferecer.
    expect(screen.getByRole("button", { name: "Inserir" })).toBeDisabled();
  });

  it("capítulo sem artigo nenhum diz isso, em vez de mostrar lista vazia", () => {
    montar({ itens: [] });
    expect(screen.getByText(/ainda não tem nenhum artigo/)).toBeInTheDocument();
  });
});
