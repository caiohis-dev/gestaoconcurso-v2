/**
 * Capítulo `requisitos_investidura` — o capítulo 4 do documento.
 *
 * Fonte: capítulo 4 do Edital 004/2026, **15 artigos** (4.1 mais 4.1.1 a 4.1.14).
 *
 * 🔵 **É o primeiro capítulo TRANSCRITO POR INTEIRO, sem molde e sem `{{redigir:}}`** — e o
 * contraste com o capítulo 3 é o que explica a regra. Estes requisitos são condições jurídicas
 * de investidura em cargo público: nacionalidade, idade, quitação eleitoral e militar,
 * inexistência de penalidade. Eles valem para **qualquer** certame desta banca, de magistério a
 * saúde. Não há nada de específico do cargo a redigir.
 *
 * Quando o conteúdo é genérico, o modelo o entrega pronto; quando é do certame, vira
 * `{{redigir:}}`. É a mesma pergunta que o catálogo de campos faz sobre dado ("varia entre
 * editais?"), aplicada a prosa.
 *
 * ── A territorialidade se AUTODENUNCIA, como no capítulo 2 ───────────────────────────
 *
 * O artigo 4.1.3 do 004 exige "residir dentro da área geográfica oferecida dentro do Quadro II".
 * Aqui ele referencia `{{cap:distribuicao_geografica}}`: num edital sem restrição territorial o
 * capítulo está desligado, o linter acusa `referencia-a-capitulo-excluido` como **erro**, e o
 * requisito diz sozinho que não se aplica. Sem isso, o modelo exigiria residência numa área que
 * o edital não define.
 *
 * ── Correções silenciosas, registradas para não parecerem descuido ───────────────────
 *
 * | onde | o que |
 * |---|---|
 * | 4.1.8 | *"portador de deficiência"* → **"pessoa com deficiência"**, o termo que a Lei Brasileira de Inclusão usa e que o resto do documento já usa |
 * | 4.1.8, 4.1.12 | terminavam sem ponto |
 * | 4.1.9 | terminava com ponto e o resto da lista não — uniformizado com ponto e vírgula |
 *
 * ⚠️ **O que eu NÃO mexi, e vale revisão jurídica:** o 4.1.8 recusa quem tenha "deficiência
 * incompatível com o exercício do cargo". Isso convive mal com o capítulo de reserva de vagas
 * para PCD, que prevê avaliação de compatibilidade por perícia — e a redação parece anterior a
 * ela. Não é correção de transcrição, é decisão de mérito, e não é minha.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const REQUISITOS_INVESTIDURA: CapituloDoModelo = {
  chave: "requisitos_investidura",
  fonte: "Edital 004/2026, capítulo 4, transcrito em 2026-09-18",
  artigosEsperados: 15,
  camposUsados: [],
  ancorasPublicadas: ["requisitos_de_investidura"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      // O capítulo de convocação e posse aponta para cá ao cobrar os documentos.
      ancora: "requisitos_de_investidura",
      texto: "São requisitos básicos exigidos para a investidura no cargo público:",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Ser brasileiro nato ou naturalizado, ou cidadão português que tenha adquirido a " +
        "igualdade de direitos e obrigações civis e o gozo dos direitos políticos;",
    },
    {
      tipo: "item",
      nivel: 1,
      texto: "Comprovar que possui o pré-requisito (habilitação) para o cargo pretendido;",
    },
    {
      tipo: "item",
      nivel: 1,
      // ⚠️ Referencia o CAPÍTULO, não "o Quadro II": ver o cabeçalho deste arquivo e a medição
      // da numeração de quadros na rodada 4.
      texto:
        "Residir dentro da área geográfica oferecida, quando o cargo tiver restrição " +
        "territorial, conforme o capítulo {{cap:distribuicao_geografica}};",
    },
    { tipo: "item", nivel: 1, texto: "Ter 18 (dezoito) anos completos na data da posse;" },
    {
      tipo: "item",
      nivel: 1,
      texto: "Conhecer as exigências contidas neste Edital, atender a elas e acatá-las;",
    },
    { tipo: "item", nivel: 1, texto: "Estar em dia com as obrigações eleitorais;" },
    { tipo: "item", nivel: 1, texto: "Gozar de boa saúde física e mental;" },
    {
      tipo: "item",
      nivel: 1,
      texto: "Não ser pessoa com deficiência incompatível com o exercício do cargo;",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Não ter sofrido, no exercício de função em órgão público, penalidade incompatível " +
        "com a nova investidura;",
    },
    { tipo: "item", nivel: 1, texto: "Estar em pleno gozo de seus direitos civis e políticos;" },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Não ter sido demitido por justa causa de órgão público federal, estadual ou municipal;",
    },
    { tipo: "item", nivel: 1, texto: "Não ser aposentado por invalidez;" },
    {
      tipo: "item",
      nivel: 1,
      texto: "Estar em dia com o Serviço Militar obrigatório, quando for o caso;",
    },
    {
      tipo: "item",
      nivel: 1,
      // ⚠️ O artigo 37, XVI da Constituição fica LITERAL: é a mesma norma em todo edital, e a
      // regra exige que o dado varie para virar campo.
      texto:
        "Não estar em acumulação de cargo, emprego ou função pública vedada pelo artigo 37, " +
        "inciso XVI, da Constituição Federal.",
    },
  ],
};
