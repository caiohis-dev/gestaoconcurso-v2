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

/**
 * A célula "Vagas" de uma linha da tabela de `/unidades-prova`.
 *
 * Mesma fonte e mesmos três estados de `rotuloUnidadeDisponivel` — muda só a forma, que
 * ali é rótulo de um seletor e aqui é célula de tabela. O estado do meio continua sendo o
 * que exige cuidado: `null` (contando, ou a consulta falhou) **não pode** sair como `0`,
 * senão a tabela afirma que a unidade está vazia quando não deu para perguntar.
 *
 * ⚠️ "Vagas" aqui é a capacidade do CADASTRO, não vaga livre: `/unidades-prova` é o
 * catálogo e não tem prova no contexto — ocupação só existe dentro de uma prova, no
 * snapshot `salas_prova_distribuidas`.
 */
export function textoVagasDaUnidade(capacidade: number | null): string {
  if (capacidade === null) return "—";
  if (capacidade <= 0) return "sem salas cadastradas";

  return capacidade.toLocaleString("pt-BR");
}

/** O que o totalizador do topo de `/unidades-prova` precisa saber. */
export interface ResumoDeVagas {
  /** Soma das capacidades cadastradas das unidades listadas. */
  total: number;
  /** Quantas daquelas unidades têm ao menos uma sala cadastrada. */
  comSalas: number;
  /** Quantas unidades entraram na conta. */
  unidades: number;
}

/**
 * Soma as vagas das unidades EXIBIDAS, não da tabela `sala_prova` inteira — é o que faz o
 * totalizador do topo bater com a coluna abaixo dele. Somar o mapa inteiro daria o mesmo
 * número hoje (toda sala pertence a uma unidade do catálogo), mas passaria a divergir no
 * dia em que a lista ganhar filtro: é o defeito do "limpar edital", que exibia contagem
 * filtrada ao lado de uma ação sobre o conjunto inteiro.
 *
 * ⚠️ Chame só quando as capacidades tiverem CHEGADO. Com o mapa vazio (carregando ou
 * falha) o resultado é um `0` legítimo em forma, e mentiroso em conteúdo — quem decide
 * exibir é a página, olhando `isLoading`/`error` do hook.
 */
export function resumoDeVagas(
  unidadeIds: string[],
  capacidades: Record<string, number>,
): ResumoDeVagas {
  let total = 0;
  let comSalas = 0;

  for (const id of unidadeIds) {
    const capacidade = capacidades[id] ?? 0;
    total += capacidade;
    if (capacidade > 0) comSalas += 1;
  }

  return { total, comSalas, unidades: unidadeIds.length };
}
