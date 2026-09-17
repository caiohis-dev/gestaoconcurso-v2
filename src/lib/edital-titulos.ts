/**
 * A prova de títulos — os Quadros III e IV, o teto e o prazo de conclusão.
 *
 * 🔴 **A soma dos pontos TEM de fechar com o teto declarado.** É a mesma natureza da soma
 * de questões da fatia 5, e pela mesma razão não é CHECK no banco: agregação de outra
 * tabela não cabe numa CHECK, e um trigger recusaria a digitação no meio do caminho —
 * quem monta o quadro preenche um título por vez, e 5 pontos num teto de 12 é estado
 * intermediário legítimo. Grava-se sempre; quem acusa é este módulo.
 *
 * ⚠️ **Só o Edital 002/2026 tem esta etapa entre os três de referência**, e os dois
 * quadros dele são o controle positivo dos testes:
 *
 * | | Quadro III — Docente I | Quadro IV — Docente II |
 * |---|---|---|
 * | Mestrado Profissional | Área do Componente Curricular — **5** | Docência na Educação Básica — **5** |
 * | Lato sensu, 360h | Tecnologias Digitais na Educação — **4** | Alfabetização e Letramento — **4** |
 * | Lato sensu, 360h | Educação Inclusiva — **3** | Educação Inclusiva — **3** |
 * | | **12** | **12** |
 *
 * 🔴 **O que este módulo NÃO faz, e é fronteira que precisa estar escrita:** conferir que
 * a soma das categorias cabe no teto **não** garante que a pontuação final de um
 * candidato o respeite. Isso é correção de prova, que é outro módulo e não existe. Sem
 * este parágrafo alguém vai supor que o sistema já limita a nota de alguém.
 */

export type NivelTitulo =
  | "DOUTORADO"
  | "MESTRADO_ACADEMICO"
  | "MESTRADO_PROFISSIONAL"
  | "ESPECIALIZACAO_LATO_SENSU";

/** Rótulos na ordem hierárquica — é a ordem em que os quadros reais listam os títulos. */
export const NIVEIS_DE_TITULO: ReadonlyArray<{ nivel: NivelTitulo; rotulo: string }> = [
  { nivel: "DOUTORADO", rotulo: "Doutorado" },
  { nivel: "MESTRADO_ACADEMICO", rotulo: "Mestrado acadêmico" },
  { nivel: "MESTRADO_PROFISSIONAL", rotulo: "Mestrado profissional" },
  { nivel: "ESPECIALIZACAO_LATO_SENSU", rotulo: "Especialização (lato sensu)" },
];

export const rotuloDoNivel = (n: string) =>
  NIVEIS_DE_TITULO.find((x) => x.nivel === n)?.rotulo ?? n;

export interface TituloItem {
  nivel: NivelTitulo;
  descricao: string;
  area_exigida: string | null;
  carga_horaria_minima_horas: number | null;
  /**
   * As DUAS colunas são do documento, não invenção: o quadro publicado tem "Pontuação
   * Mínima por Título" e "Pontuação Máxima por Título" lado a lado.
   *
   * ⚠️ Nos 6 itens reais as duas são IGUAIS. A diferença entre elas não é exercitada por
   * nenhum dado que temos — é fronteira registrada, não regra provada.
   */
  pontos_minimo: number;
  pontos_maximo: number;
}

export interface ConfigTitulos {
  teto_maximo_pontos: number | null;
  carater_classificatorio: boolean | null;
  exige_historico_escolar: boolean | null;
  exige_reconhecimento_mec_cne: boolean | null;
  dias_conclusao_antes_fim_inscricoes: number | null;
  exige_traducao_juramentada: boolean | null;
  exige_revalidacao_diploma_estrangeiro: boolean | null;
}

export interface AvisoTitulo {
  severidade: "erro" | "aviso";
  regra: string;
  mensagem: string;
}

/** O máximo que um candidato daquele cargo pode somar, se apresentar tudo. */
export const somaDosPontos = (itens: readonly TituloItem[]) =>
  itens.reduce((t, i) => t + (Number(i.pontos_maximo) || 0), 0);

/**
 * A data-limite de conclusão dos cursos, derivada do fim das inscrições.
 *
 * 🔴 **DERIVADA, nunca digitada.** O item 13.17 do Edital 002 diz "concluídos até 30 dias
 * antes do prazo previsto no subitem 5.4" — e o 5.4 é o fim das inscrições, 08/06/2026.
 * Guardar a data resolvida criaria a segunda cópia que envelhece calada quando o
 * cronograma muda: exatamente o `"dia XX/xx/2026"` que este módulo existe para matar.
 *
 * ⚠️ Aritmética de DIAS CORRIDOS, e é o que o edital diz. Não há "dia útil" aqui, então
 * não há a dependência de calendário de feriados que trava a fatia 3.
 */
export function dataLimiteDeConclusao(
  fimDasInscricoesISO: string | null,
  dias: number | null,
): string | null {
  if (!fimDasInscricoesISO || dias === null || dias === undefined) return null;
  // `T12:00:00` e não meia-noite: em fuso negativo, `new Date('2026-06-08')` é UTC e
  // volta um dia ao ser lido localmente. O meio-dia sobrevive a qualquer fuso.
  const d = new Date(`${fimDasInscricoesISO}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Confere um quadro de títulos contra o teto declarado.
 *
 * `rotuloDoCargo` entra na mensagem porque o teto é do EDITAL e os títulos são do CARGO:
 * sem o nome, "a soma passou do teto" não diz qual quadro conferir.
 */
export function conferirTitulos(entrada: {
  config: ConfigTitulos | null;
  itens: readonly TituloItem[];
  rotuloDoCargo?: string;
}): AvisoTitulo[] {
  const { config, itens } = entrada;
  const onde = entrada.rotuloDoCargo ? `${entrada.rotuloDoCargo}: ` : "";
  const avisos: AvisoTitulo[] = [];
  if (itens.length === 0) return avisos;

  const soma = somaDosPontos(itens);
  const teto = config?.teto_maximo_pontos ?? null;

  if (teto === null) {
    avisos.push({
      severidade: "erro",
      regra: "titulos-sem-teto",
      mensagem: `${onde}há ${itens.length} título(s) no quadro e nenhum teto declarado. O Edital 002 publica "cuja pontuação máxima não deverá ultrapassar 12 pontos" — sem o teto, o quadro sai sem o limite que o candidato precisa ler.`,
    });
  } else if (soma > teto) {
    avisos.push({
      severidade: "erro",
      regra: "titulos-acima-do-teto",
      mensagem: `${onde}os títulos somam ${soma} pontos e o teto declarado é ${teto}. O quadro publicado se contradiz: o candidato soma mais do que o próprio edital admite.`,
    });
  } else if (soma < teto) {
    // ⚠️ AVISO, não erro. É estado intermediário legítimo enquanto se monta o quadro, e
    // um edital pode mesmo declarar um teto folgado. Mas nos dois quadros reais a soma
    // bate EXATAMENTE no teto, então a divergência merece ser vista.
    avisos.push({
      severidade: "aviso",
      regra: "titulos-teto-inatingivel",
      mensagem: `${onde}os títulos somam ${soma} pontos, abaixo do teto de ${teto} — que assim é inatingível. Nos Quadros III e IV do Edital 002 a soma bate exatamente no teto.`,
    });
  }

  // 🔴 Aqui NÃO entra uma regra "lato sensu tem de declarar carga horária". Nos 4 itens
  // lato sensu reais ela está sempre lá (360h) e o mestrado nunca a declara — mas 4 casos
  // do mesmo edital não são regra, são um costume da FEVRE. Inventá-la acusaria o
  // primeiro edital que fizesse diferente, e é assim que um painel perde a confiança.

  return avisos;
}
