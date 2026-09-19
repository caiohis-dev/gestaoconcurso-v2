/**
 * Capítulo `vagas_cotas_raciais` — o capítulo 9 do documento.
 *
 * Fonte: **26 elementos** — 19 itens, 1 subitem, 4 alíneas em MAIÚSCULA e 2 em minúscula.
 *
 * ── 🔴 É O CAPÍTULO QUE MOSTRA A INCONSISTÊNCIA DE ALÍNEA DENTRO DE SI MESMO ──────────
 *
 * O item 9.3 usa `a)` e `b)`; o item 9.7, quatro linhas abaixo, usa `A)` a `D)`. **Minúscula e
 * maiúscula no mesmo capítulo**, para a mesma função. É a forma mais crua do oitavo achado do
 * tema, e a razão de o modelo não escolher: `numerarItens` rende letra minúscula **calculada**,
 * e a escolha deixa de existir.
 *
 * ── Seis referências deslocadas, todas para o capítulo 8 ──────────────────────────────
 *
 * | item | diz | alvo real |
 * |---|---|---|
 * | 9.4 · 9.6 · 9.10 | "subitem **8.3**" | 9.3 |
 * | 9.8 | "subitens **8.7. e 8.7.1**" | 9.7 e 9.7.1 |
 * | 9.9 | "subitens **8.2. a 8.7.1**" | 9.2 a 9.7.1 |
 * | 9.18 | "subitem **8.7.1**" | 9.7.1 |
 *
 * ── 🔴 E uma referência de ANEXO que aponta para o anexo errado ────────────────────────
 *
 * O item 9.2 manda retirar *"o formulário de autodeclaração constante do **Anexo II**"*. Mas o
 * Edital 004 tem dois anexos: **Anexo I** é a abrangência territorial e **Anexo II** é o conteúdo
 * programático. **O formulário de autodeclaração não é anexo de edital nenhum** — e o Edital 003
 * traz a mesma frase, com o mesmo número, e também não tem esse anexo. A referência foi copiada
 * junto com o resto.
 *
 * Aqui o artigo diz que o formulário está **no endereço eletrônico**, que é onde ele de fato
 * está, sem citar anexo.
 *
 * ── Dois valores que já tinham coluna ────────────────────────────────────────────────
 *
 * "20% (vinte por cento)" é `regras_cotas_raciais.percentual_reserva` e "Lei Municipal nº
 * 5.309/2017" é `regras_cotas_raciais.lei_base`. 🔴 O percentual alimenta `edital-cotas.ts`, que
 * calcula a reserva do Quadro I — literal no texto, o documento e o quadro divergiriam em
 * silêncio.
 *
 * ⚠️ Correções: o 9.5 e o 9.2 terminavam sem ponto; e "Concurso Público" no 9.9, num edital que é
 * Processo Seletivo.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const VAGAS_COTAS_RACIAIS: CapituloDoModelo = {
  chave: "vagas_cotas_raciais",
  fonte: "Edital 004/2026, capítulo 9, transcrito em 2026-09-18",
  artigosEsperados: 26,
  camposUsados: [
    "percentual_cotas_raciais",
    "lei_cotas_raciais",
    "site_oficial",
    "natureza_juridica",
    "orgao_demandante",
    "executora_endereco",
    "limite_envelopes",
    "cronograma_entrega_autodeclaracao",
  ],
  ancorasPublicadas: ["reserva_cotas", "documentos_cotas", "entrega_cotas", "endereco_entrega_cotas"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      ancora: "reserva_cotas",
      texto:
        "Em cumprimento à **{{campo:lei_cotas_raciais}}**, fica reservado aos candidatos que " +
        "queiram concorrer às cotas para negros o percentual de " +
        "**{{campo:percentual_cotas_raciais}}** do total de vagas por cargo.",
    },
    {
      tipo: "item",
      nivel: 0,
      // 🔴 SEM "Anexo II": o formulário de autodeclaração não é anexo de nenhum dos editais reais.
      texto:
        "O candidato que desejar concorrer às vagas reservadas às pessoas negras deverá informar, " +
        "na Ficha de Inscrição Eletrônica, sua condição de pessoa negra e retirar o formulário de " +
        "autodeclaração no endereço eletrônico **{{campo:site_oficial}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "documentos_cotas",
      texto:
        "O pleiteante às vagas reservadas aos negros deverá entregar, em envelope lacrado, os " +
        "seguintes documentos:",
    },
    {
      tipo: "item",
      nivel: 2,
      texto: "a autodeclaração (original) de sua condição, **assinada e datada**;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "comprovante de inscrição, realizado após o preenchimento da Ficha de Inscrição Eletrônica " +
        "neste certame.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que não colocar os documentos do subitem {{item:documentos_cotas}} dentro do " +
        "envelope não concorrerá às vagas de cotistas, passando a concorrer com a Ampla " +
        "Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que só assinar e não datar sua autodeclaração participará do certame na Ampla " +
        "Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que não anexar seu comprovante de inscrição, conforme o subitem " +
        "{{item:documentos_cotas}}, participará do certame na Ampla Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "entrega_cotas",
      texto:
        "O candidato que se autodeclarar negro ou pardo, nos termos da " +
        "**{{campo:lei_cotas_raciais}}**, deverá entregar os documentos supracitados, pessoalmente " +
        "ou por terceiro, em envelope lacrado, contendo na parte de fora do envelope os seguintes " +
        "dados:",
    },
    { tipo: "item", nivel: 2, texto: "**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;" },
    { tipo: "item", nivel: 2, texto: "Referência: **COTA PARA NEGROS**;" },
    { tipo: "item", nivel: 2, texto: "nome completo e número de inscrição do candidato;" },
    { tipo: "item", nivel: 2, texto: "cargo para o qual o candidato está concorrendo." },
    {
      tipo: "item",
      nivel: 1,
      ancora: "endereco_entrega_cotas",
      texto:
        "O envelope deverá ser entregue pessoalmente ou por terceiro na " +
        "**{{campo:executora_endereco}}**, em {{campo:cronograma_entrega_autodeclaracao}}, " +
        "{{redigir:o horário de atendimento para a entrega}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O limite de entrega, conforme os subitens {{item:entrega_cotas}} e " +
        "{{item:endereco_entrega_cotas}}, é de **{{campo:limite_envelopes}}** envelope(s) por " +
        "candidato.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato cotista que não cumprir o estabelecido no subitem {{item:reserva_cotas}} e " +
        "seguintes participará do **{{campo:natureza_juridica}}** como candidato de Ampla " +
        "Concorrência, não podendo alegar, posteriormente, o direito às vagas destinadas aos " +
        "cotistas.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato negro que declarar sua condição no ato da inscrição, mas não entregar os " +
        "documentos citados no subitem {{item:documentos_cotas}}, ou ainda que o fizer fora do " +
        "prazo estabelecido, concorrerá exclusivamente às vagas de Ampla Concorrência, estando " +
        "impedido de pleitear as vagas destinadas aos negros.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato negro que entregar seus documentos, mas não marcar na ficha de inscrição que " +
        "está concorrendo à cota para negros, concorrerá apenas às vagas da Ampla Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato negro que não entregar seus documentos, mas marcar na ficha de inscrição que " +
        "está concorrendo à cota para negros, concorrerá apenas às vagas da Ampla Concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que não tiver reconhecida sua condição de negro, devido ao não cumprimento " +
        "das exigências deste Edital, concorrerá exclusivamente às vagas de Ampla Concorrência, " +
        "estando impedido de pleitear as vagas destinadas aos negros.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não serão aceitas inscrições ou entrega de documentos fora do prazo estabelecido neste " +
        "Edital, sob qualquer alegação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os candidatos cotistas, se classificados, além de figurarem na lista geral de " +
        "classificação, terão seus nomes publicados em relação à parte.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "No caso de o candidato cotista ter conseguido se classificar para as vagas oferecidas na " +
        "Ampla Concorrência, seu nome constará apenas da listagem geral, não sendo necessária a " +
        "divulgação em lista separada.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "As vagas para os candidatos cotistas que não forem providas por falta de candidato serão " +
        "preenchidas pelos demais candidatos, observada a rigorosa ordem de classificação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não será aceita a entrega condicional ou a complementação de documentos após a data " +
        "descrita no subitem {{item:endereco_entrega_cotas}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.",
    },
  ],
};
