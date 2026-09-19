/**
 * Capítulo `prova_objetiva` — o capítulo 12 do documento, e o maior de todos.
 *
 * Fonte: **43 elementos** — 27 itens e 16 alíneas. O modelo tem **42**, e a diferença está
 * declarada em `artigosNaFonte`.
 *
 * ── 🔴 O que a divergência é: os itens 12.1 e 12.2 são a MESMA FRASE, uma por cargo ───
 *
 * *"A Prova Objetiva para os candidatos às vagas de **Agentes Comunitários de Saúde** constará
 * de 10 questões de Língua Portuguesa, 10 de Matemática e 30 de Conhecimentos Específicos…"* —
 * e o 12.2 repete tudo para **Agentes de Combate às Endemias**, com os mesmos números. Num
 * edital de três cargos seriam três itens; num de oito, oito.
 *
 * É exatamente o que o **quadro gerado** resolve: a matriz vem de `provas_disciplinas`, uma
 * linha por cargo × disciplina. O modelo leva **um** item apontando para o quadro.
 *
 * ⚠️ E o 12.2 do 004 tem um parêntese que nunca fecha — *"30 (trinta questões"*.
 *
 * ── 🔴 O DÉCIMO defeito: o item 12.4 publica um campo de formulário ───────────────────
 *
 * > *"…estão previstas para o **dia XX/xx/2026\* em local e horário a ser informado…"*
 *
 * A data **não foi preenchida** no edital publicado, e o asterisco de negrito nem fecha. É o
 * defeito que o `{{campo:}}` existe para tornar impossível: aqui a data vem da etapa
 * `prova_objetiva` do cronograma, e o linter acusa `campo-sem-valor` enquanto ela faltar —
 * em vez de o documento sair com `XX/xx` no Diário Oficial.
 *
 * ── A referência deslocada, de novo um capítulo inteiro ───────────────────────────────
 *
 * O `12.18` diz *"quem não atender a um dos subitens de **11.10 a 11.15**"* — no capítulo 11
 * essa faixa é a lactante, que nada tem com documento de identificação. O alvo real é
 * **12.10 a 12.15**, a faixa que exige documento com foto e trata da perda dele. Virou
 * `{{item:documentos_no_dia}} a {{item:perda_do_documento}}`.
 *
 * ── ⏳ O que NÃO virou campo, e o motivo é uma regra do módulo ─────────────────────────
 *
 * Duração da prova, tempo mínimo de permanência, tempo para levar o caderno e nota de corte
 * moram em `provas_objetivas_config`, cuja PK é **`edital_cargo_id`** — são valores **por
 * cargo**. E `{{campo:}}` é escalar e por edital: qualificador por cargo foi medido e
 * rejeitado, porque valor que varia por cargo nunca aparece em frase nos três editais reais.
 *
 * O quadro gerado ainda não rende essas colunas (só cargo × disciplina × questões × peso),
 * então os três tempos ficam como `{{redigir:}}`, **nomeando de onde o número sai**, e a nota
 * de corte é descrita como *"a pontuação mínima indicada para o seu cargo"*, sem número.
 * ⏳ Registrado no backlog: quando a matriz render essas colunas, o texto aponta para ela.
 *
 * ── ⚠️ Correções de transcrição ──────────────────────────────────────────────────────
 *
 * - **O 12.27 repete o 12.19 palavra por palavra** na primeira oração (*"Não haverá, sob
 *   qualquer pretexto, segunda chamada, nem justificativa de falta"*). Aqui o 12.19 abre
 *   direto pela eliminação, que é o assunto da lista de alíneas, e o 12.27 fica com a regra
 *   da falta — os dois deixam de dizer a mesma coisa.
 * - "Concurso Público" vira `{{campo:natureza_juridica}}` (o 004 é Processo Seletivo) e "a
 *   FEVRE", `{{campo:entidade_executora}}`.
 * - O 12.5 e o 12.7 abrem com `***`, asterisco triplo que o `segmentarNegrito` deixaria
 *   literal no documento.
 * - O 12.3 cita *"o Anexo I"* para o conteúdo programático — que no próprio 004 é o
 *   **Anexo II**. Aqui, "o anexo deste Edital", como na rodada 3.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const PROVA_OBJETIVA: CapituloDoModelo = {
  chave: "prova_objetiva",
  fonte: "Edital 004/2026, capítulo 12, transcrito em 2026-09-19",
  artigosEsperados: 42,
  artigosNaFonte: 43,
  porQueDiverge:
    "Os itens 12.1 e 12.2 são a mesma frase repetida por cargo, com a composição que o quadro " +
    "gerado já rende a partir de `provas_disciplinas` — viram um item só, apontando para ele.",
  camposUsados: [
    "natureza_juridica",
    "entidade_executora",
    "site_oficial",
    "cronograma_prova_objetiva",
    "cronograma_comprovante_local_prova",
  ],
  ancorasPublicadas: ["documentos_no_dia", "perda_do_documento"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A prova objetiva de cada cargo é composta pelas disciplinas, pelo número de questões e " +
        "pelo peso por questão indicados no quadro deste capítulo.",
    },
    {
      // O segundo `quadro` gerado do modelo. A matriz vem de `provas_disciplinas`, uma linha por
      // cargo × disciplina — e é ela que torna o 12.1/12.2 repetido por cargo desnecessário.
      tipo: "quadro",
      nivel: 0,
      quadroFonte: "disciplinas",
      texto:
        "Número de questões por disciplina e peso por questão, por cargo. O conteúdo " +
        "programático sobre o qual as questões se baseiam segue como anexo deste Edital.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A prova objetiva está prevista para {{campo:cronograma_prova_objetiva}}, em local e " +
        "horário a serem informados no comprovante de local de prova.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Será considerado aprovado o candidato que atingir a pontuação mínima indicada para o seu " +
        "cargo, **sem zerar em qualquer uma das áreas**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Nenhum candidato prestará o exame fora do local e do horário indicados, sob nenhuma hipótese.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "É de responsabilidade exclusiva do candidato a identificação correta do local indicado " +
        "para a realização de sua prova e o comparecimento no horário estabelecido.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os locais de prova serão publicados no endereço eletrônico **{{campo:site_oficial}}**, " +
        "para todos os candidatos, em {{campo:cronograma_comprovante_local_prova}}, " +
        "{{redigir:o horário a partir do qual a publicação fica disponível}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A folha de respostas é o **único documento válido para a correção da prova** e deverá " +
        "ser preenchida com o devido cuidado, pois não haverá substituição.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "documentos_no_dia",
      texto:
        "O candidato deverá chegar ao local da prova com **uma hora de antecedência** do horário " +
        "previsto para o início, munido do documento original de identificação com foto, do " +
        "comprovante de local de prova e de caneta esferográfica azul ou preta, de corpo " +
        "transparente.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "É de responsabilidade exclusiva do candidato o comparecimento no local correto indicado " +
        "para a realização de sua prova, no horário estabelecido no comprovante de local de prova.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Nenhum candidato entrará no prédio onde a prova será realizada após o horário " +
        "estabelecido para o fechamento dos portões, sob qualquer alegação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Somente será admitido no local de prova o candidato munido do original de documento " +
        "oficial de identidade, sendo aceitos passaporte, carteira de motorista com foto, " +
        "carteira de trabalho e carteira oficial de órgão de classe.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O documento oficial deverá estar em perfeitas condições, de forma a permitir a " +
        "identificação do candidato pela foto e pela assinatura.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "perda_do_documento",
      texto:
        "No caso de perda ou roubo do documento de identificação, o candidato deverá apresentar " +
        "certidão que ateste o registro da ocorrência em órgão policial, expedida há no máximo " +
        "30 (trinta) dias da data da prova objetiva, e ainda ser submetido à identificação " +
        "especial, consistente na coleta de impressão digital.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "**Não serão aceitos** como documento de identidade: protocolos de solicitação de " +
        "documentos, certidão de nascimento, título eleitoral, carteira de estudante, carteira " +
        "de agremiação desportiva, fotocópia de documento de identidade, ainda que autenticada, " +
        "e documento ilegível ou não identificável.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "**Documentos digitais não serão aceitos**, porque a autenticação depende de consulta a " +
        "sistemas governamentais pela internet, o que pode comprometer a agilidade e a segurança " +
        "do certame — seja por indisponibilidade de acesso, seja pelo tempo demandado diante do " +
        "volume de candidatos —, além de haver momentos em que o candidato está impedido de " +
        "utilizar o telefone celular.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que não atender a um dos subitens {{item:documentos_no_dia}} a " +
        "{{item:perda_do_documento}} não fará a prova.",
    },
    {
      tipo: "item",
      nivel: 0,
      // Sem âncora: o catálogo manda publicar só onde outro artigo aponta, e ninguém aponta
      // para esta lista — nem dentro do capítulo, nem nos capítulos 13 a 16 do Edital 004.
      texto: "Será eliminado do **{{campo:natureza_juridica}}** o candidato que:",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "for surpreendido em comunicação verbal, escrita ou por qualquer outro meio com outro " +
        "candidato ou com pessoa estranha ao certame;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "utilizar-se de qualquer modalidade de consulta, tal como legislação, livros, impressos " +
        "ou anotações;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "utilizar-se de sinais, marcações ou de quaisquer outras formas que quebrem o sigilo da " +
        "prova ou que possibilitem sua identificação;",
    },
    { tipo: "item", nivel: 2, texto: "utilizar-se de qualquer meio de comunicação externa;" },
    { tipo: "item", nivel: 2, texto: "deixar de entregar a folha de respostas;" },
    { tipo: "item", nivel: 2, texto: "ausentar-se do local de prova sem permissão;" },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "praticar ato de incorreção com qualquer fiscal ou auxiliar incumbido da aplicação da prova;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "ausentar-se do local de prova sem o acompanhamento do fiscal, após ter assinado a lista " +
        "de presença;",
    },
    { tipo: "item", nivel: 2, texto: "deixar de assinar a lista de presença ou a folha de respostas;" },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "entrar no local de aplicação da prova portando aparelho eletrônico, boné, óculos " +
        "escuros, relógio ou quaisquer outros meios que sugiram possibilidade de comunicação, " +
        "bem como equipamentos que possam causar danos a terceiros;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto: "recusar-se a desligar o telefone celular antes de colocá-lo no envelope de segurança;",
    },
    { tipo: "item", nivel: 2, texto: "recusar-se a colocar qualquer outro objeto no local determinado pelo fiscal;" },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "sair da sala portando qualquer objeto, ainda que em caráter de emergência e acompanhado " +
        "pelo fiscal;",
    },
    { tipo: "item", nivel: 2, texto: "tirar fotos ou fazer gravações no recinto de aplicação da prova;" },
    { tipo: "item", nivel: 2, texto: "copiar o gabarito;" },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "recusar-se a entregar a folha de respostas no horário em que o fiscal anunciar o término " +
        "da prova.",
    },
    { tipo: "item", nivel: 0, texto: "Os três últimos candidatos de cada sala só poderão sair juntos." },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O tempo máximo de duração da prova objetiva é de {{redigir:a duração da prova, como " +
        "configurada para este cargo em `provas_objetivas_config`}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato só poderá deixar a sala depois de {{redigir:o tempo mínimo de permanência, " +
        "como configurado para este cargo em `provas_objetivas_config`}} do início da prova, " +
        "entregando ao fiscal a folha de respostas e o caderno de questões.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato só poderá levar o caderno de questões depois de {{redigir:o tempo mínimo " +
        "para levar o caderno, como configurado para este cargo em `provas_objetivas_config`}} " +
        "do início da prova, mediante a entrega da folha de respostas ao fiscal.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Após o término da prova, o candidato deverá retirar-se imediatamente do local de " +
        "aplicação, sendo proibida a permanência no prédio.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não haverá funcionamento de guarda-volumes, e a **{{campo:entidade_executora}}** não se " +
        "responsabilizará por danos ou extravio de documentos ou objetos dos candidatos.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A **{{campo:entidade_executora}}** não se responsabiliza por pertences esquecidos, " +
        "perdidos, extraviados ou danificados.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não haverá, sob qualquer pretexto, segunda chamada de prova nem justificativa de falta, " +
        "sendo o candidato faltoso eliminado do **{{campo:natureza_juridica}}**.",
    },
  ],
};
