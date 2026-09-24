import { describe, it, expect } from 'vitest'
import { inferirTipoEFormatarChavePix } from './financeiro-chave-pix'

/**
 * `inferirTipoEFormatarChavePix` não tinha teste nenhum na origem (gera_cnab_pix).
 * A ordem de verificação importa: aleatória/e-mail são estruturalmente inequívocas,
 * mas 11 dígitos crus podem ser CPF OU celular — daí as duas pré-verificações por
 * referência (rodam antes) e o caso `ambigua` (quando as duas passam).
 */
describe('inferirTipoEFormatarChavePix', () => {
  it('retorna null para chave vazia', () => {
    expect(inferirTipoEFormatarChavePix('')).toBeNull()
  })

  it('infere e-mail (tipo 02)', () => {
    expect(inferirTipoEFormatarChavePix('fulano@exemplo.com')).toEqual({
      tipoChavePix: '02',
      chavePix: 'fulano@exemplo.com',
    })
  })

  it('infere chave aleatória (UUID, tipo 04) e normaliza para minúsculas', () => {
    const uuid = 'A1B2C3D4-E5F6-4A5B-8C9D-1234567890AB'
    expect(inferirTipoEFormatarChavePix(uuid)).toEqual({
      tipoChavePix: '04',
      chavePix: uuid.toLowerCase(),
    })
  })

  it('infere CPF (tipo 03) em 11 dígitos com DV válido e que NÃO parece celular', () => {
    // 111.444.777-35 é um CPF classicamente usado em exemplos, com DV válido, e o
    // terceiro dígito (1) não é '9' — não parece celular, então não é ambíguo.
    expect(inferirTipoEFormatarChavePix('11144477735')).toEqual({
      tipoChavePix: '03',
      chavePix: '11144477735',
    })
  })

  it('infere celular BR (tipo 01, prefixo +55) em 11 dígitos que NÃO é CPF válido', () => {
    // DDD 24, terceiro dígito 9 (celular) — dígitos verificadores de CPF não bateriam
    // para a maioria dos números de telefone reais.
    expect(inferirTipoEFormatarChavePix('24999999999')).toEqual({
      tipoChavePix: '01',
      chavePix: '+5524999999999',
    })
  })

  it('⭐ CASO AMBÍGUO: 11 dígitos que passam em CPF E em celular vêm marcados `ambigua`', () => {
    // 119.000.000-83 tem DV válido (CPF, conferido pelo algoritmo) e também "parece
    // celular" (DDD 11, terceiro dígito 9) — achado por busca exaustiva, não à mão.
    const r = inferirTipoEFormatarChavePix('11900000083')
    expect(r).not.toBeNull()
    expect(r?.tipoChavePix).toBe('03')
    expect(r?.ambigua).toBe(true)
  })

  it('rejeita CPF de dígitos repetidos, mesmo que a fórmula de DV "bata"', () => {
    // 000.000.000-00 não é celular (terceiro dígito 0) nem CPF válido (sequência
    // repetida) — a inferência estrutural falha e devolve null.
    expect(inferirTipoEFormatarChavePix('00000000000')).toBeNull()
  })

  it('11 dígitos que não são CPF válido nem celular plausível: retorna null (fallback é do chamador)', () => {
    // DDD 05 é inválido (< 11) e a sequência não é CPF válido.
    expect(inferirTipoEFormatarChavePix('05123456789')).toBeNull()
  })

  it('infere telefone com código do país sem "+" (12/13 dígitos, começando por 55)', () => {
    expect(inferirTipoEFormatarChavePix('5524999999999')).toEqual({
      tipoChavePix: '01',
      chavePix: '+5524999999999',
    })
  })

  it('preserva telefone já formatado com "+"', () => {
    expect(inferirTipoEFormatarChavePix('+5524999999999')).toEqual({
      tipoChavePix: '01',
      chavePix: '+5524999999999',
    })
  })

  it('pré-verificação: chave igual ao CPF de referência vence a inferência estrutural', () => {
    // Um valor que "pareceria" celular (DDD 24, 3º dígito 9) mas é igual ao CPF do
    // favorecido tem que virar CPF (03) — a referência é mais forte que a heurística.
    const r = inferirTipoEFormatarChavePix('24999999999', { cpf: '249.999.999-99'.replace(/\D/g, '') })
    expect(r).toEqual({ tipoChavePix: '03', chavePix: '24999999999' })
  })

  it('pré-verificação: chave igual ao TELEFONE de referência vira tipo 01 com +55', () => {
    const r = inferirTipoEFormatarChavePix('24999999999', { telefone: '24999999999' })
    expect(r).toEqual({ tipoChavePix: '01', chavePix: '+5524999999999' })
  })
})
