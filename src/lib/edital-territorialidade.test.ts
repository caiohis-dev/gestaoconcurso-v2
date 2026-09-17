/**
 * Territorialidade e lotação — a distribuição do Quadro II e o agrupamento do Anexo I.
 *
 * ⭐ O controle positivo é o **Edital 004/2026 inteiro**, o único territorializado dos
 * três: o Quadro II (ACS, 80 vagas em 39 UBSF) e o Quadro III (ACE, 143 numa linha só).
 * Os dois convivem no mesmo documento, e é isso que prova que a territorialização é
 * parâmetro do CARGO, não do edital.
 */
import { describe, it, expect } from "vitest";
import {
  conferirDistribuicao,
  somarDistribuicao,
  agruparPorBairro,
  totalDaUnidade,
  lerColagemDoAnexo,
  type VagasNaUnidade,
} from "@/lib/edital-territorialidade";

let seq = 0;
const un = (ac: number, pd = 0, cn = 0, codigo: string | null = null): VagasNaUnidade => ({
  unidade_lotacao_id: `u${seq++}`,
  codigo_inscricao: codigo,
  vagas_ampla_concorrencia: ac,
  vagas_pcd: pd,
  vagas_negros: cn,
});

/**
 * O QUADRO II publicado, nas 5 formas que ele tem — 39 unidades ao todo.
 *
 * | total | unidades | (AC, PD, CN) |
 * |---|---|---|
 * | 1 | 20 | (1,0,0) |
 * | 2 | 7 | (2,0,0) |
 * | 3 | 4 | (3,0,0) |
 * | 4 | 7 | (3,0,1) |
 * | 6 | 1 | (4,1,1) |
 */
const QUADRO_II: VagasNaUnidade[] = [
  ...Array.from({ length: 20 }, () => un(1)),
  ...Array.from({ length: 7 }, () => un(2)),
  ...Array.from({ length: 4 }, () => un(3)),
  ...Array.from({ length: 7 }, () => un(3, 0, 1)),
  un(4, 1, 1),
];

describe("⭐ CONTROLE POSITIVO: o Quadro II do Edital 004 (ACS)", () => {
  it("🎯 as 39 unidades somam as 80 vagas que o item 5.1.1 declara", () => {
    expect(QUADRO_II).toHaveLength(39);
    expect(somarDistribuicao(QUADRO_II)).toEqual({
      total: 80, amplaConcorrencia: 71, pcd: 1, negros: 8,
    });
  });

  it("🔴 e NÃO acusa nada — as 39 seguem a regra de cotas medida", () => {
    // Se acusasse, seria a regra de cotas que estaria errada, não o edital. Foi assim que
    // o corte de 4 vagas apareceu: 4 unidades de 3 vagas divergiam do arredondamento.
    expect(conferirDistribuicao({ unidades: QUADRO_II, totalDeclaradoNoCargo: null })).toEqual([]);
  });

  it("⭐ CONTROLE: o Quadro I do 004 não declara total, e isso NÃO é pendência", () => {
    // O Quadro I do 004 tem só cargo, habilitação, CH e vencimento — o item 2.2 manda ao
    // Quadro II. Cobrar a igualdade contra um `null` acusaria todo edital desse tipo.
    expect(conferirDistribuicao({ unidades: QUADRO_II, totalDeclaradoNoCargo: null })).toEqual([]);
    expect(conferirDistribuicao({ unidades: QUADRO_II, totalDeclaradoNoCargo: 80 })).toEqual([]);
  });

  it("🎯 acusa quando o Quadro I declara um total que a distribuição não fecha", () => {
    const a = conferirDistribuicao({ unidades: QUADRO_II, totalDeclaradoNoCargo: 79 });
    expect(a.map((x) => x.regra)).toEqual(["distribuicao-nao-fecha"]);
    expect(a[0].severidade).toBe("erro");
    expect(a[0].mensagem).toContain("80");
    expect(a[0].mensagem).toContain("79");
  });
});

describe("⭐ CONTROLE: o ACE do mesmo edital NÃO é territorializado", () => {
  it("cargo sem distribuição não acusa nada — é o Quadro III, linha única de 143", () => {
    // Os dois cargos convivem no MESMO documento. Se a territorialização fosse do edital,
    // este caso seria impossível de representar.
    expect(conferirDistribuicao({ unidades: [], totalDeclaradoNoCargo: 143 })).toEqual([]);
    expect(conferirDistribuicao({ unidades: [], totalDeclaradoNoCargo: null })).toEqual([]);
  });
});

describe("as regras da distribuição", () => {
  it("🎯 acusa unidade com ZERO vagas — sairia linha vazia no quadro", () => {
    const a = conferirDistribuicao({ unidades: [un(2), un(0)], totalDeclaradoNoCargo: null });
    expect(a.map((x) => x.regra)).toEqual(["unidade-sem-vaga"]);
    expect(a[0].severidade).toBe("aviso");
  });

  it("🎯 acusa cota divergente da regra medida, como AVISO", () => {
    // 4 vagas dão (3,0,1). Declarar (4,0,0) é possível, mas não pode passar calado.
    const a = conferirDistribuicao({ unidades: [un(4)], totalDeclaradoNoCargo: null });
    expect(a.map((x) => x.regra)).toEqual(["cota-da-unidade-diverge"]);
    expect(a[0].severidade).toBe("aviso");
  });

  it("🔴 acusa CÓDIGO DE INSCRIÇÃO repetido, e como ERRO", () => {
    // É o defeito mais caro desta tabela: o candidato escolhe a unidade pelo código.
    const a = conferirDistribuicao({
      unidades: [un(1, 0, 0, "DN-3"), un(1, 0, 0, "dn-3"), un(1, 0, 0, "DN-4")],
      totalDeclaradoNoCargo: null,
    });
    expect(a.map((x) => x.regra)).toEqual(["codigo-de-inscricao-repetido"]);
    expect(a[0].severidade).toBe("erro");
    // ⚠️ Compara em caixa alta: "DN-3" e "dn-3" são o mesmo código para quem digita.
    expect(a[0].mensagem).toContain("DN-3");
  });

  it("⭐ CONTROLE NEGATIVO: código ainda em branco NÃO é repetição", () => {
    // Metade dos 39 códigos fica NULL enquanto se digita. Se o nulo contasse como
    // repetido, o painel acusaria o trabalho em andamento — e é por isso que o banco
    // também não tem índice único aqui.
    const a = conferirDistribuicao({
      unidades: [un(1), un(1), un(1)],
      totalDeclaradoNoCargo: null,
    });
    expect(a.map((x) => x.regra)).toEqual([]);
  });

  it("nomeia o cargo quando recebe o rótulo", () => {
    const a = conferirDistribuicao({
      unidades: [un(1, 0, 0, "X"), un(1, 0, 0, "X")],
      totalDeclaradoNoCargo: null,
      rotuloDoCargo: "Agente Comunitário de Saúde",
    });
    expect(a[0].mensagem).toContain("Agente Comunitário de Saúde");
  });

  it("totalDaUnidade soma os três, tratando ausência como zero", () => {
    expect(totalDaUnidade(un(3, 0, 1))).toBe(4);
    expect(totalDaUnidade({ ...un(0), vagas_pcd: 0, vagas_negros: 0 })).toBe(0);
  });
});

describe("o Anexo I — agrupar por bairro", () => {
  const l = (id: string, bairro: string | null, logradouro: string, ordem: number) =>
    ({ id, bairro, logradouro, ordem });

  it("🎯 agrupa preservando a ORDEM publicada", () => {
    const s = agruparPorBairro([
      l("c", "AERO CLUBE", "RUA EDU CHAVES", 2),
      l("a", "AERO CLUBE", "AVENIDA BEIRA-RIO", 0),
      l("b", "AERO CLUBE", "AVENIDA MINISTRO SALGADO FILHO", 1),
      l("d", "JARDIM PARAÍBA", "RUA 552", 3),
    ]);
    expect(s).toHaveLength(2);
    expect(s[0].bairro).toBe("AERO CLUBE");
    expect(s[0].logradouros.map((x) => x.logradouro)).toEqual([
      "AVENIDA BEIRA-RIO", "AVENIDA MINISTRO SALGADO FILHO", "RUA EDU CHAVES",
    ]);
    expect(s[1].bairro).toBe("JARDIM PARAÍBA");
  });

  it("🔴 bairro NULO é seção legítima, e fica ONDE apareceu", () => {
    // Das 28 seções do Anexo I, 12 listam as ruas direto sob a unidade. Jogá-las num
    // balde "sem bairro" no fim mudaria a ordem do documento publicado.
    const s = agruparPorBairro([
      l("a", null, "RUA SEM BAIRRO", 0),
      l("b", "CENTRO", "RUA DO CENTRO", 1),
      l("c", null, "OUTRA SEM BAIRRO", 2),
    ]);
    expect(s.map((x) => x.bairro)).toEqual([null, "CENTRO", null]);
  });

  it("⚠️ bairro em branco conta como NULO — é o mesmo estado para quem lê", () => {
    const s = agruparPorBairro([l("a", "   ", "RUA X", 0), l("b", null, "RUA Y", 1)]);
    expect(s).toHaveLength(1);
    expect(s[0].bairro).toBeNull();
  });

  it("🔴 desempata por id quando a ordem empata — sem isso o anexo muda entre consultas", () => {
    const s = agruparPorBairro([
      l("z", "A", "RUA Z", 0),
      l("a", "A", "RUA A", 0),
    ]);
    expect(s[0].logradouros.map((x) => x.logradouro)).toEqual(["RUA A", "RUA Z"]);
  });

  it("lista vazia devolve lista vazia, sem seção fantasma", () => {
    expect(agruparPorBairro([])).toEqual([]);
  });
});

/**
 * A colagem do Anexo I.
 *
 * 🔴 **O que se guarda aqui é a AUSÊNCIA DE PERDA SILENCIOSA.** Quem cola 843 linhas não
 * confere de cabeça: toda linha que o parser recusa tem de sair nomeada na tela. É a
 * lição que a importação de candidatos deixou, e o formato de defeito que este repo mais
 * teme.
 */
describe("lerColagemDoAnexo", () => {
  it("🎯 lê o formato do documento — número, pipe e nome", () => {
    const { linhas, recusadas } = lerColagemDoAnexo(
      "AERO CLUBE:\n1 | AVENIDA BEIRA-RIO\n2 | RUA EDU CHAVES\n3. RUA MENA BARRETO",
    );
    expect(recusadas).toEqual([]);
    expect(linhas).toEqual([
      { bairro: "AERO CLUBE", logradouro: "AVENIDA BEIRA-RIO" },
      { bairro: "AERO CLUBE", logradouro: "RUA EDU CHAVES" },
      { bairro: "AERO CLUBE", logradouro: "RUA MENA BARRETO" },
    ]);
  });

  it("🔴 DESCARTA a numeração do documento — ela é do PDF, não do dado", () => {
    // A ordem é recalculada em `ordem` na gravação. Guardar o número colado faria a
    // renumeração mentir no dia em que alguém inserisse uma rua no meio.
    const { linhas } = lerColagemDoAnexo("7 | RUA 552");
    expect(linhas[0].logradouro).toBe("RUA 552");
  });

  it("🔴 CONTROLE: preserva as quatro formas de 'faixa' do documento, inteiras", () => {
    // São elas que derrubaram `numero_inicial`/`numero_final` do esboço: cada uma é de um
    // tipo diferente, e quebrá-las em inteiros seria adivinhar.
    const cruas = [
      "TRAV. VISCONDE DO RIO BRANCO (ALAMEDAS 1 A 7)",
      "RODOVIA LÚCIO MEIRA KM 7501 A 8500",
      "RUA VEREADOR ACACIO DA ROCHA (DO N 03 ATÉ O N 9201)",
      "RUA 1, 2, 3 e 4 (CONDOMÍNIO VISTA BELA)",
    ];
    const { linhas } = lerColagemDoAnexo(cruas.map((c, i) => `${i + 1} | ${c}`).join("\n"));
    expect(linhas.map((l) => l.logradouro)).toEqual(cruas);
  });

  it("🔴 rua repetida no MESMO bairro é RECUSADA e NOMEADA", () => {
    const { linhas, recusadas } = lerColagemDoAnexo(
      "CENTRO:\n1 | RUA X\n2 | rua x\n3 | RUA Y",
    );
    expect(linhas).toHaveLength(2);
    expect(recusadas).toHaveLength(1);
    expect(recusadas[0].linha).toBe(3);
    expect(recusadas[0].conteudo).toBe("rua x");
    expect(recusadas[0].motivo).toContain("repetida");
  });

  it("⭐ CONTROLE NEGATIVO: a mesma rua em OUTRO bairro entra", () => {
    // Área limítrofe é prevista pelo próprio edital (item 5.1.5). Recusar aqui apagaria
    // o que o documento manda publicar.
    const { linhas, recusadas } = lerColagemDoAnexo("A:\nRUA X\nB:\nRUA X");
    expect(linhas).toHaveLength(2);
    expect(recusadas).toEqual([]);
  });

  it("linhas antes de qualquer bairro ficam com bairro nulo", () => {
    // 12 das 28 seções do Anexo I listam as ruas direto sob a unidade.
    const { linhas } = lerColagemDoAnexo("RUA SOLTA\nCENTRO:\nRUA DO CENTRO");
    expect(linhas[0]).toEqual({ bairro: null, logradouro: "RUA SOLTA" });
    expect(linhas[1].bairro).toBe("CENTRO");
  });

  it("ignora linhas em branco sem recusá-las", () => {
    // Linha vazia é formatação, não perda: acusá-la encheria o relatório de ruído e
    // faria quem cola ignorar o relatório inteiro.
    const { linhas, recusadas } = lerColagemDoAnexo("\n\nRUA X\n   \n\nRUA Y\n");
    expect(linhas).toHaveLength(2);
    expect(recusadas).toEqual([]);
  });

  it("texto vazio não produz nada, e não quebra", () => {
    expect(lerColagemDoAnexo("")).toEqual({ linhas: [], recusadas: [] });
  });
});
