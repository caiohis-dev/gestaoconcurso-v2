import { describe, it, expect } from 'vitest'
import { gerarLotePix, agruparPagamentosPorUnidade } from './financeiro-cnab240-gerador'
import type { PagamentoPix } from './financeiro-cnab240-tipos'

/**
 * `gerarLotePix` e `agruparPagamentosPorUnidade` não tinham teste na origem. A
 * numeração de lote/registro segue `estrutura/modulos/financeiro/numeracao-de-lote.md`.
 */
const pagto = (over: Partial<PagamentoPix> = {}): PagamentoPix => ({
  nomeFornecedor: 'Fulano',
  cpfFornecedor: '11144477735',
  edital: 'Edital 002/2026 - SMA',
  siglaUnidade: 'SEDE',
  funcao: 'Fiscal',
  dataPagamento: '24092026',
  valorPagamento: 100,
  tipoChavePix: '03',
  chavePix: '11144477735',
  ...over,
})

describe('gerarLotePix', () => {
  it('gera 4 + 2N linhas: header arquivo, header lote, (Seg. A + Seg. B) por pagamento, trailer lote, trailer arquivo', () => {
    const linhas = gerarLotePix([pagto(), pagto({ nomeFornecedor: 'Beltrano' })])
    expect(linhas).toHaveLength(2 * 2 + 4)
  })

  it('🔴 código do lote: 0000 no header de arquivo, 0001 nos registros do lote, 9999 no trailer de arquivo', () => {
    const linhas = gerarLotePix([pagto()])
    const [headerArquivo, headerLote, segA, segB, trailerLote, trailerArquivo] = linhas
    expect(headerArquivo.slice(3, 7)).toBe('0000')
    expect(headerLote.slice(3, 7)).toBe('0001')
    expect(segA.slice(3, 7)).toBe('0001')
    expect(segB.slice(3, 7)).toBe('0001')
    expect(trailerLote.slice(3, 7)).toBe('0001')
    expect(trailerArquivo.slice(3, 7)).toBe('9999')
  })

  it('🔴 o nº sequencial do registro é POR FAVORECIDO, e o Segmento B REPETE o do Segmento A (não incrementa entre A e B)', () => {
    const linhas = gerarLotePix([pagto(), pagto({ nomeFornecedor: 'Beltrano' })])
    // índices: 0 header arquivo, 1 header lote, 2 SegA#1, 3 SegB#1, 4 SegA#2, 5 SegB#2, 6 trailer lote, 7 trailer arquivo
    expect(linhas[2].slice(8, 13)).toBe('00001') // Seg. A do 1º favorecido
    expect(linhas[3].slice(8, 13)).toBe('00001') // Seg. B do 1º favorecido — MESMO número
    expect(linhas[4].slice(8, 13)).toBe('00002') // Seg. A do 2º favorecido — incrementou
    expect(linhas[5].slice(8, 13)).toBe('00002')
  })

  it('"Seu Número" incrementa por pagamento, reiniciando em 1 a cada chamada (por arquivo/unidade)', () => {
    const linhas = gerarLotePix([pagto(), pagto({ nomeFornecedor: 'Beltrano' })])
    expect(linhas[2].slice(73, 93).trim()).toBe('1')
    expect(linhas[4].slice(73, 93).trim()).toBe('2')

    // Uma nova chamada (outra unidade) reinicia em 1 — não é sequencial GLOBAL.
    const outraChamada = gerarLotePix([pagto()])
    expect(outraChamada[2].slice(73, 93).trim()).toBe('1')
  })

  it('a contagem de registros do lote e do arquivo bate com o nº de pagamentos', () => {
    const N = 3
    const linhas = gerarLotePix(Array.from({ length: N }, (_, i) => pagto({ nomeFornecedor: `P${i}` })))
    const trailerLote = linhas[linhas.length - 2]
    const trailerArquivo = linhas[linhas.length - 1]
    // Header de Lote (1) + Detalhes (N*2) + Trailer de Lote (1)
    expect(trailerLote.slice(17, 23)).toBe(String(2 + N * 2).padStart(6, '0'))
    // qtdLotes = 1, qtdRegistrosArquivo = qtdRegistrosLote + 2 (header/trailer de arquivo)
    expect(trailerArquivo.slice(17, 23)).toBe('000001')
    expect(trailerArquivo.slice(23, 29)).toBe(String(2 + N * 2 + 2).padStart(6, '0'))
  })

  it('toda linha gerada tem 240 caracteres', () => {
    const linhas = gerarLotePix([pagto(), pagto({ nomeFornecedor: 'Beltrano' })])
    for (const linha of linhas) expect(linha).toHaveLength(240)
  })
})

describe('agruparPagamentosPorUnidade', () => {
  it('agrupa por siglaUnidade, preservando a ordem de chegada dos grupos', () => {
    const grupos = agruparPagamentosPorUnidade([
      pagto({ siglaUnidade: 'SEDE' }),
      pagto({ siglaUnidade: 'CJXXIII' }),
      pagto({ siglaUnidade: 'SEDE' }),
    ])
    expect(grupos.map((g) => g.unidade)).toEqual(['SEDE', 'CJXXIII'])
    expect(grupos[0].quantidade).toBe(2)
    expect(grupos[1].quantidade).toBe(1)
  })

  it('soma o valor total do grupo', () => {
    const grupos = agruparPagamentosPorUnidade([
      pagto({ siglaUnidade: 'SEDE', valorPagamento: 100 }),
      pagto({ siglaUnidade: 'SEDE', valorPagamento: 250.5 }),
    ])
    expect(grupos[0].valorTotal).toBe(350.5)
  })

  it('🔴 nome do arquivo = sigla normalizada + sufixo derivado do edital (exemplo do próprio código-fonte)', () => {
    // "Edital 002/2026 - SMA" -> dígitos "0022026" -> remove 2 primeiros -> "22026" ->
    // remove posições 3 e 4 a partir da direita -> "226".
    const grupos = agruparPagamentosPorUnidade([
      pagto({ siglaUnidade: 'CJXXIII', edital: 'Edital 002/2026 - SMA' }),
    ])
    expect(grupos[0].nomeArquivo).toBe('CJXXIII226.REM')
  })

  it('normaliza a sigla: maiúsculas, sem acento, caractere estranho vira "_"', () => {
    const grupos = agruparPagamentosPorUnidade([
      pagto({ siglaUnidade: 'educação-é 1', edital: 'Edital 002/2026' }),
    ])
    expect(grupos[0].nomeArquivo.replace('.REM', '')).toMatch(/^EDUCACAO_E_1/)
  })

  it('sigla vazia cai no fallback "UNIDADE"', () => {
    const grupos = agruparPagamentosPorUnidade([pagto({ siglaUnidade: '', edital: 'Edital 002/2026' })])
    expect(grupos[0].nomeArquivo.startsWith('UNIDADE')).toBe(true)
  })

  it('🔴 colisão de nome normalizado ganha sufixo incremental (_2, _3...)', () => {
    // "SEDE!" e "SEDE?" normalizam para a MESMA base — o segundo e o terceiro
    // precisam de sufixo para não sobrescrever o arquivo do primeiro.
    const grupos = agruparPagamentosPorUnidade([
      pagto({ siglaUnidade: 'SEDE!', edital: 'Edital 002/2026' }),
      pagto({ siglaUnidade: 'SEDE?', edital: 'Edital 002/2026' }),
      pagto({ siglaUnidade: 'SEDE#', edital: 'Edital 002/2026' }),
    ])
    const nomes = grupos.map((g) => g.nomeArquivo)
    expect(new Set(nomes).size).toBe(3) // os três são únicos
    expect(nomes[0]).not.toMatch(/_\d\.REM$/)
    expect(nomes[1]).toMatch(/_2\.REM$/)
    expect(nomes[2]).toMatch(/_3\.REM$/)
  })
})
