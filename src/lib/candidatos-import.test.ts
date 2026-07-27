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
  autoMapear,
  chaveNatural,
  converterLinha,
  deduplicar,
  letraDaColuna,
  mapeamentoCompleto,
  mensagemErroImportacao,
  parseBooleano,
  parseDataBr,
  parseHora,
  rotulosDeColunas,
  soDigitos,
  type CandidatoImportado,
  type Mapeamento,
} from "./candidatos-import";

const EDITAL = "11111111-1111-1111-1111-111111111111";

/** O cabeçalho exato do arquivo real, incluindo o `NOME` repetido e a coluna sem título. */
const CABECALHO_REAL = [
  "   ", "ID", "NOME", "CPF", "LOGRADOURO", "NUMERO", "COMPLEMENTO", "BAIRRO", "CIDADE",
  "UF", "CEP", "IDENTIDADE_NUMERO", "IDENTIDADE_ORGAO", "IDENTIDADE_EMISSAO",
  "IDENTIDADE_UF", "TELEFONE", "CELULAR", "EMAIL", "SEXO", "REGISTRO_ORGAO",
  "PORTADOR_DEFICIENCIA", "CONCURSO_ID", "DATA_NASCIMENTO", "CONFIRMADO", "SENHA", "RACA",
  "TIPOPROVA", "HORA_NASCIMENTO", "NOME",
];

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
    // A coluna A do arquivo real tem '   ' como cabeçalho. Sem isto, o Select mostraria
    // uma opção vazia, impossível de escolher conscientemente.
    expect(rotulosDeColunas(CABECALHO_REAL)[0].rotulo).toBe("(sem título — coluna A)");
  });
});

describe("autoMapear", () => {
  const mapeamento = autoMapear(rotulosDeColunas(CABECALHO_REAL));

  it("acerta os campos óbvios do arquivo real", () => {
    expect(mapeamento.n_inscricao).toBe(1); // ID
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
    // vazia: o palpite pareceria certo e zeraria o cargo de todas as linhas — e como o
    // cargo compõe a chave natural, as 382 inscrições repetidas colidiriam e 396
    // inscritos sumiriam sem erro. Ficar em branco obriga a escolha consciente.
    expect(mapeamento.cargo).toBeNull();
  });

  it("completa os dois campos obrigatórios sozinho neste arquivo", () => {
    expect(mapeamentoCompleto(mapeamento)).toBe(true);
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
      n_inscricao: "214274",
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
  const m = mapa({ n_inscricao: 0, nome: 1, cpf: 2, email: 3, data_nascimento: 4, cep: 5, raca: 6 });

  it("os 2 CPFs impossíveis do arquivo entram sem CPF, não somem", () => {
    // ' 8631309761' (10 dígitos) e '1O778817709' (letra O no lugar do zero). A identidade
    // do candidato é a INSCRIÇÃO — descartar o inscrito por causa do CPF deixaria a
    // lista de inscritos incompleta, que é o único erro grave possível nesta tabela.
    for (const cpfRuim of [" 8631309761", "1O778817709"]) {
      const r = converterLinha(["214274", "FULANO", cpfRuim], m, EDITAL, 5);
      expect(r.candidato).not.toBeNull();
      expect(r.candidato?.nome).toBe("FULANO");
      expect(r.candidato?.cpf).toBeNull();
      expect(r.avisos.join(" ")).toMatch(/CPF/i);
    }
  });

  it("os 27 e-mails inválidos entram sem e-mail", () => {
    for (const ruim of ["andi.gmail", "marcia2manoel@ gmail.com", "a@b.com / c@d.com"]) {
      const r = converterLinha(["214274", "FULANO", "22940161739", ruim], m, EDITAL, 5);
      expect(r.candidato?.email).toBeNull();
      expect(r.avisos.join(" ")).toMatch(/mail/i);
    }
  });

  it("normaliza o e-mail válido para minúsculas", () => {
    const r = converterLinha(["1", "F", null, "Fulano@Gmail.COM"], m, EDITAL, 5);
    expect(r.candidato?.email).toBe("fulano@gmail.com");
    expect(r.avisos).toEqual([]);
  });

  it("avisa quando a data não foi entendida, mas só se havia data", () => {
    const comLixo = converterLinha(["1", "F", null, null, "não sei"], m, EDITAL, 5);
    expect(comLixo.candidato?.data_nascimento).toBeNull();
    expect(comLixo.avisos.join(" ")).toMatch(/nascimento/i);

    // CONTROLE POSITIVO: célula vazia não é problema e não pode virar ruído no relatório.
    const semData = converterLinha(["1", "F", null, null, null], m, EDITAL, 5);
    expect(semData.avisos).toEqual([]);
  });

  it("recusa código de raça fora do dicionário e mantém a linha", () => {
    const r = converterLinha(["1", "F", null, null, null, null, "7"], m, EDITAL, 5);
    expect(r.candidato?.raca).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/[Rr]aça/);

    // CONTROLE POSITIVO: o código 2 (Branca) é o único que aparece no arquivo real.
    const valido = converterLinha(["1", "F", null, null, null, null, "2"], m, EDITAL, 5);
    expect(valido.candidato?.raca).toBe(2);
    expect(valido.avisos).toEqual([]);
  });

  it("corta a UF em 2 caracteres em vez de estourar a coluna", () => {
    const mUf = mapa({ n_inscricao: 0, nome: 1, identidade_uf: 2 });
    // 'BR', 'UF' e '13' aparecem de verdade como UF de identidade — não são estados, mas
    // são o que a origem afirma, e cabem nos 2 caracteres.
    expect(converterLinha(["1", "F", "br"], mUf, EDITAL, 5).candidato?.identidade_uf).toBe("BR");
    expect(converterLinha(["1", "F", "RIO"], mUf, EDITAL, 5).candidato?.identidade_uf).toBe("RI");
  });
});

describe("deduplicar", () => {
  const m = mapa({ n_inscricao: 0, nome: 1, cargo: 2 });
  const converter = (linhas: string[][]) =>
    linhas.map((l, i) => converterLinha(l, m, EDITAL, i + 2));

  it("mantém a MESMA inscrição em cargos diferentes — 382 casos reais", () => {
    // O achado que decidiu a chave natural: no arquivo real, 382 números de inscrição
    // aparecem mais de uma vez porque a pessoa concorre a mais de um cargo. Se a chave
    // fosse só a inscrição, 396 inscritos legítimos seriam descartados aqui.
    const { candidatos, repetidas } = deduplicar(
      converter([
        ["213946", "CASSIA ANDREA", "DOCENTE II"],
        ["213946", "CASSIA ANDREA", "DOCENTE I - LÍNGUA INGLESA"],
        ["213946", "CASSIA ANDREA", "DOCENTE I - HISTÓRIA"],
      ]),
    );
    expect(candidatos).toHaveLength(3);
    expect(repetidas).toHaveLength(0);
  });

  it("tira a repetição de verdade, mantendo a ÚLTIMA ocorrência", () => {
    // Obrigatório, não zelo: o Postgres recusa o upsert inteiro com 'ON CONFLICT DO
    // UPDATE command cannot affect row a second time' se a chave repetir no mesmo lote.
    // Sem esta passagem, uma linha duplicada faria o bloco de 500 não gravar NADA.
    const { candidatos, repetidas } = deduplicar(
      converter([
        ["214274", "NOME ANTIGO", "DOCENTE II"],
        ["214274", "NOME CORRIGIDO", "DOCENTE II"],
      ]),
    );
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].nome).toBe("NOME CORRIGIDO");
    expect(repetidas).toEqual([{ linhaPlanilha: 2, chave: "214274||docente ii" }]);
  });

  it("trata caixa e espaço no cargo como o mesmo cargo, igual ao índice do banco", () => {
    const { candidatos } = deduplicar(
      converter([
        ["214274", "FULANO", "DOCENTE II"],
        ["214274", "FULANO", " docente ii "],
      ]),
    );
    // Se isto passasse a 2, o banco recusaria o lote: `cargo_chave` normaliza igual.
    expect(candidatos).toHaveLength(1);
  });

  it("não leva para o banco a linha que já foi descartada por erro", () => {
    const { candidatos } = deduplicar(converter([["", "SEM INSCRIÇÃO", "X"]]));
    expect(candidatos).toHaveLength(0);
  });
});

describe("chaveNatural", () => {
  it("normaliza igual ao índice candidatos_inscricao_cargo_key", () => {
    const base = { n_inscricao: "214274" } as CandidatoImportado;
    expect(chaveNatural({ ...base, cargo: " Docente II " })).toBe("214274||docente ii");
    expect(chaveNatural({ ...base, cargo: null })).toBe("214274||");
  });
});

describe("mensagemErroImportacao", () => {
  it("traduz as CHECKs do banco para o que corrigir na planilha", () => {
    // Regra 4 de invariantes.md: barreira que devolve erro cru transfere o problema.
    expect(mensagemErroImportacao('violates check constraint "chk_candidato_cpf_formato"')).toMatch(
      /CPF/,
    );
    expect(mensagemErroImportacao('duplicate key value violates "candidatos_inscricao_cargo_key"')).toMatch(
      /repetid/i,
    );
    expect(mensagemErroImportacao("value too long for type character varying(8)")).toMatch(/8/);
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
