/**
 * Capítulo `quadro_de_cargos` — o capítulo 2 do documento, e o PRIMEIRO com tabela gerada.
 *
 * Fonte: capítulo 2 do Edital 004/2026, **4 artigos** (2.1 a 2.4).
 *
 * ⚠️ A linha de título publicada — *"O QUADRO I, abaixo, contém as informações relativa ao
 * cargo oferecido"* — não virou artigo: ela é o cabeçalho do capítulo, e o título vem do
 * catálogo. (Ela também carrega um erro de concordância, "informações relativa".)
 *
 * ── 🔴 NENHUM NÚMERO DE QUADRO APARECE AQUI, e a medição é contundente ────────────────
 *
 * Contei as citações de "Quadro" nos três editais:
 *
 * | | Quadro I | Quadro II | Quadro III | Quadro IV |
 * |---|---|---|---|---|
 * | 002 | cargos | provas | títulos | títulos |
 * | 003 | cargos | provas | — | — |
 * | 004 | cargos | **vagas por UBSF** | vagas (2º cargo) | — |
 *
 * O mesmo número designa coisas diferentes em editais diferentes. E o 004 vai além: ele chama
 * de **"Quadro II" tanto as vagas de ACS (item 5.1.2) quanto a tabela de composição da prova**
 * — dois quadros com o mesmo número no mesmo documento publicado.
 *
 * É a mesma família dos outros três defeitos medidos neste tema (as ~35 referências
 * deslocadas, o `V0LTA`, o número do anexo). Por isso o quadro deste capítulo **não tem número
 * na legenda**, e quem precisa apontar para ele referencia o **capítulo**
 * (`{{cap:quadro_de_cargos}}`), cujo número é calculado. ⏳ A lacuna de numerar quadro e anexo
 * está no backlog, junto, para a fatia de exportação.
 *
 * ── 🔴 O VENCIMENTO NÃO ENTRA EM PROSA ───────────────────────────────────────────────
 *
 * O item 2.4 do 004 escreve "O vencimento é de R$ 3.036,00…" — e isso só funciona porque os
 * **dois** cargos daquele edital têm o mesmo vencimento. Com valores diferentes a frase estaria
 * errada, e é a razão da regra do módulo: valor que varia por cargo sai no quadro, nunca em
 * frase. Aqui o artigo aponta para o quadro.
 *
 * E a lista de vantagens (auxílio alimentação, gratificação social, adicional por titulação,
 * insalubridade, triênio) é **específica do certame** — insalubridade é de carreira da saúde,
 * FUNDEB é de magistério. Vira `{{redigir:}}`, pelo mesmo motivo do fundamento legal na rodada
 * 3. ⚠️ A alternativa — colunas para cada vantagem — foi preterida: são valores municipais que
 * mudam por lei, aparecem uma vez cada, e transformar o capítulo num formulário de cinco campos
 * para reproduzir uma frase é o contrário do que a regra do catálogo pede.
 *
 * ── A territorialidade se AUTODENUNCIA quando o capítulo está desligado ──────────────
 *
 * Os artigos 2.2 e 2.3 só fazem sentido num edital com restrição territorial. O modelo não tem
 * "artigo condicional" — mas não precisa: eles referenciam `{{cap:distribuicao_geografica}}`, e
 * com aquele capítulo desligado o linter acusa `referencia-a-capitulo-excluido` como **erro**.
 * O artigo diz sozinho que está fora de lugar, em vez de sair publicado em silêncio.
 *
 * ⚠️ E o texto foi generalizado: o 004 diz "Para o cargo de Agente Comunitário de Saúde (ACS)",
 * que é o cargo dele. A regra vale para qualquer cargo com restrição territorial.
 *
 * ⚠️ Correção silenciosa: o item 2.2 do 004 diz "O número de vagas … **estão** descritas".
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const QUADRO_DE_CARGOS: CapituloDoModelo = {
  chave: "quadro_de_cargos",
  fonte: "Edital 004/2026, capítulo 2, transcrito em 2026-09-18",
  artigosEsperados: 4,
  camposUsados: [],
  ancorasPublicadas: ["quadro_dos_cargos"],
  ancorasConsumidas: [],
  artigos: [
    {
      // 🔴 O primeiro artigo `quadro` do modelo. O `texto` é só a LEGENDA; a tabela nasce de
      // `edital_cargos` na renderização (`QuadroDoArtigo`). A CHECK do banco é bicondicional:
      // `tipo = 'quadro'` exige `quadro_fonte`, e vice-versa.
      tipo: "quadro",
      nivel: 0,
      quadroFonte: "cargos",
      ancora: "quadro_dos_cargos",
      texto: "Do cargo, habilitação, carga horária e vencimentos:",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O número de vagas oferecidas por unidade está descrito no capítulo " +
        "{{cap:distribuicao_geografica}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Para os cargos com restrição territorial, o candidato só poderá concorrer " +
        "**à vaga da unidade correspondente à sua área de residência**, devendo comprovar o " +
        "domicílio fixo na localidade **desde a data de publicação deste Edital**, conforme as " +
        "delimitações territoriais indicadas no capítulo {{cap:distribuicao_geografica}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O vencimento de cada cargo é o indicado no quadro deste capítulo, acrescido de " +
        "{{redigir:as vantagens que este certame oferece — auxílio alimentação, gratificação " +
        "social, adicionais por titulação ou insalubridade, triênio e demais gratificações " +
        "previstas em lei, com os respectivos valores ou percentuais}}.",
    },
  ],
};
