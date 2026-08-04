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
  CAMPO_SALA_ESPECIAL,
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
 * O que se sabe sobre a coluna de sala especial NAQUELA importação.
 *
 * Existe porque o bloco de sala especial passou a aparecer no relatório **mesmo sem
 * pedido nenhum** (decisão do usuário, 2026-08-04) — e aí o relatório precisa AFIRMAR
 * alguma coisa sobre o vazio. As três respostas possíveis não são a mesma:
 *
 *   • `"pareada"`      — a coluna foi apontada e ninguém pediu. *Isso* é "nenhuma solicitada".
 *   • `"nao-pareada"`  — a coluna não foi apontada, então **nada pôde ser lido**. Dizer
 *                        "nenhuma solicitada" aqui seria afirmar como fato a consequência
 *                        de um campo em branco. 🔴 Hoje este é o caso NORMAL: o arquivo
 *                        real de 7.416 linhas não tem a coluna.
 *   • `"desconhecida"` — o relatório veio do BANCO (`/candidatos`), que guarda só os
 *                        problemas e não registra o que foi pareado. O texto então fala do
 *                        RELATÓRIO, não da realidade.
 */
export type SalaEspecialNoRelatorio = "pareada" | "nao-pareada" | "desconhecida";

/**
 * O que o bloco de sala especial diz quando não há pedido nenhum.
 *
 * ⚠️ As três frases são diferentes de propósito — ver `SalaEspecialNoRelatorio`. Unificá-las
 * na primeira faria o documento afirmar que ninguém pediu sala especial em toda importação
 * feita sem a coluna, que é a maioria delas hoje. O relatório é anexado a processo.
 */
function mensagemSemSalaEspecial(estado: SalaEspecialNoRelatorio): string {
  if (estado === "nao-pareada") {
    return (
      "A coluna de sala especial não foi indicada no pareamento desta importação — " +
      "nenhum pedido pôde ser lido."
    );
  }
  if (estado === "desconhecida") {
    return "Nenhuma sala especial registrada neste relatório.";
  }
  return "Nenhuma sala especial solicitada.";
}

/**
 * Os blocos do relatório, garantindo que o de **sala especial exista sempre**.
 *
 * 🔴 O bloco vazio é o ponto: até 2026-08-04 ele simplesmente não aparecia quando ninguém
 * pedia, e quem lia o documento não tinha como distinguir "ninguém pediu" de "o relatório
 * não cobre isso". Ausência não informa nada — é justamente o formato de erro que este
 * módulo mais evita.
 *
 * O bloco entra na lista ANTES da ordenação por campo, e não emendado no fim: assim ele
 * aparece no MESMO lugar tendo pedidos ou não. Posição que muda conforme o conteúdo faria
 * quem confere dois relatórios seguidos procurar o bloco onde ele não está.
 */
function blocosDoRelatorio(
  problemas: ProblemaDoRelatorio[],
): { campo: string; queixas: ProblemaDoRelatorio[] }[] {
  const blocos = agruparProblemasPorCampo(problemas);
  if (blocos.some((b) => b.campo === CAMPO_SALA_ESPECIAL)) return blocos;

  return [...blocos, { campo: CAMPO_SALA_ESPECIAL, queixas: [] }].sort((a, b) =>
    a.campo.localeCompare(b.campo, "pt-BR"),
  );
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
  salaEspecial = "desconhecida",
  nomeBase,
}: {
  problemas: ProblemaDoRelatorio[];
  /** Omitido quando a origem é o banco: o de-para não é persistido. */
  deParaCargos?: DeParaCargo[];
  /** O que se sabe da coluna de sala especial. Omitido = `"desconhecida"`. */
  salaEspecial?: SalaEspecialNoRelatorio;
  nomeBase: string;
}): void {
  const wb = XLSX.utils.book_new();

  /**
   * ⚠️ `Record<keyof ProblemaDoRelatorio, string>` e NÃO `ProblemaDoRelatorio[]`: as duas
   * sentinelas abaixo não são problemas, e a `Situação` delas está de propósito fora da
   * união (`""` e `"Nenhum problema"`). O `keyof` mantém cravados os quatro NOMES de
   * coluna, que é o que de fato não pode divergir — eles viram o cabeçalho da planilha.
   */
  const linhas: Record<keyof ProblemaDoRelatorio, string>[] = [...problemas];

  // ⚠️ A sentinela do relatório INTEIRAMENTE vazio continua valendo e vem PRIMEIRO: uma
  // planilha sem nenhuma linha abriria no Excel sem cabeçalho, parecendo arquivo
  // corrompido. Ela não foi substituída pela de sala especial — as duas dizem coisas
  // diferentes, e um relatório limpo sem coluna de sala especial precisa das duas.
  if (problemas.length === 0) {
    linhas.push({ "Nº de Inscrição": "", Situação: "Nenhum problema", Campo: "", Detalhe: "" });
  }

  // 🔵 2026-08-04: o assunto "sala especial" aparece MESMO sem pedido. No PDF isso é um
  // subtítulo com uma frase; aqui, numa lista plana que o Excel filtra, é uma linha com o
  // Campo preenchido — é o `Campo` que a pessoa filtra para achar o assunto.
  if (!problemas.some((p) => p.Campo === CAMPO_SALA_ESPECIAL)) {
    linhas.push({
      "Nº de Inscrição": "",
      Situação: "",
      Campo: CAMPO_SALA_ESPECIAL,
      Detalhe: mensagemSemSalaEspecial(salaEspecial),
    });
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Problemas");

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
  salaEspecial = "desconhecida",
  logoBase64,
  nomeEdital,
  nomeBase,
}: {
  problemas: ProblemaDoRelatorio[];
  deParaCargos?: DeParaCargo[];
  /** O que se sabe da coluna de sala especial. Omitido = `"desconhecida"`. */
  salaEspecial?: SalaEspecialNoRelatorio;
  logoBase64: string;
  nomeEdital: string;
  nomeBase: string;
}): void {
  const problemasPorCampo = blocosDoRelatorio(problemas);

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

    // 🔵 2026-08-04: o bloco de sala especial existe mesmo VAZIO, e aí não há tabela — só
    // o subtítulo e uma frase. Uma tabela de uma linha só, com as três colunas vazias e um
    // aviso dentro, pareceria um pedido malformado; a frase corrida diz o que é.
    if (queixas.length === 0) {
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.text(mensagemSemSalaEspecial(salaEspecial), MARGEM_LATERAL, y);
      y += ENTRE_BLOCOS;
      continue;
    }

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
