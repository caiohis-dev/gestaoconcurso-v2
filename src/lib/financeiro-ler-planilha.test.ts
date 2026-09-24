import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { lerPlanilha } from './financeiro-ler-planilha'

/**
 * Monta um .xlsx de verdade em memória — mesmo padrão de
 * `src/pages/CandidatosImportar.ui.test.tsx` (função `planilha`).
 *
 * O `arrayBuffer` é redefinido quando o jsdom não o traz: `lerPlanilha` chama
 * `file.arrayBuffer()`, e nem toda versão de jsdom implementa `Blob.arrayBuffer`.
 */
function arquivoXlsx(matriz: unknown[][], nome = 'planilha.xlsx'): File {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matriz), 'Planilha1')
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const file = new File([buffer], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
  }
  return file
}

describe('lerPlanilha', () => {
  it('lê a matriz de uma planilha .xlsx, célula a célula', async () => {
    const file = arquivoXlsx([
      ['Nome', 'Valor'],
      ['Zeca', 150.5],
    ])
    const matriz = await lerPlanilha(file)
    expect(matriz).toEqual([
      ['Nome', 'Valor'],
      ['Zeca', '150.5'],
    ])
  })

  it('rejeita extensão que não seja .xls/.xlsx', async () => {
    const file = new File(['a,b'], 'planilha.csv', { type: 'text/csv' })
    await expect(lerPlanilha(file)).rejects.toThrow(/Formato não suportado/)
  })

  it('células vazias viram string vazia, preservando o alinhamento das colunas', async () => {
    const file = arquivoXlsx([
      ['Nome', 'CPF', 'Valor'],
      ['Zeca', '', 150],
    ])
    const matriz = await lerPlanilha(file)
    expect(matriz[1]).toEqual(['Zeca', '', '150'])
  })

  it('aceita .xls (não só .xlsx)', async () => {
    const file = arquivoXlsx([['Nome'], ['Zeca']], 'planilha.xls')
    const matriz = await lerPlanilha(file)
    expect(matriz).toEqual([['Nome'], ['Zeca']])
  })
})
