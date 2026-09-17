/**
 * A prova de títulos — a soma contra o teto e o prazo derivado do cronograma.
 *
 * ⭐ O controle positivo são os **Quadros III e IV do Edital 002/2026**, o único dos três
 * de referência com esta etapa. Os dois somam exatamente 12, que é o teto publicado.
 *
 * ⚠️ Cada regra tem o seu CONTROLE NEGATIVO ao lado: provar que acusa é metade; a outra é
 * provar que não acusa o quadro legítimo.
 */
import { describe, it, expect } from "vitest";
import {
  conferirTitulos,
  somaDosPontos,
  dataLimiteDeConclusao,
  rotuloDoNivel,
  type TituloItem,
  type ConfigTitulos,
} from "@/lib/edital-titulos";

const titulo = (p: Partial<TituloItem> & { pontos_maximo: number }): TituloItem => ({
  nivel: "ESPECIALIZACAO_LATO_SENSU",
  descricao: "Diploma com histórico escolar.",
  area_exigida: null,
  carga_horaria_minima_horas: null,
  pontos_minimo: p.pontos_maximo,
  ...p,
});

/** O Quadro III publicado, item a item. */
const QUADRO_III: TituloItem[] = [
  titulo({
    nivel: "MESTRADO_PROFISSIONAL",
    area_exigida: "Área do Componente Curricular a que concorre",
    pontos_maximo: 5,
  }),
  titulo({ area_exigida: "Tecnologias Digitais na Educação", carga_horaria_minima_horas: 360, pontos_maximo: 4 }),
  titulo({ area_exigida: "Educação Inclusiva", carga_horaria_minima_horas: 360, pontos_maximo: 3 }),
];

/** O Quadro IV publicado. Mesmos pontos, áreas diferentes. */
const QUADRO_IV: TituloItem[] = [
  titulo({ nivel: "MESTRADO_PROFISSIONAL", area_exigida: "Docência na Educação Básica", pontos_maximo: 5 }),
  titulo({ area_exigida: "Alfabetização e Letramento em Educação Infantil", carga_horaria_minima_horas: 360, pontos_maximo: 4 }),
  titulo({ area_exigida: "Educação Inclusiva", carga_horaria_minima_horas: 360, pontos_maximo: 3 }),
];

/** As regras gerais do item 13 do Edital 002. */
const CONFIG_002: ConfigTitulos = {
  teto_maximo_pontos: 12,
  carater_classificatorio: true,
  exige_historico_escolar: true,
  exige_reconhecimento_mec_cne: true,
  dias_conclusao_antes_fim_inscricoes: 30,
  exige_traducao_juramentada: true,
  exige_revalidacao_diploma_estrangeiro: true,
};

const regras = (itens: TituloItem[], config: ConfigTitulos | null = CONFIG_002) =>
  conferirTitulos({ config, itens }).map((a) => a.regra);

describe("⭐ CONTROLE POSITIVO: os Quadros III e IV do Edital 002/2026", () => {
  it("os dois somam exatamente os 12 pontos publicados", () => {
    expect(somaDosPontos(QUADRO_III)).toBe(12);
    expect(somaDosPontos(QUADRO_IV)).toBe(12);
  });

  it("🔴 e nenhum dos dois acusa nada — se acusassem, todo o resto deste arquivo é ruído", () => {
    expect(conferirTitulos({ config: CONFIG_002, itens: QUADRO_III })).toEqual([]);
    expect(conferirTitulos({ config: CONFIG_002, itens: QUADRO_IV })).toEqual([]);
  });

  it("saem do MESMO código, sem caso especial por cargo", () => {
    // É o teste do desenho, antes de ser teste de código: se o Quadro IV precisasse de um
    // `if` próprio, o modelo estaria errado — mesma prova que a fatia 5 faz com as três
    // composições de prova.
    for (const q of [QUADRO_III, QUADRO_IV]) {
      expect(conferirTitulos({ config: CONFIG_002, itens: q })).toEqual([]);
    }
  });
});

describe("a soma contra o teto", () => {
  it("🎯 acusa como ERRO quando os títulos somam mais que o teto", () => {
    const avisos = conferirTitulos({
      config: CONFIG_002,
      itens: [...QUADRO_III, titulo({ nivel: "DOUTORADO", pontos_maximo: 6 })],
    });
    expect(avisos.map((a) => a.regra)).toEqual(["titulos-acima-do-teto"]);
    expect(avisos[0].severidade).toBe("erro");
    expect(avisos[0].mensagem).toContain("18");
    expect(avisos[0].mensagem).toContain("12");
  });

  it("acusa teto INATINGÍVEL como aviso, não erro", () => {
    // Estado intermediário legítimo enquanto se monta o quadro. Nos dois quadros reais a
    // soma bate exata, então a divergência merece ser vista — mas não barra.
    const avisos = conferirTitulos({ config: CONFIG_002, itens: QUADRO_III.slice(0, 2) });
    expect(avisos.map((a) => a.regra)).toEqual(["titulos-teto-inatingivel"]);
    expect(avisos[0].severidade).toBe("aviso");
  });

  it("🎯 acusa quadro COM títulos e SEM teto declarado", () => {
    expect(regras(QUADRO_III, { ...CONFIG_002, teto_maximo_pontos: null })).toEqual([
      "titulos-sem-teto",
    ]);
    expect(regras(QUADRO_III, null)).toEqual(["titulos-sem-teto"]);
  });

  it("⭐ CONTROLE NEGATIVO: cargo SEM título nenhum não acusa nada", () => {
    // É como o item 13.2 ("a pontuação só ocorrerá para Docente I e Docente II") acontece:
    // o cargo sem títulos simplesmente não tem quadro. Acusar encheria o painel com todos
    // os cargos do edital que não têm esta fase.
    expect(conferirTitulos({ config: null, itens: [] })).toEqual([]);
    expect(conferirTitulos({ config: CONFIG_002, itens: [] })).toEqual([]);
  });

  it("nomeia o CARGO na mensagem — o teto é do edital e o quadro é do cargo", () => {
    const avisos = conferirTitulos({
      config: CONFIG_002,
      itens: [titulo({ pontos_maximo: 99 })],
      rotuloDoCargo: "Docente I – Arte",
    });
    expect(avisos[0].mensagem).toContain("Docente I – Arte");
  });

  it("⚠️ CONTROLE NEGATIVO: um título de faixa (mín < máx) conta pelo MÁXIMO", () => {
    // O banco permite mín < máx e nenhum edital real o usa (CASO 3b da bateria). Aqui se
    // fixa o que a soma faz nesse caso: o pior cenário para o teto é o máximo.
    expect(somaDosPontos([titulo({ pontos_minimo: 2, pontos_maximo: 6 })])).toBe(6);
  });
});

describe("a data-limite de conclusão — derivada, nunca digitada", () => {
  it("🎯 30 dias antes do fim das inscrições do Edital 002 (08/06/2026)", () => {
    expect(dataLimiteDeConclusao("2026-06-08", 30)).toBe("2026-05-09");
  });

  it("🔴 atravessa a virada de MÊS e de ANO sem erro de aritmética", () => {
    expect(dataLimiteDeConclusao("2026-03-05", 30)).toBe("2026-02-03");
    expect(dataLimiteDeConclusao("2026-01-15", 30)).toBe("2025-12-16");
  });

  it("🔴 não perde um dia por FUSO — a conta é ao meio-dia, de propósito", () => {
    // `new Date('2026-06-08')` é UTC; lido em fuso negativo volta para 07/06, e o
    // resultado sairia um dia antes. Com 0 dias, a data-limite é o próprio dia.
    expect(dataLimiteDeConclusao("2026-06-08", 0)).toBe("2026-06-08");
  });

  it("devolve null quando falta qualquer das duas pontas", () => {
    // Sem o cronograma preenchido (fatia 3) não há de onde derivar, e inventar uma data
    // seria pior que não mostrar nenhuma.
    expect(dataLimiteDeConclusao(null, 30)).toBeNull();
    expect(dataLimiteDeConclusao("2026-06-08", null)).toBeNull();
    expect(dataLimiteDeConclusao("data ruim", 30)).toBeNull();
  });
});

describe("rótulos dos níveis", () => {
  it("traduz os quatro do domínio", () => {
    expect(rotuloDoNivel("MESTRADO_PROFISSIONAL")).toBe("Mestrado profissional");
    expect(rotuloDoNivel("ESPECIALIZACAO_LATO_SENSU")).toBe("Especialização (lato sensu)");
  });

  it("⚠️ valor desconhecido sai CRU, não some", () => {
    // Se um dia o domínio do banco crescer e este mapa não acompanhar, a tela mostra o
    // valor bruto em vez de uma célula vazia — perda silenciosa é o que este repo evita.
    expect(rotuloDoNivel("POS_DOUTORADO")).toBe("POS_DOUTORADO");
  });
});
