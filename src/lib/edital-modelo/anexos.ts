/**
 * Capítulo `anexos` — os elementos PÓS-TEXTUAIS, e o fecho do modelo.
 *
 * 🔴 **Não é numerado**, como o preâmbulo — e por isso **nenhum artigo daqui é `item`**: são
 * `prosa` e `quadro`. Um `item` num capítulo `numerado: false` pediria um número que
 * `numerarItens` não dá.
 *
 * ── O que mora aqui, e por que só isto ────────────────────────────────────────────────
 *
 * Os três editais publicam, depois do corpo: o **cronograma**, o **conteúdo programático** e,
 * no 004, as **áreas de abrangência**. As três são tabelas com dono estruturado, e a regra do
 * módulo é que **nenhuma tabela se digita**:
 *
 * | anexo | dono | como entra |
 * |---|---|---|
 * | cronograma | `cronograma_etapas` | `quadro_fonte: 'cronograma'` — a **quinta** fonte, e a última a ser usada pelo modelo |
 * | conteúdo programático | fatia 10 | a tela o edita e o renderiza; aqui só a chamada |
 * | áreas de abrangência | `territorialidade_abrangencia` | idem, e **condicional** ao capítulo territorial |
 *
 * ⚠️ **Nenhum artigo daqui cita NÚMERO de anexo**, e isso é medido: o conteúdo programático é
 * Anexo I no 002 e no 003 e **Anexo II no 004** — a inversão que já enganou a própria doc deste
 * módulo até 17/09. ⏳ Numerar anexo e quadro é item do backlog, para a fatia de exportação.
 *
 * ── O fecho do documento ─────────────────────────────────────────────────────────────
 *
 * Local, data e assinatura são os três campos que a rodada 0 criou e que **nenhum capítulo
 * usava até aqui**: `data_publicacao`, `signatario_nome` e `signatario_cargo`. ⚠️ O Edital 004
 * publicado traz *"Volta Redonda, ___ de ___________ de 2026"* — a **terceira** ocorrência de
 * formulário em branco no mesmo documento, depois do 12.4 e do 14.9. Aqui a data vem da coluna,
 * e o linter cobra enquanto ela faltar.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const ANEXOS: CapituloDoModelo = {
  chave: "anexos",
  fonte: "Edital 004/2026 (pós-textuais) e o cronograma do Edital 003/2026, em 2026-09-19",
  artigosEsperados: 6,
  camposUsados: ["data_publicacao", "signatario_nome", "signatario_cargo"],
  ancorasPublicadas: [],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "prosa",
      texto:
        "Integram este Edital, para todos os fins, o cronograma e o conteúdo programático " +
        "apresentados a seguir.",
    },
    {
      tipo: "quadro",
      quadroFonte: "cronograma",
      texto: "Cronograma do certame:",
    },
    {
      tipo: "prosa",
      texto:
        "O conteúdo programático sobre o qual se baseiam as questões da prova objetiva segue " +
        "como anexo deste Edital, por cargo e por disciplina.",
    },
    {
      tipo: "prosa",
      texto:
        "As áreas de abrangência das unidades, quando houver restrição territorial, seguem como " +
        "anexo deste Edital, nos termos do capítulo {{cap:distribuicao_geografica}}.",
    },
    {
      tipo: "prosa",
      // ⚠️ O município é LITERAL, como no preâmbulo — e escrito certo. Não há coluna para
      // ele, e a decisão da rodada 2 foi essa: o modelo é o da FEVRE. O defeito que ela
      // evita é o `MUNICÍPIO DE V0LTA REDONDA` com zero, medido 4× nos editais reais.
      texto: "Volta Redonda, {{campo:data_publicacao}}.",
    },
    {
      tipo: "prosa",
      texto: "**{{campo:signatario_nome}}**\n{{campo:signatario_cargo}}",
    },
  ],
};
