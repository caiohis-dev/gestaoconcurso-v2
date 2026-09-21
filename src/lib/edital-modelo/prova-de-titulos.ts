/**
 * Capítulo `prova_de_titulos` — condicional, e o único transcrito do **Edital 002/2026**.
 *
 * Fonte: **28 elementos** — 24 itens e 4 alíneas, do capítulo 13 do 002 (Magistério). O 003 e
 * o 004 não têm prova de títulos, e foi decisão do usuário em 2026-09-18 que ela entra no
 * modelo assim mesmo: o capítulo nasce **desligado** no catálogo e é ligável em qualquer
 * edital.
 *
 * O modelo tem **28** artigos: o item 13.4 vira o artigo `quadro`, que é o que os Quadros III
 * e IV do 002 são — `titulos_itens`, uma linha por cargo.
 *
 * ── 🔴 Os pontos NÃO entram em prosa, e aqui a razão é dupla ──────────────────────────
 *
 * O 13.4 do 002 diz *"cuja pontuação máxima não deverá ultrapassar 12 (doze) pontos"*, e o
 * quadro repete esse total em duas colunas. Pontuação é **por cargo** em `titulos_itens` — o
 * mesmo limite do `{{campo:}}` que a rodada 14 encontrou —, e o quadro gerado já a rende.
 * Escrita em prosa, seria a terceira cópia do mesmo número.
 *
 * ── As referências internas, e as duas que eram "o subitem anterior" ──────────────────
 *
 * O 13.8 e o 13.9 do 002 dizem *"conforme o solicitado no subitem anterior"* e *"referida no
 * subitem anterior"*. **Vizinhança não é referência:** basta alguém inserir um artigo entre os
 * dois para a frase apontar para outra coisa, sem quebrar teste nenhum. As duas viraram âncora.
 *
 * ⚠️ E o 13.14 (*"não mencionados no subitem 13.4"*) aponta para o próprio quadro — que é
 * artigo, e portanto tem âncora como qualquer outro.
 *
 * ── ⚠️ O que foi generalizado ────────────────────────────────────────────────────────
 *
 * O 13.2 restringe a pontuação a *"Docente I e Docente II (Ensino Fundamental de 1º ao 5º ano e
 * anos iniciais da EJA)"* — cargos de um edital específico. No modelo, a regra vale para os
 * cargos que **tiverem títulos parametrizados**, que é o que o quadro expressa.
 *
 * E o 13.17 manda concluir os cursos *"até 30 dias antes do prazo previsto no subitem 5.4"* —
 * referência a um capítulo de inscrição que, nos três editais, cai em número diferente. Aqui é
 * o **último dia de inscrição**, dito por extenso.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const PROVA_DE_TITULOS: CapituloDoModelo = {
  chave: "prova_de_titulos",
  fonte: "Edital 002/2026, capítulo 13, transcrito em 2026-09-19",
  artigosEsperados: 28,
  camposUsados: [
    "site_oficial",
    "executora_endereco",
    "limite_envelopes",
    "cronograma_entrega_titulos",
    "cronograma_resultado_titulos",
    "cronograma_recurso_titulos",
  ],
  ancorasPublicadas: [
    "entrega_dos_titulos",
    "quadro_de_titulos",
    "normas_do_curso",
    "declaracao_da_instituicao",
    "entrega_do_recurso_titulos",
  ],
  ancorasConsumidas: [],
  artigos: [
    { tipo: "item", nivel: 0, texto: "A avaliação de títulos tem caráter **apenas classificatório**." },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A pontuação por títulos só ocorrerá para os candidatos aos cargos com títulos " +
        "parametrizados neste Edital que tenham atingido a pontuação mínima exigida para " +
        "aprovação na prova objetiva, sem zerar em qualquer uma das áreas.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "entrega_dos_titulos",
      texto:
        "Os candidatos deverão entregar seus títulos para avaliação em " +
        "{{campo:cronograma_entrega_titulos}}, na **{{campo:executora_endereco}}**, " +
        "{{redigir:o horário de atendimento para a entrega — ex.: de 9h às 16h}}.",
    },
    {
      tipo: "quadro",
      nivel: 0,
      quadroFonte: "titulos",
      ancora: "quadro_de_titulos",
      texto:
        "Títulos aferíveis, pontuação por título e pontuação máxima, por cargo. Serão " +
        "considerados para avaliação apenas os títulos deste quadro.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Para receber a pontuação relativa aos títulos de pós-graduação relacionados no quadro " +
        "serão aceitos somente os certificados ou declarações acompanhados, obrigatoriamente, do " +
        "histórico escolar e nos quais conste a carga horária do curso.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Na impossibilidade de entrega do diploma ou do certificado, o candidato poderá " +
        "apresentar declaração expedida por instituição de ensino que demonstre, de forma " +
        "inequívoca, a conclusão do curso de pós-graduação, lato ou stricto sensu, e a obtenção " +
        "do título. A declaração deverá estar acompanhada do histórico escolar do curso a que se " +
        "refere, com a respectiva carga horária.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "normas_do_curso",
      texto:
        "Para receber a pontuação relativa aos títulos, o certificado deverá informar que o " +
        "curso foi realizado de acordo com as normas do Conselho Nacional de Educação ou do " +
        "Ministério da Educação.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "declaracao_da_instituicao",
      texto:
        "Caso o certificado não informe o exigido no subitem {{item:normas_do_curso}}, deverá " +
        "ser anexada declaração da instituição atestando que o curso atende àquelas normas.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não receberá pontuação o candidato que apresentar certificado sem a comprovação do " +
        "subitem {{item:normas_do_curso}} e sem a declaração referida no subitem " +
        "{{item:declaracao_da_instituicao}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os diplomas expedidos por instituição estrangeira deverão ser revalidados por " +
        "instituição de ensino superior no Brasil.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Todo documento expedido em língua estrangeira somente será considerado para fins de " +
        "avaliação e pontuação quando traduzido para a língua portuguesa por tradutor " +
        "juramentado.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Outros comprovantes de conclusão de curso ou disciplina — tais como comprovantes de " +
        "pagamento de taxa para obtenção de documentação, cópias de requerimentos e atas de " +
        "apresentação e defesa de dissertação ou tese — ou documentos que não estejam em " +
        "consonância com as disposições deste Edital não serão considerados para efeito de " +
        "pontuação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Não serão analisados nem pontuados os títulos, declarações e documentos ilegíveis, com " +
        "digitalização truncada, com sinais de rasura, não identificados como sendo do próprio " +
        "candidato, sem carimbo, sem assinatura do emitente, em papel não timbrado, não datados " +
        "ou indevidamente preenchidos.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Não serão considerados outros títulos além dos mencionados no subitem {{item:quadro_de_titulos}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Os documentos obtidos por meio digital apenas serão pontuados se atenderem a uma das " +
        "seguintes condições:",
    },
    {
      tipo: "item",
      nivel: 2,
      texto: "conter assinatura digital ou eletrônica e a identificação do assinante com o devido código de autenticação;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "conter código de verificação de autenticidade e assinatura, devidamente identificada, " +
        "do responsável por sua emissão;",
    },
    { tipo: "item", nivel: 2, texto: "conter QR Code;" },
    { tipo: "item", nivel: 2, texto: "conter certificado digital assinado com certificado ICP-Brasil." },
    { tipo: "item", nivel: 0, texto: "Não serão aceitos títulos encaminhados via fax, por e-mail ou pelos Correios." },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Todos os cursos previstos para pontuação na avaliação de títulos deverão estar " +
        "concluídos até 30 (trinta) dias antes do último dia de inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Após a análise dos títulos, os pontos referentes a essa avaliação serão divulgados em " +
        "{{campo:cronograma_resultado_titulos}}, no endereço eletrônico " +
        "**{{campo:site_oficial}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que se julgar prejudicado na aferição dos títulos terá **um dia útil**, em " +
        "{{campo:cronograma_recurso_titulos}}, a contar da divulgação do resultado dessa " +
        "avaliação, para requerer a revisão de sua pontuação, por requerimento de próprio punho, " +
        "com a argumentação devida, sem anexar qualquer outro documento além do comprovante de " +
        "inscrição.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "entrega_do_recurso_titulos",
      texto:
        "O requerimento deverá ser entregue pelo candidato ou por terceiro na " +
        "**{{campo:executora_endereco}}**, {{redigir:o horário de atendimento para a entrega — " +
        "ex.: de 9h às 16h}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O limite de entrega, conforme o subitem {{item:entrega_do_recurso_titulos}}, é de " +
        "**{{campo:limite_envelopes}}** envelope(s) por candidato.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Julgados procedentes os recursos apresentados, será processado o novo resultado que, " +
        "somado aos pontos da prova objetiva, determinará o resultado final do certame.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Ao final dessas duas etapas, os candidatos serão classificados e listados em ordem " +
        "decrescente de pontos, de acordo com as vagas a que concorrem.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "Não serão pontuados os títulos utilizados para comprovação da habilitação exigida para o cargo.",
    },
  ],
};
