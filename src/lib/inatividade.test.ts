import { describe, it, expect, beforeEach } from 'vitest'
import {
  AVISO_ANTES_MS,
  CHAVE_ULTIMA_ATIVIDADE,
  LIMITE_COLABORADOR_MS,
  LIMITE_GESTAO_MS,
  apagarUltimaAtividade,
  faseDaSessao,
  lerUltimaAtividade,
  limiteDeInatividade,
  registrarAtividade,
} from './inatividade'

describe('limiteDeInatividade', () => {
  it('gestão: 30 minutos', () => {
    expect(limiteDeInatividade(false)).toBe(30 * 60 * 1000)
  })

  it('colaborador sem gestão: 5 minutos', () => {
    expect(limiteDeInatividade(true)).toBe(5 * 60 * 1000)
  })
})

describe('faseDaSessao', () => {
  const T0 = 1_000_000

  it('⭐ CONTROLE POSITIVO: logo depois da atividade, ativa', () => {
    expect(faseDaSessao(T0, T0 + 1000, LIMITE_GESTAO_MS)).toEqual({ fase: 'ativa' })
  })

  it('um instante antes da janela do aviso, ainda ativa', () => {
    expect(faseDaSessao(T0, T0 + LIMITE_GESTAO_MS - AVISO_ANTES_MS - 1, LIMITE_GESTAO_MS)).toEqual({ fase: 'ativa' })
  })

  it('no último minuto, aviso — com o tempo restante', () => {
    expect(faseDaSessao(T0, T0 + LIMITE_GESTAO_MS - 30_000, LIMITE_GESTAO_MS)).toEqual({ fase: 'aviso', restanteMs: 30_000 })
  })

  it('no limite exato, expirada', () => {
    expect(faseDaSessao(T0, T0 + LIMITE_GESTAO_MS, LIMITE_GESTAO_MS)).toEqual({ fase: 'expirada' })
  })

  it('o limite do colaborador expira onde o da gestão ainda está ativo', () => {
    const agora = T0 + LIMITE_COLABORADOR_MS
    expect(faseDaSessao(T0, agora, LIMITE_COLABORADOR_MS)).toEqual({ fase: 'expirada' })
    expect(faseDaSessao(T0, agora, LIMITE_GESTAO_MS)).toEqual({ fase: 'ativa' })
  })
})

describe('marca da última atividade', () => {
  beforeEach(() => localStorage.clear())

  it('registra e lê o mesmo instante', () => {
    registrarAtividade(123456)
    expect(lerUltimaAtividade()).toBe(123456)
  })

  it('sem marca, ou com marca corrompida, lê null', () => {
    expect(lerUltimaAtividade()).toBeNull()
    localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, 'lixo')
    expect(lerUltimaAtividade()).toBeNull()
  })

  it('apagar remove a marca', () => {
    registrarAtividade(123456)
    apagarUltimaAtividade()
    expect(lerUltimaAtividade()).toBeNull()
  })
})
