/**
 * Capítulo `comprovante_inscricao` — o capítulo 10 do documento.
 *
 * Fonte: **19 elementos** — 11 itens, 2 subitens, 4 alíneas em MAIÚSCULA e 2 em minúscula.
 * Transcrito por inteiro: nenhuma divergência da fonte.
 *
 * ── As DUAS referências cruzadas do capítulo, e as duas estão deslocadas ──────────────
 *
 * | item | diz | alvo real |
 * |---|---|---|
 * | 10.7 | "conforme subitem **9.3**" | **10.3** — a divulgação da listagem de confirmação |
 * | 10.8 | "conforme subitem **9.7**" | **10.7** — a entrega do envelope de recurso |
 *
 * 🔴 **É o deslocamento de um capítulo inteiro outra vez**, e aqui ele é fácil de provar sem
 * sair da página: o 10.7 descreve o prazo como *"subsequente à data de divulgação da listagem
 * de confirmação das inscrições"* e manda ver o **9.3**, que no Edital 004 é a lista de
 * documentos da cota racial. Quem divulga a listagem de confirmação é o **10.3**, três linhas
 * acima. O mesmo vale para o 10.8: o subitem que trata de envelope neste capítulo é o 10.7.
 *
 * Os dois viraram `{{item:}}`.
 *
 * ── As quatro datas vêm do CRONOGRAMA ────────────────────────────────────────────────
 *
 * `28/07/2026` é `pagamento_boleto`, `05/08/2026` é `confirmacao_inscricao`, `06/08/2026` é
 * `recurso_inscricao` e `11/08/2026` é `decisao_recurso_inscricao` — as quatro etapas já
 * existiam em `ETAPAS_SUGERIDAS`. ⚠️ O 004 escreve o dia do recurso **e** a expressão "primeiro
 * dia útil subsequente", duas fontes para a mesma data; aqui a data sai do cronograma e a
 * expressão fica como a REGRA que a explica, não como segunda fonte.
 *
 * ── ⚠️ Correções de transcrição, todas registradas ───────────────────────────────────
 *
 * - O 10.4 diz "Pessoa com Deficiência ou Negros"; aqui, "pessoa com deficiência", o termo da
 *   LBI — o mesmo ajuste que `requisitos_investidura` já fez.
 * - O 10.7 manda escrever **"Concurso Público para a Secretaria Municipal de Saúde"** num
 *   edital que é Processo Seletivo Público: vira `{{campo:natureza_juridica}}` +
 *   `{{campo:orgao_demandante}}`, como nos capítulos 7, 8 e 9.
 * - "dois envelopes no total" é `inscricao_config.limite_envelopes_por_candidato` — literal,
 *   seria a terceira cópia do mesmo número no documento.
 * - O horário de atendimento ("das 9h às 16 horas") é `{{redigir:}}`, como nas rodadas 9 a 11.
 * - As alíneas `a)`/`b)` do 10.6.1 e `A)` a `D)` do 10.7 estão no MESMO capítulo, em caixas
 *   diferentes — o oitavo achado do tema, de novo. Aqui são nível 2, e `numerarItens` as
 *   reletra em minúscula.
 * - O 10.6.1 abre com "Para a comprovação da regularidade" e o 10.6 terminava em "conforme as
 *   normas a seguir"; mantido, porque é o que liga o caput aos dois subitens.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const COMPROVANTE_INSCRICAO: CapituloDoModelo = {
  chave: "comprovante_inscricao",
  fonte: "Edital 004/2026, capítulo 10, transcrito em 2026-09-19",
  artigosEsperados: 19,
  camposUsados: [
    "site_oficial",
    "executora_endereco",
    "natureza_juridica",
    "orgao_demandante",
    "limite_envelopes",
    "cronograma_pagamento_boleto",
    "cronograma_confirmacao_inscricao",
    "cronograma_recurso_inscricao",
    "cronograma_decisao_recurso_inscricao",
  ],
  ancorasPublicadas: ["listagem_confirmacao", "entrega_recurso_inscricao"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      texto: "A inscrição somente será considerada válida após o pagamento do respectivo boleto bancário.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O comprovante provisório de inscrição do candidato será o boleto original, devidamente " +
        "quitado, sem rasuras ou emendas, em que conste a data da efetivação do pagamento, feito " +
        "até {{campo:cronograma_pagamento_boleto}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "listagem_confirmacao",
      texto:
        "Em {{campo:cronograma_confirmacao_inscricao}} será divulgada, no endereço eletrônico " +
        "**{{campo:site_oficial}}**, a listagem de confirmação, para que os candidatos possam " +
        "verificar a efetivação de sua inscrição definitiva.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que não tiver a indicação (X) nas colunas de vagas reservadas a pessoas com " +
        "deficiência ou a negros na listagem de confirmação terá seu pedido considerado " +
        "**indeferido**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O indeferimento decorre do não cumprimento de qualquer um dos requisitos obrigatórios ou " +
        "da falta de entrega da documentação exigida para a reserva de vagas pretendida.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que, após o pagamento da taxa, verificar que sua inscrição não foi confirmada " +
        "ou que sua opção pelas vagas reservadas não consta na listagem oficial deverá interpor " +
        "recurso, na forma dos subitens seguintes.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto: "Para a comprovação da regularidade, o candidato deverá inserir no envelope:",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "o boleto bancário acompanhado do respectivo **comprovante definitivo de quitação**, não " +
        "sendo aceito agendamento de pagamento;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "no caso de erro na indicação das vagas reservadas, o protocolo de entrega dos documentos " +
        "— autodeclaração ou laudo médico — para que sejam verificados.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "O recurso de que trata este subitem destina-se exclusivamente à correção de erros no " +
        "processamento de dados ou de pagamentos, não sendo permitida a inclusão de documentos " +
        "obrigatórios que deixaram de ser entregues no período de inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "entrega_recurso_inscricao",
      texto:
        "O recurso deverá ser entregue pelo próprio candidato ou por terceiro em " +
        "{{campo:cronograma_recurso_inscricao}}, primeiro dia útil subsequente à divulgação da " +
        "listagem de que trata o subitem {{item:listagem_confirmacao}}, na " +
        "**{{campo:executora_endereco}}**, {{redigir:o horário de atendimento para a entrega — " +
        "ex.: de 9h às 16h}}, em envelope lacrado tamanho ofício, contendo na parte externa e " +
        "frontal os seguintes dados:",
    },
    { tipo: "item", nivel: 2, texto: "**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;" },
    { tipo: "item", nivel: 2, texto: "Referência: **INDEFERIMENTO DA CONFIRMAÇÃO DE INSCRIÇÃO**;" },
    { tipo: "item", nivel: 2, texto: "nome completo e número de inscrição do candidato;" },
    { tipo: "item", nivel: 2, texto: "cargo para o qual o candidato está concorrendo." },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O limite de entrega, conforme o subitem {{item:entrega_recurso_inscricao}}, é de " +
        "**{{campo:limite_envelopes}}** envelope(s) por candidato.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A decisão relativa ao deferimento ou indeferimento do recurso será publicada no endereço " +
        "eletrônico **{{campo:site_oficial}}** em " +
        "{{campo:cronograma_decisao_recurso_inscricao}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Todas as informações de interesse do candidato estarão disponíveis no endereço eletrônico " +
        "**{{campo:site_oficial}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.",
    },
  ],
};
