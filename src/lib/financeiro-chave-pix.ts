/**
 * Inferência e validação de chave PIX a partir de um valor bruto de planilha.
 * Portado de `gera_cnab_pix/src/lib/valida_chave.ts` na Fase 2 do
 * roadmap-modulo-financeiro.yaml.
 */
export interface InferredPixKey {
  tipoChavePix: string // '01' | '02' | '03' | '04'
  chavePix: string
  // true quando o valor de 11 dígitos passa TANTO na validação de CPF quanto no
  // formato de celular — palpite incerto que a conferência humana deve confirmar.
  ambigua?: boolean
}

/**
 * Dados já conhecidos do favorecido (outras colunas do CSV) usados para
 * desambiguar a chave Pix antes da inferência estrutural. Resolvem o caso
 * em que um valor de 11 dígitos poderia ser tanto CPF quanto telefone.
 */
export interface ReferenciaFavorecido {
  cpf?: string
  telefone?: string
}

/**
 * Verifica se a string atende ao formato de e-mail básico.
 */
const isEmail = (val: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(val)
}

/**
 * Verifica se a string atende ao formato de chave aleatória (padrão UUID de 36 caracteres).
 */
const isChaveAleatoria = (val: string): boolean => {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  return uuidRegex.test(val)
}

/**
 * Valida os dígitos verificadores de um CPF (11 dígitos), pelo algoritmo oficial
 * (módulo 11). Rejeita sequências de dígitos repetidos (ex.: 00000000000), que
 * satisfazem a fórmula mas não são CPFs válidos.
 */
const cpfTemDigitosValidos = (val: string): boolean => {
  const s = val.replace(/\D/g, '')
  if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false
  const d = s.split('').map(Number)
  let soma = 0
  for (let i = 0; i < 9; i++) soma += d[i] * (10 - i)
  let dv1 = (soma * 10) % 11
  if (dv1 === 10) dv1 = 0
  if (dv1 !== d[9]) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += d[i] * (11 - i)
  let dv2 = (soma * 10) % 11
  if (dv2 === 10) dv2 = 0
  return dv2 === d[10]
}

/**
 * Heurística de celular brasileiro em 11 dígitos crus: DDD plausível (11–99) e
 * terceiro dígito igual a 9 (o número do assinante móvel tem 9 dígitos e começa
 * por 9). Não confere a lista oficial de DDDs.
 */
const pareceCelularBR = (val: string): boolean => {
  const s = val.replace(/\D/g, '')
  if (s.length !== 11) return false
  const ddd = Number(s.slice(0, 2))
  return ddd >= 11 && ddd <= 99 && s[2] === '9'
}

/**
 * Analisa e formata a string para o padrão de telefone celular esperado pelo Itaú (+55...).
 */
const analisarTelefone = (val: string): string | null => {
  // Remove todos os caracteres exceto dígitos e o sinal de '+' no início
  const limpo = val.replace(/[^\d+]/g, '')
  const apenasDigitos = limpo.replace(/\D/g, '')

  // Caso 1: Apenas DDD e número de celular (ex: 24999999999) -> 11 dígitos
  // Nota: Telefones fixos (10 dígitos) também são aceitos pelo sistema
  if (apenasDigitos.length === 10 || apenasDigitos.length === 11) {
    return `+55${apenasDigitos}`
  }

  // Caso 2: Contém código do país sem o sinal de '+' (ex: 5524999999999) -> 12 ou 13 dígitos
  if ((apenasDigitos.length === 12 || apenasDigitos.length === 13) && apenasDigitos.startsWith('55')) {
    return `+${apenasDigitos}`
  }

  // Caso 3: Já formatado com '+' e código do país (ex: +5524999999999)
  if (limpo.startsWith('+') && (apenasDigitos.length === 12 || apenasDigitos.length === 13)) {
    return limpo
  }

  return null
}

/**
 * Analisa uma chave Pix em estado bruto, infere seu respectivo tipo e
 * a formata conforme as regras estabelecidas pelo manual do banco para Pessoas Físicas.
 *
 * @param chaveRaw Chave Pix bruta extraída da fonte de dados
 * @param referencia Colunas conhecidas do favorecido (CPF/Telefone) para desambiguação
 * @returns Um objeto do tipo InferredPixKey ou null se a inferência falhar
 */
export const inferirTipoEFormatarChavePix = (
  chaveRaw: string,
  referencia: ReferenciaFavorecido = {},
): InferredPixKey | null => {
  if (!chaveRaw) {
    return null
  }

  const chaveTratada = chaveRaw.trim()
  const chaveDigitos = chaveTratada.replace(/\D/g, '')

  // ================================================================
  // PRÉ-VERIFICAÇÕES POR COMPARAÇÃO COM COLUNAS CONHECIDAS
  // Rodam antes da inferência estrutural para resolver a ambiguidade
  // entre CPF e Telefone (ambos com 11 dígitos).
  // ================================================================

  // 1. chave_pix igual ao CPF do favorecido -> Tipo 03 (CPF)
  const cpfReferencia = (referencia.cpf ?? '').replace(/\D/g, '')
  if (cpfReferencia && chaveDigitos === cpfReferencia) {
    return {
      tipoChavePix: '03',
      chavePix: cpfReferencia,
    }
  }

  // 2. chave_pix igual ao Telefone do favorecido (11 dígitos) -> Tipo 01, prefixa "+55"
  const telefoneReferencia = (referencia.telefone ?? '').replace(/\D/g, '')
  if (telefoneReferencia && chaveDigitos.length === 11 && chaveDigitos === telefoneReferencia) {
    return {
      tipoChavePix: '01',
      chavePix: `+55${chaveDigitos}`,
    }
  }

  // 1. Verificação de Chave Aleatória (padrão estrutural estrito sem limpeza de letras)
  if (isChaveAleatoria(chaveTratada)) {
    return {
      tipoChavePix: '04',
      chavePix: chaveTratada.toLowerCase(),
    }
  }

  // 2. Verificação de E-mail (padrão estrutural estrito contendo '@')
  if (isEmail(chaveTratada)) {
    return {
      tipoChavePix: '02',
      chavePix: chaveTratada,
    }
  }

  // 3. Desambiguação de 11 dígitos crus: CPF x celular.
  //    Os dígitos verificadores do CPF são o sinal mais forte (2 dígitos de
  //    redundância; ~1% de falsos positivos). O formato de celular (DDD + 9)
  //    resolve os valores que não passam no CPF. Quando AMBOS batem, o valor é
  //    genuinamente ambíguo: devolve o melhor palpite (CPF) marcado `ambigua`
  //    para a conferência humana confirmar antes de gerar o arquivo.
  if (chaveDigitos.length === 11) {
    const ehCpf = cpfTemDigitosValidos(chaveDigitos)
    const ehCelular = pareceCelularBR(chaveDigitos)
    if (ehCpf && ehCelular) {
      return { tipoChavePix: '03', chavePix: chaveDigitos, ambigua: true }
    }
    if (ehCpf) {
      return { tipoChavePix: '03', chavePix: chaveDigitos }
    }
    if (ehCelular) {
      return { tipoChavePix: '01', chavePix: `+55${chaveDigitos}` }
    }
    // 11 dígitos que não é CPF válido nem celular plausível: não infere aqui
    // (cai no fallback do conversor, que usa o CPF do favorecido — Tipo 03).
    return null
  }

  // 4. Verificação de Telefone (padrão de celular brasileiro com prefixo internacional)
  const telefoneFormatado = analisarTelefone(chaveTratada)
  if (telefoneFormatado !== null) {
    return {
      tipoChavePix: '01',
      chavePix: telefoneFormatado,
    }
  }

  return null
}
