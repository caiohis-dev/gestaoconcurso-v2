import { describe, it, expect } from 'vitest';
import { colaboradorSemGestao, type AppRole } from './papeis';

describe('colaboradorSemGestao', () => {
  // A tabela-verdade inteira: são só 2 entradas booleanas × 5 papéis + null.
  // Vale escrever todas porque o custo de errar é mandar alguém para a tela errada.

  describe('é colaborador', () => {
    it('sem papel de gestão nenhum (`role === null`) → true', () => {
      // Inalcançável em produção (o trigger concede `user` a toda conta nova), mas é
      // o estado da fixture `colaborador` da matriz de guards e o de `signOut`.
      expect(colaboradorSemGestao(true, null)).toBe(true);
    });

    it('com `user` → true — é o caso dos 40', () => {
      // `user` é degrau da escada de gestão, mas não abre módulo nenhum: quem para
      // aqui via o hub vazio.
      expect(colaboradorSemGestao(true, 'user')).toBe(true);
    });

    it('com `coordenador` → false', () => {
      // 11 contas. Coordenador abre o módulo Aplicação de Provas, então tem hub.
      expect(colaboradorSemGestao(true, 'coordenador')).toBe(false);
    });

    it('com `admin` → false', () => {
      expect(colaboradorSemGestao(true, 'admin')).toBe(false);
    });

    it('com `superadmin` → false', () => {
      // A conta `admin+colaborador+superadmin` medida em 18/09 não tem papel `user`:
      // não escreva a regra como "não tem user", escreva como "não tem gestão".
      expect(colaboradorSemGestao(true, 'superadmin')).toBe(false);
    });
  });

  describe('NÃO é colaborador — o controle negativo', () => {
    it('`user` puro → false, mesmo sem ter módulo algum', () => {
      // 3 contas. Elas também veem o hub vazio, mas não há para onde mandá-las: não
      // têm cadastro de colaborador. Este caso é o que pega um predicado escrito sem
      // o `isColaborador &&` — ele as jogaria num portal que não existe para elas.
      expect(colaboradorSemGestao(false, 'user')).toBe(false);
    });

    it('sem papel nenhum → false', () => {
      expect(colaboradorSemGestao(false, null)).toBe(false);
    });

    it.each(['coordenador', 'admin', 'superadmin'] as AppRole[])(
      'gestor puro (%s) → false',
      (role) => {
        expect(colaboradorSemGestao(false, role)).toBe(false);
      },
    );
  });
});
