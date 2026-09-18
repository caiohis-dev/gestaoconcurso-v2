/**
 * O cronograma do certame — catálogo de etapas e conferência de coerência.
 *
 * 🎯 **É por aqui que o segundo defeito do Edital 004 morre.** Os `"dia XX/xx/2026"`
 * publicados nos itens 12.4 e 14.9 eram datas de cronograma nunca preenchidas. Vindas de
 * um campo, "vazio" vira estado detectável.
 *
 * 🔴 **O sistema CONFERE, não calcula.** Medido nos editais reais: a data é escrita, e
 * "1 dia útil" é texto descritivo ao lado dela ("terá 01 (um) dia útil (21/09/2026) para
 * recorrer"). Nenhuma conferência aqui precisa de calendário de feriados — precedência é
 * comparação de datas, e fim de semana sai do dia da semana.
 */

export type TipoDeData = "DATA_UNICA" | "INTERVALO" | "ALTERNATIVAS";

export interface EtapaCronograma {
  chave: string | null;
  nome_evento: string;
  tipo: TipoDeData;
  /** ISO `YYYY-MM-DD`. Vazio é estado válido durante a redação. */
  datas: string[];
  ordem: number;
}

/**
 * As etapas que os editais da FEVRE têm, extraídas do cronograma do Edital 003/2026.
 * São **sugestões** para montar um cronograma novo — nenhuma é obrigatória, e o autor
 * pode acrescentar etapa própria (aí a `chave` fica nula).
 *
 * ⚠️ A ordem aqui é a do documento real, não uma invenção.
 */
export const ETAPAS_SUGERIDAS: ReadonlyArray<{ chave: string; nome: string; tipo: TipoDeData }> = [
  { chave: "inscricoes",                 nome: "Inscrições",                                        tipo: "INTERVALO" },
  { chave: "pagamento_boleto",           nome: "Pagamento do boleto",                               tipo: "DATA_UNICA" },
  { chave: "entrega_isencao",            nome: "Entrega do formulário de isenção",                  tipo: "DATA_UNICA" },
  { chave: "resultado_isencao",          nome: "Resultado da análise de isenção",                   tipo: "DATA_UNICA" },
  { chave: "retirada_atestado_pcd",      nome: "Retirada do atestado médico (PCD)",                 tipo: "ALTERNATIVAS" },
  { chave: "entrega_atestado_pcd",       nome: "Entrega do atestado médico",                        tipo: "ALTERNATIVAS" },
  { chave: "entrega_autodeclaracao",     nome: "Entrega da autodeclaração",                         tipo: "ALTERNATIVAS" },
  { chave: "entrega_declaracao_jurado",  nome: "Entrega da declaração de jurado",                   tipo: "DATA_UNICA" },
  { chave: "entrega_atestado_especial",  nome: "Entrega de atestado para condição especial",        tipo: "DATA_UNICA" },
  { chave: "confirmacao_inscricao",      nome: "Confirmação da inscrição",                          tipo: "DATA_UNICA" },
  { chave: "recurso_inscricao",          nome: "Recurso da inscrição",                              tipo: "DATA_UNICA" },
  { chave: "decisao_recurso_inscricao",  nome: "Decisão do recurso de inscrição",                   tipo: "DATA_UNICA" },
  { chave: "comprovante_local_prova",    nome: "Comprovante de local de prova",                     tipo: "DATA_UNICA" },
  { chave: "prova_objetiva",             nome: "Prova objetiva",                                    tipo: "DATA_UNICA" },
  { chave: "divulgacao_gabarito",        nome: "Divulgação do gabarito",                            tipo: "DATA_UNICA" },
  { chave: "recurso_gabarito",           nome: "Recebimento dos recursos ao gabarito",              tipo: "DATA_UNICA" },
  { chave: "resultado_preliminar",       nome: "Resultado preliminar",                              tipo: "DATA_UNICA" },
  { chave: "vista_folha_respostas",      nome: "Vista da folha de respostas",                       tipo: "DATA_UNICA" },
  // 🔵 As três etapas de TÍTULOS entraram com a fatia 6, em 2026-09-16. Elas faltavam, e
  // a falta era concreta: o Edital 002 publica as três (entrega em 22 OU 23/07/2026,
  // resultado em 12/08, recurso em 13/08), e sem elas o prazo de conclusão dos cursos —
  // "30 dias antes do fim das inscrições", item 13.17 — não tinha de onde ser derivado.
  // ⚠️ A entrega é ALTERNATIVAS, não INTERVALO: são dois dias à escolha do candidato, não
  // uma janela contínua. Modelá-la como intervalo diria que 22 e 23 é "de 22 a 23", o que
  // muda o que o candidato lê.
  { chave: "entrega_titulos",            nome: "Entrega dos títulos",                               tipo: "ALTERNATIVAS" },
  { chave: "resultado_titulos",          nome: "Resultado da avaliação de títulos",                 tipo: "DATA_UNICA" },
  { chave: "recurso_titulos",            nome: "Recurso da avaliação de títulos",                   tipo: "DATA_UNICA" },
  { chave: "resultado_final",            nome: "Resultado final e homologação",                     tipo: "DATA_UNICA" },
];

/** A primeira data da etapa, ou `null` se ainda não preenchida. */
export function primeiraData(e: EtapaCronograma): string | null {
  return e.datas.length ? [...e.datas].sort()[0] : null;
}

/** A última data da etapa — para INTERVALO é o fim; para ALTERNATIVAS, a mais tardia. */
export function ultimaData(e: EtapaCronograma): string | null {
  return e.datas.length ? [...e.datas].sort()[e.datas.length - 1] : null;
}

export interface AvisoCronograma {
  severidade: "erro" | "aviso";
  chave: string | null;
  regra: string;
  mensagem: string;
}

/**
 * ⚠️ Fim de semana sem `Date`: `new Date("2026-09-20")` é UTC, e em fuso negativo isso
 * devolve o dia ANTERIOR. O bug clássico de data no Brasil. A conta de Sakamoto abaixo
 * trabalha sobre os números do calendário e não tem fuso.
 */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const ano = m < 3 ? a - 1 : a;
  return (ano + Math.floor(ano / 4) - Math.floor(ano / 100) + Math.floor(ano / 400) + t[m - 1] + d) % 7;
}

export const ehFimDeSemana = (iso: string) => [0, 6].includes(diaDaSemana(iso));

const NOMES_DOS_DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

/** O dia da semana por extenso. `diaDaSemana` devolve o índice; isto devolve o nome. */
export function nomeDoDiaDaSemana(iso: string): string {
  return NOMES_DOS_DIAS[diaDaSemana(iso)];
}

/** `2026-09-20` → `20/09/2026`. Sem `Date`, pelo mesmo motivo de `diaDaSemana`. */
export function formatarDataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * 🔴 As datas de uma etapa como o documento as publica — e a forma depende do TIPO.
 *
 * | tipo | saída |
 * |---|---|
 * | `DATA_UNICA` | `20/09/2026` |
 * | `INTERVALO` | `29/06/2026 a 27/07/2026` |
 * | `ALTERNATIVAS` | `06/07/2026, 09/07/2026, 13/07/2026 ou 20/07/2026` |
 *
 * ⚠️ **Espremer ALTERNATIVAS num intervalo publicaria um edital FALSO** — o candidato
 * leria que pode entregar em qualquer dia de 06/07 a 20/07, quando só cinco dias são
 * oferecidos. Por isso o `" ou "` não é enfeite, e por isso esta função lê `e.tipo` em
 * vez de receber a forma pronta de quem chama.
 *
 * ⚠️ **Existe UMA implementação disto, e é esta.** Ela serve o quadro do cronograma
 * (`QuadroDoArtigo`) e o marcador `{{campo:cronograma_*}}` (`edital-campos.ts`). Se
 * voltarem a existir duas, elas divergem no dia em que uma for corrigida — que foi
 * exatamente o motivo de `parsearCapitulo` ter parado de numerar (`edital-itens.ts`).
 *
 * Etapa sem data devolve string vazia: quem chama decide o que dizer. Inventar um texto
 * aqui esconderia o estado que o linter existe para acusar.
 */
export function formatarDatasDaEtapa(
  e: Pick<EtapaCronograma, "tipo" | "datas">,
  opcoes: { comDiaDaSemana?: boolean } = {},
): string {
  if (e.datas.length === 0) return "";

  const escrever = (iso: string) =>
    opcoes.comDiaDaSemana ? `${formatarDataBr(iso)} (${nomeDoDiaDaSemana(iso)})` : formatarDataBr(iso);

  if (e.tipo === "INTERVALO") {
    // Pelas pontas, não pelo array inteiro: a CHECK `chk_cronograma_cardinalidade` garante
    // duas datas, mas ler as pontas continua certo se um dia ela afrouxar.
    const ordenadas = [...e.datas].sort();
    const inicio = escrever(ordenadas[0]);
    const fim = escrever(ordenadas[ordenadas.length - 1]);
    return inicio === fim ? inicio : `${inicio} a ${fim}`;
  }

  if (e.tipo === "ALTERNATIVAS" && e.datas.length > 1) {
    // A ordem é a que o autor gravou — ela é a ordem do documento, não uma ordenação.
    const escritas = e.datas.map(escrever);
    return `${escritas.slice(0, -1).join(", ")} ou ${escritas[escritas.length - 1]}`;
  }

  return escrever(e.datas[0]);
}

/**
 * As regras de coerência do cronograma.
 *
 * Etapa sem data é **erro** — é o defeito do Edital 004. Precedência quebrada é **erro**,
 * porque inverte a lógica do certame. Fim de semana é **aviso**: a prova acontece no
 * domingo de propósito, e travar faria quem redige contornar o sistema.
 */
export function conferirCronograma(etapas: readonly EtapaCronograma[]): AvisoCronograma[] {
  const avisos: AvisoCronograma[] = [];
  const por = (chave: string) => etapas.find((e) => e.chave === chave);

  // 🔴 A exceção do fim de semana é a DATA DA PROVA, não a etapa chamada "prova".
  // Medido no Edital 003: o gabarito é divulgado no MESMO domingo, logo depois do exame.
  // Minha primeira versão isentava só a chave `prova_objetiva` e acusava o gabarito — o
  // cronograma publicado foi o oráculo que pegou o erro.
  const diaDaProva = primeiraData(por("prova_objetiva") ?? { datas: [] } as EtapaCronograma);

  for (const e of etapas) {
    if (e.datas.length === 0) {
      avisos.push({
        severidade: "erro",
        chave: e.chave,
        regra: "etapa-sem-data",
        mensagem: `"${e.nome_evento}" está no cronograma e não tem data. Foi assim que "dia XX/xx/2026" chegou ao Diário Oficial no Edital 004/2026.`,
      });
      continue;
    }
    // ⚠️ Fim de semana é o caso NORMAL no dia da prova — medido: das 16 datas do Edital
    // 003, a única de fim de semana é o domingo do exame, e o gabarito sai no mesmo dia.
    // Avisar sobre elas seria ruído que ensina a ignorar o painel.
    for (const d of e.datas) {
      if (d !== diaDaProva && ehFimDeSemana(d)) {
        avisos.push({
          severidade: "aviso",
          chave: e.chave,
          regra: "etapa-em-fim-de-semana",
          mensagem: `"${e.nome_evento}" está marcada para ${d}, que cai em fim de semana.`,
        });
      }
    }
  }

  /**
   * 🔴 CADA REGRA DIZ QUAL PONTA COMPARAR, e isso não é preciosismo.
   *
   * Minha primeira versão comparava sempre `fim de A` com `início de B`. Contra o
   * cronograma real do Edital 003 ela acusou duas precedências que estão corretas: a
   * isenção termina em 08/07 e as inscrições COMEÇAM em 29/06 — mas a regra é que a
   * isenção termine antes do FIM das inscrições (27/07), não do começo. Comparar a ponta
   * errada inventa erro em edital válido, que é o jeito mais rápido de fazer alguém
   * ignorar o painel.
   */
  type Ponta = "inicio" | "fim";
  const pontaDe = (e: EtapaCronograma, p: Ponta) => (p === "inicio" ? primeiraData(e) : ultimaData(e));

  const precedencias: ReadonlyArray<{
    de: [string, Ponta]; para: [string, Ponta]; motivo: string;
  }> = [
    { de: ["entrega_isencao", "fim"], para: ["inscricoes", "fim"],
      motivo: "A entrega do formulário de isenção tem de terminar até o fim das inscrições." },
    { de: ["resultado_isencao", "fim"], para: ["inscricoes", "fim"],
      motivo: "O resultado da isenção sai até o fim das inscrições — quem foi indeferido ainda precisa pagar." },
    { de: ["inscricoes", "fim"], para: ["prova_objetiva", "inicio"],
      motivo: "As inscrições têm de encerrar antes da prova." },
    { de: ["prova_objetiva", "inicio"], para: ["divulgacao_gabarito", "inicio"],
      motivo: "O gabarito não sai antes da prova." },
    { de: ["divulgacao_gabarito", "inicio"], para: ["recurso_gabarito", "inicio"],
      motivo: "O recurso ao gabarito vem depois do gabarito." },
  ];

  for (const { de, para, motivo } of precedencias) {
    const [chaveA, pontaA] = de;
    const [chaveB, pontaB] = para;
    const a = por(chaveA);
    const b = por(chaveB);
    if (!a || !b) continue;
    const fimDeA = pontaDe(a, pontaA);
    const inicioDeB = pontaDe(b, pontaB);
    if (!fimDeA || !inicioDeB) continue;
    // ⚠️ `>` e não `>=`: no mesmo dia é válido, e o Edital 003 faz isso — prova e
    // gabarito ambos em 20/09/2026.
    if (fimDeA > inicioDeB) {
      avisos.push({
        severidade: "erro",
        chave: chaveB,
        regra: "precedencia-invertida",
        mensagem: `${motivo} Hoje "${a.nome_evento}" fica em ${fimDeA} e "${b.nome_evento}" em ${inicioDeB}.`,
      });
    }
  }

  return avisos;
}
