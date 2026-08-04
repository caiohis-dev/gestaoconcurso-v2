import { describe, it, expect } from "vitest";
import {
  mensagemCamposObrigatorios,
  numeroDigitado,
  numerosDoLote,
  resumoDoLote,
  SALAS_POR_ANDAR,
} from "@/lib/salas";

/**
 * A numeração da criação em lote de `/salas-prova` (2026-08-03).
 *
 * 🔴 **Por que virou função pura:** a regra vivia dentro da mutation `createMultiple`, onde
 * só se alcança por mock — e é ela que decide quais números vão para o banco. O esquema
 * `andar × 100 + sequência` não tem `SEQUENCE` nenhuma atrás; se ele errar, a colisão é com
 * o índice único e a pessoa vê jargão do Postgres.
 */
describe("numerosDoLote", () => {
  /** Atalho: o resultado feliz, já achatado em números. */
  function numeros(lote: Parameters<typeof numerosDoLote>[0], existentes: number[] = []) {
    const r = numerosDoLote(lote, existentes);
    if (r.erro) throw new Error(`esperava sucesso, veio: ${r.erro}`);
    return r.andares.flatMap((a) => a.numeros);
  }

  it("um andar, andar vazio: começa na sequência 1", () => {
    expect(numeros({ quantidade: 3, andarDe: 1, andarAte: 1 })).toEqual([101, 102, 103]);
  });

  it("🔵 a faixa multiplica: quantidade é POR ANDAR", () => {
    // O pedido de 03/08. 2 salas × 3 andares = 6 salas, e cada andar tem a sua faixa.
    expect(numeros({ quantidade: 2, andarDe: 1, andarAte: 3 })).toEqual([
      101, 102, 201, 202, 301, 302,
    ]);
  });

  it("a faixa pode começar acima de 1 — dá para atender um andar só", () => {
    // É o que se perderia se o campo virasse "quantidade de andares" a partir do 1º.
    expect(numeros({ quantidade: 2, andarDe: 2, andarAte: 2 })).toEqual([201, 202]);
  });

  it("continua do MAIOR número do andar, não da contagem", () => {
    // Sala excluída deixa buraco, e o buraco não é reaproveitado: número repetido
    // confundiria lista já impressa.
    expect(numeros({ quantidade: 2, andarDe: 1, andarAte: 1 }, [101, 102, 105])).toEqual([
      106, 107,
    ]);
  });

  it("⭐ cada andar conta o SEU máximo — um andar cheio não empurra o vizinho", () => {
    // Fixture com máximos diferentes de propósito: se a conta usasse o maior número da
    // unidade inteira, o andar 1 começaria em 209.
    expect(numeros({ quantidade: 2, andarDe: 1, andarAte: 2 }, [101, 102, 208])).toEqual([
      103, 104, 209, 210,
    ]);
  });

  it("andar sem sala no meio da faixa começa do 1", () => {
    expect(numeros({ quantidade: 1, andarDe: 1, andarAte: 3 }, [101, 301])).toEqual([
      102, 201, 302,
    ]);
  });

  describe("🔴 o estouro de 99 salas por andar", () => {
    it("recusa, nomeando o andar e quantas ainda cabem", () => {
      const r = numerosDoLote({ quantidade: 5, andarDe: 1, andarAte: 1 }, [196]);
      expect(r.erro).toBeTruthy();
      expect(r.erro).toContain("andar 1");
      expect(r.erro).toContain("cabem mais 3");
      // O número da última sala existente entra na frase: é como a pessoa confere.
      expect(r.erro).toContain("196");
    });

    it("⭐ CONTROLE POSITIVO: exatamente 99 no andar ainda passa", () => {
      // A fronteira é `> 99`, não `>= 99`. Sem este caso, um off-by-one recusaria o
      // último lote legítimo e ninguém notaria.
      expect(numeros({ quantidade: 3, andarDe: 1, andarAte: 1 }, [196])).toEqual([
        197, 198, 199,
      ]);
      expect(SALAS_POR_ANDAR).toBe(99);
    });

    it("🔴 recusa o LOTE INTEIRO quando o estouro é num andar do meio", () => {
      // O contrário — gravar os andares que couberam — deixaria a unidade num estado que
      // ninguém pediu, com "erro" na tela. Mesma decisão da RPC de renumeração.
      const r = numerosDoLote({ quantidade: 4, andarDe: 1, andarAte: 3 }, [297]);
      expect(r.erro).toBeTruthy();
      expect(r.erro).toContain("andar 2");
    });

    it("⚠️ o estouro era a colisão que virava 'outra pessoa criou ao mesmo tempo'", () => {
      // Regressão do defeito de origem: sem esta guarda, a sequência 100 do andar 1 seria
      // o número 200 — a primeira sala do andar 2 — e o 23505 chegava com a mensagem de
      // corrida, mandando repetir uma ação que nunca ia funcionar.
      const r = numerosDoLote({ quantidade: 1, andarDe: 1, andarAte: 1 }, [199]);
      expect(r.erro).toBeTruthy();
    });
  });

  describe("as recusas de entrada", () => {
    it("andar final menor que o inicial", () => {
      const r = numerosDoLote({ quantidade: 1, andarDe: 3, andarAte: 2 }, []);
      expect(r.erro).toBeTruthy();
      expect(r.erro).toContain("não pode ser menor");
    });

    it("quantidade zero ou fracionária", () => {
      expect(numerosDoLote({ quantidade: 0, andarDe: 1, andarAte: 1 }, []).erro).toBeTruthy();
      expect(numerosDoLote({ quantidade: 1.5, andarDe: 1, andarAte: 1 }, []).erro).toBeTruthy();
    });

    it("andar zero ou negativo", () => {
      expect(numerosDoLote({ quantidade: 1, andarDe: 0, andarAte: 1 }, []).erro).toBeTruthy();
    });
  });

  it("o total conta os dois eixos", () => {
    const r = numerosDoLote({ quantidade: 10, andarDe: 1, andarAte: 3 }, []);
    expect(r.total).toBe(30);
    expect(r.erro).toBeNull();
  });
});

describe("resumoDoLote", () => {
  it("mostra a faixa de cada andar", () => {
    const r = numerosDoLote({ quantidade: 10, andarDe: 1, andarAte: 3 }, []);
    expect(resumoDoLote(r.andares)).toBe("101–110, 201–210, 301–310");
  });

  it("sala única não vira faixa", () => {
    const r = numerosDoLote({ quantidade: 1, andarDe: 2, andarAte: 2 }, []);
    expect(resumoDoLote(r.andares)).toBe("201");
  });
});

/**
 * ⚠️ A ligação com a tela (apagar o campo, salvar em branco) fica em
 * `pages/GerenciarSalasDistribuidas.ui.test.tsx`. Aqui é só a regra pura.
 */
/** A frase da recusa, isolada — ver a nota na função. */
describe("mensagemCamposObrigatorios", () => {
  const sala = (over: Record<string, unknown> = {}) =>
    ({ id: "s1", sala_numero: 101, sala_capacidade: 30, ...over }) as never;

  it("devolve null quando está tudo preenchido", () => {
    expect(mensagemCamposObrigatorios([sala(), sala({ id: "s2" })])).toBeNull();
  });

  it("conta as salas sem número e diz por que o número importa", () => {
    const msg = mensagemCamposObrigatorios([sala({ sala_numero: null }), sala({ id: "s2" })]);
    expect(msg).toContain("1 sem número");
    expect(msg).toContain("identifica a sala em campo");
  });

  it("junta os dois campos numa frase só", () => {
    const msg = mensagemCamposObrigatorios([
      sala({ sala_numero: null }),
      sala({ id: "s2", sala_capacidade: null }),
    ]);
    expect(msg).toContain("1 sem número e 1 sem capacidade");
  });

  it("⚠️ andar em branco NÃO entra: a coluna é NULLABLE no banco", () => {
    expect(mensagemCamposObrigatorios([sala({ sala_andar: null })])).toBeNull();
  });
});

describe("numeroDigitado", () => {
  it("vazio é null — o estado de digitação que o campo travado não permitia", () => {
    expect(numeroDigitado("")).toBeNull();
    expect(numeroDigitado("   ")).toBeNull();
  });

  it("⚠️ tecla que não vira número é IGNORADA (undefined), não zerada", () => {
    // A diferença entre `null` e `undefined` aqui é o conserto inteiro: null entra no
    // estado (campo vazio), undefined descarta a tecla (campo fica como estava).
    expect(numeroDigitado("abc")).toBeUndefined();
  });

  it("negativo é RECUSADO, não saturado em zero", () => {
    // Mesma decisão do ValoresFuncaoProvaDialog: 0 é capacidade válida, então saturar
    // seria inventar um valor legítimo que a pessoa não digitou.
    expect(numeroDigitado("-5")).toBeUndefined();
  });

  it("número normal passa", () => {
    expect(numeroDigitado("45")).toBe(45);
    expect(numeroDigitado("0")).toBe(0);
  });
});
