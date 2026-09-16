/**
 * Ações afirmativas e condições especiais — PCD, cotas raciais e lactantes.
 *
 * 🔴 **A data de corte da lactante é DERIVADA, nunca digitada.** Isso saiu de um defeito
 * real, medido no Edital 003/2026 publicado:
 *
 * | onde | o que diz |
 * |---|---|
 * | Cronograma | Prova Objetiva — **20/09/2026** |
 * | Item 10.10 | *"na data de realização da prova **(16 de setembro de 2026)**"*, com corte em 16 de março |
 *
 * 16/09 é a data do **comprovante de local de prova**, não da prova. A data foi derivada
 * à mão e ficou para trás quando a prova mudou.
 *
 * 🔴 A consequência é concreta: com a prova em 20/09, o corte correto é **20 de março**.
 * Uma candidata cujo bebê nasceu em 18/03 seria recusada por engano — e isso se discute
 * em juízo.
 *
 * Mesmo princípio da numeração de capítulo: **o que é derivado não se persiste**, senão
 * envelhece em silêncio.
 */

export interface RegrasLactantes {
  idadeMaximaMeses: number | null;
  permiteCompensacao: boolean | null;
  tempoMaximoMinutos: number | null;
}

export interface RegrasPcd {
  percentualReserva: number | null;
  aceitaLaudoIndeterminado: boolean | null;
  validadeMesesLaudoTemporario: number | null;
}

/**
 * Subtrai meses de uma data ISO, sem `Date` — pelo mesmo motivo do cronograma: o
 * construtor interpreta `YYYY-MM-DD` como UTC e devolve o dia anterior em fuso negativo.
 *
 * ⚠️ Quando o dia não existe no mês de destino (31 de março menos 1 mês), cai no ÚLTIMO
 * dia do mês. É a convenção que não estende o prazo: 28/02 em vez de 03/03.
 */
export function subtrairMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const total = (a * 12 + (m - 1)) - meses;
  const anoNovo = Math.floor(total / 12);
  const mesNovo = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(anoNovo, mesNovo, 0)).getUTCDate();
  const diaNovo = Math.min(d, ultimoDia);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${anoNovo}-${p(mesNovo)}-${p(diaNovo)}`;
}

/**
 * A data a partir da qual o lactente pode ter nascido, derivada da data da prova.
 * Devolve `null` quando falta a data da prova ou a idade máxima — e aí é o linter que
 * cobra, não uma data inventada.
 */
export function dataLimiteNascimentoLactente(
  dataDaProva: string | null,
  idadeMaximaMeses: number | null,
): string | null {
  if (!dataDaProva || !idadeMaximaMeses || idadeMaximaMeses <= 0) return null;
  return subtrairMeses(dataDaProva, idadeMaximaMeses);
}

export interface AvisoAcaoAfirmativa {
  severidade: "erro" | "aviso";
  regra: string;
  mensagem: string;
}

/**
 * Confere as regras de ação afirmativa.
 *
 * ⚠️ Os presets recomendados (compensação de 30 min; laudo indeterminado pelas Leis RJ)
 * geram **aviso**, nunca erro. O Edital 002 é legal e não tem compensação — barrar seria
 * impedir um edital válido, e o sistema precisa reproduzir os três.
 */
export function conferirAcoesAfirmativas(entrada: {
  dataDaProva: string | null;
  lactantes?: RegrasLactantes | null;
  pcd?: RegrasPcd | null;
  percentualCotasRaciais?: number | null;
}): AvisoAcaoAfirmativa[] {
  const avisos: AvisoAcaoAfirmativa[] = [];
  const { dataDaProva, lactantes, pcd } = entrada;

  if (lactantes?.idadeMaximaMeses && !dataDaProva) {
    avisos.push({
      severidade: "erro",
      regra: "corte-lactante-sem-data-da-prova",
      mensagem:
        "A regra da lactante depende da data da prova, e o cronograma não a tem. Sem ela o edital publicaria um corte inventado — foi assim que o Edital 003/2026 saiu com 16 de setembro no item 10.10 e 20 de setembro no cronograma.",
    });
  }

  if (lactantes?.permiteCompensacao === false) {
    avisos.push({
      severidade: "aviso",
      regra: "lactante-sem-compensacao",
      mensagem:
        "Este edital não compensa o tempo de amamentação (regra do Edital 002/2026). Os Editais 003 e 004 asseguram até 30 minutos, e a redação sem compensação é mais vulnerável a questionamento judicial.",
    });
  }

  if (pcd && pcd.aceitaLaudoIndeterminado === false) {
    avisos.push({
      severidade: "aviso",
      regra: "laudo-sem-validade-indeterminada",
      mensagem:
        "O laudo de PCD exige validade de prazo fixo para todos os casos. As Leis Estaduais RJ 9.425/2021 e 10.186/2023 aceitam validade indeterminada para deficiência irreversível, TEA e Síndrome de Down — é a regra do Edital 004/2026.",
    });
  }

  return avisos;
}
