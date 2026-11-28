/**
 * O DOCUMENTO DO EDITAL COMO DADO — montado uma vez, projetado em vários formatos.
 *
 * 🔴 **Por que este arquivo existe (fatia 12, 2026-11-16).** Até aqui o documento só
 * existia DESENHADO: a prévia do `EditalStudio` numerava, resolvia os marcadores e montava
 * os quadros dentro de componentes React, cada quadro buscando o próprio dado. Nada disso
 * era alcançável por um exportador. Fazer o Markdown remontar o documento por conta própria
 * criaria uma SEGUNDA montagem — e duas montagens divergem no dia em que uma for corrigida,
 * que é exatamente como um arquivo exportado sairia com número diferente da prévia.
 *
 * Então a montagem mora aqui, pura, e a prévia e o Markdown são duas projeções dela.
 *
 * ⚠️ **Não reimplemente nada daqui num formato de saída.** Numeração é `numerarItens`, a
 * resolução é `resolverMarcadores`, e cada quadro tem UMA função que o transforma em linhas.
 */
import { resolverReferencias, type CapituloResolvido } from "@/lib/edital-numeracao";
import {
  ancorasDoDocumento,
  mapaDeAncoras,
  numerarItens,
  ordenarItens,
  resolverReferenciasDeItem,
  type ItemBruto,
  type QuadroFonte,
} from "@/lib/edital-itens";
import {
  comporNumeroDoEdital,
  formatarNatureza,
  formatarTexto,
  problemaDoNumero,
  resolverARedigir,
  resolverCampos,
} from "@/lib/edital-campos";
import { formatarDatasDaEtapa, type EtapaCronograma } from "@/lib/edital-cronograma";
import type { Disciplina } from "@/lib/edital-prova";
import type { TituloItem } from "@/lib/edital-titulos";
import { agruparPorBairro, type VagasNaUnidade } from "@/lib/edital-territorialidade";
import type { Ementa } from "@/lib/edital-conteudo";
import {
  anexosDoDocumento,
  mapaDeAnexos,
  mapaDeQuadros,
  quadrosDoDocumento,
  resolverReferenciasDeAnexo,
  resolverReferenciasDeQuadro,
  type ChaveDeAnexo,
} from "@/lib/edital-anexos";

// ─────────────────────────────────────────────────────────────────────────────
// A RESOLUÇÃO DOS MARCADORES
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextoDeResolucao {
  documento: readonly CapituloResolvido[];
  ancoras: ReadonlyMap<string, string>;
  /** Chave do anexo → número em romano. Ver `edital-anexos.ts`. */
  anexos: ReadonlyMap<string, string>;
  /** Âncora do artigo de quadro → número em romano. */
  quadros: ReadonlyMap<string, string>;
  /** `undefined` enquanto os valores carregam: cada `{{campo:}}` sai como marcador visível. */
  valores: ReadonlyMap<string, string> | undefined;
}

/**
 * Os SEIS marcadores, em ordem: capítulo → item → anexo → quadro → campo → redigir.
 *
 * 🔴 A ordem não é arbitrária. `{{campo:}}` vem depois das referências porque o VALOR é a
 * única coisa que vem de dado digitado por alguém — um valor contendo `{{` viraria referência
 * se fosse resolvido antes. Resolvendo-o depois, não há esse caminho.
 *
 * 🔵 Extraída do `EditalStudio` em 2026-11-16, sem mudança de comportamento.
 */
export function resolverMarcadores(texto: string, ctx: ContextoDeResolucao): string {
  // As quatro REFERÊNCIAS primeiro (todas números calculados pelo sistema); o valor
  // digitado por alguém, por último. 🔵 Anexo e quadro entraram em 2026-11-16.
  const referencias = resolverReferenciasDeQuadro(
    resolverReferenciasDeAnexo(
      resolverReferenciasDeItem(resolverReferencias(texto, ctx.documento), ctx.ancoras),
      ctx.anexos,
    ),
    ctx.quadros,
  );
  return resolverARedigir(resolverCampos(referencias, ctx.valores ?? new Map()));
}

// ─────────────────────────────────────────────────────────────────────────────
// OS QUADROS
// ─────────────────────────────────────────────────────────────────────────────

export interface ColunaDoQuadro {
  titulo: string;
  /** Alinha à direita, com algarismos tabulares. */
  numerica: boolean;
}

/**
 * Uma tabela gerada, pronta para qualquer saída.
 *
 * As células são TEXTO, e podem levar `**negrito**` — a mesma marcação dos artigos, que
 * `segmentarNegrito` sabe ler. É o único recurso de formatação do edital (medido: 265
 * marcadores no Edital 004 e nenhum outro).
 *
 * 🔴 `pendencia` preenchida = o quadro NÃO tem linha. Toda saída tem de mostrá-la; nunca
 * um espaço em branco, que é indistinguível de um quadro que não existe.
 */
export interface QuadroMontado {
  fonte: string;
  colunas: ColunaDoQuadro[];
  linhas: string[][];
  pendencia: string | null;
}

/** Os dados crus de que os cinco quadros precisam — o que os hooks devolvem. */
export interface DadosDosQuadros {
  cargosDoEdital: readonly {
    id: string;
    cargo_id: string;
    habilitacao: string | null;
    vagas_total: number | null;
    vagas_ampla_concorrencia: number | null;
    vagas_pcd: number | null;
    vagas_negros: number | null;
    vencimento_base: number | null;
  }[];
  /** `cargos.id` → nome. */
  nomesDosCargos: ReadonlyMap<string, string>;
  disciplinas: readonly (Disciplina & { id: string; edital_cargo_id: string })[];
  titulos: readonly (TituloItem & { id: string; edital_cargo_id: string })[];
  distribuicao: readonly (VagasNaUnidade & { id: string; edital_cargo_id: string })[];
  /** `unidades_lotacao.id` → nome. */
  nomesDasUnidades: ReadonlyMap<string, string>;
  etapas: readonly (Pick<EtapaCronograma, "nome_evento" | "tipo" | "datas"> & { id: string })[];
}

const col = (titulo: string, numerica = false): ColunaDoQuadro => ({ titulo, numerica });
const ouTraco = (v: string | number | null | undefined) => (v === null || v === undefined ? "—" : String(v));

function pendente(fonte: string, colunas: ColunaDoQuadro[], motivo: string): QuadroMontado {
  return { fonte, colunas, linhas: [], pendencia: motivo };
}

export function quadroDeCargos(d: DadosDosQuadros): QuadroMontado {
  const colunas = [
    col("Cargo"), col("Habilitação"), col("Vagas", true), col("AC", true),
    col("PcD", true), col("Negros", true), col("Vencimento", true),
  ];
  if (d.cargosDoEdital.length === 0) {
    return pendente("cargos", colunas, "Nenhum cargo no Quadro de Cargos — a tabela sairia vazia.");
  }
  return {
    fonte: "cargos",
    colunas,
    pendencia: null,
    linhas: d.cargosDoEdital.map((c) => [
      d.nomesDosCargos.get(c.cargo_id) ?? "(cargo fora do catálogo)",
      ouTraco(c.habilitacao),
      ouTraco(c.vagas_total),
      ouTraco(c.vagas_ampla_concorrencia),
      ouTraco(c.vagas_pcd),
      ouTraco(c.vagas_negros),
      c.vencimento_base === null
        ? "—"
        : c.vencimento_base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    ]),
  };
}

export function matrizDaProva(d: DadosDosQuadros): QuadroMontado {
  const colunas = [col("Cargo"), col("Disciplina"), col("Questões", true), col("Peso por questão", true)];
  if (d.disciplinas.length === 0) {
    return pendente("disciplinas", colunas, "Nenhuma disciplina na matriz da prova — a tabela sairia vazia.");
  }
  return {
    fonte: "disciplinas",
    colunas,
    pendencia: null,
    // A ordem é a do Quadro de Cargos, e dentro dele a da matriz: é a ordem do documento.
    linhas: d.cargosDoEdital.flatMap((ec) =>
      d.disciplinas
        .filter((x) => x.edital_cargo_id === ec.id)
        .map((x) => [
          d.nomesDosCargos.get(ec.cargo_id) ?? "(cargo)",
          x.nome_disciplina,
          String(x.quantidade_questoes),
          String(x.peso_por_questao),
        ]),
    ),
  };
}

/**
 * Os Quadros III e IV, de `titulos_itens`.
 *
 * ⚠️ **UMA LINHA POR CARGO, e isso diverge do publicado por ESCOLHA.** O Quadro III do
 * Edital 002 junta os 8 cargos de Docente I numa linha só. Perguntado em 2026-09-16, o
 * usuário decidiu não agrupar. Não é descuido — está registrado no doc do módulo.
 */
export function quadroDeTitulos(d: DadosDosQuadros): QuadroMontado {
  const colunas = [col("Cargos"), col("Títulos aferíveis"), col("Pontuação mínima", true), col("Pontuação máxima", true)];
  if (d.titulos.length === 0) {
    return pendente("titulos", colunas, "Nenhum título parametrizado — a tabela sairia vazia.");
  }
  return {
    fonte: "titulos",
    colunas,
    pendencia: null,
    linhas: d.cargosDoEdital.flatMap((ec) =>
      d.titulos
        .filter((t) => t.edital_cargo_id === ec.id)
        .map((t) => [
          d.nomesDosCargos.get(ec.cargo_id) ?? "(cargo)",
          t.descricao +
            (t.area_exigida ? ` — **${t.area_exigida}**` : "") +
            (t.carga_horaria_minima_horas ? `, carga horária mínima de ${t.carga_horaria_minima_horas} horas` : ""),
          String(t.pontos_minimo),
          String(t.pontos_maximo),
        ]),
    ),
  };
}

/**
 * O Quadro II do Edital 004: vagas por unidade, de `edital_cargo_unidades`.
 *
 * ⚠️ Uma linha por (cargo, unidade), como o documento. O cargo só entra no rótulo quando o
 * edital tem mais de um — e as vagas reservadas saem em BRANCO quando zero, como no publicado.
 */
export function vagasPorArea(d: DadosDosQuadros): QuadroMontado {
  const colunas = [col("Unidade"), col("Código da inscrição"), col("Vagas AC", true), col("Vagas PD", true), col("Vagas CN", true)];
  if (d.distribuicao.length === 0) {
    return pendente("vagas_por_area", colunas, "Nenhuma vaga distribuída por unidade — a tabela sairia vazia.");
  }
  const variosCargos = d.cargosDoEdital.length > 1;
  return {
    fonte: "vagas_por_area",
    colunas,
    pendencia: null,
    linhas: d.cargosDoEdital.flatMap((ec) =>
      d.distribuicao
        .filter((v) => v.edital_cargo_id === ec.id)
        .map((v) => [
          (d.nomesDasUnidades.get(v.unidade_lotacao_id) ?? "(unidade)") +
            (variosCargos ? ` — ${d.nomesDosCargos.get(ec.cargo_id) ?? "(cargo)"}` : ""),
          ouTraco(v.codigo_inscricao),
          String(v.vagas_ampla_concorrencia),
          v.vagas_pcd ? String(v.vagas_pcd) : "",
          v.vagas_negros ? String(v.vagas_negros) : "",
        ]),
    ),
  };
}

/**
 * O cronograma. A forma da data sai de `formatarDatasDaEtapa` — a MESMA que o marcador
 * `{{campo:cronograma_*}}` usa: duas implementações da mesma forma divergem no dia em que
 * uma for corrigida (aconteceu em 18/09, com o dia da semana saindo como índice).
 */
export function quadroDoCronograma(d: DadosDosQuadros): QuadroMontado {
  const colunas = [col("Etapa"), col("Data")];
  if (d.etapas.length === 0) {
    return pendente("cronograma", colunas, "Cronograma sem nenhuma etapa — a tabela sairia vazia.");
  }
  return {
    fonte: "cronograma",
    colunas,
    pendencia: null,
    linhas: d.etapas.map((e) => [
      e.nome_evento,
      e.datas.length === 0 ? "— sem data" : formatarDatasDaEtapa(e, { comDiaDaSemana: true }),
    ]),
  };
}

/**
 * Escolhe o quadro pela fonte.
 *
 * Fonte fora das cinco só acontece se alguém acrescentar um valor à CHECK
 * `chk_edital_item_quadro_fonte` sem renderizá-lo — e aí a pendência DIZ isso.
 */
export function montarQuadro(fonte: string, d: DadosDosQuadros): QuadroMontado {
  switch (fonte as QuadroFonte) {
    case "cargos": return quadroDeCargos(d);
    case "disciplinas": return matrizDaProva(d);
    case "titulos": return quadroDeTitulos(d);
    case "vagas_por_area": return vagasPorArea(d);
    case "cronograma": return quadroDoCronograma(d);
    default: return pendente(fonte, [], `Fonte de quadro desconhecida: ${fonte}.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O DOCUMENTO
// ─────────────────────────────────────────────────────────────────────────────

export interface ArtigoMontado {
  id: string;
  /** `""` para `prosa` e para artigo de capítulo não numerado. */
  numero: string;
  nivel: number;
  tipo: string;
  /** Já com os quatro marcadores resolvidos. Pode ter `**negrito**`. */
  texto: string;
  /** Só em `tipo = 'quadro'`. `null` também quando o dado dos quadros não foi passado. */
  quadro: QuadroMontado | null;
  /**
   * O número do quadro no documento, em romano (`I`, `II`), em todo artigo `quadro` —
   * mesmo sem o dado da tabela: a numeração depende só da posição. `null` nos demais.
   */
  numeroDoQuadro: string | null;
}

export interface CapituloMontado {
  chave: string;
  titulo: string;
  numero: number | null;
  artigos: ArtigoMontado[];
}

/** Os dados crus dos dois anexos. */
export interface DadosDosAnexos {
  ementas: readonly (Ementa & { ordem: number })[];
  abrangencia: readonly { id: string; unidade_lotacao_id: string; bairro: string | null; logradouro: string; ordem: number }[];
}

/** Um bloco do conteúdo programático: as comuns (`cargo: null`) ou as de um cargo. */
export interface BlocoDeConteudo {
  cargo: string | null;
  disciplinas: { nome: string; ementa: string }[];
}

/** Uma unidade do anexo de abrangência, com as ruas agrupadas por bairro. */
export interface UnidadeDeAbrangencia {
  unidade: string;
  secoes: { bairro: string | null; logradouros: string[] }[];
}

export interface AnexoMontado {
  chave: ChaveDeAnexo;
  /** Em romano. */
  numero: string;
  titulo: string;
  /** `null` quando o dado não foi passado; preenchido quando passado (pode ser vazio). */
  conteudo: BlocoDeConteudo[] | null;
  abrangencia: UnidadeDeAbrangencia[] | null;
  /** 🔴 Preenchida quando o anexo não tem nenhuma linha — nunca um anexo em branco. */
  pendencia: string | null;
}

/**
 * O que o cabeçalho lê de `editais` — as colunas CRUAS, não o mapa de valores: a 2ª linha
 * (`secretaria_publicadora`) não é marcador, e o porquê de um número não compor
 * (`problemaDoNumero`) precisa do valor gravado.
 */
export interface DadosDoCabecalho {
  numero_edital: string | null;
  ano: number | null;
  secretaria_sigla: string | null;
  secretaria_publicadora: string | null;
  natureza_juridica: string | null;
  orgao_demandante: string | null;
}

export interface CabecalhoMontado {
  /** As linhas que SAEM, na ordem, já na forma impressa. */
  linhas: string[];
  /** O que falta para o cabeçalho sair inteiro — cada uma nomeia onde preencher. */
  pendencias: string[];
}

/** Literal, como no parágrafo de abertura: o município é o mesmo em todo certame desta banca. */
export const MUNICIPIO_DO_CABECALHO = "MUNICÍPIO DE VOLTA REDONDA";

/**
 * O cabeçalho pré-textual (E2, 2026-11-20) — DERIVADO, nunca digitado.
 *
 * Medido nos publicados (`my_rules/modulo_editais/`):
 *
 * | linha | 002 | 003 | daqui |
 * |---|---|---|---|
 * | `MUNICÍPIO DE VOLTA REDONDA` | ✅ | ✅ | literal (e sem o zero no lugar do O que os dois têm) |
 * | `SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO` | ✅ | — | `secretaria_publicadora`, só se preenchida |
 * | `CONCURSO PÚBLICO PARA A SECRETARIA …` | ✅ | ✅ | natureza + **`PARA`** + órgão demandante |
 * | `Edital Nº. 002/2026-SMA` | ✅ | ✅ | `comporNumeroDoEdital` |
 *
 * ⚠️ **Divergência deliberada: `PARA`, sem o artigo `A`** (decisão do usuário, 2026-11-20).
 * O artigo depende do gênero do órgão, e o modelo já erra isso entre capítulos ("para a
 * {órgão}" no comprovante, "a critério do {órgão}" nas disposições gerais).
 *
 * As três primeiras saem em CAIXA ALTA, como nos publicados — é tipografia desta posição, o
 * mesmo campo que o parágrafo de abertura escreve em forma de título. A do número não: o
 * publicado escreve "Edital Nº.".
 *
 * Linha que falta NÃO vira linha em branco: some, e entra em `pendencias`, que o portão
 * cobra e a prévia/o Markdown mostram. A da secretaria é a exceção — ela é opcional (o 003
 * não a tem), então ausência é forma válida, não pendência.
 */
export function montarCabecalho(d: DadosDoCabecalho): CabecalhoMontado {
  const caixaAlta = (t: string) => t.toLocaleUpperCase("pt-BR");
  const linhas = [MUNICIPIO_DO_CABECALHO];
  const pendencias: string[] = [];

  const secretaria = formatarTexto(d.secretaria_publicadora);
  if (secretaria) linhas.push(caixaAlta(secretaria));

  const natureza = formatarNatureza(d.natureza_juridica);
  const orgao = formatarTexto(d.orgao_demandante);
  if (natureza && orgao) linhas.push(caixaAlta(`${natureza} para ${orgao}`));
  else {
    const falta = [!natureza && "a natureza jurídica", !orgao && "o órgão demandante"].filter(Boolean).join(" e ");
    pendencias.push(`Cabeçalho sem a linha do certame: falta ${falta} (preencha no Preâmbulo).`);
  }

  const numero = comporNumeroDoEdital({ numero: d.numero_edital, ano: d.ano, sigla: d.secretaria_sigla });
  if (numero) linhas.push(`Edital Nº. ${numero}`);
  else {
    pendencias.push(
      `Cabeçalho sem o número do edital: ${
        problemaDoNumero(d.numero_edital) ?? "preencha o número e o ano no Preâmbulo."
      }`,
    );
  }
  return { linhas, pendencias };
}

export interface DocumentoMontado {
  /** O cabeçalho pré-textual, antes do primeiro capítulo. */
  cabecalho: CabecalhoMontado;
  /** Só os capítulos INCLUÍDOS, na ordem do documento. */
  capitulos: CapituloMontado[];
  /** Os anexos que entram, numerados, na ordem em que saem — depois do último capítulo. */
  anexos: AnexoMontado[];
}

/**
 * O conteúdo programático: primeiro as ementas COMUNS, depois as de cada cargo, na ordem
 * do Quadro de Cargos.
 *
 * Medido: o Edital 002 abre com *"LÍNGUA PORTUGUESA (COMUM A TODOS OS CARGOS)"* e depois
 * lista por cargo; o 004 agrupa sob *"CARGO: AGENTE COMUNITÁRIO DE SAÚDE"*.
 *
 * ⚠️ Ementa de cargo que NÃO está no Quadro de Cargos deste edital não some: entra no fim,
 * pelo nome do cargo. Descartá-la seria perda silenciosa; quem acusa a sobra é o painel do
 * conteúdo programático (`conferirConteudo`).
 */
export function blocosDoConteudo(d: DadosDosQuadros, a: DadosDosAnexos): BlocoDeConteudo[] {
  const ordenadas = [...a.ementas].sort((x, y) => x.ordem - y.ordem || x.id.localeCompare(y.id));
  const disc = (es: typeof ordenadas) => es.map((e) => ({ nome: e.nome_disciplina, ementa: e.texto_ementa }));

  const blocos: BlocoDeConteudo[] = [];
  const comuns = ordenadas.filter((e) => e.aplica_a_todos_os_cargos);
  if (comuns.length > 0) blocos.push({ cargo: null, disciplinas: disc(comuns) });

  const doEdital = d.cargosDoEdital.map((ec) => ec.cargo_id);
  const outros = [...new Set(ordenadas.filter((e) => !e.aplica_a_todos_os_cargos && e.cargo_id).map((e) => e.cargo_id!))]
    .filter((id) => !doEdital.includes(id))
    .sort((x, y) => (d.nomesDosCargos.get(x) ?? "").localeCompare(d.nomesDosCargos.get(y) ?? "", "pt-BR"));

  for (const cargoId of [...new Set(doEdital), ...outros]) {
    const doCargo = ordenadas.filter((e) => !e.aplica_a_todos_os_cargos && e.cargo_id === cargoId);
    if (doCargo.length > 0) {
      blocos.push({ cargo: d.nomesDosCargos.get(cargoId) ?? "(cargo fora do catálogo)", disciplinas: disc(doCargo) });
    }
  }
  return blocos;
}

/**
 * A abrangência: uma seção por unidade, as ruas agrupadas por bairro na ordem publicada.
 *
 * As unidades saem na ordem do Quadro de vagas por área (a do cargo, e dentro dele a da
 * distribuição) — é a ordem em que o candidato as viu ao escolher. Unidade com rua e sem
 * vaga distribuída vai para o fim, pelo nome: não some.
 */
export function unidadesDaAbrangencia(d: DadosDosQuadros, a: DadosDosAnexos): UnidadeDeAbrangencia[] {
  const porUnidade = new Map<string, DadosDosAnexos["abrangencia"][number][]>();
  for (const l of a.abrangencia) porUnidade.set(l.unidade_lotacao_id, [...(porUnidade.get(l.unidade_lotacao_id) ?? []), l]);

  const nome = (id: string) => d.nomesDasUnidades.get(id) ?? "(unidade)";
  const naDistribuicao = [
    ...new Set(
      d.cargosDoEdital.flatMap((ec) =>
        d.distribuicao.filter((v) => v.edital_cargo_id === ec.id).map((v) => v.unidade_lotacao_id),
      ),
    ),
  ].filter((id) => porUnidade.has(id));
  const resto = [...porUnidade.keys()]
    .filter((id) => !naDistribuicao.includes(id))
    .sort((x, y) => nome(x).localeCompare(nome(y), "pt-BR"));

  return [...naDistribuicao, ...resto].map((id) => ({
    unidade: nome(id),
    secoes: agruparPorBairro(porUnidade.get(id)!).map((s) => ({
      bairro: s.bairro,
      logradouros: s.logradouros.map((l) => l.logradouro),
    })),
  }));
}

/** Como o número do artigo é escrito: `7.1. `, `7.1.2. `, alínea `a) `. Prosa não tem. */
export function rotuloDoNumero(artigo: Pick<ArtigoMontado, "numero" | "nivel">): string {
  if (!artigo.numero) return "";
  return artigo.nivel === 2 ? `${artigo.numero}) ` : `${artigo.numero}. `;
}

/**
 * Monta o documento inteiro.
 *
 * `quadros` é `undefined` quando o dado dos quadros não importa (ou ainda não chegou):
 * aí os artigos `quadro` saem com `quadro: null`, e quem desenha decide o que fazer.
 */
export function montarEditalCompleto(entrada: {
  documento: readonly CapituloResolvido[];
  porCapitulo: ReadonlyMap<string, readonly ItemBruto[]>;
  valores: ReadonlyMap<string, string> | undefined;
  quadros: DadosDosQuadros | undefined;
  /** Os dois anexos. `undefined` → os anexos saem numerados, mas sem conteúdo (`null`). */
  anexos?: DadosDosAnexos;
  /**
   * As colunas do cabeçalho. OBRIGATÓRIO, sem padrão: um cabeçalho implícito vazio seria a
   * E2 voltando — o documento saindo sem ele e sem ninguém notar.
   */
  cabecalho: DadosDoCabecalho;
}): DocumentoMontado {
  const { documento, porCapitulo, valores, quadros } = entrada;
  const itensDe = (chave: string) => ordenarItens([...(porCapitulo.get(chave) ?? [])]);
  const comItens = documento.map((c) => ({ chave: c.chave, numero: c.numero, incluido: c.incluido, itens: itensDe(c.chave) }));

  const ancoras = mapaDeAncoras(ancorasDoDocumento(comItens));
  const numerosDeQuadro = quadrosDoDocumento(comItens);
  const quadroDoItem = new Map(numerosDeQuadro.map((q) => [q.itemId, q.numero]));
  const anexosNumerados = anexosDoDocumento(documento);
  const ctx: ContextoDeResolucao = {
    documento,
    ancoras,
    anexos: mapaDeAnexos(anexosNumerados),
    quadros: mapaDeQuadros(numerosDeQuadro),
    valores,
  };

  const anexos: AnexoMontado[] = anexosNumerados.map((a) => {
    const dados = quadros && entrada.anexos ? { q: quadros, a: entrada.anexos } : null;
    const conteudo = a.chave === "conteudo_programatico" && dados ? blocosDoConteudo(dados.q, dados.a) : null;
    const abrangencia = a.chave === "abrangencia" && dados ? unidadesDaAbrangencia(dados.q, dados.a) : null;
    const vazio = (conteudo !== null && conteudo.length === 0) || (abrangencia !== null && abrangencia.length === 0);
    return {
      ...a,
      conteudo,
      abrangencia,
      pendencia: !vazio
        ? null
        : a.chave === "conteudo_programatico"
          ? "Nenhuma ementa cadastrada no conteúdo programático — o anexo sairia vazio."
          : "Nenhum logradouro importado nas áreas de abrangência — o anexo sairia vazio.",
    };
  });

  return {
    cabecalho: montarCabecalho(entrada.cabecalho),
    anexos,
    capitulos: documento
      .filter((c) => c.incluido)
      .map((c) => ({
        chave: c.chave,
        titulo: c.titulo,
        numero: c.numero,
        artigos: numerarItens(itensDe(c.chave), c.numero).map((i) => ({
          id: i.id,
          numero: i.numero,
          nivel: i.nivel,
          tipo: i.tipo,
          texto: resolverMarcadores(i.texto ?? "", ctx),
          quadro: i.tipo === "quadro" && quadros ? montarQuadro(i.quadro_fonte ?? "", quadros) : null,
          numeroDoQuadro: quadroDoItem.get(i.id) ?? null,
        })),
      })),
  };
}
