import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  setTableResult,
  resetSupabaseMock,
  buildersDaTabela,
  type QueryResult,
} from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";
import { RelatorioImportacaoDialog } from "@/components/RelatorioImportacaoDialog";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

/**
 * ⚠️ `XLSX.writeFile` GRAVA ARQUIVO DE VERDADE no jsdom, como `doc.save` — a suíte
 * passaria a sujar a raiz do repo a cada execução. Vira spy, que de quebra permite afirmar
 * QUAIS abas o workbook levou.
 */
const { escreverXlsx } = vi.hoisted(() => ({ escreverXlsx: vi.fn() }));
vi.mock("xlsx", async () => {
  const real = await vi.importActual<typeof import("xlsx")>("xlsx");
  return { ...real, writeFile: escreverXlsx };
});

/** Mesmo arranjo de `CandidatosImportar.ui.test.tsx` — ver o porquê de cada peça lá. */
const { pdfDeveFalhar, salvarPdf } = vi.hoisted(() => ({
  pdfDeveFalhar: { valor: false },
  salvarPdf: vi.fn(),
}));
vi.mock("@/lib/pdf-timbre", async () => {
  const real = await vi.importActual<typeof import("@/lib/pdf-timbre")>("@/lib/pdf-timbre");
  return {
    ...real,
    useLogoBase64: () => "",
    criarDocumentoPaisagem: () => {
      if (pdfDeveFalhar.valor) throw new Error("canvas indisponível");
      const doc = real.criarDocumentoPaisagem();
      doc.save = salvarPdf as unknown as typeof doc.save;
      return doc;
    },
  };
});

/**
 * O acesso em leitura ao relatório PERSISTIDO (`candidatos_relatorio_importacao`).
 *
 * 🔴 O que estes testes guardam, e que não é óbvio: a tabela guarda só PROBLEMAS, então
 * **zero linhas é ambíguo** — pode ser "importação impecável" ou "nunca importou". Quem
 * desempata é a contagem de inscritos do edital, e errar isso faz a tela dizer
 * "importação limpa" para um edital que nunca recebeu planilha nenhuma.
 */
describe("RelatorioImportacaoDialog", () => {
  const EDITAL = "edital-1";

  /**
   * Ver o helper homônimo em `Candidatos.ui.test.tsx`: o `count` viaja junto do `data` no
   * mock, mas `QueryResult` não o declara — daí o cast, que é a convenção do repo.
   */
  const resultado = (linhas: unknown[], total: number) =>
    ({ data: linhas, error: null, count: total }) as unknown as QueryResult<unknown[]>;

  beforeEach(() => {
    resetSupabaseMock();
    escreverXlsx.mockClear();
    salvarPdf.mockClear();
    pdfDeveFalhar.valor = false;
    setTableResult("candidatos_relatorio_importacao", resultado([], 0));
  });

  const abrir = (props: Record<string, unknown> = {}) =>
    renderWithProviders(
      <RelatorioImportacaoDialog
        open
        onOpenChange={vi.fn()}
        editalId={EDITAL}
        editalNome="Edital 001/2026"
        totalDoEdital={100}
        {...props}
      />,
    );

  const LINHAS = [
    {
      id: "r1",
      n_inscricao: "37",
      situacao: "Não importada (inscrição não paga)",
      campo: "Pagamento",
      detalhe: "DANIEL MARQUES — inscrição não consta como paga",
    },
    {
      id: "r2",
      n_inscricao: "5223",
      situacao: "Importada com ressalva",
      campo: "E-mail",
      detalhe: '"x@y,com" é inválido — gravado como veio',
    },
    {
      id: "r3",
      n_inscricao: "1043",
      situacao: "Importada com sala especial",
      campo: "Sala Especial",
      detalhe: "MARIA SOARES — Ledor e prova ampliada em fonte 24",
    },
  ];

  describe("o vazio, que são DOIS estados diferentes", () => {
    it("🔴 edital SEM inscritos: diz que não há importação, NÃO que foi limpa", async () => {
      // Se este ramo sumir, um edital recém-criado passa a anunciar "a última importação
      // não registrou problemas" — afirmando o sucesso de algo que nunca aconteceu.
      abrir({ totalDoEdital: 0 });

      expect(
        await screen.findByText(/ainda não tem inscritos importados/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/não registrou nenhum problema/i)).not.toBeInTheDocument();
    });

    it("⭐ edital COM inscritos: diz que a importação foi limpa", async () => {
      // ⚠️ Este teste também exigia uma RESSALVA sobre importações anteriores a 02/08,
      // que não gravavam relatório e cairiam aqui sem que "sem problemas" fosse verdade.
      // Decisão do usuário em 02/08: NÃO tratar esse caso — a v2 sobe com a tabela já
      // existindo, então ele só existe em base de desenvolvimento e some na primeira
      // reimportação. A asserção saiu junto com o texto.
      abrir({ totalDoEdital: 100 });

      expect(await screen.findByText(/não registrou nenhum problema/i)).toBeInTheDocument();
    });
  });

  describe("com relatório", () => {
    beforeEach(() =>
      setTableResult("candidatos_relatorio_importacao", resultado(LINHAS, 3)),
    );

    it("mostra as quatro colunas e o total de ocorrências", async () => {
      abrir();

      expect(await screen.findByText("3 ocorrência(s) registrada(s)")).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Nº de Inscrição" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Detalhe" })).toBeInTheDocument();
      expect(screen.getByText("DANIEL MARQUES — inscrição não consta como paga")).toBeInTheDocument();
    });

    it("🔴 'não paga' NÃO é pintada de vermelho — não é defeito a corrigir", async () => {
      // Mesma razão de o card "Sem pagamento" ser separado de "Não importados" no passo 5
      // do assistente: erro de dado se corrige na planilha, não-pagamento é o filtro
      // funcionando. Pintar as duas igual manda a pessoa caçar erro onde não há.
      abrir();

      const naoPaga = await screen.findByText("Não importada (inscrição não paga)");
      const comRessalva = screen.getByText("Importada com ressalva");
      expect(naoPaga.className).not.toMatch(/destructive/);
      expect(comRessalva.className).not.toMatch(/destructive/);
    });

    it("🔴 'sala especial' NÃO é vermelha — a linha entrou SEM defeito nenhum", async () => {
      // Um grau além do não-pagamento: aqui não há sequer linha de fora. O inscrito
      // entrou inteiro, e a linha existe no relatório porque alguém tem de providenciar a
      // sala. Vermelho aqui mandaria procurar problema onde há trabalho a fazer.
      abrir();

      const salaEspecial = await screen.findByText("Importada com sala especial");
      expect(salaEspecial.className).not.toMatch(/destructive/);
      // E o pedido chega INTEIRO à tela: é a única coisa que esta linha entrega.
      expect(
        screen.getByText("MARIA SOARES — Ledor e prova ampliada em fonte 24"),
      ).toBeInTheDocument();
    });

    it("⚠️ pede ao servidor a fatia paginada, e ORDENADA — senão a paginação repete linha", async () => {
      // A tabela não guarda a ordem da planilha (não há coluna `ordem`, e `created_at` é
      // igual para todas as linhas da transação). Sem ORDER BY explícito o Postgres não
      // promete ordem nenhuma, e páginas diferentes podem trazer a mesma linha duas vezes.
      abrir();
      await screen.findByText("3 ocorrência(s) registrada(s)");

      const builder = buildersDaTabela("candidatos_relatorio_importacao")[0];
      expect(builder.eq).toHaveBeenCalledWith("edital_id", EDITAL);
      expect(builder.order).toHaveBeenCalledWith("campo", { ascending: true });
      expect(builder.order).toHaveBeenCalledWith("n_inscricao", { ascending: true });
      expect(builder.range).toHaveBeenCalledWith(0, 49);
    });

    it("⭐ o total vem do count do SERVIDOR, não do tamanho da página", async () => {
      // 🔴 O PostgREST corta em max_rows=1000. Se o total viesse do array, um relatório de
      // 3.000 linhas anunciaria "1000 ocorrências" e a pessoa concluiria que são todas —
      // exatamente a perda silenciosa que a paginação existe para evitar.
      setTableResult("candidatos_relatorio_importacao", resultado(LINHAS, 3000));
      abrir();

      expect(await screen.findByText("3000 ocorrência(s) registrada(s)")).toBeInTheDocument();
      expect(screen.getByText(/Página 1 de 60/)).toBeInTheDocument();
    });

    it("navega para a próxima página pedindo a fatia seguinte", async () => {
      setTableResult("candidatos_relatorio_importacao", resultado(LINHAS, 120));
      const user = userEvent.setup();
      abrir();
      await screen.findByText("120 ocorrência(s) registrada(s)");

      await user.click(screen.getByRole("button", { name: /Próxima/i }));

      await waitFor(() => {
        const ranges = buildersDaTabela("candidatos_relatorio_importacao").flatMap((b) =>
          b.range.mock.calls,
        );
        expect(ranges).toContainEqual([50, 99]);
      });
    });
  });

  describe("exportação", () => {
    beforeEach(() =>
      setTableResult("candidatos_relatorio_importacao", resultado(LINHAS, 2)),
    );

    it("🔴 exporta o relatório INTEIRO, não a página que está na tela", async () => {
      // ⭐ O TESTE QUE MAIS IMPORTA AQUI. A tela mostra 50 linhas por página; exportar a
      // partir delas entregaria um arquivo TRUNCADO com cara de completo — e o arquivo é
      // o que alguém anexa a processo. A busca própria (`buscarRelatorioCompleto`) pede
      // fatias de 1.000, que é o teto do PostgREST.
      const user = userEvent.setup();
      abrir();
      await screen.findByText("2 ocorrência(s) registrada(s)");

      await user.click(screen.getByRole("button", { name: /Baixar Planilha/i }));

      await waitFor(() => expect(escreverXlsx).toHaveBeenCalledTimes(1));
      const ranges = buildersDaTabela("candidatos_relatorio_importacao").flatMap((b) =>
        b.range.mock.calls,
      );
      // A fatia de 1.000 é a da EXPORTAÇÃO; a de 49 é a da tela. As duas têm de existir —
      // se só houvesse [0,49], o export estaria saindo da página visível.
      expect(ranges).toContainEqual([0, 999]);
    });

    it("⭐ o XLS sai SEM a aba de Cargos — o de-para não é persistido", async () => {
      // Passar `[]` acrescentaria uma aba vazia, o que é pior que não ter: pareceria que o
      // de-para se perdeu. Ele simplesmente não existe fora do assistente.
      const user = userEvent.setup();
      abrir();
      await screen.findByText("2 ocorrência(s) registrada(s)");

      await user.click(screen.getByRole("button", { name: /Baixar Planilha/i }));

      await waitFor(() => expect(escreverXlsx).toHaveBeenCalledTimes(1));
      const [workbook] = escreverXlsx.mock.calls[0] as [{ SheetNames: string[] }];
      expect(workbook.SheetNames).toEqual(["Problemas"]);
    });

    it("o PDF é gerado e nomeado pelo edital", async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByText("2 ocorrência(s) registrada(s)");

      await user.click(screen.getByRole("button", { name: /Baixar Documento/i }));

      await waitFor(() => expect(salvarPdf).toHaveBeenCalledTimes(1));
      expect(salvarPdf.mock.calls[0][0]).toMatch(/^Edital 001-2026_relatorio_.+\.pdf$/);
    });

    it("🔴 falha ao gerar o PDF aparece NA TELA, não só no console", async () => {
      // Foi um `catch` mudo que fez o assistente parecer travado ao falhar a geração.
      pdfDeveFalhar.valor = true;
      const user = userEvent.setup();
      abrir();
      await screen.findByText("2 ocorrência(s) registrada(s)");

      await user.click(screen.getByRole("button", { name: /Baixar Documento/i }));

      expect(await screen.findByText(/Não foi possível gerar o arquivo/i)).toBeInTheDocument();
    });
  });

  it("⚠️ fechado, NÃO consulta o banco", async () => {
    // O diálogo fica montado na página o tempo todo. Sem esta guarda, toda visita a
    // /candidatos dispararia uma consulta de relatório que ninguém pediu.
    abrir({ open: false });

    await waitFor(() =>
      expect(buildersDaTabela("candidatos_relatorio_importacao")).toHaveLength(0),
    );
  });
});
