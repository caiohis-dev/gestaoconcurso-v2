/**
 * Normalização de texto para BUSCA.
 *
 * 🔴 Este mapa é METADE de um par. A outra metade é a função `colab_nome_busca` do banco
 * (migration `20260911011204_busca_de_colaborador_sem_acento.sql`), que tira o acento do
 * DADO com um `translate()` de mesmos pares. Aqui se tira o acento do que foi DIGITADO.
 *
 * ⚠️ Mexer num lado sem o outro quebra a busca EM SILÊNCIO: ela simplesmente para de
 * achar, sem erro nenhum — que é o formato de defeito que este repo mais teme. Há um
 * teste afirmando que os dois mapas são iguais; se ele cair, é isso que aconteceu.
 *
 * ⚠️ Por que um mapa explícito e NÃO `normalize('NFD')`: o NFD tira TODO diacrítico
 * combinante, inclusive os que o `translate()` do banco não conhece (`ā`, por exemplo).
 * Aí o termo viraria "a" enquanto o dado continuaria "ā", e a busca não acharia. Mapas
 * idênticos dos dois lados são simétricos por construção.
 */

/** Os acentuados. Mesma ordem e mesmo conteúdo do `translate()` da migration. */
export const ACENTUADOS = 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ';
/** Os equivalentes sem acento, posição a posição. */
export const SEM_ACENTO = 'aaaaaaeeeeiiiiooooouuuucnyy';

const MAPA = new Map<string, string>(
  [...ACENTUADOS].map((letra, i) => [letra, SEM_ACENTO[i]]),
);

/**
 * Minúsculas e sem acento — o formato em que a busca compara os dois lados.
 *
 * Espelha `lower()` + `translate()` da função `colab_nome_busca` do banco.
 */
export function removerAcentos(texto: string): string {
  return [...texto.toLowerCase()].map((ch) => MAPA.get(ch) ?? ch).join('');
}
