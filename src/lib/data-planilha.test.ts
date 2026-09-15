import { describe, it, expect } from 'vitest';
import { converterDataPlanilha } from './data-planilha';

describe('converterDataPlanilha', () => {
  describe('🔴 serial do Excel — a base é 30/12/1899, não 20/12', () => {
    // O caso que a produção provou. Este colaborador foi importado com serial 23906 e
    // ficou gravado como 1965-06-03; a data verdadeira é 1965-06-13. A base errada
    // (20/12/1899) produzia exatamente 10 dias menos, em 89 das 94 datas do arquivo
    // de correção de 15/09.
    it('serial 23906 é 1965-06-13 (e NÃO 1965-06-03, que era o bug)', () => {
      expect(converterDataPlanilha(23906)).toBe('1965-06-13');
      expect(converterDataPlanilha(23906)).not.toBe('1965-06-03');
    });

    it('a regressão tem forma conhecida: voltar a base para 20/12 desloca 10 dias', () => {
      // Se alguém "restaurar" a base antiga, é este par que cai — e a mensagem diz o quê.
      const casos: Array<[number, string]> = [
        [23906, '1965-06-13'], // 13/06/1965
        [22838, '1962-07-11'], // 11/07/1962
        [25714, '1970-05-26'], // 26/05/1970
      ];
      for (const [serial, esperado] of casos) {
        expect(converterDataPlanilha(serial), `serial ${serial}`).toBe(esperado);
      }
    });

    it('bate com a conversão do importador de candidatos, que sempre esteve certa', () => {
      // src/lib/candidatos-import.ts usa Date.UTC(1899, 11, 30). Os dois têm de concordar:
      // divergir de novo é o defeito original voltando por outra porta.
      const base = Date.UTC(1899, 11, 30);
      for (const serial of [10001, 23906, 40000, 59999]) {
        const referencia = new Date(base + serial * 86400000).toISOString().slice(0, 10);
        expect(converterDataPlanilha(serial), `serial ${serial}`).toBe(referencia);
      }
    });

    it('serial só vale para célula NUMÉRICA — o mesmo número como texto não é serial', () => {
      expect(converterDataPlanilha(23906)).toBe('1965-06-13');
      // Como string, cai nos formatos de texto: 5 dígitos não casa com nenhum, e volta cru
      // para o banco recusar com 22007 em vez de virar uma data inventada.
      expect(converterDataPlanilha('23906')).toBe('23906');
    });
  });

  describe('formatos de texto', () => {
    it('ISO passa direto', () => {
      expect(converterDataPlanilha('1965-06-13')).toBe('1965-06-13');
    });

    it('DD/MM/AAAA, com / . ou -, e com 1 ou 2 dígitos', () => {
      expect(converterDataPlanilha('13/06/1965')).toBe('1965-06-13');
      expect(converterDataPlanilha('13-06-1965')).toBe('1965-06-13');
      expect(converterDataPlanilha('13.06.1965')).toBe('1965-06-13');
      expect(converterDataPlanilha('3/6/1965')).toBe('1965-06-03');
    });

    it('DDMMAAAA sem separador', () => {
      expect(converterDataPlanilha('13061965')).toBe('1965-06-13');
    });

    it('espaço nas pontas não atrapalha', () => {
      expect(converterDataPlanilha('  13/06/1965  ')).toBe('1965-06-13');
    });
  });

  describe('ausência e lixo', () => {
    it('vazio, null e undefined viram string vazia (cai na validação de obrigatórios)', () => {
      expect(converterDataPlanilha('')).toBe('');
      expect(converterDataPlanilha(null)).toBe('');
      expect(converterDataPlanilha(undefined)).toBe('');
    });

    it('⚠️ o que não reconhece volta CRU, de propósito', () => {
      // Não inventa data: devolve o texto e deixa o banco recusar (22007/22008), que o
      // CadastroLote traduz para "Data inválida. Use DD/MM/AAAA ou DDMMAAAA".
      expect(converterDataPlanilha('não sei')).toBe('não sei');
      expect(converterDataPlanilha('31/02/1990')).toBe('1990-02-31');
    });
  });
});
