import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnidadeProvaDialog } from "@/components/UnidadeProvaDialog";

/**
 * Interação do UnidadeProvaDialog. O schema Zod isolado está em `UnidadeProvaDialog.test.ts`
 * — aqui interessa o que só aparece na tela: o modo edição, o preenchimento a partir da
 * unidade recebida, e o caminho até o `onSubmit`.
 *
 * Componente puro: recebe `unidade` e `onSubmit` por prop, não fala com o Supabase.
 */
describe("UnidadeProvaDialog (interação)", () => {
  const UNIDADE = {
    id: "u-1",
    unid_nome: "Escola Central",
    // Vem do banco com espaços: a coluna é CHAR e o valor fica preenchido à direita.
    unid_sigla: "EC        ",
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

  const abrir = (props: Partial<Parameters<typeof UnidadeProvaDialog>[0]> = {}) =>
    render(
      <UnidadeProvaDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />,
    );

  describe("modo criação", () => {
    it("anuncia-se como nova", () => {
      abrir();
      expect(screen.getByRole("heading", { name: "Nova Unidade de Prova" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
    });

    it("entrega os dois campos ao submeter", async () => {
      const user = userEvent.setup();
      abrir();
      await user.type(screen.getByLabelText("Nome"), "Anexo Norte");
      await user.type(screen.getByLabelText("Sigla"), "AN");
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          unid_nome: "Anexo Norte",
          unid_sigla: "AN",
        }),
      );
    });

    it("não submete sem nome nem sigla, e diz o que falta", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("button", { name: "Criar" }));

      expect(await screen.findByText("Nome é obrigatório")).toBeInTheDocument();
      expect(screen.getByText("Sigla é obrigatória")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    /**
     * 🔴 **Dois casos do campo de andares saíram em 2026-08-03, com a coluna.**
     *
     * Um deles era "digitar 0 é barrado pelo NAVEGADOR, antes de o Zod rodar" — a
     * ilustração viva da armadilha 7 (`min={1}` nativo dentro de `<form>` esconde a
     * mensagem em português). ⚠️ **A armadilha continua valendo**, e segue documentada em
     * `testes.md`; o que sumiu foi este campo, não o fenômeno. Foi exatamente ele que, em
     * `/salas-prova`, fez o campo de andar parecer morto.
     */
    it("🔴 CONTROLE POSITIVO: o campo de andares não existe mais", () => {
      abrir();

      expect(screen.queryByLabelText("Quantidade de Andares")).not.toBeInTheDocument();
      expect(screen.queryByText(/andar/i)).not.toBeInTheDocument();
    });
  });

  describe("modo edição", () => {
    it("anuncia-se como edição e preenche com a unidade", () => {
      abrir({ unidade: UNIDADE });

      expect(screen.getByRole("heading", { name: "Editar Unidade de Prova" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
      expect(screen.getByLabelText("Nome")).toHaveValue("Escola Central");
    });

    it("apara os espaços da sigla vinda do banco", () => {
      // A coluna é CHAR, então o valor volta preenchido à direita. Sem o trim, reabrir e
      // salvar gravaria a sigla com os espaços — e o `chk_unid_sigla_preenchida` do banco
      // valida `length(trim(...)) > 0`, não o tamanho bruto.
      abrir({ unidade: UNIDADE });
      expect(screen.getByLabelText("Sigla")).toHaveValue("EC");
    });

    it("troca de unidade sem fechar repreenche o formulário", async () => {
      // A lista abre o mesmo diálogo para outra linha; sem o reset, os campos ficariam
      // com os dados da unidade anterior.
      const { rerender } = abrir({ unidade: UNIDADE });
      expect(screen.getByLabelText("Nome")).toHaveValue("Escola Central");

      rerender(
        <UnidadeProvaDialog
          open
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
          unidade={{ ...UNIDADE, id: "u-2", unid_nome: "Anexo Sul" }}
        />,
      );

      await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Anexo Sul"));
      expect(screen.getByLabelText("Sigla")).toHaveValue("EC");
    });
  });

  describe("estados de botão", () => {
    it("Cancelar fecha sem submeter", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("durante o salvamento trava os dois botões", () => {
      // Sem isso, dois cliques criam a unidade duas vezes.
      abrir({ isLoading: true });
      expect(screen.getByRole("button", { name: /Criar/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    });
  });

  it("🔵 a descrição não promete mais nada sobre andares", () => {
    // ⚠️ Este caso afirmava o contrário até 03/08: guardava a frase "o número de andares
    // limita em que andar as salas podem ficar", que era a explicação honesta de um
    // acoplamento que hoje não existe. Ela precisava sair junto com o campo — descrição
    // que promete uma regra morta é pior que descrição nenhuma.
    abrir();
    expect(screen.getByText(/Cadastre o local onde as provas são aplicadas/)).toBeInTheDocument();
    expect(screen.queryByText(/limita em que andar/)).not.toBeInTheDocument();
  });
});
