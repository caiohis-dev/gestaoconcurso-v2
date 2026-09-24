import { describe, it, expect } from 'vitest'
import {
  buildHeaderArquivo,
  buildHeaderLotePix,
  buildSegmentoAPix,
  buildSegmentoBPix,
  buildTrailerLote,
  buildTrailerArquivo,
  type PagamentoPix,
} from './financeiro-cnab240-tipos'

/**
 * Confere os 6 construtores de linha contra as posições de
 * `estrutura/modulos/financeiro/layout-cnab240-itau.md` (Itaú SISPAG v085, PIX PF).
 * Nenhum destes testes existia na origem — o layout nunca tinha sido verificado por
 * código, só por leitura humana do manual.
 *
 * Posições no comentário são 1-based (como no manual); os slices no teste são
 * 0-based, então posição `P` a `P+len-1` vira `slice(P-1, P-1+len)`.
 */
const PAGTO: PagamentoPix = {
  nomeFornecedor: 'Maria da Silva',
  cpfFornecedor: '11144477735',
  edital: 'Edital 002/2026',
  siglaUnidade: 'SEDE',
  funcao: 'Fiscal de Sala',
  dataPagamento: '24092026',
  valorPagamento: 1234.56,
  tipoChavePix: '03',
  chavePix: '11144477735',
}

describe('buildHeaderArquivo (Registro Tipo 0)', () => {
  const linha = buildHeaderArquivo('24092026', '231500')

  it('tem sempre 240 caracteres', () => {
    expect(linha).toHaveLength(240)
  })

  it('campos fixos e o CNPJ/agência/conta/DAC do pagador', () => {
    expect(linha.slice(0, 3)).toBe('341') // Código do Banco
    expect(linha.slice(3, 7)).toBe('0000') // Código do Lote (fixo, header de arquivo)
    expect(linha.slice(7, 8)).toBe('0') // Tipo de Registro
    expect(linha.slice(14, 17)).toBe('080') // Layout do Arquivo
    expect(linha.slice(17, 18)).toBe('2') // Inscrição Pagador: 2 = CNPJ
    expect(linha.slice(18, 32)).toBe('32508186000180') // CNPJ, já com 14 dígitos
    expect(linha.slice(52, 57)).toBe('06184') // Agência, zero à esquerda
    expect(linha.slice(58, 70)).toBe('000000029249') // Conta, 12 posições
    expect(linha.slice(71, 72)).toBe('5') // DAC
    expect(linha.slice(72, 102)).toBe('FUNDACAO EDUCACIONAL DE VOLTA ') // Nome, truncado em 30 e maiúsculo sem acento
    expect(linha.slice(102, 132)).toBe('BANCO ITAU SA                 ')
    expect(linha.slice(142, 143)).toBe('1') // Código de Remessa
    expect(linha.slice(143, 151)).toBe('24092026') // Data de Geração DDMMAAAA
    expect(linha.slice(151, 157)).toBe('231500') // Hora de Geração HHMMSS
  })
})

describe('buildHeaderLotePix (Registro Tipo 1)', () => {
  const linha = buildHeaderLotePix(1)

  it('tem 240 caracteres e o lote de serviço no formato 9(04)', () => {
    expect(linha).toHaveLength(240)
    expect(linha.slice(3, 7)).toBe('0001')
  })

  it('operação, tipo de pagamento, forma e layout do lote — os campos que identificam PIX', () => {
    expect(linha.slice(7, 8)).toBe('1') // Tipo de Registro: Header de Lote
    expect(linha.slice(8, 9)).toBe('C') // Tipo de Operação: Crédito
    expect(linha.slice(9, 11)).toBe('20') // Tipo de Pagamento: Fornecedores
    expect(linha.slice(11, 13)).toBe('45') // Forma de Pagamento: PIX Transferência
    expect(linha.slice(13, 16)).toBe('040') // Layout do Lote
  })
})

describe('buildSegmentoAPix (Registro Tipo 3, Segmento A)', () => {
  const linha = buildSegmentoAPix(1, 1, 1, PAGTO)

  it('tem 240 caracteres, lote e nº sequencial do registro corretos', () => {
    expect(linha).toHaveLength(240)
    expect(linha.slice(3, 7)).toBe('0001')
    expect(linha.slice(7, 8)).toBe('3') // Registro de Detalhe
    expect(linha.slice(8, 13)).toBe('00001') // Nº Sequencial do Registro, inicia em 00001
    expect(linha.slice(13, 14)).toBe('A') // Código do Segmento
  })

  it('câmara SPI (PIX), nome do favorecido, "seu número" e data de pagamento', () => {
    expect(linha.slice(17, 20)).toBe('009') // Câmara: SPI (PIX)
    expect(linha.slice(43, 73)).toBe('MARIA DA SILVA                ') // Nome, 30 posições
    expect(linha.slice(73, 93)).toBe('1                   ') // Seu Número (alfanumérico à esquerda)
    expect(linha.slice(93, 101)).toBe('24092026') // Data de Pagamento DDMMAAAA
    expect(linha.slice(101, 104)).toBe('REA') // Moeda
    expect(linha.slice(112, 114)).toBe('04') // Identificação de Transferência: Chave PIX
  })

  it('🔴 valor do pagamento vai em CENTAVOS, sem ponto/vírgula (R$ 1.234,56 → "000000000123456")', () => {
    expect(linha.slice(119, 134)).toBe('000000000123456')
  })

  it('CPF do favorecido com zeros à esquerda até 14 posições', () => {
    expect(linha.slice(203, 217)).toBe('00011144477735')
  })
})

describe('buildSegmentoBPix (Registro Tipo 3, Segmento B)', () => {
  const linha = buildSegmentoBPix(1, 1, PAGTO)

  it('tem 240 caracteres e repete o Nº Sequencial do Segmento A correspondente', () => {
    expect(linha).toHaveLength(240)
    expect(linha.slice(8, 13)).toBe('00001')
    expect(linha.slice(13, 14)).toBe('B')
  })

  it('tipo de chave, inscrição do favorecido e a chave PIX', () => {
    expect(linha.slice(14, 16)).toBe('03') // Tipo Chave: CPF
    expect(linha.slice(17, 18)).toBe('1') // Inscrição do Favorecido: CPF
    expect(linha.slice(18, 32)).toBe('00011144477735')
    expect(linha.slice(127, 227)).toBe('11144477735' + ' '.repeat(89)) // Chave Pix, 100 posições
  })

  it('🔴 "Informação entre Usuários" = "[EDITAL] - [FUNÇÃO]", truncada em 65 chars', () => {
    const prefixo = 'EDITAL 002/2026 - FISCAL DE SALA'
    expect(linha.slice(62, 127)).toBe(prefixo + ' '.repeat(65 - prefixo.length))
  })

  it('trunca a informação entre usuários que passa de 65 caracteres, sem estourar a linha', () => {
    const longo = buildSegmentoBPix(1, 1, {
      ...PAGTO,
      edital: 'Um edital com nome bem comprido para forçar o truncamento',
      funcao: 'Uma função também comprida',
    })
    expect(longo).toHaveLength(240)
    expect(longo.slice(62, 127)).toHaveLength(65)
  })
})

describe('buildTrailerLote (Registro Tipo 5)', () => {
  it('tem 240 caracteres, a contagem de registros do lote e o valor total em centavos', () => {
    const linha = buildTrailerLote(1, 4, 1234.56)
    expect(linha).toHaveLength(240)
    expect(linha.slice(7, 8)).toBe('5')
    expect(linha.slice(17, 23)).toBe('000004')
    expect(linha.slice(23, 41)).toBe('000000000000123456')
  })
})

describe('buildTrailerArquivo (Registro Tipo 9)', () => {
  it('tem 240 caracteres, código de lote fixo 9999 e as contagens de lotes/registros do arquivo', () => {
    const linha = buildTrailerArquivo(1, 8)
    expect(linha).toHaveLength(240)
    expect(linha.slice(3, 7)).toBe('9999')
    expect(linha.slice(7, 8)).toBe('9')
    expect(linha.slice(17, 23)).toBe('000001')
    expect(linha.slice(23, 29)).toBe('000008')
  })
})
