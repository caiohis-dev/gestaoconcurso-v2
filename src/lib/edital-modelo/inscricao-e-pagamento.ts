/**
 * Capítulo `inscricao_e_pagamento` — o capítulo 6, e o MAIOR do documento.
 *
 * Fonte: 39 artigos (35 itens e 4 alíneas). O modelo leva **38**: a lista de taxas por cargo
 * (2 alíneas no 004, uma por cargo) virou **um molde de 1 alínea**.
 *
 * ── 🔴 O SÉTIMO achado, e é o primeiro no nível de CAPÍTULO ───────────────────────────
 *
 * Três referências deste capítulo apontam para o capítulo errado, e todas pelo mesmo
 * deslocamento de um:
 *
 * | publicado | manda ver | e o assunto está no capítulo |
 * |---|---|---|
 * | 6.31 | "Item 10 deste Edital" | **11** (condições especiais) |
 * | 6.32 a) | "Item 7. deste Edital" | **8** (vagas PCD) |
 * | 6.32 b) | "Item 10 deste Edital" | **11** (condições especiais) |
 *
 * Mais duas de item: 6.1 manda ver "subitens 6.8 a 6.13" (que tratam de ficha e boleto, não de
 * isenção — o assunto está no capítulo 7) e 6.35 manda ver "subitens 13.3" (jurado, que está no
 * capítulo 14).
 *
 * É o mesmo deslocamento do Edital 002 — onde isenção é 6, PCD é 7 e condições especiais é 10 —
 * agora provado também no nível de capítulo. **`{{cap:}}` existe exatamente para isto**, e as
 * cinco foram reapontadas para o alvo real, não traduzidas.
 *
 * ── A taxa por cargo ─────────────────────────────────────────────────────────────────
 *
 * O item 6.23 publica "O valor do boleto será: a) Cargo – R$ 80,00 / b) Cargo – R$ 80,00" — a
 * forma que a medição do módulo encontrou nos três editais, e a razão de `{{campo:}}` não ter
 * qualificador por cargo. O modelo leva o caput mais **uma alínea-molde** com `{{redigir:}}`.
 *
 * 🔵 Isto **substitui** a decisão original do plano, que previa `[ ]` vazio apanhado pela regra
 * `placeholder-nao-preenchido`. O `{{redigir:}}` faz o mesmo trabalho e **diz o que escrever** —
 * era a única coisa que faltava ao `[ ]`.
 *
 * ⏳ E registra o destino natural: `edital_cargos.taxa_inscricao` já existe, então a lista de
 * taxas é candidata a `quadro_fonte: 'taxas'`. Acrescentar valor ao domínio da CHECK sem
 * renderizador faz o artigo cair no ramo "fonte desconhecida" — **tabela nova exige fatia nova**.
 *
 * ── O posto presencial ───────────────────────────────────────────────────────────────
 *
 * O item 6.9 dá endereço e horário do posto de atendimento. Isso mora em
 * `edital_canais_atendimento`, que é **coleção** (tipo, rótulo, endereço, horário) — não há
 * marcador escalar para coleção, e o endereço aparece uma vez. Vira `{{redigir:}}`.
 *
 * ── Correções silenciosas, registradas ───────────────────────────────────────────────
 *
 * Os itens 6.6 e 6.23 terminavam sem ponto. O 6.3 escreve "do dia X a Y" e o 6.4 repete o mesmo
 * intervalo com horas — os dois passaram a usar o cronograma, que é uma fonte só.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const INSCRICAO_E_PAGAMENTO: CapituloDoModelo = {
  chave: "inscricao_e_pagamento",
  fonte: "Edital 004/2026, capítulo 6, transcrito em 2026-09-18",
  artigosEsperados: 38,
  artigosNaFonte: 39,
  porQueDiverge:
    "A lista de taxas por cargo (2 alíneas no 004, uma por cargo) virou um molde de 1 alínea: o " +
    "modelo não sabe quantos cargos o certame tem.",
  camposUsados: ["site_oficial", "cronograma_inscricoes", "cronograma_pagamento_boleto", "entidade_executora"],
  ancorasPublicadas: ["ficha_de_inscricao", "valor_do_boleto", "declaracao_de_cotas"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      // 🔴 REAPONTADA: o 004 manda ver "subitens 6.8 a 6.13", que tratam de ficha e boleto. O
      // assunto é isenção, e está no capítulo próprio.
      texto:
        "Antes de proceder à Inscrição, o candidato que desejar isenção da taxa deverá aguardar o " +
        "resultado do seu pedido, conforme o capítulo {{cap:isencao_taxa}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Antes de realizar a Inscrição, o candidato deverá conhecer o Edital e certificar-se de " +
        "que preenche todos os requisitos exigidos para o cargo.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "ficha_de_inscricao",
      texto:
        "As inscrições serão realizadas através da Ficha de Inscrição Eletrônica, disponibilizada " +
        "no endereço eletrônico **{{campo:site_oficial}}**, no período de " +
        "{{campo:cronograma_inscricoes}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato deverá realizar sua inscrição via internet, acessando o endereço eletrônico " +
        "**{{campo:site_oficial}}**, {{redigir:o horário de abertura e de encerramento das " +
        "inscrições — ex.: das 12 horas do primeiro dia até as 12 horas do último}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato deverá preencher sua Ficha de Inscrição Eletrônica e, antes de enviá-la pela " +
        "internet, conferir se todos os seus dados (nome, data de nascimento, CPF e outros) estão " +
        "corretos, pois não poderá haver discordância entre os dados apresentados na Ficha e no " +
        "boleto de pagamento. Havendo discordância, não caberá recurso e o candidato deverá fazer " +
        "nova Inscrição dentro do prazo estipulado neste Edital.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A Ficha de Inscrição deverá ser preenchida exclusivamente com os dados do candidato, o " +
        "qual assume total responsabilidade pelas informações prestadas, arcando com as " +
        "consequências de eventuais erros e omissões no preenchimento.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A **{{campo:entidade_executora}}** não se responsabiliza, quando os motivos de ordem " +
        "técnica não lhe forem imputáveis, por inscrições não recebidas, falhas de comunicação, " +
        "erro ou atraso de bancos ou entidades conveniadas, aparelhos incompatíveis, " +
        "congestionamento nas linhas de transmissão, falhas de impressão, problemas de ordem " +
        "técnica nos computadores utilizados pelos candidatos, bem como por outros fatores que " +
        "impossibilitem a transferência dos dados e a impressão do boleto bancário.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O envio da Ficha de Inscrição Eletrônica implicará o conhecimento e a aceitação tácita " +
        "das normas e condições estabelecidas neste Edital, em relação às quais o candidato não " +
        "poderá alegar desconhecimento.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "No caso de dificuldade de acesso à internet, os candidatos poderão realizar suas " +
        "inscrições {{redigir:o posto de atendimento presencial — endereço completo e horário de " +
        "funcionamento}}, durante o período de Inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não se exigirá cópia de nenhum documento no ato do preenchimento da Ficha de Inscrição " +
        "Eletrônica. A veracidade das informações apresentadas é de exclusiva responsabilidade do " +
        "candidato.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Após fazer a Inscrição, o candidato deverá gerar e imprimir o boleto bancário para " +
        "pagamento da Taxa de Inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "A **{{campo:entidade_executora}}** não se responsabiliza por inscrições pagas duplamente.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Uma vez impresso o boleto bancário, o candidato deverá efetuar o pagamento do valor da " +
        "Taxa de Inscrição até {{campo:cronograma_pagamento_boleto}}, preferencialmente em " +
        "qualquer casa lotérica.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não serão aceitos os pagamentos das inscrições por depósito em caixa eletrônico, cartão " +
        "de crédito, via postal, transferência bancária por chave PIX, ordem de pagamento, " +
        "condicionais e/ou extemporâneas, ou por qualquer outra via que não as especificadas " +
        "neste Edital.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O pagamento da Taxa de Inscrição, por si só, não confere ao candidato o direito de " +
        "submeter-se às etapas deste certame. Será necessária a confirmação da Inscrição para que " +
        "ela seja validada.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A impressão do boleto bancário, ou de sua segunda via, é de exclusiva responsabilidade " +
        "do candidato, eximindo-se a **{{campo:entidade_executora}}** de eventuais dificuldades " +
        "na leitura do código de barras e da consequente impossibilidade de efetivação da " +
        "Inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A Inscrição somente será processada e validada após a confirmação, pela instituição " +
        "bancária, do pagamento do valor da Taxa de Inscrição concernente ao candidato, sendo " +
        "automaticamente cancelada a Ficha de Inscrição Eletrônica cujo pagamento não for " +
        "comprovado.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Serão tornadas sem efeito as inscrições cujos pagamentos forem efetuados após a data " +
        "estabelecida, não sendo devido ao candidato qualquer ressarcimento da importância paga " +
        "fora do prazo, não podendo ele alegar direito de participar da prova.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Só será aceita comprovação de pagamento por meio de boleto bancário.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não será aceito, como comprovação de pagamento do valor da inscrição, comprovante de " +
        "agendamento bancário.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "É vedada a transferência do boleto pago para terceiros, para outros certames ou troca " +
        "de cargos.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Efetivada a inscrição, não serão aceitos pedidos para alteração de opção de cargo, " +
        "podendo o candidato, por sua inteira responsabilidade, realizar nova inscrição e " +
        "consequente novo pagamento, não cabendo a devolução de valores já pagos.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "valor_do_boleto",
      texto: "O valor do boleto será:",
    },
    {
      // A alínea-molde: uma por cargo. Ver o cabeçalho — é a forma que os três editais publicam.
      tipo: "item",
      nivel: 2,
      texto:
        "{{redigir:um cargo e o valor da taxa dele, por extenso — duplique esta alínea para cada " +
        "cargo do certame}}",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O boleto bancário será emitido em nome do requerente e deverá ser impresso em impressora " +
        "a laser ou jato de tinta, para possibilitar a correta leitura dos dados e do código de " +
        "barras.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O boleto somente estará apto para pagamento 1 (um) dia útil após a efetivação da " +
        "Inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Em caso de feriado que acarrete o fechamento de agências bancárias na localidade em que " +
        "se encontra, o candidato deverá antecipar o pagamento do boleto ou realizá-lo por outro " +
        "meio válido, respeitado o prazo limite determinado neste Edital.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "É de livre escolha e inteira responsabilidade do candidato a opção por realizar a " +
        "inscrição para mais de um cargo neste certame, visto que a " +
        "**{{campo:entidade_executora}}** não possui qualquer obrigação de adequar, alterar ou " +
        "desmembrar os turnos e horários de aplicação das provas para viabilizar a participação " +
        "do candidato em mais de um cargo, prevalecendo estritamente o cronograma oficial.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Na hipótese de o candidato possuir mais de uma inscrição homologada para cargos cujas " +
        "provas ocorram no mesmo turno, ele deverá optar expressamente, no momento de ingresso na " +
        "sala e início da Prova Objetiva, por qual cargo deseja concorrer.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato será considerado, de forma automática e irrevogável, **AUSENTE** para as " +
        "provas dos demais cargos para os quais se inscreveu, restando formalizada a sua " +
        "desistência e eliminação sumária desses cargos no certame.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não assistirá ao candidato o direito a reclamações ou recursos posteriores, nem mesmo à " +
        "devolução ou restituição de quaisquer valores pagos a título de taxa de inscrição, sob " +
        "qualquer pretexto.",
    },
    {
      tipo: "item",
      nivel: 0,
      // 🔴 REAPONTADA: o 004 manda ver "Item 10", e condições especiais é o capítulo 11 nele.
      texto:
        "O candidato que necessite de atendimento especializado ou condição especial para a " +
        "realização da prova deverá obrigatoriamente especificar sua necessidade no ato da " +
        "inscrição e entregar o laudo médico comprobatório, conforme as instruções e prazos do " +
        "capítulo {{cap:condicoes_especiais_prova}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os candidatos que necessitarem de condições especiais ou adaptações para a realização da " +
        "prova — tais como prova ampliada, ledor, auxílio para marcação da Folha de Respostas, " +
        "intérprete de Libras ou local de fácil acesso — deverão seguir estritamente as regras de " +
        "entrega do laudo médico comprobatório, conforme o caso:",
    },
    {
      tipo: "item",
      nivel: 2,
      // 🔴 REAPONTADA: o 004 diz "Item 7.", e vagas PCD é o capítulo 8 nele.
      texto:
        "no capítulo {{cap:vagas_pcd}}, se o candidato possuir deficiência e desejar concorrer às " +
        "vagas reservadas para pessoas com deficiência;",
    },
    {
      tipo: "item",
      nivel: 2,
      // 🔴 REAPONTADA: o 004 diz "Item 10", e condições especiais é o capítulo 11 nele.
      texto:
        "no capítulo {{cap:condicoes_especiais_prova}}, se o candidato necessitar apenas do " +
        "atendimento especial ou de adaptação para o dia da prova, sem concorrer às vagas " +
        "reservadas para pessoas com deficiência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O atendimento especializado solicitado pelo candidato será realizado somente se não " +
        "incorrer em quebra de sigilo, nem em qualquer situação que permita seu favorecimento.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "declaracao_de_cotas",
      texto:
        "Os candidatos optantes por concorrer às vagas destinadas às pessoas com deficiência, bem " +
        "como aqueles optantes pelas vagas destinadas aos negros, deverão declarar tal condição " +
        "na Ficha de Inscrição Eletrônica, sendo vedada qualquer solicitação posterior aos prazos " +
        "estabelecidos. O inscrito que não incluir esta informação no ato da Inscrição participará " +
        "do certame como pleiteante às vagas destinadas à Ampla Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      // 🔴 REAPONTADA: o 004 manda ver "subitens 13.3", e o critério do jurado está no capítulo
      // 14 dele (desempate).
      texto:
        "O candidato que desejar usufruir da função de jurado, nos termos do artigo 440 do Código " +
        "de Processo Penal, deverá atender ao disposto no capítulo {{cap:desempate_e_resultado}}.",
    },
  ],
};
