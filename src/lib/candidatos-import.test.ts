/**
 * Bateria da conversão planilha → candidato.
 *
 * O que esta bateria guarda, e por que cada caso está aqui: TODOS os casos de dado sujo
 * foram medidos no arquivo real de 7.416 inscritos (concurso 002-2026-SMA), não inventados.
 * Os números aparecem nos nomes dos testes de propósito — quando alguém "simplificar" uma
 * dessas conversões, o teste que quebrar diz quantas linhas reais aquilo estragaria.
 *
 * Ver `my_rules/estrutura/transversais/testes.md` (as 7 armadilhas) e o contrato do módulo
 * em `my_rules/estrutura/modulos/candidatos/00-modulo.md`.
 */
import { describe, it, expect } from "vitest";
import {
  CAMPOS_CANDIDATO,
  LinhaConvertida,
  agruparProblemasPorCampo,
  aplicarResolucoes,
  classificarQueixa,
  montarProblemasDoRelatorio,
  autoMapear,
  cargosDaPlanilha,
  chaveDeCargo,
  chaveNatural,
  converterLinha,
  deduplicar,
  letraDaColuna,
  mapeamentoCompleto,
  mensagemErroImportacao,
  pareceSujo,
  parseBooleano,
  parseDataBr,
  parseHora,
  resolverLinhas,
  rotulosDeColunas,
  soDigitos,
  type CandidatoImportado,
  type CandidatoResolvido,
  type Mapeamento,
  type ResolucaoCargos,
} from "./candidatos-import";

const EDITAL = "11111111-1111-1111-1111-111111111111";

/**
 * O cabeçalho do arquivo real, com o `NOME` repetido (colunas C e AC).
 *
 * ✅ Atualizado em 2026-07-31 lendo o próprio arquivo
 * (`docs/temp/todos inscritos concurso 002-2026-SMA cabeçalho.xls`): a coluna 0 se chama
 * `N_INSCRICAO`. Até 26/07 ela vinha sem título (`'   '`), e o fixture ficou parado nisso
 * por alguns dias — as asserções de `autoMapear` descreviam um arquivo que não existia
 * mais.
 *
 * 🔴 **A coluna 0 se CHAMA `N_INSCRICAO` mas é o CONTADOR DE LINHA do export.** Medido em
 * 2026-07-31: os valores são exatamente `1, 2, 3 … 7416`, sem um gap
 * (`col0.every((v, i) => v === i + 1)` → `true`). A **pessoa** é o `ID` (coluna 1), com
 * 7.020 distintos; os 382 `ID` repetidos têm todos o mesmo CPF e cargos distintos.
 *
 * ⚠️ **Não confunda cardinalidade com identidade.** Um comentário anterior aqui concluía
 * que a coluna 0 "é a inscrição" porque tem 7.416 valores distintos em 7.416 linhas — mas
 * um contador `1..N` também tem. A prova que separa os dois casos é a **sequencialidade**,
 * não a contagem. O caso decisivo: a pessoa de CPF `05261923727` aparece na linha 9 e na
 * linha 5208; se a coluna 0 fosse inscrição, seriam dois números de inscrição a 5.199
 * linhas de distância.
 *
 * 📌 **Quem escolhe a coluna é o USUÁRIO**, no passo 2 do assistente — `autoMapear` apenas
 * sugere. A sugestão da coluna 0 foi mantida por decisão do usuário (2026-07-31), e é por
 * isso que a conferência manual do passo 2 é parte do fluxo, não um remendo.
 */
const CABECALHO_REAL = [
  "N_INSCRICAO", "ID", "NOME", "CPF", "LOGRADOURO", "NUMERO", "COMPLEMENTO", "BAIRRO",
  "CIDADE", "UF", "CEP", "IDENTIDADE_NUMERO", "IDENTIDADE_ORGAO", "IDENTIDADE_EMISSAO",
  "IDENTIDADE_UF", "TELEFONE", "CELULAR", "EMAIL", "SEXO", "REGISTRO_ORGAO",
  "PORTADOR_DEFICIENCIA", "CONCURSO_ID", "DATA_NASCIMENTO", "CONFIRMADO", "SENHA", "RACA",
  "TIPOPROVA", "HORA_NASCIMENTO", "NOME",
];

/**
 * O cabeçalho **como era até 2026-07-26**, com a coluna 0 sem título.
 *
 * Existe para manter viva a cobertura de "coluna sem título", que o fixture atual deixou
 * de exercitar. Não é histórico decorativo: o `'   '` (espaços, não string vazia) é
 * exatamente o que o Excel entrega, e é o caso que faria o Select mostrar uma opção em
 * branco, impossível de escolher conscientemente.
 */
const CABECALHO_SEM_TITULO_NA_COLUNA_A = ["   ", "ID", "NOME", "CPF"];

/** Uma linha real do arquivo, copiada sem edição. */
const LINHA_REAL = [
  "1", "214274", "AGATHA LAMIM DE SOUZA", "22940161739", "RUA VEREADOR ACÁCIO DA ROCHA",
  "161", null, "AÇUDE", "VOLTA REDONDA", "RJ", "27276385", "22940161739", "DETRAN",
  "13/12/2023", "RJ", null, "(24) 9982-20527", "agathalamim86@gmail.com", "1", null, null,
  "242", "08/12/2005", "1", null, null, null, "12:43", "DOCENTE II",
];

/** Mapeamento mínimo por índice, para os testes que não passam pelo auto-mapeamento. */
function mapa(campos: Record<string, number>): Mapeamento {
  const m: Mapeamento = {};
  for (const campo of CAMPOS_CANDIDATO) m[campo.key] = campos[campo.key] ?? null;
  return m;
}

describe("letraDaColuna", () => {
  it("nomeia a coluna como o Excel nomeia", () => {
    expect(letraDaColuna(0)).toBe("A");
    expect(letraDaColuna(25)).toBe("Z");
    expect(letraDaColuna(26)).toBe("AA");
    // A segunda coluna NOME do arquivo real é a 28 → AC. É a letra que o usuário vê.
    expect(letraDaColuna(28)).toBe("AC");
  });
});

describe("rotulosDeColunas", () => {
  it("desambigua as DUAS colunas chamadas NOME pela letra", () => {
    const cols = rotulosDeColunas(CABECALHO_REAL);
    expect(cols[2].rotulo).toBe("NOME (coluna C)");
    expect(cols[28].rotulo).toBe("NOME (coluna AC)");
  });

  it("não polui o rótulo de cabeçalho que já é único", () => {
    expect(rotulosDeColunas(CABECALHO_REAL)[3].rotulo).toBe("CPF");
  });

  it("dá nome à coluna sem título em vez de deixá-la em branco na lista", () => {
    // Sem isto, o Select mostraria uma opção vazia, impossível de escolher
    // conscientemente. O fixture é o cabeçalho ANTIGO: desde 27/07 o arquivo real nomeia a
    // coluna A de `N_INSCRICAO`, então ele deixou de cobrir este caso — a regra continua
    // valendo para qualquer planilha, e é por isso que o fixture sobreviveu à atualização.
    expect(
      rotulosDeColunas(CABECALHO_SEM_TITULO_NA_COLUNA_A)[0].rotulo,
    ).toBe("(sem título — coluna A)");
  });

  it("⭐ o arquivo real NÃO tem mais coluna sem título — é o que o fixture novo afirma", () => {
    // Controle negativo do caso acima: se alguém reverter `CABECALHO_REAL` para o
    // cabeçalho antigo, este teste cai. Sem ele, o fixture poderia envelhecer de novo em
    // silêncio, que foi exatamente o que aconteceu entre 27/07 e 31/07.
    expect(rotulosDeColunas(CABECALHO_REAL)[0].rotulo).toBe("N_INSCRICAO");
  });
});

describe("autoMapear", () => {
  const mapeamento = autoMapear(rotulosDeColunas(CABECALHO_REAL));

  it("acerta os campos óbvios do arquivo real", () => {
    // ⚠️ Sugere a coluna 0 porque o cabeçalho dela é `N_INSCRICAO`. É SUGESTÃO: quem
    // decide é o usuário no passo 2. A coluna 0 é o contador do export (ver o cabeçalho
    // deste arquivo) — mantê-la como sugestão é decisão do usuário, de 2026-07-31.
    expect(mapeamento.n_inscricao).toBe(0);
    expect(mapeamento.cpf).toBe(3);
    expect(mapeamento.email).toBe(17);
    expect(mapeamento.data_nascimento).toBe(22);
    expect(mapeamento.cep).toBe(10);
  });

  it("dá a coluna C ao NOME e NÃO deixa o cargo roubá-la", () => {
    expect(mapeamento.nome).toBe(2);
    expect(mapeamento.cargo).not.toBe(2);
  });

  it("deixa o CARGO em branco neste arquivo — é o usuário que sabe onde ele está", () => {
    // O cargo do arquivo real mora na segunda coluna `NOME` (AC), coisa que nenhum
    // heurístico adivinha. A tentação era casar com `TIPOPROVA`, que existe e está 100%
    // vazia: o palpite pareceria certo e zeraria o cargo de todas as linhas, sem erro
    // nenhum. Ficar em branco obriga a escolha consciente.
    // ⚠️ Este comentário citava "396 inscritos sumiriam". Corrigido em 2026-07-28: aquilo
    // vinha de ler a inscrição na coluna `ID`. Zerar o cargo não perde linha — o problema
    // é a lista ficar sem o dado que organiza o concurso, e o erro ser silencioso.
    expect(mapeamento.cargo).toBeNull();
  });

  it("⭐ NÃO completa sozinho: o Cargo é obrigatório e não é adivinhável", () => {
    // Desde D4 (2026-07-27) são TRÊS obrigatórios — inscrição, nome e cargo. Os dois
    // primeiros o auto-pareamento acerta neste arquivo; o cargo, não, porque ele mora na
    // segunda coluna `NOME` e nenhum heurístico sabe disso. O resultado é deliberado:
    // a pessoa PRECISA escolher a coluna, e agora não consegue seguir sem escolher.
    expect(mapeamento.n_inscricao).toBe(0);
    expect(mapeamento.nome).toBe(2);
    expect(mapeamento.cargo).toBeNull();
    expect(mapeamentoCompleto(mapeamento)).toBe(false);

    // E com o cargo apontado à mão, fecha.
    expect(mapeamentoCompleto({ ...mapeamento, cargo: 28 })).toBe(true);
  });

  it("deixa em branco o que não reconhece, em vez de chutar", () => {
    const mapeado = autoMapear(rotulosDeColunas(["COLUNA ESQUISITA", "OUTRA"]));
    expect(mapeado.nome).toBeNull();
    expect(mapeamentoCompleto(mapeado)).toBe(false);
  });
});

describe("parseDataBr", () => {
  it("lê a data brasileira do arquivo", () => {
    expect(parseDataBr("08/12/2005")).toBe("2005-12-08");
    expect(parseDataBr("3/2/2010")).toBe("2010-02-03");
  });

  it("aceita ISO sem mexer", () => {
    expect(parseDataBr("1984-07-10")).toBe("1984-07-10");
  });

  it("NÃO rejeita ano absurdo — 15 linhas reais trazem 1193, 1780 e 2975", () => {
    // Controle importante: a tentação é 'validar' a faixa e descartar. Estas datas são o
    // que a pessoa digitou na inscrição dela; corrigir aqui seria inventar dado.
    expect(parseDataBr("27/08/1193")).toBe("1193-08-27");
    expect(parseDataBr("25/03/2975")).toBe("2975-03-25");
  });

  it("devolve null no que não é data", () => {
    expect(parseDataBr("sem data")).toBeNull();
    expect(parseDataBr("32/13/2000")).toBeNull();
    expect(parseDataBr(null)).toBeNull();
  });

  it("não confunde um ano solto com serial do Excel", () => {
    // '2005' numa célula de data é ano digitado, não o dia 2005 desde 1899.
    expect(parseDataBr("2005")).toBeNull();
  });
});

describe("parseHora", () => {
  it("lê os formatos do arquivo", () => {
    expect(parseHora("12:43")).toBe("12:43:00");
    expect(parseHora("21:00:00")).toBe("21:00:00");
  });

  it("aproveita as 365 células que vêm só com a hora", () => {
    // '15', '09', '7h00' são reais. Hora de nascimento é desempate legal em concurso —
    // jogar fora o que dá para entender perderia informação por preguiça de formato.
    expect(parseHora("15")).toBe("15:00:00");
    expect(parseHora("09")).toBe("09:00:00");
    expect(parseHora("7h00")).toBe("07:00:00");
  });

  it("recusa hora impossível", () => {
    expect(parseHora("25:00")).toBeNull();
    expect(parseHora("12:99")).toBeNull();
    expect(parseHora("qualquer coisa")).toBeNull();
  });
});

describe("soDigitos / parseBooleano", () => {
  it("extrai dígitos e devolve null quando não sobra nada", () => {
    expect(soDigitos("(24) 9982-20527")).toBe("249982205 27".replace(/\D/g, ""));
    expect(soDigitos("abc")).toBeNull();
    expect(soDigitos(null)).toBeNull();
  });

  it("trata célula vazia como false, porque a coluna é NOT NULL", () => {
    expect(parseBooleano(null)).toBe(false);
    expect(parseBooleano("1")).toBe(true);
    expect(parseBooleano("0")).toBe(false);
    expect(parseBooleano("sim")).toBe(true);
  });
});

describe("converterLinha — a linha real", () => {
  // O cargo é apontado à mão para a coluna AC, que é o que o usuário faz na tela de
  // pareamento — o auto-mapeamento deixa este campo em branco de propósito (ver acima).
  const mapeamento = { ...autoMapear(rotulosDeColunas(CABECALHO_REAL)), cargo: 28 };
  const r = converterLinha(LINHA_REAL, mapeamento, EDITAL, 2);

  it("converte sem erro nem aviso", () => {
    expect(r.erro).toBeNull();
    expect(r.avisos).toEqual([]);
  });

  it("preenche os campos com o valor certo", () => {
    expect(r.candidato).toMatchObject({
      edital_id: EDITAL,
      // `"1"` é o que a SUGESTÃO do auto-pareamento produz — a coluna 0, que é o contador
      // do export. Não é a inscrição da pessoa; é a posição da linha no arquivo.
      // Este caso existe para fixar o comportamento do caminho padrão. O caminho que o
      // usuário de fato usa está no teste seguinte, com o mapeamento corrigido à mão.
      n_inscricao: "1",
      nome: "AGATHA LAMIM DE SOUZA",
      cpf: "22940161739",
      email: "agathalamim86@gmail.com",
      data_nascimento: "2005-12-08",
      hora_nascimento: "12:43:00",
      cep: "27276385",
      uf: "RJ",
      cidade: "VOLTA REDONDA",
      confirmado: true,
      portador_deficiencia: false,
      concurso_id_origem: "242",
    });
  });

  it("⭐ com o mapeamento CORRIGIDO à mão, a inscrição vem do ID — não do contador", () => {
    // 📌 É ISTO que o usuário faz no passo 2, e é a razão de a conferência manual do
    // mapeamento fazer parte do fluxo: a coluna 0 do arquivo real se chama `N_INSCRICAO`
    // mas contém `1, 2, 3 … 7416` — a posição da linha. A identificação que a origem dá
    // à inscrição mora no `ID` (coluna 1).
    //
    // ⚠️ O `ID` se REPETE para quem concorre a mais de um cargo (7.020 distintos em 7.416
    // linhas), e é justamente por isso que `cargo_id` continua sendo parte da chave
    // natural — sem ele, as 396 inscrições excedentes colidiriam entre si.
    const corrigido = { ...autoMapear(rotulosDeColunas(CABECALHO_REAL)), n_inscricao: 1, cargo: 28 };
    const rc = converterLinha(LINHA_REAL, corrigido, EDITAL, 2);

    expect(rc.erro).toBeNull();
    expect(rc.candidato?.n_inscricao).toBe("214274");
    expect(rc.candidato?.nome).toBe("AGATHA LAMIM DE SOUZA");
  });

  it("pega o CARGO da coluna AC, não o nome da pessoa", () => {
    // O erro que este módulo existe para não cometer: ler a planilha como objeto faria
    // o segundo NOME sobrescrever o primeiro e todo mundo se chamaria 'DOCENTE II'.
    expect(r.candidato?.cargo).toBe("DOCENTE II");
    expect(r.candidato?.nome).toBe("AGATHA LAMIM DE SOUZA");
  });

  it("guarda o número da casa como texto", () => {
    // 'SN' e '118 FUNDOS' existem na coluna NUMERO; parseInt viraria NaN ou 118.
    expect(r.candidato?.numero).toBe("161");
  });
});

describe("converterLinha — erro descarta a linha", () => {
  const m = mapa({ n_inscricao: 0, nome: 1 });

  it("recusa sem nº de inscrição", () => {
    const r = converterLinha([null, "FULANO"], m, EDITAL, 5);
    expect(r.candidato).toBeNull();
    expect(r.erro).toMatch(/inscrição vazio/i);
  });

  it("recusa sem nome", () => {
    const r = converterLinha(["123", "   "], m, EDITAL, 5);
    expect(r.candidato).toBeNull();
    expect(r.erro).toMatch(/nome vazio/i);
  });

  it("recusa inscrição maior que os 8 caracteres da coluna", () => {
    // Sem isto o banco devolveria 'value too long' e derrubaria o BLOCO INTEIRO de 500,
    // em vez de uma linha. É a diferença entre perder 1 e perder 500.
    const r = converterLinha(["123456789", "FULANO"], m, EDITAL, 5);
    expect(r.candidato).toBeNull();
    expect(r.erro).toMatch(/8/);
  });
});

describe("converterLinha — aviso mantém o inscrito na lista", () => {
  // O cargo entra no mapeamento porque, desde D9, linha sem cargo é descartada — e o que
  // este bloco mede é justamente o oposto: campo secundário ruim NÃO descarta o inscrito.
  const m = mapa({
    n_inscricao: 0, nome: 1, cpf: 2, email: 3, data_nascimento: 4, cep: 5, raca: 6, cargo: 7,
  });

  /** Preenche o cargo (posição 7) sem obrigar cada caso a carregar sete `null`. */
  const comCargo = (linha: (string | null)[]) => {
    const l: (string | null)[] = [...linha];
    while (l.length < 7) l.push(null);
    l[7] = "DOCENTE II";
    return l;
  };

  it("⭐ os 2 CPFs impossíveis do arquivo entram COMO VIERAM, não somem", () => {
    // ' 8631309761' (10 dígitos) e '1O778817709' (letra O no lugar do zero). A identidade
    // do candidato é a INSCRIÇÃO — descartar o inscrito por causa do CPF deixaria a
    // lista de inscritos incompleta, que é o único erro grave possível nesta tabela.
    //
    // Desde 2026-07-30 o valor entra CRU em vez de virar NULL (decisão do usuário): sem
    // isso, ninguém depois conseguia saber o que a pessoa tinha digitado para corrigir na
    // origem. O espaço da frente some porque `bruto()` apara — é artefato de planilha.
    for (const [cpfRuim, gravado] of [
      [" 8631309761", "8631309761"],
      ["1O778817709", "1O778817709"],
    ]) {
      const r = converterLinha(comCargo(["214274", "FULANO", cpfRuim]), m, EDITAL, 5);
      expect(r.candidato).not.toBeNull();
      expect(r.candidato?.nome).toBe("FULANO");
      expect(r.candidato?.cpf).toBe(gravado);
      expect(r.avisos.join(" ")).toMatch(/CPF/i);
    }
  });

  it("um CPF sem dígito nenhum também é acusado — antes saía calado", () => {
    // ⚠️ REGRESSÃO REAL, corrigida em 30/07: a guarda antiga lia `soDigitos`, que devolve
    // null quando não sobra dígito. 'abc' então não entrava no `!== null` e o campo era
    // anulado SEM aviso — perda silenciosa dentro da regra criada para não perder calado.
    const r = converterLinha(comCargo(["214274", "FULANO", "abc"]), m, EDITAL, 5);
    expect(r.candidato?.cpf).toBe("abc");
    expect(r.avisos.join(" ")).toMatch(/CPF/i);
  });

  it("⭐ acusa o caractere estranho no nome, e diz QUAL é", () => {
    // As 10 linhas do arquivo real (medido em 30/07). Não são sujeira aleatória: são 4
    // classes de defeito de exportação, e o aviso cita o caractere porque num relatório
    // '0' e 'O' são indistinguíveis a olho.
    const casos: [string, string][] = [
      ["HUGO CESAR COELHO SALVAD0", "0"], // zero no lugar do O
      ["CLARA ALICE SANT¿ ANA MARQUES", "¿"], // mojibake cp1252, o mesmo do cargo
      ["EMANUELLE D\\'AVILA ARAÚJO", "\\"], // escape de apóstrofo vazado da exportação
      ["}DANIELE CRISTINE SANTANA", "}"],
    ];
    for (const [nomeRuim, esperado] of casos) {
      const r = converterLinha(comCargo(["214274", nomeRuim]), m, EDITAL, 5);
      expect(r.candidato?.nome).toBe(nomeRuim);
      expect(r.avisos.join(" ")).toContain(esperado);
      expect(r.avisos.join(" ")).toMatch(/[Nn]ome/);
    }
  });

  it("⚠️ CONTROLE NEGATIVO do nome: acento, ponto, apóstrofo e hífen NÃO são estranhos", () => {
    // O que impede a regra de virar ruído. 1.527 dos 7.416 nomes têm acento — se este
    // teste cair, a regra passou a acusar um quinto da lista e ninguém vai ler o relatório.
    // O PONTO está aqui por decisão do usuário em 30/07: abreviação é nome bem escrito.
    for (const nomeBom of [
      "SARAH BRANDÃO BARROS",
      "JÚLIA VERONICA CARDOSO DA SILVA",
      "MÁRCIA A. MALAQUIAS",
      "EMILIO FERNANDEZ P.F.DA SILVA ROCHA",
      "MARIA D'AVILA SANTA-CRUZ",
    ]) {
      const r = converterLinha(comCargo(["214274", nomeBom]), m, EDITAL, 5);
      expect(r.avisos).toEqual([]);
    }
  });

  it("acusa o nome de uma palavra só, sem descartar a linha", () => {
    // Medido: 10 das 7.416, incluindo 3 'TESTEPAULO' e um 'A'. É o que denuncia registro
    // de teste que vazou para a lista de inscritos — mas nome de uma palavra pode ser
    // legítimo, então é aviso.
    const r = converterLinha(comCargo(["214274", "TESTEPAULO"]), m, EDITAL, 5);
    expect(r.candidato?.nome).toBe("TESTEPAULO");
    expect(r.erro).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/uma palavra/i);

    // CONTROLE POSITIVO: dois nomes já bastam, e o espaço extra não conta como palavra.
    const dois = converterLinha(comCargo(["214274", "ANA  SOUZA"]), m, EDITAL, 5);
    expect(dois.avisos).toEqual([]);
  });

  it("acusa palavra de mock no nome, mesmo grudada em outra", () => {
    // A busca é por SUBSTRING de propósito: 'TESTEPAULO' é uma palavra só, e foi o caso
    // real (3 linhas). Busca por palavra inteira não o pegaria.
    const r = converterLinha(comCargo(["214274", "TESTEPAULO"]), m, EDITAL, 5);
    expect(r.erro).toBeNull();
    expect(r.candidato?.nome).toBe("TESTEPAULO");
    expect(r.avisos.join(" ")).toMatch(/parece registro de teste/i);

    // ⭐ O CASO QUE JUSTIFICA A REGRA EXISTIR. As outras duas regras de nome não pegam
    // este: 'TESTE DA SILVA' tem três palavras e só letras. Sem esta, passaria calado.
    const duasPalavras = converterLinha(comCargo(["214274", "TESTE DA SILVA"]), m, EDITAL, 5);
    expect(duasPalavras.avisos.join(" ")).toMatch(/parece registro de teste/i);

    // Case insensitive, e cita a palavra MAIS ESPECÍFICA das duas — a lista é ordenada
    // para isso. Se aparecer "test" aqui, alguém inverteu PALAVRAS_DE_MOCK.
    const minuscula = converterLinha(comCargo(["214274", "Fulano Teste Silva"]), m, EDITAL, 5);
    expect(minuscula.avisos.join(" ")).toContain('"teste"');
  });

  it("⚠️ CONTROLE NEGATIVO do mock: nome comum não pode ser acusado", () => {
    // ⚠️ O falso positivo CONHECIDO e aceito é 'TESTA', sobrenome de origem italiana —
    // medido: 0 no arquivo real. Este controle guarda o resto: a busca é por substring, e
    // em português palavra curta vira substring de palavra comum com facilidade. O campo
    // e-mail prova o risco ('soumatestemunhadodeusvivente@gmail.com' tem "testemunha").
    for (const nomeBom of [
      "AGATHA LAMIM DE SOUZA",
      "CELESTINO MODESTO BATISTA",
      "MARIA CELESTE PROTASIO",
    ]) {
      const r = converterLinha(comCargo(["214274", nomeBom]), m, EDITAL, 5);
      expect(r.avisos).toEqual([]);
    }
  });

  it("🔴 a hora irreconhecível entra crua — antes sumia SEM AVISO", () => {
    // As 2 do arquivo real. Este campo era o único da classe secundária que não avisava:
    // o valor virava NULL e nem o relatório denunciava. Coluna virou `text` na 20260730110000.
    const mHora = mapa({ n_inscricao: 0, nome: 1, cargo: 2, hora_nascimento: 3 });
    for (const ruim of ["88888888", "Não sei"]) {
      const r = converterLinha(["214274", "FULANO", "DOCENTE II", ruim], mHora, EDITAL, 5);
      expect(r.candidato?.hora_nascimento).toBe(ruim);
      expect(r.avisos.join(" ")).toMatch(/[Hh]ora/);
    }

    // CONTROLE POSITIVO: as 3.087 reconhecíveis continuam normalizadas para HH:MM:SS.
    const boa = converterLinha(["214274", "FULANO SOUZA", "DOCENTE II", "7h00"], mHora, EDITAL, 5);
    expect(boa.candidato?.hora_nascimento).toBe("07:00:00");
    expect(boa.avisos).toEqual([]);
  });

  it("normaliza o CPF mascarado — o caminho feliz não virou cru", () => {
    // CONTROLE POSITIVO: gravar cru é para o que NÃO cabe na forma esperada. Um CPF
    // válido e pontuado continua sendo normalizado, senão a chave natural se partiria.
    const r = converterLinha(comCargo(["214274", "FULANO SOUZA", "229.401.617-39"]), m, EDITAL, 5);
    expect(r.candidato?.cpf).toBe("22940161739");
    expect(r.avisos).toEqual([]);
  });

  it("os 27 e-mails inválidos entram COMO VIERAM", () => {
    for (const ruim of ["andi.gmail", "marcia2manoel@ gmail.com", "a@b.com / c@d.com"]) {
      const r = converterLinha(comCargo(["214274", "FULANO", "22940161739", ruim]), m, EDITAL, 5);
      expect(r.candidato?.email).toBe(ruim);
      expect(r.avisos.join(" ")).toMatch(/mail/i);
    }
  });

  it("normaliza o e-mail válido para minúsculas", () => {
    const r = converterLinha(comCargo(["1", "FULANO SOUZA", null, "Fulano@Gmail.COM"]), m, EDITAL, 5);
    expect(r.candidato?.email).toBe("fulano@gmail.com");
    expect(r.avisos).toEqual([]);
  });

  it("a data irreconhecível é gravada como veio, e a célula vazia segue calada", () => {
    // A coluna virou `text` em 30/07 justamente para isto: uma `date` não guarda
    // 'não sei'. Ver a migration 20260730100000.
    const comLixo = converterLinha(comCargo(["1", "FULANO SOUZA", null, null, "não sei"]), m, EDITAL, 5);
    expect(comLixo.candidato?.data_nascimento).toBe("não sei");
    expect(comLixo.avisos.join(" ")).toMatch(/nascimento/i);

    // CONTROLE POSITIVO 1: a data reconhecível continua saindo em ISO. Se este caísse, o
    // "grava como veio" teria vazado para o caminho feliz e a coluna viraria texto solto.
    const boa = converterLinha(comCargo(["1", "FULANO SOUZA", null, null, "31/12/1990"]), m, EDITAL, 5);
    expect(boa.candidato?.data_nascimento).toBe("1990-12-31");
    expect(boa.avisos).toEqual([]);

    // CONTROLE POSITIVO 2: célula vazia não é problema e não pode virar ruído no relatório.
    const semData = converterLinha(comCargo(["1", "FULANO SOUZA", null, null, null]), m, EDITAL, 5);
    expect(semData.candidato?.data_nascimento).toBeNull();
    expect(semData.avisos).toEqual([]);
  });

  it("o código de raça fora do dicionário é gravado como veio e a linha fica", () => {
    const r = converterLinha(comCargo(["1", "FULANO SOUZA", null, null, null, null, "7"]), m, EDITAL, 5);
    expect(r.candidato?.raca).toBe("7");
    expect(r.avisos.join(" ")).toMatch(/[Rr]aça/);

    // A coluna é `text` desde 30/07 e aceita o que não é número nenhum — era smallint, e
    // este caso simplesmente não tinha onde ser gravado.
    const texto = converterLinha(comCargo(["1", "FULANO SOUZA", null, null, null, null, "Z"]), m, EDITAL, 5);
    expect(texto.candidato?.raca).toBe("Z");
    expect(texto.avisos.join(" ")).toMatch(/[Rr]aça/);

    // CONTROLE POSITIVO: o código 2 (Branca) é o único que aparece no arquivo real, e o
    // caminho feliz normaliza para o código canônico em texto.
    const valido = converterLinha(comCargo(["1", "FULANO SOUZA", null, null, null, null, "2"]), m, EDITAL, 5);
    expect(valido.candidato?.raca).toBe("2");
    expect(valido.avisos).toEqual([]);
  });

  it("corta a UF em 2 caracteres em vez de estourar a coluna", () => {
    const mUf = mapa({ n_inscricao: 0, nome: 1, identidade_uf: 2, cargo: 3 });
    // 'BR', 'UF' e '13' aparecem de verdade como UF de identidade — não são estados, mas
    // são o que a origem afirma, e cabem nos 2 caracteres.
    expect(converterLinha(["1", "F", "br", "DOCENTE II"], mUf, EDITAL, 5).candidato?.identidade_uf).toBe("BR");
    expect(converterLinha(["1", "F", "RIO", "DOCENTE II"], mUf, EDITAL, 5).candidato?.identidade_uf).toBe("RI");
  });
});

/**
 * ⚠️ Desde a etapa 5 do roadmap-cargos, `deduplicar` roda DEPOIS de resolver o cargo e
 * opera sobre `cargo_id`, não sobre o texto. Estes testes passaram a montar o pipeline
 * inteiro — converter → resolver → deduplicar — porque é a ORDEM que eles protegem.
 * Deduplicar antes de resolver não é mais só "menos preciso": deixa passar duas grafias
 * do mesmo cargo e o Postgres recusa o bloco de 500 inteiro.
 */
const ID_DOCENTE_II = "aaaaaaaa-0000-0000-0000-000000000001";
const ID_INGLES = "aaaaaaaa-0000-0000-0000-000000000002";
const ID_HISTORIA = "aaaaaaaa-0000-0000-0000-000000000003";

describe("deduplicar", () => {
  const m = mapa({ n_inscricao: 0, nome: 1, cargo: 2 });
  /** Monta os três estágios na ordem do contrato. */
  const pipeline = (linhas: string[][], resolucoes: ResolucaoCargos) =>
    deduplicar(
      resolverLinhas(
        linhas.map((l, i) => converterLinha(l, m, EDITAL, i + 2)),
        resolucoes,
      ),
    );

  it("mantém a MESMA pessoa em cargos diferentes", () => {
    // ⚠️ O NOME DESTE TESTE MUDOU EM 2026-07-28, e o dado dele é HIPOTÉTICO de propósito.
    // Ele se chamava "a MESMA inscrição em cargos diferentes — 382 casos reais", o que
    // vinha de ler a inscrição na coluna `ID` (que é a PESSOA). No arquivo real a mesma
    // pessoa em 3 cargos tem TRÊS números de inscrição diferentes, então este cenário —
    // inscrição repetida entre cargos — não ocorre lá.
    // O teste FICA porque o comportamento que ele fixa é o que importa e não depende do
    // arquivo: cargo_id distinto ⇒ linhas distintas. Se um edital futuro repetir numeração
    // entre cargos, é ele que impede a perda.
    // ⚠️ É também o cenário que a condição LARGA do trigger da etapa 5b bloquearia — ver
    // a discussão em estrutura/modulos/candidatos/cargos.md antes de alargá-la.
    const { candidatos, repetidas } = pipeline(
      [
        ["213946", "CASSIA ANDREA", "DOCENTE II"],
        ["213946", "CASSIA ANDREA", "DOCENTE I - LÍNGUA INGLESA"],
        ["213946", "CASSIA ANDREA", "DOCENTE I - HISTÓRIA"],
      ],
      new Map([
        ["docente ii", ID_DOCENTE_II],
        ["docente i - língua inglesa", ID_INGLES],
        ["docente i - história", ID_HISTORIA],
      ]),
    );
    expect(candidatos).toHaveLength(3);
    expect(repetidas).toHaveLength(0);
  });

  it("tira a repetição de verdade, mantendo a ÚLTIMA ocorrência", () => {
    // Obrigatório, não zelo: o Postgres recusa o upsert inteiro com 'ON CONFLICT DO
    // UPDATE command cannot affect row a second time' se a chave repetir no mesmo lote.
    // Sem esta passagem, uma linha duplicada faria o bloco de 500 não gravar NADA.
    const { candidatos, repetidas } = pipeline(
      [
        ["214274", "NOME ANTIGO", "DOCENTE II"],
        ["214274", "NOME CORRIGIDO", "DOCENTE II"],
      ],
      new Map([["docente ii", ID_DOCENTE_II]]),
    );
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].nome).toBe("NOME CORRIGIDO");
    expect(repetidas).toEqual([{ linhaPlanilha: 2, chave: `||${ID_DOCENTE_II}||214274` }]);
  });

  it("⭐ funde DUAS GRAFIAS apontadas ao mesmo cargo — o caso que a ordem antiga deixava passar", () => {
    // É a razão de o dedup ter mudado de lugar na etapa 5. `DOCENTE I ¿ HISTÓRIA` e
    // `DOCENTE I — HISTÓRIA` são textos DIFERENTES, então o dedup antigo (sobre o texto)
    // mandaria as duas linhas ao banco como distintas. Com `cargo_id` na chave elas são a
    // MESMA linha lá — e o Postgres recusaria o bloco de 500 inteiro com "cannot affect
    // row a second time". Aqui elas têm de virar UMA, e a repetida tem de ser relatada.
    const { candidatos, repetidas } = pipeline(
      [
        ["213946", "CASSIA ANDREA", "DOCENTE I ¿ HISTÓRIA"],
        ["213946", "CASSIA ANDREA", "DOCENTE I — HISTÓRIA"],
      ],
      new Map([
        ["docente i ¿ história", ID_HISTORIA],
        ["docente i — história", ID_HISTORIA],
      ]),
    );
    expect(candidatos).toHaveLength(1);
    expect(repetidas).toHaveLength(1);
    expect(candidatos[0].cargo_id).toBe(ID_HISTORIA);
    // ⚠️ O texto CRU preservado é o da ÚLTIMA linha (D2, procedência) — o cargo_id é que
    // unifica, e o texto continua contando de onde a linha veio.
    expect(candidatos[0].cargo).toBe("DOCENTE I — HISTÓRIA");
  });

  it("trata caixa e espaço no cargo como o mesmo cargo, igual ao banco", () => {
    // A normalização vive em `chaveDeCargo`, e é ela que faz as duas grafias caírem na
    // MESMA entrada do mapa de resoluções — e portanto no mesmo cargo_id.
    const { candidatos } = pipeline(
      [
        ["214274", "FULANO", "DOCENTE II"],
        ["214274", "FULANO", " docente ii "],
      ],
      new Map([["docente ii", ID_DOCENTE_II]]),
    );
    expect(candidatos).toHaveLength(1);
  });

  it("não leva para o banco a linha que já foi descartada por erro", () => {
    const { candidatos } = pipeline([["", "SEM INSCRIÇÃO", "X"]], new Map());
    expect(candidatos).toHaveLength(0);
  });

  it("⚠️ cargo NÃO resolvido vira UM valor só, e não infinitos distintos", () => {
    // D4 impede que isto chegue ao banco (o passo Cargos não libera). Mas se chegasse, o
    // `NULLS NOT DISTINCT` do índice trataria os nulos como iguais — a chave em JS precisa
    // concordar, senão o lote passa no dedup e o banco recusa o bloco inteiro.
    const { candidatos, repetidas } = pipeline(
      [
        ["214274", "FULANO", "DOCENTE II"],
        ["214274", "FULANO", "DOCENTE II"],
      ],
      new Map(),
    );
    expect(candidatos).toHaveLength(1);
    expect(repetidas).toHaveLength(1);
    expect(candidatos[0].cargo_id).toBeNull();
  });

  describe("com o CPF dentro da chave (2026-07-27)", () => {
    const mCpf = mapa({ n_inscricao: 0, nome: 1, cargo: 2, cpf: 3 });
    const pipelineCpf = (linhas: string[][]) =>
      deduplicar(
        resolverLinhas(
          linhas.map((l, i) => converterLinha(l, mCpf, EDITAL, i + 2)),
          new Map([["docente ii", ID_DOCENTE_II]]),
        ),
      );

    it("⚠️ CPF diferente separa o que antes era a MESMA linha — o afrouxamento aceito", () => {
      // Consequência direta de somar o CPF à chave: mesma inscrição + mesmo cargo com
      // CPFs diferentes deixam de colidir. Não ocorre no arquivo medido (o quarteto e o
      // par contam 7.416 iguais), mas passa a ser possível — e é também o motivo de
      // corrigir um CPF na planilha criar registro novo em vez de atualizar o antigo.
      const { candidatos, repetidas } = pipelineCpf([
        ["214274", "FULANO", "DOCENTE II", "22940161739"],
        ["214274", "FULANO", "DOCENTE II", "14781065732"],
      ]);
      expect(candidatos).toHaveLength(2);
      expect(repetidas).toHaveLength(0);
    });

    it("o mesmo CPF, cargo e inscrição continuam sendo uma linha só", () => {
      const { candidatos } = pipelineCpf([
        ["214274", "NOME ANTIGO", "DOCENTE II", "22940161739"],
        ["214274", "NOME CORRIGIDO", "DOCENTE II", "229.401.617-39"],
      ]);
      // O segundo CPF vem pontuado: `soDigitos` normaliza antes de a chave se formar.
      expect(candidatos).toHaveLength(1);
      expect(candidatos[0].nome).toBe("NOME CORRIGIDO");
    });

    it("🔴 dois CPFs impossíveis DIFERENTES são duas linhas — antes viravam uma", () => {
      // ⚠️ ESTE TESTE AFIRMAVA O CONTRÁRIO ATÉ 2026-07-29, e o que ele guardava era um
      // DEFEITO. As 2 linhas do arquivo real ('8631309761' com 10 dígitos, '1O778817709'
      // com a letra O) são CPFs distintos; com os dois virando NULL, a chave natural ficava
      // idêntica e o dedup FUNDIA os dois inscritos num só — um deles sumia da lista, que é
      // exatamente o "único erro grave possível nesta tabela" que a regra de aviso existe
      // para evitar. Gravar o valor cru desfaz a fusão.
      const { candidatos, repetidas } = pipelineCpf([
        ["214274", "FULANO", "DOCENTE II", "8631309761"],
        ["214274", "FULANO", "DOCENTE II", "1O778817709"],
      ]);
      expect(candidatos).toHaveLength(2);
      expect(repetidas).toHaveLength(0);
      expect(candidatos.map((c) => c.cpf).sort()).toEqual(["1O778817709", "8631309761"]);
    });

    it("⚠️ o CPF VAZIO continua colapsando — é o que o NULLS NOT DISTINCT guarda", () => {
      // A razão de o índice ser NULLS NOT DISTINCT não caiu com a mudança de 30/07, só
      // mudou de dono: célula VAZIA continua virando NULL, e no padrão do Postgres dois
      // NULL são distintos — sem isso, estas linhas se reinseririam a cada reimportação.
      // Vazio ≠ impossível: um não tem dado, o outro tem dado errado.
      const { candidatos, repetidas } = pipelineCpf([
        ["214274", "FULANO", "DOCENTE II", ""],
        ["214274", "FULANO", "DOCENTE II", null],
      ]);
      expect(candidatos).toHaveLength(1);
      expect(repetidas).toHaveLength(1);
      expect(candidatos[0].cpf).toBeNull();
    });
  });
});

describe("chaveNatural", () => {
  it("⭐ usa o cargo_id, e NÃO o texto — é a etapa 5 inteira", () => {
    // O ganho do tema: o texto do cargo saiu da identidade. Renomear o cargo passou a ser
    // um UPDATE numa linha de `cargos`, em vez de criar 481 registros novos.
    const base = { n_inscricao: "214274", cpf: "22940161739" } as CandidatoResolvido;
    expect(chaveNatural({ ...base, cargo: " Docente II ", cargo_id: ID_DOCENTE_II })).toBe(
      `22940161739||${ID_DOCENTE_II}||214274`,
    );
    // O MESMO cargo_id com o texto cru diferente é a MESMA chave. Se este expect cair, o
    // texto voltou para a identidade e renomear cargo volta a duplicar candidato.
    expect(chaveNatural({ ...base, cargo: "DOCENTE I ¿ HISTÓRIA", cargo_id: ID_HISTORIA })).toBe(
      chaveNatural({ ...base, cargo: "DOCENTE I — HISTÓRIA", cargo_id: ID_HISTORIA }),
    );
  });

  it("⭐ trata 'sem CPF' e 'sem cargo' como UM valor, espelhando o NULLS NOT DISTINCT", () => {
    // No padrão do Postgres dois NULLs são DISTINTOS, e as 2 linhas do arquivo real com
    // CPF impossível se inseririam de novo a cada reimportação. O índice usa NULLS NOT
    // DISTINCT justamente para evitar isso, e aqui a chave precisa concordar com ele.
    // Desde a etapa 5 vale para os DOIS campos nulos, porque cargo_id também é nullable.
    const base = { n_inscricao: "214274", cargo: "DOCENTE II" } as CandidatoResolvido;
    expect(chaveNatural({ ...base, cpf: null, cargo_id: ID_DOCENTE_II })).toBe(
      `||${ID_DOCENTE_II}||214274`,
    );
    expect(chaveNatural({ ...base, cpf: null, cargo_id: null })).toBe("||||214274");
  });
});

describe("chaveDeCargo", () => {
  it("⚠️ espelha o lower(btrim(coalesce(...))) que o banco usa em TRÊS lugares", () => {
    // `cargo_apelidos.texto_chave` (coluna gerada) e o trigger
    // `candidatos_recusa_reapontar_cargo` dependem desta mesma normalização. Divergir aqui
    // faz o pré-preenchimento parar de casar E afrouxa a guarda do reapontamento.
    expect(chaveDeCargo(" Docente II ")).toBe("docente ii");
    expect(chaveDeCargo(null)).toBe("");
    expect(chaveDeCargo(undefined)).toBe("");
    // NÃO mexe em acento nem em caractere sujo: a limpeza foi medida e descartada.
    expect(chaveDeCargo("DOCENTE I ¿ CIÊNCIAS")).toBe("docente i ¿ ciências");
  });
});

describe("mensagemErroImportacao", () => {
  it("traduz as recusas do banco para o que corrigir na planilha", () => {
    // Regra 4 de invariantes.md: barreira que devolve erro cru transfere o problema.
    //
    // ⚠️ Os ramos de chk_candidato_cpf_formato, _cep_, _email_ e _raca_valida SAÍRAM em
    // 2026-07-30: as quatro CHECKs foram removidas do banco (dado inválido passou a
    // entrar cru), então eram guardas que não podiam mais disparar. Não os ressuscite
    // sem antes conferir que a CHECK voltou.
    expect(mensagemErroImportacao('violates check constraint "chk_candidato_nome_preenchido"')).toMatch(
      /[Nn]ome/,
    );
    // ⚠️ O nome do índice mudou na etapa 5 (`..._cargo_id_...`). Se alguém reverter o
    // índice sem reverter isto, o usuário volta a ver 'duplicate key value violates' cru.
    expect(
      mensagemErroImportacao('duplicate key value violates "candidatos_cpf_cargo_id_inscricao_key"'),
    ).toMatch(/repetid/i);
    expect(mensagemErroImportacao("value too long for type character varying(8)")).toMatch(/8/);
  });

  it("⭐ as três recusas da TROCA TOTAL dizem que a lista foi MANTIDA", () => {
    // O que o usuário precisa saber ao ver uma recusa não é o código: é que ninguém foi
    // removido. Sem isso, ele assume o pior e vai conferir a lista à mão.
    expect(
      mensagemErroImportacao("Nenhuma linha preparada para esta importação."),
    ).toMatch(/mantida/i);
    expect(
      mensagemErroImportacao("O preparo desta importação tem 3 linha(s) de outro edital."),
    ).toMatch(/mantida/i);
    expect(
      mensagemErroImportacao("O preparo tem 6000 linha(s), mas a importação declarou 7416."),
    ).toMatch(/MANTIDA/);
  });

  it("⭐ passa adiante INTEIRA a mensagem do trigger de reapontamento (etapa 5b)", () => {
    // A mensagem do banco já nomeia o cargo e o destino atual — é exatamente o que o
    // usuário precisa para decidir. Trocá-la por um texto genérico tiraria a informação
    // útil, e descartar a mensagem do banco já foi corrigido duas vezes neste repo.
    //
    // ⚠️ Ela passa pelo FALLBACK, sem ramo próprio — este teste existe para que, se
    // alguém acrescentar um ramo largo antes do fim (um `includes('violates')`, por
    // exemplo), a regressão apareça aqui. O texto é o que o PostgREST devolveu de
    // verdade em 2026-07-28, copiado da verificação, e não uma aproximação.
    const doBanco =
      'O cargo "ARTE" já foi importado neste edital associado a "ARTE (CORRIGIDO)". ' +
      "Mudar a associação criaria inscritos duplicados e deixaria os antigos órfãos.";
    expect(mensagemErroImportacao(doBanco)).toBe(doBanco);
  });

  it("explica o bloqueio de permissão em vez de repetir 'RLS'", () => {
    expect(mensagemErroImportacao("new row violates row-level security policy")).toMatch(
      /administrador/i,
    );
  });

  it("devolve a mensagem original quando não conhece o erro", () => {
    expect(mensagemErroImportacao("erro esquisito")).toBe("erro esquisito");
  });
});

// ── Cargos (etapa 2 do roadmap-cargos.yaml) ──────────────────────────────────────────

/** Os 9 cargos do arquivo real, com a contagem medida. 7 dos 9 trazem o '¿'. */
const CARGOS_REAIS: [string, number][] = [
  ["DOCENTE II", 3756],
  ["DOCENTE I ¿ EDUCAÇÃO FÍSICA", 730],
  ["DOCENTE I ¿ MATEMÁTICA", 650],
  ["DOCENTE I ¿ LÍNGUA PORTUGUESA", 639],
  ["DOCENTE I ¿ HISTÓRIA", 481],
  ["DOCENTE I ¿ CIÊNCIAS", 386],
  ["DOCENTE I ¿ GEOGRAFIA", 331],
  ["DOCENTE I ¿ LÍNGUA INGLESA", 248],
  ["ARTE", 195],
];

describe("cargosDaPlanilha", () => {
  const m = mapa({ n_inscricao: 0, nome: 1, cargo: 2 });
  const converter = (linhas: (string | null)[][]) =>
    linhas.map((l, i) => converterLinha(l, m, EDITAL, i + 2));

  it("agrupa por texto normalizado: caixa e espaço são o MESMO cargo", () => {
    // Precisa casar com o `lower(btrim(...))` de cargo_apelidos.texto_chave. Se divergir,
    // o pré-preenchimento da próxima importação erra o alvo.
    const cargos = cargosDaPlanilha(
      converter([
        ["1", "A", "DOCENTE II"],
        ["2", "B", "  docente ii  "],
        ["3", "C", "Docente II"],
      ]),
    );
    expect(cargos).toHaveLength(1);
    expect(cargos[0].textoChave).toBe("docente ii");
    expect(cargos[0].linhas).toBe(3);
  });

  it("mostra o texto da PRIMEIRA ocorrência, não o normalizado", () => {
    // O usuário precisa reconhecer o que está na planilha dele; 'docente ii' minúsculo
    // não é o que ele vê no Excel.
    const cargos = cargosDaPlanilha(
      converter([
        ["1", "A", "DOCENTE II"],
        ["2", "B", "docente ii"],
      ]),
    );
    expect(cargos[0].textoOrigem).toBe("DOCENTE II");
  });

  it("ordena por contagem DECRESCENTE — o que pesa mais vem primeiro", () => {
    const cargos = cargosDaPlanilha(
      converter([
        ["1", "A", "ARTE"],
        ["2", "B", "DOCENTE II"],
        ["3", "C", "DOCENTE II"],
        ["4", "D", "DOCENTE II"],
      ]),
    );
    expect(cargos.map((c) => c.textoOrigem)).toEqual(["DOCENTE II", "ARTE"]);
  });

  it("⭐ a SOMA das contagens bate com o total de linhas importáveis", () => {
    // O invariante que impede a tela de prometer um número que a importação não entrega.
    const linhas = converter([
      ["1", "A", "DOCENTE II"],
      ["2", "B", "ARTE"],
      ["", "SEM INSCRIÇÃO", "DOCENTE II"],
      ["4", "D", "ARTE"],
    ]);
    const importaveis = linhas.filter((l) => l.candidato !== null).length;
    const soma = cargosDaPlanilha(linhas).reduce((s, c) => s + c.linhas, 0);
    expect(importaveis).toBe(3);
    expect(soma).toBe(importaveis);
  });

  it("linha descartada por erro não conta para cargo nenhum", () => {
    const cargos = cargosDaPlanilha(
      converter([
        ["1", "A", "DOCENTE II"],
        ["", "SEM INSCRIÇÃO", "DOCENTE II"],
      ]),
    );
    expect(cargos[0].linhas).toBe(1);
  });

  it("traz até 3 exemplos de inscritos, sem repetir nome", () => {
    // É o que ajuda a decidir 'ARTE': o rótulo sozinho não diz se é o mesmo cargo.
    const cargos = cargosDaPlanilha(
      converter([
        ["1", "AGATHA", "ARTE"],
        ["2", "SARAH", "ARTE"],
        ["3", "SARAH", "ARTE"],
        ["4", "FERNANDA", "ARTE"],
        ["5", "MARCIA", "ARTE"],
      ]),
    );
    expect(cargos[0].exemplos).toEqual(["AGATHA", "SARAH", "FERNANDA"]);
    expect(cargos[0].linhas).toBe(5);
  });

  it("⭐ cargo NÃO pareado → lista VAZIA, e não um grupo '(em branco)'", () => {
    // Um grupo em branco convidaria o usuário a apontar um cargo para milhares de linhas
    // que ele não viu — decisão em massa às cegas.
    //
    // ⚠️ Desde D9 (2026-07-27) as linhas sem cargo nem chegam a virar candidato: a linha
    // é DESCARTADA, como acontece com inscrição e nome. As duas defesas coexistem de
    // propósito — esta função continua tendo de devolver lista vazia mesmo que a de cima
    // mude, porque é ela que alimenta a tela de resolução.
    const semCargo = mapa({ n_inscricao: 0, nome: 1 });
    const linhas = [
      ["1", "AGATHA", "DOCENTE II"],
      ["2", "SARAH", "ARTE"],
    ].map((l, i) => converterLinha(l, semCargo, EDITAL, i + 2));

    expect(linhas.every((l) => l.erro === "Cargo vazio")).toBe(true);
    expect(cargosDaPlanilha(linhas)).toEqual([]);
  });

  it("⭐ (D9) célula de cargo vazia DESCARTA a linha, como inscrição e nome", () => {
    // 0 das 7.416 linhas do arquivo real caem aqui — a regra é preventiva. O cargo virou
    // identidade, e uma linha sem ele não tem o que associar no passo Cargos.
    const comCargo = mapa({ n_inscricao: 0, nome: 1, cargo: 2 });
    const r = converterLinha(["214274", "AGATHA", "   "], comCargo, EDITAL, 5);
    expect(r.candidato).toBeNull();
    expect(r.erro).toBe("Cargo vazio");
  });

  it("célula de cargo vazia também não vira grupo", () => {
    const cargos = cargosDaPlanilha(
      converter([
        ["1", "A", "DOCENTE II"],
        ["2", "B", "   "],
        ["3", "C", null],
      ]),
    );
    expect(cargos).toHaveLength(1);
    expect(cargos[0].linhas).toBe(1);
  });

  it("planilha sem linha nenhuma não quebra", () => {
    expect(cargosDaPlanilha([])).toEqual([]);
  });

  it("⭐ os 9 cargos do arquivo real, como regressão da medição", () => {
    // 9 distintos em 7.416 linhas — é este número que torna a tela uma tabela simples,
    // sem paginação nem busca. Se virar centenas, o desenho do passo precisa mudar.
    const linhas = CARGOS_REAIS.flatMap(([cargo, n], iCargo) =>
      Array.from({ length: Math.min(n, 5) }, (_, i) =>
        converterLinha([`${iCargo}${i}`, `INSCRITO ${iCargo}${i}`, cargo], m, EDITAL, i + 2),
      ),
    );
    const cargos = cargosDaPlanilha(linhas);
    expect(cargos).toHaveLength(9);
    expect(cargos.map((c) => c.textoOrigem).sort()).toEqual(
      CARGOS_REAIS.map(([c]) => c).sort(),
    );
  });
});

describe("pareceSujo", () => {
  it("⭐ pega o '¿' dos 7 cargos quebrados do arquivo real", () => {
    const sujos = CARGOS_REAIS.filter(([c]) => pareceSujo(c));
    expect(sujos).toHaveLength(7);
    expect(sujos.map(([c]) => c)).toContain("DOCENTE I ¿ HISTÓRIA");
  });

  it("pega o caractere de substituição (U+FFFD)", () => {
    expect(pareceSujo("DOCENTE I � HISTÓRIA")).toBe(true);
  });

  it("⭐ acento legítimo NÃO é sujeira", () => {
    // O erro que tornaria a marca inútil: metade dos cargos tem acento correto, e marcar
    // todos eles como sujos faria o usuário parar de olhar para o aviso.
    expect(pareceSujo("DOCENTE II")).toBe(false);
    expect(pareceSujo("ARTE")).toBe(false);
    expect(pareceSujo("CIÊNCIAS")).toBe(false);
    expect(pareceSujo("EDUCAÇÃO FÍSICA")).toBe(false);
    expect(pareceSujo("DOCENTE I — HISTÓRIA")).toBe(false);
  });

  it("não quebra com null", () => {
    expect(pareceSujo(null)).toBe(false);
  });

  it("NÃO corrige o texto — só responde sim ou não", () => {
    // Guarda a decisão: se alguém transformar isto num sanitizador, a assinatura muda e
    // este teste cai. A limpeza automática foi medida e descartada.
    expect(typeof pareceSujo("DOCENTE I ¿ HISTÓRIA")).toBe("boolean");
  });
});

describe("aplicarResolucoes", () => {
  const ID_DOCENTE = "aaaaaaaa-0000-0000-0000-000000000001";
  const ID_ARTE = "aaaaaaaa-0000-0000-0000-000000000002";
  const candidato = (cargo: string | null): CandidatoImportado =>
    ({ n_inscricao: "214274", nome: "AGATHA", cargo }) as CandidatoImportado;

  const resolucoes: ResolucaoCargos = new Map([
    ["docente ii", ID_DOCENTE],
    ["arte", ID_ARTE],
  ]);

  it("carimba o cargo_id que o usuário escolheu", () => {
    const [a, b] = aplicarResolucoes([candidato("DOCENTE II"), candidato("ARTE")], resolucoes);
    expect(a.cargo_id).toBe(ID_DOCENTE);
    expect(b.cargo_id).toBe(ID_ARTE);
  });

  it("casa pela chave normalizada, igual ao agrupamento", () => {
    const [r] = aplicarResolucoes([candidato("  Docente II  ")], resolucoes);
    expect(r.cargo_id).toBe(ID_DOCENTE);
  });

  it("⭐ resolução faltante MARCA a linha com null — não lança e não silencia", () => {
    // A marca é o que a tela usa para bloquear a importação (decisão D4). Lançar aqui
    // perderia o lote inteiro; silenciar gravaria milhares de linhas com a chave incompleta.
    const [r] = aplicarResolucoes([candidato("CARGO DESCONHECIDO")], resolucoes);
    expect(r.cargo_id).toBeNull();
  });

  it("candidato sem cargo também sai marcado", () => {
    const [r] = aplicarResolucoes([candidato(null)], resolucoes);
    expect(r.cargo_id).toBeNull();
  });

  it("preserva todo o resto do candidato, sem mutar o original", () => {
    const original = candidato("DOCENTE II");
    const [r] = aplicarResolucoes([original], resolucoes);
    expect(r.nome).toBe("AGATHA");
    expect(r.n_inscricao).toBe("214274");
    expect(r.cargo).toBe("DOCENTE II"); // o texto CRU permanece, como procedência
    expect("cargo_id" in original).toBe(false);
  });

  it("⭐ dois textos sujos para o MESMO cargo produzem o MESMO cargo_id", () => {
    // O caso que a etapa 5 transforma em fusão de linhas: com cargo_id na chave natural,
    // estas duas passam a ser a mesma pessoa no mesmo cargo. É por isso que o dedup tem
    // de rodar DEPOIS desta função, e não antes.
    const comDuasGrafias: ResolucaoCargos = new Map([
      ["docente i ¿ história", ID_DOCENTE],
      ["docente i — história", ID_DOCENTE],
    ]);
    const [a, b] = aplicarResolucoes(
      [candidato("DOCENTE I ¿ HISTÓRIA"), candidato("DOCENTE I — HISTÓRIA")],
      comDuasGrafias,
    );
    expect(a.cargo_id).toBe(b.cargo_id);
  });

  it("lote vazio devolve lote vazio", () => {
    expect(aplicarResolucoes([], resolucoes)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// O relatório de problemas — a parte pura dos DOIS exports
// ─────────────────────────────────────────────────────────────────────────────────────

describe("classificarQueixa", () => {
  it("separa o campo do detalhe pelo prefixo da mensagem", () => {
    expect(classificarQueixa("CPF tem 10 dígitos")).toEqual({
      Campo: "CPF",
      Detalhe: "tem 10 dígitos",
    });
  });

  it("⭐ mensagem sem prefixo conhecido vai para 'Geral' COM O TEXTO INTEIRO", () => {
    // O caso que importa: a queixa não pode sumir só porque ninguém previu o prefixo.
    // O relatório existe para dizer o que corrigir; uma queixa engolida é perda silenciosa.
    expect(classificarQueixa("Coisa nova que ninguém mapeou")).toEqual({
      Campo: "Geral",
      Detalhe: "Coisa nova que ninguém mapeou",
    });
  });

  it("distingue data de hora de nascimento — os dois prefixos começam igual", () => {
    expect(classificarQueixa("Data de nascimento inválida").Campo).toBe("Data de Nascimento");
    expect(classificarQueixa("Hora de nascimento inválida").Campo).toBe("Hora de Nascimento");
  });
});

describe("montarProblemasDoRelatorio", () => {
  const erro = (linhaPlanilha: number, erro: string): LinhaConvertida => ({
    linhaPlanilha,
    candidato: null,
    erro,
    avisos: [],
  });
  const aviso = (linhaPlanilha: number, avisos: string[]): LinhaConvertida => ({
    linhaPlanilha,
    candidato: null,
    erro: null,
    avisos,
  });

  it("junta as três origens e ordena pela linha da planilha", () => {
    const problemas = montarProblemasDoRelatorio(
      [erro(9, "Nome em branco")],
      [aviso(2, ["CPF tem 10 dígitos"])],
      [{ linhaPlanilha: 5, chave: "111||abc" }],
    );
    expect(problemas.map((p) => p.Linha)).toEqual([2, 5, 9]);
    expect(problemas.map((p) => p.Situação)).toEqual([
      "Importada com ressalva",
      "Substituída por linha posterior",
      "Não importada",
    ]);
  });

  it("⭐ uma linha com DOIS avisos rende DUAS queixas, não uma", () => {
    // O `flatMap` é o que garante isto. Com `map`, o segundo aviso sumiria do relatório —
    // e some justamente o que a pessoa precisaria corrigir na planilha.
    const problemas = montarProblemasDoRelatorio(
      [],
      [aviso(3, ["CPF tem 10 dígitos", "CEP tem 7 dígitos"])],
      [],
    );
    expect(problemas).toHaveLength(2);
    expect(problemas.map((p) => p.Campo)).toEqual(["CPF", "CEP"]);
    expect(problemas.every((p) => p.Linha === 3)).toBe(true);
  });

  it("a linha repetida nomeia a chave inteira, com a separação legível", () => {
    // `repetidas` inclui duas grafias do MESMO cargo unificadas pela associação, não só
    // repetição literal — por isso o detalhe mostra a chave: na planilha não há duas
    // linhas idênticas para achar.
    const [p] = montarProblemasDoRelatorio([], [], [{ linhaPlanilha: 4, chave: "12345678900||uuid-do-cargo" }]);
    expect(p.Campo).toBe("Chave de Identificação");
    expect(p.Detalhe).toContain("12345678900 / uuid-do-cargo");
  });

  it("erro sem mensagem não quebra — vira queixa 'Geral' vazia, e não some", () => {
    const [p] = montarProblemasDoRelatorio([{ ...erro(7, ""), erro: null }], [], []);
    expect(p).toMatchObject({ Linha: 7, Campo: "Geral", Situação: "Não importada" });
  });

  it("nada errado devolve lista vazia", () => {
    expect(montarProblemasDoRelatorio([], [], [])).toEqual([]);
  });
});

describe("agruparProblemasPorCampo", () => {
  it("agrupa por campo e ordena os campos alfabeticamente", () => {
    const grupos = agruparProblemasPorCampo(
      montarProblemasDoRelatorio(
        [],
        [
          { linhaPlanilha: 2, candidato: null, erro: null, avisos: ["Raça fora da lista"] },
          { linhaPlanilha: 3, candidato: null, erro: null, avisos: ["CPF tem 10 dígitos"] },
          { linhaPlanilha: 4, candidato: null, erro: null, avisos: ["CPF tem 9 dígitos"] },
        ],
        [],
      ),
    );
    expect(grupos.map((g) => g.campo)).toEqual(["CPF", "Raça"]);
    expect(grupos[0].queixas).toHaveLength(2);
  });

  it("⭐ agrupar NÃO perde queixa: o total dos grupos bate com a entrada", () => {
    // Controle contra o modo de falha real de um agrupador — sobrescrever em vez de
    // acumular. Sem esta soma, um bug que guardasse só a última queixa de cada campo
    // passaria por todos os outros testes daqui.
    const problemas = montarProblemasDoRelatorio(
      [],
      [
        { linhaPlanilha: 2, candidato: null, erro: null, avisos: ["CPF a", "CEP b"] },
        { linhaPlanilha: 3, candidato: null, erro: null, avisos: ["CPF c", "Nome d"] },
      ],
      [{ linhaPlanilha: 4, chave: "x||y" }],
    );
    const grupos = agruparProblemasPorCampo(problemas);
    expect(grupos.reduce((n, g) => n + g.queixas.length, 0)).toBe(problemas.length);
  });

  it("preserva a ordem por linha DENTRO de cada campo", () => {
    const grupos = agruparProblemasPorCampo(
      montarProblemasDoRelatorio(
        [],
        [
          { linhaPlanilha: 9, candidato: null, erro: null, avisos: ["CPF tarde"] },
          { linhaPlanilha: 2, candidato: null, erro: null, avisos: ["CPF cedo"] },
        ],
        [],
      ),
    );
    expect(grupos[0].queixas.map((q) => q.Linha)).toEqual([2, 9]);
  });
});
