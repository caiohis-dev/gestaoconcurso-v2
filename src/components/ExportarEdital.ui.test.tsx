/**
 * O diálogo de exportação — a confirmação NOMEADA da D-P1, na tela.
 *
 * O harness usa o portão DE VERDADE (`avaliarExportacao`), não um estado fabricado: o que
 * se afirma é que clicar nas caixas libera o botão exatamente quando o portão libera.
 */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PainelDaExportacao } from "@/components/ExportarEdital";
import { avaliarExportacao, type PendenciaDeExportacao } from "@/lib/edital-exportacao";

const pend = (id: string, texto: string): PendenciaDeExportacao => ({
  id,
  origem: "linter",
  severidade: "erro",
  capitulo: null,
  texto,
});

function Harness(props: {
  pendencias?: PendenciaDeExportacao[];
  consultasComErro?: string[];
  rascunhosSujos?: number;
  aoBaixar: () => void;
}) {
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set());
  const estado = avaliarExportacao({
    consultasComErro: props.consultasComErro ?? [],
    pendencias: props.pendencias,
    rascunhosSujos: props.rascunhosSujos ?? 0,
    confirmadas,
  });
  return (
    <PainelDaExportacao
      estado={estado}
      confirmadas={confirmadas}
      alternar={(id) =>
        setConfirmadas((a) => {
          const n = new Set(a);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        })
      }
      aoBaixar={props.aoBaixar}
    />
  );
}

describe("PainelDaExportacao", () => {
  it("🔴 com pendência, o botão só habilita quando CADA uma é confirmada pelo nome", async () => {
    const aoBaixar = vi.fn();
    render(<Harness pendencias={[pend("a", "Campo X sem valor"), pend("b", "Anexo I vazio")]} aoBaixar={aoBaixar} />);
    const botao = screen.getByRole("button", { name: /baixar com as pendências confirmadas/i });

    expect(botao).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Campo X sem valor" }));
    expect(botao).toBeDisabled(); // uma de duas não basta
    await userEvent.click(screen.getByRole("checkbox", { name: "Anexo I vazio" }));
    expect(botao).toBeEnabled();

    // desmarcar volta a bloquear
    await userEvent.click(screen.getByRole("checkbox", { name: "Anexo I vazio" }));
    expect(botao).toBeDisabled();
    await userEvent.click(botao);
    expect(aoBaixar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("checkbox", { name: "Anexo I vazio" }));
    await userEvent.click(botao);
    expect(aoBaixar).toHaveBeenCalledTimes(1);
  });

  it("não existe atalho para confirmar todas", () => {
    render(<Harness pendencias={[pend("a", "A"), pend("b", "B")]} aoBaixar={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /todas|tudo/i })).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("controle positivo: sem pendência, baixa direto", async () => {
    const aoBaixar = vi.fn();
    render(<Harness pendencias={[]} aoBaixar={aoBaixar} />);
    await userEvent.click(screen.getByRole("button", { name: /baixar markdown/i }));
    expect(aoBaixar).toHaveBeenCalledTimes(1);
  });

  it("🔴 consulta que falhou: recusa sem botão nenhum, nomeando a consulta", () => {
    render(<Harness pendencias={[]} consultasComErro={["edital_itens"]} aoBaixar={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("edital_itens");
    expect(screen.queryByRole("button", { name: /baixar/i })).toBeNull();
  });

  it("🔴 rascunho não salvo: recusa sem botão nenhum", () => {
    render(<Harness pendencias={[]} rascunhosSujos={3} aoBaixar={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("3 artigo(s) não salvo(s)");
    expect(screen.queryByRole("button", { name: /baixar/i })).toBeNull();
  });

  it("carregando: nem botão, nem lista", () => {
    render(<Harness pendencias={undefined} aoBaixar={vi.fn()} />);
    expect(screen.getByLabelText("Montando o documento")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
