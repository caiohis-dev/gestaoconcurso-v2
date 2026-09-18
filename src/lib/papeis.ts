/**
 * Os papéis, e a única pergunta sobre eles que mais de uma tela precisa fazer.
 *
 * ⚠️ Isto NÃO é o registro de módulos (`modulos.ts`), que é UX e não decide rota.
 * Aqui mora a pergunta "para onde esta pessoa vai", que Auth, Inicio e Perfil
 * precisam responder IGUAL — e que até 2026-09-18 estava copiada nos quatro.
 */

export type AppRole = 'admin' | 'user' | 'coordenador' | 'superadmin' | 'colaborador';

/**
 * É colaborador e não tem papel de gestão que abra alguma porta.
 *
 * Quem responde `true` aqui não tem destino no hub: `modulos.ts` só conhece
 * `superadmin`, `admin` e `coordenador`, então o hub sairia vazio ("fale com a
 * administração") e a pessoa ficaria sem chegar ao próprio cadastro. O lugar dela é
 * `/perfil-colaborador`.
 *
 * **Medido em 2026-09-18:** são 40 das 53 contas com papel `colaborador` — a maior
 * fatia de contas do sistema, e todas caíam no hub vazio.
 *
 * ⚠️ `role === null` entra na conta mesmo sendo inalcançável hoje. O trigger
 * `handle_new_user` concede `'user'` a TODA conta nova antes de conceder
 * `'colaborador'`, então ninguém chega aqui sem `user` — mas `signOut` zera `role`, e
 * escrever assim **falha fechado**: um degrau novo na escada de `resolveRoleGestao`
 * não casaria, e a pessoa ficaria no hub em vez de ser mandada calada para o portal.
 * Pelo mesmo motivo NÃO troque por `!isAdmin && !isCoordenador`, que hoje é
 * equivalente e amanhã não seria.
 */
export function colaboradorSemGestao(isColaborador: boolean, role: AppRole | null): boolean {
  if (!isColaborador) return false;
  return role === null || role === 'user';
}
