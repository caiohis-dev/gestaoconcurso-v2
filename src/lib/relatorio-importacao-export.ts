/**
 * Os dois exports do relatório de importação — XLS e PDF — num lugar só.
 *
 * POR QUE ISTO É UM MÓDULO SEPARADO
 * Até 2026-08-02 este código vivia inteiro dentro de `CandidatosImportar.tsx`, e só o
 * assistente conseguia exportar: quem fechasse a aba sem clicar perdia o relatório para
 * sempre. Com o relatório passando a PERSISTIR no banco, a tela de `/candidatos` precisa
 * exportar o mesmo documento — e duplicar estas ~120 linhas é exatamente o custo que este
 * módulo já pagou uma vez, quando `montarProblemasDoRelatorio` viveu copiada em dois
 * botões e corrigir um deixava o outro mentindo.
 *
 * 🔴 A GEOMETRIA E O CONTEÚDO REPRODUZEM EXATAMENTE o que o assistente emitia antes da
 * extração. Este relatório é anexado a processo; mudar espaçamento, ordem de bloco ou
 * texto de cabeçalho aqui é reemitir documento com outro leiaute. Ver a mesma disciplina
 * em `pdf-timbre.ts`.
 *
 * ⚠️ A DIFERENÇA ENTRE OS DOIS FORMATOS NÃO É COSMÉTICA: o XLS entrega uma lista PLANA
 * para o Excel filtrar e ordenar; o PDF AGRUPA POR CAMPO, porque quem lê o PDF vai
 * corrigir a planilha, e corrigir é trabalho por coluna.
 */
import * as XLSX from "xlsx";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  ESTILOS_CABECALHO,
  ESTILOS_TABELA,
  MARGEM_LATERAL,
  TIMBRE_LINHA1_PADRAO,
  TIMBRE_LINHA2_PADRAO,
  criarDocumentoPaisagem,
  desenharTimbre,
  numerarPaginas,
} from "@/lib/pdf-timbre";
import {
  agruparProblemasPorCampo,
  subtituloDoCampo,
  type ProblemaDoRelatorio,
} from "@/lib/candidatos-import";

/** Respiro entre o título do timbre e a primeira coisa que o corpo escreve. */
const RESPIRO_APOS_TITULO = 7;
/** Espaço entre o fim de uma tabela e o subtítulo da próxima. */
const ENTRE_BLOCOS = 15;
/** Abaixo disto não cabe subtítulo + cabeçalho de tabela: melhor virar a página. */
const ALTURA_MINIMA_DE_BLOCO = 40;

/**
 * Uma linha do de-para de cargos — que texto sujo da planilha virou que cargo do catálogo.
 *
 * ⚠️ **Só o ASSISTENTE tem isto.** O de-para NÃO é persistido (decisão de escopo de
 * 02/08), então a exportação feita a partir do banco, em `/candidatos`, sai sem ele. As
 * duas funções abaixo tratam a ausência como caso normal, não como erro.
 */
export interface DeParaCargo {
  "Texto na planilha": string;
  "Cargo do sistema": string;
  Linhas: number;
  Origem: string;
}

/**
 * O relatório em `.xlsx` — lista plana, para trabalhar no Excel.
 *
 * ⚠️ As CHAVES de `ProblemaDoRelatorio` viram o cabeçalho das colunas (`json_to_sheet` usa
 * o nome da propriedade). É por isso que elas têm acento e espaço, e por isso renomeá-las
 * muda a planilha entregue.
 */
export function exportarRelatorioXLS({
  problemas,
  deParaCargos,
  nomeBase,
}: {
  problemas: ProblemaDoRelatorio[];
  /** Omitido quando a origem é o banco: o de-para não é persistido. */
  deParaCargos?: DeParaCargo[];
  nomeBase: string;
}): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      problemas.length > 0
        ? problemas
        : // Uma planilha sem NENHUMA linha abriria no Excel sem cabeçalho, parecendo
          // arquivo corrompido. A linha-sentinela diz que o vazio é o resultado.
          [{ "Nº de Inscrição": "", Situação: "Nenhum problema", Campo: "", Detalhe: "" }],
    ),
    "Problemas",
  );

  // Aba própria para o de-para dos cargos: é o registro auditável de que texto virou que
  // cargo naquela importação. Sem ela, a decisão de sanitização só existe dentro do banco.
  //
  // ⚠️ A condição é `!== undefined`, e NÃO `.length > 0`: o assistente sempre acrescenta a
  // aba, mesmo vazia, e mudar isso mudaria o arquivo que ele emite hoje.
  if (deParaCargos !== undefined) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deParaCargos), "Cargos");
  }

  XLSX.writeFile(wb, `${nomeBase}_relatorio.xlsx`);
}

/**
 * O mesmo relatório em documento timbrado A4 paisagem — para anexar a processo e imprimir.
 *
 * ⚠️ **Lança** em vez de tratar: quem chama decide o que dizer ao usuário. O assistente
 * mostra um `<Alert>` explicando que os inscritos JÁ estão salvos; a tela de `/candidatos`
 * não tem essa ressalva a fazer, porque ali nada foi gravado.
 */
export function exportarRelatorioPDF({
  problemas,
  deParaCargos,
  logoBase64,
  nomeEdital,
  nomeBase,
}: {
  problemas: ProblemaDoRelatorio[];
  deParaCargos?: DeParaCargo[];
  logoBase64: string;
  nomeEdital: string;
  nomeBase: string;
}): void {
  const problemasPorCampo = agruparProblemasPorCampo(problemas);

  const doc = criarDocumentoPaisagem();
  const alturaDaPagina = doc.internal.pageSize.getHeight();
  const linhasDoTimbre = [TIMBRE_LINHA1_PADRAO, TIMBRE_LINHA2_PADRAO, nomeEdital || "EDITAL"];

  const paginasTimbradas = new Set<number>();
  let topoDoCorpo = 0;

  /**
   * Timbra a página atual UMA VEZ. O Set é o que impede o timbre duplicado: a página é
   * timbrada tanto por quem a cria de propósito quanto pelo `didDrawPage` do autoTable,
   * que dispara para toda página que a tabela ocupar — inclusive as que ela mesma criou ao
   * transbordar.
   */
  const timbrar = () => {
    const pagina = doc.getCurrentPageInfo().pageNumber;
    if (paginasTimbradas.has(pagina)) return;
    paginasTimbradas.add(pagina);
    // Aqui o timbre tem altura FIXA (sempre 3 linhas + título), então o Y devolvido é o
    // mesmo em toda página — guardá-lo é o que mantém `startY` e `margin.top` de acordo.
    // Se um dia as linhas variarem por página, isto deixa de valer.
    topoDoCorpo =
      desenharTimbre(doc, {
        logoBase64,
        linhas: linhasDoTimbre,
        titulo: "RELATÓRIO DE IMPORTAÇÃO DE CANDIDATOS",
      }) + RESPIRO_APOS_TITULO;
  };

  // Timbra a página 1 antes de qualquer tabela: é esta chamada que define `topoDoCorpo`, e
  // o `margin.top` das tabelas depende dele já estar valendo.
  timbrar();

  const margensDaTabela = {
    top: topoDoCorpo,
    left: MARGEM_LATERAL,
    right: MARGEM_LATERAL,
    bottom: 15,
  };

  let y = topoDoCorpo;

  const escreverSubtitulo = (texto: string) => {
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.text(texto, MARGEM_LATERAL, y);
    y += 5;
  };

  if (deParaCargos && deParaCargos.length > 0) {
    // O de-para vem primeiro por ser o registro auditável da importação: que texto sujo
    // virou que cargo. É a mesma razão da aba "Cargos" no XLS.
    escreverSubtitulo("Associação de Cargos");
    autoTable(doc, {
      startY: y,
      head: [["Texto na Planilha", "Cargo do Sistema", "Pagantes", "Origem"]],
      body: deParaCargos.map((c) => [
        c["Texto na planilha"],
        c["Cargo do sistema"],
        c.Linhas.toString(),
        c.Origem,
      ]),
      theme: "grid",
      margin: margensDaTabela,
      styles: ESTILOS_TABELA,
      headStyles: { ...ESTILOS_CABECALHO, minCellHeight: 8 },
      didDrawPage: timbrar,
    });
    y = (doc.lastAutoTable?.finalY ?? y) + ENTRE_BLOCOS;
  }

  for (const { campo, queixas } of problemasPorCampo) {
    if (y > alturaDaPagina - ALTURA_MINIMA_DE_BLOCO) {
      doc.addPage();
      timbrar();
      y = topoDoCorpo;
    }

    // ⚠️ O título NÃO é montado aqui: `subtituloDoCampo` é quem sabe que "Pagamento" não é
    // problema e merece texto próprio. Ver o porquê lá.
    escreverSubtitulo(subtituloDoCampo(campo));
    autoTable(doc, {
      startY: y,
      head: [["Nº de Inscrição", "Situação", "Detalhe"]],
      body: queixas.map((p) => [p["Nº de Inscrição"], p.Situação, p.Detalhe]),
      theme: "grid",
      margin: margensDaTabela,
      // ⚠️ `linebreak`, NÃO `hidden`. Com `hidden` a coluna Detalhe era CORTADA na largura
      // da célula, sem reticências e sem aviso — e o detalhe é a única coisa que este
      // relatório existe para entregar ("CPF tem 10 dígitos"). Um relatório de erros que
      // corta a mensagem do erro em silêncio é perda silenciosa.
      styles: { ...ESTILOS_TABELA, overflow: "linebreak" },
      headStyles: { ...ESTILOS_CABECALHO, minCellHeight: 8 },
      columnStyles: {
        // 30mm, e não os 20 de quando a coluna se chamava "Linha": o cabeçalho
        // "Nº de Inscrição" tem 15 caracteres e em 20mm quebraria em duas linhas.
        0: { cellWidth: 30, halign: "center" },
        1: { cellWidth: 60 },
        2: { cellWidth: "auto" },
      },
      didDrawPage: timbrar,
    });
    y = (doc.lastAutoTable?.finalY ?? y) + ENTRE_BLOCOS;
  }

  // Depois de tudo, porque só agora se sabe o total.
  numerarPaginas(doc);

  const carimbo = format(new Date(), "dd-MM-yyyy HH-mm-ss");
  doc.save(`${nomeBase}_relatorio_${carimbo}.pdf`);
}
