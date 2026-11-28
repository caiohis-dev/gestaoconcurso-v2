/**
 * As dez conferências de painel no portão da exportação.
 *
 * O que se guarda:
 * - cada conferência chega ao portão no CAPÍTULO do painel que a mostra — incluindo as
 *   duas que motivaram isto: `canal-sem-endereco` (erro) e o e-mail da vista fora dos
 *   canais (a dívida que o backlog previa "virar erro visível na exportação");
 * - capítulo DESLIGADO não é conferido (controle: ligado, é);
 * - os painéis compartilhados (inscrição em dois capítulos, ações afirmativas em três)
 *   conferem cada regra uma vez, no capítulo dono dela;
 * - as entradas extraídas dos painéis reproduzem o que o JSX fazia.
 */
import { describe, expect, it } from "vitest";
import { montarDocumento } from "@/lib/edital-numeracao";
import { CAPITULOS_CATALOGO } from "@/lib/edital-capitulos";
import {
  avisosDeCotasDaLinha,
  cargosComTaxa,
  cargosParaInvestidura,
  conferenciasDoEdital,
  disciplinasParaConteudo,
  entradaDasAcoes,
  entradaDoDesempate,
  type DadosDasConferencias,
} from "@/lib/edital-conferencias";
import { pendenciasDaExportacao } from "@/lib/edital-exportacao";

const ligados = (...chaves: string[]) =>
  montarDocumento(CAPITULOS_CATALOGO.map((c) => ({ chave: c.chave, incluido: chaves.includes(c.chave) })));
const TODOS = CAPITULOS_CATALOGO.map((c) => c.chave);

const EC = {
  id: "ec1",
  cargo_id: "c1",
  taxa_inscricao: 80,
  vagas_total: 10,
  vagas_ampla_concorrencia: 7,
  vagas_pcd: 1,
  vagas_negros: 2,
};
const CARGO = { id: "c1", nome: "ENFERMEIRO", escolaridade_minima: "SUPERIOR", conselho_classe_obrigatorio: "COREN" };

const dados = (p: Partial<DadosDasConferencias> = {}): DadosDasConferencias => ({
  cargosDoEdital: [EC],
  cargos: [CARGO],
  etapas: [],
  prova: { configs: [], disciplinas: [] },
  titulos: { config: null, itens: [] },
  distribuicao: [],
  documentosDeInvestidura: [],
  inscricao: { criterios: [], canais: [], emailDaVistaDeProva: null },
  criteriosDeDesempate: [],
  acoes: { pcd: null, cotas: null, lactantes: null },
  ementas: [],
  ...p,
});

const regras = (caps: ReturnType<typeof ligados>, d: DadosDasConferencias) =>
  conferenciasDoEdital(caps, d).map((a) => [a.capitulo, a.regra]);

describe("conferenciasDoEdital", () => {
  it("controle positivo: edital coerente, nada acusado", () => {
    expect(conferenciasDoEdital(ligados(...TODOS), dados())).toEqual([]);
  });

  it("🔴 canal sem endereço (ERRO) chega ao portão, no capítulo da inscrição", () => {
    const d = dados({ inscricao: { criterios: [], canais: [{ id: "k", tipo_canal: "EMAIL", rotulo: "SAC", endereco: null }], emailDaVistaDeProva: null } });
    const a = conferenciasDoEdital(ligados("inscricao_e_pagamento"), d);
    expect(a).toMatchObject([{ capitulo: "inscricao_e_pagamento", severidade: "erro", regra: "canal-sem-endereco" }]);
  });

  it("🔴 o e-mail da vista fora dos canais — a dívida do backlog — chega ao portão", () => {
    const d = dados({
      inscricao: {
        criterios: [],
        canais: [{ id: "k", tipo_canal: "EMAIL", rotulo: "SAC", endereco: "sac@fevre.org" }],
        emailDaVistaDeProva: "vista@fevre.org",
      },
    });
    expect(regras(ligados("inscricao_e_pagamento"), d)).toEqual([["inscricao_e_pagamento", "email-da-vista-fora-dos-canais"]]);
  });

  it("inscrição: os DOIS capítulos ligados conferem uma vez só; só a isenção ligada, confere nela", () => {
    const d = dados({ inscricao: { criterios: [], canais: [{ id: "k", tipo_canal: "EMAIL", rotulo: "SAC", endereco: null }], emailDaVistaDeProva: null } });
    expect(regras(ligados("inscricao_e_pagamento", "isencao_taxa"), d)).toEqual([["inscricao_e_pagamento", "canal-sem-endereco"]]);
    expect(regras(ligados("isencao_taxa"), d)).toEqual([["isencao_taxa", "canal-sem-endereco"]]);
    expect(regras(ligados(), d)).toEqual([]);
  });

  it("🔴 capítulo DESLIGADO não é conferido; ligado, é (títulos sem teto)", () => {
    const d = dados({
      titulos: {
        config: null,
        itens: [{ edital_cargo_id: "ec1", nivel: "DOUTORADO", descricao: "Doutorado", area_exigida: null, carga_horaria_minima_horas: null, pontos_minimo: 4, pontos_maximo: 4 }],
      },
    });
    expect(regras(ligados(), d)).toEqual([]);
    const a = conferenciasDoEdital(ligados("prova_de_titulos"), d);
    expect(a).toMatchObject([{ capitulo: "prova_de_titulos", regra: "titulos-sem-teto", severidade: "erro" }]);
    expect(a[0].mensagem.startsWith("ENFERMEIRO: ")).toBe(true);
  });

  it("cotas: soma que não fecha é ERRO, reserva abaixo é AVISO — os dois com o nome do cargo", () => {
    const d = dados({ cargosDoEdital: [{ ...EC, vagas_ampla_concorrencia: 9, vagas_pcd: 0, vagas_negros: 0 }] });
    const a = conferenciasDoEdital(ligados("quadro_de_cargos"), d);
    expect(a.map((x) => [x.severidade, x.regra])).toEqual([
      ["erro", "soma-nao-fecha"],
      ["aviso", "abaixo-do-minimo"],
      ["aviso", "abaixo-do-minimo"],
    ]);
    for (const x of a) expect(x.mensagem.startsWith("ENFERMEIRO: ")).toBe(true);
  });

  it("matriz da prova: por cargo, com o nome na frente (a mensagem original não o tem)", () => {
    const d = dados({
      prova: {
        configs: [{ edital_cargo_id: "ec1", total_questoes: 40, duracao_minutos: 180, tempo_minimo_permanencia_minutos: 60, tempo_minimo_levar_caderno_minutos: 120, nota_corte_percentual: 50, permite_zerar_disciplina: false }],
        disciplinas: [],
      },
    });
    const a = conferenciasDoEdital(ligados("prova_objetiva"), d);
    expect(a).toMatchObject([{ regra: "prova-sem-disciplinas" }]);
    expect(a[0].mensagem).toBe("ENFERMEIRO: A prova declara 40 questões e nenhuma disciplina foi definida.");
  });

  it("🔴 ações afirmativas: a regra da LACTANTE é de condições especiais; a do LAUDO, de vagas PCD", () => {
    const d = dados({
      acoes: {
        pcd: { percentual_reserva: 10, aceita_laudo_indeterminado: false, validade_meses_laudo_temporario: 12 },
        cotas: null,
        lactantes: { idade_maxima_lactente_meses: 24, permite_compensacao_tempo: true, tempo_maximo_compensacao_minutos: 30 },
      },
    });
    expect(regras(ligados("vagas_pcd"), d)).toEqual([["vagas_pcd", "laudo-sem-validade-indeterminada"]]);
    expect(regras(ligados("condicoes_especiais_prova"), d)).toEqual([
      ["condicoes_especiais_prova", "corte-lactante-sem-data-da-prova"],
    ]);
    // controle: com a data da prova no cronograma, o corte da lactante deixa de ser erro
    const comData = { ...d, etapas: [{ chave: "prova_objetiva", nome_evento: "Prova", tipo: "DATA_UNICA" as const, datas: ["2026-09-20"], ordem: 0 }] };
    expect(regras(ligados("condicoes_especiais_prova"), comData)).toEqual([]);
  });

  it("cronograma e conteúdo saem no capítulo de ANEXOS", () => {
    const d = dados({ etapas: [{ chave: "inscricoes", nome_evento: "Inscrições", tipo: "INTERVALO", datas: [], ordem: 0 }] });
    expect(regras(ligados("anexos"), d)).toEqual([["anexos", "etapa-sem-data"]]);
  });

  it("a lista sai na ORDEM DO DOCUMENTO, não intercalada por cargo", () => {
    // Dois cargos, cada um com aviso em DOIS capítulos: o laço é por cargo, então sem a
    // ordenação a lista sairia cotas(1), títulos(1), cotas(2), títulos(2).
    const titulo = (ec: string) => ({ edital_cargo_id: ec, nivel: "DOUTORADO" as const, descricao: "D", area_exigida: null, carga_horaria_minima_horas: null, pontos_minimo: 4, pontos_maximo: 4 });
    const d = dados({
      cargosDoEdital: [{ ...EC, vagas_ampla_concorrencia: 0 }, { ...EC, id: "ec2", vagas_ampla_concorrencia: 0 }],
      titulos: { config: null, itens: [titulo("ec1"), titulo("ec2")] },
    });
    const caps = ligados("quadro_de_cargos", "prova_de_titulos");
    const sequencia = conferenciasDoEdital(caps, d).map((a) => a.capitulo);
    const primeiroTitulo = sequencia.indexOf("prova_de_titulos");
    expect(primeiroTitulo).toBeGreaterThan(0);
    expect(sequencia.slice(primeiroTitulo).every((c) => c === "prova_de_titulos")).toBe(true);
  });
});

describe("as entradas extraídas dos painéis", () => {
  it("cargo fora do catálogo vira '(cargo removido)' — não some", () => {
    expect(cargosComTaxa([{ ...EC, cargo_id: "x" }], [CARGO])[0].nome).toBe("(cargo removido)");
  });

  it("🔴 conselho NÃO declarado continua null — não vira 'nenhum'", () => {
    expect(cargosParaInvestidura([EC], [{ ...CARGO, conselho_classe_obrigatorio: null }])[0].conselho_classe_obrigatorio).toBeNull();
  });

  it("disciplina de cargo fora do edital não entra no conteúdo", () => {
    const r = disciplinasParaConteudo(
      [{ edital_cargo_id: "ec1", nome_disciplina: "SUS" }, { edital_cargo_id: "outro", nome_disciplina: "X" }],
      [EC],
      [CARGO],
    );
    expect(r).toEqual([{ edital_cargo_id: "ec1", cargo_id: "c1", nomeDoCargo: "ENFERMEIRO", nome_disciplina: "SUS" }]);
  });

  it("a data da prova é a PRIMEIRA data da etapa prova_objetiva", () => {
    const e = entradaDasAcoes({
      pcd: null,
      lactantes: null,
      etapas: [{ chave: "prova_objetiva", nome_evento: "Prova", tipo: "INTERVALO", datas: ["2026-09-20", "2026-09-21"], ordem: 0 }],
    });
    expect(e.dataDaProva).toBe("2026-09-20");
  });

  it("desempate: nomes de disciplina sem repetição; título conta como prova de títulos", () => {
    const e = entradaDoDesempate({ criterios: [], disciplinas: [{ nome_disciplina: "SUS" }, { nome_disciplina: "SUS" }], titulos: [{}] });
    expect(e).toEqual({ criterios: [], disciplinasDaProva: ["SUS"], temProvaDeTitulos: true });
  });

  it("cotas sem total declarado: nada a conferir", () => {
    expect(avisosDeCotasDaLinha({ ...EC, vagas_total: null }, { pcd: null, negros: null })).toEqual([]);
  });
});

describe("no portão", () => {
  it("🔴 o aviso de painel vira pendência com o TÍTULO do capítulo na frente", () => {
    const caps = ligados("inscricao_e_pagamento");
    const p = pendenciasDaExportacao({
      capitulos: caps,
      itens: [],
      valores: new Map(),
      documento: { cabecalho: { linhas: [], pendencias: [] }, capitulos: [], anexos: [] },
      conferencias: [{ capitulo: "inscricao_e_pagamento", severidade: "erro", regra: "canal-sem-endereco", mensagem: "Sem endereço." }],
    });
    const titulo = caps.find((c) => c.chave === "inscricao_e_pagamento")!.titulo;
    expect(p.filter((x) => x.origem === "painel")).toMatchObject([
      { capitulo: "inscricao_e_pagamento", severidade: "erro", texto: `${titulo} — Sem endereço.` },
    ]);
  });
});
