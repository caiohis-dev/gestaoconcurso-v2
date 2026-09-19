/**
 * Capítulo `atribuicoes_dos_cargos` — o capítulo 3 do documento.
 *
 * 🔴 **É o primeiro capítulo em que o modelo DIVERGE da fonte, e a razão é o tema inteiro.**
 * O capítulo 3 do Edital 004 tem **28 artigos**, e **todos** são conteúdo específico do cargo:
 * o que um Agente Comunitário de Saúde faz, em 24 incisos. Transcrevê-los faria cada edital
 * novo nascer com as atribuições de ACS — e um edital de magistério publicaria "atuar com
 * adscrição de famílias em base territorial definida". É o defeito do COREN levado à escala do
 * capítulo inteiro.
 *
 * O modelo leva um **molde de 4 artigos**, que o autor duplica por cargo.
 *
 * ── 🔴 MEDIDO: os dois cargos do MESMO documento têm formas DIFERENTES ────────────────
 *
 *     3.1. AGENTE COMUNITÁRIO DE SAÚDE          3.2. ATRIBUIÇÕES DO AGENTE DE COMBATE…
 *          (parágrafo de descrição)                   3.2.1. DESCRIÇÃO SINTÉTICA:
 *          3.1.1. Atribuições:
 *          I. … (24 incisos)
 *
 * Um bloco chama o cargo pelo nome e o outro escreve "ATRIBUIÇÕES DO"; um rotula "Atribuições:"
 * e o outro "DESCRIÇÃO SINTÉTICA:". É o quinto achado de copia-e-cola deste tema, e é o
 * argumento para o molde ser **um só**: o modelo não reproduz a inconsistência, ele a remove.
 *
 * ── 🔵 E aqui o CASO ESPECIAL DOS NUMERAIS ROMANOS se DISSOLVE ────────────────────────
 *
 * O plano previa uma decisão para este capítulo: os 24 incisos entrariam como `prosa` com o
 * numeral romano literal, porque `nivel 2` rende **letra** e não romano. Isso presumia
 * transcrever a lista do 004 — e esta rodada mostra que não se deve.
 *
 * Com a lista virando `{{redigir:}}`, não há 24 romanos a transcrever. O que sobra é a pergunta
 * pelo outro lado: **em que nível o autor escreve a lista dele?** A resposta é `nivel 2`,
 * alínea em **letra**, e a divergência de estilo em relação ao publicado é deliberada:
 *
 * | | |
 * |---|---|
 * | alínea em letra (`a`, `b`, `c`) | **calculada** por `numerarItens`; inserir no meio renumera |
 * | romano (`I`, `II`, `III`) | teria de ser **digitado**, e é o que o módulo existe para matar |
 *
 * ⏳ A dívida fica registrada com gatilho: **se um segundo capítulo precisar de romano, ou se
 * alguma referência passar a apontar para dentro deste, abrir a fatia de estilo de numeração.**
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const ATRIBUICOES_DOS_CARGOS: CapituloDoModelo = {
  chave: "atribuicoes_dos_cargos",
  fonte: "Edital 004/2026, capítulo 3 — molde, não transcrição (ver o cabeçalho)",
  artigosEsperados: 4,
  artigosNaFonte: 28,
  porQueDiverge:
    "Os 28 artigos do Edital 004 são atribuições de Agente Comunitário de Saúde; transcritos, " +
    "todo edital novo nasceria com elas. O modelo leva um molde que o autor duplica por cargo.",
  camposUsados: [],
  ancorasPublicadas: ["atribuicoes_por_cargo"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      ancora: "atribuicoes_por_cargo",
      // ⚠️ O nome do cargo é `{{redigir:}}` e NÃO `{{campo:cargos_do_edital}}`: aquele campo
      // rende TODOS os cargos numa frase, e aqui o bloco é de UM cargo. Um marcador que
      // resolvesse para a lista inteira faria o capítulo dizer, em cada bloco, o nome de todos.
      texto: "**{{redigir:o nome do cargo a que este bloco se refere}}**",
    },
    {
      // `prosa`: a descrição sumária não recebe número no publicado, nos dois blocos do 004.
      tipo: "prosa",
      texto:
        "{{redigir:a descrição sumária deste cargo — o que a pessoa faz, em um parágrafo, e sob " +
        "quais diretrizes legais}}",
    },
    {
      tipo: "item",
      nivel: 1,
      texto: "Atribuições:",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "{{redigir:uma atribuição do cargo — duplique esta alínea para cada atribuição, e o " +
        "sistema reletra todas sozinho}}",
    },
  ],
};
