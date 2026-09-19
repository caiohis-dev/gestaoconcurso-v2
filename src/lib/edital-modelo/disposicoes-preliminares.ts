/**
 * Capítulo `disposicoes_preliminares` — o capítulo 1 do documento.
 *
 * Fonte: capítulo 1 do Edital 004/2026, **6 artigos**, todos de nível 0. Nenhuma referência
 * cruzada a auditar — é o primeiro capítulo, e ninguém aponta para trás dele.
 *
 * ── 🔴 O FUNDAMENTO LEGAL NÃO PODE SER LITERAL, e foi isto que criou o `{{redigir:}}` ──
 *
 * O item 1.1 do 004 funda o certame em "Art. 198 §4º da CF, Lei Federal 11.350/2006 e Leis
 * Municipais 6.787/26 e 6.836/26" e descreve o objeto como "prevenção de doenças e promoção
 * da saúde pública no âmbito da Estratégia Saúde da Família". Isso é fundamento e objeto de
 * um concurso de **Agente Comunitário de Saúde**.
 *
 * **Medido:** cada uma dessas leis aparece **exatamente uma vez** no documento inteiro. Pela
 * regra do catálogo de campos (varia entre editais **E** repete-se **ou** é data/valor), elas
 * não viram campo. Mas deixá-las literais faria o modelo publicar fundamento legal de saúde
 * num edital de magistério — e a frase seria plausível o bastante para passar na revisão.
 *
 * Daí os dois `{{redigir:}}`: o marcador que carrega a instrução e que o linter trata como
 * **erro**, citando o que falta. Ver `edital-campos.ts`.
 *
 * ── 🔴 O NÚMERO DO ANEXO É REFERÊNCIA CALCULADA, e não há mecanismo (lacuna registrada) ──
 *
 * **Medido nos três editais:** o item 1.6 aponta o conteúdo programático para o **Anexo I**
 * no 002 e no 003, e para o **Anexo II** no 004 — porque lá o Anexo I é a abrangência
 * territorial. É o mesmo problema da numeração de capítulo, um nível abaixo: elemento
 * pós-textual condicional que entra desloca todos os seguintes.
 *
 * `{{cap:anexos}}` não serve — `anexos` é `numerado: false`, então resolveria para `[?anexos]`.
 *
 * **Por ora o artigo 1.6 não cita número**: "como anexo deste Edital" é impreciso e nunca
 * falso, contra um número que estaria errado em 2 dos 3 editais reais. A lacuna fica no
 * backlog para a fatia de exportação, que é quem monta os anexos.
 *
 * ⚠️ E o 004 repete a referência ao conteúdo programático no capítulo da prova — então este
 * é um apontamento que acontece **duas vezes por edital**, não uma.
 *
 * ── Correção silenciosa registrada ───────────────────────────────────────────────────
 *
 * O item 1.1 do 004 termina sem ponto ("a contar da data de sua homologação"). Aqui leva
 * ponto final.
 *
 * 🔵 **CORRIGIDO na rodada 4**, quando a numeração dos quadros foi medida. Este artigo dizia
 * *"conforme indicado no Quadro I abaixo"* — um número de quadro literal, exatamente o que a
 * rodada 3 evitou para os anexos e deixou passar aqui. Medido: "Quadro II" é a composição da
 * prova no 002 e no 003, e as vagas por UBSF no 004 — **que também chama a tabela da prova de
 * Quadro II**, dois quadros diferentes com o mesmo número no mesmo documento. Agora o artigo
 * referencia o CAPÍTULO (`{{cap:quadro_de_cargos}}`), cujo número é calculado.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const DISPOSICOES_PRELIMINARES: CapituloDoModelo = {
  chave: "disposicoes_preliminares",
  fonte: "Edital 004/2026, capítulo 1, transcrito em 2026-09-18",
  artigosEsperados: 6,
  camposUsados: ["natureza_juridica", "entidade_executora", "decreto_autorizador", "cargos_do_edital", "site_oficial"],
  ancorasPublicadas: ["objeto_do_certame", "conteudo_programatico_anexo"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      // Âncora: o capítulo da prova e o das disposições gerais referenciam o objeto.
      ancora: "objeto_do_certame",
      texto:
        "O **{{campo:natureza_juridica}}**, objeto deste Edital, a ser realizado sob a " +
        "responsabilidade da **{{campo:entidade_executora}}**, nos termos do " +
        "**{{campo:decreto_autorizador}}** e em estrita observância a " +
        "{{redigir:o fundamento legal específico deste certame — os artigos da Constituição, " +
        "leis federais e leis municipais que o autorizam}}, visa ao preenchimento de " +
        "**cargos públicos** para **{{campo:cargos_do_edital}}**, " +
        "{{redigir:a finalidade do cargo neste certame — que serviço público estas vagas " +
        "atendem}}, conforme indicado no capítulo {{cap:quadro_de_cargos}}, bem como à formação " +
        "de Cadastro de " +
        "Reserva para as vagas que surgirem ou forem criadas dentro do prazo de validade do " +
        "certame e de sua prorrogação, se houver, a contar da data de sua homologação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O **{{campo:natureza_juridica}}** será realizado através de Provas Objetivas de acordo " +
        "com a habilitação exigida e os programas divulgados, e terá caráter eliminatório e " +
        "classificatório.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O conhecimento prévio das normas contidas neste Edital é requisito essencial para a " +
        "inscrição e participação neste certame. O candidato que, por qualquer motivo, deixar " +
        "de atender às normas estabelecidas neste Edital será eliminado.",
    },
    {
      tipo: "item",
      nivel: 0,
      // ⚠️ A LGPD fica LITERAL de propósito: ela é a mesma em todo edital, e a regra do
      // catálogo exige que o dado varie entre editais para virar campo. Campo para constante
      // é formulário a mais sem verdade a mais.
      texto:
        "Os dados pessoais dos candidatos serão utilizados em conformidade com a Lei Federal " +
        "nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD) exclusivamente para " +
        "as finalidades deste certame.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Ao inscrever-se, o candidato declara estar ciente e concordar com a utilização de " +
        "seus dados pessoais para as etapas necessárias à realização deste certame.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "conteudo_programatico_anexo",
      // ⚠️ SEM o número do anexo — ver o cabeçalho deste arquivo. A âncora existe para que o
      // capítulo da prova aponte para cá em vez de repetir a referência ao anexo.
      texto:
        "O Conteúdo Programático deste certame será disponibilizado no endereço eletrônico " +
        "**{{campo:site_oficial}}**, como anexo deste Edital.",
    },
  ],
};
