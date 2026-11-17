/**
 * As DEZ conferências de painel, juntas — para o portão da exportação.
 *
 * 🔴 **Por que existe (fatia 12, etapa 4, 2026-11-16).** Cada painel do Studio tem a sua
 * conferência (`conferirInscricao`, `conferirCotas`…), e elas apareciam SÓ dentro do
 * painel: nem o botão "Pendências" nem o portão as viam. Algumas são ERRO — "o canal sairia
 * no edital como um canal que ninguém consegue usar" —, e uma é a dívida do e-mail duplicado
 * que o backlog previa "virar erro visível na exportação". O portão dizia "nenhuma
 * pendência" para um edital com essas falhas.
 *
 * 🔴 **Uma montagem de entrada, dois chamadores.** O que cada painel calculava no JSX antes
 * de chamar a conferência (cargos com taxa, disciplinas do conteúdo, data da prova…) mora
 * AQUI, e o painel chama a mesma função. Uma cópia no portão divergiria do painel no dia em
 * que um dos dois fosse corrigido — e o painel diria uma coisa e o portão, outra. É o
 * "traduza o laço, não o resultado" do CLAUDE.md §8.
 *
 * ⚠️ **Só roda para capítulo INCLUÍDO.** O painel só aparece no capítulo dele; conferir um
 * capítulo desligado cobraria do arquivo uma regra sobre o que ele não publica.
 */
import type { CapituloResolvido } from "@/lib/edital-numeracao";
import type { Severidade } from "@/lib/edital-linter";
import { conferirCotas, type AvisoDeCota, type PercentuaisDeclarados } from "@/lib/edital-cotas";
import { conferirProva } from "@/lib/edital-prova";
import { conferirTitulos } from "@/lib/edital-titulos";
import { conferirDistribuicao } from "@/lib/edital-territorialidade";
import { conferirInvestidura, type CargoDoEdital } from "@/lib/edital-investidura";
import { conferirDesempate } from "@/lib/edital-desempate";
import { conferirInscricao, type CargoComTaxa } from "@/lib/edital-inscricao";
import { conferirCronograma, primeiraData, type EtapaCronograma } from "@/lib/edital-cronograma";
import { conferirConteudo, type DisciplinaDaProva } from "@/lib/edital-conteudo";
import { conferirAcoesAfirmativas } from "@/lib/edital-acoes-afirmativas";

type Entrada<F extends (arg: never) => unknown> = Parameters<F>[0];

/** O nome que os painéis mostram para um cargo que sumiu do catálogo. */
export const CARGO_REMOVIDO = "(cargo removido)";

interface CargoNoEdital {
  id: string;
  cargo_id: string;
  taxa_inscricao: number | null;
  vagas_total: number | null;
  vagas_ampla_concorrencia: number | null;
  vagas_pcd: number | null;
  vagas_negros: number | null;
}

interface CargoDoCatalogo {
  id: string;
  nome: string;
  escolaridade_minima: string | null;
  conselho_classe_obrigatorio: string | null;
}

export function nomeDoCargo(cargos: readonly Pick<CargoDoCatalogo, "id" | "nome">[], cargoId: string): string {
  return cargos.find((c) => c.id === cargoId)?.nome ?? CARGO_REMOVIDO;
}

// ─────────────────────────────────────────────────────────────────────────────
// AS ENTRADAS — o que os painéis calculavam no JSX
// ─────────────────────────────────────────────────────────────────────────────

/** Quadro de Cargos: o percentual vem do capítulo Das Vagas, não de constante. */
export function percentuaisDeclarados(
  pcd: { percentual_reserva: number | null } | null,
  cotas: { percentual_reserva: number | null } | null,
): PercentuaisDeclarados {
  return { pcd: pcd?.percentual_reserva ?? null, negros: cotas?.percentual_reserva ?? null };
}

/** Quadro de Cargos, uma linha: sem total declarado não há o que conferir. */
export function avisosDeCotasDaLinha(
  linha: Pick<CargoNoEdital, "vagas_total" | "vagas_ampla_concorrencia" | "vagas_pcd" | "vagas_negros">,
  declarados: PercentuaisDeclarados,
): AvisoDeCota[] {
  if (linha.vagas_total === null) return [];
  return conferirCotas(
    {
      total: Number(linha.vagas_total),
      amplaConcorrencia: Number(linha.vagas_ampla_concorrencia ?? 0),
      pcd: Number(linha.vagas_pcd ?? 0),
      negros: Number(linha.vagas_negros ?? 0),
    },
    declarados,
  );
}

/** Inscrição: a taxa é por cargo, a escolaridade vem do catálogo. */
export function cargosComTaxa(
  cargosDoEdital: readonly Pick<CargoNoEdital, "id" | "cargo_id" | "taxa_inscricao">[],
  cargos: readonly CargoDoCatalogo[],
): CargoComTaxa[] {
  return cargosDoEdital.map((ec) => {
    const c = cargos.find((x) => x.id === ec.cargo_id);
    return {
      edital_cargo_id: ec.id,
      nome: c?.nome ?? CARGO_REMOVIDO,
      escolaridade_minima: c?.escolaridade_minima ?? null,
      taxa_inscricao: ec.taxa_inscricao ?? null,
    };
  });
}

/** Investidura: o conselho vem do catálogo, e `null` (não declarado) NÃO vira "nenhum". */
export function cargosParaInvestidura(
  cargosDoEdital: readonly Pick<CargoNoEdital, "cargo_id">[],
  cargos: readonly CargoDoCatalogo[],
): CargoDoEdital[] {
  return cargosDoEdital.map((ec) => {
    const c = cargos.find((x) => x.id === ec.cargo_id);
    return {
      cargo_id: ec.cargo_id,
      nome: c?.nome ?? CARGO_REMOVIDO,
      conselho_classe_obrigatorio: c?.conselho_classe_obrigatorio ?? null,
    };
  });
}

/** Conteúdo programático: as disciplinas da matriz, com o cargo — as de cargo fora do edital saem. */
export function disciplinasParaConteudo(
  disciplinas: readonly { edital_cargo_id: string; nome_disciplina: string }[],
  cargosDoEdital: readonly Pick<CargoNoEdital, "id" | "cargo_id">[],
  cargos: readonly Pick<CargoDoCatalogo, "id" | "nome">[],
): DisciplinaDaProva[] {
  return disciplinas.flatMap((d) => {
    const ec = cargosDoEdital.find((x) => x.id === d.edital_cargo_id);
    if (!ec) return [];
    return [
      {
        edital_cargo_id: d.edital_cargo_id,
        cargo_id: ec.cargo_id,
        nomeDoCargo: nomeDoCargo(cargos, ec.cargo_id),
        nome_disciplina: d.nome_disciplina,
      },
    ];
  });
}

interface LinhaPcd {
  percentual_reserva: number | null;
  aceita_laudo_indeterminado: boolean | null;
  validade_meses_laudo_temporario: number | null;
}
interface LinhaLactantes {
  idade_maxima_lactente_meses: number | null;
  permite_compensacao_tempo: boolean | null;
  tempo_maximo_compensacao_minutos: number | null;
}

/** Ações afirmativas: a data da prova vem do cronograma (o corte da lactante depende dela). */
export function entradaDasAcoes(entrada: {
  pcd: LinhaPcd | null;
  lactantes: LinhaLactantes | null;
  etapas: readonly EtapaCronograma[];
}): Entrada<typeof conferirAcoesAfirmativas> {
  const etapaProva = entrada.etapas.find((e) => e.chave === "prova_objetiva");
  const { lactantes, pcd } = entrada;
  return {
    dataDaProva: etapaProva ? primeiraData(etapaProva) : null,
    lactantes: lactantes && {
      idadeMaximaMeses: lactantes.idade_maxima_lactente_meses,
      permiteCompensacao: lactantes.permite_compensacao_tempo,
      tempoMaximoMinutos: lactantes.tempo_maximo_compensacao_minutos,
    },
    pcd: pcd && {
      percentualReserva: pcd.percentual_reserva,
      aceitaLaudoIndeterminado: pcd.aceita_laudo_indeterminado,
      validadeMesesLaudoTemporario: pcd.validade_meses_laudo_temporario,
    },
  };
}

/** Desempate: os NOMES das disciplinas da matriz (de qualquer cargo), sem repetição. */
export function entradaDoDesempate(entrada: {
  criterios: Entrada<typeof conferirDesempate>["criterios"];
  disciplinas: readonly { nome_disciplina: string }[];
  titulos: readonly unknown[];
}): Entrada<typeof conferirDesempate> {
  return {
    criterios: entrada.criterios,
    disciplinasDaProva: [...new Set(entrada.disciplinas.map((d) => d.nome_disciplina))],
    temProvaDeTitulos: entrada.titulos.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AS DEZ, JUNTAS
// ─────────────────────────────────────────────────────────────────────────────

export interface DadosDasConferencias {
  cargosDoEdital: readonly CargoNoEdital[];
  cargos: readonly CargoDoCatalogo[];
  etapas: readonly EtapaCronograma[];
  prova: {
    configs: readonly (NonNullable<Entrada<typeof conferirProva>["config"]> & { edital_cargo_id: string })[];
    disciplinas: readonly (Entrada<typeof conferirProva>["disciplinas"][number] & {
      edital_cargo_id: string;
      nome_disciplina: string;
    })[];
  };
  titulos: {
    config: Entrada<typeof conferirTitulos>["config"];
    itens: readonly (Entrada<typeof conferirTitulos>["itens"][number] & { edital_cargo_id: string })[];
  };
  distribuicao: readonly (Entrada<typeof conferirDistribuicao>["unidades"][number] & { edital_cargo_id: string })[];
  documentosDeInvestidura: Entrada<typeof conferirInvestidura>["documentos"];
  inscricao: Omit<Entrada<typeof conferirInscricao>, "cargos">;
  criteriosDeDesempate: Entrada<typeof conferirDesempate>["criterios"];
  acoes: { pcd: LinhaPcd | null; cotas: { percentual_reserva: number | null } | null; lactantes: LinhaLactantes | null };
  ementas: Entrada<typeof conferirConteudo>["ementas"];
}

export interface AvisoDePainel {
  /** O capítulo cujo painel mostra o aviso — para onde a pessoa vai consertar. */
  capitulo: string;
  severidade: Severidade;
  regra: string;
  mensagem: string;
}

/**
 * As dez conferências, cada uma no capítulo do painel que a mostra.
 *
 * | capítulo | conferência |
 * |---|---|
 * | `quadro_de_cargos` | cotas, por cargo (soma que não fecha = erro; reserva abaixo = aviso) |
 * | `prova_objetiva` | matriz, por cargo |
 * | `prova_de_titulos` | títulos, por cargo |
 * | `distribuicao_geografica` | vagas por unidade, por cargo |
 * | `investidura_e_posse` | checklist |
 * | `desempate_e_resultado` | critérios |
 * | `inscricao_e_pagamento` (ou `isencao_taxa`) | taxas, isenção, canais, e-mail da vista |
 * | `anexos` | cronograma e conteúdo programático |
 * | `vagas_pcd` · `condicoes_especiais_prova` | ações afirmativas: o laudo é de PCD, a lactante é de condições especiais |
 *
 * ⚠️ Cotas e prova não nomeiam o cargo na mensagem (o painel mostra a mensagem dentro do
 * cartão do cargo). No portão a mensagem chega sozinha, então ganha o nome na frente.
 */
type Acusar = (capitulo: string, avisos: readonly { severidade: Severidade; regra: string; mensagem: string }[]) => void;

/** As quatro que rodam UMA VEZ POR CARGO — cada painel desenha um cartão por cargo. */
function conferirPorCargo(incluido: (chave: string) => boolean, d: DadosDasConferencias, acusar: Acusar) {
  const nome = (ec: Pick<CargoNoEdital, "cargo_id">) => nomeDoCargo(d.cargos, ec.cargo_id);
  const declarados = percentuaisDeclarados(d.acoes.pcd, d.acoes.cotas);

  for (const ec of d.cargosDoEdital) {
    if (incluido("quadro_de_cargos")) {
      acusar(
        "quadro_de_cargos",
        avisosDeCotasDaLinha(ec, declarados).map((a) => ({
          severidade: a.tipo === "soma-nao-fecha" ? "erro" : "aviso",
          regra: a.tipo,
          mensagem: `${nome(ec)}: ${a.mensagem}`,
        })),
      );
    }
    if (incluido("prova_objetiva")) {
      const avisos = conferirProva({
        config: d.prova.configs.find((c) => c.edital_cargo_id === ec.id) ?? null,
        disciplinas: d.prova.disciplinas.filter((x) => x.edital_cargo_id === ec.id),
      });
      acusar("prova_objetiva", avisos.map((a) => ({ ...a, mensagem: `${nome(ec)}: ${a.mensagem}` })));
    }
    if (incluido("prova_de_titulos")) {
      acusar(
        "prova_de_titulos",
        conferirTitulos({
          config: d.titulos.config,
          itens: d.titulos.itens.filter((t) => t.edital_cargo_id === ec.id),
          rotuloDoCargo: nome(ec),
        }),
      );
    }
    if (incluido("distribuicao_geografica")) {
      acusar(
        "distribuicao_geografica",
        conferirDistribuicao({
          unidades: d.distribuicao.filter((v) => v.edital_cargo_id === ec.id),
          totalDeclaradoNoCargo: ec.vagas_total ?? null,
          rotuloDoCargo: nome(ec),
        }),
      );
    }
  }
}

/** As que olham o edital inteiro. */
function conferirDoEdital(incluido: (chave: string) => boolean, d: DadosDasConferencias, acusar: Acusar) {
  if (incluido("investidura_e_posse")) {
    acusar(
      "investidura_e_posse",
      conferirInvestidura({ documentos: d.documentosDeInvestidura, cargos: cargosParaInvestidura(d.cargosDoEdital, d.cargos) }),
    );
  }

  if (incluido("desempate_e_resultado")) {
    acusar(
      "desempate_e_resultado",
      conferirDesempate(
        entradaDoDesempate({ criterios: d.criteriosDeDesempate, disciplinas: d.prova.disciplinas, titulos: d.titulos.itens }),
      ),
    );
  }

  // O mesmo painel serve aos dois capítulos: confere UMA vez, no primeiro que estiver ligado.
  const capInscricao = ["inscricao_e_pagamento", "isencao_taxa"].find(incluido);
  if (capInscricao) {
    acusar(capInscricao, conferirInscricao({ ...d.inscricao, cargos: cargosComTaxa(d.cargosDoEdital, d.cargos) }));
  }

  if (incluido("anexos")) {
    acusar("anexos", conferirCronograma(d.etapas));
    acusar(
      "anexos",
      conferirConteudo({ ementas: d.ementas, disciplinas: disciplinasParaConteudo(d.prova.disciplinas, d.cargosDoEdital, d.cargos) }),
    );
  }

  // Ações afirmativas: cada regra é de um capítulo. Passar `null` para a parte desligada é
  // exatamente "não conferir": a função só olha o que recebe.
  const acoes = entradaDasAcoes({ pcd: d.acoes.pcd, lactantes: d.acoes.lactantes, etapas: d.etapas });
  if (incluido("vagas_pcd")) acusar("vagas_pcd", conferirAcoesAfirmativas({ ...acoes, lactantes: null }));
  if (incluido("condicoes_especiais_prova")) {
    acusar("condicoes_especiais_prova", conferirAcoesAfirmativas({ ...acoes, pcd: null }));
  }
}

export function conferenciasDoEdital(capitulos: readonly CapituloResolvido[], d: DadosDasConferencias): AvisoDePainel[] {
  const incluido = (chave: string) => capitulos.some((c) => c.chave === chave && c.incluido);
  const saida: AvisoDePainel[] = [];
  const acusar: Acusar = (capitulo, avisos) =>
    saida.push(...avisos.map((a) => ({ capitulo, severidade: a.severidade, regra: a.regra, mensagem: a.mensagem })));
  conferirPorCargo(incluido, d, acusar);
  conferirDoEdital(incluido, d, acusar);
  // Na ordem do DOCUMENTO — é como a pessoa percorre a lista no portão. O sort é estável:
  // dentro do capítulo, fica a ordem dos cargos no Quadro I.
  const posicao = new Map(capitulos.map((c, i) => [c.chave, i]));
  return saida.sort((x, y) => (posicao.get(x.capitulo) ?? 0) - (posicao.get(y.capitulo) ?? 0));
}
