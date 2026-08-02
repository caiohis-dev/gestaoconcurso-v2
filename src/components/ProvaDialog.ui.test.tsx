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

    it("preenche os cabeçalhos ao escolher um edital numa prova NOVA", async () => {
      // ⚠️ Eram TRÊS campos até 2026-08-02: `Nº Candidatos` herdava `n_candidatos` do
      // edital. O campo saiu junto com a unificação do nº de inscritos — herdar previsão
      // para um número que ninguém lê só espalha cópia desatualizada.
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_A.nome);

      // Sugestão editável — não trigger de banco, não vínculo permanente.
      await waitFor(() =>
        expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue("CABEÇALHO DO EDITAL A"),
      );
      expect(screen.getByLabelText("Linha 2 do Cabeçalho")).toHaveValue("Segunda linha do A");
    });

    it("substitui a sugestão ao trocar de edital, ainda na criação", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_A.nome);
      await waitFor(() =>
        expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue("CABEÇALHO DO EDITAL A"),
      );

      await escolherEdital(user, EDITAL_B.nome);
      await waitFor(() =>
        expect(screen.getByLabelText("Linha 1 do Cabeçalho")).toHaveValue("CABEÇALHO DO EDITAL B"),
      );
    });

    it("respeita o valor que o usuário digitou por cima da sugestão", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_A.nome);
      const campo = screen.getByLabelText("Linha 1 do Cabeçalho");
      await waitFor(() => expect(campo).toHaveValue("CABEÇALHO DO EDITAL A"));

      await user.clear(campo);
      await user.type(campo, "CABEÇALHO ESCRITO À MÃO");

      expect(campo).toHaveValue("CABEÇALHO ESCRITO À MÃO");
    });

    it("🔴 não oferece campo de nº de candidatos — a alocação conta os inscritos reais", async () => {
      // Guarda a decisão de 2026-08-02. Este campo era lido pela alocação e dizia 200 num
      // edital com 7.231 inscritos: o painel pintava a prova de coberta faltando 7.031
      // lugares. Ele só volta a fazer sentido junto com o vínculo candidato↔prova, quando
      // "esta prova aplica um recorte do edital" for exprimível.
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");
      await escolherEdital(user, EDITAL_A.nome);

      expect(screen.queryByLabelText("Nº Candidatos")).not.toBeInTheDocument();
    });
  });

  describe("edição: a herança NÃO se aplica, e o edital é IMUTÁVEL (PE001)", () => {
    const PROVA = {
      id: "prova-1",
      edital_id: EDITAL_A.id,
      prova_data: "2026-03-15",
      prova_hora_inicio: "08:00",
      prova_hora_final: "12:00",
      prova_cabecalho_linha1: "CABEÇALHO PRÓPRIO DA PROVA",
      prova_cabecalho_linha2: "Linha própria",
    } as never;

    beforeEach(() => setTableResult("editais", { data: [EDITAL_A, EDITAL_B], error: null }));

    it("carrega os valores da PROVA, não os do edital", async () => {
      abrir({ prova: PROVA });

      // O cabeçalho da prova (`CABEÇALHO PRÓPRIO DA PROVA`) difere do edital A
      // (`CABEÇALHO DO EDITAL A`): é isso que prova que a herança não reagiu na edição.
      expect(await screen.findByLabelText("Linha 1 do Cabeçalho")).toHaveValue(
        "CABEÇALHO PRÓPRIO DA PROVA",
      );
      expect(screen.getByLabelText("Linha 2 do Cabeçalho")).toHaveValue("Linha própria");
    });

    it("🔴 NÃO oferece troca de edital — mostra o nome e explica que não muda", async () => {
      // ⚠️ ESTE TESTE AFIRMAVA O CONTRÁRIO ATÉ 2026-08-02. Ele se chamava "trocar o edital
      // de uma prova existente NÃO sobrescreve os campos dela" e TROCAVA o edital para
      // provar que a herança não reagia. A troca deixou de existir (PE001, decisão do
      // usuário), então o cenário que ele montava é inalcançável.
      //
      // O que ele guardava continua guardado, e por um caminho mais forte: os PDFs e a
      // alocação leem os campos DA PROVA, e trocar o edital reescreveria o cabeçalho de
      // documentos já emitidos. Antes isso dependia de a herança não reagir; agora não há
      // troca que possa reagir.
      abrir({ prova: PROVA });

      // O valor continua VISÍVEL — é o pedido explícito do item ("apenas visualizado").
      expect(await screen.findByText(EDITAL_A.nome)).toBeInTheDocument();
      expect(
        screen.getByText(/O edital é definido ao criar a prova e não pode ser alterado/i),
      ).toBeInTheDocument();

      // E não há combobox NENHUM no formulário de edição: o único que existia era o do
      // edital. Se algum dia outro campo virar select, esta asserção precisa mirar nele.
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("🔴 o payload da edição NÃO carrega edital_id nem prova_edital", async () => {
      // A trava de tela é conveniência; esta asserção é sobre o que sai no fio. Mesmo que
      // o formulário guarde o edital_id no estado, ele não pode viajar no PATCH — senão um
      // bug de estado vira uma tentativa de troca, que o trigger recusa e o usuário vê
      // como um toast vermelho sem ter pedido nada.
      const user = userEvent.setup();
      abrir({ prova: PROVA });
      await screen.findByLabelText("Linha 1 do Cabeçalho");

      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const payload = onSubmit.mock.calls[0][0];

      expect(payload).not.toHaveProperty("edital_id");
      expect(payload).not.toHaveProperty("prova_edital");
      // E também não carrega mais `prova_n_candidatos` (02/08) — o campo saiu do form.
      expect(payload).not.toHaveProperty("prova_n_candidatos");
      // CONTROLE POSITIVO: o resto da prova continua sendo enviado — a PE001 congela o
      // edital, não o formulário inteiro.
      expect(payload.prova_cabecalho_linha1).toBe("CABEÇALHO PRÓPRIO DA PROVA");
      expect(payload.prova_data).toBe("2026-03-15");
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

    it("converte vazios em null", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole("combobox");

      await escolherEdital(user, EDITAL_A.nome);
      await user.clear(screen.getByLabelText("Linha 1 do Cabeçalho"));
      await user.clear(screen.getByLabelText("Linha 2 do Cabeçalho"));
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const payload = onSubmit.mock.calls[0][0];

      expect(payload.prova_cabecalho_linha1).toBeNull();
      expect(payload.prova_cabecalho_linha2).toBeNull();
      expect(payload.prova_data).toBeNull();
    });
  });
});
