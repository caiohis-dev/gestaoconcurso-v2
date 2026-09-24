/**
 * Mapeamento de colunas da planilha de pagamento e conversão em `PagamentoPix`.
 * Portado de `gera_cnab_pix/src/lib/interface_planilha_to_qnab.ts` na Fase 2 do
 * roadmap-modulo-financeiro.yaml. É o maior agregador de regra de negócio do módulo.
 */
import type { PagamentoPix } from './financeiro-cnab240-tipos'
import type { Matriz } from './financeiro-ler-planilha'
import { inferirTipoEFormatarChavePix } from './financeiro-chave-pix'

/**
 * Identificadores internos das colunas que o sistema consome.
 */
export type IdColunaSistema =
  | 'nome'
  | 'cpf'
  | 'valor'
  | 'edital'
  | 'matricula'
  | 'telefone'
  | 'chavePix'
  | 'tipoChavePix'
  // Colunas adicionais (opcionais) presentes na planilha de colaboradores
  | 'bairro'
  | 'cbo'
  | 'cep'
  | 'cidade'
  | 'complemento'
  | 'dataNascimento'
  | 'estadoCivil'
  | 'funcao'
  | 'grauInstrucao'
  | 'numero'
  | 'pcd'
  | 'pis'
  | 'raca'
  | 'rua'
  | 'siglaUnidade'

export interface DefColunaSistema {
  id: IdColunaSistema
  label: string
  obrigatoria: boolean
  // true quando o valor da coluna pode ser inferido/derivado pelo sistema
  // quando ausente (ex.: chave_pix / tipo_chave_pix). Mostra o selo "Sujeito a inferência".
  sujeitoInferencia?: boolean
}

/**
 * Fonte da verdade das colunas do sistema e sua obrigatoriedade.
 * O `label` também é usado como palpite ao auto-mapear o cabeçalho da planilha.
 */
export const COLUNAS_SISTEMA: DefColunaSistema[] = [
  { id: 'nome', label: 'Nome Completo', obrigatoria: true },
  { id: 'cpf', label: 'CPF', obrigatoria: true },
  { id: 'valor', label: 'Valor Líquido', obrigatoria: true },
  { id: 'edital', label: 'Edital', obrigatoria: true },
  { id: 'siglaUnidade', label: 'Sigla Unidade', obrigatoria: true },
  { id: 'funcao', label: 'Função', obrigatoria: true },
  { id: 'matricula', label: 'Matrícula', obrigatoria: true },
  { id: 'telefone', label: 'Telefone', obrigatoria: true },
  { id: 'chavePix', label: 'chave_pix', obrigatoria: true },
  { id: 'tipoChavePix', label: 'tipo_chave_pix', obrigatoria: false, sujeitoInferencia: true },
  // Demais colunas da planilha — opcionais, em ordem alfabética.
  { id: 'bairro', label: 'Bairro', obrigatoria: false },
  { id: 'cbo', label: 'CBO', obrigatoria: false },
  { id: 'cep', label: 'CEP', obrigatoria: false },
  { id: 'cidade', label: 'Cidade', obrigatoria: false },
  { id: 'complemento', label: 'Complemento', obrigatoria: false },
  { id: 'dataNascimento', label: 'Data Nascimento', obrigatoria: false },
  { id: 'estadoCivil', label: 'Estado Civil', obrigatoria: false },
  { id: 'grauInstrucao', label: 'Grau Instrução', obrigatoria: false },
  { id: 'numero', label: 'Número', obrigatoria: false },
  { id: 'pcd', label: 'PcD', obrigatoria: false },
  { id: 'pis', label: 'PIS', obrigatoria: false },
  { id: 'raca', label: 'Raça', obrigatoria: false },
  { id: 'rua', label: 'Rua', obrigatoria: false },
]

/**
 * Correspondência coluna do sistema -> índice da coluna na planilha (-1 = ausente).
 */
export type MapeamentoColunas = Record<IdColunaSistema, number>

/**
 * Normaliza e limpa a chave Pix de acordo com as regras de formatação do tipo correspondente.
 */
const normalizarChavePix = (chave: string, tipo: string): string => {
  const limpa = chave.trim()
  if (tipo === '03') {
    // CPF: mantém apenas dígitos numéricos
    return limpa.replace(/\D/g, '')
  }
  if (tipo === '01') {
    // Telefone: de acordo com a nota 40 do manual, deve iniciar com "+" (ex: +5524999999999)
    const digitos = limpa.replace(/[^\d+]/g, '')
    if (digitos.startsWith('+')) {
      return digitos
    }
    return `+55${digitos.replace(/\D/g, '')}`
  }
  // Para Email ('02') ou Chave Aleatória ('04'), preserva o valor bruto original
  return limpa
}

/**
 * Normaliza um rótulo para comparação tolerante: sem acentos, minúsculo,
 * sem espaços/underscores. Ex.: "Valor Líquido" ~ "valor_liquido".
 */
const normalizarRotulo = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '')

/** Verdadeiro se a linha da matriz não contém nenhuma célula preenchida. */
const linhaVazia = (linha: string[]): boolean => linha.every((c) => c.trim() === '')

/**
 * Lê o cabeçalho (primeira linha) da planilha e devolve os nomes de coluna já limpos.
 */
export const lerCabecalho = (matriz: Matriz): string[] => (matriz[0] ?? []).map((col) => col.trim())

/**
 * Devolve os valores da primeira linha de dados (usada para prévia no mapeamento).
 */
export const lerPrimeiraLinhaDados = (matriz: Matriz): string[] => {
  for (let i = 1; i < matriz.length; i++) {
    if (!linhaVazia(matriz[i])) return matriz[i].map((col) => col.trim())
  }
  return []
}

/** Conta as linhas de dados (fora o cabeçalho) que possuem algum conteúdo. */
export const contarLinhasDados = (matriz: Matriz): number => {
  let total = 0
  for (let i = 1; i < matriz.length; i++) {
    if (!linhaVazia(matriz[i])) total++
  }
  return total
}

/**
 * Monta um palpite de mapeamento a partir do cabeçalho: match exato do rótulo
 * e, na falta dele, match normalizado. Retorna -1 para colunas não encontradas.
 */
export const sugerirMapeamento = (cabecalho: string[]): MapeamentoColunas => {
  const normalizados = cabecalho.map(normalizarRotulo)
  const localizar = (label: string): number => {
    const exato = cabecalho.indexOf(label)
    if (exato !== -1) return exato
    return normalizados.indexOf(normalizarRotulo(label))
  }
  const mapa = {} as MapeamentoColunas
  for (const col of COLUNAS_SISTEMA) mapa[col.id] = localizar(col.label)
  return mapa
}

/**
 * Consome a matriz de uma planilha (.xls/.xlsx) e converte em
 * uma lista de PagamentoPix compatível com o gerador de arquivos CNAB.
 *
 * @param matriz Linhas × colunas da planilha (primeira linha = cabeçalho)
 * @param dataPagamento Data em que o pagamento será agendado (formato DDMMAAAA)
 * @param mapeamento Correspondência coluna do sistema -> índice na planilha. Se
 *   omitido, é inferido automaticamente do cabeçalho.
 */
export const converterPlanilhaParaPagamentoPix = (
  matriz: Matriz,
  dataPagamento: string,
  mapeamento?: MapeamentoColunas,
): PagamentoPix[] => {
  if (matriz.length === 0) return []

  const cabecalho = lerCabecalho(matriz)
  const mapa = mapeamento ?? sugerirMapeamento(cabecalho)

  const idxNome = mapa.nome
  const idxCpf = mapa.cpf
  const idxValor = mapa.valor
  const idxEdital = mapa.edital
  const idxSiglaUnidade = mapa.siglaUnidade
  const idxFuncao = mapa.funcao
  const idxChavePix = mapa.chavePix
  const idxTipoChavePix = mapa.tipoChavePix
  const idxTelefone = mapa.telefone

  if (
    idxNome === -1 ||
    idxCpf === -1 ||
    idxValor === -1 ||
    idxEdital === -1 ||
    idxSiglaUnidade === -1 ||
    idxFuncao === -1
  ) {
    throw new Error(
      'Colunas obrigatórias ("Nome Completo", "CPF", "Valor Líquido", "Edital", "Sigla Unidade", "Função") não foram mapeadas.',
    )
  }

  const pagamentos: PagamentoPix[] = []

  for (let i = 1; i < matriz.length; i++) {
    const colunas = matriz[i]
    if (linhaVazia(colunas)) continue

    const nome = colunas[idxNome] ? colunas[idxNome].trim() : ''
    const cpfOriginal = colunas[idxCpf] ? colunas[idxCpf].trim() : ''
    const edital = colunas[idxEdital] ? colunas[idxEdital].trim() : ''
    const siglaUnidade = colunas[idxSiglaUnidade] ? colunas[idxSiglaUnidade].trim() : ''
    const funcao = colunas[idxFuncao] ? colunas[idxFuncao].trim() : ''
    const valorStr = colunas[idxValor] ? colunas[idxValor].trim() : '0'

    // Dados das novas colunas com fallbacks
    const tipoChaveOriginal = idxTipoChavePix !== -1 && colunas[idxTipoChavePix] ? colunas[idxTipoChavePix].trim() : ''
    const chavePixOriginal = idxChavePix !== -1 && colunas[idxChavePix] ? colunas[idxChavePix].trim() : ''
    const telefoneOriginal = idxTelefone !== -1 && colunas[idxTelefone] ? colunas[idxTelefone].trim() : ''

    const cpfSanitizado = cpfOriginal.replace(/\D/g, '')

    if (!nome || !cpfSanitizado) {
      continue // Ignora linhas inconsistentes
    }

    const valorNumerico = parseFloat(valorStr.replace(',', '.'))

    // Valor bruto da chave Pix (se não houver coluna própria, assume o CPF do favorecido)
    const chavePixBruta = chavePixOriginal !== '' ? chavePixOriginal : cpfSanitizado

    let tipoChavePix: string
    let chavePix: string
    let chaveAmbigua = false

    if (tipoChaveOriginal !== '') {
      // Tipo informado explicitamente na planilha: respeita e apenas normaliza a chave
      tipoChavePix = tipoChaveOriginal
      chavePix = normalizarChavePix(chavePixBruta, tipoChavePix)
    } else {
      // HIPÓTESE PREVISTA: coluna "tipo_chave_pix" ausente/vazia.
      // Infere o tipo a partir do próprio valor da chave e retorna o
      // par (tipo, chave) já no formato esperado pelo Itaú.
      const inferida = inferirTipoEFormatarChavePix(chavePixBruta, {
        cpf: cpfSanitizado,
        telefone: telefoneOriginal,
      })
      if (inferida) {
        tipoChavePix = inferida.tipoChavePix
        chavePix = inferida.chavePix
        chaveAmbigua = inferida.ambigua === true
      } else {
        // Inferência falhou: usa o CPF do favorecido como chave (Tipo 03 - CPF)
        tipoChavePix = '03'
        chavePix = normalizarChavePix(cpfSanitizado, '03')
      }
    }

    pagamentos.push({
      nomeFornecedor: nome,
      cpfFornecedor: cpfSanitizado,
      edital: edital,
      siglaUnidade: siglaUnidade,
      funcao: funcao,
      dataPagamento: dataPagamento,
      valorPagamento: valorNumerico,
      tipoChavePix: tipoChavePix,
      chavePix: chavePix,
      chaveInferida: tipoChaveOriginal === '',
      chaveAmbigua: chaveAmbigua,
    })
  }

  // Regra de negócio: toda linha deve ter a "Sigla Unidade" preenchida — é o que
  // agrupa a geração em um arquivo CNAB por unidade.
  if (pagamentos.some((p) => p.siglaUnidade === '')) {
    throw new Error(
      'A coluna "Sigla Unidade" está vazia em uma ou mais linhas. ' +
        'Preencha a sigla da unidade em todas as linhas e envie novamente.',
    )
  }

  // Regra de negócio: toda linha deve ter a "Função" preenchida — compõe a
  // "Informação entre Usuários" do Segmento B ([EDITAL] - [FUNÇÃO]).
  if (pagamentos.some((p) => p.funcao === '')) {
    throw new Error(
      'A coluna "Função" está vazia em uma ou mais linhas. ' +
        'Preencha a função em todas as linhas e envie novamente.',
    )
  }

  // Regra de negócio: todas as linhas devem pertencer ao MESMO edital.
  const editaisDistintos = Array.from(new Set(pagamentos.map((p) => p.edital)))
  if (editaisDistintos.length === 1 && editaisDistintos[0] === '') {
    throw new Error('A coluna "Edital" está vazia. Preencha o edital nas linhas da planilha e envie novamente.')
  }
  if (editaisDistintos.length > 1) {
    const listados = editaisDistintos.map((e) => (e === '' ? '(vazio)' : `"${e}"`)).join(', ')
    throw new Error(
      `A planilha contém editais diferentes (${listados}). Todas as linhas devem pertencer ao mesmo edital. ` +
        'Ajuste o arquivo para conter um único edital e envie novamente.',
    )
  }

  // Ordena ASC por nome (pt-BR, ignorando caixa/acentos). Como a tabela da UI,
  // o arquivo CNAB e o XLS exportado consomem este mesmo array, todos ficam ordenados.
  pagamentos.sort((a, b) => a.nomeFornecedor.localeCompare(b.nomeFornecedor, 'pt-BR', { sensitivity: 'base' }))

  return pagamentos
}
