/**
 * O documento montado — a única montagem que a prévia e a exportação desenham.
 *
 * O que este arquivo guarda, e por quê:
 * - a ORDEM da cadeia de resolução: um valor de campo contendo `{{` não pode virar
 *   referência (era garantia do `EditalStudio` e saiu de lá junto com a cadeia);
 * - a numeração do documento montado é a MESMA que o linter enxerga (`ancorasDoDocumento`)
 *   — se divergirem, o arquivo exportado diz um número e o painel de pendências, outro;
 * - quadro sem linha vira PENDÊNCIA nomeada, nunca tabela vazia;
 * - as formas que o documento publicado exige e a tela já fazia (vaga reservada zero em
 *   branco, o cargo só no rótulo quando há mais de um, o dia da semana por extenso).
 */
import { describe, expect, it } from "vitest";
import { montarDocumento } from "@/lib/edital-numeracao";
import { ancorasDoDocumento, type ItemBruto } from "@/lib/edital-itens";
import {
  matrizDaProva,
  montarEditalCompleto,
  montarQuadro,
  quadroDeCargos,
  quadroDeTitulos,
  quadroDoCronograma,
  resolverMarcadores,
  rotuloDoNumero,
  vagasPorArea,
  type DadosDosQuadros,
} from "@/lib/edital-documento";

let seq = 0;
function artigo(capitulo_chave: string, p: Partial<ItemBruto> = {}): ItemBruto {
  seq += 1;
  return {
    id: `i${String(seq).padStart(3, "0")}`,
    capitulo_chave,
    ordem: seq,
    nivel: 0,
    tipo: "item",
    texto: `artigo ${seq}`,
    ancora: null,
    quadro_fonte: null,
    ...p,
  };
}

function porCapitulo(itens: ItemBruto[]): Map<string, ItemBruto[]> {
  const m = new Map<string, ItemBruto[]>();
  for (const i of itens) m.set(i.capitulo_chave, [...(m.get(i.capitulo_chave) ?? []), i]);
  return m;
}

const SEM_DADOS: DadosDosQuadros = {
  cargosDoEdital: [],
  nomesDosCargos: new Map(),
  disciplinas: [],
  titulos: [],
  distribuicao: [],
  nomesDasUnidades: new Map(),
  etapas: [],
};

const EC = (id: string, cargo_id: string) => ({
  id,
  cargo_id,
  habilitacao: null,
  vagas_total: null,
  vagas_ampla_concorrencia: null,
  vagas_pcd: null,
  vagas_negros: null,
  vencimento_base: null,
});

describe("resolverMarcadores — a cadeia dos seis marcadores", () => {
  const documento = montarDocumento();
  const ancoras = new Map([["laudo", "8.4"]]);
  const base = {
    documento,
    ancoras,
    anexos: new Map([["conteudo_programatico", "II"]]),
    quadros: new Map([["vagas_ubsf", "III"]]),
  };

  it("resolve capítulo, item, anexo, quadro, campo e redigir no mesmo texto", () => {
    const t = resolverMarcadores(
      "ver {{cap:quadro_de_cargos}} e {{item:laudo}}, Anexo {{anexo:conteudo_programatico}}, " +
        "Quadro {{quadro:vagas_ubsf}}, edital {{campo:numero_edital}}. {{redigir:o objeto}}",
      { ...base, valores: new Map([["numero_edital", "002/2026"]]) },
    );
    expect(t).toBe("ver 2 e 8.4, Anexo II, Quadro III, edital 002/2026. [a redigir: o objeto]");
  });

  it("🔴 um VALOR contendo marcador NÃO vira referência — o campo é resolvido depois", () => {
    const t = resolverMarcadores("{{campo:numero_edital}} {{campo:ano}}", {
      ...base,
      valores: new Map([
        ["numero_edital", "{{item:laudo}}"],
        ["ano", "{{anexo:conteudo_programatico}}"],
      ]),
    });
    expect(t).toBe("{{item:laudo}} {{anexo:conteudo_programatico}}");
  });

  it("o que não resolve fica VISÍVEL; valores ainda não carregados não somem", () => {
    const t = resolverMarcadores(
      "{{cap:nao_existe}} {{item:nada}} {{anexo:abrangencia}} {{quadro:nada}} {{campo:numero_edital}}",
      { ...base, valores: undefined },
    );
    expect(t).toBe("[?nao_existe] [?item:nada] [?anexo:abrangencia] [?quadro:nada] [?campo:numero_edital]");
  });
});

describe("montarEditalCompleto", () => {
  it("só capítulos INCLUÍDOS, na ordem, com o número calculado", () => {
    const doc = montarEditalCompleto({
      documento: montarDocumento(),
      porCapitulo: new Map(),
      valores: new Map(),
      quadros: undefined,
    });
    const chaves = doc.capitulos.map((c) => c.chave);
    // Os dois condicionais nascem desligados e não entram.
    expect(chaves).not.toContain("distribuicao_geografica");
    expect(chaves).not.toContain("prova_de_titulos");
    expect(chaves[0]).toBe("preambulo");
    expect(doc.capitulos[0].numero).toBeNull();
    expect(doc.capitulos.find((c) => c.chave === "quadro_de_cargos")?.numero).toBe(2);
  });

  it("numera item, subitem e alínea; prosa fica sem número; a referência acompanha a âncora", () => {
    const itens = [
      artigo("disposicoes_preliminares", { texto: "primeiro" }),
      artigo("disposicoes_preliminares", { tipo: "prosa", texto: "parágrafo solto" }),
      artigo("disposicoes_preliminares", { texto: "segundo", ancora: "alvo" }),
      artigo("disposicoes_preliminares", { nivel: 1, texto: "sub" }),
      artigo("disposicoes_preliminares", { nivel: 2, texto: "alínea" }),
      artigo("quadro_de_cargos", { texto: "conforme {{item:alvo}}" }),
    ];
    const doc = montarEditalCompleto({
      documento: montarDocumento(),
      porCapitulo: porCapitulo(itens),
      valores: new Map(),
      quadros: undefined,
    });
    const cap1 = doc.capitulos.find((c) => c.chave === "disposicoes_preliminares")!;
    expect(cap1.artigos.map((a) => rotuloDoNumero(a) + a.texto)).toEqual([
      "1.1. primeiro",
      "parágrafo solto",
      "1.2. segundo",
      "1.2.1. sub",
      "a) alínea",
    ]);
    const cap2 = doc.capitulos.find((c) => c.chave === "quadro_de_cargos")!;
    expect(cap2.artigos[0].texto).toBe("conforme 1.2");
  });

  it("ordena pela `ordem` gravada, não pela ordem em que os registros chegaram", () => {
    const a = artigo("disposicoes_preliminares", { ordem: 2, texto: "depois" });
    const b = artigo("disposicoes_preliminares", { ordem: 1, texto: "antes" });
    const doc = montarEditalCompleto({
      documento: montarDocumento(),
      porCapitulo: porCapitulo([a, b]),
      valores: new Map(),
      quadros: undefined,
    });
    const cap = doc.capitulos.find((c) => c.chave === "disposicoes_preliminares")!;
    expect(cap.artigos.map((x) => `${x.numero} ${x.texto}`)).toEqual(["1.1 antes", "1.2 depois"]);
  });

  it("🔴 a numeração do documento montado é a MESMA que o linter enxerga", () => {
    // Liga a territorialidade: todos os capítulos abaixo dela sobem um número. É o caso
    // que separa o Edital 004 dos outros dois.
    const documento = montarDocumento([{ chave: "distribuicao_geografica", incluido: true }]);
    const itens = [
      artigo("distribuicao_geografica", { ancora: "abrangencia" }),
      artigo("vagas_pcd", { ancora: "laudo" }),
      artigo("vagas_pcd", { nivel: 1, ancora: "laudo_prazo" }),
      artigo("prova_objetiva", { nivel: 2, ancora: "alinea_x" }),
    ];
    const pc = porCapitulo(itens);
    const doc = montarEditalCompleto({ documento, porCapitulo: pc, valores: new Map(), quadros: undefined });

    const doLinter = ancorasDoDocumento(
      documento.map((c) => ({ chave: c.chave, numero: c.numero, incluido: c.incluido, itens: pc.get(c.chave) ?? [] })),
    );
    const doDocumento = itens.map((i) => {
      const cap = doc.capitulos.find((c) => c.chave === i.capitulo_chave)!;
      return { ancora: i.ancora, capitulo: cap.chave, numero: cap.artigos.find((a) => a.id === i.id)!.numero };
    });
    expect(doDocumento).toEqual(doLinter);
    expect(doLinter.find((a) => a.ancora === "laudo")?.numero).toBe("8.1");
  });

  it("artigo de capítulo EXCLUÍDO não entra, e a referência a ele fica visível", () => {
    const itens = [
      artigo("prova_de_titulos", { ancora: "titulos" }),
      artigo("disposicoes_preliminares", { texto: "ver {{item:titulos}}" }),
    ];
    const doc = montarEditalCompleto({
      documento: montarDocumento(),
      porCapitulo: porCapitulo(itens),
      valores: new Map(),
      quadros: undefined,
    });
    expect(doc.capitulos.some((c) => c.chave === "prova_de_titulos")).toBe(false);
    expect(doc.capitulos.find((c) => c.chave === "disposicoes_preliminares")!.artigos[0].texto).toBe(
      "ver [?item:titulos]",
    );
  });

  it("quadro: sem dado dos quadros sai `null`; com dado, montado pela fonte", () => {
    const itens = [artigo("quadro_de_cargos", { tipo: "quadro", quadro_fonte: "cargos", texto: "Quadro I" })];
    const entrada = { documento: montarDocumento(), porCapitulo: porCapitulo(itens), valores: new Map() };

    const sem = montarEditalCompleto({ ...entrada, quadros: undefined });
    const comArtigo = (d: typeof sem) => d.capitulos.find((c) => c.chave === "quadro_de_cargos")!.artigos[0];
    expect(comArtigo(sem).quadro).toBeNull();
    // A legenda é numerada: o Quadro I é o item 2.1 no Edital 002.
    expect(comArtigo(sem).numero).toBe("2.1");

    const com = montarEditalCompleto({ ...entrada, quadros: SEM_DADOS });
    expect(comArtigo(com).quadro?.fonte).toBe("cargos");
    expect(comArtigo(com).quadro?.pendencia).toMatch(/Nenhum cargo/);
  });
});

describe("os quadros", () => {
  it("🔴 cada fonte sem linha vira PENDÊNCIA nomeada, nunca tabela vazia", () => {
    for (const fonte of ["cargos", "disciplinas", "titulos", "vagas_por_area", "cronograma"]) {
      const q = montarQuadro(fonte, SEM_DADOS);
      expect(q.linhas).toHaveLength(0);
      expect(q.pendencia, fonte).toMatch(/sairia vazia/);
      // As colunas existem mesmo pendente: quem desenha sabe a forma da tabela que falta.
      expect(q.colunas.length, fonte).toBeGreaterThan(0);
    }
  });

  it("fonte fora do domínio é DITA, não desenhada em branco", () => {
    expect(montarQuadro("inventada", SEM_DADOS).pendencia).toBe("Fonte de quadro desconhecida: inventada.");
  });

  it("Quadro de cargos: nulo vira traço, vencimento em reais, cargo sem nome é dito", () => {
    const q = quadroDeCargos({
      ...SEM_DADOS,
      cargosDoEdital: [
        { ...EC("ec1", "c1"), habilitacao: "Licenciatura", vagas_total: 17, vagas_ampla_concorrencia: 12, vagas_pcd: 2, vagas_negros: 3, vencimento_base: 3036 },
        EC("ec2", "c-fora"),
      ],
      nomesDosCargos: new Map([["c1", "DOCENTE I"]]),
    });
    expect(q.pendencia).toBeNull();
    expect(q.linhas[0].slice(0, 6)).toEqual(["DOCENTE I", "Licenciatura", "17", "12", "2", "3"]);
    expect(q.linhas[0][6].replace(/\s/g, " ")).toBe("R$ 3.036,00");
    expect(q.linhas[1]).toEqual(["(cargo fora do catálogo)", "—", "—", "—", "—", "—", "—"]);
  });

  it("matriz: na ordem do Quadro de Cargos, não na ordem em que as disciplinas chegam", () => {
    const q = matrizDaProva({
      ...SEM_DADOS,
      cargosDoEdital: [EC("ec1", "c1"), EC("ec2", "c2")],
      nomesDosCargos: new Map([["c1", "ENFERMEIRO"], ["c2", "TÉCNICO"]]),
      disciplinas: [
        { id: "d1", edital_cargo_id: "ec2", nome_disciplina: "Português", quantidade_questoes: 10, peso_por_questao: 1 },
        { id: "d2", edital_cargo_id: "ec1", nome_disciplina: "Legislação do SUS", quantidade_questoes: 10, peso_por_questao: 2 },
      ],
    });
    expect(q.linhas).toEqual([
      ["ENFERMEIRO", "Legislação do SUS", "10", "2"],
      ["TÉCNICO", "Português", "10", "1"],
    ]);
  });

  it("títulos: a área sai em negrito e a carga horária só quando declarada", () => {
    const q = quadroDeTitulos({
      ...SEM_DADOS,
      cargosDoEdital: [EC("ec1", "c1")],
      nomesDosCargos: new Map([["c1", "DOCENTE I"]]),
      titulos: [
        { id: "t1", edital_cargo_id: "ec1", nivel: "ESPECIALIZACAO_LATO_SENSU", descricao: "Especialização", area_exigida: "Educação", carga_horaria_minima_horas: 360, pontos_minimo: 2, pontos_maximo: 2 },
        { id: "t2", edital_cargo_id: "ec1", nivel: "MESTRADO_PROFISSIONAL", descricao: "Mestrado", area_exigida: null, carga_horaria_minima_horas: null, pontos_minimo: 4, pontos_maximo: 4 },
      ],
    });
    expect(q.linhas.map((l) => l[1])).toEqual([
      "Especialização — **Educação**, carga horária mínima de 360 horas",
      "Mestrado",
    ]);
  });

  it("vagas por área: reserva ZERO sai em branco, como no Quadro II publicado", () => {
    const dados: DadosDosQuadros = {
      ...SEM_DADOS,
      cargosDoEdital: [EC("ec1", "c1")],
      nomesDosCargos: new Map([["c1", "ACS"]]),
      nomesDasUnidades: new Map([["u1", "UBSF Retiro"]]),
      distribuicao: [
        { id: "v1", edital_cargo_id: "ec1", unidade_lotacao_id: "u1", codigo_inscricao: "ACS 1", vagas_ampla_concorrencia: 3, vagas_pcd: 0, vagas_negros: 0 },
      ],
    };
    expect(vagasPorArea(dados).linhas).toEqual([["UBSF Retiro", "ACS 1", "3", "", ""]]);
  });

  it("vagas por área: o cargo só entra no rótulo quando o edital tem MAIS de um", () => {
    const dados: DadosDosQuadros = {
      ...SEM_DADOS,
      cargosDoEdital: [EC("ec1", "c1"), EC("ec2", "c2")],
      nomesDosCargos: new Map([["c1", "ACS"], ["c2", "ACE"]]),
      nomesDasUnidades: new Map([["u1", "UBSF Retiro"]]),
      distribuicao: [
        { id: "v1", edital_cargo_id: "ec2", unidade_lotacao_id: "u1", codigo_inscricao: null, vagas_ampla_concorrencia: 1, vagas_pcd: 1, vagas_negros: 2 },
      ],
    };
    expect(vagasPorArea(dados).linhas).toEqual([["UBSF Retiro — ACE", "—", "1", "1", "2"]]);
  });

  it("cronograma: o dia da semana POR EXTENSO, e a etapa sem data é dita", () => {
    const q = quadroDoCronograma({
      ...SEM_DADOS,
      etapas: [
        { id: "e1", nome_evento: "Prova objetiva", tipo: "DATA_UNICA", datas: ["2026-09-20"] },
        { id: "e2", nome_evento: "Resultado", tipo: "DATA_UNICA", datas: [] },
      ],
    });
    // O defeito de 18/09: o quadro saía "20/09/2026 (0)".
    expect(q.linhas[0]).toEqual(["Prova objetiva", "20/09/2026 (domingo)"]);
    expect(q.linhas[1]).toEqual(["Resultado", "— sem data"]);
  });
});

describe("os ANEXOS no documento montado", () => {
  const cargos = {
    ...SEM_DADOS,
    cargosDoEdital: [EC("ec1", "c1"), EC("ec2", "c2")],
    nomesDosCargos: new Map([["c1", "ENFERMEIRO"], ["c2", "TÉCNICO"], ["c9", "ARTE"]]),
  };
  const ementa = (id: string, ordem: number, cargo_id: string | null, nome: string) => ({
    id, ordem, cargo_id, aplica_a_todos_os_cargos: cargo_id === null, nome_disciplina: nome, texto_ementa: `ementa de ${nome}`,
  });

  it("saem DEPOIS dos capítulos, numerados — e sem dado, numerados mas sem conteúdo", () => {
    const doc = montarEditalCompleto({
      documento: montarDocumento(),
      porCapitulo: new Map(),
      valores: new Map(),
      quadros: undefined,
    });
    expect(doc.anexos).toEqual([
      { chave: "conteudo_programatico", numero: "I", titulo: "Conteúdos programáticos", conteudo: null, abrangencia: null, pendencia: null },
    ]);
  });

  it("conteúdo: comuns primeiro, depois cada cargo na ordem do Quadro I; cargo de fora vai para o fim, NÃO some", () => {
    const doc = montarEditalCompleto({
      documento: montarDocumento(),
      porCapitulo: new Map(),
      valores: new Map(),
      quadros: cargos,
      anexos: {
        abrangencia: [],
        ementas: [
          ementa("e1", 3, "c2", "Técnicas"),
          ementa("e2", 1, null, "Português"),
          ementa("e3", 2, "c9", "Desenho"),
          ementa("e4", 0, "c1", "SUS"),
        ],
      },
    });
    const conteudo = doc.anexos.find((a) => a.chave === "conteudo_programatico")!.conteudo!;
    expect(conteudo.map((b) => [b.cargo, b.disciplinas.map((x) => x.nome)])).toEqual([
      [null, ["Português"]],
      ["ENFERMEIRO", ["SUS"]],
      ["TÉCNICO", ["Técnicas"]],
      ["ARTE", ["Desenho"]],
    ]);
  });

  it("🔴 anexo sem nenhuma linha vira PENDÊNCIA nomeada, nunca um anexo em branco", () => {
    const doc = montarEditalCompleto({
      documento: montarDocumento([{ chave: "distribuicao_geografica", incluido: true }]),
      porCapitulo: new Map(),
      valores: new Map(),
      quadros: cargos,
      anexos: { ementas: [], abrangencia: [] },
    });
    expect(doc.anexos.map((a) => [a.numero, a.chave, a.pendencia])).toEqual([
      ["I", "abrangencia", "Nenhum logradouro importado nas áreas de abrangência — o anexo sairia vazio."],
      ["II", "conteudo_programatico", "Nenhuma ementa cadastrada no conteúdo programático — o anexo sairia vazio."],
    ]);
  });

  it("abrangência: unidades na ordem da distribuição de vagas, ruas por bairro; unidade sem vaga vai para o fim", () => {
    const dados: DadosDosQuadros = {
      ...cargos,
      nomesDasUnidades: new Map([["u1", "UBSF Retiro"], ["u2", "UBSF Aterrado"], ["u3", "UBS Açude"]]),
      distribuicao: [
        { id: "v1", edital_cargo_id: "ec1", unidade_lotacao_id: "u2", codigo_inscricao: null, vagas_ampla_concorrencia: 1, vagas_pcd: 0, vagas_negros: 0 },
        { id: "v2", edital_cargo_id: "ec1", unidade_lotacao_id: "u1", codigo_inscricao: null, vagas_ampla_concorrencia: 1, vagas_pcd: 0, vagas_negros: 0 },
      ],
    };
    const linha = (id: string, u: string, ordem: number, bairro: string | null, logradouro: string) =>
      ({ id, unidade_lotacao_id: u, ordem, bairro, logradouro });
    const doc = montarEditalCompleto({
      documento: montarDocumento([{ chave: "distribuicao_geografica", incluido: true }]),
      porCapitulo: new Map(),
      valores: new Map(),
      quadros: dados,
      anexos: {
        ementas: [],
        abrangencia: [
          linha("l1", "u1", 0, "Retiro", "Rua A"),
          linha("l2", "u1", 1, "Retiro", "Rua B"),
          linha("l3", "u1", 2, null, "Rua C"),
          linha("l4", "u3", 0, null, "Rua D"),
          linha("l5", "u2", 0, "Aterrado", "Rua E"),
        ],
      },
    });
    expect(doc.anexos[0].abrangencia).toEqual([
      { unidade: "UBSF Aterrado", secoes: [{ bairro: "Aterrado", logradouros: ["Rua E"] }] },
      { unidade: "UBSF Retiro", secoes: [{ bairro: "Retiro", logradouros: ["Rua A", "Rua B"] }, { bairro: null, logradouros: ["Rua C"] }] },
      { unidade: "UBS Açude", secoes: [{ bairro: null, logradouros: ["Rua D"] }] },
    ]);
  });

  it("o número do quadro sai mesmo SEM o dado da tabela, e a referência a ele resolve", () => {
    const itens = [
      artigo("quadro_de_cargos", { tipo: "quadro", quadro_fonte: "cargos", texto: "Cargos", ancora: "quadro_cargos" }),
      artigo("prova_objetiva", { tipo: "quadro", quadro_fonte: "disciplinas", texto: "Matriz", ancora: "matriz" }),
      artigo("disposicoes_preliminares", { texto: "conforme Quadro {{quadro:matriz}} e Anexo {{anexo:conteudo_programatico}}" }),
    ];
    const doc = montarEditalCompleto({
      documento: montarDocumento(),
      porCapitulo: porCapitulo(itens),
      valores: new Map(),
      quadros: undefined,
    });
    const artigos = doc.capitulos.flatMap((c) => c.artigos);
    expect(artigos.filter((a) => a.tipo === "quadro").map((a) => [a.texto, a.numeroDoQuadro])).toEqual([
      ["Cargos", "I"],
      ["Matriz", "II"],
    ]);
    expect(artigos.find((a) => a.tipo === "item")!.texto).toBe("conforme Quadro II e Anexo I");
    expect(artigos.find((a) => a.tipo === "item")!.numeroDoQuadro).toBeNull();
  });
});
