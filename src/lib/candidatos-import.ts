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
  // nulo em todas as linhas. Palpite que erra em silêncio é pior que palpite nenhum:
  // sem sinônimo, o campo fica em branco e o usuário PRECISA escolher a coluna.
  // ⚠️ Este comentário dizia que zerar o cargo faria "396 inscritos sumirem". CORRIGIDO em
  // 2026-07-28: aquilo vinha de ler o nº de inscrição na coluna `ID` (que é a PESSOA). Com
  // a coluna certa (`N_INSCRICAO`, única por linha), medido: não parear o cargo mantém as
  // 7.416 linhas. A perda é ZERO — o motivo de o campo não ser adivinhado continua sendo o
  // silêncio do erro, não um número de inscritos perdidos.
  // OBRIGATÓRIO desde 2026-07-27 (decisão D4 do roadmap de cargos). Antes era opcional.
  // O motivo: o cargo compõe a identidade do candidato, e a partir do passo "Cargos" ele
  // vira uma referência (`cargo_id`). Planilha sem coluna de cargo deixaria todos os
  // `cargo_id` nulos, e a lista importada não responderia "quantos inscritos por cargo",
  // que é a pergunta que este módulo existe para responder. (Não há perda de linha: ver a
  // correção de 2026-07-28 acima.)
  // ⚠️ Obrigatório NÃO é adivinhado: `'tipoprova'` continua fora dos sinônimos (ver acima).
  // A pessoa PRECISA escolher a coluna, e agora não consegue seguir sem escolher.
  { key: 'cargo', label: 'Cargo', obrigatorio: true, sinonimos: ['cargo', 'vaga'] },
  { key: 'cpf', label: 'CPF', obrigatorio: false, sinonimos: ['cpf'] },
  { key: 'email', label: 'E-mail', obrigatorio: false, sinonimos: ['email', 'e-mail'] },
  { key: 'data_nascimento', label: 'Data de Nascimento', obrigatorio: false, sinonimos: ['datanascimento', 'nascimento', 'dtnascimento'] },
  { key: 'hora_nascimento', label: 'Hora de Nascimento', obrigatorio: false, sinonimos: ['horanascimento'] },
  { key: 'sexo', label: 'Sexo', obrigatorio: false, sinonimos: ['sexo', 'genero'] },
  { key: 'raca', label: 'Raça', obrigatorio: false, sinonimos: ['raca', 'cor'] },
  { key: 'portador_deficiencia', label: 'Portador de Deficiência', obrigatorio: false, sinonimos: ['portadordeficiencia', 'deficiente', 'pcd', 'deficiencia'] },
  // 🔴 OBRIGATÓRIO desde 2026-08-01, e o motivo NÃO é zelo: desde esta data só o inscrito
  // com a inscrição paga é importado (`separarPorPagamento`), e quem responde "pagou?" é
  // esta coluna. Se ela ficasse opcional e o usuário não a pareasse, `parseBooleano(null)`
  // devolveria `false` para TODA linha — o filtro descartaria o arquivo inteiro. E como
  // importar é TROCA TOTAL, o resultado seria a lista do edital apagada, ninguém no lugar
  // e a tela dizendo "concluída". Perda total e silenciosa.
  //
  // É o mesmo precedente do `cargo` (decisão D4), tomado pelo mesmo motivo: campo cuja
  // ausência produz resultado errado EM SILÊNCIO não pode ser opcional.
  //
  // ⚠️ Ao contrário do cargo, este campo TEM sinônimo e auto-mapeia: o cabeçalho do
  // arquivo real é `CONFIRMADO`, que `normalizarTexto` casa com `'confirmado'`. Adivinhar
  // aqui é seguro porque não há segunda coluna candidata — o perigo do cargo era existir
  // `TIPOPROVA` vazia para o palpite acertar por fora.
  { key: 'confirmado', label: 'Inscrição Confirmada', obrigatorio: true, sinonimos: ['confirmado', 'confirmacao'] },
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
  /** TEXT, não number: valor impossível entra cru (migration 20260730100000). */
  raca: string | null;
  portador_deficiencia: boolean;
  confirmado: boolean;
  concurso_id_origem: string | null;
}

export interface LinhaConvertida {
  /**
   * A linha na planilha, 1-based e contando o cabeçalho.
   *
   * ⚠️ Desde 2026-08-01 este número NÃO aparece mais nos relatórios exportados — quem
   * identifica a linha para o usuário é o nº de inscrição. Ele continua aqui porque é o
   * critério de ORDENAÇÃO do relatório e o que `deduplicar` guarda em `repetidas`.
   */
  linhaPlanilha: number;
  /**
   * O nº de inscrição COMO VEIO da planilha, preenchido MESMO quando a linha falha.
   *
   * 🔴 Existe separado de `candidato.n_inscricao` por um motivo só: a linha com `erro` tem
   * `candidato` NULO, e é justamente ela que o relatório precisa identificar. Sem este
   * campo, "Nome vazio" e "Cargo vazio" — que têm inscrição — sairiam sem nada que
   * permitisse achar a pessoa.
   *
   * `null` só no caso em que a própria inscrição falta ('Nº de inscrição vazio'). Aí o
   * relatório mostra '—', e quem localiza a linha é o texto do erro.
   */
  nInscricao: string | null;
  candidato: CandidatoImportado | null;
  /** Preenchido quando `candidato` é null: a linha não entra. */
  erro: string | null;
  /**
   * A linha entra INTEIRA, e estes campos entraram com o valor impossível que a origem
   * mandou. Desde 2026-07-30 o aviso não anuncia perda — anuncia o que precisa ser
   * corrigido na fonte. Nada é descartado aqui; para isso existe `erro`.
   */
  avisos: string[];
}

const RACAS_VALIDAS = [1, 2, 4, 6, 8, 9];

/**
 * O que um nome pode ter além de letra: espaço, apóstrofo (`D'AVILA`), hífen
 * (`SANTA-CRUZ`) e ponto de abreviação (`MÁRCIA A. MALAQUIAS`).
 *
 * ⚠️ `\p{L}` cobre LETRA ACENTUADA de propósito — 1.527 dos 7.416 nomes do arquivo real
 * têm acento (`BRANDÃO`, `JÚLIA`). Acusá-los transformaria a regra em ruído: acento é
 * nome brasileiro normal, não caractere estranho.
 *
 * ⚠️ O PONTO ficou de fora por decisão do usuário em 2026-07-30. Ele aparece em 8 linhas,
 * todas abreviação legítima; acusá-las gastaria a atenção do usuário em falso positivo.
 *
 * SEM a flag `g`: um regex global de módulo usado com `.test()` guarda `lastIndex` entre
 * chamadas e passa a alternar resultado na mesma entrada. É a armadilha clássica, e aqui
 * ela produziria aviso em dia sim, dia não.
 */
const CARACTERE_ACEITO_NO_NOME = /[\p{L}\s'.-]/u;

/**
 * Palavras que denunciam registro de desenvolvedor solto na lista de inscritos.
 *
 * A busca é por SUBSTRING, não por palavra inteira — é o que pega `TESTEPAULO`, que é uma
 * palavra só e foi o caso real que motivou a regra (3 linhas do arquivo, medido em 30/07).
 *
 * ⚠️ ORDEM IMPORTA: da mais específica para a mais genérica, porque o `find` para na
 * primeira e é ela que aparece na mensagem. Com `'test'` antes, `TESTEPAULO` seria
 * acusado de conter "test" quando o que ele contém é "teste".
 *
 * ⚠️ FALSO POSITIVO CONHECIDO, aceito por ser aviso e não descarte: `TESTA` é sobrenome
 * brasileiro legítimo (origem italiana) e seria acusado. Medido no arquivo real: **0
 * ocorrências**, então hoje o custo é zero. Que o risco é real, prova o campo e-mail —
 * `soumatestemunhadodeusvivente@gmail.com` traz "testemunha", que contém "test". **Se
 * alguém acrescentar palavra a esta lista, meça antes**: em português, palavra curta é
 * substring de palavra comum.
 */
const PALAVRAS_DE_MOCK = ['teste', 'test'];

/**
 * Converte UMA linha. Nunca lança: devolve `erro` (descarta) ou `avisos` (entra com o
 * dado cru), porque numa importação de 7 mil linhas uma exceção no meio é perda de
 * trabalho.
 *
 * As duas classes NÃO são graus da mesma coisa, e é o que decide onde mexer:
 *   • `erro`  — falta o que IDENTIFICA (inscrição, nome, cargo). Sem isso não há o que
 *               gravar, então a linha não entra. Inalterado em 30/07.
 *   • `aviso` — o valor de um campo secundário é impossível. Desde 2026-07-30 ele entra
 *               COMO VEIO e é citado no relatório; até 29/07 virava NULL.
 */
export function converterLinha(
  linha: LinhaPlanilha,
  mapeamento: Mapeamento,
  editalId: string,
  linhaPlanilha: number,
): LinhaConvertida {
  const val = (campo: string) => bruto(linha, mapeamento[campo]);
  const avisos: string[] = [];

  // Lido ANTES do `falha` de propósito: ele o carrega para dentro da linha que falha, e é
  // o que dá ao relatório como identificar uma linha que não tem `candidato`.
  const nInscricao = val('n_inscricao');
  const falha = (erro: string): LinhaConvertida =>
    ({ linhaPlanilha, nInscricao, candidato: null, erro, avisos });

  // ── O que identifica: falta → a linha não entra ────────────────────────────────
  if (nInscricao === null) return falha('Nº de inscrição vazio');
  if (nInscricao.length > 8) {
    return falha(`Nº de inscrição "${nInscricao}" tem ${nInscricao.length} caracteres (o limite é 8)`);
  }

  const nome = val('nome');
  if (nome === null) return falha('Nome vazio');

  // D9: célula de cargo vazia descarta a LINHA, como inscrição e nome. O cargo passou a
  // ser identidade, e uma linha sem ele não tem o que associar no passo Cargos — criar um
  // grupo "(em branco)" para o usuário apontar a um cargo seria decisão em massa sobre
  // linhas que ele não viu. Medido: 0 das 7.416 linhas do arquivo real caem aqui.
  const cargo = val('cargo');
  if (cargo === null) return falha('Cargo vazio');

  // ── O nome ENTRA sempre; estes dois avisos só pedem conferência na origem ──────
  //
  // Decisão do usuário, 2026-07-30. Diferente dos campos abaixo, aqui nada é convertido
  // nem normalizado — o nome já entrava cru. O aviso é o produto inteiro da regra: ele
  // transforma "ninguém nunca olhou" em uma linha do relatório.
  //
  // ⚠️ NÃO transforme nenhum destes dois em `erro`. Nome estranho continua sendo o nome
  // de um inscrito, e a lista incompleta é o único erro grave possível nesta tabela.
  const estranhos = [...new Set([...nome])].filter((ch) => !CARACTERE_ACEITO_NO_NOME.test(ch));
  if (estranhos.length > 0) {
    // Citar QUAIS caracteres é o que torna o aviso acionável: num relatório, '0' e 'O'
    // são indistinguíveis a olho — 'HUGO CESAR COELHO SALVAD0' traz um zero no fim.
    avisos.push(`Nome "${nome}" tem caractere fora do esperado (${estranhos.join(' ')}) — gravado como veio`);
  }

  // Medido: 10 das 7.416, incluindo 3 'TESTEPAULO' e um 'A'. Nome de uma palavra pode ser
  // legítimo (a origem às vezes traz só o primeiro), então é aviso e não erro — mas é o
  // que denuncia registro de teste que vazou para a lista de inscritos.
  if (nome.split(/\s+/).filter(Boolean).length === 1) {
    avisos.push(`Nome "${nome}" tem uma palavra só — gravado como veio`);
  }

  // Medido: 3 linhas, todas 'TESTEPAULO', e as 3 já caem na regra de uma palavra só — ou
  // seja, hoje esta regra não acrescenta nenhuma linha ao relatório. Ela existe pelo caso
  // que as OUTRAS DUAS não pegam: um 'TESTE DA SILVA' tem duas palavras e só letras.
  const mock = PALAVRAS_DE_MOCK.find((p) => nome.toLowerCase().includes(p));
  if (mock !== undefined) {
    avisos.push(`Nome "${nome}" contém "${mock}" — parece registro de teste, gravado como veio`);
  }

  // ── O que é secundário: impossível → ENTRA CRU + aviso ─────────────────────────
  //
  // DECISÃO DO USUÁRIO, 2026-07-30: "Candidato e dados entram. Candidato e dados são
  // citados no relatório." Até 29/07 estes cinco campos viravam NULL quando o valor era
  // impossível; o inscrito entrava, mas o que a origem afirmou sumia — e ninguém depois
  // conseguia saber o que a pessoa tinha digitado para poder corrigir na fonte.
  //
  // O que sustenta isto no banco: a migration 20260730100000 soltou as quatro CHECKs de
  // formato e trocou `raca` e `data_nascimento` para `text`. ⚠️ SEM ELA APLICADA, gravar
  // o valor cru derruba o BLOCO DE 500 INTEIRO, não a linha — o envio é em lote.
  //
  // A normalização continua acontecendo no caminho feliz: um CPF mascarado é gravado só
  // com os dígitos. O valor cru é para quando ele NÃO cabe na forma esperada.
  const cpfBruto = val('cpf');
  let cpf = cpfBruto;
  if (cpfBruto !== null) {
    const digitos = soDigitos(cpfBruto);
    if (digitos !== null && digitos.length === 11) {
      cpf = digitos;
    } else {
      // ⚠️ O aviso lê o BRUTO, não `soDigitos`. Antes de 30/07 um campo sem dígito nenhum
      // ('abc') saía calado: `soDigitos` devolvia null e o `!== null` da guarda antiga
      // não pegava. Era perda silenciosa dentro da regra que existia justamente para não
      // perder em silêncio.
      avisos.push(`CPF "${cpfBruto}" não tem 11 dígitos — gravado como veio`);
    }
  }

  let email = val('email');
  if (email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.toLowerCase())) {
    // Entra exatamente como veio: num e-mail que já é impossível, baixar a caixa seria
    // mais uma alteração em cima de um dado que o usuário vai ter de ler para corrigir.
    avisos.push(`E-mail "${email}" é inválido — gravado como veio`);
  } else if (email !== null) {
    email = email.toLowerCase();
  }

  const dataBruta = val('data_nascimento');
  let dataNascimento = parseDataBr(dataBruta);
  if (dataBruta !== null && dataNascimento === null) {
    avisos.push(`Data de nascimento "${dataBruta}" não foi reconhecida — gravada como veio`);
    dataNascimento = dataBruta;
  }

  // Medido: 3.089 preenchidas e o `parseHora` reconhece 3.087. As 2 que sobram são
  // '88888888' e 'Não sei'. ⚠️ Até 30/07 elas viravam NULL SEM AVISO NENHUM — este campo
  // era o único da classe secundária que não avisava, então a perda era invisível até no
  // relatório. A coluna virou `text` na migration 20260730110000 para comportar o cru.
  const horaBruta = val('hora_nascimento');
  let horaNascimento = parseHora(horaBruta);
  if (horaBruta !== null && horaNascimento === null) {
    avisos.push(`Hora de nascimento "${horaBruta}" não foi reconhecida — gravada como veio`);
    horaNascimento = horaBruta;
  }

  const cepBruto = val('cep');
  let cep = cepBruto;
  if (cepBruto !== null) {
    const digitos = soDigitos(cepBruto);
    if (digitos !== null && digitos.length === 8) {
      cep = digitos;
    } else {
      avisos.push(`CEP "${cepBruto}" não tem 8 dígitos — gravado como veio`);
    }
  }

  // TEXT, não number, desde 30/07: o código que a origem manda pode não ser código, e a
  // coluna passou a ser `text` para comportá-lo. O caminho feliz normaliza ('02' → '2').
  const racaBruta = val('raca');
  let raca = racaBruta;
  if (racaBruta !== null) {
    const digitos = soDigitos(racaBruta);
    const codigo = digitos === null ? null : Number(digitos);
    if (codigo !== null && RACAS_VALIDAS.includes(codigo)) {
      raca = String(codigo);
    } else {
      avisos.push(`Raça "${racaBruta}" não é um código conhecido — gravada como veio`);
    }
  }

  // varchar(2) no banco: corta em vez de estourar a carga. 'BR', 'UF' e '13' aparecem no
  // arquivo real como UF de identidade — não são estados, mas são o que a origem afirma.
  const recortarUf = (v: string | null) => (v === null ? null : v.slice(0, 2).toUpperCase());

  const candidato: CandidatoImportado = {
    edital_id: editalId,
    n_inscricao: nInscricao,
    cargo,
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
    hora_nascimento: horaNascimento,
    sexo: val('sexo'),
    raca,
    portador_deficiencia: parseBooleano(val('portador_deficiencia')),
    confirmado: parseBooleano(val('confirmado')),
    concurso_id_origem: val('concurso_id_origem'),
  };

  return { linhaPlanilha, nInscricao, candidato, erro: null, avisos };
}

// ── Cargos ───────────────────────────────────────────────────────────────────────────
//
// O cargo chega SUJO da origem. Medido no arquivo real (7.416 linhas): 9 cargos distintos,
// 7 deles com '¿' — um travessão escrito em cp1252 e lido como latin-1:
//
//     3.756  DOCENTE II                       195  ARTE
//       730  DOCENTE I ¿ EDUCAÇÃO FÍSICA      481  DOCENTE I ¿ HISTÓRIA   ...
//
// ⚠️ NADA AQUI TENTA LIMPAR O TEXTO, e a abstinência é o desenho. Três medições fecham as
// saídas fáceis: normalizar por caixa e espaço deixa os 9 distintos (não colapsa nenhum);
// trocar '¿' por '—' acertaria nestes 7 mas é palpite sobre o que a origem quis dizer; e
// 'ARTE' foge do padrão dos outros sete — é 'DOCENTE I — ARTE' escrito de outro jeito ou
// um cargo à parte? Nenhuma regra sabe. Quem sabe é o usuário, no passo Cargos.
// É a mesma armadilha do 'TIPOPROVA' logo acima: palpite que erra em silêncio é pior que
// palpite nenhum. Ver my_rules/estrutura/modulos/candidatos/cargos.md.

/** Um cargo distinto encontrado na planilha, com o que a tela de resolução precisa. */
export interface ResumoCargo {
  /** O texto CRU, como veio — é ele que o usuário reconhece ao olhar o arquivo. */
  textoOrigem: string;
  /** `lower(btrim(...))`. A MESMA normalização de `cargo_apelidos.texto_chave`. */
  textoChave: string;
  /** Quantas linhas importáveis trazem este cargo. */
  linhas: number;
  /** Até 3 nomes de inscritos, sem repetir — ver o porquê abaixo. */
  exemplos: string[];
}

/** Quantos exemplos por cargo. Três cabem na célula sem quebrar a tabela. */
const MAX_EXEMPLOS = 3;

/**
 * Agrupa os cargos distintos da planilha, para o usuário resolver um a um.
 *
 * OPERA SOBRE AS LINHAS JÁ CONVERTIDAS, não sobre a planilha crua, e isso dá dois
 * invariantes que os testes checam: linha descartada por erro não conta para cargo nenhum,
 * e a soma das contagens bate com o total de linhas importáveis. Contar sobre o arquivo cru
 * mostraria ao usuário um número que a importação não vai entregar.
 *
 * `exemplos` existe por causa do 'ARTE': o rótulo sozinho não diz se é o mesmo cargo escrito
 * diferente, e ver três inscritos daquele grupo é a informação barata que ajuda a decidir.
 *
 * Ordena por contagem DECRESCENTE — o de 3.756 linhas primeiro. O usuário resolve o que
 * pesa antes, e se desistir no meio já resolveu a maior parte do arquivo.
 *
 * ⚠️ CARGO VAZIO NÃO VIRA GRUPO. Se o campo não foi pareado, todos os candidatos têm
 * `cargo: null` e a lista sai VAZIA — em vez de um grupo "(em branco)" com 7.416 linhas.
 * A diferença importa: aquele grupo convidaria o usuário a apontar um cargo para milhares
 * de linhas que ele não viu, que é decisão em massa às cegas. O tratamento certo de célula
 * vazia é recusar a LINHA (decisão D9 do roadmap, que entra na subetapa 4c) — 0 linhas do
 * arquivo real são assim, então hoje isto não descarta ninguém.
 */
/**
 * A normalização do TEXTO do cargo — o espelho, em JS, do `lower(btrim(coalesce(...)))`
 * que o banco usa.
 *
 * ⚠️ Vive numa função só porque TRÊS lugares dependem de produzir exatamente o mesmo
 * resultado, e dois deles não são deste arquivo:
 *   - `cargosDaPlanilha` e `aplicarResolucoes`, aqui;
 *   - `cargo_apelidos.texto_chave`, a coluna gerada — se divergir, o pré-preenchimento
 *     do passo Cargos deixa de casar e o usuário remapeia tudo a cada importação;
 *   - o trigger `candidatos_recusa_reapontar_cargo` (migration 20260728110000), que
 *     compara este mesmo texto para distinguir REAPONTAMENTO de segundo cargo.
 * Mudar a regra aqui sem mudar lá afrouxa a guarda em silêncio.
 */
export function chaveDeCargo(cargo: string | null | undefined): string {
  return (cargo ?? '').trim().toLowerCase();
}

export function cargosDaPlanilha(linhas: LinhaConvertida[]): ResumoCargo[] {
  const porChave = new Map<string, ResumoCargo>();

  for (const linha of linhas) {
    const cargo = linha.candidato?.cargo;
    if (cargo === null || cargo === undefined) continue;

    const textoChave = chaveDeCargo(cargo);
    if (textoChave === '') continue;

    const atual = porChave.get(textoChave);
    if (atual) {
      atual.linhas += 1;
      // `includes` num array de no máximo 3 é mais barato que manter um Set por grupo.
      if (atual.exemplos.length < MAX_EXEMPLOS && !atual.exemplos.includes(linha.candidato!.nome)) {
        atual.exemplos.push(linha.candidato!.nome);
      }
    } else {
      // O texto exibido é o da PRIMEIRA ocorrência. Escolha deliberada: é determinístico e
      // é o que a pessoa encontra ao abrir a planilha e rolar até achar. Eleger "o mais
      // frequente" mudaria o rótulo conforme o arquivo, sem ganho.
      porChave.set(textoChave, {
        textoOrigem: cargo.trim(),
        textoChave,
        linhas: 1,
        exemplos: [linha.candidato!.nome],
      });
    }
  }

  return [...porChave.values()].sort((a, b) => b.linhas - a.linhas);
}

/**
 * Caracteres que denunciam texto mal decodificado na origem.
 *
 * `¿` é o em dash de cp1252 lido como latin-1; `�` é o U+FFFD que aparece quando a leitura
 * já desistiu. São os dois que ocorrem no arquivo real.
 */
const CARACTERES_SUJOS = /[¿�]/;

/**
 * Diz se o texto PARECE ter vindo quebrado — para a tela DESTACAR, nunca para corrigir.
 *
 * ⚠️ A distinção é o ponto todo desta função. Ela sinaliza para o olho humano e devolve a
 * decisão a quem pode tomá-la; consertar sozinha seria o palpite que a medição desaconselha
 * (ver o comentário no topo da seção). Acento legítimo NÃO é sujeira: 'CIÊNCIAS' é limpo.
 */
export function pareceSujo(texto: string | null): boolean {
  if (texto === null) return false;
  return CARACTERES_SUJOS.test(texto);
}

/**
 * O candidato depois do passo Cargos: o mesmo de antes, mais o cargo canônico escolhido.
 *
 * ⚠️ É um TIPO SEPARADO de propósito, e não um campo opcional em `CandidatoImportado`.
 * A separação faz o TypeScript recusar um lote não-resolvido onde se espera um resolvido —
 * higidez por assinatura, em vez de por disciplina de quem escreve a chamada. A partir da
 * etapa 5 do roadmap é `cargo_id` que compõe a identidade, e mandar o lote errado seria
 * gravar milhares de linhas com a chave incompleta.
 */
export interface CandidatoResolvido extends CandidatoImportado {
  /** `null` = o cargo daquela linha não foi resolvido — ver `aplicarResolucoes`. */
  cargo_id: string | null;
}

/** O que o passo Cargos produz: `textoChave` do cargo → `id` do cargo escolhido. */
export type ResolucaoCargos = Map<string, string>;

/**
 * Carimba em cada candidato o `cargo_id` que o usuário decidiu para o texto daquela linha.
 *
 * É o estágio 2 do pipeline da importação:
 *   converterLinha → **aplicarResolucoes** → deduplicar → blocos de 500
 *
 * ⚠️ A ORDEM É CONTRATO, não estilo — e é o que muda de lugar na etapa 5. Hoje a página
 * deduplica sobre o texto do cargo; quando a chave natural passar a ser `cargo_id`, dois
 * textos sujos diferentes apontando para o MESMO cargo viram a MESMA chave no banco, e um
 * dedup feito antes desta função os deixaria passar como distintos — o Postgres então
 * recusaria o bloco de 500 inteiro com "cannot affect row a second time". Deduplicar
 * DEPOIS de resolver é o que evita isso.
 *
 * Resolução faltante não lança e não é silenciada: a linha sai com `cargo_id: null`, que é
 * a marca. Quem decide o que fazer com ela é a tela — e, por decisão D4, ela BLOQUEIA a
 * importação enquanto houver cargo sem associar, porque seguir com nulo faria as inscrições
 * da mesma pessoa em cargos diferentes colidirem entre si.
 */
export function aplicarResolucoes(
  candidatos: CandidatoImportado[],
  resolucoes: ResolucaoCargos,
): CandidatoResolvido[] {
  return candidatos.map((c) => ({
    ...c,
    cargo_id: resolucoes.get(chaveDeCargo(c.cargo)) ?? null,
  }));
}

export interface SeparacaoPorPagamento {
  /** Inscrição paga: é o que segue para a importação. */
  pagantes: LinhaConvertida[];
  /** Inscrição NÃO paga: fica de fora, e o relatório tem de dizer quem foi. */
  naoPagantes: LinhaConvertida[];
}

/**
 * Separa quem pagou a inscrição de quem não pagou. **Só os pagantes são importados.**
 *
 * Decisão do usuário em 2026-08-01. A coluna que responde isso é a `CONFIRMADO` da
 * planilha, pareada no passo 2 e obrigatória desde a mesma data — ver o comentário em
 * `CAMPOS_CANDIDATO`, que explica o estrago de ela ficar sem parear.
 *
 * Medido no arquivo real (7.416 linhas de dado): **7.231 pagam e 185 não**. Só dois
 * valores na coluna, `'1'` e `'0'`, sem vazio — mas `parseBooleano` aceita bem mais que
 * isso, e é ele quem define o que conta como pago.
 *
 * 🔴 **RODA ANTES de `resolverLinhas`/`deduplicar`, e a ordem é CORREÇÃO, não estilo.**
 * `deduplicar` mantém a ÚLTIMA ocorrência de cada chave natural. Se o filtro viesse
 * depois, um não-pagante repetindo a chave de um pagante o DESLOCARIA no dedup e só então
 * seria descartado — e o pagante sumiria da importação sem aparecer em lugar nenhum. O
 * pipeline é:
 *
 *     converterLinha → separarPorPagamento → resolverLinhas → deduplicar → blocos de 500
 *
 * ⚠️ **Linha com `erro` não entra em NENHUM dos dois.** Ela já é contada em `comErro`, e
 * classificá-la também aqui faria o relatório acusar a mesma linha por dois motivos — a
 * pessoa procuraria dois problemas onde há um. Sem candidato não há `confirmado` que se
 * possa ler, então a pergunta nem chega a fazer sentido.
 */
export function separarPorPagamento(linhas: LinhaConvertida[]): SeparacaoPorPagamento {
  const pagantes: LinhaConvertida[] = [];
  const naoPagantes: LinhaConvertida[] = [];

  for (const linha of linhas) {
    if (linha.candidato === null) continue;
    if (linha.candidato.confirmado) pagantes.push(linha);
    else naoPagantes.push(linha);
  }

  return { pagantes, naoPagantes };
}

/** Uma linha da planilha já convertida E com o cargo resolvido. Ver `resolverLinhas`. */
export interface LinhaResolvida {
  linhaPlanilha: number;
  candidato: CandidatoResolvido;
}

/**
 * A ponte entre os estágios 1 e 3 do pipeline: resolve o cargo SEM perder o número da
 * linha da planilha, que o relatório de repetidas precisa.
 *
 * Linhas com erro (candidato null) caem aqui — elas não entram na importação e não têm
 * chave natural para deduplicar.
 */
export function resolverLinhas(
  linhas: LinhaConvertida[],
  resolucoes: ResolucaoCargos,
): LinhaResolvida[] {
  return linhas
    .filter((l): l is LinhaConvertida & { candidato: CandidatoImportado } => l.candidato !== null)
    .map((l) => ({
      linhaPlanilha: l.linhaPlanilha,
      candidato: {
        ...l.candidato,
        cargo_id: resolucoes.get(chaveDeCargo(l.candidato.cargo)) ?? null,
      },
    }));
}

/**
 * A chave natural da linha — precisa ser a MESMA do índice único
 * `candidatos_edital_inscricao_key` (migration 20260801193530), porque é ela que deduplica
 * o lote antes da gravação. Divergir do banco não dá erro aqui: dá erro lá, quando a RPC
 * insere, e a troca inteira é recusada.
 *
 * ⭐ Desde 2026-08-01 a identidade é só o **número de inscrição** (dentro do edital, que é
 * um só por importação e por isso não aparece aqui). Decisão do usuário. `cpf` e `cargo_id`
 * SAÍRAM da identidade, e a razão de a proposta funcionar foi medida no arquivo real: cada
 * inscrição tem número próprio, então a mesma pessoa em dois cargos já são dois números
 * (CPF 05261923727 nas inscrições 9 e 5208). O cargo nunca foi o que distinguia essas
 * linhas — ele só parecia ser.
 *
 * ⚠️ **Os `??` do CPF e do cargo saíram junto, e não devem voltar.** Eles espelhavam o
 * `NULLS NOT DISTINCT` do índice antigo, que existia porque as duas colunas são nullable.
 * `n_inscricao` é NOT NULL no banco, então não há nulo a normalizar. Reintroduzir um campo
 * nullable nesta chave sem reintroduzir o `NULLS NOT DISTINCT` no índice faz as linhas sem
 * valor se multiplicarem a cada reimportação.
 *
 * ⚠️ Ela deixou de exigir `CandidatoResolvido`, e isso é intencional: o cargo saiu da
 * chave, logo a chave não depende mais de o cargo ter sido resolvido. Quem continua
 * exigindo a resolução antes é `deduplicar`, por outro motivo — ver lá.
 */
export function chaveNatural(c: Pick<CandidatoResolvido, 'n_inscricao'>): string {
  return c.n_inscricao;
}

export interface Deduplicacao {
  candidatos: CandidatoResolvido[];
  /** Linhas descartadas por repetirem a chave de uma linha posterior do mesmo arquivo. */
  repetidas: { linhaPlanilha: number; chave: string }[];
}

/**
 * Tira do lote as chaves repetidas DENTRO DO PRÓPRIO ARQUIVO, mantendo a última ocorrência.
 *
 * ⚠️ Isto não é zelo, é obrigatório: o índice único `candidatos_edital_inscricao_key`
 * recusa a segunda linha de mesma chave, e como a gravação inteira roda dentro da RPC
 * `trocar_candidatos`, o erro aborta a transação — o DELETE volta atrás junto e a
 * importação não grava NADA. Sem esta passagem, uma única linha duplicada na planilha
 * derruba a importação inteira.
 *
 * ⚠️ **Não é mais "falha o bloco de 500".** Até 2026-07-30 a gravação era um upsert direto
 * em `candidatos`, e a recusa vinha como "ON CONFLICT DO UPDATE command cannot affect row a
 * second time", num bloco só. Hoje os blocos de 500 vão para `candidatos_importacao`, que
 * NÃO tem índice único na chave natural — eles passam. A recusa acontece depois, no INSERT
 * da RPC, e derruba a troca inteira. O mecanismo mudou; a necessidade do dedup, não.
 *
 * ELE RODA DEPOIS DA RESOLUÇÃO:
 *
 *     converterLinha → separarPorPagamento → resolverLinhas → deduplicar → blocos de 500
 *
 * ⚠️ **O motivo dessa ordem mudou em 2026-08-01, e o motivo antigo NÃO vale mais.** Até
 * então o cargo compunha a chave natural, e deduplicar antes de resolver deixava passar
 * duas grafias sujas do mesmo cargo como se fossem linhas distintas. Com a chave sendo só
 * `(edital_id, n_inscricao)`, deduplicar antes ou depois de resolver dá o MESMO resultado.
 * A ordem fica porque `deduplicar` devolve o que vai ser gravado, e a gravação precisa do
 * `cargo_id` preenchido — quem garante isso é o TIPO: `LinhaResolvida` só sai de
 * `resolverLinhas`.
 *
 * ⚠️ `repetidas` inclui repetição que NÃO se vê na planilha: duas linhas com o mesmo número
 * de inscrição são a mesma chave ainda que difiram em CPF, nome ou cargo. A tela precisa
 * dizer qual é a chave, senão a pessoa procura na planilha uma linha repetida que não está
 * lá. No arquivo real isso não ocorre — os 7.416 números são distintos.
 *
 * Mantém a ÚLTIMA porque, quando alguém corrige uma linha, o costume é reescrevê-la abaixo.
 */
export function deduplicar(linhas: LinhaResolvida[]): Deduplicacao {
  const porChave = new Map<string, { candidato: CandidatoResolvido; linhaPlanilha: number }>();
  const repetidas: { linhaPlanilha: number; chave: string }[] = [];

  for (const linha of linhas) {
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
  // ⚠️ Casa pelo NOME DO ÍNDICE, e é o que fez este ramo sobreviver à troca do mecanismo de
  // gravação em 30/07: o nome aparece tanto no erro do upsert antigo quanto no
  // 'duplicate key value violates unique constraint' do INSERT de hoje. Se o índice for
  // renomeado outra vez sem mexer aqui, o usuário volta a ver a mensagem crua do Postgres.
  if (m.includes('candidatos_edital_inscricao_key')) {
    return 'Há mais de uma linha com o mesmo nº de inscrição nesta planilha.';
  }
  // ⚠️ O trigger da etapa 5b (SQLSTATE 'RC001') NÃO tem ramo aqui, e é de propósito: a
  // mensagem dele já nomeia o cargo e o destino atual, então o `return mensagem` do fim
  // é exatamente o comportamento certo. Um ramo próprio só repetiria o fallback.
  //
  // E não tente casar pelo código: verificado pelo PostgREST em 2026-07-28, o 'RC001'
  // chega em `error.code`, NUNCA dentro de `error.message` — um `includes('rc001')` aqui
  // seria uma guarda que não pode disparar. Se algum dia esta função precisar do código,
  // ela tem de receber o objeto de erro, não a string.
  // ── As recusas da TROCA TOTAL (2026-07-30) ─────────────────────────────────────────
  // As três mensagens do banco já são específicas e em português, então o papel aqui é
  // só acrescentar o que fazer — o `return mensagem` do fim perderia essa metade.
  if (m.includes('nenhuma linha preparada')) {
    return 'Nada foi preparado para esta importação, então a lista atual do edital foi mantida. Tente importar de novo.';
  }
  if (m.includes('de outro edital')) {
    return 'O preparo desta importação tem linhas de outro edital. A lista foi mantida. Recomece a importação.';
  }
  if (m.includes('mas a importação declarou')) {
    return 'O envio chegou incompleto ao servidor, então a lista atual do edital foi MANTIDA — ninguém foi removido. Importe de novo.';
  }

  // ⚠️ Os ramos de chk_candidato_cpf_formato, _cep_, _email_ e _raca_valida foram
  // REMOVIDOS em 2026-07-30: as quatro CHECKs saíram do banco na migration
  // 20260730100000 (dado inválido passou a entrar cru), então eram guardas que não
  // podiam mais disparar. Guarda que não dispara é armadilha — ela faz o próximo leitor
  // acreditar que a regra ainda existe.
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

// ─────────────────────────────────────────────────────────────────────────────────────
// O relatório de problemas — a parte pura, compartilhada pelos DOIS exports
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Uma queixa do relatório, já atribuída a um campo.
 *
 * ⚠️ **As chaves viram CABEÇALHO de coluna no XLS** (`json_to_sheet` usa o nome da
 * propriedade), então renomear qualquer uma delas muda a planilha exportada. É o motivo de
 * a primeira ter acento e espaço.
 *
 * 🔵 **`Linha` saiu em 2026-08-01, substituída por `Nº de Inscrição`** (decisão do
 * usuário). O número da linha da planilha era um endereço dentro de um arquivo; o nº de
 * inscrição identifica a PESSOA, que é o que quem lê o relatório precisa procurar. A
 * ordenação continua sendo pela linha da planilha — ver `montarProblemasDoRelatorio`.
 */
export interface ProblemaDoRelatorio {
  /** Do candidato, não da planilha. `'—'` quando a própria inscrição é o que falta. */
  "Nº de Inscrição": string;
  Situação:
    | "Não importada"
    | "Importada com ressalva"
    | "Substituída por linha posterior"
    | "Não importada (inscrição não paga)";
  Campo: string;
  Detalhe: string;
}

/**
 * O título do bloco do PDF para um campo.
 *
 * 🔴 "Pagamento" NÃO é problema, e chamá-lo assim era erro de leitura do relatório: a
 * inscrição sem pagamento não tem defeito nenhum a corrigir — é o filtro fazendo o que foi
 * mandado. Mandar a pessoa "corrigir" 185 linhas legítimas é o oposto do que o bloco quer.
 *
 * ⚠️ Casa pelo nome do campo que `montarProblemasDoRelatorio` escreve em `Campo`. Mudar lá
 * sem mudar aqui devolve o título genérico, em silêncio.
 */
export function subtituloDoCampo(campo: string): string {
  if (campo === CAMPO_PAGAMENTO) return "Lista de inscrições sem pagamento registrado";
  return `Problemas encontrados no campo: ${campo}`;
}

/** O `Campo` das linhas descartadas pelo filtro de pagamento. Ver `subtituloDoCampo`. */
const CAMPO_PAGAMENTO = "Pagamento";

/**
 * De que campo fala uma mensagem de erro/aviso — por PREFIXO do texto.
 *
 * ⚠️ Isto é acoplado às mensagens que `converterLinha` escreve. Não há tipo que ligue os
 * dois: mexer no texto de um aviso lá joga a queixa no balde "Geral" aqui, em silêncio, e
 * nada quebra. Ao acrescentar aviso novo, acrescente o prefixo nesta lista no mesmo passe.
 *
 * ORDEM IMPORTA: "Nome" também prefixa "Nome da mãe", se um dia existir. Do mais
 * específico para o mais genérico, como em `PALAVRAS_DE_TESTE`.
 */
const PREFIXOS_POR_CAMPO: { prefixo: string; campo: string }[] = [
  { prefixo: "Nº de inscrição", campo: "Nº de Inscrição" },
  { prefixo: "Data de nascimento", campo: "Data de Nascimento" },
  { prefixo: "Hora de nascimento", campo: "Hora de Nascimento" },
  { prefixo: "Nome", campo: "Nome" },
  { prefixo: "Cargo", campo: "Cargo" },
  { prefixo: "CPF", campo: "CPF" },
  { prefixo: "E-mail", campo: "E-mail" },
  { prefixo: "CEP", campo: "CEP" },
  { prefixo: "Raça", campo: "Raça" },
];

/** Separa "CPF tem 10 dígitos" em `{ Campo: "CPF", Detalhe: "tem 10 dígitos" }`. */
export function classificarQueixa(mensagem: string): { Campo: string; Detalhe: string } {
  for (const { prefixo, campo } of PREFIXOS_POR_CAMPO) {
    if (mensagem.startsWith(prefixo)) {
      return { Campo: campo, Detalhe: mensagem.substring(prefixo.length).trim() };
    }
  }
  // ⚠️ Sem prefixo conhecido a queixa NÃO é descartada — vai para "Geral" com o texto
  // inteiro. Perder queixa em silêncio é exatamente o formato de erro que este repo teme.
  return { Campo: "Geral", Detalhe: mensagem };
}

/**
 * Monta a lista de problemas do relatório final, ordenada pela linha da planilha.
 *
 * ⚠️ **É a fonte ÚNICA dos dois exports** (a planilha XLS e o documento PDF). Ela viveu
 * duplicada verbatim dentro de `CandidatosImportar.tsx`, uma cópia em cada botão — e o
 * custo desse arranjo é que corrigir a classificação de um campo num export deixava o
 * outro mentindo, sem nada quebrar.
 *
 * As quatro origens são deliberadamente diferentes em natureza:
 *   - `comErro`      → a linha NÃO entrou, porque falta o que a identifica;
 *   - `comAviso`     → a linha entrou inteira, com dado a conferir na origem (uma linha
 *                      pode render VÁRIAS queixas, por isso `flatMap`);
 *   - `repetidas`    → a linha entrou e foi sobrescrita por uma posterior de mesma chave;
 *   - `naoPagantes`  → a linha NÃO entrou, porque a inscrição não está paga.
 *
 * ⚠️ `repetidas` inclui repetição que NÃO se vê como tal na planilha: desde 2026-08-01 a
 * chave é só o nº de inscrição, então duas linhas com o mesmo número colidem ainda que
 * difiram em CPF, nome ou cargo — ver `deduplicar`. Por isso o detalhe nomeia a chave: quem
 * for conferir na planilha precisa saber que não vai achar duas linhas idênticas lá.
 *
 * 🔴 `naoPagantes` tem `Situação` PRÓPRIA, e não se mistura com "Não importada". As duas
 * dizem que a linha ficou de fora, mas a providência é oposta: erro de dado se corrige na
 * planilha e se reimporta; inscrição não paga não é defeito nenhum — é o filtro fazendo o
 * que foi mandado fazer. Juntá-las mandaria a pessoa caçar erro onde não há.
 *
 * ⚠️ Sem esta origem o descarte seria MUDO: 185 pessoas do arquivo real sumiriam da
 * importação sem aparecer em lugar nenhum. É o formato de erro que este repo mais teme.
 */
export function montarProblemasDoRelatorio(
  comErro: LinhaConvertida[],
  comAviso: LinhaConvertida[],
  repetidas: Deduplicacao["repetidas"],
  naoPagantes: LinhaConvertida[] = [],
): ProblemaDoRelatorio[] {
  /** '—' e não '' : célula vazia num relatório impresso parece falha de geração. */
  const inscricao = (valor: string | null | undefined) => valor ?? "—";

  // ⚠️ A ordenação continua sendo pela LINHA DA PLANILHA, mesmo que ela não seja mais
  // exibida. Ordenar pelo nº de inscrição exigiria decidir entre ordem numérica e textual
  // ("10" < "9" em texto), e a linha já entrega a ordem de leitura do arquivo — que no
  // arquivo real coincide com a da inscrição, porque a coluna A é densa e sequencial.
  const ordenaveis: { ordem: number; problema: ProblemaDoRelatorio }[] = [
    ...naoPagantes.map((l) => ({
      ordem: l.linhaPlanilha,
      problema: {
        "Nº de Inscrição": inscricao(l.nInscricao),
        Situação: "Não importada (inscrição não paga)" as const,
        Campo: CAMPO_PAGAMENTO,
        // Nomeia a pessoa: o relatório vai para quem precisa conferir se a ausência dela é
        // legítima, e um número sozinho não diz de quem se trata.
        Detalhe: `${l.candidato?.nome ?? "—"} — inscrição não consta como paga`,
      },
    })),
    ...comErro.map((l) => ({
      ordem: l.linhaPlanilha,
      problema: {
        "Nº de Inscrição": inscricao(l.nInscricao),
        Situação: "Não importada" as const,
        ...classificarQueixa(l.erro ?? ""),
      },
    })),
    ...comAviso.flatMap((l) =>
      l.avisos.map((aviso) => ({
        ordem: l.linhaPlanilha,
        problema: {
          "Nº de Inscrição": inscricao(l.nInscricao),
          Situação: "Importada com ressalva" as const,
          ...classificarQueixa(aviso),
        },
      })),
    ),
    ...repetidas.map((r) => ({
      ordem: r.linhaPlanilha,
      problema: {
        // ⚠️ `chave` É o nº de inscrição desde 2026-08-01 — `chaveNatural()` devolve só
        // ele. Enquanto a chave era composta, aqui havia um `.replace("||", " / ")` para
        // desmontá-la; ele virou código morto e saiu.
        "Nº de Inscrição": inscricao(r.chave),
        Situação: "Substituída por linha posterior" as const,
        Campo: "Chave de Identificação",
        Detalhe: "Outra linha da planilha traz este mesmo nº de inscrição; valeu a última",
      },
    })),
  ];

  return ordenaveis.sort((a, b) => a.ordem - b.ordem).map((o) => o.problema);
}

/**
 * Agrupa as queixas por campo, para o PDF dar uma tabela por campo.
 *
 * O PDF é lido por quem vai CORRIGIR a planilha, e corrigir é trabalho por coluna: ver as
 * 40 queixas de CPF juntas é outro trabalho que ver 40 linhas misturadas. A planilha XLS
 * não agrupa de propósito — lá quem filtra é o Excel.
 */
export function agruparProblemasPorCampo(
  problemas: ProblemaDoRelatorio[],
): { campo: string; queixas: ProblemaDoRelatorio[] }[] {
  const porCampo = new Map<string, ProblemaDoRelatorio[]>();
  for (const problema of problemas) {
    const atual = porCampo.get(problema.Campo);
    if (atual) atual.push(problema);
    else porCampo.set(problema.Campo, [problema]);
  }

  return [...porCampo.entries()]
    .map(([campo, queixas]) => ({ campo, queixas }))
    .sort((a, b) => a.campo.localeCompare(b.campo, "pt-BR"));
}
