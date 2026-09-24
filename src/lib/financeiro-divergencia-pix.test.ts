import { describe, it, expect } from 'vitest'
import { detectarChaveCpfDivergente } from './financeiro-divergencia-pix'
import type { PagamentoPix } from './financeiro-cnab240-tipos'

const pagamento = (over: Partial<PagamentoPix> = {}): PagamentoPix => ({
  nomeFornecedor: 'Fulano de Tal',
  cpfFornecedor: '11144477735',
  edital: 'Edital 001/2026',
  siglaUnidade: 'SEDE',
  funcao: 'Fiscal',
  dataPagamento: '01012026',
  valorPagamento: 150.5,
  tipoChavePix: '03',
  chavePix: '11144477735',
  ...over,
})

describe('detectarChaveCpfDivergente', () => {
  it('⭐ CONTROLE POSITIVO: chave tipo 03 IGUAL ao CPF do favorecido não entra na lista', () => {
    expect(detectarChaveCpfDivergente([pagamento()])).toEqual([])
  })

  it('acusa chave tipo 03 cujos dígitos divergem do CPF do favorecido', () => {
    const p = pagamento({ chavePix: '11144477736' }) // último dígito diferente
    expect(detectarChaveCpfDivergente([p])).toEqual([
      { nome: 'Fulano de Tal', cpf: '11144477735', chaveCpf: '11144477736' },
    ])
  })

  it('ignora divergência de máscara — compara só dígitos', () => {
    const p = pagamento({ chavePix: '111.444.777-35' })
    expect(detectarChaveCpfDivergente([p])).toEqual([])
  })

  it('NUNCA acusa outros tipos de chave, mesmo com dígitos "parecidos" com o CPF', () => {
    const p = pagamento({ tipoChavePix: '01', chavePix: '+5511144477735' })
    expect(detectarChaveCpfDivergente([p])).toEqual([])
  })

  it('lista mais de um pagamento divergente, na ordem em que aparecem', () => {
    const a = pagamento({ nomeFornecedor: 'Ana', chavePix: '00000000000' })
    const b = pagamento({ nomeFornecedor: 'Beto', cpfFornecedor: '52998224725', chavePix: '52998224726' })
    expect(detectarChaveCpfDivergente([a, b]).map((d) => d.nome)).toEqual(['Ana', 'Beto'])
  })
})
