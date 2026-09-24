/**
 * Aviso de conferência: chave PIX tipo CPF divergente do CPF do favorecido.
 * Portado de `gera_cnab_pix/src/lib/valida_pagamento.ts` na Fase 2 do
 * roadmap-modulo-financeiro.yaml.
 */
import type { PagamentoPix } from './financeiro-cnab240-tipos'

/**
 * Divergência de titularidade: o pagamento usa uma chave PIX do tipo CPF
 * (tipo `03`), mas os dígitos da chave não são iguais ao CPF do favorecido.
 * O Itaú resolve a chave `03` no DICT e compara o titular com a inscrição do
 * registro — se diferirem, recusa o pagamento. Ex.: chave `72338610725` com
 * CPF do favorecido `72338610723` (erro de digitação no último dígito).
 */
export interface DivergenciaChaveCpf {
  nome: string
  cpf: string // CPF do favorecido (só dígitos)
  chaveCpf: string // CPF informado como chave PIX (só dígitos)
}

/** Só os dígitos de um valor, para comparar CPF x chave sem ruído de máscara. */
const soDigitos = (v: string): string => (v || '').replace(/\D/g, '')

/**
 * Lista os pagamentos cuja chave PIX é do tipo CPF (`03`) mas cujos dígitos
 * divergem do CPF do favorecido. É um aviso de conferência (não bloqueio):
 * a divergência quase sempre indica CPF ou chave digitados errado e leva à
 * recusa do banco por titularidade.
 */
export const detectarChaveCpfDivergente = (
  pagamentos: PagamentoPix[],
): DivergenciaChaveCpf[] =>
  pagamentos
    .filter((p) => p.tipoChavePix === '03' && soDigitos(p.chavePix) !== soDigitos(p.cpfFornecedor))
    .map((p) => ({
      nome: p.nomeFornecedor,
      cpf: soDigitos(p.cpfFornecedor),
      chaveCpf: soDigitos(p.chavePix),
    }))
