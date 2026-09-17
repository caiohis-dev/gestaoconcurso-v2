/**
 * Critérios de desempate e resultado final — capítulo [15].
 *
 * 🔴 **O sistema DESCREVE o critério. Quem desempata é a correção da prova, que é outro
 * módulo e não existe.** Desempate é a parte do edital que mais vira processo judicial, e
 * nada aqui compara candidatos — não deixe o texto sugerir que compara.
 *
 * As três ordens publicadas, medidas:
 *
 * | | 002 (Docente I e II) | 003 (Enf. e Téc.) | 004 (ACS e ACE) |
 * |---|---|---|---|
 * | 1º | Conh. Específicos | Conh. Específicos | Conh. Específicos |
 * | 2º | Conh. Pedagógicos | Legislação do SUS | Língua Portuguesa |
 * | 3º | Língua Portuguesa | Língua Portuguesa | Matemática |
 * | 4º | **Prova de Títulos** | Maior Idade | Maior Idade |
 * | 5º | Maior Idade | — | — |
 *
 * E antes da lista, os três têm as mesmas duas preferências legais: idade ≥ 60 (Estatuto
 * do Idoso) e exercício da função de jurado (CPP art. 440). Depois, uma lista separada
 * só para PCD, idêntica nos três.
 *
 * ⚠️ **A hora de nascimento não é modelada, e é decisão.** Os três têm a mesma regra de
 * último recurso — quem não apresentar a certidão "terá considerada como hora de
 * nascimento, 23 horas 59 minutos e 59 segundos". O dado o sistema não tem, e o parâmetro
 * é idêntico nos três. Fica como artigo do capítulo, escrito à mão.
 */

export type ListaDeDesempate = "GERAL" | "PCD";

/** Os tipos de cada lista. ⚠️ O banco também os separa, em `chk_desempate_tipo_da_lista`. */
export const TIPOS_DE_CRITERIO: ReadonlyArray<{
  tipo: string;
  lista: ListaDeDesempate;
  rotulo: string;
  exigeDisciplina?: true;
}> = [
  { tipo: "IDADE_60_MAIS", lista: "GERAL", rotulo: "Idade igual ou superior a 60 anos (Estatuto do Idoso)" },
  { tipo: "FUNCAO_JURADO", lista: "GERAL", rotulo: "Exercício da função de jurado (CPP, art. 440)" },
  { tipo: "PONTUACAO_DISCIPLINA", lista: "GERAL", rotulo: "Maior pontuação na disciplina", exigeDisciplina: true },
  { tipo: "MAIOR_PONTOS_TITULOS", lista: "GERAL", rotulo: "Maior pontuação na prova de títulos" },
  { tipo: "MAIOR_IDADE", lista: "GERAL", rotulo: "Maior idade — data de nascimento" },
  { tipo: "ARRIMO_FAMILIA", lista: "PCD", rotulo: "Ser arrimo de família" },
  { tipo: "MAIS_DEPENDENTES_ATE_21", lista: "PCD", rotulo: "Maior número de dependentes até 21 anos" },
  { tipo: "SEM_FONTE_DE_RENDA", lista: "PCD", rotulo: "Não ter nenhuma fonte de renda" },
];

export const rotuloDoCriterio = (tipo: string) =>
  TIPOS_DE_CRITERIO.find((t) => t.tipo === tipo)?.rotulo ?? tipo;

export interface Criterio {
  id: string;
  lista: ListaDeDesempate;
  ordem_prioridade: number;
  criterio_tipo: string;
  disciplina_referencia: string | null;
  cargo_id: string | null;
  aplica_a_todos_os_cargos: boolean;
}

export interface AvisoDesempate {
  severidade: "erro" | "aviso";
  regra: string;
  mensagem: string;
}

/**
 * Compara nomes de disciplina ignorando acento, caixa e espaço.
 *
 * ⚠️ Mesma normalização de `chaveDeDisciplina` na fatia 10, e pela mesma razão: aqui é
 * BUSCA (achar o par na matriz), não identidade. `Legislação` × `LEGISLACAO` é a
 * divergência mais comum entre corpo e anexo de um PDF, e acusá-la seria falso positivo.
 */
export const chaveDeDisciplina = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function conferirDesempate(entrada: {
  criterios: readonly Criterio[];
  /** Os nomes que existem na matriz da prova (fatia 5), de qualquer cargo do edital. */
  disciplinasDaProva: readonly string[];
  /** Se o edital tem prova de títulos ligada (fatia 6). */
  temProvaDeTitulos: boolean;
}): AvisoDesempate[] {
  const { criterios, disciplinasDaProva, temProvaDeTitulos } = entrada;
  const avisos: AvisoDesempate[] = [];
  if (criterios.length === 0) return avisos;

  const geral = criterios.filter((c) => c.lista === "GERAL");

  // ── 🔴 ordem com BURACO ───────────────────────────────────────────────────
  // O banco garante que não há duas na mesma posição; não garante que a sequência é
  // contínua. Uma lista 1º, 2º, 4º sai publicada com um degrau, e quem lê supõe que
  // faltou um critério — ou pior, que ele existe e foi omitido.
  for (const lista of ["GERAL", "PCD"] as const) {
    const posicoes = criterios.filter((c) => c.lista === lista)
      .map((c) => c.ordem_prioridade).sort((a, b) => a - b);
    if (posicoes.length === 0) continue;
    const esperado = posicoes.map((_, i) => i + 1);
    if (posicoes.join(",") !== esperado.join(",")) {
      avisos.push({
        severidade: "erro",
        regra: "ordem-com-buraco",
        mensagem: `A lista ${lista === "PCD" ? "de PCD" : "geral"} está numerada ${posicoes.join("º, ")}º, e deveria ser ${esperado.join("º, ")}º. Um degrau na ordem publicada faz quem lê supor que um critério foi omitido.`,
      });
    }
  }

  // ── disciplina do critério que a matriz não conhece ───────────────────────
  // 🔴 Mesma classe do "LESGISLAÇÃO DO SUS" da fatia 10, e aqui é pior: um critério de
  // desempate que aponta para disciplina inexistente é inaplicável, e desempate é o que
  // mais vira processo.
  const naProva = new Set(disciplinasDaProva.map(chaveDeDisciplina));
  for (const c of criterios) {
    if (!c.disciplina_referencia || naProva.size === 0) continue;
    if (!naProva.has(chaveDeDisciplina(c.disciplina_referencia))) {
      avisos.push({
        severidade: "erro",
        regra: "disciplina-fora-da-matriz",
        mensagem: `O ${c.ordem_prioridade}º critério desempata por "${c.disciplina_referencia}", que não está na matriz da prova. O critério é inaplicável como publicado.`,
      });
    }
  }

  // ── títulos no desempate sem prova de títulos no edital ───────────────────
  // Só o Edital 002 tem os dois. Um sem o outro é o capítulo contradizendo outro.
  const usaTitulos = geral.some((c) => c.criterio_tipo === "MAIOR_PONTOS_TITULOS");
  if (usaTitulos && !temProvaDeTitulos) {
    avisos.push({
      severidade: "erro",
      regra: "titulos-no-desempate-sem-prova-de-titulos",
      mensagem: `Um critério desempata pela pontuação de títulos, e este edital não tem prova de títulos. O desempate aponta para uma nota que ninguém vai receber.`,
    });
  }

  // ── a lista geral sem um critério final que sempre resolve ────────────────
  // ⚠️ AVISO, não erro: o edital pode publicar assim. Mas os três terminam em "Maior
  // Idade" justamente porque é o único que nunca empata — e quem o esquece publica uma
  // ordem que pode não decidir.
  if (geral.length > 0) {
    const ultimo = [...geral].sort((a, b) => a.ordem_prioridade - b.ordem_prioridade).at(-1)!;
    if (ultimo.criterio_tipo !== "MAIOR_IDADE") {
      avisos.push({
        severidade: "aviso",
        regra: "sem-criterio-final",
        mensagem: `A lista geral termina em "${rotuloDoCriterio(ultimo.criterio_tipo)}". Nos três editais medidos o último é sempre a maior idade, que é o único critério que não empata — sem ele, a ordem pode não decidir.`,
      });
    }
  }

  return avisos;
}
