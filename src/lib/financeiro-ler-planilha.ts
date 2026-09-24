/**
 * Leitura de planilha (.xls/.xlsx) para matriz de texto. Portado de
 * `gera_cnab_pix/src/lib/ler_planilha.ts` na Fase 2 do roadmap-modulo-financeiro.yaml.
 */
import * as XLSX from 'xlsx'

/**
 * Matriz de células já normalizadas em texto: linhas × colunas.
 * A primeira linha é o cabeçalho; as demais são dados.
 */
export type Matriz = string[][]

/** Extensões de planilha aceitas pelo sistema. */
export const EXTENSOES_ACEITAS = ['.xls', '.xlsx'] as const

const temExtensaoDePlanilha = (nome: string): boolean => {
  const lower = nome.toLowerCase()
  return EXTENSOES_ACEITAS.some((ext) => lower.endsWith(ext))
}

/**
 * Converte o valor bruto de uma célula (que pode ser number, boolean ou string)
 * em texto, preservando a fidelidade numérica (ex.: valores e CPFs numéricos não
 * passam por formatação de exibição). Datas seriais não são usadas por este
 * sistema — a data de pagamento é escolhida na interface.
 */
const celulaParaTexto = (valor: unknown): string => {
  if (valor === null || valor === undefined) return ''
  return String(valor).trim()
}

/**
 * Lê um arquivo `.xls`/`.xlsx` e devolve a primeira aba como matriz `string[][]`.
 * Rejeita qualquer outro formato (o sistema não lê mais CSV).
 */
export const lerPlanilha = async (file: File): Promise<Matriz> => {
  if (!temExtensaoDePlanilha(file.name)) {
    throw new Error('Formato não suportado. Envie um arquivo .xls ou .xlsx.')
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const primeiraAba = workbook.SheetNames[0]
  if (!primeiraAba) {
    throw new Error('A planilha não contém nenhuma aba de dados.')
  }

  const worksheet = workbook.Sheets[primeiraAba]
  // header: 1 -> array de arrays; raw: true -> mantém números como números;
  // defval: '' -> células vazias viram string vazia (mantém o alinhamento das colunas).
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  })

  return linhas.map((linha) => linha.map(celulaParaTexto))
}
