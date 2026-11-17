/**
 * A lista "Campos do edital" — o marcador, onde se preenche e o valor atual.
 *
 * O que se guarda: o campo aparece no capítulo onde se PREENCHE (o do caso que motivou a
 * tela: `signatario_cargo` no Preâmbulo, não em Anexos); valor ausente diz "vazio" e o que
 * sairia no documento; carregando diz "carregando", nunca "vazio"; a busca ignora acento.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListaDeCampos } from "@/components/CamposDoEdital";
import { CAPITULO_POR_CHAVE } from "@/lib/edital-capitulos";

const preambulo = () => screen.getByRole("region", { name: `Preenche-se em ${CAPITULO_POR_CHAVE.get("preambulo")!.titulo}` });

describe("ListaDeCampos", () => {
  it("🔴 signatario_cargo está no PREÂMBULO, com o valor atual", () => {
    render(<ListaDeCampos valores={new Map([["signatario_cargo", "Secretário de Administração"]])} filtro="" />);
    const sec = within(preambulo());
    expect(sec.getByText("{{campo:signatario_cargo}}")).toBeInTheDocument();
    expect(sec.getByText("= Secretário de Administração")).toBeInTheDocument();
  });

  it("valor ausente: 'vazio' e o que sairia no documento", () => {
    render(<ListaDeCampos valores={new Map()} filtro="signatario_cargo" />);
    expect(screen.getByText("vazio — sairia como [?campo:signatario_cargo]")).toBeInTheDocument();
  });

  it("🔴 carregando NÃO diz 'vazio' — mandaria preencher o que já está preenchido", () => {
    render(<ListaDeCampos valores={undefined} filtro="signatario_cargo" />);
    expect(screen.getByText("carregando…")).toBeInTheDocument();
    expect(screen.queryByText(/vazio/)).toBeNull();
  });

  it("busca sem acento acha o rótulo com acento, e filtra os demais", () => {
    // "minimo" está só no RÓTULO ("Interstício mínimo…"), não na chave — a primeira versão
    // deste caso buscava "interstício" e casava pela chave, sem exercitar o acento.
    render(<ListaDeCampos valores={new Map()} filtro="minimo" />);
    expect(screen.getByText("{{campo:intersticio_vista_horas}}")).toBeInTheDocument();
    expect(screen.queryByText("{{campo:signatario_cargo}}")).toBeNull();
  });

  it("o botão copia o marcador exato", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ListaDeCampos valores={new Map()} filtro="signatario_cargo" />);
    await userEvent.click(screen.getByRole("button", { name: "Copiar {{campo:signatario_cargo}}" }));
    expect(writeText).toHaveBeenCalledWith("{{campo:signatario_cargo}}");
  });
});
