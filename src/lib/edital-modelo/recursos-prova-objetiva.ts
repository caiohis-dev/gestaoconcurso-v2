/**
 * Capítulo `recursos_prova_objetiva` — o capítulo 13 do documento.
 *
 * Fonte: **35 elementos** — 25 itens e 10 alíneas, em dois blocos de cinco. Transcrito por
 * inteiro, sem divergência.
 *
 * ── As CINCO referências deslocadas, todas de um capítulo ─────────────────────────────
 *
 * | item | diz | alvo real |
 * |---|---|---|
 * | 13.7 | *"conforme subitem **12.6**"* | **13.6** — a entrega do envelope |
 * | 13.8 | *"não cumprirem os itens **12.2 a 12.6**"* | **13.2 a 13.6** |
 * | 13.20 | *"os subitens **12.17, 12.18 e 12.19**"* | **13.17 a 13.19** — as proibições da vista |
 *
 * No capítulo 12 essas faixas são outra coisa inteiramente: 12.6 é *"nenhum candidato prestará
 * o exame fora do local"* e 12.17 a 12.19 tratam de documento digital e da lista de eliminação.
 * **O 13.8 é o mais grave dos três**, porque manda indeferir recurso por descumprimento de
 * itens que, pelo número publicado, não falam de recurso nenhum.
 *
 * ── 🔴 O e-mail da vista é o ÚNICO valor que o teste PROÍBE como literal ──────────────
 *
 * A regra *"nenhum LITERAL que devia ser marcador"* de `edital-modelo.test.ts` casa endereço de
 * e-mail. E é regra com motivo: `regras_vista_prova.email_solicitacao` já guarda esse endereço,
 * e o linter o cruza com os canais de inscrição (`email-da-vista-fora-dos-canais`). Literal no
 * texto, o documento publicaria um endereço e o sistema conferiria outro.
 *
 * O interstício de 72 horas veio junto, pela mesma porta: é `intersticio_minimo_horas`.
 *
 * ── ⚠️ O que ficou LITERAL, e por quê ────────────────────────────────────────────────
 *
 * - **"01 (um) dia útil"** para recorrer: é prazo, não valor configurável — a DATA do recurso
 *   vem do cronograma, e o prazo é a regra que a explica (mesmo desenho da rodada 12).
 * - **"até às 17 horas"**: não tem coluna; vira `{{redigir:}}`, como nas rodadas 9 a 14.
 *
 * ── ⚠️ Correções de transcrição ──────────────────────────────────────────────────────
 *
 * - O 13.5 manda escrever *"Concurso público para a Secretaria Municipal de Saúde"* num edital
 *   que é Processo Seletivo: vira natureza + órgão demandante, como nos capítulos 7 a 10.
 * - O 13.13 diz *"o horário estabelecido neste subitem"* falando do subitem ANTERIOR — aqui é
 *   âncora, e passa a apontar para o item que de fato fixa o horário.
 * - O 13.18 termina sem ponto.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const RECURSOS_PROVA_OBJETIVA: CapituloDoModelo = {
  chave: "recursos_prova_objetiva",
  fonte: "Edital 004/2026, capítulo 13, transcrito em 2026-09-19",
  artigosEsperados: 35,
  camposUsados: [
    "site_oficial",
    "executora_endereco",
    "entidade_executora",
    "natureza_juridica",
    "orgao_demandante",
    "limite_envelopes",
    "email_vista_folha",
    "intersticio_vista_horas",
    "cronograma_divulgacao_gabarito",
    "cronograma_recurso_gabarito",
    "cronograma_resultado_preliminar",
    "cronograma_vista_folha_respostas",
    "cronograma_resultado_final",
  ],
  ancorasPublicadas: [
    "prazo_do_recurso",
    "entrega_do_recurso",
    "pedido_de_vista",
    "proibicoes_na_vista",
    "material_na_vista",
  ],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O **gabarito** da prova estará disponível no endereço eletrônico " +
        "**{{campo:site_oficial}}** em {{campo:cronograma_divulgacao_gabarito}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "prazo_do_recurso",
      texto:
        "O candidato que se julgar prejudicado terá **um dia útil**, em " +
        "{{campo:cronograma_recurso_gabarito}}, para recorrer, a contar da divulgação do " +
        "gabarito de sua prova.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O recurso deverá ser **individual e fundamentado**, com documentos comprobatórios " +
        "devidamente identificados, que deverão ser anexados ao **Formulário de Recurso ao " +
        "Gabarito da Prova**, disponível no endereço eletrônico **{{campo:site_oficial}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Cada Formulário de Recurso ao Gabarito da Prova deverá conter **uma única questão**; " +
        "o candidato que recorrer de mais de uma questão deverá utilizar tantos formulários " +
        "quantos forem necessários.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os formulários de recurso, acompanhados da fundamentação, deverão ser entregues em " +
        "envelope lacrado contendo, do lado de fora, as seguintes informações:",
    },
    { tipo: "item", nivel: 2, texto: "**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;" },
    { tipo: "item", nivel: 2, texto: "nome completo do candidato;" },
    { tipo: "item", nivel: 2, texto: "cargo para o qual o candidato está concorrendo;" },
    { tipo: "item", nivel: 2, texto: "número de inscrição;" },
    { tipo: "item", nivel: 2, texto: "números das questões recorridas." },
    {
      tipo: "item",
      nivel: 0,
      ancora: "entrega_do_recurso",
      texto:
        "Os documentos deverão ser entregues pelo candidato ou por terceiro, em **envelope " +
        "lacrado**, na **{{campo:executora_endereco}}**, em " +
        "{{campo:cronograma_recurso_gabarito}}, {{redigir:o horário de atendimento para a " +
        "entrega — ex.: de 9h às 16h}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O limite de entrega, conforme o subitem {{item:entrega_do_recurso}}, é de " +
        "**{{campo:limite_envelopes}}** envelope(s) por candidato.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Serão indeferidos pela Comissão do certame os recursos dos candidatos que não " +
        "cumprirem os subitens {{item:prazo_do_recurso}} a {{item:entrega_do_recurso}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Caso o recurso seja julgado procedente e acarrete a anulação de questão, o ponto " +
        "correspondente será atribuído a **todos os candidatos que realizaram a prova**, " +
        "independentemente de terem recorrido.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O recurso julgado procedente acarretará a retificação do gabarito oficial divulgado. " +
        "Nesse caso, o gabarito retificado será divulgado novamente no endereço eletrônico " +
        "**{{campo:site_oficial}}**, junto com o **resultado preliminar da prova objetiva**, " +
        "contendo as notas de todos os candidatos, em {{campo:cronograma_resultado_preliminar}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "pedido_de_vista",
      texto:
        "O candidato que desejar contestar a nota do resultado preliminar deverá solicitar a " +
        "**vista da folha de respostas** pelo e-mail **{{campo:email_vista_folha}}**, " +
        "{{redigir:o horário-limite do pedido, no horário oficial de Brasília — ex.: até as 17 " +
        "horas}}, em {{campo:cronograma_vista_folha_respostas}}, um dia útil após a publicação " +
        "do resultado preliminar.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Pedidos enviados após o horário estabelecido no subitem {{item:pedido_de_vista}} serão " +
        "automaticamente desconsiderados, servindo o registro de recebimento do servidor de " +
        "e-mail da **{{campo:entidade_executora}}** como prova do horário de envio.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Para fins de agendamento presencial, o e-mail enviado pelo candidato deverá conter:",
    },
    { tipo: "item", nivel: 2, texto: "assunto: **Vista da Folha de Respostas** e o nome completo do candidato;" },
    { tipo: "item", nivel: 2, texto: "nome completo do candidato;" },
    { tipo: "item", nivel: 2, texto: "número de CPF;" },
    { tipo: "item", nivel: 2, texto: "número de inscrição;" },
    { tipo: "item", nivel: 2, texto: "cópia digitalizada de documento de identidade oficial com foto." },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Em resposta ao e-mail, a **{{campo:entidade_executora}}** agendará o dia e o horário " +
        "para que o candidato compareça à **{{campo:executora_endereco}}**, garantido o " +
        "interstício mínimo de **{{campo:intersticio_vista_horas}}** horas úteis a contar do " +
        "envio da resposta de agendamento.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Para a realização da vista será disponibilizada **exclusivamente a cópia da imagem " +
        "impressa** da folha de respostas do candidato, permanecendo o documento original sob a " +
        "guarda e a segurança da Comissão Organizadora.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "proibicoes_na_vista",
      texto:
        "No momento da consulta **não será permitido** ao candidato o porte ou o uso de " +
        "aparelhos celulares, tablets, relógios eletrônicos, câmeras fotográficas ou qualquer " +
        "outro equipamento de gravação e imagem, bem como o uso de corretivos textuais, lápis " +
        "ou borrachas.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os aparelhos eletrônicos deverão permanecer **desligados e guardados** no interior de " +
        "bolsas ou mochilas do candidato, mantidas afastadas da mesa de atendimento durante " +
        "todo o período da vista.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "material_na_vista",
      texto:
        "Será permitida apenas a utilização de papel em branco e de caneta esferográfica de " +
        "material transparente, com tinta azul ou preta, para anotações que subsidiarão o " +
        "respectivo recurso.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O descumprimento de qualquer das proibições previstas nos subitens " +
        "{{item:proibicoes_na_vista}} a {{item:material_na_vista}} acarretará o encerramento " +
        "imediato do atendimento e o respectivo registro no Termo de Visita, mantendo-se o " +
        "resultado preliminar.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A vista da folha de respostas será realizada presencialmente, de forma assistida, pela " +
        "Comissão do certame.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Todo o procedimento de vista será registrado no **Termo de Visita** pela Comissão, " +
        "fazendo-se constar as eventuais contestações apontadas pelo candidato ou por seu " +
        "procurador, ou a expressa concordância com a nota apresentada, sendo o documento " +
        "assinado por ambas as partes ao final do atendimento.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Para a realização da vista, o candidato ou seu procurador deverá portar documento de " +
        "identidade original com foto; no caso de procurador, também procuração simples e o " +
        "documento de identidade original deste.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O não comparecimento do candidato ou de seu procurador no dia e horário agendados " +
        "implicará a perda do direito à vista presencial e a **preclusão do direito de recorrer** " +
        "contra a nota da prova objetiva.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O resultado da análise das contestações registradas nos Termos de Visita será divulgado " +
        "no endereço eletrônico **{{campo:site_oficial}}** em " +
        "{{campo:cronograma_resultado_final}}, contendo exclusivamente o número de inscrição dos " +
        "candidatos que apresentaram contestação e o respectivo status do pedido, deferido ou " +
        "indeferido, junto com o resultado final do certame.",
    },
  ],
};
