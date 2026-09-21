/**
 * Capítulo `disposicoes_gerais` — o capítulo 16 do documento.
 *
 * Fonte: **17 elementos** — 13 itens e 4 subitens. Transcrito por inteiro.
 *
 * ── 🔴 É AQUI QUE O DÉCIMO TERCEIRO DEFEITO FICA INDEFENSÁVEL ─────────────────────────
 *
 * O Edital 004 é um **Processo Seletivo Público**. Neste capítulo ele se chama:
 *
 * | item | como se chama |
 * |---|---|
 * | 16.2 · 16.6 · 16.7 · 16.11 | *"Concurso Público"* |
 * | 16.5 · 16.10 · 16.12 | *"Processo Seletivo (Público)"* |
 * | 16.3 | **os dois na mesma frase** — *"O Concurso Público contará com … dentro da validade deste Processo"* |
 *
 * **Oito ocorrências, duas naturezas, um documento só.** Some por construção: o modelo escreve
 * `{{campo:natureza_juridica}}`, e o valor vem de `editais.natureza_juridica` — a mesma coluna
 * que a tela usa para tudo. Não há como o documento discordar de si mesmo.
 *
 * ── O prazo de validade tem coluna desde a rodada 0 ───────────────────────────────────
 *
 * *"02 (dois) anos"* é `editais.prazo_validade_anos`, e o 16.4 fala do *"prazo previsto no item
 * anterior"* — que aqui é âncora, não vizinhança. Um artigo inserido entre os dois quebraria a
 * frase sem quebrar teste nenhum.
 *
 * ── ⚠️ O que ficou `{{redigir:}}`, e por quê ──────────────────────────────────────────
 *
 * - **o e-mail da impugnação** (`gabinete.fevre@…` no 004): é o segundo e-mail do documento e
 *   **não tem coluna** — `regras_vista_prova.email_solicitacao` é o da vista, e emprestá-lo
 *   mandaria a impugnação para a caixa errada. O teste do modelo proíbe e-mail literal, então
 *   instrução é a única saída honesta. ⏳ Backlog.
 * - **o órgão oficial de publicação** (*"Jornal Volta Redonda em Destaque"*) e o endereço do
 *   órgão demandante, pelo mesmo motivo do capítulo 15.
 *
 * ⚠️ **Os 3 anos de estabilidade ficam literais**: são do artigo 41 da Constituição, não do
 * certame.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const DISPOSICOES_GERAIS: CapituloDoModelo = {
  chave: "disposicoes_gerais",
  fonte: "Edital 004/2026, capítulo 16, transcrito em 2026-09-19",
  artigosEsperados: 17,
  camposUsados: [
    "site_oficial",
    "natureza_juridica",
    "entidade_executora",
    "orgao_demandante",
    "prazo_validade_anos",
  ],
  ancorasPublicadas: ["prazo_de_impugnacao", "validade_do_certame"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      ancora: "prazo_de_impugnacao",
      texto:
        "O candidato poderá impugnar os termos deste Edital perante a " +
        "**{{campo:entidade_executora}}** no prazo de **5 (cinco) dias úteis**, contados da data " +
        "de sua publicação.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "A impugnação deverá ser fundamentada e acompanhada de cópia do documento de identidade " +
        "do impugnante, protocolada por {{redigir:o e-mail institucional para protocolo de " +
        "impugnação — não é o e-mail da vista da folha de respostas}}.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Não serão aceitas impugnações intempestivas, fora do prazo do subitem " +
        "{{item:prazo_de_impugnacao}}, ou que não apresentem fundamentação lógica e jurídica.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "A decisão sobre a impugnação será divulgada oficialmente até a véspera do início das " +
        "inscrições, no endereço eletrônico **{{campo:site_oficial}}**, não cabendo recurso " +
        "administrativo contra tal decisão.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Os itens deste Edital poderão sofrer eventuais retificações, atualizações ou " +
        "acréscimos enquanto não consumada a providência ou o evento que lhes disser respeito.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "validade_do_certame",
      texto:
        "O **{{campo:natureza_juridica}}** terá validade de **{{campo:prazo_validade_anos}}** " +
        "ano(s), a contar da data da homologação do resultado, podendo ser prorrogado por igual " +
        "período, a critério do **{{campo:orgao_demandante}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O **{{campo:natureza_juridica}}** contará com um **cadastro de reserva** de candidatos, " +
        "que poderão ser convocados de acordo com as necessidades do " +
        "**{{campo:orgao_demandante}}**, dentro da validade deste certame.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "As vagas que surgirem durante o prazo previsto no subitem {{item:validade_do_certame}} " +
        "serão preenchidas pelos candidatos aprovados, obedecendo-se rigorosamente à ordem de " +
        "classificação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A aprovação no **{{campo:natureza_juridica}}** não significa contratação imediata do " +
        "candidato, que só será efetivada segundo os critérios de conveniência e oportunidade do " +
        "**{{campo:orgao_demandante}}**, dentro do prazo de validade da homologação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Serão considerados estáveis após 3 (três) anos de efetivo exercício no cargo os " +
        "servidores nomeados em virtude de aprovação no **{{campo:natureza_juridica}}**, nos " +
        "termos do artigo 41 da Constituição Federal.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Será excluído do **{{campo:natureza_juridica}}** o candidato que fizer declaração falsa " +
        "ou inexata na Ficha de Inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "É de exclusiva responsabilidade do candidato a atualização de seus dados pessoais junto " +
        "ao **{{campo:orgao_demandante}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que necessitar alterar os dados constantes de sua ficha de inscrição, como " +
        "endereço e telefone, no período de validade do **{{campo:natureza_juridica}}**, deverá " +
        "entregar ao **{{campo:orgao_demandante}}**, {{redigir:o endereço de atendimento do " +
        "órgão demandante — não é o da entidade executora}}, nos dias úteis e em horário de " +
        "funcionamento, requerimento especificando as alterações.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não será fornecido ao candidato qualquer documento comprobatório de classificação ou " +
        "aprovação neste **{{campo:natureza_juridica}}**, valendo para esse fim a homologação " +
        "divulgada em {{redigir:o órgão oficial de publicação do município}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A inscrição no **{{campo:natureza_juridica}}** implicará a plena aceitação das condições " +
        "estabelecidas no presente Edital, sobre o qual nenhum candidato poderá alegar " +
        "desconhecimento.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "É também de inteira responsabilidade do candidato acompanhar, no endereço eletrônico " +
        "**{{campo:site_oficial}}**, a publicação de todos os atos, comunicados e termos " +
        "aditivos referentes a este **{{campo:natureza_juridica}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Os casos omissos serão resolvidos pela Comissão do certame.",
    },
  ],
};
