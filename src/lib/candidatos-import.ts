/**
 * Regras de conversão da planilha de inscritos → linhas de `candidatos`.
 *
 * POR QUE ISTO É UM MÓDULO SEPARADO DA PÁGINA
 * Toda a decisão difícil da importação é pura: qual coluna vira qual campo, o que é erro
 * que descarta a linha e o que é aviso que só limpa um campo, como ler uma data brasileira.
 * Separado, isso tem teste de verdade (`candidatos-import.test.ts`) sem mock de Supabase —
 * a alternativa é o que aconteceu com `CadastroLote.tsx`, onde a mesma lógica vive dentro
 * de um componente de 1.100 linhas e não tem como ser exercitada.
 *
 * A DISTINÇÃO QUE ORGANIZA O ARQUIVO — erro vs. aviso
 * A identidade do candidato é o NÚMERO DE INSCRIÇÃO, não o CPF (ao contrário do
 * colaborador, que loga com o CPF). Então:
 *   - falta o que IDENTIFICA (inscrição, nome) → ERRO, a linha não entra;
 *   - um campo secundário está impossível (CPF de 10 dígitos, e-mail sem '@') → AVISO,
 *     a linha entra com aquele campo em NULL e o relatório diz qual foi.
 * Descartar o inscrito inteiro por causa do e-mail dele deixaria a lista de inscritos
 * incompleta, que é o único jeito de esta tabela estar de fato errada.
 */

/** Um campo da tabela `candidatos` que o usuário pode preencher a partir da planilha. */
export interface CampoCandidato {
  key: string;
  label: string;
  obrigatorio: boolean;
  /** Palavras que aparecem no cabeçalho da planilha e apontam para este campo. */
  sinonimos: string[];
}

/**
 * Os campos oferecidos no pareamento, na ordem em que aparecem na tela.
 *
 * Três colunas do arquivo de origem NÃO estão aqui, de propósito: `REGISTRO_ORGAO`,
 * `TIPOPROVA` (as duas 100% vazias nas 7.416 linhas) e `SENHA` — senha de terceiro não
 * se importa para lugar nenhum, mesmo vindo vazia.
 */
export const CAMPOS_CANDIDATO: CampoCandidato[] = [
  { key: 'n_inscricao', label: 'Nº de Inscrição', obrigatorio: true, sinonimos: ['ninscricao', 'inscricao', 'id', 'numeroinscricao'] },
  { key: 'nome', label: 'Nome', obrigatorio: true, sinonimos: ['nome', 'nomecandidato', 'nomecompleto'] },
  // ⚠️ 'tipoprova' NÃO está entre os sinônimos, e a ausência é deliberada. No arquivo real
  // o cargo está na SEGUNDA coluna `NOME` (a AC, com 'DOCENTE II'), enquanto `TIPOPROVA`
  // existe e está 100% vazia. Adivinhar TIPOPROVA pareceria acertar e deixaria o cargo
  // nulo em todas as linhas — e como o cargo faz parte da chave natural, as 382 inscrições
  // que se repetem por concorrerem a mais de um cargo colidiriam entre si e 396 inscritos
  // sumiriam sem erro nenhum. Palpite que erra em silêncio é pior que palpite nenhum:
  // sem sinônimo, o campo fica em branco e o usuário PRECISA escolher a coluna.
  { key: 'cargo', label: 'Cargo', obrigatorio: false, sinonimos: ['cargo', 'vaga'] },
  { key: 'cpf', label: 'CPF', obrigatorio: false, sinonimos: ['cpf'] },
  { key: 'email', label: 'E-mail', obrigatorio: false, sinonimos: ['email', 'e-mail'] },
  { key: 'data_nascimento', label: 'Data de Nascimento', obrigatorio: false, sinonimos: ['datanascimento', 'nascimento', 'dtnascimento'] },
  { key: 'hora_nascimento', label: 'Hora de Nascimento', obrigatorio: false, sinonimos: ['horanascimento'] },
  { key: 'sexo', label: 'Sexo', obrigatorio: false, sinonimos: ['sexo', 'genero'] },
  { key: 'raca', label: 'Raça', obrigatorio: false, sinonimos: ['raca', 'cor'] },
  { key: 'portador_deficiencia', label: 'Portador de Deficiência', obrigatorio: false, sinonimos: ['portadordeficiencia', 'deficiente', 'pcd', 'deficiencia'] },
  { key: 'confirmado', label: 'Inscrição Confirmada', obrigatorio: false, sinonimos: ['confirmado', 'confirmacao'] },
  { key: 'telefone', label: 'Telefone', obrigatorio: false, sinonimos: ['telefone', 'fone'] },
  { key: 'celular', label: 'Celular', obrigatorio: false, sinonimos: ['celular'] },
  { key: 'logradouro', label: 'Logradouro', obrigatorio: false, sinonimos: ['logradouro', 'rua', 'endereco'] },
  { key: 'numero', label: 'Número', obrigatorio: false, sinonimos: ['numero', 'numerocasa'] },
  { key: 'complemento', label: 'Complemento', obrigatorio: false, sinonimos: ['complemento', 'complementoendereco'] },
  { key: 'bairro', label: 'Bairro', obrigatorio: false, sinonimos: ['bairro'] },
  { key: 'cidade', label: 'Cidade', obrigatorio: false, sinonimos: ['cidade', 'municipio'] },
  { key: 'uf', label: 'UF', obrigatorio: false, sinonimos: ['uf', 'estado'] },
  { key: 'cep', label: 'CEP', obrigatorio: false, sinonimos: ['cep'] },
  { key: 'identidade_numero', label: 'Identidade — Número', obrigatorio: false, sinonimos: ['identidadenumero', 'rg', 'identidade'] },
  { key: 'identidade_orgao', label: 'Identidade — Órgão', obrigatorio: false, sinonimos: ['identidadeorgao', 'orgaoexpedidor'] },
  { key: 'identidade_uf', label: 'Identidade — UF', obrigatorio: false, sinonimos: ['identidadeuf'] },
  { key: 'identidade_emissao', label: 'Identidade — Emissão', obrigatorio: false, sinonimos: ['identidadeemissao', 'dataexpedicao'] },
  { key: 'concurso_id_origem', label: 'ID do Concurso (origem)', obrigatorio: false, sinonimos: ['concursoid', 'concurso'] },
];

/** A linha da planilha como array de células — indexada por POSIÇÃO, ver `rotulosDeColunas`. */
export type LinhaPlanilha = unknown[];

/** campo da tabela → índice da coluna na planilha (`null` = não mapeado). */
export type Mapeamento = Record<string, number | null>;

export interface ColunaPlanilha {
  indice: number;
  /** O cabeçalho como veio no arquivo. */
  cabecalho: string;
  /** O que a tela mostra: `NOME (coluna AC)` — ver o porquê abaixo. */
  rotulo: string;
}

/** 0 → A, 25 → Z, 26 → AA. O mesmo nome que a pessoa vê aberto no Excel. */
export function letraDaColuna(indice: number): string {
  let n = indice;
  let letra = '';
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}

/**
 * Descreve as colunas da planilha para a tela de pareamento.
 *
 * ⚠️ O PAREAMENTO É POR ÍNDICE, NUNCA POR NOME DE CABEÇALHO — e o arquivo real é a prova
 * de por que: ele tem DUAS colunas chamadas `NOME`, a B (nome da pessoa) e a AC (o cargo,
 * 'DOCENTE II'). Lendo a planilha como objeto (`XLSX.utils.sheet_to_json` sem `header: 1`),
 * a segunda sobrescreve a primeira e todo mundo passa a se chamar 'DOCENTE II'. É assim
 * que `CadastroLote.tsx` lê, e é a razão de esta importação ler em array.
 *
 * Por isso o rótulo carrega a letra da coluna: com dois `NOME` na lista, sem a letra o
 * usuário não tem como saber qual está escolhendo.
 */
export function rotulosDeColunas(cabecalhos: unknown[]): ColunaPlanilha[] {
  const textos = cabecalhos.map((c) => (c ?? '').toString().trim());
  const repetidos = new Set(textos.filter((t, i) => t !== '' && textos.indexOf(t) !== i));

  return textos.map((cabecalho, indice) => {
    const letra = letraDaColuna(indice);
    const vazio = cabecalho === '';
    // Só polui com a letra quando ela resolve alguma coisa: cabeçalho repetido ou vazio.
    const rotulo = vazio
      ? `(sem título — coluna ${letra})`
      : repetidos.has(cabecalho)
        ? `${cabecalho} (coluna ${letra})`
        : cabecalho;
    return { indice, cabecalho, rotulo };
  });
}

/** minúsculas, sem acento, sem separador — para comparar cabeçalho com sinônimo. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s.-]/g, '')
    .trim();
}

/**
 * Palpite inicial do pareamento. É só um palpite: a tela deixa o usuário corrigir tudo,
 * porque é ele quem sabe o que cada coluna significa no arquivo dele.
 *
 * Casa por igualdade exata do cabeçalho normalizado contra os sinônimos — deliberadamente
 * mais rígido que o auto-mapeamento do `CadastroLote`, que usa `includes` nos dois sentidos
 * e por isso casa 'cidade' com 'id'. Aqui, cabeçalho ambíguo fica em branco esperando o
 * usuário, o que é melhor do que casar errado sem avisar.
 *
 * A primeira coluna que casa vence, e cada coluna da planilha é usada uma vez só: como há
 * dois `NOME`, sem isso o campo `cargo` roubaria a coluna B que o campo `nome` já usou.
 */
export function autoMapear(colunas: ColunaPlanilha[]): Mapeamento {
  const mapeamento: Mapeamento = {};
  const usadas = new Set<number>();

  for (const campo of CAMPOS_CANDIDATO) {
    const achada = colunas.find(
      (col) =>
        !usadas.has(col.indice) &&
        col.cabecalho !== '' &&
        campo.sinonimos.includes(normalizarTexto(col.cabecalho)),
    );
    mapeamento[campo.key] = achada ? achada.indice : null;
    if (achada) usadas.add(achada.indice);
  }
  return mapeamento;
}

export function mapeamentoCompleto(mapeamento: Mapeamento): boolean {
  return CAMPOS_CANDIDATO.filter((c) => c.obrigatorio).every(
    (c) => mapeamento[c.key] !== null && mapeamento[c.key] !== undefined,
  );
}

// ── Conversores ──────────────────────────────────────────────────────────────────────

function bruto(linha: LinhaPlanilha, indice: number | null | undefined): string | null {
  if (indice === null || indice === undefined) return null;
  const valor = linha[indice];
  if (valor === null || valor === undefined) return null;
  const texto = valor.toString().trim();
  return texto === '' ? null : texto;
}

/** Só os dígitos, ou null se não sobrar nenhum. */
export function soDigitos(valor: string | null): string | null {
  if (valor === null) return null;
  const digitos = valor.replace(/\D/g, '');
  return digitos === '' ? null : digitos;
}

/**
 * Data brasileira → ISO. Aceita dd/mm/aaaa (o formato do arquivo), aaaa-mm-dd e o serial
 * do Excel; devolve null no que não reconhece.
 *
 * NÃO valida faixa de ano de propósito: o arquivo real traz 1193, 1780 e 2975, e são as
 * datas que a pessoa digitou na inscrição dela. Corrigir isso aqui seria inventar dado;
 * a tabela guarda o que a origem afirma. Ver o comentário da coluna na migration.
 */
export function parseDataBr(valor: string | null): string | null {
  if (valor === null) return null;

  let m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = valor.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const dia = m[1].padStart(2, '0');
    const mes = m[2].padStart(2, '0');
    if (+dia < 1 || +dia > 31 || +mes < 1 || +mes > 12) return null;
    return `${m[3]}-${mes}-${dia}`;
  }

  // Serial do Excel (dias desde 30/12/1899). Só quando é claramente um serial plausível:
  // um campo com '19052' é serial; um com '2005' é ano digitado solto, e vira null.
  if (/^\d+$/.test(valor)) {
    const serial = Number(valor);
    if (serial > 10000 && serial < 60000) {
      const base = Date.UTC(1899, 11, 30);
      const d = new Date(base + serial * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

/**
 * Hora → 'HH:MM:SS'. O arquivo traz '12:43', '21:00:00', mas também '15', '7h00' e '09'
 * (365 células), e hora de nascimento é critério legal de desempate — jogar fora o que dá
 * para entender seria perder informação por preguiça de formato.
 */
export function parseHora(valor: string | null): string | null {
  if (valor === null) return null;
  const m = valor.match(/^(\d{1,2})(?:[h:](\d{1,2}))?(?::(\d{1,2}))?h?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || min > 59 || s > 59) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(min)}:${p(s)}`;
}

/** '1'/'true'/'sim' → true. Célula vazia é `false`, não `null`: a coluna é NOT NULL. */
export function parseBooleano(valor: string | null): boolean {
  if (valor === null) return false;
  return ['1', 'true', 'sim', 's', 'x', 'y', 'yes'].includes(valor.toLowerCase());
}

// ── Montagem da linha ────────────────────────────────────────────────────────────────

export interface CandidatoImportado {
  edital_id: string;
  n_inscricao: string;
  cargo: string | null;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  identidade_numero: string | null;
  identidade_orgao: string | null;
  identidade_uf: string | null;
  identidade_emissao: string | null;
  data_nascimento: string | null;
  hora_nascimento: string | null;
  sexo: string | null;
  raca: number | null;
  portador_deficiencia: boolean;
  confirmado: boolean;
  concurso_id_origem: string | null;
}

export interface LinhaConvertida {
  /** A linha na planilha, 1-based e contando o cabeçalho — o número que o Excel mostra. */
  linhaPlanilha: number;
  candidato: CandidatoImportado | null;
  /** Preenchido quando `candidato` é null: a linha não entra. */
  erro: string | null;
  /** A linha entra, mas estes campos foram para NULL. */
  avisos: string[];
}

const RACAS_VALIDAS = [1, 2, 4, 6, 8, 9];

/**
 * Converte UMA linha. Nunca lança: devolve `erro` (descarta) ou `avisos` (entra parcial),
 * porque numa importação de 7 mil linhas uma exceção no meio é perda de trabalho.
 */
export function converterLinha(
  linha: LinhaPlanilha,
  mapeamento: Mapeamento,
  editalId: string,
  linhaPlanilha: number,
): LinhaConvertida {
  const val = (campo: string) => bruto(linha, mapeamento[campo]);
  const avisos: string[] = [];
  const falha = (erro: string): LinhaConvertida => ({ linhaPlanilha, candidato: null, erro, avisos });

  // ── O que identifica: falta → a linha não entra ────────────────────────────────
  const nInscricao = val('n_inscricao');
  if (nInscricao === null) return falha('Nº de inscrição vazio');
  if (nInscricao.length > 8) {
    return falha(`Nº de inscrição "${nInscricao}" tem ${nInscricao.length} caracteres (o limite é 8)`);
  }

  const nome = val('nome');
  if (nome === null) return falha('Nome vazio');

  // ── O que é secundário: impossível → NULL + aviso ──────────────────────────────
  let cpf = soDigitos(val('cpf'));
  if (cpf !== null && cpf.length !== 11) {
    avisos.push(`CPF "${val('cpf')}" não tem 11 dígitos — gravado sem CPF`);
    cpf = null;
  }

  let email = val('email');
  if (email !== null) {
    email = email.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      avisos.push(`E-mail "${email}" é inválido — gravado sem e-mail`);
      email = null;
    }
  }

  const dataBruta = val('data_nascimento');
  const dataNascimento = parseDataBr(dataBruta);
  if (dataBruta !== null && dataNascimento === null) {
    avisos.push(`Data de nascimento "${dataBruta}" não foi reconhecida — gravada em branco`);
  }

  let cep = soDigitos(val('cep'));
  if (cep !== null && cep.length !== 8) {
    avisos.push(`CEP "${val('cep')}" não tem 8 dígitos — gravado sem CEP`);
    cep = null;
  }

  const racaBruta = soDigitos(val('raca'));
  let raca: number | null = racaBruta === null ? null : Number(racaBruta);
  if (raca !== null && !RACAS_VALIDAS.includes(raca)) {
    avisos.push(`Raça "${val('raca')}" não é um código conhecido — gravada em branco`);
    raca = null;
  }

  // varchar(2) no banco: corta em vez de estourar a carga. 'BR', 'UF' e '13' aparecem no
  // arquivo real como UF de identidade — não são estados, mas são o que a origem afirma.
  const recortarUf = (v: string | null) => (v === null ? null : v.slice(0, 2).toUpperCase());

  const candidato: CandidatoImportado = {
    edital_id: editalId,
    n_inscricao: nInscricao,
    cargo: val('cargo'),
    nome,
    cpf,
    email,
    telefone: val('telefone'),
    celular: val('celular'),
    logradouro: val('logradouro'),
    numero: val('numero'),
    complemento: val('complemento'),
    bairro: val('bairro'),
    cidade: val('cidade'),
    uf: recortarUf(val('uf')),
    cep,
    identidade_numero: val('identidade_numero'),
    identidade_orgao: val('identidade_orgao'),
    identidade_uf: recortarUf(val('identidade_uf')),
    identidade_emissao: parseDataBr(val('identidade_emissao')),
    data_nascimento: dataNascimento,
    hora_nascimento: parseHora(val('hora_nascimento')),
    sexo: val('sexo'),
    raca,
    portador_deficiencia: parseBooleano(val('portador_deficiencia')),
    confirmado: parseBooleano(val('confirmado')),
    concurso_id_origem: val('concurso_id_origem'),
  };

  return { linhaPlanilha, candidato, erro: null, avisos };
}

/** A chave natural da linha — a mesma do índice único `candidatos_inscricao_cargo_key`. */
export function chaveNatural(c: CandidatoImportado): string {
  return `${c.n_inscricao}||${(c.cargo ?? '').trim().toLowerCase()}`;
}

export interface Deduplicacao {
  candidatos: CandidatoImportado[];
  /** Linhas descartadas por repetirem a chave de uma linha posterior do mesmo arquivo. */
  repetidas: { linhaPlanilha: number; chave: string }[];
}

/**
 * Tira do lote as chaves repetidas DENTRO DO PRÓPRIO ARQUIVO, mantendo a última ocorrência.
 *
 * ⚠️ Isto não é zelo, é obrigatório: o Postgres recusa o lote inteiro com "ON CONFLICT DO
 * UPDATE command cannot affect row a second time" se a mesma chave aparecer duas vezes no
 * mesmo upsert. Sem esta passagem, um arquivo com uma linha duplicada não importa NADA —
 * falha o bloco de 500 inteiro, e a pessoa não tem como saber por quê.
 *
 * Mantém a ÚLTIMA porque, quando alguém corrige uma linha, o costume é reescrevê-la abaixo.
 */
export function deduplicar(linhas: LinhaConvertida[]): Deduplicacao {
  const porChave = new Map<string, { candidato: CandidatoImportado; linhaPlanilha: number }>();
  const repetidas: { linhaPlanilha: number; chave: string }[] = [];

  for (const linha of linhas) {
    if (!linha.candidato) continue;
    const chave = chaveNatural(linha.candidato);
    const anterior = porChave.get(chave);
    if (anterior) repetidas.push({ linhaPlanilha: anterior.linhaPlanilha, chave });
    porChave.set(chave, { candidato: linha.candidato, linhaPlanilha: linha.linhaPlanilha });
  }

  return {
    candidatos: [...porChave.values()].map((v) => v.candidato),
    repetidas,
  };
}

/**
 * Traduz o erro do Postgres para o que a pessoa tem de corrigir NA PLANILHA.
 *
 * Ter as CHECKs no banco só ajuda se a mensagem chegar legível (regra 4 de invariantes.md):
 * 'violates check constraint "chk_candidato_cpf_formato"' não diz a ninguém o que fazer.
 */
export function mensagemErroImportacao(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('candidatos_inscricao_cargo_key')) {
    return 'Há inscrições repetidas (mesmo nº de inscrição e mesmo cargo) neste bloco.';
  }
  if (m.includes('chk_candidato_cpf_formato')) return 'CPF fora do formato de 11 dígitos.';
  if (m.includes('chk_candidato_cep_formato')) return 'CEP fora do formato de 8 dígitos.';
  if (m.includes('chk_candidato_email_formato')) return 'E-mail em formato inválido.';
  if (m.includes('chk_candidato_raca_valida')) return 'Código de raça desconhecido.';
  if (m.includes('chk_candidato_nome_preenchido')) return 'Nome em branco.';
  if (m.includes('chk_candidato_n_inscricao_preenchido')) return 'Nº de inscrição em branco.';
  if (m.includes('value too long')) {
    return 'Algum valor excede o tamanho da coluna (o nº de inscrição aceita até 8 caracteres).';
  }
  if (m.includes('violates check constraint')) return 'Algum valor viola uma regra do banco.';
  if (m.includes('row-level security') || m.includes('permission denied')) {
    return 'Sem permissão para gravar candidatos. É necessário ser administrador.';
  }
  return mensagem;
}
