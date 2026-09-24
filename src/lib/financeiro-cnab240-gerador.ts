/**
 * Montagem do arquivo de remessa CNAB 240 (um lote por chamada) e o agrupamento dos
 * pagamentos por unidade (um arquivo por unidade). Portado de `gera_cnab_pix/src/lib/
 * gerador_arquivo_qnab240.ts` na Fase 2 do roadmap-modulo-financeiro.yaml.
 *
 * Referência da numeração de lote: `estrutura/modulos/financeiro/numeracao-de-lote.md`.
 */
import type { PagamentoPix } from './financeiro-cnab240-tipos'
import {
  buildHeaderArquivo,
  buildHeaderLotePix,
  buildSegmentoAPix,
  buildSegmentoBPix,
  buildTrailerLote,
  buildTrailerArquivo,
} from './financeiro-cnab240-tipos'

export const gerarLotePix = (pagamentos: PagamentoPix[]): string[] => {
  const loteId = 1
  let sequencialRegistro = 1
  let seuNumero = 0 // Seu Número: sequencial por arquivo (reinicia a cada chamada/unidade)
  const linhasArquivo: string[] = []

  // 1. Captura dados de data e hora atuais para o Header do Arquivo
  const agora = new Date()
  const dia = String(agora.getDate()).padStart(2, '0')
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const ano = String(agora.getFullYear())
  const dataGeracao = `${dia}${mes}${ano}` // DDMMAAAA

  const horas = String(agora.getHours()).padStart(2, '0')
  const minutos = String(agora.getMinutes()).padStart(2, '0')
  const segundos = String(agora.getSeconds()).padStart(2, '0')
  const horaGeracao = `${horas}${minutos}${segundos}` // HHMMSS

  // 2. Gera o Header do Arquivo (Registro tipo 0)
  linhasArquivo.push(buildHeaderArquivo(dataGeracao, horaGeracao))

  // 3. Gera o Header do Lote (Registro tipo 1)
  linhasArquivo.push(buildHeaderLotePix(loteId))

  let valorTotalLote = 0

  // 4. Itera sobre cada pagamento para gerar os Detalhes (Segmentos A e B)
  // Nota 9: o nº sequencial do registro é atribuído por favorecido, e o Segmento B
  // REPETE o número do Segmento A correspondente (não incrementa entre A e B).
  for (const pagto of pagamentos) {
    seuNumero++
    linhasArquivo.push(buildSegmentoAPix(loteId, sequencialRegistro, seuNumero, pagto))
    linhasArquivo.push(buildSegmentoBPix(loteId, sequencialRegistro, pagto))
    sequencialRegistro++

    valorTotalLote += pagto.valorPagamento
  }

  // 5. Gera o Trailer do Lote (Registro tipo 5)
  // Total de registros do lote: Header de Lote (1) + Detalhes (pagamentos * 2) + Trailer de Lote (1)
  const qtdRegistrosLote = 2 + pagamentos.length * 2
  linhasArquivo.push(buildTrailerLote(loteId, qtdRegistrosLote, valorTotalLote))

  // 6. Gera o Trailer do Arquivo (Registro tipo 9)
  // Total de registros do arquivo: Header de Arquivo (1) + Registros do Lote + Trailer de Arquivo (1)
  const qtdRegistrosArquivo = qtdRegistrosLote + 2
  linhasArquivo.push(buildTrailerArquivo(1, qtdRegistrosArquivo))

  return linhasArquivo
}

/**
 * Um arquivo CNAB por unidade: metadados + os pagamentos daquela unidade.
 * As linhas do arquivo são geradas sob demanda com `gerarLotePix(pagamentos)`.
 */
export interface GrupoUnidade {
  unidade: string // sigla original da unidade (como lida da planilha)
  nomeArquivo: string // nome único do .REM daquela unidade
  pagamentos: PagamentoPix[]
  quantidade: number
  valorTotal: number
}

/**
 * Normaliza a sigla da unidade para compor o nome do arquivo: maiúsculas, sem
 * acento, e qualquer caractere fora de [A-Z0-9] vira "_". Trunca em 20 chars.
 */
const normalizarSiglaUnidade = (sigla: string): string =>
  (sigla || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'UNIDADE'

/**
 * Deriva o sufixo do nome do arquivo a partir do edital, aplicando a regra:
 *   1. remove as letras (mantém apenas dígitos);
 *   2. exclui os 2 primeiros dígitos;
 *   3. da direita para a esquerda, exclui os dígitos das posições 3 e 4.
 *
 * Ex.: "Edital 002/2026 - SMA" -> "0022026" -> "22026" -> "226".
 */
const derivarSufixoEdital = (edital: string): string => {
  const digitos = (edital || '').replace(/\D/g, '')
  const semDoisPrimeiros = digitos.slice(2)
  const chars = semDoisPrimeiros.split('')
  const n = chars.length
  // posições 3 e 4 a partir da direita => índices (n-3) e (n-4)
  return chars.filter((_, i) => i !== n - 3 && i !== n - 4).join('')
}

/**
 * Agrupa os pagamentos por unidade (um arquivo por unidade) e atribui a cada
 * grupo um nome de arquivo único. Preserva a ordem de chegada dos pagamentos
 * (que já vêm ordenados por nome). Como duas siglas distintas podem normalizar
 * para o mesmo texto, colisões de nome recebem sufixo incremental (_2, _3...).
 *
 * Nome do arquivo: [Sigla da Unidade] + [sufixo derivado do edital], ex.:
 * unidade "CJXXIII" + edital "Edital 002/2026 - SMA" -> "CJXXIII226.REM".
 */
export const agruparPagamentosPorUnidade = (
  pagamentos: PagamentoPix[],
): GrupoUnidade[] => {
  const grupos = new Map<string, PagamentoPix[]>()
  for (const p of pagamentos) {
    const lista = grupos.get(p.siglaUnidade)
    if (lista) lista.push(p)
    else grupos.set(p.siglaUnidade, [p])
  }

  const nomesUsados = new Set<string>()
  const resultado: GrupoUnidade[] = []

  for (const [unidade, lista] of grupos) {
    const base = `${normalizarSiglaUnidade(unidade)}${derivarSufixoEdital(lista[0].edital)}`
    let nome = base
    let n = 2
    while (nomesUsados.has(nome)) {
      nome = `${base}_${n}`
      n++
    }
    nomesUsados.add(nome)

    resultado.push({
      unidade,
      nomeArquivo: `${nome}.REM`,
      pagamentos: lista,
      quantidade: lista.length,
      valorTotal: lista.reduce((s, p) => s + (Number.isFinite(p.valorPagamento) ? p.valorPagamento : 0), 0),
    })
  }

  return resultado
}
