/**
 * `XLSX.writeFile` GRAVA ARQUIVO DE VERDADE no jsdom — vira spy, como nas outras
 * baterias que exportam planilha neste repo (`relatorio-importacao-export.test.ts`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as XLSX from 'xlsx'

const { escreverXlsx } = vi.hoisted(() => ({ escreverXlsx: vi.fn() }))
vi.mock('xlsx', async () => {
  const real = await vi.importActual<typeof import('xlsx')>('xlsx')
  return { ...real, writeFile: escreverXlsx }
})

import { baixarXls } from './financeiro-exportar-planilha'

describe('baixarXls', () => {
  beforeEach(() => escreverXlsx.mockClear())

  it('monta a planilha a partir da matriz e chama writeFile com bookType "xls" e o nome pedido', () => {
    baixarXls([['Nome', 'Valor'], ['Zeca', 150.5]], 'recebedores.xls')

    expect(escreverXlsx).toHaveBeenCalledTimes(1)
    const [workbook, nomeArquivo, opcoes] = escreverXlsx.mock.calls[0]
    expect(nomeArquivo).toBe('recebedores.xls')
    expect(opcoes).toEqual({ bookType: 'xls' })

    // O conteúdo da planilha é o que foi passado — confere lendo de volta a aba.
    const aba = workbook.Sheets[workbook.SheetNames[0]]
    const linhas = XLSX.utils.sheet_to_json(aba, { header: 1 })
    expect(linhas).toEqual([['Nome', 'Valor'], ['Zeca', 150.5]])
  })

  it('usa o nome de aba padrão "Dados" quando nenhum é passado', () => {
    baixarXls([['a']], 'x.xls')
    const [workbook] = escreverXlsx.mock.calls[0]
    expect(workbook.SheetNames).toEqual(['Dados'])
  })

  it('aceita nome de aba customizado', () => {
    baixarXls([['a']], 'x.xls', 'Recebedores')
    const [workbook] = escreverXlsx.mock.calls[0]
    expect(workbook.SheetNames).toEqual(['Recebedores'])
  })
})
