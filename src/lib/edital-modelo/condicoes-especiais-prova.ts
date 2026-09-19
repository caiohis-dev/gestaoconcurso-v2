/**
 * Capítulo `condicoes_especiais_prova` — o capítulo 11 do documento.
 *
 * Fonte: **27 elementos** — 21 itens, 4 subitens e 2 alíneas. Transcrito por inteiro.
 *
 * ── 🔴 O NONO DEFEITO DA FAMÍLIA, e é de um tipo novo: NÚMERO REPETIDO ────────────────
 *
 * O Edital 004 tem **dois subitens `11.4.1`**, um atrás do outro: *"DA DIFERENÇA DE CRITÉRIOS
 * DE AVALIAÇÃO"* e *"DA ENTREGA SEPARADA DA DOCUMENTAÇÃO"*. Não é referência deslocada nem
 * cópia de outro edital — é o **mesmo número para duas coisas diferentes na mesma página**, e
 * o subitem seguinte é `11.4.2`, de modo que um dos dois simplesmente não tem endereço.
 *
 * 🔴 **E há um segundo, pior:** logo depois do item `11.10` (uso de prótese auditiva) vem um
 * subitem numerado **`11.8.1`**, que trata justamente da prótese do 11.10. O número diz que ele
 * pende do 11.8 — que é a prova ampliada, outro assunto. **Posição e número se contradizem**, e
 * quem seguir o número vai parar no item errado.
 *
 * Os dois desaparecem por construção: aqui o subitem é `nivel: 1` na posição certa, e
 * `numerarItens` calcula o número a partir do pai. Nenhum dos dois é escolha de quem escreve.
 *
 * ── As duas referências deslocadas, as duas no mesmo item ─────────────────────────────
 *
 * O `11.21` cita **"o prazo no subitem 10.18"** e **"o mesmo endereço descrito no subitem
 * 10.18"** — duas vezes o mesmo número errado. Quem fixa prazo e endereço é o **11.20**, a
 * linha imediatamente acima. Deslocamento de um capítulo, como nas rodadas 9 a 12.
 *
 * ── 🔴 Os três valores da lactante viraram campo, e um deles é DERIVADO ───────────────
 *
 * `idade_maxima_lactente` e `tempo_compensacao_lactante` já tinham coluna em
 * `regras_lactantes` — literais, o painel do capítulo e o documento divergiriam em silêncio.
 *
 * ⭐ **`data_corte_lactante` é o campo mais importante do catálogo**, e é o único sem coluna:
 * ele sai da data da prova menos a idade máxima, na renderização. O Edital 003/2026 publicou
 * essa data à mão — *"a partir do dia 16 de março"*, derivada de uma "data da prova" de 16/09
 * que é, no cronograma do próprio edital, o dia do **comprovante de local de prova**; a prova é
 * em 20/09. **O corte publicado está 4 dias errado**, e recusaria por engano uma candidata cujo
 * bebê nasceu em 18/03. Ver `src/lib/edital-acoes-afirmativas.ts`.
 *
 * ── ⚠️ O que ficou LITERAL, e por quê ────────────────────────────────────────────────
 *
 * - **"Arial – tamanho 20 em papel A3"** e **"60 (sessenta) minutos"** de tempo adicional: não
 *   têm coluna em lugar nenhum do módulo, e inventar campo sem fonte só criaria um marcador que
 *   nunca resolve. Ficam no texto, que é editável. ⏳ Registrado no backlog.
 * - **"72 horas ANTES"**: idem, e é prazo processual que não varia entre os três editais reais.
 *
 * ── ⚠️ Correções de transcrição ──────────────────────────────────────────────────────
 *
 * - O 11.3 diz *"tratado neste possui finalidade"* — falta a palavra "item"; aqui, "tratado
 *   neste capítulo".
 * - O 11.1 manda informar *"no subitem 'Outro'"* e o 11.13, *"selecionar a opção 'Outra'"* —
 *   gênero trocado entre dois itens do mesmo capítulo, para o mesmo campo da ficha. Unificado.
 * - "A FEVRE" vira `{{campo:entidade_executora}}`, como nos capítulos 7 e 8.
 * - O 11.18 tem quebra de linha no meio da palavra ("realizará as \nprovas").
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const CONDICOES_ESPECIAIS_PROVA: CapituloDoModelo = {
  chave: "condicoes_especiais_prova",
  fonte: "Edital 004/2026, capítulo 11, transcrito em 2026-09-19",
  artigosEsperados: 27,
  camposUsados: [
    "entidade_executora",
    "executora_endereco",
    "idade_maxima_lactente",
    "tempo_compensacao_lactante",
    "data_corte_lactante",
    "cronograma_entrega_atestado_especial",
  ],
  ancorasPublicadas: ["entrega_documentacao_especial"],
  ancorasConsumidas: ["documentos_pcd"],
  artigos: [
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que necessitar de condições especiais — gestante, lactante ou qualquer das " +
        "situações descritas nos subitens deste capítulo — deverá informar sua condição na Ficha " +
        "de Inscrição Eletrônica, no campo **Necessidade de Atendimento Especial**, opção " +
        "**Outra**, indicando se necessitará de atendimento diferenciado.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Somente serão apreciadas as solicitações que especifiquem a condição requerida, apontem " +
        "as circunstâncias que a justifiquem e estejam acompanhadas do respectivo documento " +
        "médico comprobatório que ateste a real necessidade do atendimento especializado.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O laudo médico exigido para o atendimento especial tratado neste capítulo tem finalidade " +
        "**estritamente operacional** para o dia de aplicação da prova e **não se confunde** com " +
        "o laudo exigido para concorrer às vagas reservadas a pessoas com deficiência, tratado no " +
        "{{cap:vagas_pcd}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência que desejar concorrer às vagas reservadas do " +
        "{{cap:vagas_pcd}} e também necessitar de adaptações para o dia da prova deverá, " +
        "obrigatoriamente, apresentar **dois laudos médicos distintos**.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "**Da diferença de critérios de avaliação:** a análise da documentação do " +
        "{{cap:vagas_pcd}} obedece aos critérios das leis que regulamentam o enquadramento legal " +
        "como pessoa com deficiência; a avaliação deste capítulo tem caráter **estritamente " +
        "logístico e de acessibilidade**, sendo aceitos laudos de médicos particulares ou " +
        "assistentes que atestem a dificuldade ou limitação do candidato, permanente ou " +
        "temporária, e justifiquem a adaptação necessária para o dia da prova.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "**Da entrega separada da documentação:** a entrega ocorre de forma **separada e " +
        "independente**, devendo o candidato acondicionar os documentos em envelopes lacrados " +
        "distintos e identificados por fora, sendo:",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "**Envelope 1 — vagas reservadas:** a documentação exigida no subitem " +
        "{{item:documentos_pcd}} e seguintes, para a análise do direito à reserva;",
    },
    {
      tipo: "item",
      nivel: 2,
      texto:
        "**Envelope 2 — atendimento especial:** a documentação exigida neste capítulo, para a " +
        "montagem da estrutura de acessibilidade no dia da prova.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "A entrega de apenas um dos envelopes não supre a ausência do outro. O candidato que " +
        "entregar somente o envelope das vagas reservadas e omitir o do atendimento especial " +
        "realizará a prova em sala comum, sem direito a adaptação.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A **{{campo:entidade_executora}}** reserva-se o direito de não atender à necessidade que " +
        "não tenha sido solicitada na Ficha de Inscrição Eletrônica e comprovada por documento na " +
        "data prevista.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A solicitação de condição especial deverá ser feita previamente, ficando o atendimento " +
        "sujeito à análise da legalidade e da razoabilidade do pedido.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência visual que necessitar de prova ampliada ou de auxílio de " +
        "ledor deverá anexar laudo médico que comprove a condição e justifique a necessidade.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Na prova ampliada a fonte é Arial, tamanho 20, em papel A3. **Não é possível ampliar o " +
        "cartão-resposta**; se necessário, o candidato deverá solicitar o auxílio de ledor ou " +
        "marcador.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência auditiva que necessitar de intérprete de Libras para as " +
        "orientações gerais de prova deverá anexar laudo médico que comprove a condição e " +
        "justifique a necessidade.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato com deficiência auditiva que faça uso de prótese ou aparelho auditivo deverá " +
        "anexar laudo de médico especialista que ateste a necessidade de uso contínuo, a fim de " +
        "autorizar a permanência com o aparelho durante a realização da prova.",
    },
    {
      tipo: "item",
      nivel: 1,
      texto:
        "Sem essa comprovação, o candidato deverá retirar o aparelho auditivo antes do início da " +
        "prova e guardá-lo em envelope de segurança, sob pena de eliminação do certame.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O candidato que necessitar de tempo adicional para a realização da prova poderá " +
        "solicitar acréscimo de, no máximo, 60 (sessenta) minutos, anexando laudo especializado " +
        "que comprove a condição e justifique a necessidade.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Fica assegurado à candidata lactante o direito de amamentar seu filho durante a " +
        "realização da prova, desde que o lactente tenha nascido a partir de " +
        "**{{campo:data_corte_lactante}}**, observado o limite de " +
        "**{{campo:idade_maxima_lactente}}** meses de idade na data de realização da prova.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "A candidata deverá solicitar a condição especial durante o período de inscrição, ao " +
        "preencher a Ficha de Inscrição Eletrônica, no campo **Necessidade de Atendimento " +
        "Especial**, opção **Outra**, indicando a condição de lactante.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "O acompanhante e o lactente deverão ingressar no local de prova no mesmo horário " +
        "estabelecido para os candidatos.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "No dia da prova, a candidata lactante deverá levar a fotocópia da certidão de nascimento " +
        "do lactente, cujo nascimento deverá ter ocorrido a partir de " +
        "**{{campo:data_corte_lactante}}**, e um acompanhante com maioridade legal, que ficará em " +
        "sala reservada e será responsável pela guarda da criança. O acompanhante permanecerá no " +
        "local designado pela coordenação e se submeterá a todas as normas deste Edital, " +
        "inclusive quanto ao uso de equipamento eletrônico e de celular.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Para garantir a isonomia e a organização do certame, haverá **um único período " +
        "programado** de até **{{campo:tempo_compensacao_lactante}}** minutos durante a prova " +
        "para a amamentação, a ser definido pela coordenação do local. Esse tempo será " +
        "integralmente compensado, estendendo-se o horário de término da prova dessas candidatas " +
        "em **{{campo:tempo_compensacao_lactante}}** minutos além do previsto para os demais.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Na sala reservada para a amamentação ficarão somente a candidata lactante, a criança e " +
        "um fiscal, sendo vedada a permanência de babás ou de quaisquer outras pessoas com grau " +
        "de parentesco ou de amizade com a candidata.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto: "A candidata lactante que não levar acompanhante para a guarda da criança não fará a prova.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Em nenhuma hipótese a criança poderá permanecer dentro da sala de aplicação da prova ou " +
        "sozinha em outro ambiente.",
    },
    {
      tipo: "item",
      nivel: 0,
      ancora: "entrega_documentacao_especial",
      texto:
        "Toda a documentação comprobatória de necessidade especial no dia da prova deverá ser " +
        "entregue em envelope lacrado na **{{campo:executora_endereco}}**, em " +
        "{{campo:cronograma_entrega_atestado_especial}}, {{redigir:o horário de atendimento para " +
        "a entrega — ex.: de 9h às 16h}}.",
    },
    {
      tipo: "item",
      nivel: 0,
      texto:
        "Caso a necessidade de condição especial surja após o prazo do subitem " +
        "{{item:entrega_documentacao_especial}}, o candidato poderá encaminhar a solicitação, " +
        "com o laudo médico que comprove a necessidade, até **72 horas antes** do horário " +
        "marcado para o início da prova, no mesmo endereço indicado naquele subitem.",
    },
  ],
};
