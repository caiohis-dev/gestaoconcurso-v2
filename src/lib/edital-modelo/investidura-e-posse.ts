/**
 * Capítulo `investidura_e_posse` — o capítulo 15 do documento.
 *
 * Fonte: **21 elementos** — 9 itens e 12 alíneas. O modelo tem **10**, e a divergência é a
 * mais importante de todo o tema.
 *
 * ── 🔴 A LISTA DE DOCUMENTOS NÃO SE TRANSCREVE, e o motivo abre o módulo ──────────────
 *
 * As 12 alíneas do item 15.8 são a lista de documentos da investidura — e essa lista tem dono
 * estruturado desde a fatia 8: `documentos_investidura`, com trigger `IN001` que recusa
 * conselho de classe que nenhum cargo do edital exige.
 *
 * ⭐ **É a mesma lista que produziu o defeito de abertura deste módulo.** A alínea `L` do
 * Edital 004 exige *"Certidão Nada Consta do COREN"* de **Agente Comunitário de Saúde**, cargo
 * de nível médio sem conselho de classe. Medido: o Edital 003 (Enfermagem) tem **dois**
 * documentos de COREN e o 004 herdou **só o segundo**, com o mesmo texto entre parênteses —
 * uma linha copiada à mão de um documento para o outro.
 *
 * 🔴 **Transcrever as 12 alíneas aqui reproduziria essa classe de defeito em cada edital novo**,
 * e pior: criaria uma segunda fonte para uma lista que o banco já valida. O modelo leva **um**
 * artigo de instrução, nomeando a tabela. ⏳ Backlog: um `quadro_fonte` para ela.
 *
 * ⚠️ Pelo mesmo motivo, o *"Diploma do Ensino Médio"* da alínea `I` não entra: os três editais
 * o escrevem diferente, e a escolaridade é propriedade do **cargo**.
 *
 * ── 🔴 O DÉCIMO TERCEIRO defeito: o documento não sabe o que ele é ────────────────────
 *
 * Neste capítulo, o item 15.3 fala em *"ordem de classificação dos candidatos no **Concurso
 * Público**"* e o 15.9, seis linhas abaixo, elimina quem não apresentar documento *"do
 * **Processo Seletivo Público**"*. **O mesmo documento se chama de dois jeitos, no mesmo
 * capítulo** — e no capítulo 16 isso se repete oito vezes. `{{campo:natureza_juridica}}` faz a
 * escolha desaparecer.
 *
 * ── ⭐ E a referência do 15.4 é o SEGUNDO caso que a tradução literal erraria ──────────
 *
 * O 15.4 diz *"conforme subitem **14.1** e estipulado no subitem **14.3**"*. Somar um capítulo
 * daria 15.1 e **15.3** — e o 15.1 de fato é a convocação pelo endereço eletrônico, mas o 15.3
 * é *"a escolha de vagas obedecerá à ordem de classificação"*, que **não estipula prazo
 * nenhum**. Quem estipula o prazo de apresentação é o **15.5**. Relido, não traduzido.
 *
 * ── ⚠️ O que ficou `{{redigir:}}` ────────────────────────────────────────────────────
 *
 * O endereço do **órgão demandante** (Rua 1º de Maio, 106, no 004) aparece aqui e no capítulo
 * 16, e não tem coluna: `executora_endereco` é a sede da executora, que é outra entidade. São
 * dois endereços diferentes no mesmo edital, e confundi-los mandaria o candidato ao lugar
 * errado — por isso instrução, não campo emprestado.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const INVESTIDURA_E_POSSE: CapituloDoModelo = {
  chave: "investidura_e_posse",
  fonte: "Edital 004/2026, capítulo 15, transcrito em 2026-09-19",
  artigosEsperados: 10,
  artigosNaFonte: 21,
  porQueDiverge:
    "As 12 alíneas do item 15.8 são a lista de `documentos_investidura`, que tem dono " +
    "estruturado e trigger próprio — transcrevê-las criaria a segunda fonte que produziu o " +
    "COREN exigido de Agente Comunitário de Saúde no Edital 004.",
  camposUsados: ["site_oficial", "natureza_juridica", "orgao_demandante"],
  ancorasPublicadas: ["convocacao_pelo_site", "prazo_de_apresentacao"],
  ancorasConsumidas: [],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      ancora: "convocacao_pelo_site",
      texto:
        "Os candidatos classificados dentro do número de vagas publicadas serão convocados para " +
        "a investidura no cargo a que concorreram pelo endereço eletrônico " +
        "**{{campo:site_oficial}}**, de acordo com o **{{campo:orgao_demandante}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A convocação para a escolha de vagas será feita pelo **{{campo:orgao_demandante}}**, " +
        "pelo endereço eletrônico **{{campo:site_oficial}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A escolha de vagas obedecerá rigorosamente à ordem de classificação dos candidatos no " +
        "**{{campo:natureza_juridica}}**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Decorrido o prazo de apresentação previsto no subitem {{item:prazo_de_apresentacao}}, " +
        "contado da convocação de que trata o subitem {{item:convocacao_pelo_site}}, o " +
        "**{{campo:orgao_demandante}}** enviará correspondência aos candidatos que não " +
        "compareceram, advertindo sobre o novo prazo de 5 (cinco) dias úteis, a partir da " +
        "emissão da correspondência, para que se apresentem. Após esse período, o candidato que " +
        "não comparecer será considerado desistente.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "prazo_de_apresentacao",
      texto:
        "Os convocados deverão se apresentar ao **{{campo:orgao_demandante}}**, " +
        "{{redigir:o endereço de atendimento do órgão demandante — não é o da entidade " +
        "executora}}, nos dias úteis e em horário de funcionamento, no prazo improrrogável de " +
        "**3 (três) dias úteis** a partir da data da convocação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Antes da investidura no cargo, os candidatos classificados serão submetidos a **exame " +
        "médico admissional**.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Encaminhado ao exame médico, o candidato terá o prazo máximo de 10 (dez) dias úteis " +
        "para retornar ao **{{campo:orgao_demandante}}**, nos dias úteis e em horário de " +
        "funcionamento, com o resultado do exame.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "No ato da investidura, o candidato julgado **apto** no exame médico admissional deverá " +
        "apresentar, além da documentação legal exigida, os seguintes documentos:",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "{{redigir:a lista de documentos da investidura, um por linha, como cadastrada em " +
        "`documentos_investidura` — inclusive os condicionais e os documentos de conselho de " +
        "classe dos cargos que o exigirem}}",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que não apresentar, no ato da investidura, a documentação exigida será " +
        "eliminado do **{{campo:natureza_juridica}}**, e sua vaga será oferecida ao candidato " +
        "imediatamente classificado.",
    },
  ],
};
