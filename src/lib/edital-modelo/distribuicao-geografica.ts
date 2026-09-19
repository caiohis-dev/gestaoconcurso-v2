/**
 * Capítulo `distribuicao_geografica` — o capítulo 5 do Edital 004, e **condicional**.
 *
 * ⚠️ Nasce **desligado** no catálogo (`padrao: false`), e é o capítulo para onde apontam as
 * referências que as rodadas 4 e 6 deixaram: quando ele está desligado, aquelas referências
 * acusam `referencia-a-capitulo-excluido` e os artigos territoriais se autodenunciam.
 *
 * Fonte: 11 artigos. O modelo leva **9**, como molde por cargo — mesma razão do capítulo 3: a
 * estrutura publicada é um bloco por cargo (`5.1` ACS, `5.2` ACE), e o modelo não sabe quantos
 * cargos o certame tem.
 *
 * ── 🔴 O SEXTO defeito medido, e é o melhor de todos ──────────────────────────────────
 *
 * O item 5.1.1 do Edital 004 diz:
 *
 *   > "…foram destinadas 80 vagas … **conforme subitem 5.1.2. - Quadro I**"
 *
 * E o subitem 5.1.2, na linha seguinte, se intitula **"Quadro II"**. A mesma frase erra o
 * número do quadro que ela própria acabou de citar corretamente pelo subitem. É referência
 * cruzada se contradizendo dentro de uma linha — e é o argumento final para o modelo apontar
 * para **âncora e capítulo**, nunca para número de quadro.
 *
 * ── As vagas NÃO entram em prosa ─────────────────────────────────────────────────────
 *
 * O 004 escreve "foram destinadas **80** vagas" (ACS) e "**143** vagas" (ACE). São valores por
 * cargo, e a soma deles é exatamente o que o quadro de `vagas_por_area` já rende. Repetir o
 * total em prosa cria duas fontes para o mesmo número — e é assim que um edital publica 80 num
 * lugar e 82 no quadro. O artigo aponta para o quadro.
 *
 * ── Correções silenciosas, registradas ───────────────────────────────────────────────
 *
 * | onde | o que |
 * |---|---|
 * | 5.1.5 | `USBF/USB` → **UBSF/UBS** (as letras trocadas, duas vezes na mesma frase) |
 * | 5.1.5 | o trecho final era agramatical: *"aqueles que compreende local de divisas não seja prejudicado deverá observar com atenção para não marcar outra região"*. Reescrito. |
 * | 5.1.4, 5.1.5 | citavam "Anexo I"; o número de anexo varia entre editais (ver o backlog) |
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const DISTRIBUICAO_GEOGRAFICA: CapituloDoModelo = {
  chave: "distribuicao_geografica",
  fonte: "Edital 004/2026, capítulo 5 — molde por cargo, não transcrição",
  artigosEsperados: 9,
  artigosNaFonte: 11,
  porQueDiverge:
    "A estrutura publicada é um bloco por cargo (5.1 e 5.2) e o modelo não sabe quantos cargos " +
    "o certame tem; leva um bloco que o autor duplica. Os totais de vagas em prosa saíram: eles " +
    "já estão no quadro.",
  camposUsados: [],
  ancorasPublicadas: ["residencia_na_area", "areas_de_abrangencia"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      texto: "**{{redigir:o nome do cargo com restrição territorial}}**",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "As vagas deste cargo estão distribuídas por unidade conforme o quadro abaixo, " +
        "observadas a ampla concorrência, a reserva para pessoas com deficiência e a reserva " +
        "para negros.",
    },
    {
      tipo: "quadro",
      nivel: 1,
      quadroFonte: "vagas_por_area",
      texto: "Vagas por unidade:",
    },
    {
      // A legenda das siglas é `prosa` no publicado — uma linha "OBS.:" sem número.
      tipo: "prosa",
      texto: "OBS.: AC — Ampla Concorrência · PD — Pessoa com Deficiência · CN — Cotas para Negros.",
    },
    {
      tipo: "item",
      nivel: 1,
      ancora: "residencia_na_area",
      texto:
        "Para participar deste certame, o candidato deverá residir na área geográfica da " +
        "unidade em que vai atuar, **desde a data da publicação deste Edital**.",
    },
    {
      tipo: "item",
      nivel: 1,
      ancora: "areas_de_abrangencia",
      // ⚠️ SEM número de anexo — ver o backlog. O anexo de abrangência é o Anexo I no 004 e não
      // existe nos outros dois editais.
      texto:
        "As áreas de abrangência das respectivas unidades onde deverão atuar os aprovados seguem " +
        "informadas em anexo a este Edital.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "O candidato deverá observar se sua moradia se encontra em área limítrofe ou de divisa " +
        "com a unidade que selecionou, conforme o anexo de abrangência, **sendo eliminado do " +
        "certame quem não cumprir este requisito**. O que vale é o local de residência do " +
        "inscrito: quem mora em divisa deve conferir com atenção a unidade que marca, para não " +
        "escolher outra região.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "É vedada a atuação fora da área geográfica a que se refere o subitem " +
        "{{item:residencia_na_area}}.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Caso o servidor adquira casa própria fora da área geográfica de sua atuação, será " +
        "excepcionado o disposto no subitem {{item:residencia_na_area}} e mantida sua vinculação " +
        "à mesma equipe em que esteja atuando, podendo ser remanejado, na forma de regulamento, " +
        "para equipe atuante na área onde está localizada a casa adquirida.",
    },
  ],
};
