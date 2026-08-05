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
  deRelatorioPersistido,
  deduplicar,
  inscritosComSalaEspecial,
  letraDaColuna,
  mapeamentoCompleto,
  mensagemErroImportacao,
  paraRelatorioPersistido,
  pareceSujo,
  parseBooleano,
  parseDataBr,
  parseHora,
  resolverLinhas,
  separarPorPagamento,
  rotulosDeColunas,
  soDigitos,
  subtituloDoCampo,
  type CandidatoImportado,
  type CandidatoResolvido,
  type Mapeamento,
  type ProblemaDoRelatorio,
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

  describe("⭐ o CPF passou a valer pela REGRA OFICIAL (2026-08-02), não pelo tamanho", () => {
    // Decisão do usuário: validar os dígitos verificadores (módulo 11). O inscrito
    // SEGUE ENTRANDO — muda só o que o relatório acusa.
    //
    // 🔵 Medido nos 7.231 inscritos importados: 2 sem 11 dígitos e ZERO com verificador
    // errado. Nenhum destes casos vem do arquivo real; são o futuro que a regra guarda.

    it("CPF de 11 dígitos com verificador errado ENTRA, cru, e é acusado", () => {
      // Até 01/08 este passava por bom e era gravado normalizado: 11 dígitos bastavam.
      const r = converterLinha(comCargo(["214274", "FULANO", "123.456.789-00"]), m, EDITAL, 5);

      expect(r.candidato).not.toBeNull();
      expect(r.candidato?.n_inscricao).toBe("214274");
      expect(r.candidato?.cpf).toBe("123.456.789-00");
      expect(r.avisos.join(" ")).toMatch(/dígitos verificadores não conferem/i);
    });

    it("sequência repetida é acusada PELO MOTIVO CERTO — não por verificador", () => {
      // 111.111.111-11 passa na aritmética do módulo 11. Culpar o verificador mandaria o
      // usuário caçar um dígito trocado que não existe.
      const r = converterLinha(comCargo(["214275", "FULANO", "11111111111"]), m, EDITAL, 6);

      expect(r.candidato?.cpf).toBe("11111111111");
      expect(r.avisos.join(" ")).toMatch(/sequência de dígitos repetidos/i);
      expect(r.avisos.join(" ")).not.toMatch(/verificadores/i);
    });

    it("⭐ CONTROLE POSITIVO: CPF legítimo continua entrando NORMALIZADO e sem queixa", () => {
      // Metade da prova é recusar; a outra é não estragar o caminho feliz. Sem este caso,
      // uma regra estrita demais passaria despercebida — e ela acusaria 7.231 inscritos.
      const r = converterLinha(comCargo(["214276", "FULANO", "529.982.247-25"]), m, EDITAL, 7);

      expect(r.candidato?.cpf).toBe("52998224725");
      expect(r.avisos.filter((a) => a.startsWith("CPF"))).toEqual([]);
    });

    it("⭐ CONTROLE POSITIVO: o CPF que começa com ZERO não é confundido com inválido", () => {
      // Um CPF legítimo pode começar com 0, e é o caso em que uma implementação que trate
      // o campo como número come o primeiro dígito e passa a acusar gente inocente.
      const r = converterLinha(comCargo(["214277", "FULANO", "012.345.678-90"]), m, EDITAL, 8);

      expect(r.candidato?.cpf).toBe("01234567890");
      expect(r.avisos.filter((a) => a.startsWith("CPF"))).toEqual([]);
    });

    it("🔴 os DOIS casos reais do arquivo recebem mensagens DIFERENTES", () => {
      // ⚠️ Até 2026-08-02 os dois recebiam o MESMO texto ("não tem 11 dígitos"), que
      // descreve bem um deles e mal o outro. A inscrição 4256 tem 11 CARACTERES — quem
      // abrisse o relatório contaria 11 e não entenderia a queixa. São defeitos de
      // natureza diferente e a providência na planilha também é.
      const comLetra = converterLinha(comCargo(["4256", "JOSIANE", "1O778817709"]), m, EDITAL, 10);
      const curto = converterLinha(comCargo(["375", "CRISTIANE", "8631309761"]), m, EDITAL, 11);

      const queixaLetra = comLetra.avisos.find((a) => a.startsWith("CPF"))!;
      const queixaCurto = curto.avisos.find((a) => a.startsWith("CPF"))!;

      // O intruso é NOMEADO: sem isso a pessoa procura o caractere errado num campo de 11.
      expect(queixaLetra).toMatch(/caractere que não é dígito/i);
      expect(queixaLetra).toContain('"O"');
      expect(queixaLetra).not.toMatch(/tem 10 dígitos/i);

      // E o curto continua sendo acusado pela QUANTIDADE, que é o defeito dele de verdade.
      expect(queixaCurto).toMatch(/tem 10 dígitos, e um CPF tem 11/i);
      expect(queixaCurto).not.toMatch(/caractere/i);

      expect(queixaLetra).not.toBe(queixaCurto);
    });

    it("⭐ CONTROLE POSITIVO: a máscara não é acusada como caractere intruso", () => {
      // O ponto e o hífen são escrita normal de CPF. Se contassem como intrusos, o
      // caminho feliz viraria queixa em massa — 7.231 inscritos.
      const r = converterLinha(comCargo(["214279", "FULANO", "529.982.247-25"]), m, EDITAL, 12);

      expect(r.candidato?.cpf).toBe("52998224725");
      expect(r.avisos.filter((a) => a.startsWith("CPF"))).toEqual([]);
    });

    it("a queixa nova cai no campo CPF do relatório, não no balde 'Geral'", () => {
      // `classificarQueixa` casa por PREFIXO de texto, sem tipo que ligue os dois lados:
      // um aviso novo com outra abertura iria calado para "Geral". Ver PREFIXOS_POR_CAMPO.
      const r = converterLinha(comCargo(["214278", "FULANO", "123.456.789-00"]), m, EDITAL, 9);
      const queixa = classificarQueixa(r.avisos.find((a) => a.startsWith("CPF"))!);

      expect(queixa.Campo).toBe("CPF");
      expect(queixa.Detalhe).toMatch(/verificadores/i);
    });
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
 * ⚠️ **A chave natural encolheu em 2026-08-01 para `(edital_id, n_inscricao)`** — o CPF e o
 * cargo SAÍRAM da identidade (migration `20260801193530`). Estes testes continuam montando
 * o pipeline inteiro — converter → resolver → deduplicar — mas o que ele protege mudou: a
 * ordem já não é o que separa duas grafias do mesmo cargo, e sim o que garante que o que
 * sai do dedup tem `cargo_id` para gravar.
 *
 * 🔴 Vários testes daqui INVERTERAM de resultado na mudança, e isso é o esperado, não
 * acidente: com a chave menor, casos que antes eram duas linhas passam a ser uma. Cada um
 * diz no comentário o que afirmava antes — apagar isso faria a próxima pessoa achar que o
 * comportamento sempre foi este.
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

  it("🔴 o MESMO nº de inscrição em cargos diferentes vira UMA linha — o aperto aceito", () => {
    // ⚠️ ESTE TESTE AFIRMAVA O CONTRÁRIO ATÉ 2026-08-01. Ele se chamava "mantém a MESMA
    // pessoa em cargos diferentes" e exigia `toHaveLength(3)`, porque `cargo_id` compunha a
    // chave natural. Com a chave sendo só o nº de inscrição, as três linhas são a MESMA
    // chave e sobra uma.
    //
    // 🔴 É o único lado da mudança que pode PERDER linha, e por isso está fixado aqui em
    // vez de apagado. Duas coisas o tornam aceitável, e as duas foram medidas:
    //   · no arquivo real o cenário NÃO existe — os 7.416 números de inscrição são
    //     distintos, e a mesma pessoa em dois cargos tem dois números (inscrições 9 e 5208
    //     para o CPF 05261923727). Quem concorre a dois cargos faz duas inscrições;
    //   · a linha descartada NÃO some calada: sai em `repetidas`, nomeada e com a chave, na
    //     seção "Repetidas" do relatório de importação.
    //
    // Se um edital futuro repetir numeração entre cargos, é ESTE teste que descreve o que
    // vai acontecer — e aí a decisão de voltar `cargo_id` à chave se reabre com dado real.
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
    expect(candidatos).toHaveLength(1);
    expect(repetidas).toHaveLength(2);
    // Controle positivo do "não some calado": as duas descartadas são nomeáveis pela linha.
    expect(repetidas.map((r) => r.linhaPlanilha)).toEqual([2, 3]);
  });

  it("⭐ números de inscrição DIFERENTES continuam sendo linhas diferentes", () => {
    // O controle positivo do teste acima, e o caso que realmente ocorre no arquivo: a mesma
    // pessoa, dois cargos, dois números. Se este cair, a chave ficou larga demais e a
    // segunda inscrição de 380 pagantes some da importação.
    const { candidatos, repetidas } = pipeline(
      [
        ["9", "CASSIA ANDREA", "DOCENTE II"],
        ["5208", "CASSIA ANDREA", "DOCENTE I - LÍNGUA INGLESA"],
      ],
      new Map([
        ["docente ii", ID_DOCENTE_II],
        ["docente i - língua inglesa", ID_INGLES],
      ]),
    );
    expect(candidatos).toHaveLength(2);
    expect(repetidas).toHaveLength(0);
  });

  it("tira a repetição de verdade, mantendo a ÚLTIMA ocorrência", () => {
    // Obrigatório, não zelo: o índice único recusa a segunda linha de mesma chave, e como a
    // gravação roda dentro da RPC `trocar_candidatos`, o erro aborta a TROCA INTEIRA — o
    // DELETE volta atrás junto e nada é importado.
    // ⚠️ Até 30/07 a recusa vinha do upsert ("cannot affect row a second time") e derrubava
    // um bloco de 1.000; hoje os blocos vão para o preparo, que não tem índice único, e a
    // recusa acontece depois. O mecanismo mudou, a necessidade do dedup não.
    const { candidatos, repetidas } = pipeline(
      [
        ["214274", "NOME ANTIGO", "DOCENTE II"],
        ["214274", "NOME CORRIGIDO", "DOCENTE II"],
      ],
      new Map([["docente ii", ID_DOCENTE_II]]),
    );
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].nome).toBe("NOME CORRIGIDO");
    expect(repetidas).toEqual([{ linhaPlanilha: 2, chave: "214274" }]);
  });

  it("⭐ funde DUAS GRAFIAS apontadas ao mesmo cargo", () => {
    // ⚠️ Este teste continua VERDE, mas pelo motivo trocado — e é o tipo de coisa que faz
    // alguém achar que provou o que não provou. Até 2026-08-01 ele era a razão de o dedup
    // rodar depois da resolução: os textos `DOCENTE I ¿ HISTÓRIA` e `DOCENTE I — HISTÓRIA`
    // diferem, e só o `cargo_id` os empatava na chave. Hoje as duas linhas colidem porque
    // têm o MESMO nº de inscrição — o cargo não entra mais na conta.
    // O que ele ainda garante de útil: a linha que sobra carrega o `cargo_id` unificado.
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
    // ⚠️ Desde 2026-08-01 o dedup NÃO é mais quem prova isso — as duas linhas colidiriam de
    // qualquer jeito pelo nº de inscrição. Quem normaliza é `chaveDeCargo`, fazendo as duas
    // grafias caírem na MESMA entrada do mapa de resoluções; por isso a asserção que vale
    // aqui é a do `cargo_id`, não a contagem.
    const { candidatos } = pipeline(
      [
        ["214274", "FULANO", "DOCENTE II"],
        ["214274", "FULANO", " docente ii "],
      ],
      new Map([["docente ii", ID_DOCENTE_II]]),
    );
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].cargo_id).toBe(ID_DOCENTE_II);
  });

  it("não leva para o banco a linha que já foi descartada por erro", () => {
    const { candidatos } = pipeline([["", "SEM INSCRIÇÃO", "X"]], new Map());
    expect(candidatos).toHaveLength(0);
  });

  it("⚠️ cargo NÃO resolvido não afeta mais a chave", () => {
    // ⚠️ ESTE TESTE MUDOU DE RAZÃO EM 2026-08-01. Ele se chamava "cargo NÃO resolvido vira
    // UM valor só, e não infinitos distintos", e guardava o espelho do `NULLS NOT DISTINCT`
    // do índice antigo: com `cargo_id` na chave e nulo em duas linhas, a chave em JS
    // precisava tratar os nulos como iguais, senão o banco recusava o lote.
    // Hoje `cargo_id` saiu da chave, então nulo ali não empata nem separa nada. O que
    // sobra de conteúdo: D4 impede que isto chegue ao banco, e se chegasse a chave continua
    // sendo o nº de inscrição.
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

  /**
   * ⚠️ Este bloco se chamava "com o CPF dentro da chave (2026-07-27)". O CPF SAIU da chave
   * em 2026-08-01, e os testes ficam para fixar o que isso mudou — dois deles inverteram.
   */
  describe("o CPF fora da chave (2026-08-01)", () => {
    const mCpf = mapa({ n_inscricao: 0, nome: 1, cargo: 2, cpf: 3 });
    const pipelineCpf = (linhas: string[][]) =>
      deduplicar(
        resolverLinhas(
          linhas.map((l, i) => converterLinha(l, mCpf, EDITAL, i + 2)),
          new Map([["docente ii", ID_DOCENTE_II]]),
        ),
      );

    it("🔴 CPF diferente NÃO separa mais: a inscrição é que manda", () => {
      // ⚠️ ESTE TESTE AFIRMAVA O CONTRÁRIO ATÉ 2026-08-01 — exigia `toHaveLength(2)` e se
      // chamava "CPF diferente separa o que antes era a MESMA linha". Era a consequência de
      // somar o CPF à chave em 27/07; com o CPF fora dela, some.
      // O ganho: corrigir um CPF na planilha e reimportar deixou de criar registro novo.
      const { candidatos, repetidas } = pipelineCpf([
        ["214274", "FULANO", "DOCENTE II", "22940161739"],
        ["214274", "FULANO", "DOCENTE II", "14781065732"],
      ]);
      expect(candidatos).toHaveLength(1);
      expect(repetidas).toHaveLength(1);
    });

    it("o mesmo CPF, cargo e inscrição continuam sendo uma linha só", () => {
      const { candidatos } = pipelineCpf([
        ["214274", "NOME ANTIGO", "DOCENTE II", "22940161739"],
        ["214274", "NOME CORRIGIDO", "DOCENTE II", "229.401.617-39"],
      ]);
      expect(candidatos).toHaveLength(1);
      expect(candidatos[0].nome).toBe("NOME CORRIGIDO");
    });

    it("🔴 os 2 CPFs impossíveis do arquivo real seguem sendo duas linhas — agora por construção", () => {
      // O defeito que este teste guarda desde 2026-07-29 é o pior possível nesta tabela:
      // dois inscritos REAIS fundidos num só, um sumindo da lista. Na época a fusão vinha do
      // CPF na chave — '8631309761' e '1O778817709' viravam NULL, e o `NULLS NOT DISTINCT`
      // empatava a chave.
      //
      // ⚠️ O FIXTURE MUDOU EM 2026-08-01, e a razão é que o antigo deixou de descrever o
      // arquivo: ele dava a MESMA inscrição às duas linhas, o que hoje as fundiria de fato.
      // Medido no arquivo real, as duas estão nas inscrições 375 e 4256 — chaves diferentes.
      // Com o CPF fora da identidade, o valor dele (cru, inválido ou ausente) não consegue
      // mais empatar duas pessoas: a proteção deixou de depender de normalização e passou a
      // ser estrutural.
      const { candidatos, repetidas } = pipelineCpf([
        ["375", "CRISTIANE APARECIDA", "DOCENTE II", " 8631309761"],
        ["4256", "JOSIANE PEDROSA", "DOCENTE II", "1O778817709"],
      ]);
      expect(candidatos).toHaveLength(2);
      expect(repetidas).toHaveLength(0);
      expect(candidatos.map((c) => c.cpf).sort()).toEqual(["1O778817709", "8631309761"]);
    });

    it("⚠️ CPF ausente não multiplica linha — e não depende mais do NULLS NOT DISTINCT", () => {
      // ⚠️ Este teste se chamava "o CPF VAZIO continua colapsando — é o que o NULLS NOT
      // DISTINCT guarda". O índice novo NÃO tem NULLS NOT DISTINCT, e não precisa: as duas
      // colunas da chave (`edital_id`, `n_inscricao`) são NOT NULL no banco.
      // O que continua valendo é o efeito visível — inscrito sem CPF não se reinsere a cada
      // reimportação —, só que agora sai de graça, em vez de depender de dois espelhamentos
      // (a chave em JS e a cláusula do índice) concordarem.
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
  it("🔴 é SÓ o nº de inscrição — precisa espelhar candidatos_edital_inscricao_key", () => {
    // ⚠️ Até 2026-08-01 esta chave era `cpf||cargo_id||n_inscricao`, e este teste exigia o
    // formato de três partes. A migration 20260801193530 trocou o índice para
    // (edital_id, n_inscricao); `edital_id` não entra aqui porque o dedup roda dentro de
    // uma importação, que é de um edital só.
    //
    // 🔴 Se este teste cair, o dedup e o índice divergiram — e o sintoma NÃO é um erro de
    // teste: é a troca inteira sendo recusada pelo banco na hora da importação.
    // ⚠️ As variáveis são tipadas como `CandidatoResolvido` de propósito. `chaveNatural`
    // aceita `Pick<…, 'n_inscricao'>`, e passar o objeto literal direto faria o TS recusar
    // `cpf`/`cargo` como propriedade em excesso — o que esconderia o ponto do teste, que é
    // justamente entregar um candidato COMPLETO e conferir que só a inscrição sai.
    const completo: CandidatoResolvido = {
      n_inscricao: "214274",
      cpf: "22940161739",
      cargo: " Docente II ",
      cargo_id: ID_DOCENTE_II,
    } as CandidatoResolvido;
    expect(chaveNatural(completo)).toBe("214274");
  });

  it("⭐ CPF e cargo NÃO entram: a mesma inscrição é a mesma chave, difiram eles no que for", () => {
    // O ganho que fez a mudança valer: corrigir CPF ou cargo na planilha e reimportar deixou
    // de criar registro novo. Se este expect cair, algum dos dois voltou para a identidade.
    const comCpfEDocente: CandidatoResolvido = {
      n_inscricao: "214274",
      cpf: "22940161739",
      cargo_id: ID_DOCENTE_II,
    } as CandidatoResolvido;
    const semCpfEHistoria: CandidatoResolvido = {
      n_inscricao: "214274",
      cpf: null,
      cargo_id: ID_HISTORIA,
    } as CandidatoResolvido;
    expect(chaveNatural(comCpfEDocente)).toBe(chaveNatural(semCpfEHistoria));
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
    // ⚠️ O nome do índice mudou DUAS vezes (etapa 5: `..._cargo_id_...`; 2026-08-01:
    // `candidatos_edital_inscricao_key`). O ramo casa pelo NOME, então renomear o índice sem
    // mexer aqui faz o usuário voltar a ver o 'duplicate key value violates' cru.
    expect(
      mensagemErroImportacao(
        'duplicate key value violates unique constraint "candidatos_edital_inscricao_key"',
      ),
    ).toMatch(/mesmo nº de inscrição/i);
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

  it("⭐ o RESTRICT da alocação manda desfazer a alocação — e vale para os TRÊS fluxos", () => {
    // Troca total, excluir um candidato e "limpar edital" chegam TODOS aqui (os três
    // usam esta função), e o 23503 nomeia a FK da tabela de alocação. A mensagem tem de
    // dizer as duas metades: onde desfazer, e que a lista foi mantida.
    const msg = mensagemErroImportacao(
      'update or delete on table "candidatos" violates foreign key constraint "candidatos_alocacao_candidato_id_fkey" on table "candidatos_alocacao"',
    );
    expect(msg).toMatch(/Alocação de Candidatos/);
    expect(msg).toMatch(/mantida/i);
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
  const erro = (
    linhaPlanilha: number,
    nInscricao: string | null,
    erro: string,
  ): LinhaConvertida => ({ linhaPlanilha, nInscricao, candidato: null, erro, avisos: [] });
  const aviso = (
    linhaPlanilha: number,
    nInscricao: string | null,
    avisos: string[],
  ): LinhaConvertida => ({ linhaPlanilha, nInscricao, candidato: null, erro: null, avisos });

  it("junta as três origens, ordena pela LINHA e exibe a INSCRIÇÃO", () => {
    // ⚠️ As duas coisas se separaram em 2026-08-01: a ordem continua sendo a da planilha
    // (é o que dá a ordem de leitura do arquivo), mas a coluna exibida passou a ser o nº
    // de inscrição. Por isso as inscrições aqui estão em ordem "errada" de propósito —
    // se a saída vier ordenada por elas, alguém trocou o critério de ordenação.
    const problemas = montarProblemasDoRelatorio(
      [erro(9, "700", "Nome em branco")],
      [aviso(2, "900", ["CPF tem 10 dígitos"])],
      [{ linhaPlanilha: 5, chave: "800" }],
    );
    expect(problemas.map((p) => p["Nº de Inscrição"])).toEqual(["900", "800", "700"]);
    expect(problemas.map((p) => p.Situação)).toEqual([
      "Importada com ressalva",
      "Substituída por linha posterior",
      "Não importada",
    ]);
  });

  it("🔴 a linha da planilha NÃO vai para o relatório", () => {
    // Decisão do usuário em 2026-08-01: o endereço dentro do arquivo saiu, quem identifica
    // é a pessoa. Se `Linha` voltar a aparecer, este teste cai — é o que impede a coluna de
    // ser reintroduzida sem decisão.
    const [p] = montarProblemasDoRelatorio([erro(42, "1234", "Nome vazio")], [], []);
    expect(Object.keys(p)).toEqual(["Nº de Inscrição", "Situação", "Campo", "Detalhe"]);
  });

  it("⭐ sem nº de inscrição a queixa NÃO some — sai com '—'", () => {
    // É o único caso em que a inscrição falta ('Nº de inscrição vazio'), e é justamente
    // quando a linha não tem mais nada que a identifique. Deixá-la fora do relatório, ou
    // com célula vazia, seria perda silenciosa: some do relatório o que mais precisa de
    // conserto. Quem localiza a linha, aí, é o texto do erro.
    const [p] = montarProblemasDoRelatorio([erro(3, null, "Nº de inscrição vazio")], [], []);
    expect(p["Nº de Inscrição"]).toBe("—");
    expect(p.Campo).toBe("Nº de Inscrição");
  });

  it("⭐ uma linha com DOIS avisos rende DUAS queixas, não uma", () => {
    // O `flatMap` é o que garante isto. Com `map`, o segundo aviso sumiria do relatório —
    // e some justamente o que a pessoa precisaria corrigir na planilha.
    const problemas = montarProblemasDoRelatorio(
      [],
      [aviso(3, "555", ["CPF tem 10 dígitos", "CEP tem 7 dígitos"])],
      [],
    );
    expect(problemas).toHaveLength(2);
    expect(problemas.map((p) => p.Campo)).toEqual(["CPF", "CEP"]);
    expect(problemas.every((p) => p["Nº de Inscrição"] === "555")).toBe(true);
  });

  it("a linha repetida traz a inscrição repetida na coluna", () => {
    // ⚠️ ESTE TESTE SE CHAMAVA "nomeia a chave inteira, com a separação legível" e exigia
    // `Detalhe` contendo "12345678900 / uuid-do-cargo". A chave era composta e o detalhe a
    // desmontava com um `.replace("||", " / ")`. Desde 2026-08-01 `chave` É o nº de
    // inscrição, então ela vai direto para a coluna e o detalhe explica o que aconteceu.
    const [p] = montarProblemasDoRelatorio([], [], [{ linhaPlanilha: 4, chave: "214274" }]);
    expect(p["Nº de Inscrição"]).toBe("214274");
    expect(p.Campo).toBe("Chave de Identificação");
    expect(p.Detalhe).toMatch(/mesmo nº de inscrição/i);
  });

  it("erro sem mensagem não quebra — vira queixa 'Geral' vazia, e não some", () => {
    const [p] = montarProblemasDoRelatorio([{ ...erro(7, "77", ""), erro: null }], [], []);
    expect(p).toMatchObject({
      "Nº de Inscrição": "77",
      Campo: "Geral",
      Situação: "Não importada",
    });
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
          { linhaPlanilha: 2, nInscricao: "2", candidato: null, erro: null, avisos: ["Raça fora da lista"] },
          { linhaPlanilha: 3, nInscricao: "3", candidato: null, erro: null, avisos: ["CPF tem 10 dígitos"] },
          { linhaPlanilha: 4, nInscricao: "4", candidato: null, erro: null, avisos: ["CPF tem 9 dígitos"] },
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
        { linhaPlanilha: 2, nInscricao: "2", candidato: null, erro: null, avisos: ["CPF a", "CEP b"] },
        { linhaPlanilha: 3, nInscricao: "3", candidato: null, erro: null, avisos: ["CPF c", "Nome d"] },
      ],
      [{ linhaPlanilha: 4, chave: "4" }],
    );
    const grupos = agruparProblemasPorCampo(problemas);
    expect(grupos.reduce((n, g) => n + g.queixas.length, 0)).toBe(problemas.length);
  });

  it("preserva a ordem por linha DENTRO de cada campo", () => {
    // A inscrição "900" está na linha 9 e a "200" na linha 2: o esperado sai na ordem das
    // LINHAS, não das inscrições, que é o critério que `montarProblemasDoRelatorio` usa.
    const grupos = agruparProblemasPorCampo(
      montarProblemasDoRelatorio(
        [],
        [
          { linhaPlanilha: 9, nInscricao: "900", candidato: null, erro: null, avisos: ["CPF tarde"] },
          { linhaPlanilha: 2, nInscricao: "200", candidato: null, erro: null, avisos: ["CPF cedo"] },
        ],
        [],
      ),
    );
    expect(grupos[0].queixas.map((q) => q["Nº de Inscrição"])).toEqual(["200", "900"]);
  });
});

describe("subtituloDoCampo", () => {
  it("🔴 'Pagamento' NÃO é apresentado como problema", () => {
    // Decisão do usuário em 2026-08-01: inscrição sem pagamento não tem defeito a
    // corrigir. Chamá-la de problema mandava a pessoa caçar erro em 185 linhas legítimas.
    expect(subtituloDoCampo("Pagamento")).toBe("Lista de inscrições sem pagamento registrado");
    expect(subtituloDoCampo("Pagamento")).not.toMatch(/problema/i);
  });

  it("🔴 'Sala Especial' também NÃO é apresentada como problema", () => {
    // Mesma razão do pagamento, e um grau mais forte: a linha entrou inteira e sem
    // defeito nenhum. O bloco existe para PROVIDENCIAR a sala, não para corrigir dado.
    expect(subtituloDoCampo("Sala Especial")).toBe(
      "Lista de inscritos com pedido de sala especial",
    );
    expect(subtituloDoCampo("Sala Especial")).not.toMatch(/problema/i);
  });

  it("CONTROLE POSITIVO: os demais campos seguem com o título de problema", () => {
    expect(subtituloDoCampo("CPF")).toBe("Problemas encontrados no campo: CPF");
  });

  it("⚠️ casa pelo texto exato que montarProblemasDoRelatorio escreve em Campo", () => {
    // Nada de tipo liga os dois. Este teste é a ligação: se o `Campo` dos não-pagantes
    // mudar de texto, o título especial para de valer EM SILÊNCIO e o bloco volta a se
    // apresentar como "Problemas encontrados no campo: <seja lá o que for>".
    const naoPagante: LinhaConvertida = {
      linhaPlanilha: 2,
      nInscricao: "185",
      // Parcial: `montarProblemasDoRelatorio` só lê `nome` daqui — a inscrição vem do
      // `nInscricao` da linha, que existe mesmo quando o candidato não existe.
      candidato: { n_inscricao: "185", nome: "FULANA", confirmado: false } as CandidatoImportado,
      erro: null,
      avisos: [],
    };
    const [p] = montarProblemasDoRelatorio([], [], [], [naoPagante]);
    expect(subtituloDoCampo(p.Campo)).toBe("Lista de inscrições sem pagamento registrado");
  });
});

describe("paraRelatorioPersistido", () => {
  it("🔴 troca as chaves acentuadas do export pelas snake_case do banco", () => {
    // A ÚNICA ponte entre os dois formatos. Se este teste passar a exigir chaves
    // diferentes, `jsonb_to_recordset` na RPC para de casar em silêncio — o INSERT do
    // relatório grava NULL em toda coluna, sem erro nenhum (a função não valida NOT NULL
    // contra o texto de origem, só contra o valor final).
    const problemas: ProblemaDoRelatorio[] = [
      {
        "Nº de Inscrição": "9",
        Situação: "Não importada",
        Campo: "Nome",
        Detalhe: "Nome vazio",
      },
    ];
    expect(paraRelatorioPersistido(problemas)).toEqual([
      { n_inscricao: "9", situacao: "Não importada", campo: "Nome", detalhe: "Nome vazio" },
    ]);
  });

  it("preserva a ORDEM e a QUANTIDADE — não filtra nem reordena", () => {
    const problemas: ProblemaDoRelatorio[] = [
      { "Nº de Inscrição": "1", Situação: "Não importada", Campo: "Nome", Detalhe: "a" },
      { "Nº de Inscrição": "2", Situação: "Importada com ressalva", Campo: "CPF", Detalhe: "b" },
    ];
    const linhas = paraRelatorioPersistido(problemas);
    expect(linhas.map((l) => l.n_inscricao)).toEqual(["1", "2"]);
  });

  it("lista vazia devolve lista vazia — é o caso 'importação sem problema nenhum'", () => {
    // ⚠️ Não é caso degenerado: é o resultado normal de uma planilha limpa, e a RPC
    // precisa gravar isto como '[]', não pular a chamada — senão um relatório velho e
    // sujo de uma importação anterior sobreviveria a uma reimportação impecável.
    expect(paraRelatorioPersistido([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// O filtro de pagamento — só quem pagou é importado (2026-08-01)
// ─────────────────────────────────────────────────────────────────────────────────────

describe("confirmado é campo OBRIGATÓRIO", () => {
  // 🔴 Esta bateria existe porque a falsificação de 2026-08-01 mostrou o buraco: devolver
  // `confirmado` para `obrigatorio: false` passava com a suíte inteira verde, e é a
  // mudança de uma palavra que reabre a falha mais grave que este fluxo pode ter.
  //
  // O estrago: sem a coluna pareada, `parseBooleano(null)` devolve `false` para TODA
  // linha, `separarPorPagamento` descarta o arquivo inteiro e — como importar é TROCA
  // TOTAL — a lista do edital é apagada e ninguém entra no lugar.

  it("🔴 `confirmado` é obrigatório, e afrouxar isso apaga a lista do edital", () => {
    const campo = CAMPOS_CANDIDATO.find((c) => c.key === "confirmado");
    expect(campo?.obrigatorio).toBe(true);
  });

  it("🔴 pareamento sem `confirmado` NÃO é completo — é o que barra o passo 2", () => {
    const semConfirmado: Mapeamento = {};
    for (const campo of CAMPOS_CANDIDATO) {
      semConfirmado[campo.key] = campo.key === "confirmado" ? null : 0;
    }
    expect(mapeamentoCompleto(semConfirmado)).toBe(false);

    // Controle positivo: com a coluna apontada, o pareamento completa. Sem ele, a
    // asserção acima passaria mesmo se `mapeamentoCompleto` recusasse tudo.
    expect(mapeamentoCompleto({ ...semConfirmado, confirmado: 0 })).toBe(true);
  });

  it("o cabeçalho real `CONFIRMADO` auto-mapeia — obrigatório não quer dizer manual", () => {
    // Ao contrário do cargo, aqui adivinhar é seguro: não há segunda coluna candidata.
    const mapa = autoMapear(rotulosDeColunas(CABECALHO_REAL));
    expect(mapa.confirmado).toBe(CABECALHO_REAL.indexOf("CONFIRMADO"));
  });
});

describe("separarPorPagamento", () => {
  const linha = (
    linhaPlanilha: number,
    confirmado: boolean,
    extra: Partial<CandidatoImportado> = {},
  ): LinhaConvertida => ({
    linhaPlanilha,
    nInscricao: String(200000 + linhaPlanilha),
    candidato: {
      edital_id: "e-1",
      n_inscricao: String(200000 + linhaPlanilha),
      cargo: "DOCENTE II",
      nome: `PESSOA ${linhaPlanilha}`,
      cpf: null,
      email: null,
      telefone: null,
      celular: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: null,
      uf: null,
      cep: null,
      identidade_numero: null,
      identidade_orgao: null,
      identidade_uf: null,
      identidade_emissao: null,
      data_nascimento: null,
      hora_nascimento: null,
      sexo: null,
      raca: null,
      sala_especial: null,
      portador_deficiencia: false,
      confirmado,
      concurso_id_origem: null,
      ...extra,
    },
    erro: null,
    avisos: [],
  });

  it("separa pagante de não-pagante", () => {
    const { pagantes, naoPagantes } = separarPorPagamento([
      linha(2, true),
      linha(3, false),
      linha(4, true),
    ]);
    expect(pagantes.map((l) => l.linhaPlanilha)).toEqual([2, 4]);
    expect(naoPagantes.map((l) => l.linhaPlanilha)).toEqual([3]);
  });

  it("⭐ linha com ERRO não entra em NENHUM dos dois", () => {
    // Ela já é contada em `comErro`. Classificá-la também aqui faria o relatório acusar a
    // mesma linha por dois motivos, e a pessoa procuraria dois problemas onde há um.
    const comErro: LinhaConvertida = {
      linhaPlanilha: 9,
      // Tem inscrição: 'Nome vazio' falha DEPOIS de ler a inscrição. É o caso que o
      // relatório consegue identificar mesmo sem `candidato`.
      nInscricao: "209",
      candidato: null,
      erro: "Nome vazio",
      avisos: [],
    };
    const { pagantes, naoPagantes } = separarPorPagamento([linha(2, true), comErro]);
    expect(pagantes).toHaveLength(1);
    expect(naoPagantes).toHaveLength(0);
  });

  it("preserva a ordem original dentro de cada grupo", () => {
    const { pagantes } = separarPorPagamento([linha(7, true), linha(2, true), linha(5, true)]);
    expect(pagantes.map((l) => l.linhaPlanilha)).toEqual([7, 2, 5]);
  });

  it("lista vazia devolve os dois grupos vazios", () => {
    expect(separarPorPagamento([])).toEqual({ pagantes: [], naoPagantes: [] });
  });

  it("🔴 ninguém pagou: devolve pagantes VAZIO, e não a lista inteira", () => {
    // O caso que a obrigatoriedade de `confirmado` existe para nunca acontecer por
    // descuido (coluna sem parear ⇒ `parseBooleano(null)` ⇒ tudo false). Se um dia
    // acontecer de verdade, a função tem de dizer "zero", não degradar para "todos" — é
    // a tela que decide o que fazer com o zero, e ela avisa antes de trocar a lista.
    const { pagantes, naoPagantes } = separarPorPagamento([linha(2, false), linha(3, false)]);
    expect(pagantes).toEqual([]);
    expect(naoPagantes).toHaveLength(2);
  });

  it("🔴 rodar ANTES do dedup preserva o pagante que tem duplicata não-pagante", () => {
    // ⚠️ ESTE É O TESTE QUE GUARDA A ORDEM DO PIPELINE, e o defeito que ele impede é
    // invisível na tela: `deduplicar` mantém a ÚLTIMA ocorrência da chave. Com o filtro
    // DEPOIS dele, a linha 3 (não-pagante) deslocaria a linha 2 (pagante, mesma chave) e
    // só então seria descartada — o pagante sumiria da importação sem aparecer em lugar
    // nenhum, nem como erro, nem como repetida, nem como não-pagante.
    const mesmaChave = { n_inscricao: "214274", cpf: "22940161739" };
    const pagante = linha(2, true, mesmaChave);
    const naoPagante = linha(3, false, mesmaChave);

    // A ordem CERTA: filtra e só então deduplica.
    const { pagantes } = separarPorPagamento([pagante, naoPagante]);
    const certo = deduplicar(resolverLinhas(pagantes, new Map()));
    expect(certo.candidatos).toHaveLength(1);
    expect(certo.candidatos[0].nome).toBe("PESSOA 2");

    // O CONTROLE: a ordem invertida perde a pessoa. Se algum dia esta asserção passar a
    // devolver "PESSOA 2", é porque `deduplicar` mudou de política e a ordem pode ser
    // revista — até lá, ela é a prova de que a ordem não é estilo.
    const invertido = deduplicar(resolverLinhas([pagante, naoPagante], new Map()));
    expect(invertido.candidatos).toHaveLength(1);
    expect(invertido.candidatos[0].nome).toBe("PESSOA 3");
  });

  it("⭐ os não-pagantes entram no relatório, NOMEADOS e com situação própria", () => {
    // Sem isto o descarte seria mudo — 185 pessoas do arquivo real sumiriam sem rastro.
    const { naoPagantes } = separarPorPagamento([linha(2, true), linha(3, false)]);
    const [p] = montarProblemasDoRelatorio([], [], [], naoPagantes);

    expect(p.Situação).toBe("Não importada (inscrição não paga)");
    expect(p.Campo).toBe("Pagamento");
    // ⚠️ A inscrição saiu do Detalhe e virou COLUNA em 2026-08-01 — antes o texto dizia
    // "FULANA — inscrição nº 200003 não consta como paga", repetindo o número que agora
    // tem lugar próprio. O NOME continua no detalhe, e é o que não pode sumir: quem
    // confere se a ausência é legítima não pode ser obrigado a voltar à planilha.
    expect(p["Nº de Inscrição"]).toBe("200003");
    expect(p.Detalhe).toContain("PESSOA 3");
  });

  it("⭐ 'não pago' NÃO se confunde com 'não importada' por erro de dado", () => {
    // As duas dizem que a linha ficou de fora, mas a providência é oposta: erro se
    // corrige e se reimporta; não-pagamento é o filtro fazendo o que foi mandado.
    const comErro: LinhaConvertida = {
      linhaPlanilha: 5,
      nInscricao: "205",
      candidato: null,
      erro: "Nome vazio",
      avisos: [],
    };
    const { naoPagantes } = separarPorPagamento([linha(3, false)]);
    const problemas = montarProblemasDoRelatorio([comErro], [], [], naoPagantes);

    expect(problemas.map((p) => p.Situação)).toEqual([
      "Não importada (inscrição não paga)",
      "Não importada",
    ]);
    expect(new Set(problemas.map((p) => p.Campo)).size).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// SALA ESPECIAL (2026-08-04) — o campo que não é problema de ninguém
// ─────────────────────────────────────────────────────────────────────────────────────

describe("sala especial — o pareamento", () => {
  const MAPA = mapa({ n_inscricao: 0, nome: 1, cargo: 2, confirmado: 3, sala_especial: 4 });
  const LINHA = ["300", "FULANA SOUZA", "DOCENTE II", "1", "  Ledor e prova ampliada  "];

  it("grava o texto CRU, apenas com as pontas aparadas, e sem aviso nenhum", () => {
    const r = converterLinha(LINHA, MAPA, EDITAL, 2);
    expect(r.candidato?.sala_especial).toBe("Ledor e prova ampliada");
    // ⚠️ A ausência de aviso é o ponto, não um detalhe: texto livre não tem forma
    // esperada da qual divergir. Se alguém acrescentar validação aqui, é este teste que
    // cai — e a pergunta certa vai ser "validar contra o quê?".
    expect(r.avisos).toEqual([]);
    expect(r.erro).toBeNull();
  });

  it("célula vazia vira null, e a linha entra igual", () => {
    const r = converterLinha(["300", "FULANA SOUZA", "DOCENTE II", "1", ""], MAPA, EDITAL, 2);
    expect(r.candidato?.sala_especial).toBeNull();
    expect(r.avisos).toEqual([]);
  });

  it("⭐ texto LONGO atravessa inteiro — a coluna é `text`, sem teto", () => {
    // Guarda a decisão do usuário de 2026-08-04 contra o `varchar(2000)` do pedido
    // original. Um teto no banco recusaria — varchar no Postgres NÃO trunca — e como a
    // gravação é uma transação só, uma célula longa derrubaria a troca do edital INTEIRO.
    const pedido = "A".repeat(5000);
    const r = converterLinha(["300", "FULANA SOUZA", "DOCENTE II", "1", pedido], MAPA, EDITAL, 2);
    expect(r.candidato?.sala_especial).toHaveLength(5000);
    expect(r.avisos).toEqual([]);
  });

  it("NÃO é obrigatório: o pareamento completa sem ele", () => {
    const semSalaEspecial: Mapeamento = {};
    for (const campo of CAMPOS_CANDIDATO) {
      semSalaEspecial[campo.key] = campo.key === "sala_especial" ? null : 0;
    }
    expect(mapeamentoCompleto(semSalaEspecial)).toBe(true);

    // CONTROLE POSITIVO: a mesma montagem, deixando de fora um campo que É obrigatório,
    // tem de recusar. Sem ele a asserção acima passaria mesmo se `mapeamentoCompleto`
    // aceitasse qualquer coisa.
    expect(mapeamentoCompleto({ ...semSalaEspecial, confirmado: null })).toBe(false);
  });

  it("auto-mapeia `SALA_ESPECIAL`, e NÃO se contenta com `SALA`", () => {
    expect(autoMapear(rotulosDeColunas(["SALA_ESPECIAL"])).sala_especial).toBe(0);
    expect(autoMapear(rotulosDeColunas(["Sala Especial"])).sala_especial).toBe(0);

    // 🔴 CONTROLE NEGATIVO, e é a decisão que ele guarda: `'sala'` sozinho ficou FORA dos
    // sinônimos de propósito. Uma coluna chamada só `SALA` num export futuro é muito mais
    // provavelmente a sala de PROVA da pessoa — que não é isto e nem existe no modelo.
    expect(autoMapear(rotulosDeColunas(["SALA"])).sala_especial).toBeNull();
  });

  it("⚠️ o arquivo REAL não tem esta coluna — o campo fica em branco, como deve", () => {
    // MEDIDO: as 29 colunas do arquivo de 7.416 linhas não trazem sala especial (ver
    // `CABECALHO_REAL`). Os sinônimos deste campo são o único palpite não medido do
    // módulo, e este teste fixa a consequência de errar o palpite: nada é preenchido,
    // nada é escrito errado, e o usuário aponta a coluna à mão no passo 2.
    expect(autoMapear(rotulosDeColunas(CABECALHO_REAL)).sala_especial).toBeNull();
  });
});

describe("inscritosComSalaEspecial", () => {
  const comPedido = (
    linhaPlanilha: number,
    confirmado: boolean,
    salaEspecial: string | null,
  ): LinhaConvertida => ({
    linhaPlanilha,
    nInscricao: String(300 + linhaPlanilha),
    candidato: {
      n_inscricao: String(300 + linhaPlanilha),
      nome: `PESSOA ${linhaPlanilha}`,
      confirmado,
      sala_especial: salaEspecial,
    } as CandidatoImportado,
    erro: null,
    avisos: [],
  });

  it("lista quem pediu e entrou — e ignora quem não pediu", () => {
    const { pagantes } = separarPorPagamento([
      comPedido(1, true, "Ledor"),
      comPedido(2, true, null),
    ]);
    const lista = inscritosComSalaEspecial(pagantes, []);
    expect(lista.map((l) => l.candidato?.nome)).toEqual(["PESSOA 1"]);
  });

  it("⭐ NÃO lista o não-pagante, mesmo que ele tenha pedido", () => {
    // A pessoa não entra na lista do edital desde 2026-08-01, então o pedido dela não é
    // um pedido a atender. Listá-la faria a coordenação preparar sala para quem não vai
    // fazer a prova — e o motivo da ausência já está dito, com nome, na seção Pagamento.
    const { pagantes } = separarPorPagamento([
      comPedido(1, false, "Ledor"),
      comPedido(2, true, "Sala térrea"),
    ]);
    const lista = inscritosComSalaEspecial(pagantes, []);
    expect(lista.map((l) => l.candidato?.nome)).toEqual(["PESSOA 2"]);
  });

  it("⭐ NÃO lista a linha SUBSTITUÍDA por outra de mesma inscrição", () => {
    // 🔴 O filtro que ninguém lembra. `deduplicar` mantém a ÚLTIMA ocorrência da chave, e
    // é ela que o banco guarda. Sem esta exclusão, a mesma pessoa apareceria DUAS vezes
    // no relatório — uma delas com o texto que o banco descartou —, e quem fosse montar
    // as salas contaria dois pedidos onde há um.
    const primeira = comPedido(1, true, "Ledor");
    const segunda = { ...comPedido(2, true, "Sala térrea"), nInscricao: "301" };
    segunda.candidato = { ...segunda.candidato!, n_inscricao: "301" };

    const { pagantes } = separarPorPagamento([primeira, segunda]);
    const { repetidas } = deduplicar(resolverLinhas(pagantes, new Map()));
    expect(repetidas).toEqual([{ linhaPlanilha: 1, chave: "301" }]);

    const lista = inscritosComSalaEspecial(pagantes, repetidas);
    expect(lista.map((l) => l.candidato?.sala_especial)).toEqual(["Sala térrea"]);

    // CONTROLE POSITIVO: sem a colisão, a primeira linha aparece normalmente. Sem ele,
    // um filtro que descartasse tudo passaria neste teste.
    expect(inscritosComSalaEspecial(pagantes, []).map((l) => l.linhaPlanilha)).toEqual([1, 2]);
  });
});

describe("sala especial no relatório", () => {
  const pedido = (linhaPlanilha: number, nome: string, texto: string): LinhaConvertida => ({
    linhaPlanilha,
    nInscricao: String(300 + linhaPlanilha),
    candidato: { nome, sala_especial: texto, confirmado: true } as CandidatoImportado,
    erro: null,
    avisos: [],
  });

  it("⭐ sai como linha própria, NOMEADA e com o pedido inteiro", () => {
    const [p] = montarProblemasDoRelatorio([], [], [], [], [pedido(2, "FULANA", "Ledor")]);

    expect(p["Nº de Inscrição"]).toBe("302");
    expect(p.Campo).toBe("Sala Especial");
    expect(p.Detalhe).toContain("FULANA");
    expect(p.Detalhe).toContain("Ledor");
  });

  it("🔴 a Situação NÃO é 'ressalva' — a linha entrou sem defeito nenhum", () => {
    // Ressalva quer dizer "confira este dado na origem". Aqui não há nada a conferir: o
    // dado está certo, e o que existe é trabalho a fazer. Trocar o texto por uma das
    // situações de queixa faria o relatório acusar 40 pessoas de um erro que não há.
    const [p] = montarProblemasDoRelatorio([], [], [], [], [pedido(2, "FULANA", "Ledor")]);
    expect(p.Situação).toBe("Importada com sala especial");
    expect(p.Situação).not.toMatch(/ressalva|não importada/i);
  });

  it("⚠️ liga o Campo ao título do bloco do PDF", () => {
    // O mesmo par frágil do pagamento: nada de tipo liga `montarProblemasDoRelatorio` a
    // `subtituloDoCampo`. Mudar o texto do `Campo` sem mudar lá devolve o título genérico
    // ("Problemas encontrados no campo: …") EM SILÊNCIO.
    const [p] = montarProblemasDoRelatorio([], [], [], [], [pedido(2, "FULANA", "Ledor")]);
    expect(subtituloDoCampo(p.Campo)).toBe("Lista de inscritos com pedido de sala especial");
  });

  it("é ordenada pela linha da planilha, junto das outras origens", () => {
    const problemas = montarProblemasDoRelatorio(
      [{ linhaPlanilha: 9, nInscricao: "700", candidato: null, erro: "Nome vazio", avisos: [] }],
      [],
      [],
      [],
      [pedido(2, "FULANA", "Ledor"), pedido(20, "BELTRANO", "Sala térrea")],
    );
    expect(problemas.map((p) => p["Nº de Inscrição"])).toEqual(["302", "700", "320"]);
  });

  it("⭐ atravessa a persistência inteira, ida e volta", () => {
    // O par `paraRelatorioPersistido`/`deRelatorioPersistido` é a ÚNICA ponte entre o
    // formato do banco e o do export. Um pedido longo que se perdesse ou fosse cortado
    // no caminho sumiria do relatório consultável em /candidatos sem erro nenhum.
    const texto = "Ledor, prova ampliada fonte 24 e tempo adicional de 60 minutos";
    const original = montarProblemasDoRelatorio([], [], [], [], [pedido(2, "FULANA", texto)]);
    const volta = deRelatorioPersistido(paraRelatorioPersistido(original));

    expect(volta).toEqual(original);
    expect(volta[0].Detalhe).toContain(texto);
  });

  it("sem ninguém pedindo, o relatório não ganha linha nenhuma", () => {
    // CONTROLE: a origem nova não pode inventar linha quando não há pedido — senão o
    // relatório "impecável" (zero linhas) deixaria de existir, e o diálogo de
    // /candidatos perderia a distinção entre importação limpa e edital nunca importado.
    expect(montarProblemasDoRelatorio([], [], [], [], [])).toEqual([]);
  });
});
