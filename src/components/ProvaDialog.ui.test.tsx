import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setTableResult, resetSupabaseMock } from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { ProvaDialog } from "@/components/ProvaDialog";

const EDITAL_A = {
  id: "edital-a",
  nome: "Edital 001/2026 SMA",
  n_candidatos: 1500,
  cabecalho_linha1: "CABEÇALHO DO EDITAL A",
  cabecalho_linha2: "Segunda linha do A",
  created_at: null,
  updated_at: null,
  created_by: null,
};

const EDITAL_B = {
  ...EDITAL_A,
  id: "edital-b",
  nome: "Edital 002/2026 - Secretaria Municipal de Administração",
  n_candidatos: 300,
  cabecalho_linha1: "CABEÇALHO DO EDITAL B",
  cabecalho_linha2: "Segunda linha do B",
};

/**
 * O ProvaDialog é onde a relação Editais × Provas vira comportamento observável.
 * Duas regras do tema "Editais como entidade" vivem só aqui, em UI:
 *   D5 — não se cria prova sem edital cadastrado;
 *   D2/D3 — a herança edital→prova é SUGESTÃO, e só na criação.
 */
describe("ProvaDialog (interação)", () => {
  let onSubmit: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetSupabaseMock();
    onSubmit = vi.fn();
    onOpenChange = vi.fn();
  });

  const abrir = (props: Record<string, unknown> = {}) =>
    renderWithProviders(
      <ProvaDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />,
    );

  /** Abre o combobox de edital e escolhe pelo nome. */
  async function escolherEdital(user: ReturnType<typeof userEvent.setup>, nome: string) {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: nome }));
  }

  describe("sem edital cadastrado (D5)", () => {
    beforeEach(() => setTableResult("editais", { data: [], error: null }));

    it("não mostra o formulário e explica o que falta", async () => {
      abrir();

      expect(
        await screen.findByText(/Nenhum edital cadastrado ainda/i),
      ).toBeInTheDocument();
      // Sem edital não há o que preencher — o form inteiro fica fora do DOM.
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Criar" })).not.toBeInTheDocument();
    });

    it("oferece o caminho para resolver, apontando para o módulo Editais", async () => {
      // A saída é um link para /editais. Note que Editais é módulo só de admin:
      // um coordenador que caia aqui não consegue destravar sozinho.
      abrir();

      const link = await screen.findByRole("link", { name: "Cadastrar Edital" });
      expect(link).toHaveAttribute("href", "/editais");
    });
  });

  describe("herança edital → prova (D2/D3)", () => {
    beforeEach(() => setTableResult("editais", { data: [EDITAL_A, EDITAL_B], error: null }));

    it("preenche os três campos ao escolher um edital numa prova NOVA", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_A.nome);

      // Sugestão editável — não trigger de banco, não vínculo permanente.
      await waitFor(() =>
        expect(screen.getByLabelText("Nº Candidatos")).toHaveValue(1500),
      );
      expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue("CABEÇALHO DO EDITAL A");
      expect(screen.getByLabelText("Linha 2 do Cabeçalho")).toHaveValue("Segunda linha do A");
    });

    it("substitui a sugestão ao trocar de edital, ainda na criação", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_A.nome);
      await waitFor(() =>
        expect(screen.getByLabelText("Nº Candidatos")).toHaveValue(1500),
      );

      await escolherEdital(user, EDITAL_B.nome);
      await waitFor(() =>
        expect(screen.getByLabelText("Nº Candidatos")).toHaveValue(300),
      );
    });

    it("respeita o valor que o usuário digitou por cima da sugestão", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_A.nome);
      const campo = screen.getByLabelText("Nº Candidatos");
      await waitFor(() => expect(campo).toHaveValue(1500));

      await user.clear(campo);
      await user.type(campo, "999");

      expect(campo).toHaveValue(999);
    });
  });

  describe("edição: a herança NÃO se aplica", () => {
    const PROVA = {
      id: "prova-1",
      edital_id: EDITAL_A.id,
      prova_data: "2026-03-15",
      prova_hora_inicio: "08:00",
      prova_hora_final: "12:00",
      prova_n_candidatos: 42,
      prova_cabecalho_linha1: "CABEÇALHO PRÓPRIO DA PROVA",
      prova_cabecalho_linha2: "Linha própria",
    } as never;

    beforeEach(() => setTableResult("editais", { data: [EDITAL_A, EDITAL_B], error: null }));

    it("carrega os valores da PROVA, não os do edital", async () => {
      abrir({ prova: PROVA });

      expect(await screen.findByLabelText("Nº Candidatos")).toHaveValue(42);
      expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue(
        "CABEÇALHO PRÓPRIO DA PROVA",
      );
    });

    it("⚠️ trocar o edital de uma prova existente NÃO sobrescreve os campos dela", async () => {
      // A regra que protege o histórico: os PDFs e a alocação leem os campos DA
      // PROVA. Se a edição herdasse de novo, trocar o edital de uma prova antiga
      // reescreveria o cabeçalho de documentos já emitidos.
      const user = userEvent.setup();
      abrir({ prova: PROVA });
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_B.nome);

      expect(screen.getByLabelText("Nº Candidatos")).toHaveValue(42);
      expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue(
        "CABEÇALHO PRÓPRIO DA PROVA",
      );
    });
  });

  describe("envio", () => {
    beforeEach(() => setTableResult("editais", { data: [EDITAL_A, EDITAL_B], error: null }));

    it("exige escolher um edital", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await user.click(screen.getByRole("button", { name: "Criar" }));

      // "Selecione um edital" aparece DUAS vezes: como placeholder do combobox e
      // como mensagem de validação. Miramos na mensagem, que é o que o usuário
      // passa a ver depois de tentar enviar.
      const mensagens = await screen.findAllByText("Selecione um edital");
      expect(mensagens.some((el) => el.id?.endsWith("-form-item-message"))).toBe(true);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("leva o edital_id e a cópia denormalizada truncada em 30 caracteres", async () => {
      // `prova_edital` (CHAR(30)) sobrevive só para satisfazer o NOT NULL enquanto
      // a coluna não é dropada — o backfill do seed.pos.sql ainda lê dela. O nome
      // do EDITAL_B tem 54 caracteres, então a truncagem é observável aqui.
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_B.nome);
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const payload = onSubmit.mock.calls[0][0];

      expect(payload.edital_id).toBe("edital-b");
      expect(payload.prova_edital).toBe(EDITAL_B.nome.slice(0, 30));
      expect(payload.prova_edital).toHaveLength(30);
      // A fonte de verdade é o edital_id; a cópia é resíduo de transição.
      expect(payload.prova_edital).not.toBe(EDITAL_B.nome);
    });

    it("converte vazios em null e n_candidatos em inteiro", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_A.nome);
      await user.clear(screen.getByLabelText("Linha 1 do Cabeçalho"));
      await user.clear(screen.getByLabelText("Linha 2 do Cabeçalho"));
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const payload = onSubmit.mock.calls[0][0];

      expect(payload.prova_n_candidatos).toBe(1500);
      expect(payload.prova_cabecalho_linha1).toBeNull();
      expect(payload.prova_cabecalho_linha2).toBeNull();
      expect(payload.prova_data).toBeNull();
    });
  });
});
