/**
 * O TERCEIRO marcador do módulo: `{{campo:chave}}` — o dado variável dentro do texto.
 *
 * 🔴 **Por que ele existe.** Até 2026-09-18 só havia duas sintaxes, e as duas resolviam
 * NÚMERO, não valor: `{{cap:chave}}` (`edital-numeracao.ts`) e `{{item:ancora}}`
 * (`edital-itens.ts`). Data, prazo, endereço e valor eram literais digitados em
 * `edital_itens.texto` — e a única proteção era a regra `placeholder-nao-preenchido`,
 * que pega marcador NÃO PREENCHIDO (`XX`), nunca valor ERRADO.
 *
 * O caso que prova a diferença está publicado: o item 10.10 do Edital 003/2026 diz que o
 * lactente tem de ter nascido "a partir do dia 16 de março de 2026, considerando o limite
 * de até 6 meses na data de realização da prova (16 de setembro de 2026)" — mas o
 * cronograma do mesmo edital marca a prova em **20/09**. O 16/09 é a data do comprovante
 * de local de prova. Com a prova em 20/09, o corte correto é 20 de março, e uma candidata
 * cujo bebê nasceu em 18/03 seria recusada por engano. Nenhum `XX` aparece ali: o valor
 * está preenchido, formatado e errado.
 *
 * ## O contrato, idêntico ao das outras duas resoluções
 *
 * O que não resolve vira marcador **VISÍVEL** — `[?campo:chave]`. Nunca some, nunca
 * inventa valor. Sumir em silêncio é o formato de erro que este repo mais teme, e um
 * valor inventado seria pior ainda. Quem acusa é o linter.
 *
 * ## 🔴 `{{campo:}}` é ESCALAR e POR EDITAL. Não existe qualificador por cargo.
 *
 * **Medido nos três editais reais em 2026-09-18:** valor que varia por cargo NUNCA
 * aparece como escalar numa frase. Ele sai como lista de alíneas, uma por cargo:
 *
 *     002, item 5.23:  A) Docente I  – R$ 100,00 (cem reais)
 *                      B) Docente II – R$  80,00 (oitenta reais)
 *     004, item 6.20:  a) Agente Comunitário de Saúde – R$ 80,00 (oitenta reais)
 *                      b) Agente de Combate às Endemias – R$ 80,00 (oitenta reais)
 *
 * O item 2.4 do Edital 004 escreve `R$ 3.036,00` em prosa **só porque os dois cargos têm
 * o mesmo vencimento** — com valores diferentes, a frase estaria errada.
 *
 * Por isso não há `{{campo:taxa@AG1}}`: construir mecanismo para um formato que o mundo
 * real não usa é o oposto do "meça antes de desenhar". Lista por cargo é artigo gerado.
 *
 * ## Ausente e vazio são a MESMA coisa, de propósito
 *
 * O mapa de valores é `Map<string, string>` e **string vazia nunca entra nele** — quem o
 * monta descarta `null`, `undefined` e `""`. Um `""` renderizaria um buraco invisível no
 * meio da frase, que é perda silenciosa; `[?campo:x]` é feio, e é por isso que funciona.
 */
import { ETAPAS_SUGERIDAS } from "@/lib/edital-cronograma";

export type FormatoCampo =
  /** Uma ou mais datas de uma etapa do cronograma, na forma que o TIPO dela manda. */
  | "periodo"
  /** `2026-06-29` → `29 de junho de 2026` — o fecho do documento. */
  | "data_extenso"
  /** `80` → `R$ 80,00` */
  | "moeda"
  /** `16:00:00` → `16 horas` */
  | "hora"
  | "inteiro"
  | "texto";

export interface CampoCatalogo {
  /** O que se digita: `{{campo:data_da_prova}}`. */
  chave: string;
  /** Como o campo se chama na paleta de inserção da tela. */
  rotulo: string;
  formato: FormatoCampo;
  /**
   * De onde o valor sai, em texto. É DOCUMENTAL — ninguém resolve nada a partir daqui;
   * quem monta o mapa é `useCamposDoEdital`. Serve para revisar o catálogo em diff e
   * para o `docs:conferir` ter o que conferir.
   */
  fonte: string;
  /**
   * 🔴 A CHAVE DO CAPÍTULO cujo editor preenche este valor.
   *
   * É o que torna a mensagem do linter acionável: em vez de "o campo data_da_prova está
   * vazio", ela diz onde ir preencher. O §2 do CLAUDE.md é explícito sobre isso — "a
   * mensagem tem de chegar ao usuário, nomeando o que fazer; já foi dívida duas vezes".
   */
  ondeSePreenche: string;
}

/**
 * Os campos do CRONOGRAMA saem do catálogo de etapas, não são escritos à mão.
 *
 * 🔴 **E é isto que torna impossível o erro que mais preocupa aqui.** Se as etapas
 * virassem entradas manuais, alguém acrescentaria `{{campo:entrega_titulos_inicio}}` e
 * `_fim` — e a entrega de títulos é ALTERNATIVAS (dois dias à ESCOLHA do candidato, não
 * uma janela). O documento passaria a dizer "de 22 a 23 de julho", que é outra coisa, e
 * nenhum teste pegaria porque a frase é plausível.
 *
 * Gerando daqui, só existe UM campo por etapa, de formato `periodo`, e a forma sai do
 * `tipo` da etapa em tempo de renderização. Não há `_inicio` nem `_fim` para escrever.
 */
const CAMPOS_DO_CRONOGRAMA: readonly CampoCatalogo[] = ETAPAS_SUGERIDAS.map((e) => ({
  chave: `cronograma_${e.chave}`,
  rotulo: e.nome,
  formato: "periodo" as const,
  fonte: `cronograma_etapas.datas WHERE chave = '${e.chave}'`,
  ondeSePreenche: "anexos",
}));

/**
 * Os campos ESCALARES do edital.
 *
 * ⚠️ A lista cresce uma rodada de capítulo por vez, e a regra para admitir um campo novo
 * é dupla: ele **varia entre editais** E (**repete-se em mais de um lugar** OU **é data
 * ou valor**). Um endereço citado uma vez é texto do documento, não campo — o modelo é um
 * documento, não um formulário.
 *
 * Os cinco primeiros nasceram na rodada 0 porque são transversais e medidos: a sede da
 * FEVRE aparece **7 vezes** no Edital 004 e o site **9 vezes**, espalhados por capítulos
 * diferentes. Fatiá-los por capítulo só multiplicaria migrations.
 */
const CAMPOS_DO_EDITAL: readonly CampoCatalogo[] = [
  {
    chave: "numero_edital",
    rotulo: "Número do edital",
    formato: "texto",
    fonte: "editais.numero_edital",
    ondeSePreenche: "preambulo",
  },
  {
    chave: "orgao_demandante",
    rotulo: "Órgão demandante",
    formato: "texto",
    fonte: "editais.orgao_demandante",
    ondeSePreenche: "preambulo",
  },
  {
    chave: "entidade_executora",
    rotulo: "Entidade executora",
    formato: "texto",
    fonte: "editais.entidade_executora",
    ondeSePreenche: "preambulo",
  },
  {
    chave: "decreto_autorizador",
    rotulo: "Decreto autorizador",
    formato: "texto",
    fonte: "editais.decreto_autorizador",
    ondeSePreenche: "preambulo",
  },
  {
    chave: "prazo_validade_anos",
    rotulo: "Prazo de validade (anos)",
    formato: "inteiro",
    fonte: "editais.prazo_validade_anos",
    ondeSePreenche: "disposicoes_gerais",
  },
  // ── Os cinco que não tinham casa antes de 2026-09-18 ────────────────────────────────
  {
    chave: "site_oficial",
    rotulo: "Site oficial do certame",
    formato: "texto",
    fonte: "editais.site_oficial",
    ondeSePreenche: "preambulo",
  },
  {
    chave: "executora_endereco",
    rotulo: "Endereço da entidade executora",
    formato: "texto",
    fonte: "editais.executora_endereco",
    ondeSePreenche: "preambulo",
  },
  {
    chave: "signatario_nome",
    rotulo: "Nome de quem assina",
    formato: "texto",
    fonte: "editais.signatario_nome",
    ondeSePreenche: "anexos",
  },
  {
    chave: "signatario_cargo",
    rotulo: "Cargo de quem assina",
    formato: "texto",
    fonte: "editais.signatario_cargo",
    ondeSePreenche: "anexos",
  },
  {
    chave: "data_publicacao",
    rotulo: "Data de publicação",
    formato: "data_extenso",
    fonte: "editais.data_publicacao",
    ondeSePreenche: "anexos",
  },
];

export const CAMPOS_CATALOGO: readonly CampoCatalogo[] = [
  ...CAMPOS_DO_EDITAL,
  ...CAMPOS_DO_CRONOGRAMA,
];

export const CAMPO_POR_CHAVE: ReadonlyMap<string, CampoCatalogo> = new Map(
  CAMPOS_CATALOGO.map((c) => [c.chave, c]),
);

/** A sintaxe no texto: `{{campo:data_publicacao}}`. Mesmo formato de chave das outras. */
export const RE_REFERENCIA_CAMPO = /\{\{campo:([a-z0-9_]+)\}\}/g;

export interface CampoDoTexto {
  chave: string;
  /** `false` = não está no catálogo. É typo de quem escreveu, não falta de quem preenche. */
  conhecido: boolean;
}

/** Os campos citados num texto, na ordem em que aparecem, com repetição. */
export function camposDoTexto(texto: string): CampoDoTexto[] {
  return [...texto.matchAll(RE_REFERENCIA_CAMPO)].map((m) => ({
    chave: m[1],
    conhecido: CAMPO_POR_CHAVE.has(m[1]),
  }));
}

/**
 * Troca `{{campo:chave}}` pelo valor.
 *
 * ⚠️ Recebe o mapa JÁ FORMATADO, e isto é escolha de arquitetura, não preguiça: é o que
 * mantém `src/lib/` puro. As duas resoluções irmãs têm a mesma forma — `resolverReferencias`
 * recebe o documento resolvido, `resolverReferenciasDeItem` recebe o mapa de âncoras.
 * Resolver por fonte aqui dentro arrastaria o `supabase` para dentro de `src/lib/`, e os
 * 15 arquivos `edital-*.ts` são função pura com os editais reais como fixture.
 *
 * ⚠️ **Esta resolução vem por ÚLTIMO na cadeia** (ver `EditalStudio`): um valor de texto
 * poderia conter `{{`, e resolvendo-o depois das outras duas ele nunca vira referência.
 */
export function resolverCampos(texto: string, valores: ReadonlyMap<string, string>): string {
  return texto.replace(RE_REFERENCIA_CAMPO, (_todo, chave: string) => {
    const v = valores.get(chave);
    return v ? v : `[?campo:${chave}]`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OS FORMATADORES
// ─────────────────────────────────────────────────────────────────────────────
//
// Todos devolvem `null` para valor ausente, e é `useCamposDoEdital` que descarta o nulo
// em vez de pôr string vazia no mapa. Um `""` no mapa resolveria o marcador para nada —
// o buraco invisível que este arquivo existe para não produzir.

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** `2026-06-29` → `29 de junho de 2026`. Sem `Date`: `new Date(iso)` é UTC e volta um dia. */
export function formatarDataExtenso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d || m < 1 || m > 12) return null;
  return `${String(d).padStart(2, "0")} de ${MESES[m - 1]} de ${a}`;
}

export function formatarMoeda(valor: number | string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * `16:00:00` → `16 horas` · `15:30:00` → `15h30`.
 *
 * As duas formas saem do documento real: o Edital 004 escreve "das 9 horas às 16 horas"
 * e também "às 15h30". A hora cheia é a forma dominante (12 das 14 menções medidas).
 */
export function formatarHora(hora: string | null | undefined): string | null {
  if (!hora) return null;
  const [h, min] = hora.split(":");
  if (h === undefined || min === undefined) return null;
  const hh = Number(h);
  if (!Number.isFinite(hh)) return null;
  return min === "00" ? `${hh} horas` : `${hh}h${min}`;
}

export function formatarInteiro(valor: number | null | undefined): string | null {
  return valor === null || valor === undefined || !Number.isFinite(valor) ? null : String(valor);
}

export function formatarTexto(valor: string | null | undefined): string | null {
  const t = valor?.trim();
  return t ? t : null;
}
