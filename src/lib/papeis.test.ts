import { describe, it, expect } from 'vitest';
import { colaboradorSemGestao, type AppRole } from './papeis';

describe('colaboradorSemGestao', () => {
  // A tabela-verdade inteira: 2 booleanos × 5 papéis + null.
  // Vale escrever todas porque o custo de errar é mandar alguém para a tela errada.

  describe('é colaborador', () => {
    it('sem papel de gestão nenhum (`role === null`) → true', () => {
      // Inalcançável em produção (o trigger concede `user` a toda conta nova), mas é
      // o estado da fixture `colaborador` da matriz de guards e o de `signOut`.
      expect(colaboradorSemGestao(true, null, false)).toBe(true);
    });

    it('com `user` → true — é o caso dos 40', () => {
      // `user` é degrau da escada de gestão, mas não abre módulo nenhum: quem para
      // aqui via o hub vazio.
      expect(colaboradorSemGestao(true, 'user', false)).toBe(true);
    });

    it('com `coordenador` → false', () => {
      // 11 contas. Coordenador abre o módulo Aplicação de Provas, então tem hub.
      expect(colaboradorSemGestao(true, 'coordenador', false)).toBe(false);
    });

    it('com `admin` → false', () => {
      expect(colaboradorSemGestao(true, 'admin', false)).toBe(false);
    });

    it('com `superadmin` → false', () => {
      // A conta `admin+colaborador+superadmin` medida em 18/09 não tem papel `user`:
      // não escreva a regra como "não tem user", escreva como "não tem gestão".
      expect(colaboradorSemGestao(true, 'superadmin', false)).toBe(false);
    });

    it.each([null, 'user'] as (AppRole | null)[])(
      'com `financeiro` e role %s → false — o papel paralelo abre o módulo dele',
      (role) => {
        // Até 2026-09-24 isto dava true: o colaborador promovido a financeiro ia ao
        // portal e nunca via o card. `financeiro` não entra em `role`, por isso vem à parte.
        expect(colaboradorSemGestao(true, role, true)).toBe(false);
      },
    );
  });

  describe('NÃO é colaborador — o controle negativo', () => {
    it('`user` puro → false, mesmo sem ter módulo algum', () => {
      // 3 contas. Elas também veem o hub vazio, mas não há para onde mandá-las: não
      // têm cadastro de colaborador. Este caso é o que pega um predicado escrito sem
      // o `isColaborador &&` — ele as jogaria num portal que não existe para elas.
      expect(colaboradorSemGestao(false, 'user', false)).toBe(false);
    });

    it('sem papel nenhum → false', () => {
      expect(colaboradorSemGestao(false, null, false)).toBe(false);
    });

    it.each(['coordenador', 'admin', 'superadmin'] as AppRole[])(
      'gestor puro (%s) → false',
      (role) => {
        expect(colaboradorSemGestao(false, role, false)).toBe(false);
      },
    );

    it('financeiro puro → false', () => {
      expect(colaboradorSemGestao(false, null, true)).toBe(false);
    });
  });
});
