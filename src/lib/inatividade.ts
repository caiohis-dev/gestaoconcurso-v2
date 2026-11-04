/**
 * Logout por inatividade — a regra pura (tempos, marca compartilhada, fase da sessão).
 * Quem age sobre ela é `src/components/ControleInatividade.tsx`.
 *
 * POR QUE NO NAVEGADOR
 * O plano gratuito do Supabase não tem tempo limite de sessão pelo servidor. O caso que
 * isto resolve é o computador compartilhado/esquecido — e esse é do navegador.
 *
 * POR QUE A MARCA FICA NO localStorage
 * A sessão do Supabase é UMA para todas as abas. Um timer por aba (como o do
 * `PerfilColaborador` até 2026-11-03) deslogava a aba em que a pessoa estava trabalhando
 * porque OUTRA aba ficou parada. Com a última atividade num lugar só, todas as abas
 * enxergam a mesma conta.
 *
 * POR QUE A MARCA SOBREVIVE AO FECHAR O NAVEGADOR
 * A sessão sobrevive (fica no localStorage). Sem a marca, quem fechasse o navegador e
 * voltasse no dia seguinte entraria direto — a conta "parada desde ontem" só existe porque
 * a marca também ficou.
 */

/** Gestão (admin, coordenador, financeiro, superadmin) — decisão do usuário, 2026-11-03. */
export const LIMITE_GESTAO_MS = 30 * 60 * 1000

/** Portal do colaborador sem gestão — mantido o tempo que já existia (decisão do usuário). */
export const LIMITE_COLABORADOR_MS = 5 * 60 * 1000

/** O aviso com "Continuar conectado" aparece este tempo antes de sair. */
export const AVISO_ANTES_MS = 60 * 1000

export const CHAVE_ULTIMA_ATIVIDADE = 'gc:ultima-atividade'

/** Quem é gestor E colaborador fica com o tempo da gestão: é o acesso mais largo que ele tem. */
export function limiteDeInatividade(isColaboradorSemGestao: boolean): number {
  return isColaboradorSemGestao ? LIMITE_COLABORADOR_MS : LIMITE_GESTAO_MS
}

/** Instante da última atividade registrada (qualquer aba), ou `null` se não houver marca. */
export function lerUltimaAtividade(storage: Storage = localStorage): number | null {
  try {
    const valor = Number(storage.getItem(CHAVE_ULTIMA_ATIVIDADE))
    return Number.isFinite(valor) && valor > 0 ? valor : null
  } catch {
    return null
  }
}

export function registrarAtividade(agora: number, storage: Storage = localStorage): void {
  try {
    storage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(agora))
  } catch {
    // Storage indisponível (modo privado restrito): a conta segue pela aba, sem quebrar.
  }
}

export function apagarUltimaAtividade(storage: Storage = localStorage): void {
  try {
    storage.removeItem(CHAVE_ULTIMA_ATIVIDADE)
  } catch {
    // idem
  }
}

export type FaseSessao =
  | { fase: 'ativa' }
  | { fase: 'aviso'; restanteMs: number }
  | { fase: 'expirada' }

/** Em que ponto a sessão está, dado quando foi a última atividade. */
export function faseDaSessao(ultimaAtividade: number, agora: number, limiteMs: number): FaseSessao {
  const restanteMs = ultimaAtividade + limiteMs - agora
  if (restanteMs <= 0) return { fase: 'expirada' }
  if (restanteMs <= AVISO_ANTES_MS) return { fase: 'aviso', restanteMs }
  return { fase: 'ativa' }
}
