/**
 * Regras puras da edição de salas distribuídas — extraídas de `GerenciarSalasDistribuidas`
 * em 2026-08-03, pelo mesmo motivo que `lib/alocacao.ts` saiu de `GerenciarProva`: é a
 * parte que precisa de teste, e renderizar a página para conferir uma frase ou uma
 * conversão seria desproporcional. (Exportar função de dentro da página também custa um
 * aviso de `react-refresh/only-export-components`.)
 */

/**
 * 🔴 **O esquema de numeração: `sala_numero = andar × 100 + sequência`.**
 *
 * Não há `SEQUENCE` no banco — quem numera é o cliente, a partir das salas que já existem.
 * Daí o teto: **99 salas por andar**. A sala 100 seria a de sequência 0 do andar 1, e a 200
 * é a primeira do andar 2.
 *
 * ⚠️ Até 2026-08-03 o estouro não era checado: com 99 salas no andar 1, criar mais invadia
 * a faixa do andar 2 e colidia com o índice único. O 23505 chegava traduzido como
 * *"provavelmente outra pessoa criou salas ao mesmo tempo"* — mandando repetir uma ação
 * que nunca ia funcionar.
 */
export const SALAS_POR_ANDAR = 99;

/** O pedido do formulário de criação em lote: N salas em cada andar da faixa. */
export interface LoteDeSalas {
  quantidade: number;
  andarDe: number;
  andarAte: number;
}

/** Os números calculados para um andar. Dentro de um andar são sempre contíguos. */
export interface AndarDoLote {
  andar: number;
  numeros: number[];
}

/**
 * ⚠️ **Não é união discriminada de propósito.** `{ ok: true } | { ok: false; erro }` seria
 * a forma natural, mas este projeto compila com `strict: false` — sem `strictNullChecks`,
 * o TS não estreita pelo discriminante booleano e `resultado.erro` vira erro de compilação
 * em todo consumidor. Aqui `erro` é `null` no caminho feliz, e `andares` fica vazio no
 * caminho recusado.
 */
export interface ResultadoDoLote {
  andares: AndarDoLote[];
  total: number;
  erro: string | null;
}

/** Recusa: nenhum andar sai, e o motivo vai nomeado. */
function loteRecusado(erro: string): ResultadoDoLote {
  return { andares: [], total: 0, erro };
}

/**
 * Os números que a criação em lote vai gravar — **função pura**, para que a regra de
 * numeração tenha teste sem mock (a lição de `lib/candidatos-import.ts`: a parte difícil
 * sai do componente e da mutation).
 *
 * A sequência de cada andar continua do **maior número daquele andar**, não da contagem:
 * sala excluída deixa buraco, e o buraco não é reaproveitado — número repetido confundiria
 * lista já impressa.
 *
 * 🔵 **A faixa `de..até` é de 2026-08-03.** Antes o formulário pedia UM andar e o lote saía
 * todo nele; hoje `quantidade` é por andar e o total é `quantidade × (até − de + 1)`.
 *
 * ⚠️ **Recusa o lote inteiro** quando um andar da faixa não comporta — em vez de gravar os
 * andares que couberam e falhar no meio. Mesma decisão da RPC `salvar_salas_distribuidas`.
 */
export function numerosDoLote(
  lote: LoteDeSalas,
  numerosExistentes: number[],
): ResultadoDoLote {
  const { quantidade, andarDe, andarAte } = lote;

  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return loteRecusado("A quantidade de salas por andar precisa ser 1 ou mais.");
  }
  if (!Number.isInteger(andarDe) || !Number.isInteger(andarAte) || andarDe < 1) {
    return loteRecusado("Os andares precisam ser números inteiros a partir de 1.");
  }
  if (andarAte < andarDe) {
    return loteRecusado("O andar final não pode ser menor que o inicial.");
  }

  const andares: AndarDoLote[] = [];

  for (let andar = andarDe; andar <= andarAte; andar++) {
    const base = andar * 100;
    const sequenciasUsadas = numerosExistentes
      .filter((numero) => numero >= base && numero < base + 100)
      .map((numero) => numero % 100);
    const maiorSequencia = sequenciasUsadas.length ? Math.max(...sequenciasUsadas) : 0;

    if (maiorSequencia + quantidade > SALAS_POR_ANDAR) {
      const cabem = SALAS_POR_ANDAR - maiorSequencia;
      // Nomeia o andar e diz quantas cabem: "não deu" sem o número manda a pessoa
      // adivinhar de quanto reduzir o lote.
      return loteRecusado(
        `O andar ${andar} comporta ${SALAS_POR_ANDAR} salas e já vai até a de nº ` +
          `${base + maiorSequencia}: cabem mais ${cabem}, não ${quantidade}.`,
      );
    }

    andares.push({
      andar,
      numeros: Array.from({ length: quantidade }, (_, i) => base + maiorSequencia + 1 + i),
    });
  }

  return { andares, total: andares.length * quantidade, erro: null };
}

/**
 * A prévia que o formulário mostra antes de criar: `"101–110, 201–210"`.
 *
 * Existe porque o lote passou a criar em vários andares — sem ela, "30 salas" não diz
 * quais, e o esquema `andar × 100 + sequência` não é adivinhável por quem só usa a tela.
 */
export function resumoDoLote(andares: AndarDoLote[]): string {
  return andares
    .map(({ numeros }) => {
      const primeiro = numeros[0];
      const ultimo = numeros[numeros.length - 1];
      return primeiro === ultimo ? `${primeiro}` : `${primeiro}–${ultimo}`;
    })
    .join(", ");
}

/** O que a tela precisa saber de uma linha para validar o salvamento. */
export interface SalaEditavel {
  sala_numero: number | null;
  sala_capacidade: number | null;
}

/**
 * Lê o que foi digitado num campo numérico. Três respostas, e a diferença entre elas é o
 * ponto do conserto:
 *
 *   `null`      → campo vazio: estado válido de digitação, ENTRA no estado;
 *   `undefined` → tecla que não vira número (letra, sinal negativo): ignorada;
 *   número      → o valor.
 *
 * ⚠️ Negativo é RECUSADO, não saturado em zero — é a mesma decisão do
 * `ValoresFuncaoProvaDialog`: transformar -150 em 150 adivinha a intenção, e em 0 seria
 * pior, porque 0 é capacidade válida.
 */
export function numeroDigitado(value: string): number | null | undefined {
  if (value.trim() === "") return null;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

/**
 * A recusa de salvar com campo obrigatório em branco. Pura de propósito — é a frase que
 * precisa de teste, e renderizar a página para conferi-la seria desproporcional (mesma
 * decisão de `avisoFiscalDeSala` e `mensagemErroSalvarSalas`).
 *
 * Devolve `null` quando está tudo preenchido.
 */
export function mensagemCamposObrigatorios(salas: SalaEditavel[]): string | null {
  const semNumero = salas.filter((s) => s.sala_numero === null).length;
  const semCapacidade = salas.filter((s) => s.sala_capacidade === null).length;

  if (!semNumero && !semCapacidade) return null;

  const partes: string[] = [];
  if (semNumero) {
    partes.push(`${semNumero} sem número`);
  }
  if (semCapacidade) {
    partes.push(`${semCapacidade} sem capacidade`);
  }

  // Nomeia o que fazer, não só o que está errado: o número é como a sala é chamada em
  // campo, e a capacidade alimenta a conta de alocação.
  return `Há sala ${partes.join(" e ")}. Preencha antes de salvar — o número identifica a sala em campo e a capacidade entra na conta de alocação.`;
}
