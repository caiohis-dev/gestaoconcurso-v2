/**
 * O cronograma do certame.
 *
 * ⭐ **O controle positivo é o cronograma REAL do Edital 003/2026** — as 16 etapas com as
 * datas como publicadas. Ele tem de passar sem um único aviso; se acusar, a regra é que
 * está errada, não o edital.
 *
 * 🔴 E ele carrega o caso que mais importa: **a prova cai num DOMINGO (20/09/2026)**, e é
 * a única data de fim de semana do documento. A regra tem de deixá-la passar.
 */
import { describe, it, expect } from "vitest";
import {
  conferirCronograma,
  ehFimDeSemana,
  diaDaSemana,
  primeiraData,
  ultimaData,
  ETAPAS_SUGERIDAS,
  type EtapaCronograma,
} from "@/lib/edital-cronograma";

const etapa = (
  chave: string | null,
  nome: string,
  tipo: EtapaCronograma["tipo"],
  datas: string[],
  ordem = 0,
): EtapaCronograma => ({ chave, nome_evento: nome, tipo, datas, ordem });

/** O cronograma do Edital 003/2026, como publicado. */
const EDITAL_003: EtapaCronograma[] = [
  etapa("inscricoes", "Inscrições", "INTERVALO", ["2026-06-29", "2026-07-27"], 1),
  etapa("pagamento_boleto", "Pagamento do boleto", "DATA_UNICA", ["2026-07-28"], 2),
  etapa("entrega_isencao", "Entrega do formulário de isenção", "DATA_UNICA", ["2026-07-08"], 3),
  etapa("resultado_isencao", "Resultado da análise de isenção", "DATA_UNICA", ["2026-07-14"], 4),
  etapa("retirada_atestado_pcd", "Retirada do atestado médico", "ALTERNATIVAS",
        ["2026-07-06", "2026-07-09", "2026-07-13", "2026-07-16", "2026-07-20"], 5),
  etapa("entrega_atestado_pcd", "Entrega do atestado médico", "ALTERNATIVAS", ["2026-07-27", "2026-07-28"], 6),
  etapa("entrega_declaracao_jurado", "Entrega da declaração de jurado", "DATA_UNICA", ["2026-07-24"], 7),
  etapa("confirmacao_inscricao", "Confirmação da inscrição", "DATA_UNICA", ["2026-08-05"], 8),
  etapa("recurso_inscricao", "Recurso da inscrição", "DATA_UNICA", ["2026-08-06"], 9),
  etapa("decisao_recurso_inscricao", "Decisão do recurso de inscrição", "DATA_UNICA", ["2026-08-11"], 10),
  etapa("comprovante_local_prova", "Comprovante de local de prova", "DATA_UNICA", ["2026-09-16"], 11),
  etapa("prova_objetiva", "Prova objetiva", "DATA_UNICA", ["2026-09-20"], 12),
  etapa("divulgacao_gabarito", "Divulgação do gabarito", "DATA_UNICA", ["2026-09-20"], 13),
  etapa("recurso_gabarito", "Recebimento dos recursos ao gabarito", "DATA_UNICA", ["2026-09-21"], 14),
  etapa("resultado_preliminar", "Resultado preliminar", "DATA_UNICA", ["2026-10-05"], 15),
  etapa("vista_folha_respostas", "Vista da folha de respostas", "DATA_UNICA", ["2026-10-06"], 16),
];

const regras = (e: EtapaCronograma[]) => conferirCronograma(e).map((a) => a.regra);

describe("⭐ controle positivo — o cronograma real do Edital 003/2026", () => {
  it("passa SEM NENHUM aviso", () => {
    // Se este caso acusar, a regra está errada — não o edital publicado.
    expect(conferirCronograma(EDITAL_003)).toEqual([]);
  });

  it("🔴 a prova num DOMINGO não gera aviso — é o caso normal", () => {
    // 20/09/2026 é domingo, e é a única data de fim de semana do documento inteiro.
    expect(ehFimDeSemana("2026-09-20")).toBe(true);
    expect(regras(EDITAL_003)).not.toContain("etapa-em-fim-de-semana");
  });

  it("⚠️ mas QUALQUER OUTRA etapa em fim de semana avisa", () => {
    const comSabado = EDITAL_003.map((e) =>
      e.chave === "recurso_gabarito" ? { ...e, datas: ["2026-09-26"] } : e,
    );
    expect(ehFimDeSemana("2026-09-26")).toBe(true); // sábado
    expect(regras(comSabado)).toContain("etapa-em-fim-de-semana");
  });
});

describe("dia da semana sem armadilha de fuso", () => {
  it("🔴 não usa `new Date`, que devolveria o dia ANTERIOR em fuso negativo", () => {
    // `new Date("2026-09-20").getDay()` é UTC: no Brasil daria sábado, não domingo. É o
    // bug clássico de data neste país, e o motivo de a conta ser feita sobre os números.
    expect(diaDaSemana("2026-09-20")).toBe(0); // domingo
    expect(diaDaSemana("2026-09-21")).toBe(1); // segunda
    expect(diaDaSemana("2026-09-26")).toBe(6); // sábado
  });

  it("acerta a virada de ano e o ano bissexto", () => {
    expect(diaDaSemana("2024-02-29")).toBe(4); // quinta
    expect(diaDaSemana("2026-01-01")).toBe(4); // quinta
    expect(diaDaSemana("2026-12-31")).toBe(4); // quinta
  });
});

describe("as três formas de data", () => {
  it("INTERVALO: primeira e última são o começo e o fim", () => {
    const e = etapa("inscricoes", "Inscrições", "INTERVALO", ["2026-06-29", "2026-07-27"]);
    expect(primeiraData(e)).toBe("2026-06-29");
    expect(ultimaData(e)).toBe("2026-07-27");
  });

  it("🔴 ALTERNATIVAS não é intervalo: os dias do meio NÃO são oferecidos", () => {
    // Retirada do atestado no Edital 003: 5 dias específicos entre 06/07 e 20/07.
    // Modelar como intervalo publicaria um edital falso, oferecendo 15 dias.
    const e = etapa("retirada_atestado_pcd", "Retirada", "ALTERNATIVAS",
      ["2026-07-06", "2026-07-09", "2026-07-13", "2026-07-16", "2026-07-20"]);
    expect(e.datas).toHaveLength(5);
    expect(primeiraData(e)).toBe("2026-07-06");
    expect(ultimaData(e)).toBe("2026-07-20");
    expect(e.datas).not.toContain("2026-07-07");
  });

  it("etapa sem data devolve null, sem quebrar", () => {
    const e = etapa("prova_objetiva", "Prova", "DATA_UNICA", []);
    expect(primeiraData(e)).toBeNull();
    expect(ultimaData(e)).toBeNull();
  });
});

describe("🎯 etapa sem data — o defeito do Edital 004", () => {
  it("acusa como ERRO, e cita o caso real", () => {
    const semData = EDITAL_003.map((e) => (e.chave === "prova_objetiva" ? { ...e, datas: [] } : e));
    const achados = conferirCronograma(semData).filter((a) => a.regra === "etapa-sem-data");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("erro");
    expect(achados[0].mensagem).toContain("XX/xx/2026");
  });

  it("⭐ CONTROLE: etapa sem data não gera TAMBÉM aviso de fim de semana", () => {
    // Sem a saída antecipada, uma etapa vazia entraria no laço de datas e o painel
    // mostraria dois problemas onde há um.
    const semData = [etapa("recurso_gabarito", "Recurso", "DATA_UNICA", [])];
    expect(regras(semData)).toEqual(["etapa-sem-data"]);
  });
});

describe("precedência", () => {
  it("acusa isenção terminando DEPOIS do fim das inscrições", () => {
    const quebrado = EDITAL_003.map((e) =>
      e.chave === "entrega_isencao" ? { ...e, datas: ["2026-08-01"] } : e,
    );
    const achados = conferirCronograma(quebrado).filter((a) => a.regra === "precedencia-invertida");
    expect(achados).toHaveLength(1);
    expect(achados[0].severidade).toBe("erro");
    expect(achados[0].mensagem).toContain("2026-07-27");
  });

  it("acusa gabarito ANTES da prova", () => {
    const quebrado = EDITAL_003.map((e) =>
      e.chave === "divulgacao_gabarito" ? { ...e, datas: ["2026-09-19"] } : e,
    );
    expect(regras(quebrado)).toContain("precedencia-invertida");
  });

  it("⭐ CONTROLE: gabarito NO MESMO DIA da prova é válido — e é o que o 003 faz", () => {
    // Prova e gabarito ambos em 20/09/2026. A regra é "não antes", não "depois".
    expect(regras(EDITAL_003)).not.toContain("precedencia-invertida");
  });

  it("etapa ausente do cronograma não gera aviso de precedência", () => {
    // Nem todo edital tem todas as etapas; a falta de uma não pode inventar erro na outra.
    const semIsencao = EDITAL_003.filter((e) => e.chave !== "entrega_isencao");
    expect(regras(semIsencao)).not.toContain("precedencia-invertida");
  });
});

describe("catálogo de etapas sugeridas", () => {
  it("não tem chave repetida", () => {
    const chaves = ETAPAS_SUGERIDAS.map((e) => e.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("cobre todas as etapas do cronograma real do Edital 003", () => {
    const sugeridas = new Set(ETAPAS_SUGERIDAS.map((e) => e.chave));
    for (const e of EDITAL_003) expect(sugeridas.has(e.chave!)).toBe(true);
  });
});

describe("🔴 os dois defeitos que o cronograma REAL pegou em mim", () => {
  it("a exceção do fim de semana é a DATA DA PROVA, não a etapa chamada 'prova'", () => {
    // Minha primeira versão isentava só a chave `prova_objetiva`, e acusava o gabarito —
    // que o Edital 003 divulga no MESMO domingo, logo depois do exame.
    const gabarito = EDITAL_003.find((e) => e.chave === "divulgacao_gabarito")!;
    expect(gabarito.datas).toEqual(["2026-09-20"]);
    expect(ehFimDeSemana("2026-09-20")).toBe(true);
    expect(regras(EDITAL_003)).not.toContain("etapa-em-fim-de-semana");

    // ⭐ E o controle: outra etapa nesse mesmo domingo TAMBÉM é isenta, porque o critério
    // é a data. Já uma em outro fim de semana avisa (caso acima).
    const outraNoDiaDaProva = [
      ...EDITAL_003,
      etapa("etapa_propria", "Plantão de dúvidas", "DATA_UNICA", ["2026-09-20"], 99),
    ];
    expect(regras(outraNoDiaDaProva)).not.toContain("etapa-em-fim-de-semana");
  });

  it("cada precedência compara a PONTA certa de cada lado", () => {
    // Minha primeira versão comparava sempre `fim de A` com `início de B`, e acusava o
    // Edital 003: a isenção termina em 08/07 e as inscrições COMEÇAM em 29/06. Mas a
    // regra é "até o FIM das inscrições" (27/07). Comparar a ponta errada inventa erro em
    // edital válido — o jeito mais rápido de ensinar alguém a ignorar o painel.
    const isencao = EDITAL_003.find((e) => e.chave === "entrega_isencao")!;
    const inscricoes = EDITAL_003.find((e) => e.chave === "inscricoes")!;
    expect(isencao.datas[0] > inscricoes.datas[0]).toBe(true);  // 08/07 > 29/06: início
    expect(isencao.datas[0] < inscricoes.datas[1]).toBe(true);  // 08/07 < 27/07: fim
    expect(regras(EDITAL_003)).not.toContain("precedencia-invertida");
  });
});
