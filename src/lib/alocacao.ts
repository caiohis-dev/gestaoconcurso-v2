/**
 * A conta do painel de alocação — isolada aqui porque a FONTE do "total de candidatos"
 * mudou em 2026-08-02 e é exatamente o tipo de semântica que regride calada.
 *
 * Antes: `provas.prova_n_candidatos`, um número digitado à mão. Media-se 200 numa prova
 * cujo edital tinha 7.231 inscritos — o painel dizia "coberto" faltando 7.031 lugares,
 * sem erro nenhum na tela.
 *
 * Agora: a contagem real de `candidatos` do edital da prova. Isso cria estados que o
 * número digitado não tinha — ninguém importou a lista ainda, ou a prova nem tem edital —
 * e **nenhum deles pode virar zero na tela**: zero é uma afirmação ("não há inscrito"),
 * e afirmá-la enquanto se carrega é o defeito que este repo mais repete.
 */

export interface EntradaResumoAlocacao {
  /** O edital da prova. `null` existe: `provas.edital_id` ainda é NULLABLE no banco. */
  editalId: string | null | undefined;
  /** Inscritos do edital. `undefined` = a RPC não trouxe linha para ele. */
  inscritos: number | undefined;
  /** Soma das capacidades das salas das unidades já ligadas à prova. */
  alocados: number;
  carregando: boolean;
}

export type ResumoAlocacao =
  | { estado: "carregando" }
  | { estado: "sem-edital" }
  | { estado: "sem-lista" }
  | { estado: "ok"; inscritos: number; alocados: number; naoAlocados: number };

export function resumoAlocacao({
  editalId,
  inscritos,
  alocados,
  carregando,
}: EntradaResumoAlocacao): ResumoAlocacao {
  if (carregando) return { estado: "carregando" };
  if (!editalId) return { estado: "sem-edital" };

  // `undefined` (edital ausente do mapa) e `0` são indistinguíveis por dado: a importação
  // é troca total, então edital sem linha nenhuma é edital sem lista. Os dois viram a
  // mesma mensagem — que é a verdadeira nos dois casos — em vez de um "0" que parece conta.
  if (!inscritos) return { estado: "sem-lista" };

  return {
    estado: "ok",
    inscritos,
    alocados,
    // Pode ser NEGATIVO, e isso é bom: significa que há mais lugares do que inscritos.
    // Só `> 0` é falta de lugar, e é só isso que a tela pinta de vermelho.
    naoAlocados: inscritos - alocados,
  };
}
