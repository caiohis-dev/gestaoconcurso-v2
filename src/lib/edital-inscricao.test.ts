/**
 * Inscrição, taxas, isenção e canais.
 *
 * ⭐ O controle positivo são os capítulos [6] e [7] dos três editais — que, no caso da
 * isenção, são **idênticos palavra por palavra**, e no caso da taxa dão os 6 valores que
 * decidiram o recorte do modelo.
 */
import { describe, it, expect } from "vitest";
import {
  conferirInscricao,
  taxaSugerida,
  pareceEmail,
  CRITERIOS_DE_ISENCAO,
  type CargoComTaxa,
  type CriterioIsencao,
  type CanalAtendimento,
} from "@/lib/edital-inscricao";

let seq = 0;
const cargo = (nome: string, escolaridade: string | null, taxa: number | null): CargoComTaxa => ({
  edital_cargo_id: `ec${seq++}`, nome, escolaridade_minima: escolaridade, taxa_inscricao: taxa,
});
const canal = (tipo: string, rotulo: string, endereco: string | null): CanalAtendimento => ({
  id: `c${seq++}`, tipo_canal: tipo, rotulo, endereco,
});

/** Os três critérios, como os três editais os publicam. */
const ISENCAO_REAL: CriterioIsencao[] = [
  {
    tipo_criterio: "CADUNICO",
    lei_referencia: "Lei nº 8.112/90, art. 11; Decretos Federais nº 6.593/2008 e nº 11.016/2022",
    minimo_doacoes_sangue_12m: null, redome_exige_ano_vigente: null,
  },
  {
    tipo_criterio: "DOADOR_SANGUE_OU_MEDULA",
    lei_referencia: "Lei Municipal nº 5.989/2022",
    minimo_doacoes_sangue_12m: 3, redome_exige_ano_vigente: true,
  },
  {
    tipo_criterio: "SERVICO_ELEITORAL",
    lei_referencia: "Lei Municipal nº 6.359/2024",
    minimo_doacoes_sangue_12m: null, redome_exige_ano_vigente: null,
  },
];

/** Os canais medidos: um posto, um site, um e-mail. */
const CANAIS_REAIS: CanalAtendimento[] = [
  canal("PORTAL_WEB", "Site do concurso", "www.voltaredonda.rj.gov.br/concursopublico"),
  canal("POSTO_PRESENCIAL", "Entrega de envelopes",
    "Sede Administrativa da FEVRE, Rua 154, nº 783 – Laranjal"),
  canal("EMAIL", "Vista da folha de respostas", "visto_fr@fevre.com.br"),
];

const regras = (e: Parameters<typeof conferirInscricao>[0]) =>
  conferirInscricao(e).map((a) => a.regra);

describe("⭐ CONTROLE POSITIVO: os capítulos [6] e [7] dos três editais", () => {
  it("🎯 o Edital 003 inteiro não acusa nada", () => {
    expect(
      conferirInscricao({
        cargos: [cargo("Enfermeiro", "SUPERIOR", 100), cargo("Técnico em Enfermagem", "TECNICO", 80)],
        criterios: ISENCAO_REAL,
        canais: CANAIS_REAIS,
      }),
    ).toEqual([]);
  });

  it("🎯 e o 002 e o 004 também — os três saem do mesmo código", () => {
    // 002: Docente I (superior) 100, Docente II (Curso Normal de nível MÉDIO) 80.
    expect(
      regras({
        cargos: [cargo("Docente I", "SUPERIOR", 100), cargo("Docente II", "MEDIO", 80)],
        criterios: ISENCAO_REAL, canais: CANAIS_REAIS,
      }),
    ).toEqual([]);
    // 004: os dois cargos são de nível médio e pagam o MESMO valor.
    expect(
      regras({
        cargos: [cargo("ACS", "MEDIO", 80), cargo("ACE", "MEDIO", 80)],
        criterios: ISENCAO_REAL, canais: CANAIS_REAIS,
      }),
    ).toEqual([]);
  });

  it("🔴 os critérios de isenção são TRÊS, não quatro", () => {
    // O esboço do roadmap separava DOADOR_SANGUE de DOADOR_MEDULA_REDOME; os três editais
    // os juntam sob a Lei Municipal 5.989/2022, numa alínea só.
    expect(CRITERIOS_DE_ISENCAO).toHaveLength(3);
    expect(CRITERIOS_DE_ISENCAO.map((c) => c.tipo)).toEqual([
      "CADUNICO", "DOADOR_SANGUE_OU_MEDULA", "SERVICO_ELEITORAL",
    ]);
  });
});

describe("a taxa sugerida — correlação medida, não regra do documento", () => {
  it("🎯 os 6 valores reais saem da sugestão", () => {
    expect(taxaSugerida("SUPERIOR")).toBe(100);   // Docente I, Enfermeiro
    expect(taxaSugerida("MEDIO")).toBe(80);       // Docente II, ACS, ACE
    expect(taxaSugerida("TECNICO")).toBe(80);     // Técnico em Enfermagem
  });

  it("🔴 nível NÃO MEDIDO devolve null — chutar seria pior que não sugerir", () => {
    // FUNDAMENTAL não aparece em nenhum dos três. Um número inventado seria aceito sem
    // conferência e sairia no boleto.
    expect(taxaSugerida("FUNDAMENTAL")).toBeNull();
    expect(taxaSugerida(null)).toBeNull();
  });

  it("🎯 acusa taxas DIFERENTES no mesmo nível, como aviso", () => {
    const a = conferirInscricao({
      cargos: [cargo("Enfermeiro", "SUPERIOR", 100), cargo("Médico", "SUPERIOR", 150)],
      criterios: ISENCAO_REAL, canais: CANAIS_REAIS,
    });
    expect(a.map((x) => x.regra)).toEqual(["taxa-divergente-no-mesmo-nivel"]);
    expect(a[0].severidade).toBe("aviso");
    expect(a[0].mensagem).toContain("R$ 100.00");
  });

  it("⭐ CONTROLE NEGATIVO: níveis diferentes com taxas diferentes é o NORMAL", () => {
    // É exatamente o que os três editais fazem. Se isto acusasse, os três acusariam.
    expect(
      regras({
        cargos: [cargo("Enfermeiro", "SUPERIOR", 100), cargo("Técnico", "TECNICO", 80)],
        criterios: ISENCAO_REAL, canais: CANAIS_REAIS,
      }),
    ).toEqual([]);
  });

  it("🎯 acusa taxa NÃO DECLARADA como erro", () => {
    const a = conferirInscricao({
      cargos: [cargo("Enfermeiro", "SUPERIOR", null)],
      criterios: ISENCAO_REAL, canais: CANAIS_REAIS,
    });
    expect(a.map((x) => x.regra)).toEqual(["taxa-nao-declarada"]);
    expect(a[0].severidade).toBe("erro");
    expect(a[0].mensagem).toContain("Enfermeiro");
  });

  it("⭐ CONTROLE: taxa ZERO é declaração válida, não ausência", () => {
    // Concurso sem taxa existe. O banco admite `>= 0` pelo mesmo motivo.
    expect(
      regras({
        cargos: [cargo("Enfermeiro", "SUPERIOR", 0)],
        criterios: ISENCAO_REAL, canais: CANAIS_REAIS,
      }),
    ).toEqual([]);
  });

  it("⚠️ cargo sem escolaridade declarada não entra na comparação de nível", () => {
    // Nulo é "não declarado", e comparar contra ele acusaria o trabalho em andamento.
    expect(
      regras({
        cargos: [cargo("A", null, 100), cargo("B", null, 999)],
        criterios: ISENCAO_REAL, canais: CANAIS_REAIS,
      }),
    ).toEqual([]);
  });
});

describe("as regras da isenção", () => {
  const semParametro = ISENCAO_REAL.map((c) =>
    c.tipo_criterio === "DOADOR_SANGUE_OU_MEDULA" ? { ...c, minimo_doacoes_sangue_12m: null } : c,
  );

  it("🎯 acusa doador de sangue sem o número de doações", () => {
    expect(regras({ cargos: [], criterios: semParametro, canais: CANAIS_REAIS }))
      .toEqual(["doacoes-nao-declaradas"]);
  });

  it("🎯 acusa critério sem a lei que o fundamenta", () => {
    const semLei = ISENCAO_REAL.map((c) =>
      c.tipo_criterio === "CADUNICO" ? { ...c, lei_referencia: "  " } : c,
    );
    const a = conferirInscricao({ cargos: [], criterios: semLei, canais: CANAIS_REAIS });
    expect(a.map((x) => x.regra)).toEqual(["criterio-sem-lei"]);
    expect(a[0].severidade).toBe("aviso");
  });

  it("⭐ CONTROLE: edital SEM nenhum critério de isenção não acusa", () => {
    // Capítulo desligado é estado legítimo — nem todo edital concede isenção.
    expect(regras({ cargos: [], criterios: [], canais: [] })).toEqual([]);
  });
});

describe("os canais de atendimento", () => {
  it("🎯 acusa e-mail que não parece e-mail — o banco aceita de propósito", () => {
    // CASO 5e da bateria: "dado inválido entra cru; valide na leitura".
    const a = conferirInscricao({
      cargos: [], criterios: [],
      canais: [canal("EMAIL", "Impugnação", "isto nao e um email")],
    });
    expect(a.map((x) => x.regra)).toEqual(["email-malformado"]);
    expect(a[0].severidade).toBe("erro");
  });

  it("🎯 acusa canal sem endereço", () => {
    expect(regras({ cargos: [], criterios: [], canais: [canal("PORTAL_WEB", "Site", null)] }))
      .toEqual(["canal-sem-endereco"]);
  });

  it("⭐ CONTROLE NEGATIVO: POSTO PRESENCIAL pode não ter endereço ainda", () => {
    // É o canal que se cadastra primeiro e se detalha depois; acusá-lo de imediato
    // encheria o painel no primeiro minuto.
    expect(regras({ cargos: [], criterios: [], canais: [canal("POSTO_PRESENCIAL", "Sede", null)] }))
      .toEqual([]);
  });

  it("⭐ CONTROLE: o MESMO posto citado duas vezes não acusa", () => {
    // No Edital 002 a mesma sede aparece em quatro finalidades. A tabela existe para que
    // seja uma linha referenciada, não para impedir a repetição.
    const sede = "Sede Administrativa da FEVRE, Rua 154, nº 783";
    expect(
      regras({
        cargos: [], criterios: [],
        canais: [canal("POSTO_PRESENCIAL", "Isenção", sede), canal("POSTO_PRESENCIAL", "Títulos", sede)],
      }),
    ).toEqual([]);
  });

  it("pareceEmail aceita o real e recusa o que claramente não é", () => {
    expect(pareceEmail("visto_fr@fevre.com.br")).toBe(true);
    expect(pareceEmail("gabinete.fevre@smevr.com.br")).toBe(true);
    expect(pareceEmail("sem arroba")).toBe(false);
    expect(pareceEmail("sem@ponto")).toBe(false);
    expect(pareceEmail("")).toBe(false);
  });
});

describe("🔴 R1 — o e-mail que a fatia 5 guarda noutra tabela", () => {
  it("acusa quando o e-mail da vista de prova NÃO está entre os canais", () => {
    // O roadmap avisava que, se a fatia 5 viesse antes desta, criaria
    // `regras_vista_prova.email_solicitacao` solto. Veio, e criou. A coluna não foi
    // migrada; esta regra torna a duplicação VISÍVEL em vez de silenciosa.
    const a = conferirInscricao({
      cargos: [], criterios: [],
      canais: [canal("EMAIL", "Impugnação", "gabinete.fevre@smevr.com.br")],
      emailDaVistaDeProva: "visto_fr@fevre.com.br",
    });
    expect(a.map((x) => x.regra)).toEqual(["email-da-vista-fora-dos-canais"]);
    expect(a[0].severidade).toBe("aviso");
    expect(a[0].mensagem).toContain("visto_fr@fevre.com.br");
  });

  it("⭐ CONTROLE NEGATIVO: com o e-mail entre os canais, não acusa", () => {
    expect(
      regras({
        cargos: [], criterios: [], canais: CANAIS_REAIS,
        emailDaVistaDeProva: "visto_fr@fevre.com.br",
      }),
    ).toEqual([]);
  });

  it("⚠️ a comparação ignora CAIXA e espaços — é o mesmo endereço para quem escreve", () => {
    expect(
      regras({
        cargos: [], criterios: [], canais: CANAIS_REAIS,
        emailDaVistaDeProva: "  VISTO_FR@FEVRE.COM.BR ",
      }),
    ).toEqual([]);
  });

  it("⭐ CONTROLE: edital sem vista de prova não acusa nada", () => {
    expect(regras({ cargos: [], criterios: [], canais: CANAIS_REAIS, emailDaVistaDeProva: null }))
      .toEqual([]);
  });
});
