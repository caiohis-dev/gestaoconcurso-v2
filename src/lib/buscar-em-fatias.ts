/**
 * Busca TODAS as linhas de uma consulta, em fatias — para exports e documentos.
 *
 * 🔴 POR QUE ISTO EXISTE: o PostgREST corta a resposta em `max_rows` (1000 por padrão)
 * **sem erro nenhum**. Uma consulta sem `.range()` que ultrapasse esse teto devolve 1000
 * linhas e o código segue como se fossem todas. Num export, o resultado é um **documento
 * oficial incompleto** que ninguém percebe — o formato de perda silenciosa que este repo
 * mais teme.
 *
 * Generaliza o laço que `useCandidatos.buscarRelatorioCompleto` já usava para o relatório
 * de importação; a mecânica e o motivo são os mesmos.
 *
 * ⚠️ **A CONSULTA PRECISA TER ORDEM ESTÁVEL.** Sem `ORDER BY` determinístico o banco pode
 * devolver as linhas em ordem diferente entre uma fatia e outra, e o laço **repete uma
 * linha e pula outra** — de novo, calado. Ordene por uma coluna única (`id` serve sempre),
 * ou por qualquer critério com `id` como desempate. Se a ordem do ARQUIVO precisa ser
 * outra, ordene o array montado depois: aí você tem todas as linhas em mãos.
 *
 * @example
 * const linhas = await buscarEmFatias((de, ate) =>
 *   supabase.from('colaboradores_prova').select('*')
 *     .eq('prova_unidades.prova_id', provaId)
 *     .order('id', { ascending: true })
 *     .range(de, ate),
 * );
 */
export const TAMANHO_FATIA = 1000;

interface RespostaFatia<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function buscarEmFatias<T>(
  buscarFatia: (inicio: number, fim: number) => PromiseLike<RespostaFatia<T>>,
): Promise<T[]> {
  const todas: T[] = [];

  for (let inicio = 0; ; inicio += TAMANHO_FATIA) {
    const { data, error } = await buscarFatia(inicio, inicio + TAMANHO_FATIA - 1);
    if (error) throw error;

    const fatia = data ?? [];
    todas.push(...fatia);

    // Fatia menor que o pedido = acabou. ⚠️ Não dá para confiar num `count` obtido antes
    // do laço: entre uma fatia e outra o conjunto pode mudar (alguém alocando alguém), e
    // o laço rodaria para sempre esperando um total que já não existe.
    if (fatia.length < TAMANHO_FATIA) break;
  }

  return todas;
}
