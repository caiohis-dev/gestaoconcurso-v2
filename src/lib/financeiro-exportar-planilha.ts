/**
 * Exportação de matriz para `.xls` (download). Portado de
 * `gera_cnab_pix/src/lib/exportar_planilha.ts` na Fase 2 do roadmap-modulo-financeiro.yaml.
 */
import * as XLSX from 'xlsx'

/** Valor de célula aceito na exportação. */
export type CelulaExport = string | number

/**
 * Gera e baixa um arquivo `.xls` (Excel 97-2004) a partir de uma matriz de
 * linhas × colunas (a primeira linha é o cabeçalho).
 */
export const baixarXls = (
  linhas: CelulaExport[][],
  nomeArquivo: string,
  nomeAba = 'Dados',
): void => {
  const worksheet = XLSX.utils.aoa_to_sheet(linhas)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, nomeAba)
  // bookType 'xls' => BIFF8 (Excel 97-2004), atende ao formato .xls pedido.
  XLSX.writeFile(workbook, nomeArquivo, { bookType: 'xls' })
}
