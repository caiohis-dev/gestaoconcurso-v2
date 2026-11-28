/**
 * Quem vê o botão "Encerrar Registro" de uma unidade em `/ocorrencias-prova`.
 *
 * Espelha FIELMENTE a RPC `encerrar_ocorrencias_unidade` (migration 20261128002649,
 * decisão do usuário em 2026-11-27): **superadmin**, ou **coordenador DAQUELA unidade**.
 * Admin comum e o criador da prova NÃO encerram — e a tela não oferece o botão a eles.
 *
 * ⚠️ É conveniência: a barreira é a RPC (que também exige senha digitada há ≤ 5 min, lida
 * do `amr` do JWT). Se esta regra divergir da RPC, a tela oferece um botão que o banco
 * recusa — CLAUDE.md §8, "a tela que antecipa recusa do banco reimplementa FIELMENTE".
 *
 * `unidadesDoCoordenador` vem de `useCoordenadorUnidades` — a mesma definição de
 * "coordenador da unidade" que a RPC usa (`coordenadores_prova` → `colaboradores_prova`).
 * Enquanto carrega ela é vazia, e o botão simplesmente não aparece: falha para o lado
 * fechado.
 */
export function podeEncerrarOcorrencias(
  provaUnidadeId: string,
  ctx: { isSuperAdmin: boolean; unidadesDoCoordenador: ReadonlySet<string> },
): boolean {
  return ctx.isSuperAdmin || ctx.unidadesDoCoordenador.has(provaUnidadeId);
}
