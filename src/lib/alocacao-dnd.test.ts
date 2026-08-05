import { describe, it, expect } from "vitest";
import {
  alocarCargoNaUnidade,
  devolverParaPendentes,
  EstadoAlocacao,
  estadoInicial,
  lerDadosArrastaveis,
  lerDadosSoltaveis,
  montarPlano,
  totalForaDoPlano,
  totalNoPlano,
  vagasRestantes,
} from "./alocacao-dnd";

/**
 * As transições puras do protótipo de arrasto. São testadas porque, no acoplamento, é
 * ELAS que decidem o que a tela mostra enquanto o banco responde — o modelo otimista.
 * Um erro aqui não dá erro: mostra número plausível e errado.
 */

const estado = (): EstadoAlocacao =>
  estadoInicial(
    [
      { id: "c1", nome: "Professor", naoAlocados: 45 },
      { id: "c2", nome: "Merendeira", naoAlocados: 8 },
    ],
    [
      { id: "u1", nome: "Escola A", vagasTotais: 100, alocados: 0, alocacoesPorCargo: [] },
      { id: "u2", nome: "Escola B", vagasTotais: 10, alocados: 0, alocacoesPorCargo: [] },
    ],
  );

describe("alocarCargoNaUnidade", () => {
  it("move o cargo inteiro quando cabe", () => {
    const { estado: novo, transferidos } = alocarCargoNaUnidade(estado(), "c1", "u1");

    expect(transferidos).toBe(45);
    expect(novo.cargos.find((c) => c.id === "c1")!.naoAlocados).toBe(0);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocados).toBe(45);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocacoesPorCargo).toEqual([
      { cargoId: "c1", nome: "Professor", quantidade: 45, ordem: 1 },
    ]);
  });

  it("move só o que cabe e deixa o resto pendente", () => {
    const { estado: novo, transferidos } = alocarCargoNaUnidade(estado(), "c1", "u2");

    expect(transferidos).toBe(10);
    expect(novo.cargos.find((c) => c.id === "c1")!.naoAlocados).toBe(35);
    expect(novo.unidades.find((u) => u.id === "u2")!.alocados).toBe(10);
  });

  it("soma no bloco existente em vez de criar um segundo do mesmo cargo", () => {
    const primeiro = alocarCargoNaUnidade(estado(), "c1", "u2").estado; // enche u2 (10)
    // devolve 5 à mão para haver espaço e repetir o mesmo cargo na mesma unidade
    const comEspaco: EstadoAlocacao = {
      ...primeiro,
      unidades: primeiro.unidades.map((u) =>
        u.id === "u2"
          ? {
              ...u,
              alocados: 5,
              alocacoesPorCargo: [{ cargoId: "c1", nome: "Professor", quantidade: 5, ordem: 1 }],
            }
          : u,
      ),
    };

    const { estado: novo, transferidos } = alocarCargoNaUnidade(comEspaco, "c1", "u2");

    expect(transferidos).toBe(5);
    expect(novo.unidades.find((u) => u.id === "u2")!.alocacoesPorCargo).toEqual([
      { cargoId: "c1", nome: "Professor", quantidade: 10, ordem: 1 },
    ]);
    // Repetir cargo+unidade NÃO gasta ordem nova: o bloco cresce, não nasce outro.
    expect(novo.proximaOrdem).toBe(comEspaco.proximaOrdem);
  });

  it("não transfere nada em unidade cheia, e devolve o MESMO estado", () => {
    const cheia = alocarCargoNaUnidade(estado(), "c1", "u2").estado;
    const r = alocarCargoNaUnidade(cheia, "c2", "u2");

    expect(r.transferidos).toBe(0);
    expect(r.estado).toBe(cheia); // identidade: quem chama usa isso para não animar sucesso
  });

  it("ignora cargo ou unidade inexistente", () => {
    expect(alocarCargoNaUnidade(estado(), "inexistente", "u1").transferidos).toBe(0);
    expect(alocarCargoNaUnidade(estado(), "c1", "inexistente").transferidos).toBe(0);
  });
});

describe("devolverParaPendentes", () => {
  it("devolve o bloco inteiro e some com ele da unidade", () => {
    const alocado = alocarCargoNaUnidade(estado(), "c1", "u1").estado;
    const { estado: novo, devolvidos } = devolverParaPendentes(alocado, "c1", "u1");

    expect(devolvidos).toBe(45);
    expect(novo.cargos.find((c) => c.id === "c1")!.naoAlocados).toBe(45);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocados).toBe(0);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocacoesPorCargo).toEqual([]);
  });

  it("⭐ CONTROLE POSITIVO: devolve SÓ o bloco pedido, com dois cargos na mesma unidade", () => {
    const comDois = alocarCargoNaUnidade(
      alocarCargoNaUnidade(estado(), "c1", "u1").estado,
      "c2",
      "u1",
    ).estado;
    expect(comDois.unidades.find((u) => u.id === "u1")!.alocados).toBe(53);

    const { estado: novo, devolvidos } = devolverParaPendentes(comDois, "c1", "u1");

    expect(devolvidos).toBe(45);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocados).toBe(8);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocacoesPorCargo).toEqual([
      { cargoId: "c2", nome: "Merendeira", quantidade: 8, ordem: 2 },
    ]);
    expect(novo.cargos.find((c) => c.id === "c2")!.naoAlocados).toBe(0);
  });

  it("devolver o que ficou parcial repõe só a parte alocada", () => {
    const parcial = alocarCargoNaUnidade(estado(), "c1", "u2").estado; // 10 de 45
    const { estado: novo, devolvidos } = devolverParaPendentes(parcial, "c1", "u2");

    expect(devolvidos).toBe(10);
    expect(novo.cargos.find((c) => c.id === "c1")!.naoAlocados).toBe(45);
  });

  it("ignora bloco que não existe naquela unidade", () => {
    const alocado = alocarCargoNaUnidade(estado(), "c1", "u1").estado;
    const r = devolverParaPendentes(alocado, "c1", "u2");

    expect(r.devolvidos).toBe(0);
    expect(r.estado).toBe(alocado);
  });

  it("ida e volta não perde nem inventa gente", () => {
    const inicial = estado();
    const total = inicial.cargos.reduce((s, c) => s + c.naoAlocados, 0);

    const ida = alocarCargoNaUnidade(inicial, "c1", "u2").estado; // parcial: 10 de 45
    const volta = devolverParaPendentes(ida, "c1", "u2").estado;

    expect(volta.cargos.reduce((s, c) => s + c.naoAlocados, 0)).toBe(total);
    expect(volta.unidades.every((u) => u.alocados === 0)).toBe(true);
  });
});

describe("montarPlano — o payload que a RPC recebe", () => {
  it("🔴 respeita a ORDEM DE ARRASTO, e ela atravessa unidades", () => {
    // A ordem decide quem cai onde quando um cargo se divide: a 1ª entrada leva os
    // primeiros N alfabéticos, a 2ª os N seguintes. Achatar por unidade perderia isso.
    let e = estado();
    e = alocarCargoNaUnidade(e, "c1", "u2").estado; // 1º arrasto: c1 → u2 (10, o que cabe)
    e = alocarCargoNaUnidade(e, "c2", "u1").estado; // 2º arrasto: c2 → u1
    e = alocarCargoNaUnidade(e, "c1", "u1").estado; // 3º arrasto: c1 → u1 (o resto)

    expect(montarPlano(e)).toEqual([
      { cargo_id: "c1", unidade_id: "u2", quantidade: 10 },
      { cargo_id: "c2", unidade_id: "u1", quantidade: 8 },
      { cargo_id: "c1", unidade_id: "u1", quantidade: 35 },
    ]);
  });

  it("devolver um bloco tira a entrada e NÃO reordena os que ficaram", () => {
    let e = estado();
    e = alocarCargoNaUnidade(e, "c1", "u2").estado; // ordem 1
    e = alocarCargoNaUnidade(e, "c2", "u1").estado; // ordem 2
    e = devolverParaPendentes(e, "c1", "u2").estado;
    e = alocarCargoNaUnidade(e, "c1", "u1").estado; // ordem 3 — depois do c2

    expect(montarPlano(e)).toEqual([
      { cargo_id: "c2", unidade_id: "u1", quantidade: 8 },
      { cargo_id: "c1", unidade_id: "u1", quantidade: 45 },
    ]);
  });

  it("rascunho vazio vira plano vazio (a RPC recusa com AL008, e é a tela que evita)", () => {
    expect(montarPlano(estado())).toEqual([]);
  });

  it("totalNoPlano e totalForaDoPlano somam o rascunho e o que sobrou", () => {
    const e = alocarCargoNaUnidade(estado(), "c1", "u2").estado; // 10 dos 45
    expect(totalNoPlano(e)).toBe(10);
    expect(totalForaDoPlano(e)).toBe(43); // 35 do c1 + 8 do c2
  });
});

describe("vagasRestantes", () => {
  it("nunca é negativa, mesmo se a ocupação passar da capacidade", () => {
    expect(
      vagasRestantes({ id: "x", nome: "X", vagasTotais: 10, alocados: 15, alocacoesPorCargo: [] }),
    ).toBe(0);
  });
});

describe("leitura dos payloads do dnd-kit", () => {
  it("aceita os tipos conhecidos e recusa o resto", () => {
    expect(lerDadosArrastaveis({ tipo: "cargo", cargoId: "c1" })).not.toBeNull();
    expect(lerDadosArrastaveis({ tipo: "alocado", cargoId: "c1" })).not.toBeNull();
    expect(lerDadosArrastaveis({ tipo: "unidade" })).toBeNull();
    expect(lerDadosArrastaveis(undefined)).toBeNull();
    expect(lerDadosArrastaveis(null)).toBeNull();

    expect(lerDadosSoltaveis({ tipo: "unidade", unidadeId: "u1" })).not.toBeNull();
    expect(lerDadosSoltaveis({ tipo: "cargos-pendentes" })).not.toBeNull();
    expect(lerDadosSoltaveis({ tipo: "cargo" })).toBeNull();
    expect(lerDadosSoltaveis(undefined)).toBeNull();
  });
});
