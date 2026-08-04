/**
 * Bateria dos DOIS exports do relatório de importação.
 *
 * POR QUE ESTE ARQUIVO EXISTE, sendo que o assistente e o diálogo já têm bateria de UI:
 * o bloco de **sala especial vazio** (2026-08-04) é uma afirmação que o documento faz
 * sobre o que NÃO aconteceu, e as três frases possíveis dependem de um parâmetro que só o
 * chamador conhece. Testar isso pela tela exigiria montar uma importação inteira para
 * cada frase; aqui é uma chamada de função.
 *
 * ⚠️ `XLSX.writeFile` e `doc.save` GRAVAM ARQUIVO DE VERDADE no jsdom — viram spy, como
 * nas baterias de UI. O `doc.text` é interceptado (e chamado através) para se poder
 * afirmar o que o PDF escreveu, que é a única saída observável dele aqui.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import type { ProblemaDoRelatorio } from "@/lib/candidatos-import";

const { escreverXlsx } = vi.hoisted(() => ({ escreverXlsx: vi.fn() }));
vi.mock("xlsx", async () => {
  const real = await vi.importActual<typeof import("xlsx")>("xlsx");
  return { ...real, writeFile: escreverXlsx };
});

const { salvarPdf, textosDoPdf } = vi.hoisted(() => ({
  salvarPdf: vi.fn(),
  textosDoPdf: [] as string[],
}));
vi.mock("@/lib/pdf-timbre", async () => {
  const real = await vi.importActual<typeof import("@/lib/pdf-timbre")>("@/lib/pdf-timbre");
  return {
    ...real,
    criarDocumentoPaisagem: () => {
      const doc = real.criarDocumentoPaisagem();
      const escrever = doc.text.bind(doc);
      doc.text = ((texto: string, ...resto: unknown[]) => {
        if (typeof texto === "string") textosDoPdf.push(texto);
        return (escrever as (...a: unknown[]) => unknown)(texto, ...resto);
      }) as typeof doc.text;
      doc.save = salvarPdf as unknown as typeof doc.save;
      return doc;
    },
  };
});

import { exportarRelatorioPDF, exportarRelatorioXLS } from "@/lib/relatorio-importacao-export";

/** Uma queixa qualquer, para o relatório não ficar vazio quando o teste não quer isso. */
const QUEIXA: ProblemaDoRelatorio = {
  "Nº de Inscrição": "375",
  Situação: "Importada com ressalva",
  Campo: "CPF",
  Detalhe: "tem 10 dígitos, e um CPF tem 11",
};

const PEDIDO: ProblemaDoRelatorio = {
  "Nº de Inscrição": "1043",
  Situação: "Importada com sala especial",
  Campo: "Sala Especial",
  Detalhe: "MARIA SOARES — Ledor e prova ampliada",
};

/** As linhas da aba `Problemas` do último XLS escrito. */
function linhasDoXlsEscrito(): Record<string, string>[] {
  const [workbook] = escreverXlsx.mock.calls[0] as [XLSX.WorkBook];
  return XLSX.utils.sheet_to_json(workbook.Sheets["Problemas"]);
}

beforeEach(() => {
  escreverXlsx.mockClear();
  salvarPdf.mockClear();
  textosDoPdf.length = 0;
});

describe("o bloco de sala especial existe SEMPRE", () => {
  it("🔴 PDF: sem nenhum pedido, o subtítulo aparece com a frase no lugar da tabela", async () => {
    // Até 2026-08-04 o bloco simplesmente não existia quando ninguém pedia, e quem lia o
    // documento não tinha como distinguir "ninguém pediu" de "o relatório não cobre isso".
    // Ausência não informa nada — e este relatório é anexado a processo.
    exportarRelatorioPDF({
      problemas: [QUEIXA],
      salaEspecial: "pareada",
      logoBase64: "",
      nomeEdital: "EDITAL 001",
      nomeBase: "teste",
    });

    expect(textosDoPdf).toContain("Lista de inscritos com pedido de sala especial");
    expect(textosDoPdf).toContain("Nenhuma sala especial solicitada.");
  });

  it("PDF: com pedido, sai a tabela e NÃO a frase de vazio", async () => {
    // CONTROLE POSITIVO: sem ele, um bloco que escrevesse a frase sempre passaria no teste
    // acima — e o documento diria "nenhuma solicitada" logo acima da lista de pedidos.
    exportarRelatorioPDF({
      problemas: [PEDIDO],
      salaEspecial: "pareada",
      logoBase64: "",
      nomeEdital: "EDITAL 001",
      nomeBase: "teste",
    });

    expect(textosDoPdf).toContain("Lista de inscritos com pedido de sala especial");
    expect(textosDoPdf).not.toContain("Nenhuma sala especial solicitada.");
  });

  it("XLS: sem nenhum pedido, entra UMA linha com o Campo preenchido", async () => {
    // A planilha não tem subtítulo: é lista plana que o Excel filtra, e é pelo `Campo` que
    // a pessoa acha o assunto. Por isso a informação vira linha, não cabeçalho.
    exportarRelatorioXLS({ problemas: [QUEIXA], salaEspecial: "pareada", nomeBase: "teste" });

    const linhas = linhasDoXlsEscrito();
    const salaEspecial = linhas.filter((l) => l["Campo"] === "Sala Especial");
    expect(salaEspecial).toHaveLength(1);
    expect(salaEspecial[0]["Detalhe"]).toBe("Nenhuma sala especial solicitada.");
  });

  it("XLS: com pedido, NÃO acrescenta a linha de vazio", async () => {
    exportarRelatorioXLS({ problemas: [PEDIDO], salaEspecial: "pareada", nomeBase: "teste" });

    const linhas = linhasDoXlsEscrito();
    expect(linhas.filter((l) => l["Campo"] === "Sala Especial")).toHaveLength(1);
    expect(linhas[0]["Detalhe"]).toContain("MARIA SOARES");
  });
});

describe("🔴 as três frases do vazio NÃO são a mesma", () => {
  const frase = (salaEspecial: "pareada" | "nao-pareada" | "desconhecida") => {
    escreverXlsx.mockClear();
    exportarRelatorioXLS({ problemas: [QUEIXA], salaEspecial, nomeBase: "teste" });
    return linhasDoXlsEscrito().find((l) => l["Campo"] === "Sala Especial")?.["Detalhe"];
  };

  it("coluna pareada e ninguém pediu: aí sim é 'nenhuma solicitada'", () => {
    expect(frase("pareada")).toBe("Nenhuma sala especial solicitada.");
  });

  it("⭐ coluna NÃO pareada: o documento não pode afirmar que ninguém pediu", () => {
    // 🔴 Hoje este é o caso NORMAL — o arquivo real de 7.416 linhas não tem a coluna. Com
    // uma frase só, TODA importação feita hoje afirmaria, num documento oficial, uma
    // ausência de pedidos que ninguém verificou. O que houve foi um campo em branco.
    expect(frase("nao-pareada")).toMatch(/não foi indicada/);
    expect(frase("nao-pareada")).not.toMatch(/Nenhuma sala especial solicitada/);
  });

  it("origem BANCO: a frase fala do RELATÓRIO, não da realidade", () => {
    // O relatório persistido guarda só os problemas — não registra o que foi pareado.
    // De `/candidatos` não dá para saber se a coluna existiu, então o texto se limita ao
    // que é verificável: o que está (ou não está) neste relatório.
    expect(frase("desconhecida")).toBe("Nenhuma sala especial registrada neste relatório.");
  });

  it("o padrão de quem não informa é o mais cauteloso dos três", () => {
    // Sem parâmetro, é `desconhecida`. Um default "pareada" faria o chamador que esqueceu
    // de informar emitir a afirmação MAIS forte — o oposto do que um default deve fazer.
    escreverXlsx.mockClear();
    exportarRelatorioXLS({ problemas: [QUEIXA], nomeBase: "teste" });
    expect(linhasDoXlsEscrito().find((l) => l["Campo"] === "Sala Especial")?.["Detalhe"]).toBe(
      "Nenhuma sala especial registrada neste relatório.",
    );
  });
});

describe("a sentinela do relatório VAZIO continua valendo", () => {
  it("⚠️ relatório sem problema nenhum leva as DUAS linhas", async () => {
    // Elas dizem coisas diferentes: uma que não houve problema, outra que não houve pedido
    // de sala especial. A de sala especial não substituiu a antiga — sem a "Nenhum
    // problema", uma planilha limpa abriria parecendo que só o assunto sala especial foi
    // avaliado.
    exportarRelatorioXLS({ problemas: [], salaEspecial: "pareada", nomeBase: "teste" });

    const linhas = linhasDoXlsEscrito();
    expect(linhas.map((l) => l["Situação"] ?? "")).toContain("Nenhum problema");
    expect(linhas.some((l) => l["Campo"] === "Sala Especial")).toBe(true);
  });
});
