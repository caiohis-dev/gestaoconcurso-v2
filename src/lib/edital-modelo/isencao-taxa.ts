/**
 * Capítulo `isencao_taxa` — o capítulo 7 do documento.
 *
 * Fonte: 22 artigos numerados + 7 alíneas em MAIÚSCULA + 1 parágrafo sem número (a linha do
 * envelope) = **30 elementos**. O modelo leva **28**.
 *
 * ⚠️ A diferença não é omissão: os itens 7.2, 7.3 e 7.4 repetem o **mesmo** parágrafo de
 * "imprimir o formulário e anexar RG e CPF" uma vez por requisito, variando só o documento
 * próprio de cada opção. Viraram um caput com cinco subitens, um por documento.
 *
 * 🔵 **E a primeira versão deste arquivo declarava 26.** O teste de `artigosEsperados` acusou
 * (`expected 28 to be 26`) — é literalmente o defeito que ele existe para pegar, agora com o
 * sinal invertido: eu havia contado a menos o que escrevi.
 *
 * ── 🔴 É O CAPÍTULO QUE MELHOR PROVA O DEFEITO DO TEMA ────────────────────────────────
 *
 * Contei as referências cruzadas deste capítulo: **12, e 11 estão erradas.**
 *
 * | item | diz | alvo real |
 * |---|---|---|
 * | 7.2 | "Letra A do subitem **6.1**" | 7.1 |
 * | 7.2.2 | "letra A do subitem **7.1**" | ✅ **a única correta** |
 * | 7.3 | "letra B do subitem **6.1**" | 7.1 |
 * | 7.3.2 | "subitem **6.1** letra B" | 7.1 |
 * | 7.4 | "letra C do subitem **6.1**" | 7.1 |
 * | 7.5 | "subitens **6.2 a 6.4**" | 7.2 a 7.4 |
 * | 7.6 | "conforme subitem **6.6**" | 7.5 |
 * | 7.7 | "subitens **6.2 a 6.6**" | 7.2 a 7.5 |
 * | 7.11 | "item **6.10**" | 7.10 |
 * | 7.12 | "subitens de **6.1 a 6.6**" | 7.1 a 7.5 |
 * | 7.13 | "subitens de **5.3 até 5.32**" | 🔴 **faixa que NÃO EXISTE** — o capítulo 5 termina em 5.2.2; o assunto está no capítulo 6 |
 * | 7.16 | "subitem **6.6**" | 7.5 |
 *
 * O documento **contradiz a si mesmo**: o 7.2 diz "subitem 6.1" e o 7.2.2 diz "subitem 7.1"
 * para o **mesmo alvo**, a duas linhas de distância. E o 7.13 manda o candidato a um intervalo
 * que não existe em edital nenhum.
 *
 * Todas foram **reapontadas por âncora ou capítulo**, nunca traduzidas número a número.
 *
 * ── As alíneas ficam em MINÚSCULA, e isso resolve outra inconsistência medida ──────────
 *
 * O Edital 004 usa `a)` nos capítulos 6, 11, 12, 13 e 14, `A)` nos 7, 8, 10 e 15, e **as duas
 * formas** no capítulo 9. O modelo não escolhe: `numerarItens` rende **letra minúscula**,
 * calculada, e a inconsistência desaparece por construção.
 *
 * ── Dois números que já tinham coluna, e viraram campo ────────────────────────────────
 *
 * O "mínimo de 03 doações em 12 meses" (7.3.3) é `regras_isencao.minimo_doacoes_sangue_12m`, e
 * "dois envelopes" (7.6) é `inscricao_config.limite_envelopes_por_candidato`. Deixá-los literais
 * criaria duas fontes para o mesmo número — o painel de isenção diria 3 e o documento, 5.
 *
 * ⚠️ **As três leis dos requisitos ficam LITERAIS**, e é decisão: `CRITERIOS_DE_ISENCAO`, em
 * `src/lib/edital-inscricao.ts`, já as carrega como `leiPadrao` no catálogo em código. Repetir o
 * texto aqui não cria fonte nova — ele é o padrão que aquele catálogo propõe.
 *
 * ⚠️ E o envelope do 004 manda escrever *"Concurso Público para a Secretaria Municipal de
 * Saúde"* num edital que é **Processo Seletivo Público**. Virou `{{campo:natureza_juridica}}` +
 * `{{campo:orgao_demandante}}`.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const ISENCAO_TAXA: CapituloDoModelo = {
  chave: "isencao_taxa",
  fonte: "Edital 004/2026, capítulo 7, transcrito em 2026-09-18",
  artigosEsperados: 28,
  // 22 itens numerados + 7 alíneas em MAIÚSCULA + 1 parágrafo sem número (a linha do envelope).
  artigosNaFonte: 30,
  porQueDiverge:
    "Os itens 7.2, 7.3 e 7.4 repetem o MESMO parágrafo de 'imprimir o formulário e anexar RG e " +
    "CPF' uma vez por requisito, variando só o documento próprio de cada um. Viraram um caput " +
    "com cinco subitens, um por documento — de 8 elementos para 6.",
  camposUsados: [
    "site_oficial",
    "executora_endereco",
    "natureza_juridica",
    "orgao_demandante",
    "minimo_doacoes_sangue",
    "limite_envelopes",
    "cronograma_entrega_isencao",
    "cronograma_resultado_isencao",
  ],
  ancorasPublicadas: ["requisitos_de_isencao", "entrega_do_envelope", "resultado_da_isencao"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      ancora: "requisitos_de_isencao",
      texto:
        "O candidato poderá requerer a Isenção da Taxa de Inscrição, desde que atenda a um dos " +
        "requisitos abaixo:",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "estar inscrito no Cadastro Único para Programas Sociais do Governo Federal (CadÚnico) e " +
        "ser membro de família de baixa renda, nos termos do art. 11 da Lei nº 8.112/90 e dos " +
        "Decretos Federais nº 6.593/2008 e nº 11.016/2022;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "nos termos da Lei Municipal nº 5.989/2022, ser doador regular de sangue ou estar " +
        "cadastrado no Registro Brasileiro de Doadores de Medula Óssea (REDOME);",
    },
    {
      tipo: "item",
      nivel: 2,
      texto: "nos termos da Lei Municipal nº 6.359/2024, ter prestado serviço eleitoral.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato interessado em obter a isenção deverá imprimir o Formulário do Requerimento " +
        "de Isenção, disponível em **{{campo:site_oficial}}**, preenchê-lo corretamente com seus " +
        "dados pessoais e anexar fotocópias do Documento de Identidade e do CPF, mais a " +
        "documentação própria do requisito de que trata o subitem " +
        "{{item:requisitos_de_isencao}}, conforme os subitens seguintes.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Quem optar pelo CadÚnico deverá anexar o Comprovante de Cadastro Único contendo a chave " +
        "de validação eletrônica, emitido oficialmente em " +
        "**https://cadunico.dataprev.gov.br**, e informar o Número de Identificação Social (NIS).",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "O comprovante do CadÚnico deverá, obrigatoriamente, apresentar data da última " +
        "atualização cadastral igual ou inferior a 24 (vinte e quatro) meses da data de " +
        "publicação deste Edital.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Quem optar pelo REDOME deverá anexar cópia da carteira de doador emitida oficialmente " +
        "pelo REDOME, por seu sítio eletrônico ou aplicativo oficial, contendo obrigatoriamente " +
        "o código de autenticidade ou QR Code verificável e emitida no ano vigente de publicação " +
        "deste Edital, para comprovação da manutenção do cadastro ativo.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Quem optar pela doação regular de sangue deverá anexar cópia do comprovante com, no " +
        "mínimo, **{{campo:minimo_doacoes_sangue}}** doações no período de 12 (doze) meses, " +
        "expedido por órgão oficial ou entidade credenciada pela União, Estado ou Município.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Quem optar pelo serviço eleitoral deverá anexar declaração expedida pela Justiça " +
        "Eleitoral, com o nome completo do candidato, o número de sua inscrição eleitoral, as " +
        "datas dos eventos eleitorais de que participou e a função desempenhada.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "entrega_do_envelope",
      texto:
        "O Formulário de Isenção, com a fotocópia de todos os documentos exigidos, deverá ser " +
        "entregue pelo próprio candidato ou por terceiro, em envelope tamanho ofício, lacrado, " +
        "contendo na parte de fora os seguintes dados:",
    },
    {
      tipo: "item",
      nivel: 2,
      // ⚠️ O 004 manda escrever "Concurso Público para a Secretaria Municipal de Saúde" num
      // edital que é Processo Seletivo Público.
      texto: "**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;",
    },
    { tipo: "item", nivel: 2, texto: "Referência: **ISENÇÃO DE TAXA**;" },
    { tipo: "item", nivel: 2, texto: "nome completo;" },
    { tipo: "item", nivel: 2, texto: "cargo para o qual o candidato está concorrendo." },
    {
      tipo: "prosa",
      texto:
        "O envelope deverá ser entregue na **{{campo:executora_endereco}}**, em " +
        "{{campo:cronograma_entrega_isencao}}, {{redigir:o horário de atendimento para a entrega " +
        "— ex.: de 9h às 16h}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O limite de entrega, conforme o subitem {{item:entrega_do_envelope}}, é de " +
        "**{{campo:limite_envelopes}}** envelope(s) por candidato.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que desejar a isenção, após cumprir o disposto no subitem " +
        "{{item:requisitos_de_isencao}} e seguintes, deverá aguardar o resultado da análise de " +
        "sua documentação para efetivar sua inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Cada pedido de Isenção será analisado e julgado com vistas ao deferimento ou " +
        "indeferimento, conforme a documentação apresentada.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A documentação apresentada é válida para apenas um cargo. O candidato que pretender " +
        "solicitar isenção para mais de um cargo deverá realizar procedimentos independentes " +
        "para cada pedido, com a entrega de envelopes distintos e documentação completa em cada " +
        "um deles.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "resultado_da_isencao",
      texto:
        "O resultado da análise da documentação será divulgado em " +
        "{{campo:cronograma_resultado_isencao}}, no endereço eletrônico " +
        "**{{campo:site_oficial}}**, {{redigir:o horário a partir do qual o resultado fica " +
        "disponível}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os candidatos com isenção concedida na listagem divulgada conforme o subitem " +
        "{{item:resultado_da_isencao}} terão, ao lado do seu nome, um código de isenção a ser " +
        "digitado na Ficha de Inscrição Eletrônica no ato de seu preenchimento; " +
        "automaticamente aparecerá **CONFIRMADA SUA INSCRIÇÃO**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A não apresentação de qualquer documento estabelecido para comprovar a condição de que " +
        "tratam os subitens {{item:requisitos_de_isencao}} a {{item:entrega_do_envelope}}, ou a " +
        "apresentação de documentos fora dos padrões e prazos estabelecidos, implicará o " +
        "indeferimento do pedido de Isenção.",
    },
    {
      tipo: "item",
      nivel: 0,
      // 🔴 O 004 manda ver "subitens de 5.3 até 5.32" — faixa que não existe. O procedimento de
      // inscrição está no capítulo próprio.
      texto:
        "O candidato que tiver o pedido de Isenção indeferido deverá, para efetivar sua " +
        "inscrição, acessar o endereço eletrônico **{{campo:site_oficial}}** e proceder conforme " +
        "o capítulo {{cap:inscricao_e_pagamento}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Comprovada a ocorrência de fraude nas declarações e documentos apresentados pelo " +
        "candidato interessado na Isenção, este será automaticamente eliminado do " +
        "**{{campo:natureza_juridica}}**, em qualquer uma de suas fases, sem prejuízo das " +
        "medidas cíveis e criminais eventualmente cabíveis.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Não caberá recurso da decisão pelo indeferimento da solicitação de Isenção.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não será aceita a entrega condicional ou a complementação de documentos após a data " +
        "descrita no subitem {{item:entrega_do_envelope}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.",
    },
  ],
};
