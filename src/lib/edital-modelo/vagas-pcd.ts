/**
 * Capítulo `vagas_pcd` — o capítulo 8 do documento, e o maior em elementos.
 *
 * Fonte: **43 elementos** — 27 itens, 5 subitens, 10 alíneas em MAIÚSCULA e a linha do envelope,
 * que não recebe número. O modelo leva **43**: é o maior capítulo transcrito **sem divergência**.
 *
 * 🔵 E a primeira versão deste arquivo declarava 41. O teste acusou (`expected 43 to be 41`) e
 * também que `camposUsados` tinha 11 entradas para 12 marcadores no texto — os dois casos que
 * guardam a declaração contra o que está escrito, pegando o mesmo descuido por dois ângulos.
 *
 * ── ⚠️ ESTE CAPÍTULO CORRIGIU A MEDIÇÃO DO TEMA INTEIRO ────────────────────────────────
 *
 * Minha contagem original dava **27** elementos para ele. São **42**: faltavam os 5 subitens
 * (`8.4.1`, `8.4.2`, `8.5.1`, `8.6.1`, `8.10.1` — a fonte os escreve sem indentação, e a regex
 * que eu usava exigia espaço à esquerda) e as 10 alíneas em maiúscula.
 *
 * Remedido o documento inteiro, o total passou de ~334 para **381 elementos**. Ver a tabela
 * corrigida no doc do módulo. 🔵 Nenhuma rodada anterior ficou errada: as diferenças começam no
 * capítulo 7, e ali eu já havia recontado à mão.
 *
 * ── Cinco referências deslocadas, e uma delas se denuncia pela palavra "acima" ─────────
 *
 * | item | diz | alvo real |
 * |---|---|---|
 * | 8.11 | "itens D, E e F, do subitem **7.9. acima**" | 8.9 — e *"acima"* prova que é auto-referência |
 * | 8.13 | "conforme subitem **7.12**" | 8.12 |
 * | 8.15 | "deverá ler o **item 10.** e seus subitens" | capítulo **11** (condições especiais) |
 * | 8.16 | "subitens **7.4. a 7.9**" | 8.4 a 8.9 |
 * | 8.26 | "data descrita no subitem **7.12**" | 8.12 |
 *
 * ⚠️ As outras seis referências do capítulo (8.4, 8.4.1, 8.4.2, 8.5, 8.6, 8.9, 8.10) estão
 * **corretas** — é o capítulo com a melhor taxa de acerto até agora, e mostra que o
 * deslocamento não é uniforme: ele atinge quem foi copiado, não quem foi escrito ali.
 *
 * ── Quatro valores que já tinham coluna, e viraram campo ──────────────────────────────
 *
 * | no documento | coluna |
 * |---|---|
 * | "10% (dez por cento)" | `regras_pcd.percentual_reserva` |
 * | "Leis Municipais 3.113/94 e 3.221/95" | `regras_pcd.leis_base` |
 * | "últimos 06 (seis) meses" | `regras_pcd.validade_meses_laudo_temporario` |
 * | "Rua 33, nº 133 … (Saúde do Trabalhador)" | `regras_pcd.local_pericia` |
 *
 * 🔴 O percentual é o mais importante dos quatro: `src/lib/edital-cotas.ts` **calcula** a reserva
 * a partir dele. Literal no texto, o documento diria 10% enquanto o Quadro I distribuiria por
 * outro percentual, e ninguém notaria — é o padrão "duas fontes para o mesmo número" que o
 * módulo já pagou caro.
 *
 * ⚠️ As leis do ESTADO do Rio (9.425/2021 e 10.186/2023) e o TEA/Down ficam literais no 8.4:
 * são a norma que sustenta o laudo indeterminado, não parâmetro do certame — e
 * `aceita_laudo_indeterminado` é booleano, não texto.
 *
 * ⚠️ "Concurso Público" aparece em quatro artigos de um edital que é **Processo Seletivo**
 * (8.16, 8.18, 8.19, 8.23). Virou `{{campo:natureza_juridica}}`.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const VAGAS_PCD: CapituloDoModelo = {
  chave: "vagas_pcd",
  fonte: "Edital 004/2026, capítulo 8, transcrito em 2026-09-18",
  // 🔵 43 = os 42 elementos numerados/alíneas da fonte + a linha do envelope, que é `prosa`.
  // O capítulo NÃO diverge: cada elemento do publicado tem um artigo aqui.
  artigosEsperados: 43,
  camposUsados: [
    "percentual_pcd",
    "leis_pcd",
    "validade_laudo_temporario_meses",
    "local_pericia",
    "natureza_juridica",
    "orgao_demandante",
    "executora_endereco",
    "entidade_executora",
    "site_oficial",
    "cronograma_retirada_atestado_pcd",
    "cronograma_entrega_atestado_pcd",
    "limite_envelopes",
  ],
  ancorasPublicadas: ["reserva_pcd", "laudo_medico_pcd", "documentos_pcd", "rubrica_das_folhas", "entrega_pcd"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      ancora: "reserva_pcd",
      texto:
        "Em cumprimento às **{{campo:leis_pcd}}**, fica reservado aos candidatos com deficiência o " +
        "percentual de **{{campo:percentual_pcd}}** do total de vagas por cargo.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que for concorrer às vagas para candidato com deficiência deverá marcar na " +
        "ficha de inscrição sua opção como concorrente a essas vagas.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência deverá tomar conhecimento da síntese das atribuições do " +
        "cargo, explícitas no capítulo {{cap:atribuicoes_dos_cargos}}, antes de realizar sua " +
        "Inscrição. Julgando-se em condições, poderá concorrer, sob sua inteira responsabilidade, " +
        "às vagas que lhe são reservadas.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "laudo_medico_pcd",
      texto:
        "Em estrito cumprimento à legislação do Estado do Rio de Janeiro (Lei nº 9.425/2021 e Lei " +
        "nº 10.186/2023) e à legislação municipal, os laudos médicos que atestem deficiências " +
        "físicas, sensoriais, mentais ou intelectuais de caráter **IRREVERSÍVEL** (permanentes), " +
        "bem como o Transtorno do Espectro Autista (TEA) e a Síndrome de Down, serão aceitos por " +
        "prazo **INDETERMINADO**, não sendo recusados sob alegação de desatualização ou decurso " +
        "de tempo.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Para as deficiências de caráter **REVERSÍVEL** (temporárias), somente serão considerados " +
        "válidos os laudos médicos emitidos nos últimos " +
        "**{{campo:validade_laudo_temporario_meses}}** meses anteriores ao último dia do período " +
        "de inscrições.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Junto ao laudo médico, o candidato que deseja concorrer às vagas reservadas deverá " +
        "entregar, obrigatoriamente, cópia de seu documento oficial de identidade e do CPF.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "No caso de candidato que pretenda concorrer às vagas reservadas em razão de deficiência " +
        "auditiva, o laudo solicitado no subitem {{item:laudo_medico_pcd}} deverá ser acompanhado " +
        "do respectivo exame de audiometria.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "O exame de audiometria observará as mesmas regras de validade temporal previstas nos " +
        "subitens do {{item:laudo_medico_pcd}}, sendo aceito por prazo indeterminado se atestar " +
        "perda auditiva bilateral de caráter estritamente irreversível e permanente.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "No caso de candidato que pretenda concorrer às vagas reservadas em razão de deficiência " +
        "visual, o laudo solicitado no subitem {{item:laudo_medico_pcd}} deverá ser acompanhado de " +
        "exame de acuidade visual em ambos os olhos, patologia e campo visual.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "O exame visual observará as mesmas regras de validade temporal previstas nos subitens do " +
        "{{item:laudo_medico_pcd}}, sendo dispensada a atualidade caso comprove condição de " +
        "cegueira ou baixa visão de caráter estritamente irreversível e permanente.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "De acordo com as **{{campo:leis_pcd}}**, o médico designado pelo órgão municipal de saúde " +
        "examinará o laudo médico apresentado, conforme o subitem {{item:laudo_medico_pcd}} e " +
        "seguintes, a fim de atestar, sob pena de responsabilidade, a aptidão do candidato.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Para retirar seu atestado, o candidato com deficiência deverá comparecer a " +
        "**{{campo:local_pericia}}** em um dos seguintes dias: " +
        "{{campo:cronograma_retirada_atestado_pcd}}, para avaliação médica, " +
        "{{redigir:o horário de atendimento da perícia}}, portando o laudo médico estabelecido.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "documentos_pcd",
      texto:
        "Para efeito de cumprimento às **{{campo:leis_pcd}}**, o candidato com deficiência deverá " +
        "entregar à **{{campo:entidade_executora}}**, em envelope lacrado, os documentos e " +
        "informações listados a seguir, sendo obrigatória a inclusão do comprovante de inscrição e " +
        "do atestado original expedido pelo órgão municipal de saúde:",
    },
    { tipo: "item", nivel: 2, texto: "atestado médico do órgão municipal de saúde (documento original obrigatório);" },
    { tipo: "item", nivel: 2, texto: "comprovante de inscrição (obrigatório);" },
    {
      tipo: "item",
      nivel: 2,
      texto: "fotocópia do documento oficial de identificação com foto e do CPF (obrigatório);",
    },
    {
      tipo: "item",
      nivel: 2,
      texto: "comprovante de ser arrimo de família, quando for o caso (para efeito de desempate);",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "número de dependentes menores de 21 anos que vivem às suas expensas (para efeito de " +
        "desempate);",
    },
    {
      tipo: "item",
      nivel: 2,
      texto: "comprovação de que não possui qualquer fonte de renda (para efeito de desempate).",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "rubrica_das_folhas",
      texto:
        "Toda a documentação inserida no envelope lacrado, conforme o subitem " +
        "{{item:documentos_pcd}}, deverá obrigatoriamente ser rubricada ou assinada pelo próprio " +
        "candidato em **todas as suas folhas**, devendo a assinatura ser idêntica àquela constante " +
        "no documento oficial de identificação com foto enviado.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "A ausência de assinatura ou rubrica do candidato em qualquer um dos documentos exigidos " +
        "para a comprovação da deficiência (laudo, exames ou cópias de documentos pessoais) " +
        "resultará na **invalidação imediata de toda a documentação apresentada** e no consequente " +
        "indeferimento da inscrição para as vagas reservadas, não sendo admitida a regularização " +
        "posterior ou a juntada de assinaturas após o encerramento do prazo de entrega.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que não apresentar a documentação referida nas últimas alíneas do subitem " +
        "{{item:documentos_pcd}} não se beneficiará das prerrogativas das " +
        "**{{campo:leis_pcd}}** para o caso de critérios de desempate no resultado final.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "entrega_pcd",
      texto:
        "Toda a documentação que acompanha o atestado médico deverá ser rubricada ou assinada pelo " +
        "candidato, conforme o subitem {{item:rubrica_das_folhas}}, e entregue em envelope " +
        "lacrado, diretamente pelo candidato ou por terceiro, contendo na parte de fora do " +
        "envelope os seguintes dados:",
    },
    { tipo: "item", nivel: 2, texto: "**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;" },
    { tipo: "item", nivel: 2, texto: "Referência: **CANDIDATO COM DEFICIÊNCIA**;" },
    { tipo: "item", nivel: 2, texto: "nome completo e número de inscrição do candidato;" },
    { tipo: "item", nivel: 2, texto: "cargo para o qual o candidato está concorrendo." },
    {
      tipo: "prosa",
      texto:
        "O envelope deverá ser entregue na **{{campo:executora_endereco}}**, em " +
        "{{campo:cronograma_entrega_atestado_pcd}}, {{redigir:o horário de atendimento para a " +
        "entrega}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O limite de entrega, conforme o subitem {{item:entrega_pcd}}, é de " +
        "**{{campo:limite_envelopes}}** envelope(s) por candidato.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que não entregar o atestado médico na data prevista não concorrerá às vagas " +
        "reservadas, passando a participar do certame como candidato à Ampla Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      // 🔴 O 8.15 do 004 era um item inteiro dizendo "deverá ler o item 10" — e o item 10 dele é
      // o comprovante de inscrição, não as condições especiais. A remissão entrou aqui.
      texto:
        "O candidato com deficiência que precisar de atendimento especial no dia da prova deverá " +
        "observar o capítulo {{cap:condicoes_especiais_prova}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência que fizer sua Inscrição e não atender às exigências tratadas " +
        "no subitem {{item:laudo_medico_pcd}} e seguintes participará do " +
        "**{{campo:natureza_juridica}}** como candidato de Ampla Concorrência e não poderá " +
        "alegar, posteriormente, sua condição para reivindicar a prerrogativa legal.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Na falta do atestado médico, o candidato perderá o direito de concorrer às vagas " +
        "destinadas, neste Edital, aos candidatos com deficiência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O atestado médico mencionado no subitem {{item:documentos_pcd}} terá validade somente " +
        "para este **{{campo:natureza_juridica}}** e não será devolvido, ficando a sua guarda sob " +
        "a responsabilidade da **{{campo:entidade_executora}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência participará deste **{{campo:natureza_juridica}}** em " +
        "igualdade de condições com os demais candidatos, no que se refere ao processo de " +
        "avaliação através de provas previsto neste Edital.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os candidatos com deficiência, se classificados, além de figurarem na lista geral de " +
        "classificação, terão seus nomes publicados em relação à parte.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "No caso de o candidato com deficiência ter conseguido se classificar para as vagas " +
        "oferecidas na Ampla Concorrência, seu nome constará apenas da listagem geral, não sendo " +
        "necessária a divulgação em lista separada.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "As vagas para os candidatos com deficiência que não forem providas por falta de candidato " +
        "serão preenchidas pelos demais candidatos, observada a rigorosa ordem de classificação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "É de inteira responsabilidade do candidato acompanhar a publicação dos atos relativos a " +
        "este certame, bem como de eventuais retificações do Edital que, se houver, serão " +
        "divulgadas no endereço eletrônico **{{campo:site_oficial}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência que entregar seus documentos, mas não marcar na ficha de " +
        "inscrição que está concorrendo às vagas reservadas, concorrerá apenas às vagas da Ampla " +
        "Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência que não entregar seus documentos, mas marcar na ficha de " +
        "inscrição que está concorrendo às vagas reservadas, concorrerá apenas às vagas da Ampla " +
        "Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não será aceita a entrega condicional ou a complementação de documentos após a data " +
        "descrita no subitem {{item:entrega_pcd}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.",
    },
  ],
};
