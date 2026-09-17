/**
 * O conteúdo programático — as ementas do Anexo, e o cruzamento com a matriz da prova.
 *
 * 🎯 **O defeito que esta fatia detecta está publicado.** No Edital 003/2026:
 *
 * | onde | como está escrito | ocorrências |
 * |---|---|---|
 * | corpo (itens 11.2, 11.3, 13.5.1) | `Legislação do SUS` | 3 |
 * | Anexo I | `LESGISLAÇÃO DO SUS` | 2 |
 *
 * A prova cobra uma disciplina e o anexo descreve outra, de nome diferente. E o erro
 * aparece **duas** vezes no anexo porque o bloco foi copiado de um cargo para o outro — o
 * mesmo mecanismo do COREN na fatia 8, agora num nome de disciplina.
 *
 * 🔴 **É por isso que a comparação ignora acento, caixa e espaço.** Se comparasse cru,
 * `LESGISLAÇÃO` ainda seria pego (a letra a mais sobrevive a qualquer normalização), mas
 * `Legislação` × `LEGISLACAO` — que é a divergência mais comum entre corpo e anexo de um
 * PDF — passaria batido, e o painel encheria de falso positivo.
 *
 * ⚠️ E o cruzamento NÃO é barreira de banco. Uma FK para `provas_disciplinas` não serve:
 * ela pende de `edital_cargo_id`, e a ementa comum não pertence a cargo nenhum — o Edital
 * 002 escreve, no título, "LÍNGUA PORTUGUESA (COMUM A TODOS OS CARGOS)". O CASO 5 da
 * bateria prova que o banco aceita o nome divergente, de propósito.
 */

/**
 * Normaliza para comparar: sem acento, sem caixa, sem espaço duplicado.
 *
 * ⚠️ Usa a mesma ideia do `translate()` de `colab_nome_busca` — aqui é BUSCA (achar o
 * par), não IDENTIDADE, então dobrar acento é seguro. Nos índices únicos do banco a
 * normalização é só de caixa e espaço, e a diferença é deliberada: lá, fundir por acento
 * poderia juntar disciplinas legitimamente distintas.
 */
export const chaveDeDisciplina = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export interface Ementa {
  id: string;
  cargo_id: string | null;
  aplica_a_todos_os_cargos: boolean;
  nome_disciplina: string;
  texto_ementa: string;
}

/** Uma disciplina da matriz da prova (fatia 5), com o cargo a que pertence. */
export interface DisciplinaDaProva {
  edital_cargo_id: string;
  cargo_id: string;
  nomeDoCargo: string;
  nome_disciplina: string;
}

export interface AvisoConteudo {
  severidade: "erro" | "aviso";
  regra: string;
  mensagem: string;
}

/** As ementas que valem para um cargo: as comuns mais as dele. */
export const ementasDoCargo = (ementas: readonly Ementa[], cargoId: string) =>
  ementas.filter((e) => e.aplica_a_todos_os_cargos || e.cargo_id === cargoId);

/**
 * A cobertura por cargo: quais disciplinas da matriz já têm ementa e quais não.
 *
 * É o indicador que o roadmap pedia — "é o que impede o anexo sair incompleto".
 */
export function coberturaPorCargo(
  disciplinas: readonly DisciplinaDaProva[],
  ementas: readonly Ementa[],
): { cargo_id: string; nomeDoCargo: string; comEmenta: string[]; semEmenta: string[] }[] {
  const porCargo = new Map<string, DisciplinaDaProva[]>();
  for (const d of disciplinas) {
    const lista = porCargo.get(d.cargo_id) ?? [];
    lista.push(d);
    porCargo.set(d.cargo_id, lista);
  }

  return [...porCargo].map(([cargo_id, lista]) => {
    const chaves = new Set(
      ementasDoCargo(ementas, cargo_id).map((e) => chaveDeDisciplina(e.nome_disciplina)),
    );
    const comEmenta: string[] = [];
    const semEmenta: string[] = [];
    for (const d of lista) {
      (chaves.has(chaveDeDisciplina(d.nome_disciplina)) ? comEmenta : semEmenta)
        .push(d.nome_disciplina);
    }
    return { cargo_id, nomeDoCargo: lista[0].nomeDoCargo, comEmenta, semEmenta };
  });
}

/**
 * Ementa no ANEXO cuja disciplina a PROVA não conhece.
 *
 * 🎯 É a direção que pega o `LESGISLAÇÃO DO SUS`. ⚠️ Mora fora de `conferirConteudo`
 * porque a função passou de 15 de complexidade no lint (baseline 111) — extrair é a saída
 * deste repo.
 */
function conferirEmentasOrfas(
  ementas: readonly Ementa[],
  disciplinas: readonly DisciplinaDaProva[],
): AvisoConteudo[] {
  if (disciplinas.length === 0) return [];

  const naProva = new Map<string, Set<string>>();
  for (const d of disciplinas) {
    const set = naProva.get(d.cargo_id) ?? new Set<string>();
    set.add(chaveDeDisciplina(d.nome_disciplina));
    naProva.set(d.cargo_id, set);
  }
  const todasDaProva = new Set([...naProva.values()].flatMap((s) => [...s]));

  return ementas.flatMap((e) => {
    const chave = chaveDeDisciplina(e.nome_disciplina);
    const conhecida = e.aplica_a_todos_os_cargos
      ? todasDaProva.has(chave)
      : (naProva.get(e.cargo_id!)?.has(chave) ?? false);
    return conhecida ? [] : [{
      severidade: "erro" as const,
      regra: "ementa-sem-disciplina",
      mensagem: `"${e.nome_disciplina}" tem ementa no anexo e não existe na matriz da prova. Foi assim que o Edital 003 publicou "LESGISLAÇÃO DO SUS" no anexo enquanto o corpo cobrava "Legislação do SUS".`,
    }];
  });
}

/**
 * Ementa comum DUPLICADA como específica, com o mesmo texto.
 *
 * ⚠️ AVISO, não erro: o Edital 003 faz isso (Português idêntico byte a byte nos dois
 * cargos), e é redundância do documento, não incoerência. Mas é ela que propaga erro de
 * digitação — o `LESGISLAÇÃO` aparece duas vezes exatamente por isso.
 */
function conferirRepeticoes(ementas: readonly Ementa[]): AvisoConteudo[] {
  const comuns = new Map(
    ementas.filter((e) => e.aplica_a_todos_os_cargos)
      .map((e) => [chaveDeDisciplina(e.nome_disciplina), e]),
  );
  return ementas.flatMap((e) => {
    if (e.aplica_a_todos_os_cargos) return [];
    const comum = comuns.get(chaveDeDisciplina(e.nome_disciplina));
    if (!comum || comum.texto_ementa.trim() !== e.texto_ementa.trim()) return [];
    return [{
      severidade: "aviso" as const,
      regra: "ementa-repetida-identica",
      mensagem: `"${e.nome_disciplina}" está como ementa comum e repetida por cargo, com o texto idêntico. Duas cópias do mesmo texto divergem na primeira correção feita só numa delas.`,
    }];
  });
}

/** Disciplina na PROVA sem ementa no ANEXO — o anexo incompleto. */
function conferirCobertura(
  ementas: readonly Ementa[],
  disciplinas: readonly DisciplinaDaProva[],
): AvisoConteudo[] {
  return coberturaPorCargo(disciplinas, ementas).flatMap((c) =>
    c.semEmenta.length === 0 ? [] : [{
      severidade: "erro" as const,
      regra: "disciplina-sem-ementa",
      mensagem: `${c.nomeDoCargo}: ${c.semEmenta.join(", ")} — está na matriz da prova e não tem ementa no anexo. O candidato é cobrado em algo que o edital não descreve.`,
    }],
  );
}

export function conferirConteudo(entrada: {
  ementas: readonly Ementa[];
  disciplinas: readonly DisciplinaDaProva[];
}): AvisoConteudo[] {
  const { ementas, disciplinas } = entrada;
  // 🔴 Nada a conferir num anexo que ainda não começou. Acusar aqui encheria o painel
  // desde o primeiro minuto de um edital novo, e quem o vê aprende a ignorá-lo.
  if (ementas.length === 0) return [];

  return [
    ...conferirCobertura(ementas, disciplinas),
    ...conferirEmentasOrfas(ementas, disciplinas),
    ...conferirRepeticoes(ementas),
  ];
}
