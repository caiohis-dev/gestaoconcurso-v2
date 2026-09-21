/**
 * Capítulo `desempate_e_resultado` — o capítulo 14 do documento.
 *
 * Fonte: **19 elementos** — 10 itens, 6 subitens e 3 alíneas. Transcrito por inteiro.
 *
 * ── 🔴 O DÉCIMO PRIMEIRO defeito: um subitem numerado com o CAPÍTULO ERRADO ───────────
 *
 * Dentro do capítulo 14, entre o 14.5 e o 14.6, há um subitem escrito **`13.5.1`**. Não é
 * referência a outro capítulo: é o **número do próprio subitem**, e ele pertence ao 14.5. O
 * capítulo 11 já numerava `11.8.1` um subitem do 11.10; aqui o erro subiu um nível e trocou o
 * capítulo inteiro.
 *
 * ⭐ **E o 14.6 aponta para ele pelo número errado** — *"o 4º quesito do subitem 13.5.1"* —, de
 * modo que a referência e o alvo estão consistentes **entre si** e ambos errados. Um documento
 * que se contradiz é detectável; este é coerente e aponta para fora do capítulo.
 *
 * ── 🔴 E o DÉCIMO SEGUNDO: o 14.9 publica o formulário em branco, como o 12.4 ─────────
 *
 * O item diz *"O Resultado Final será divulgado no dia"* seguido de **`xx`** e da barra do
 * negrito aberta no meio da data — a sequência nem se cita aqui dentro, porque fecharia este
 * comentário.
 *
 * É a segunda ocorrência da mesma falha no mesmo documento.
 * A data vem da etapa `resultado_final` do cronograma.
 *
 * ── As referências deslocadas ─────────────────────────────────────────────────────────
 *
 * | item | diz | alvo real |
 * |---|---|---|
 * | 14.3.1 | *"subitem **13.3**"* | **14.3** — o critério do jurado |
 * | 14.3.2 | *"subitem **13.3.1**"* | **14.3.1** |
 * | 14.4 | *"o estabelecido no subitem **13.2**"* | **14.2** — a preferência do idoso |
 * | 14.5 | *"os subitens **13.2 e 13.4**"* | ⚠️ ver abaixo |
 * | 14.6 | *"o subitem **13.5.1**"* | **14.5.1** |
 *
 * ⚠️ **O 14.5 é o único que NÃO se resolve pelo deslocamento de um capítulo**, e por isso foi
 * relido contra o que a frase descreve: *"após aferido o critério de desempate previsto nos
 * subitens…"* — os critérios são a **idade** e o **jurado** (14.2 e 14.3). O deslocamento
 * literal daria 14.2 e 14.4, e o 14.4 não é critério: é a regra do empate ENTRE idosos.
 * É a razão de a regra do tema ser *reapontar*, nunca traduzir número a número.
 *
 * ── ⏳ A ordem de desempate por disciplina é `{{redigir:}}`, e é pendência ──────────────
 *
 * A lista ordenada (1º Conhecimentos Específicos, 2º Língua Portuguesa, …) **existe no banco**,
 * em `criterios_desempate`, e difere de verdade entre os três editais reais — o 002 tem cinco
 * posições e inclui a prova de títulos. Mas não há `quadro_fonte` para ela, e fonte nova exige
 * fatia nova. Enquanto não houver, o subitem pede a lista por instrução, **nomeando a tabela**.
 *
 * ── ⚠️ O que fica literal, e é decisão registrada ─────────────────────────────────────
 *
 * As **23 horas 59 minutos e 59 segundos** do candidato sem certidão: o doc do módulo decidiu
 * que isso não vira coluna, porque *"o dado o sistema não tem e não vai ter"* e o parâmetro é
 * idêntico nos três editais. Fica como artigo escrito à mão — aqui, exatamente como lá.
 *
 * As leis municipais do desempate de PCD são as MESMAS de `regras_pcd.leis_base`, então entram
 * como `{{campo:leis_pcd}}` — foi assim que a rodada 10 as tirou do texto.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const DESEMPATE_E_RESULTADO: CapituloDoModelo = {
  chave: "desempate_e_resultado",
  fonte: "Edital 004/2026, capítulo 14, transcrito em 2026-09-19",
  artigosEsperados: 19,
  camposUsados: [
    "site_oficial",
    "executora_endereco",
    "leis_pcd",
    "cronograma_entrega_declaracao_jurado",
    "cronograma_resultado_final",
  ],
  ancorasPublicadas: [
    "criterio_idoso",
    "criterio_jurado",
    "comprovacao_jurado",
    "ordem_de_desempate",
  ],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      texto: "Havendo empate na pontuação final dos candidatos, terá preferência:",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "criterio_idoso",
      texto:
        "o candidato com idade igual ou superior a 60 anos até o último dia de inscrição, por " +
        "aplicação do parágrafo único do artigo 27 da Lei Federal nº 10.741/2003 — Estatuto da " +
        "Pessoa Idosa;",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "criterio_jurado",
      texto:
        "o candidato que tiver exercido a função de jurado, nos termos do artigo 440 do Código " +
        "de Processo Penal.",
    },
    {
      tipo: "item",
      nivel: 1,
      ancora: "comprovacao_jurado",
      texto:
        "Para a comprovação da função a que se refere o subitem {{item:criterio_jurado}} serão " +
        "aceitos certidões, declarações, atestados ou outros documentos públicos, em original ou " +
        "cópia autenticada em cartório, emitidos pelos Tribunais de Justiça estaduais e pelos " +
        "Tribunais Regionais Federais do país, relativos à função de jurado, nos termos do " +
        "artigo 440 do Código de Processo Penal, na redação da Lei nº 11.689/2008.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Para a verificação do critério mencionado no subitem {{item:comprovacao_jurado}}, o " +
        "candidato deverá entregar o documento comprobatório em envelope lacrado, com sua " +
        "identificação e número de inscrição pelo lado de fora, pessoalmente ou por terceiro, na " +
        "**{{campo:executora_endereco}}**, em " +
        "{{campo:cronograma_entrega_declaracao_jurado}}, {{redigir:o horário de atendimento para " +
        "a entrega — ex.: de 9h às 16h}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Havendo empate entre candidatos amparados pela Lei Federal nº 10.741/2003, o critério " +
        "de desempate será o mesmo aplicado aos demais candidatos, observando-se o estabelecido " +
        "no subitem {{item:criterio_idoso}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Aferidos os critérios de desempate previstos nos subitens {{item:criterio_idoso}} e " +
        "{{item:criterio_jurado}}, a ordem de classificação do resultado final, para os " +
        "candidatos de ampla concorrência e para os optantes pelas vagas reservadas, obedecerá " +
        "aos critérios listados a seguir:",
    },
    {
      tipo: "item",
      nivel: 1,
      ancora: "ordem_de_desempate",
      texto:
        "{{redigir:a ordem de desempate por disciplina deste certame, uma posição por linha, " +
        "como cadastrada em `criterios_desempate` — a última posição costuma ser a maior idade}}",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Para fins de desempate, os candidatos que seguirem empatados até o último quesito do " +
        "subitem {{item:ordem_de_desempate}} serão convocados por e-mail, antes da publicação do " +
        "resultado final, para a apresentação legível da certidão de nascimento, a fim de " +
        "verificar o horário do nascimento.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "O candidato convocado que não apresentar a certidão de nascimento, que a apresentar de " +
        "forma ilegível ou que não preencher o horário do nascimento na ficha de inscrição terá " +
        "considerada como hora de nascimento **23 horas 59 minutos e 59 segundos**.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "O candidato convocado deverá enviar a certidão de nascimento em formato PDF, de forma " +
        "legível, em resposta ao e-mail de convocação, dentro do prazo estipulado na respectiva " +
        "notificação.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "É de exclusiva responsabilidade do candidato o acompanhamento de sua caixa de entrada e " +
        "de spam, bem como a qualidade do arquivo digitalizado enviado, não se responsabilizando " +
        "a Comissão por falhas técnicas de envio, arquivos corrompidos ou mensagens não " +
        "entregues.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O desempate entre candidatos concorrentes às vagas reservadas a pessoas com deficiência " +
        "obedecerá a critérios específicos, em conformidade com as **{{campo:leis_pcd}}**, quais " +
        "sejam:",
    },
    { tipo: "item", nivel: 2, texto: "ser arrimo de família;" },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "ter maior número de dependentes que vivam exclusivamente sob suas expensas, até o " +
        "limite de 21 (vinte e um) anos;",
    },
    { tipo: "item", nivel: 2, texto: "não ter nenhuma fonte de renda, incluindo pensões ou aposentadorias." },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Esgotados os critérios estabelecidos para as pessoas com deficiência, serão adotados os " +
        "mesmos critérios para os candidatos de ampla concorrência.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O resultado final será divulgado em {{campo:cronograma_resultado_final}}, no endereço " +
        "eletrônico **{{campo:site_oficial}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Em nenhuma hipótese serão aceitos pedidos de revisão de recurso, recurso de recurso, " +
        "recurso do gabarito oficial definitivo ou recurso do resultado definitivo, em qualquer " +
        "das etapas, fora do prazo previsto neste Edital.",
    },
  ],
};
