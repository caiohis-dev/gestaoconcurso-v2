/**
 * A parte pura do módulo Alocação de Candidatos — sem React e sem Supabase, para a
 * bateria de testes não precisar de mock (mesma disciplina de `candidatos-import.ts`).
 */

/** O que o supabase-js entrega no erro: `Error` com os campos do Postgrest quando vem do banco. */
export interface ErroDoBanco {
  message: string;
  code?: string;
}

/** O índice `UNIQUE (prova_id, candidato_id)` da migration 20260804225156. */
const CHAVE_CANDIDATO_POR_PROVA = "candidatos_alocacao_prova_candidato_key";

/**
 * Traduz as recusas da alocação manual (incluir/retirar via PostgREST).
 *
 * Só DOIS casos são traduzidos, e a lista curta é decisão: as demais recusas do banco —
 * PF001 (prova finalizada), AL005 (edital errado), AL006 (sala lotada), AL007 e as
 * AL001..AL004 da RPC de distribuição — já chegam em português nomeando o que fazer,
 * e a regra da casa é repassar a explicação intacta, nunca trocá-la por um genérico.
 *
 * 1. O 23505 da chave `(prova_id, candidato_id)`: "duplicate key value violates unique
 *    constraint …" não explica nada a quem clicou em incluir.
 * 2. A recusa da RLS: "row-level security" é jargão; o motivo real é papel.
 */
export function mensagemErroAlocacao(error: ErroDoBanco): string {
  const m = error?.message ?? "";

  if (error?.code === "23505" || m.includes(CHAVE_CANDIDATO_POR_PROVA)) {
    return "Este candidato já está alocado em uma sala desta prova. Retire-o da sala atual antes de incluí-lo em outra.";
  }

  if (/row-level security|permission denied/i.test(m)) {
    return "Sem permissão para alterar a alocação. É necessário ser administrador.";
  }

  return m.trim() || "Erro ao alterar a alocação";
}

/** O mínimo de uma sala do snapshot para ordená-la. */
export interface SalaOrdenavel {
  id: string;
  sala_fk_unidade: string;
  sala_numero: number;
  sala_andar: number | null;
  sala_capacidade: number;
}

/** O mínimo de uma unidade vinculada para rotular e ordenar o grupo. */
export interface UnidadeOrdenavel {
  unidade_id: string;
  sigla: string;
  nome: string;
}

export interface GrupoDeSalas {
  unidadeId: string;
  sigla: string;
  nome: string;
  salas: SalaOrdenavel[];
}

/**
 * As salas COM VAGA, agrupadas por unidade e em ordem física.
 *
 * 🔴 A ordem das unidades é por **`unid_nome`**, NÃO por sigla, e a diferença é visível no
 * dado real: por nome, `UGB — CENTRO UNIV. GERALDO DI BIASE` vem primeiro; por sigla viria
 * quase no fim, depois de `CGV`, `CIEP 295` e `ICT`. `unid_nome` é a chave que o banco usa
 * para ordem física (`aplicar_plano_de_alocacao`), e ordenar por outra coisa aqui criaria
 * uma TERCEIRA ordenação para o mesmo conceito — a RPC, o quadro e este seletor.
 *
 * Dentro da unidade: `sala_andar` com os nulos por último (como o `NULLS LAST` do banco) e
 * depois `sala_numero`.
 *
 * Sala cheia não entra: oferecê-la seria oferecer um `AL006`, a recusa do banco.
 *
 * É função pura e testada porque ordenação regride em silêncio — nada quebra, a lista só
 * fica numa ordem que ninguém consegue seguir com uma planta do prédio na mão.
 */
export function agruparSalasComVagaPorUnidade(
  salas: SalaOrdenavel[],
  unidades: UnidadeOrdenavel[],
  ocupacao: Record<string, number>,
): GrupoDeSalas[] {
  const dados = new Map(unidades.map((u) => [u.unidade_id, u]));
  const porUnidade = new Map<string, SalaOrdenavel[]>();

  for (const sala of salas) {
    if ((ocupacao[sala.id] ?? 0) >= sala.sala_capacidade) continue;
    const lista = porUnidade.get(sala.sala_fk_unidade) ?? [];
    lista.push(sala);
    porUnidade.set(sala.sala_fk_unidade, lista);
  }

  return [...porUnidade.entries()]
    .map(([unidadeId, lista]) => ({
      unidadeId,
      sigla: dados.get(unidadeId)?.sigla?.trim() || "?",
      // Unidade sem dado carregado NÃO some do seletor: sumir esconderia salas com vaga.
      nome: dados.get(unidadeId)?.nome || "(unidade não carregada)",
      salas: [...lista].sort(
        (a, b) =>
          (a.sala_andar ?? Number.MAX_SAFE_INTEGER) -
            (b.sala_andar ?? Number.MAX_SAFE_INTEGER) || a.sala_numero - b.sala_numero,
      ),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
