/**
 * O timbre dos PDFs — logo, cabeçalho da fundação e numeração de páginas.
 *
 * Três páginas geram PDF com jsPDF (`DocumentosImpressao`, `OcorrenciasProva` e
 * `CandidatosImportar`) e as três montavam o MESMO timbre à mão. O `useEffect` que
 * converte o logo em base64 estava copiado verbatim nas três, com a mesma geometria
 * reescrita a cada vez. Este módulo é o único dono dessas medidas.
 *
 * 🔴 **A geometria daqui reproduz EXATAMENTE o que as duas páginas antigas emitiam.** Os
 * documentos que ela gera são impressos e assinados (lista de presença, recibo de
 * pagamento), então mudar espaçamento não é cosmético — é reemitir documento com outro
 * leiaute. As constantes abaixo foram conferidas linha a linha contra o código anterior;
 * quem mexer nelas mexe nos três documentos de uma vez.
 *
 * ⚠️ Este módulo cuida do timbre e da numeração, NÃO do corpo. Cada página monta suas
 * tabelas, decide quebra de página e escreve o próprio rodapé quando ele foge do padrão
 * (ver `numerarPaginas` sobre por que só uma das três a usa).
 */
import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import fevreLogo from "@/assets/fevre-logo.png";

/**
 * `lastAutoTable` é escrito no documento pelo `jspdf-autotable` em tempo de execução, e o
 * pacote não declara isso no `.d.ts`. Sem esta augmentação, todo `finalY` vira
 * `(doc as any)` espalhado pelas páginas — foi o que havia antes.
 */
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable?: { finalY: number };
  }
}

/**
 * A URL do logo, para quem precisa dele numa `<img>` e não no PDF.
 *
 * Existe por causa da pré-visualização de cabeçalho do `DocumentosImpressao`, que mostra
 * em HTML o que o PDF vai imprimir. São a mesma imagem de propósito: se a prévia lesse
 * outro arquivo, ela poderia divergir do documento sem ninguém notar.
 */
export const LOGO_FEVRE = fevreLogo;

/** Fallback quando a prova não traz cabeçalho próprio. Ver `prova_cabecalho_linha1/2`. */
export const TIMBRE_LINHA1_PADRAO = "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA";
export const TIMBRE_LINHA2_PADRAO = "Departamento de Concurso e Implementação Tecnológica";

export const MARGEM_LATERAL = 15;

/** Onde o logo começa, e de onde toda a geometria do timbre é medida. */
const TOPO = 15;
const LADO_DO_LOGO = 20;
/** Recuo da primeira linha centrada em relação ao `TOPO`. */
const PRIMEIRA_LINHA = 4;
/** Entrelinha do bloco centrado. */
const ENTRELINHA = 5;
/** Respiro entre a última linha centrada e o título em negrito. */
const ANTES_DO_TITULO = 9;

/**
 * Carrega o logo da fundação como data URI.
 *
 * ⚠️ Devolve `""` enquanto não carregou, e o `desenharTimbre` trata isso desenhando o
 * PDF **sem logo** em vez de falhar. É de propósito: o documento sem logo ainda serve,
 * um erro no meio da exportação não. Na prática o fetch resolve muito antes de o usuário
 * clicar em exportar, porque o hook roda no mount da página.
 */
export function useLogoBase64(): string {
  const [logoBase64, setLogoBase64] = useState<string>("");

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const resposta = await fetch(fevreLogo);
        const blob = await resposta.blob();
        const leitor = new FileReader();
        leitor.onloadend = () => {
          // ⚠️ O `FileReader` é assíncrono e escapa do `await`: sem esta guarda, uma
          // página desmontada durante a leitura toma `setState` depois do unmount.
          if (!cancelado) setLogoBase64(leitor.result as string);
        };
        leitor.readAsDataURL(blob);
      } catch (erro) {
        console.error("Erro ao carregar logo:", erro);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  return logoBase64;
}

/** Todos os PDFs do sistema são A4 paisagem em milímetros. */
export function criarDocumentoPaisagem(): jsPDF {
  return new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
}

export interface TimbreOpcoes {
  /** O que `useLogoBase64` devolveu. `""` desenha sem logo. */
  logoBase64: string;
  /**
   * Linhas centradas sob o timbre, de cima para baixo — tipicamente linha1, linha2 e o
   * nome do edital; `DocumentosImpressao` acrescenta a unidade como quarta.
   * A posição do título desce junto, então acrescentar linha não sobrepõe nada.
   */
  linhas: string[];
  /** Escrito em negrito abaixo do bloco centrado. */
  titulo: string;
}

/**
 * Desenha logo + bloco centrado + título, e **devolve o Y da linha de base do título**.
 *
 * ⚠️ Devolve o Y do TÍTULO, não o "Y livre logo abaixo" — quem chama soma o próprio
 * respiro. Parece detalhe, mas é o que preserva as três páginas: `OcorrenciasProva` põe a
 * tabela 7mm abaixo do título, enquanto `DocumentosImpressao` reserva 14mm porque
 * escreve a linha do Coordenador Geral no meio — **e reserva mesmo quando não há
 * coordenador**, para que a tabela comece no mesmo lugar nos dois casos. Um helper que
 * devolvesse "o Y livre" teria de saber disso, e não tem como saber.
 */
export function desenharTimbre(doc: jsPDF, { logoBase64, linhas, titulo }: TimbreOpcoes): number {
  const centroX = doc.internal.pageSize.getWidth() / 2;

  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", MARGEM_LATERAL, TOPO, LADO_DO_LOGO, LADO_DO_LOGO);
  }

  doc.setFont("times", "normal");
  doc.setFontSize(11);

  let y = TOPO + PRIMEIRA_LINHA;
  for (const linha of linhas) {
    doc.text(linha, centroX, y, { align: "center" });
    y += ENTRELINHA;
  }

  // `y` já andou uma entrelinha além da última linha escrita; volta e aplica o respiro.
  const yTitulo = y - ENTRELINHA + ANTES_DO_TITULO;
  doc.setFont("times", "bold");
  doc.text(titulo, centroX, yTitulo, { align: "center" });

  return yTitulo;
}

/**
 * Escreve "Página i de N" no rodapé de todas as páginas, num passe final.
 *
 * ⚠️ Só serve para documento cuja numeração é do documento inteiro, e por isso hoje só
 * `CandidatosImportar` a usa. As outras duas numeram diferente **de propósito**, e trocar
 * mudaria o documento emitido: `DocumentosImpressao` reinicia a contagem a cada função
 * ("Página 1 de 3" da lista de FISCAL, depois "Página 1 de 2" da de APOIO), e
 * `OcorrenciasProva` numera dentro do `didDrawPage`, sem total.
 *
 * O passe final é o que permite saber o N: dentro do `didDrawPage` o total ainda não
 * existe, porque as páginas seguintes não foram criadas.
 */
export function numerarPaginas(doc: jsPDF): void {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();

  for (let pagina = 1; pagina <= total; pagina++) {
    doc.setPage(pagina);
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text(`Página ${pagina} de ${total}`, largura / 2, altura - 10, { align: "center" });
  }
}

/**
 * Base visual das tabelas: Times 9, grade preta fina, cabeçalho branco com texto preto.
 *
 * ⚠️ Aplique com spread e sobrescreva o que a tabela precisa (`overflow`, `cellWidth`,
 * `minCellHeight` variam por documento). Não mexa nos valores daqui para atender um caso:
 * são os três documentos ao mesmo tempo.
 */
export const ESTILOS_TABELA: UserOptions["styles"] = {
  font: "times",
  fontSize: 9,
  cellPadding: 2,
  valign: "middle",
  lineColor: [0, 0, 0],
  lineWidth: 0.3,
};

export const ESTILOS_CABECALHO: UserOptions["headStyles"] = {
  fillColor: [255, 255, 255],
  textColor: [0, 0, 0],
  fontStyle: "bold",
};
