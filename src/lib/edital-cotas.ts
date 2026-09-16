/**
 * O cálculo das cotas do Quadro I — reserva de PCD e de cotas raciais.
 *
 * 🔴 **A regra NÃO foi estimada: foi medida.** Contei as vagas declaradas nos Editais
 * 002/2026 e 003/2026 — 11 cargos, 22 valores — e a regra saiu do dado. Todos os 22
 * batem, e cada grupo descarta uma hipótese concorrente:
 *
 * | cargo | AC | PD | CN | total | 10% | 20% |
 * |---|---|---|---|---|---|---|
 * | 002 Arte            |   1 |  0 |  0 |   1 |  0,10 → 0 |  0,20 → 0 |
 * | 002 Ed. Física      |   5 |  1 |  2 |   8 |  0,80 → 1 |  1,60 → 2 |
 * | 002 Geografia       |   3 |  0 |  1 |   4 |  0,40 → 0 |  0,80 → 1 |
 * | 002 Matemática      |  12 |  2 |  3 |  17 |  1,70 → 2 |  3,40 → 3 |
 * | 002 Docente II      |   3 |  1 |  1 |   5 |  0,50 → 1 |  1,00 → 1 |
 * | 003 Téc. Enfermagem | 108 | 16 | 31 | 155 | 15,50 → 16 | 31,00 → 31 |
 *
 * · **Não é teto (`ceil`)**: Arte tem 1 vaga, 10% = 0,1, e o edital declara ZERO.
 * · **Não é piso (`floor`)**: Ed. Física tem 8, 10% = 0,8, e o edital declara 1.
 * · **É "meio para CIMA", não "meio para o par"**: Docente II tem 0,5 → 1 e Téc.
 *   Enfermagem tem 15,5 → 16. O padrão do IEEE (`round half to even`) daria 0 no primeiro.
 * · **A base é o TOTAL, não o AC**: Matemática declara PD=2, que é 10% de 17 e não de 12;
 *   Téc. Enfermagem declara 16, que é 10% de 155 e não de 108 (daria 11).
 *
 * ⚠️ **Isto é a prática da FEVRE medida, não o texto da lei.** Os casos de
 * `total × 0,1 < 0,5` viraram zero — ou seja, cargo pequeno não reserva vaga nenhuma. Se
 * uma norma exigir piso de 1, é aqui que muda, e o teste com os 22 valores reais pega a
 * diferença na hora.
 *
 * ⚠️ O Edital 004 ficou fora da amostra: as vagas dele são por UBSF (Quadro II), outra
 * estrutura — assunto da fatia 7.
 */

/**
 * 🔵 Os percentuais são PADRÃO, não constante da regra (2026-09-16).
 *
 * Até esta data `sugerirCotas` usava 10% e 20% fixos, e o `percentual_reserva` declarado
 * nos capítulos [8] e [9] era gravado, exibido e **nunca lido pelo cálculo**. O usuário
 * podia declarar 15% no capítulo Das Vagas e o Quadro I continuava sugerindo 10% — o
 * edital sairia dizendo uma coisa no texto e outra na tabela. Divergência silenciosa
 * dentro do mesmo documento, que é a classe de defeito deste módulo.
 *
 * Agora os capítulos MANDAM no cálculo, e estes valores só servem quando o edital ainda
 * não declarou nada.
 */
export const PERCENTUAL_PCD_PADRAO = 0.1;
export const PERCENTUAL_NEGROS_PADRAO = 0.2;

/**
 * Arredondamento COMUM: meio para cima. Em JS, para número positivo, é `Math.round`.
 *
 * 🔵 **A primeira versão disto era mais elaborada** — escalava por 1e6 antes, com o
 * argumento de que o produto em ponto flutuante poderia cair um ulp abaixo do meio. A
 * falsificação derrubou o argumento: trocar por `Math.round` cru **não fez cair nenhum**
 * dos 26 testes, enquanto `ceil` e `floor` derrubaram 10 cada. Medido em seguida, para
 * não trocar uma suposição por outra: **zero divergências entre as duas versões em
 * 200.000 totais**, nos dois percentuais.
 *
 * Ficou o simples. Manter a versão elaborada seria carregar complexidade sustentada por
 * um perigo que não se demonstra — e um comentário afirmando esse perigo envelheceria
 * como verdade.
 *
 * ⚠️ O que continua valendo: `Math.round` é meio-para-CIMA, e é isso que os editais
 * fazem. Não trocar por uma função de "arredondamento bancário" (meio para o par), que
 * daria 0 onde o Edital 002 declara 1 (Docente II, 10% de 5 = 0,5).
 */
function meioParaCima(x: number): number {
  return Math.round(x);
}

export interface Cotas {
  total: number;
  amplaConcorrencia: number;
  pcd: number;
  negros: number;
}

/**
 * Sugere a divisão de vagas a partir do TOTAL.
 *
 * 🔴 A entrada é o total, não a ampla concorrência — foi o que a medição mostrou, e
 * inverter isso dá números errados em cargo grande (no Téc. Enfermagem daria 11 em vez
 * de 16). Na tela, quem preenche digita o total.
 *
 * ⚠️ É SUGESTÃO. O usuário pode sobrescrever qualquer uma das três; quem confere a
 * coerência depois é `conferirCotas`.
 */
export interface PercentuaisDeclarados {
  /** Em pontos percentuais, como o edital declara: `10`, não `0.1`. */
  pcd?: number | null;
  negros?: number | null;
}

export function sugerirCotas(total: number, declarados?: PercentuaisDeclarados): Cotas {
  if (!Number.isFinite(total) || total <= 0) {
    return { total: Math.max(0, Math.trunc(total) || 0), amplaConcorrencia: 0, pcd: 0, negros: 0 };
  }
  const t = Math.trunc(total);
  // ⚠️ `??` e não `||`: percentual 0 é declaração legítima ("este edital não reserva"),
  // e o `||` a trocaria pelo padrão de 10%.
  const fracPcd = (declarados?.pcd ?? PERCENTUAL_PCD_PADRAO * 100) / 100;
  const fracNegros = (declarados?.negros ?? PERCENTUAL_NEGROS_PADRAO * 100) / 100;
  const pcd = meioParaCima(t * fracPcd);
  const negros = meioParaCima(t * fracNegros);
  return { total: t, amplaConcorrencia: t - pcd - negros, pcd, negros };
}

export type AvisoDeCota =
  | { tipo: "soma-nao-fecha"; mensagem: string }
  | { tipo: "abaixo-do-minimo"; reserva: "pcd" | "negros"; sugerido: number; mensagem: string };

/**
 * Confere uma divisão que o usuário editou à mão.
 *
 * A soma que não fecha é **erro** — o banco também recusa (`chk_edital_cargo_vagas_somam`),
 * e um Quadro I cujo total não é a soma das partes é errata garantida.
 *
 * Reserva abaixo do sugerido é **aviso**, não barreira: o percentual é mínimo legal, mas
 * quem redige pode ter motivo (e a lei tem exceções que este sistema não conhece). Barrar
 * aqui faria a pessoa contornar o sistema, que é pior do que avisar.
 */
export function conferirCotas(c: Cotas, declarados?: PercentuaisDeclarados): AvisoDeCota[] {
  const avisos: AvisoDeCota[] = [];
  const soma = c.amplaConcorrencia + c.pcd + c.negros;
  if (soma !== c.total) {
    avisos.push({
      tipo: "soma-nao-fecha",
      mensagem: `As vagas somam ${soma}, e o total declarado é ${c.total}. O Quadro I não pode publicar um total que não é a soma das partes.`,
    });
  }

  // 🔴 Confere contra o percentual DECLARADO no capítulo Das Vagas, não contra 10/20
  // fixos. Sem isso, um edital que declara 15% teria o Quadro I avisando com base em 10%
  // — o painel mentiria sobre a própria regra do documento.
  const sugerido = sugerirCotas(c.total, declarados);
  if (c.pcd < sugerido.pcd) {
    avisos.push({
      tipo: "abaixo-do-minimo",
      reserva: "pcd",
      sugerido: sugerido.pcd,
      mensagem: `A reserva de PCD está em ${c.pcd}; 10% de ${c.total} vagas dá ${sugerido.pcd}.`,
    });
  }
  if (c.negros < sugerido.negros) {
    avisos.push({
      tipo: "abaixo-do-minimo",
      reserva: "negros",
      sugerido: sugerido.negros,
      mensagem: `A reserva de cotas raciais está em ${c.negros}; 20% de ${c.total} vagas dá ${sugerido.negros}.`,
    });
  }
  return avisos;
}
