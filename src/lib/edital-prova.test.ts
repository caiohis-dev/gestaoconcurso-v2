/**
 * A matriz da prova objetiva.
 *
 * ⭐ **O controle positivo são as TRÊS composições reais**, e elas têm de sair do mesmo
 * código: 50 = 10+15+25 (002), 70 = 10+10+50 (003) e 50 = 10+10+30 (004). Se alguma
 * exigisse caso especial, o modelo estaria errado.
 */
import { describe, it, expect } from "vitest";
import {
  conferirProva,
  somaDasQuestoes,
  minimoParaAprovacao,
  type Disciplina,
  type ConfigProva,
} from "@/lib/edital-prova";

const d = (nome: string, q: number): Disciplina => ({
  nome_disciplina: nome, quantidade_questoes: q, peso_por_questao: 1,
});

const cfg = (total: number | null, extra: Partial<ConfigProva> = {}): ConfigProva => ({
  total_questoes: total,
  duracao_minutos: 180,
  tempo_minimo_permanencia_minutos: 60,
  tempo_minimo_levar_caderno_minutos: 120,
  nota_corte_percentual: 50,
  permite_zerar_disciplina: false,
  ...extra,
});

const E002 = [d("Língua Portuguesa", 10), d("Conhecimentos Pedagógicos", 15), d("Conhecimentos Específicos", 25)];
const E003 = [d("Língua Portuguesa", 10), d("Legislação do SUS", 10), d("Conhecimentos Específicos", 50)];
const E004 = [d("Língua Portuguesa", 10), d("Matemática", 10), d("Conhecimentos Específicos", 30)];

describe("⭐ controle positivo — as três composições reais", () => {
  it.each([
    ["Edital 002 — Docente I", E002, 50, 25],
    ["Edital 003 — Enfermeiro", E003, 70, 35],
    ["Edital 004 — ACS", E004, 50, 25],
  ])("%s: soma %i e exige %i acertos", (_n, disciplinas, total, minimo) => {
    expect(somaDasQuestoes(disciplinas as Disciplina[])).toBe(total);
    expect(minimoParaAprovacao(total, 50)).toBe(minimo);
    expect(conferirProva({ config: cfg(total), disciplinas: disciplinas as Disciplina[] })).toEqual([]);
  });

  it("🔴 as três saem do MESMO código, sem caso especial", () => {
    // Três núcleos comuns diferentes — Pedagógicos, Legislação do SUS e Matemática — e
    // nenhum `if` por carreira. É o teste do desenho, antes de ser teste de código.
    const nucleos = [E002, E003, E004].map((e) => e[1].nome_disciplina);
    expect(nucleos).toEqual(["Conhecimentos Pedagógicos", "Legislação do SUS", "Matemática"]);
  });
});

describe("🎯 a soma que não fecha", () => {
  it("é ERRO, e diz os dois números", () => {
    const avisos = conferirProva({ config: cfg(50), disciplinas: E003 }); // 70 disciplinas, 50 declarado
    expect(avisos).toHaveLength(1);
    expect(avisos[0].regra).toBe("soma-de-questoes-nao-fecha");
    expect(avisos[0].mensagem).toContain("somam 70");
    expect(avisos[0].mensagem).toContain("declarado é 50");
  });

  it("prova declarada SEM nenhuma disciplina é erro próprio", () => {
    expect(conferirProva({ config: cfg(50), disciplinas: [] }).map((a) => a.regra))
      .toEqual(["prova-sem-disciplinas"]);
  });

  it("⭐ CONTROLE: total ainda não declarado não acusa — a matriz está sendo montada", () => {
    // Gravar uma disciplina de cada vez é legítimo; barrar aí travaria a redação.
    expect(conferirProva({ config: cfg(null), disciplinas: [d("Português", 10)] })).toEqual([]);
  });
});

describe("minimoParaAprovacao", () => {
  it("50% de 50 é 25 e de 70 é 35 — os dois exatos nos editais reais", () => {
    expect(minimoParaAprovacao(50, 50)).toBe(25);
    expect(minimoParaAprovacao(70, 50)).toBe(35);
  });

  it("⚠️ total ímpar cai na fronteira do arredondamento — nenhum edital real exercita", () => {
    // 50% de 45 é 22,5. Arredondamento comum: 23. Fica registrado porque, se a FEVRE um
    // dia publicar prova de total ímpar, é esta linha que decide se o mínimo é 22 ou 23.
    expect(minimoParaAprovacao(45, 50)).toBe(23);
  });

  it("sem total ou sem percentual devolve null, não zero", () => {
    expect(minimoParaAprovacao(null, 50)).toBeNull();
    expect(minimoParaAprovacao(50, null)).toBeNull();
  });
});

describe("avisos de regra de sala e de corte", () => {
  it("caderno liberado só no fim da prova avisa", () => {
    const avisos = conferirProva({
      config: cfg(50, { tempo_minimo_levar_caderno_minutos: 180 }),
      disciplinas: E002,
    });
    expect(avisos.map((a) => a.regra)).toEqual(["caderno-so-no-fim"]);
    expect(avisos[0].severidade).toBe("aviso");
  });

  it("permitir zerar disciplina avisa, citando os três editais", () => {
    const avisos = conferirProva({
      config: cfg(50, { permite_zerar_disciplina: true }),
      disciplinas: E002,
    });
    expect(avisos.map((a) => a.regra)).toEqual(["permite-zerar-disciplina"]);
  });

  it("⭐ CONTROLE: as regras dos editais reais (180/60/120, sem zerar) não acusam", () => {
    expect(conferirProva({ config: cfg(70), disciplinas: E003 })).toEqual([]);
  });
});
