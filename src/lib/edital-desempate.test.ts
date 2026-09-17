/**
 * Critérios de desempate.
 *
 * ⭐ O controle positivo são as TRÊS ordens publicadas, e elas diferem de verdade — o 002
 * tem 5 critérios (com títulos), o 003 e o 004 têm 4, e a 2ª e 3ª posições mudam em cada
 * um. É isso que prova que o modelo descreve os três sem caso especial.
 *
 * 🔴 E nada aqui desempata candidato. O módulo descreve o critério; quem o aplica é a
 * correção da prova, que é outro módulo e não existe.
 */
import { describe, it, expect } from "vitest";
import {
  conferirDesempate,
  rotuloDoCriterio,
  chaveDeDisciplina,
  TIPOS_DE_CRITERIO,
  type Criterio,
} from "@/lib/edital-desempate";

let seq = 0;
const c = (
  ordem: number, tipo: string, disciplina: string | null = null,
  lista: "GERAL" | "PCD" = "GERAL",
): Criterio => ({
  id: `c${seq++}`, lista, ordem_prioridade: ordem, criterio_tipo: tipo,
  disciplina_referencia: disciplina, cargo_id: null, aplica_a_todos_os_cargos: true,
});

/** A ordem do Edital 002, item 14.5.1 — a única com prova de títulos. */
const ORDEM_002: Criterio[] = [
  c(1, "IDADE_60_MAIS"),
  c(2, "FUNCAO_JURADO"),
  c(3, "PONTUACAO_DISCIPLINA", "Conhecimentos Específicos"),
  c(4, "PONTUACAO_DISCIPLINA", "Conhecimentos Pedagógicos"),
  c(5, "PONTUACAO_DISCIPLINA", "Língua Portuguesa"),
  c(6, "MAIOR_PONTOS_TITULOS"),
  c(7, "MAIOR_IDADE"),
];
const DISCIPLINAS_002 = ["Língua Portuguesa", "Conhecimentos Pedagógicos", "Conhecimentos Específicos"];

/** A ordem do Edital 003, item 13.5.1. */
const ORDEM_003: Criterio[] = [
  c(1, "IDADE_60_MAIS"),
  c(2, "FUNCAO_JURADO"),
  c(3, "PONTUACAO_DISCIPLINA", "Conhecimentos Específicos"),
  c(4, "PONTUACAO_DISCIPLINA", "Legislação do SUS"),
  c(5, "PONTUACAO_DISCIPLINA", "Língua Portuguesa"),
  c(6, "MAIOR_IDADE"),
];
const DISCIPLINAS_003 = ["Língua Portuguesa", "Legislação do SUS", "Conhecimentos Específicos"];

/** A ordem do Edital 004, item 14.5.1 — a 2ª e 3ª posições diferem das outras duas. */
const ORDEM_004: Criterio[] = [
  c(1, "IDADE_60_MAIS"),
  c(2, "FUNCAO_JURADO"),
  c(3, "PONTUACAO_DISCIPLINA", "Conhecimentos Específicos"),
  c(4, "PONTUACAO_DISCIPLINA", "Língua Portuguesa"),
  c(5, "PONTUACAO_DISCIPLINA", "Matemática"),
  c(6, "MAIOR_IDADE"),
];
const DISCIPLINAS_004 = ["Língua Portuguesa", "Matemática", "Conhecimentos Específicos"];

/** A lista de PCD, idêntica nos três (Leis Municipais 3.113/94 e 3.221/95). */
const PCD: Criterio[] = [
  c(1, "ARRIMO_FAMILIA", null, "PCD"),
  c(2, "MAIS_DEPENDENTES_ATE_21", null, "PCD"),
  c(3, "SEM_FONTE_DE_RENDA", null, "PCD"),
];

const regras = (e: Parameters<typeof conferirDesempate>[0]) =>
  conferirDesempate(e).map((a) => a.regra);

describe("⭐ CONTROLE POSITIVO: as três ordens publicadas", () => {
  it("🎯 as três saem do MESMO código, sem caso especial", () => {
    // É o teste do desenho, antes de ser teste de código: se alguma das três exigisse um
    // `if` próprio, o modelo estaria errado.
    expect(conferirDesempate({
      criterios: [...ORDEM_002, ...PCD], disciplinasDaProva: DISCIPLINAS_002, temProvaDeTitulos: true,
    })).toEqual([]);
    expect(conferirDesempate({
      criterios: [...ORDEM_003, ...PCD], disciplinasDaProva: DISCIPLINAS_003, temProvaDeTitulos: false,
    })).toEqual([]);
    expect(conferirDesempate({
      criterios: [...ORDEM_004, ...PCD], disciplinasDaProva: DISCIPLINAS_004, temProvaDeTitulos: false,
    })).toEqual([]);
  });

  it("🔴 e elas DIFEREM de verdade — não é a mesma lista três vezes", () => {
    // Se as três fossem iguais, o caso acima não provaria nada.
    expect(ORDEM_002).toHaveLength(7);
    expect(ORDEM_003).toHaveLength(6);
    expect(ORDEM_002.map((x) => x.disciplina_referencia).filter(Boolean))
      .not.toEqual(ORDEM_004.map((x) => x.disciplina_referencia).filter(Boolean));
  });

  it("⭐ CONTROLE: edital sem critério nenhum não acusa", () => {
    // Capítulo ainda não preenchido é estado legítimo.
    expect(conferirDesempate({
      criterios: [], disciplinasDaProva: DISCIPLINAS_002, temProvaDeTitulos: false,
    })).toEqual([]);
  });
});

describe("🔴 ordem com buraco — o que o banco NÃO garante", () => {
  it("🎯 acusa 1º, 2º, 4º", () => {
    // O índice único impede duas na mesma posição; não impede o degrau. Uma ordem com
    // buraco faz quem lê supor que um critério foi omitido.
    const a = conferirDesempate({
      criterios: [c(1, "IDADE_60_MAIS"), c(2, "FUNCAO_JURADO"), c(4, "MAIOR_IDADE")],
      disciplinasDaProva: DISCIPLINAS_002, temProvaDeTitulos: false,
    });
    expect(a.map((x) => x.regra)).toEqual(["ordem-com-buraco"]);
    expect(a[0].severidade).toBe("erro");
    expect(a[0].mensagem).toContain("1º, 2º, 4º");
  });

  it("acusa a lista de PCD separadamente da geral", () => {
    const a = conferirDesempate({
      criterios: [...ORDEM_003, c(1, "ARRIMO_FAMILIA", null, "PCD"), c(3, "SEM_FONTE_DE_RENDA", null, "PCD")],
      disciplinasDaProva: DISCIPLINAS_003, temProvaDeTitulos: false,
    });
    expect(a.map((x) => x.regra)).toEqual(["ordem-com-buraco"]);
    expect(a[0].mensagem).toContain("de PCD");
  });

  it("⭐ CONTROLE NEGATIVO: as duas listas numeram a partir de 1 CADA UMA", () => {
    // Geral 1..6 e PCD 1..3 convivem — se a regra somasse as duas, os três editais reais
    // acusariam.
    expect(regras({
      criterios: [...ORDEM_003, ...PCD], disciplinasDaProva: DISCIPLINAS_003, temProvaDeTitulos: false,
    })).toEqual([]);
  });
});

describe("a disciplina do critério", () => {
  it("🎯 acusa disciplina que a matriz da prova não conhece", () => {
    // Mesma classe do "LESGISLAÇÃO DO SUS" da fatia 10 — e aqui é pior: um critério de
    // desempate inaplicável é o que mais vira processo.
    const a = conferirDesempate({
      criterios: [c(1, "PONTUACAO_DISCIPLINA", "Legislação do SUS"), c(2, "MAIOR_IDADE")],
      disciplinasDaProva: DISCIPLINAS_004, temProvaDeTitulos: false,
    });
    expect(a.map((x) => x.regra)).toEqual(["disciplina-fora-da-matriz"]);
    expect(a[0].mensagem).toContain("Legislação do SUS");
    expect(a[0].mensagem).toContain("1º critério");
  });

  it("🔴 CONTROLE NEGATIVO: acento e caixa diferentes NÃO acusam", () => {
    expect(regras({
      criterios: [c(1, "PONTUACAO_DISCIPLINA", "LEGISLACAO DO SUS"), c(2, "MAIOR_IDADE")],
      disciplinasDaProva: DISCIPLINAS_003, temProvaDeTitulos: false,
    })).toEqual([]);
  });

  it("⭐ CONTROLE: sem matriz preenchida, não há o que cruzar", () => {
    // A fatia 5 pode não estar preenchida ainda. Acusar todos os critérios seria acusar a
    // ordem em que o usuário decidiu trabalhar.
    expect(regras({
      criterios: ORDEM_002, disciplinasDaProva: [], temProvaDeTitulos: true,
    })).toEqual([]);
  });
});

describe("títulos e o critério final", () => {
  it("🎯 acusa desempate por títulos num edital sem prova de títulos", () => {
    // Só o Edital 002 tem os dois. Um sem o outro é um capítulo contradizendo outro.
    const a = conferirDesempate({
      criterios: ORDEM_002, disciplinasDaProva: DISCIPLINAS_002, temProvaDeTitulos: false,
    });
    expect(a.map((x) => x.regra)).toEqual(["titulos-no-desempate-sem-prova-de-titulos"]);
    expect(a[0].severidade).toBe("erro");
  });

  it("⭐ CONTROLE NEGATIVO: com a prova de títulos ligada, não acusa", () => {
    expect(regras({
      criterios: ORDEM_002, disciplinasDaProva: DISCIPLINAS_002, temProvaDeTitulos: true,
    })).toEqual([]);
  });

  it("🎯 acusa lista que não termina em maior idade, como AVISO", () => {
    // Os três terminam assim porque é o único critério que nunca empata. Mas o edital
    // pode publicar diferente — por isso aviso, não erro.
    const a = conferirDesempate({
      criterios: [c(1, "IDADE_60_MAIS"), c(2, "FUNCAO_JURADO")],
      disciplinasDaProva: DISCIPLINAS_002, temProvaDeTitulos: false,
    });
    expect(a.map((x) => x.regra)).toEqual(["sem-criterio-final"]);
    expect(a[0].severidade).toBe("aviso");
    expect(a[0].mensagem).toContain("jurado");
  });

  it("⚠️ a lista só de PCD não é cobrada de terminar em maior idade", () => {
    // "Maior idade" nem pertence à lista de PCD — o banco recusa (CASO 5b da bateria).
    expect(regras({
      criterios: PCD, disciplinasDaProva: DISCIPLINAS_002, temProvaDeTitulos: false,
    })).toEqual([]);
  });
});

describe("os tipos e seus rótulos", () => {
  it("cada tipo pertence a UMA lista — o banco também separa", () => {
    const geral = TIPOS_DE_CRITERIO.filter((t) => t.lista === "GERAL").map((t) => t.tipo);
    const pcd = TIPOS_DE_CRITERIO.filter((t) => t.lista === "PCD").map((t) => t.tipo);
    expect(geral).toHaveLength(5);
    expect(pcd).toHaveLength(3);
    expect(geral.filter((t) => pcd.includes(t))).toEqual([]);
  });

  it("só um tipo exige disciplina", () => {
    expect(TIPOS_DE_CRITERIO.filter((t) => t.exigeDisciplina).map((t) => t.tipo))
      .toEqual(["PONTUACAO_DISCIPLINA"]);
  });

  it("⚠️ tipo desconhecido sai CRU, não some", () => {
    expect(rotuloDoCriterio("MAIOR_IDADE")).toBe("Maior idade — data de nascimento");
    expect(rotuloDoCriterio("TIPO_NOVO")).toBe("TIPO_NOVO");
  });

  it("chaveDeDisciplina normaliza acento, caixa e espaço", () => {
    expect(chaveDeDisciplina("Legislação do SUS")).toBe(chaveDeDisciplina("LEGISLACAO  DO SUS"));
  });
});
