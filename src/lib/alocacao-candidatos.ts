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
