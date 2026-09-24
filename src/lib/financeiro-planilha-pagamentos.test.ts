import { describe, it, expect } from 'vitest'
import {
  converterPlanilhaParaPagamentoPix,
  sugerirMapeamento,
  lerCabecalho,
  lerPrimeiraLinhaDados,
  contarLinhasDados,
} from './financeiro-planilha-pagamentos'
import type { Matriz } from './financeiro-ler-planilha'

const CABECALHO = [
  'Nome Completo',
  'CPF',
  'Valor Líquido',
  'Edital',
  'Sigla Unidade',
  'Função',
  'Matrícula',
  'Telefone',
  'chave_pix',
  'tipo_chave_pix',
] as const

type Coluna = (typeof CABECALHO)[number]
type Linha = Partial<Record<Coluna, string>>

/** Monta uma matriz [cabeçalho, ...linhas] a partir de objetos por campo. */
function matriz(linhas: Linha[]): Matriz {
  return [
    [...CABECALHO],
    ...linhas.map((l) => CABECALHO.map((col) => l[col] ?? '')),
  ]
}

const LINHA_VALIDA: Linha = {
  'Nome Completo': 'Zeca Silva',
  CPF: '11144477735',
  'Valor Líquido': '150,50',
  Edital: 'Edital 002/2026',
  'Sigla Unidade': 'SEDE',
  Função: 'Fiscal',
}

describe('converterPlanilhaParaPagamentoPix', () => {
  it('⭐ CONTROLE POSITIVO: planilha completa converte sem erro', () => {
    const m = matriz([LINHA_VALIDA])
    const pagamentos = converterPlanilhaParaPagamentoPix(m, '24092026')
    expect(pagamentos).toHaveLength(1)
    expect(pagamentos[0].nomeFornecedor).toBe('Zeca Silva')
    expect(pagamentos[0].valorPagamento).toBe(150.5)
    expect(pagamentos[0].dataPagamento).toBe('24092026')
  })

  it('matriz vazia devolve lista vazia, sem erro', () => {
    expect(converterPlanilhaParaPagamentoPix([], '24092026')).toEqual([])
  })

  it('ignora linha totalmente vazia', () => {
    const m: Matriz = [[...CABECALHO], CABECALHO.map(() => ''), CABECALHO.map((c) => LINHA_VALIDA[c] ?? '')]
    expect(converterPlanilhaParaPagamentoPix(m, '24092026')).toHaveLength(1)
  })

  it('ignora linha sem nome OU sem CPF (linha inconsistente), sem lançar erro', () => {
    const m = matriz([
      LINHA_VALIDA,
      { ...LINHA_VALIDA, 'Nome Completo': '' },
      { ...LINHA_VALIDA, CPF: '' },
    ])
    expect(converterPlanilhaParaPagamentoPix(m, '24092026')).toHaveLength(1)
  })

  describe('colunas obrigatórias', () => {
    it('lança erro quando falta coluna obrigatória (ex.: sem "Valor Líquido")', () => {
      const cabecalhoIncompleto = CABECALHO.filter((c) => c !== 'Valor Líquido')
      const m: Matriz = [cabecalhoIncompleto, cabecalhoIncompleto.map(() => 'x')]
      expect(() => converterPlanilhaParaPagamentoPix(m, '24092026')).toThrow(/Colunas obrigatórias/)
    })
  })

  describe('regra: toda linha precisa de Sigla Unidade', () => {
    it('lança erro quando alguma linha tem Sigla Unidade vazia', () => {
      const m = matriz([LINHA_VALIDA, { ...LINHA_VALIDA, 'Nome Completo': 'Outro', 'Sigla Unidade': '' }])
      expect(() => converterPlanilhaParaPagamentoPix(m, '24092026')).toThrow(/Sigla Unidade/)
    })

    it('⭐ CONTROLE POSITIVO: todas as linhas com Sigla Unidade preenchida passam', () => {
      const m = matriz([LINHA_VALIDA, { ...LINHA_VALIDA, 'Nome Completo': 'Outro' }])
      expect(converterPlanilhaParaPagamentoPix(m, '24092026')).toHaveLength(2)
    })
  })

  describe('regra: toda linha precisa de Função', () => {
    it('lança erro quando alguma linha tem Função vazia', () => {
      const m = matriz([LINHA_VALIDA, { ...LINHA_VALIDA, 'Nome Completo': 'Outro', Função: '' }])
      expect(() => converterPlanilhaParaPagamentoPix(m, '24092026')).toThrow(/Função/)
    })
  })

  describe('regra: um único edital por planilha', () => {
    it('lança erro quando há mais de um edital distinto', () => {
      const m = matriz([
        LINHA_VALIDA,
        { ...LINHA_VALIDA, 'Nome Completo': 'Outro', Edital: 'Edital 003/2026' },
      ])
      expect(() => converterPlanilhaParaPagamentoPix(m, '24092026')).toThrow(/editais diferentes/)
    })

    it('lança erro quando a coluna Edital está vazia em todas as linhas', () => {
      const m = matriz([{ ...LINHA_VALIDA, Edital: '' }])
      expect(() => converterPlanilhaParaPagamentoPix(m, '24092026')).toThrow(/coluna "Edital" está vazia/)
    })

    it('⭐ CONTROLE POSITIVO: mesmo edital em todas as linhas passa', () => {
      const m = matriz([LINHA_VALIDA, { ...LINHA_VALIDA, 'Nome Completo': 'Outro' }])
      expect(() => converterPlanilhaParaPagamentoPix(m, '24092026')).not.toThrow()
    })
  })

  it('ordena por nome (pt-BR, ignorando caixa e acento)', () => {
    const m = matriz([
      { ...LINHA_VALIDA, 'Nome Completo': 'Ândré' },
      { ...LINHA_VALIDA, 'Nome Completo': 'ana' },
      { ...LINHA_VALIDA, 'Nome Completo': 'Zeca' },
    ])
    const nomes = converterPlanilhaParaPagamentoPix(m, '24092026').map((p) => p.nomeFornecedor)
    expect(nomes).toEqual(['ana', 'Ândré', 'Zeca'])
  })

  describe('chave PIX: fallback e respeito ao tipo explícito', () => {
    it('sem coluna chave_pix preenchida, usa o CPF do favorecido como chave (tipo 03)', () => {
      const [p] = converterPlanilhaParaPagamentoPix(matriz([LINHA_VALIDA]), '24092026')
      expect(p.tipoChavePix).toBe('03')
      expect(p.chavePix).toBe('11144477735')
      expect(p.chaveInferida).toBe(true)
    })

    it('infere o tipo quando "tipo_chave_pix" vem vazio mas "chave_pix" vem preenchida', () => {
      const [p] = converterPlanilhaParaPagamentoPix(
        matriz([{ ...LINHA_VALIDA, chave_pix: 'fulano@exemplo.com' }]),
        '24092026',
      )
      expect(p.tipoChavePix).toBe('02')
      expect(p.chavePix).toBe('fulano@exemplo.com')
      expect(p.chaveInferida).toBe(true)
    })

    it('🔴 respeita o tipo_chave_pix EXPLÍCITO da planilha, sem reinferir por cima', () => {
      // Chave de 11 dígitos que a heurística inferiria como CPF (03) — mas a planilha
      // diz que é celular (01), e isso tem que prevalecer.
      const [p] = converterPlanilhaParaPagamentoPix(
        matriz([{ ...LINHA_VALIDA, chave_pix: '24999999999', tipo_chave_pix: '01' }]),
        '24092026',
      )
      expect(p.tipoChavePix).toBe('01')
      expect(p.chavePix).toBe('+5524999999999') // normalizado para o formato do Itaú
      expect(p.chaveInferida).toBe(false)
    })
  })
})

describe('sugerirMapeamento', () => {
  it('acha por match exato do rótulo', () => {
    const mapa = sugerirMapeamento([...CABECALHO])
    expect(mapa.nome).toBe(0)
    expect(mapa.cpf).toBe(1)
    expect(mapa.valor).toBe(2)
    expect(mapa.tipoChavePix).toBe(9)
  })

  it('acha por match normalizado (sem acento/espaço/underscore) quando o rótulo exato não bate', () => {
    const cabecalhoAlternativo = ['NOME_COMPLETO', 'cpf', 'valorliquido', 'EDITAL', 'SIGLA UNIDADE', 'funcao']
    const mapa = sugerirMapeamento(cabecalhoAlternativo)
    expect(mapa.nome).toBe(0)
    expect(mapa.valor).toBe(2)
    expect(mapa.siglaUnidade).toBe(4)
  })

  it('coluna ausente no cabeçalho vira -1', () => {
    const mapa = sugerirMapeamento(['Nome Completo'])
    expect(mapa.cpf).toBe(-1)
  })
})

describe('helpers de leitura da matriz', () => {
  it('lerCabecalho corta espaços', () => {
    expect(lerCabecalho([[' Nome ', ' CPF ']])).toEqual(['Nome', 'CPF'])
  })

  it('lerPrimeiraLinhaDados pula linhas vazias', () => {
    const m: Matriz = [[...CABECALHO], ['', '', '', '', '', '', '', '', '', ''], ['Zeca', '111']]
    expect(lerPrimeiraLinhaDados(m)[0]).toBe('Zeca')
  })

  it('contarLinhasDados ignora linhas vazias e o cabeçalho', () => {
    const m: Matriz = [[...CABECALHO], ['Zeca'], ['', ''], ['Beto']]
    expect(contarLinhasDados(m)).toBe(2)
  })
})
