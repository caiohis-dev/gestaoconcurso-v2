/**
 * Layout CNAB 240 (SISPAG Itaú, forma PIX Transferência para pessoa física) — os
 * construtores de linha, campo a campo. Portado de `gera_cnab_pix/src/lib/
 * tipo_arquivo_qnab240.ts` na Fase 2 do roadmap-modulo-financeiro.yaml.
 *
 * Referência de posições: `estrutura/modulos/financeiro/layout-cnab240-itau.md`.
 *
 * 🔴 Fronteira do módulo: função pura, sem import de `@/hooks` nem
 * `@/integrations/supabase` — não se comunica com dado nenhum do resto do sistema.
 */

// =========================================================
// 1. DADOS DO PAGADOR (EXTRAÍDOS DO HEADER DO ARQUIVO)
// =========================================================
const dadosPagador = {
  cnpj: '32508186000180',
  agencia: '6184',
  conta: '29249',
  dac: '5',
  nomeDaEmpresa: 'FUNDACAO EDUCACIONAL DE VOLTA REDONDA',
}

// =========================================================
// 2. INTERFACE DO FORNECEDOR (RECEBEDOR)
// =========================================================
export interface PagamentoPix {
  nomeFornecedor: string
  cpfFornecedor: string
  // Texto livre lido da coluna "Edital" da PLANILHA de pagamento — SEM vínculo com a
  // tabela `editais` do resto do sistema. Mesma palavra, dado diferente.
  edital: string
  siglaUnidade: string // Unidade do recebedor — agrupa a geração em 1 arquivo por unidade
  funcao: string // Função/cargo do recebedor — compõe a "Informação entre Usuários" do Segmento B
  dataPagamento: string // Formato DDMMAAAA (8 caracteres)
  valorPagamento: number // Valor float (ex: 150.50)
  tipoChavePix: string // '01' (Telefone), '02' (Email), '03' (CPF), '04' (Aleatória)
  chavePix: string
  // Metadado apenas para a UI: true quando o tipo/chave PIX foi inferido
  // (planilha sem a coluna "tipo_chave_pix" preenchida). Ignorado na geração do CNAB.
  chaveInferida?: boolean
  // Metadado apenas para a UI: true quando a inferência de 11 dígitos ficou
  // ambígua (passa como CPF e como celular) e precisa de conferência humana.
  chaveAmbigua?: boolean
}

// =========================================================
// 3. FUNÇÕES UTILITÁRIAS
// =========================================================
const formatAlphanumeric = (value: string, length: number): string => {
  const cleanValue = (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  return cleanValue.substring(0, length).padEnd(length, ' ')
}

const formatNumeric = (value: number | string, length: number): string => {
  const cleanValue = String(value).replace(/\D/g, '')
  return cleanValue.padStart(length, '0')
}

// =========================================================
// 4. CONSTRUTORES DE LINHAS (CNAB 240)
// =========================================================

// --- HEADER DE ARQUIVO (Registro Tipo 0) ---
export const buildHeaderArquivo = (dataGeracao: string, horaGeracao: string): string => {
  let linha = ''
  linha += formatNumeric(341, 3) // 001-003: Banco Itaú
  linha += formatNumeric(0, 4) // 004-007: Lote de Serviço (0000)
  linha += formatNumeric(0, 1) // 008-008: Registro Header Arquivo (0)
  linha += formatAlphanumeric('', 6) // 009-014: Brancos
  linha += formatNumeric(80, 3) // 015-017: Layout do Arquivo (080)
  linha += formatNumeric(2, 1) // 018-018: Inscrição Pagador (2 = CNPJ)
  linha += formatNumeric(dadosPagador.cnpj, 14) // 019-032: CNPJ Pagador
  linha += formatAlphanumeric('', 20) // 033-052: Brancos
  linha += formatNumeric(dadosPagador.agencia, 5) // 053-057: Agência Pagador (zeros à esquerda)
  linha += formatAlphanumeric('', 1) // 058-058: Brancos
  linha += formatNumeric(dadosPagador.conta, 12) // 059-070: Conta Pagador
  linha += formatAlphanumeric('', 1) // 071-071: Brancos
  linha += formatNumeric(dadosPagador.dac, 1) // 072-072: DAC Pagador
  linha += formatAlphanumeric(dadosPagador.nomeDaEmpresa, 30) // 073-102: Nome Pagador
  linha += formatAlphanumeric('BANCO ITAU SA', 30) // 103-132: Nome do Banco
  linha += formatAlphanumeric('', 10) // 133-142: Brancos
  linha += formatNumeric(1, 1) // 143-143: Código Remessa (1 = Remessa)
  linha += formatNumeric(dataGeracao, 8) // 144-151: Data Geração (DDMMAAAA)
  linha += formatNumeric(horaGeracao, 6) // 152-157: Hora Geração (HHMMSS)
  linha += formatNumeric(0, 9) // 158-166: Zeros
  linha += formatNumeric(0, 5) // 167-171: Densidade de Gravação (Zeros)
  linha += formatAlphanumeric('', 69) // 172-240: Brancos
  return linha
}

// --- HEADER DE LOTE (Registro Tipo 1) ---
export const buildHeaderLotePix = (loteStr: number): string => {
  let linha = ''
  linha += formatNumeric(341, 3) // 001-003: Banco Itaú
  linha += formatNumeric(loteStr, 4) // 004-007: Lote de Serviço
  linha += formatNumeric(1, 1) // 008-008: Registro Header Lote (1)
  linha += formatAlphanumeric('C', 1) // 009-009: Operação (C = Crédito)
  linha += formatNumeric(20, 2) // 010-011: Serviço (20 = FORNECEDORES)
  linha += formatNumeric(45, 2) // 012-013: Forma (45 = PIX TRANSFERENCIA)
  linha += formatNumeric(40, 3) // 014-016: Layout do Lote (040)
  linha += formatAlphanumeric('', 1) // 017-017: Brancos
  linha += formatNumeric(2, 1) // 018-018: Inscrição Pagador (2 = CNPJ)
  linha += formatNumeric(dadosPagador.cnpj, 14) // 019-032: CNPJ Pagador
  linha += formatAlphanumeric('', 4) // 033-036: ID Lançamento (Brancos)
  linha += formatAlphanumeric('', 16) // 037-052: Brancos
  linha += formatNumeric(dadosPagador.agencia, 5) // 053-057: Agência Pagador
  linha += formatAlphanumeric('', 1) // 058-058: Brancos
  linha += formatNumeric(dadosPagador.conta, 12) // 059-070: Conta Pagador
  linha += formatAlphanumeric('', 1) // 071-071: Brancos
  linha += formatNumeric(dadosPagador.dac, 1) // 072-072: DAC Pagador
  linha += formatAlphanumeric(dadosPagador.nomeDaEmpresa, 30) // 073-102: Nome Pagador
  linha += formatAlphanumeric('', 30) // 103-132: Finalidade Lote (Brancos)
  linha += formatAlphanumeric('', 10) // 133-142: Histórico (Brancos)
  linha += formatAlphanumeric('', 30) // 143-172: Endereço (Brancos)
  linha += formatNumeric(0, 5) // 173-177: Número (Zeros)
  linha += formatAlphanumeric('', 15) // 178-192: Complemento (Brancos)
  linha += formatAlphanumeric('', 20) // 193-212: Cidade (Brancos)
  linha += formatNumeric(0, 8) // 213-220: CEP (Zeros)
  linha += formatAlphanumeric('', 2) // 221-222: Estado (Brancos)
  linha += formatAlphanumeric('', 8) // 223-230: Brancos
  linha += formatAlphanumeric('', 10) // 231-240: Ocorrências (Brancos)
  return linha
}

// --- SEGMENTO A (Registro Tipo 3) ---
export const buildSegmentoAPix = (
  loteStr: number,
  sequencial: number,
  seuNumero: number,
  pagto: PagamentoPix,
): string => {
  let linha = ''
  const valorEmCentavos = Math.round(pagto.valorPagamento * 100)

  linha += formatNumeric(341, 3) // 001-003: Banco Itaú
  linha += formatNumeric(loteStr, 4) // 004-007: Lote de Serviço
  linha += formatNumeric(3, 1) // 008-008: Registro Detalhe (3)
  linha += formatNumeric(sequencial, 5) // 009-013: Nº Sequencial do Registro
  linha += formatAlphanumeric('A', 1) // 014-014: Segmento A
  linha += formatNumeric(0, 3) // 015-017: Movimento (000 = Inclusão)
  linha += formatNumeric(9, 3) // 018-020: CÂMARA (009 = SPI PIX)
  linha += formatNumeric(0, 3) // 021-023: Banco Favorecido (Zeros)
  linha += formatAlphanumeric('', 20) // 024-043: Agência/Conta (Brancos)
  linha += formatAlphanumeric(pagto.nomeFornecedor, 30) // 044-073: Nome Favorecido
  linha += formatAlphanumeric(String(seuNumero), 20) // 074-093: Seu Número (sequencial por arquivo)
  linha += formatNumeric(pagto.dataPagamento, 8) // 094-101: Data Pagamento (DDMMAAAA)
  linha += formatAlphanumeric('REA', 3) // 102-104: Moeda (REA)
  linha += formatAlphanumeric('', 8) // 105-112: ISPB (Brancos)
  linha += formatAlphanumeric('04', 2) // 113-114: IDENTIFICAÇÃO (04 = CHAVE PIX)
  linha += formatNumeric(0, 5) // 115-119: Zeros
  linha += formatNumeric(valorEmCentavos, 15) // 120-134: Valor Pagamento em Centavos
  linha += formatAlphanumeric('', 15) // 135-149: Nosso Número (Brancos)
  linha += formatAlphanumeric('', 5) // 150-154: Brancos
  linha += formatNumeric(0, 8) // 155-162: Data Efetiva (Zeros)
  linha += formatNumeric(0, 15) // 163-177: Valor Efetivo (Zeros)
  linha += formatAlphanumeric('', 20) // 178-197: Finalidade Histórico (Brancos)
  linha += formatNumeric(0, 6) // 198-203: Num Documento (Zeros)
  linha += formatNumeric(pagto.cpfFornecedor, 14) // 204-217: CPF DO FAVORECIDO
  linha += formatAlphanumeric('', 2) // 218-219: Finalidade DOC (Brancos)
  linha += formatAlphanumeric('', 5) // 220-224: Finalidade TED (Brancos)
  linha += formatAlphanumeric('', 5) // 225-229: Brancos
  linha += formatNumeric(0, 1) // 230-230: Aviso (0 = Não emite)
  linha += formatAlphanumeric('', 10) // 231-240: Ocorrências (Brancos)
  return linha
}

// --- SEGMENTO B (Registro Tipo 3) ---
export const buildSegmentoBPix = (loteStr: number, sequencial: number, pagto: PagamentoPix): string => {
  let linha = ''
  linha += formatNumeric(341, 3) // 001-003: Banco Itaú
  linha += formatNumeric(loteStr, 4) // 004-007: Lote de Serviço
  linha += formatNumeric(3, 1) // 008-008: Registro Detalhe (3)
  linha += formatNumeric(sequencial, 5) // 009-013: Nº Sequencial do Registro
  linha += formatAlphanumeric('B', 1) // 014-014: Segmento B
  linha += formatAlphanumeric(pagto.tipoChavePix, 2) // 015-016: Tipo Chave PIX (Nota 37)
  linha += formatAlphanumeric('', 1) // 017-017: Brancos
  linha += formatNumeric(1, 1) // 018-018: Inscrição Favorecido (1 = CPF)
  linha += formatNumeric(pagto.cpfFornecedor, 14) // 019-032: CPF do Favorecido
  linha += formatAlphanumeric('', 30) // 033-062: Brancos
  // 063-127: Informação entre usuários = [EDITAL] - [FUNÇÃO] (trunca em 65 chars)
  linha += formatAlphanumeric(`${pagto.edital} - ${pagto.funcao}`, 65)
  linha += formatAlphanumeric(pagto.chavePix, 100) // 128-227: CHAVE PIX
  linha += formatAlphanumeric('', 3) // 228-230: Brancos
  linha += formatAlphanumeric('', 10) // 231-240: Ocorrências (Brancos)
  return linha
}

// --- TRAILER DE LOTE (Registro Tipo 5) ---
export const buildTrailerLote = (loteStr: number, qtdRegistros: number, valorTotal: number): string => {
  let linha = ''
  const valorEmCentavos = Math.round(valorTotal * 100)

  linha += formatNumeric(341, 3) // 001-003: Banco Itaú
  linha += formatNumeric(loteStr, 4) // 004-007: Lote de Serviço
  linha += formatNumeric(5, 1) // 008-008: Registro Trailer Lote (5)
  linha += formatAlphanumeric('', 9) // 009-017: Brancos
  linha += formatNumeric(qtdRegistros, 6) // 018-023: Qtde Registros do Lote
  linha += formatNumeric(valorEmCentavos, 18) // 024-041: Somatória dos valores do Lote
  linha += formatNumeric(0, 18) // 042-059: Zeros
  linha += formatAlphanumeric('', 171) // 060-230: Brancos
  linha += formatAlphanumeric('', 10) // 231-240: Ocorrências (Brancos)
  return linha
}

// --- TRAILER DE ARQUIVO (Registro Tipo 9) ---
export const buildTrailerArquivo = (qtdLotes: number, qtdRegistros: number): string => {
  let linha = ''
  linha += formatNumeric(341, 3) // 001-003: Banco Itaú
  linha += formatNumeric(9999, 4) // 004-007: Lote de Serviço (Fixo 9999)
  linha += formatNumeric(9, 1) // 008-008: Registro Trailer Arquivo (9)
  linha += formatAlphanumeric('', 9) // 009-017: Brancos
  linha += formatNumeric(qtdLotes, 6) // 018-023: Quantidade de Lotes do Arquivo
  linha += formatNumeric(qtdRegistros, 6) // 024-029: Quantidade de Registros do Arquivo
  linha += formatAlphanumeric('', 211) // 030-240: Brancos
  return linha
}
