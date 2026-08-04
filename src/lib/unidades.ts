/**
 * Rótulo de uma unidade no seletor de "adicionar unidade" de `/gerenciar-prova`.
 *
 * 🔴 **A capacidade vem do CADASTRO da unidade (`sala_prova`), não do snapshot da prova.**
 * A unidade listada ali ainda NÃO está vinculada — não existe uma linha sequer dela em
 * `salas_prova_distribuidas`, então ler o snapshot mostraria zero para todo mundo. É a
 * confusão template-vs-snapshot que `provas-e-unidades.md` chama de "o erro mais fácil
 * deste módulo", e aqui ela seria silenciosa: um número plausível e sempre errado.
 *
 * ⚠️ **Os três estados são distintos de propósito**, e o do meio é o que exige cuidado:
 *
 * | `capacidade` | significa | sai como |
 * |---|---|---|
 * | `null` | ainda estou contando | só a identificação, sem afirmar número |
 * | `0` | a unidade não tem sala cadastrada | `(sem salas cadastradas)` |
 * | `> 0` | a soma das salas do cadastro | `(capacidade: 350)` |
 *
 * Um `(capacidade: 0)` enquanto a consulta corre seria "vazio enquanto carrega", o padrão
 * de defeito que mais se repetiu neste repo. E, medido em 2026-08-03, **7 das 11 unidades
 * do banco não têm nenhuma sala cadastrada** — nelas o zero é o caso comum, não a borda:
 * dizer *por que* está zerado poupa a viagem a `/salas-prova` para descobrir.
 *
 * ⚠️ Soma zero **é** ausência de salas: a CHECK `chk_sala_capacidade_positiva` não deixa
 * existir sala com capacidade 0. Se essa constraint cair, este texto passa a mentir.
 */
export function rotuloUnidadeDisponivel(
  sigla: string,
  nome: string,
  capacidade: number | null,
): string {
  // `unid_sigla` é CHAR(10): o Postgres devolve preenchido com espaços à direita.
  const identificacao = `${sigla.trim()} - ${nome}`;

  if (capacidade === null) return identificacao;
  if (capacidade <= 0) return `${identificacao} (sem salas cadastradas)`;

  return `${identificacao} (capacidade: ${capacidade})`;
}
