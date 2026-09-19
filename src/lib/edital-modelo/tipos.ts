/**
 * A forma de um capítulo do EDITAL MODELO.
 *
 * ## Por que o texto é autorado aqui, se o modelo mora no banco
 *
 * O modelo é uma linha de `editais` e é lá que ele vive: é de lá que se clona e é lá que a
 * FEVRE o edita pela tela (decisão do usuário, 2026-09-18). Mas 300+ artigos escritos direto
 * num `INSERT` não passam por `npm test` — e a transcrição é justamente a parte que precisa
 * de portão automático, porque é onde se erra.
 *
 * Então o fluxo tem UMA direção só, igual ao de `20260712134220_seed_funcoes_basicas`:
 *
 *     este arquivo  →  migration (gerada daqui)  →  banco  →  a UI edita
 *      autoria,                nascimento             dono em runtime
 *      diff, Vitest
 *
 * Depois do nascimento **o banco é o dono**. Editar o modelo pela tela faz o banco divergir
 * daqui, e isso é consequência ACEITA: a migration é o nascimento, não o espelho. Não tente
 * "sincronizar de volta".
 *
 * ⚠️ O teste `edital-modelo.test.ts` confere que a migration commitada corresponde a este
 * arquivo. É o que impede alguém de editar um lado só e o modelo nascer diferente do que a
 * suíte afirma.
 *
 * ## O número NUNCA aparece aqui
 *
 * `ordem` é o índice no array e `nivel` é a profundidade. O número publicado (`7.1`,
 * `7.2.1`, a alínea `a)`) é calculado por `numerarItens` na renderização — é o invariante
 * central do módulo, e o motivo é medido: capítulo condicional que não entra não ocupa
 * número, e todos abaixo sobem.
 */

/** Um artigo do modelo. `ordem` é a posição no array; ninguém a escreve. */
export interface ArtigoDoModelo {
  /** `item` é numerado · `prosa` é parágrafo sem número · `quadro` é tabela gerada. */
  tipo: "item" | "prosa" | "quadro";
  /** 0 = item · 1 = subitem · 2 = alínea. Irrelevante para `prosa`. */
  nivel?: 0 | 1 | 2;
  /** Só `**negrito**` é formatação. Marcadores: `{{cap:}}`, `{{item:}}`, `{{campo:}}`. */
  texto: string;
  /** Publica um alvo de `{{item:ancora}}`. Só onde outro artigo aponta. */
  ancora?: string;
  /** Obrigatório e exclusivo de `tipo: "quadro"` — a CHECK do banco é bicondicional. */
  quadroFonte?: "cargos" | "disciplinas" | "titulos" | "vagas_por_area" | "cronograma";
}

export interface CapituloDoModelo {
  /** A chave no catálogo de `src/lib/edital-capitulos.ts`. */
  chave: string;
  /** De onde o texto veio, com a data — é o que torna a procedência auditável. */
  fonte: string;
  /**
   * 🔴 Quantos artigos este capítulo tem NO MODELO.
   *
   * É o único teste que pega artigo **omitido** na transcrição. Nenhum dos outros nota uma
   * falta: o linter fica contente, a numeração continua coerente, e o capítulo sai do
   * sistema com um artigo a menos do que o edital real tem.
   */
  artigosEsperados: number;
  /**
   * Quantos artigos o capítulo tem NA FONTE, quando o modelo tem outro número.
   *
   * 🔴 Existe porque um capítulo pode divergir da fonte com razão, e a divergência não pode
   * ser silenciosa. O caso que a criou é `atribuicoes_dos_cargos`: 28 artigos no Edital 004,
   * **todos de conteúdo específico do cargo** — transcrevê-los faria todo edital novo nascer
   * com as atribuições de Agente Comunitário de Saúde. O modelo leva um molde de 4 artigos.
   *
   * ⚠️ Preenchê-la OBRIGA a preencher `porQueDiverge` — o teste exige o par. Sem isso, a
   * diferença entre "divergi de propósito" e "esqueci 24 artigos" ficaria invisível.
   */
  artigosNaFonte?: number;
  /** O motivo da divergência, em uma frase. Obrigatório se `artigosNaFonte` existir. */
  porQueDiverge?: string;
  /** Os `{{campo:}}` que este capítulo usa. Teste confere contra o catálogo. */
  camposUsados: readonly string[];
  /** As âncoras que este capítulo PUBLICA. Teste confere que são únicas no modelo. */
  ancorasPublicadas: readonly string[];
  /** As âncoras que ele CONSOME de outros capítulos. Teste confere que existem. */
  ancorasConsumidas: readonly string[];
  artigos: readonly ArtigoDoModelo[];
}
