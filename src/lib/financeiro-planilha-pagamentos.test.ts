import { describe, it, expect } from 'vitest'
import {
  converterPlanilhaParaPagamentoPix,
  lerPagamentosDaPlanilha,
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
  'Valor Líquido': '150',
  Edital: 'Edital 002/2026',
  'Sigla Unidade': 'SEDE',
  Função: 'Fiscal',
}

/** Converte uma linha só, com o valor dado, e devolve o pagamento. */
function comValor(valor: string) {
  return converterPlanilhaParaPagamentoPix(matriz([{ ...LINHA_VALIDA, 'Valor Líquido': valor }]), '24092026')[0]
}

describe('converterPlanilhaParaPagamentoPix', () => {
  it('⭐ CONTROLE POSITIVO: planilha completa converte sem erro', () => {
    const m = matriz([LINHA_VALIDA])
    const pagamentos = converterPlanilhaParaPagamentoPix(m, '24092026')
    expect(pagamentos).toHaveLength(1)
    expect(pagamentos[0].nomeFornecedor).toBe('Zeca Silva')
    expect(pagamentos[0].valorPagamento).toBe(150)
    expect(pagamentos[0].valorComCentavos).toBeUndefined()
    expect(pagamentos[0].dataPagamento).toBe('24092026')
  })

  // Regra (decisão do usuário, 2026-11-03): pagamento é em reais inteiros. Centavos são
  // DESCARTADOS — truncados, nunca arredondados — e a linha guarda o valor lido para o aviso.
  // ⚠️ Até essa data, '1.234,56' afirmava 1234.56 como correto.
  it('🔴 centavos são descartados e o valor lido fica em valorComCentavos', () => {
    const p = comValor('1.234,56')
    expect(p.valorPagamento).toBe(1234)
    expect(p.valorComCentavos).toBe(1234.56)
  })

  it('🔴 trunca, não arredonda: "150,99" paga 150', () => {
    expect(comValor('150,99').valorPagamento).toBe(150)
  })

  it('🔴 célula NUMÉRICA com centavos (chega do lerPlanilha como "1500,5") paga 1500, não 15005', () => {
    const p = comValor('1500,5')
    expect(p.valorPagamento).toBe(1500)
    expect(p.valorComCentavos).toBe(1500.5)
  })

  it('valor inteiro com separadores de milhar ("10.000,00") não é marcado como tendo centavos', () => {
    const p = comValor('10.000,00')
    expect(p.valorPagamento).toBe(10000)
    expect(p.valorComCentavos).toBeUndefined()
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
})

/** Uma linha só, pelo caminho que devolve as recusadas. */
function lerUma(linha: Linha) {
  return lerPagamentosDaPlanilha(matriz([linha]), '24092026')
}

// 🔴 Nenhuma linha some calada (2026-11-03). Antes: sem nome/CPF sumia sem dizer quem, e valor
// ilegível ("R$ 1.500,00") ou em branco virava pagamento de R$ 0,00 no Segmento A.
describe('lerPagamentosDaPlanilha — linhas recusadas', () => {
  it('⭐ CONTROLE POSITIVO: linha válida vira pagamento e nada é recusado', () => {
    const r = lerUma(LINHA_VALIDA)
    expect(r.pagamentos).toHaveLength(1)
    expect(r.recusadas).toEqual([])
  })

  it.each([
    ['nome em branco', { 'Nome Completo': '' }, 'Nome em branco'],
    ['CPF em branco', { CPF: '' }, 'CPF em branco'],
    ['valor em branco', { 'Valor Líquido': '' }, 'Valor em branco'],
    ['valor com "R$"', { 'Valor Líquido': 'R$ 1.500,00' }, 'Valor "R$ 1.500,00" não está no formato 1.234,56'],
    ['valor com lixo no fim (parseFloat aceitava "1500")', { 'Valor Líquido': '1500abc' }, 'Valor "1500abc" não está no formato 1.234,56'],
    ['ponto decimal em texto ("1.5" — viraria 15)', { 'Valor Líquido': '1.5' }, 'Valor "1.5" não está no formato 1.234,56'],
    ['valor negativo', { 'Valor Líquido': '-150' }, 'Valor "-150" não está no formato 1.234,56'],
    ['valor zero', { 'Valor Líquido': '0' }, 'Valor abaixo de R$ 1,00 — sem os centavos, o pagamento seria zero'],
    ['só centavos ("0,50")', { 'Valor Líquido': '0,50' }, 'Valor abaixo de R$ 1,00 — sem os centavos, o pagamento seria zero'],
  ] as const)('%s: recusa a linha, com o motivo, e não gera pagamento', (_caso, troca, motivo) => {
    const r = lerUma({ ...LINHA_VALIDA, ...troca })
    expect(r.pagamentos).toEqual([])
    expect(r.recusadas).toHaveLength(1)
    expect(r.recusadas[0].motivo).toBe(motivo)
  })

  // CPF do favorecido pelo validador oficial (`src/lib/cpf.ts`), 2026-11-03. Medido numa planilha
  // real: 2 de 423 com DV errado, que iam para o arquivo do banco sem aviso. Valores sintéticos.
  it.each([
    ['dígito verificador errado', '11144477736', 'CPF "11144477736" tem 11 dígitos, mas é inválido: os dígitos verificadores não conferem'],
    ['10 dígitos', '1114447773', 'CPF "1114447773" tem 10 dígitos, e um CPF tem 11'],
    ['sequência repetida (passa no módulo 11)', '11111111111', 'CPF "11111111111" é uma sequência de dígitos repetidos, que não é CPF de ninguém'],
    ['letra no lugar do zero', '1O778817709', 'CPF "1O778817709" tem caractere que não é dígito ("O")'],
    // ⚠️ Antes, "abc" virava "CPF em branco" — o filtro de dígitos esvaziava o campo.
    ['só letras', 'abc', 'CPF "abc" tem caractere que não é dígito ("a", "b", "c")'],
  ])('🔴 CPF do favorecido inválido — %s — recusa a linha com o motivo', (_caso, cpf, motivo) => {
    const r = lerUma({ ...LINHA_VALIDA, CPF: cpf })
    expect(r.pagamentos).toEqual([])
    expect(r.recusadas[0].motivo).toBe(motivo)
  })

  it('⭐ CONTROLE POSITIVO: CPF válido COM máscara é aceito, e vai ao arquivo só com os dígitos', () => {
    const r = lerUma({ ...LINHA_VALIDA, CPF: '111.444.777-35' })
    expect(r.recusadas).toEqual([])
    expect(r.pagamentos[0].cpfFornecedor).toBe('11144477735')
  })

  // Formatos medidos numa planilha real (2026-11-03): 5 de 423 chaves caíam aqui e eram trocadas
  // CALADAS pelo CPF do favorecido. Decisão do usuário: a linha é recusada. Valores sintéticos.
  it.each([
    ['celular sem DDD (9 dígitos)', '999998888'],
    ['telefone com 0 na frente (12 dígitos)', '024999998888'],
    ['14 dígitos (formato de CNPJ)', '12345678000195'],
    ['11 dígitos que não é CPF válido nem celular', '12345678911'],
  ])('🔴 chave PIX não reconhecida — %s — recusa a linha, sem trocar pelo CPF', (_caso, chave) => {
    const r = lerUma({ ...LINHA_VALIDA, chave_pix: chave })
    expect(r.pagamentos).toEqual([])
    expect(r.recusadas[0].motivo).toBe(
      `Chave PIX "${chave}" não reconhecida — não é CPF, celular, e-mail nem chave aleatória`,
    )
  })

  it('⭐ CONTROLE POSITIVO: chave em BRANCO continua indo para o CPF (não é recusada)', () => {
    const r = lerUma({ ...LINHA_VALIDA, chave_pix: '' })
    expect(r.recusadas).toEqual([])
    expect(r.pagamentos[0]).toMatchObject({ tipoChavePix: '03', chavePix: '11144477735' })
  })

  it('⭐ CONTROLE POSITIVO: tipo_chave_pix EXPLÍCITO não passa pela inferência, então não é recusado', () => {
    const r = lerUma({ ...LINHA_VALIDA, chave_pix: '999998888', tipo_chave_pix: '01' })
    expect(r.recusadas).toEqual([])
    expect(r.pagamentos[0].tipoChavePix).toBe('01')
  })

  it('a recusada leva nome, CPF e valor como estavam na planilha', () => {
    const r = lerUma({ ...LINHA_VALIDA, 'Valor Líquido': 'R$ 1.500,00' })
    expect(r.recusadas[0]).toMatchObject({ nome: 'Zeca Silva', cpf: '11144477735', valor: 'R$ 1.500,00' })
  })

  it('⭐ CONTROLE POSITIVO: formatos aceitos — "1500", "1500,5", "1.500", "1.234,56", "1,00"', () => {
    for (const valor of ['1500', '1500,5', '1.500', '1.234,56', '1,00']) {
      expect(lerUma({ ...LINHA_VALIDA, 'Valor Líquido': valor }).recusadas).toEqual([])
    }
  })

  it('recusadas mantêm a ordem da planilha e não impedem as válidas', () => {
    const r = lerPagamentosDaPlanilha(
      matriz([
        { ...LINHA_VALIDA, 'Nome Completo': 'Ana', CPF: '' },
        LINHA_VALIDA,
        { ...LINHA_VALIDA, 'Nome Completo': 'Bia', 'Valor Líquido': 'abc' },
      ]),
      '24092026',
    )
    expect(r.pagamentos.map((p) => p.nomeFornecedor)).toEqual(['Zeca Silva'])
    expect(r.recusadas.map((x) => x.nome)).toEqual(['Ana', 'Bia'])
  })
})

describe('converterPlanilhaParaPagamentoPix — regras da planilha inteira', () => {

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
