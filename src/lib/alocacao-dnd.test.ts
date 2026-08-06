import { describe, it, expect } from "vitest";
import {
  alocarCargoNaUnidade,
  devolverParaPendentes,
  EstadoAlocacao,
  estadoDoBloco,
  estadoInicial,
  simularEmpacotamento,
  totalAlocado,
  vagasTotais,
  lerDadosArrastaveis,
  lerDadosSoltaveis,
  agruparPorCargo,
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

/** `quantas` salas de `capacidade` cada, todas vazias. */
const salasDe = (quantas: number, capacidade: number) =>
  Array.from({ length: quantas }, (_, i) => ({
    id: `s${i + 1}`,
    capacidade,
    ocupadasManuais: 0,
  }));

const estado = (): EstadoAlocacao =>
  estadoInicial(
    [
      { id: "c1|comum", cargoId: "c1", nome: "Professor", bloco: "comum", naoAlocados: 45, total: 45 },
      { id: "c1|pcd", cargoId: "c1", nome: "Professor", bloco: "pcd", naoAlocados: 4, total: 4 },
      { id: "c1|sala_especial", cargoId: "c1", nome: "Professor", bloco: "sala_especial", naoAlocados: 3, total: 3 },
      { id: "c2|comum", cargoId: "c2", nome: "Merendeira", bloco: "comum", naoAlocados: 8, total: 8 },
    ],
    [
      // Salas de 10 em 10: os números pequenos deixam a ociosidade visível na conta.
      { id: "u1", nome: "Escola A", salas: salasDe(10, 10), alocacoesPorCargo: [] },
      { id: "u2", nome: "Escola B", salas: salasDe(1, 10), alocacoesPorCargo: [] },
    ],
  );

describe("alocarCargoNaUnidade", () => {
  it("move o cargo inteiro quando cabe", () => {
    const { estado: novo, transferidos } = alocarCargoNaUnidade(estado(), "c1|comum", "u1");

    expect(transferidos).toBe(45);
    expect(novo.cargos.find((c) => c.id === "c1|comum")!.naoAlocados).toBe(0);
    expect(totalAlocado(novo.unidades.find((u) => u.id === "u1")!)).toBe(45);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocacoesPorCargo).toEqual([
      { blocoId: "c1|comum", cargoId: "c1", nome: "Professor", bloco: "comum", quantidade: 45, ordem: 1 },
    ]);
  });

  it("move só o que cabe e deixa o resto pendente", () => {
    const { estado: novo, transferidos } = alocarCargoNaUnidade(estado(), "c1|comum", "u2");

    expect(transferidos).toBe(10);
    expect(novo.cargos.find((c) => c.id === "c1|comum")!.naoAlocados).toBe(35);
    expect(totalAlocado(novo.unidades.find((u) => u.id === "u2")!)).toBe(10);
  });

  it("soma no bloco existente em vez de criar um segundo do mesmo cargo", () => {
    const primeiro = alocarCargoNaUnidade(estado(), "c1|comum", "u2").estado; // enche u2 (10)
    // devolve 5 à mão para haver espaço e repetir o mesmo cargo na mesma unidade
    const comEspaco: EstadoAlocacao = {
      ...primeiro,
      unidades: primeiro.unidades.map((u) =>
        u.id === "u2"
          ? {
              ...u,
              alocacoesPorCargo: [
                {
                  blocoId: "c1|comum",
                  cargoId: "c1",
                  nome: "Professor",
                  bloco: "comum" as const,
                  quantidade: 5,
                  ordem: 1,
                },
              ],
            }
          : u,
      ),
    };

    const { estado: novo, transferidos } = alocarCargoNaUnidade(comEspaco, "c1|comum", "u2");

    expect(transferidos).toBe(5);
    expect(novo.unidades.find((u) => u.id === "u2")!.alocacoesPorCargo).toEqual([
      { blocoId: "c1|comum", cargoId: "c1", nome: "Professor", bloco: "comum", quantidade: 10, ordem: 1 },
    ]);
    // Repetir cargo+unidade NÃO gasta ordem nova: o bloco cresce, não nasce outro.
    expect(novo.proximaOrdem).toBe(comEspaco.proximaOrdem);
  });

  it("não transfere nada em unidade cheia, e devolve o MESMO estado", () => {
    const cheia = alocarCargoNaUnidade(estado(), "c1|comum", "u2").estado;
    const r = alocarCargoNaUnidade(cheia, "c2|comum", "u2");

    expect(r.transferidos).toBe(0);
    expect(r.estado).toBe(cheia); // identidade: quem chama usa isso para não animar sucesso
  });

  it("ignora cargo ou unidade inexistente", () => {
    expect(alocarCargoNaUnidade(estado(), "inexistente", "u1").transferidos).toBe(0);
    expect(alocarCargoNaUnidade(estado(), "c1|comum", "inexistente").transferidos).toBe(0);
  });
});

describe("devolverParaPendentes", () => {
  it("devolve o bloco inteiro e some com ele da unidade", () => {
    const alocado = alocarCargoNaUnidade(estado(), "c1|comum", "u1").estado;
    const { estado: novo, devolvidos } = devolverParaPendentes(alocado, "c1|comum", "u1");

    expect(devolvidos).toBe(45);
    expect(novo.cargos.find((c) => c.id === "c1|comum")!.naoAlocados).toBe(45);
    expect(totalAlocado(novo.unidades.find((u) => u.id === "u1")!)).toBe(0);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocacoesPorCargo).toEqual([]);
  });

  it("⭐ CONTROLE POSITIVO: devolve SÓ o bloco pedido, com dois cargos na mesma unidade", () => {
    const comDois = alocarCargoNaUnidade(
      alocarCargoNaUnidade(estado(), "c1|comum", "u1").estado,
      "c2|comum",
      "u1",
    ).estado;
    expect(totalAlocado(comDois.unidades.find((u) => u.id === "u1")!)).toBe(53);

    const { estado: novo, devolvidos } = devolverParaPendentes(comDois, "c1|comum", "u1");

    expect(devolvidos).toBe(45);
    expect(totalAlocado(novo.unidades.find((u) => u.id === "u1")!)).toBe(8);
    expect(novo.unidades.find((u) => u.id === "u1")!.alocacoesPorCargo).toEqual([
      { blocoId: "c2|comum", cargoId: "c2", nome: "Merendeira", bloco: "comum", quantidade: 8, ordem: 2 },
    ]);
    expect(novo.cargos.find((c) => c.id === "c2|comum")!.naoAlocados).toBe(0);
  });

  it("devolver o que ficou parcial repõe só a parte alocada", () => {
    const parcial = alocarCargoNaUnidade(estado(), "c1|comum", "u2").estado; // 10 de 45
    const { estado: novo, devolvidos } = devolverParaPendentes(parcial, "c1|comum", "u2");

    expect(devolvidos).toBe(10);
    expect(novo.cargos.find((c) => c.id === "c1|comum")!.naoAlocados).toBe(45);
  });

  it("ignora bloco que não existe naquela unidade", () => {
    const alocado = alocarCargoNaUnidade(estado(), "c1|comum", "u1").estado;
    const r = devolverParaPendentes(alocado, "c1|comum", "u2");

    expect(r.devolvidos).toBe(0);
    expect(r.estado).toBe(alocado);
  });

  it("ida e volta não perde nem inventa gente", () => {
    const inicial = estado();
    const total = inicial.cargos.reduce((s, c) => s + c.naoAlocados, 0); // 45+4+3+8

    const ida = alocarCargoNaUnidade(inicial, "c1|comum", "u2").estado; // parcial: 10 de 45
    const volta = devolverParaPendentes(ida, "c1|comum", "u2").estado;

    expect(volta.cargos.reduce((s, c) => s + c.naoAlocados, 0)).toBe(total);
    expect(volta.unidades.every((u) => totalAlocado(u) === 0)).toBe(true);
  });
});

describe("🔴 os TRÊS blocos do mesmo cargo são estoques DISJUNTOS", () => {
  it("soltar os TRÊS na mesma unidade cria três blocos, não um só", () => {
    let e = estado();
    e = alocarCargoNaUnidade(e, "c1|comum", "u1").estado; // 45 comuns
    e = alocarCargoNaUnidade(e, "c1|pcd", "u1").estado; // 4 PCD
    e = alocarCargoNaUnidade(e, "c1|sala_especial", "u1").estado; // 3 com pedido escrito

    const blocos = e.unidades.find((u) => u.id === "u1")!.alocacoesPorCargo;
    expect(blocos).toHaveLength(3);
    expect(blocos.map((b) => [b.blocoId, b.quantidade, b.bloco])).toEqual([
      ["c1|comum", 45, "comum"],
      ["c1|pcd", 4, "pcd"],
      ["c1|sala_especial", 3, "sala_especial"],
    ]);
    // Cada um gastou uma ordem: no plano são três entradas, e cada uma abre sala nova.
    expect(totalAlocado(e.unidades.find((u) => u.id === "u1")!)).toBe(52);
  });

  it("⭐ CONTROLE POSITIVO: devolver o bloco PCD não mexe nos outros dois", () => {
    let e = estado();
    e = alocarCargoNaUnidade(e, "c1|comum", "u1").estado;
    e = alocarCargoNaUnidade(e, "c1|pcd", "u1").estado;
    e = alocarCargoNaUnidade(e, "c1|sala_especial", "u1").estado;

    const { estado: novo, devolvidos } = devolverParaPendentes(e, "c1|pcd", "u1");

    expect(devolvidos).toBe(4);
    // Sobram os DOIS outros blocos, intactos e na ordem de arrasto original.
    expect(
      novo.unidades
        .find((u) => u.id === "u1")!
        .alocacoesPorCargo.map((b) => [b.blocoId, b.quantidade, b.ordem]),
    ).toEqual([
      ["c1|comum", 45, 1],
      ["c1|sala_especial", 3, 3],
    ]);
    // Só o estoque de PCD voltou; os outros dois seguem zerados.
    expect(novo.cargos.find((c) => c.id === "c1|pcd")!.naoAlocados).toBe(4);
    expect(novo.cargos.find((c) => c.id === "c1|comum")!.naoAlocados).toBe(0);
    expect(novo.cargos.find((c) => c.id === "c1|sala_especial")!.naoAlocados).toBe(0);
  });

  it("o plano marca cada entrada com o bloco de onde ela veio", () => {
    let e = estado();
    e = alocarCargoNaUnidade(e, "c1|pcd", "u2").estado; // especiais primeiro
    e = alocarCargoNaUnidade(e, "c1|comum", "u1").estado;

    expect(montarPlano(e)).toEqual([
      { cargo_id: "c1", unidade_id: "u2", quantidade: 4, bloco: "pcd" },
      { cargo_id: "c1", unidade_id: "u1", quantidade: 45, bloco: "comum" },
    ]);
  });
});

describe("estadoDoBloco — os dois zeros dizem coisas OPOSTAS", () => {
  it("distingue 'nunca teve ninguém' de 'você já arrastou todos'", () => {
    expect(estadoDoBloco(40, 40)).toBe("disponivel");
    expect(estadoDoBloco(12, 40)).toBe("disponivel"); // parcialmente arrastado
    expect(estadoDoBloco(0, 0)).toBe("sem-inscritos"); // o bloco nunca teve gente
    expect(estadoDoBloco(0, 40)).toBe("todos-alocados"); // tinha 40, todos no rascunho
  });
});

describe("agruparPorCargo — um container por cargo", () => {
  it("🔴 mantém o bloco ZERADO no grupo: o card vazio é informação", () => {
    const e = alocarCargoNaUnidade(estado(), "c1|pcd", "u1").estado; // zera o PCD do c1
    const grupos = agruparPorCargo(e.cargos);

    const c1 = grupos.find((g) => g.chave === "c1")!;
    expect(c1.blocos).toHaveLength(3);
    expect(c1.blocos.find((b) => b.bloco === "pcd")!.naoAlocados).toBe(0);
  });

  it("🔴 `total` NÃO desce com o arrasto — é ele que separa os dois zeros", () => {
    // "sem inscritos" (nunca teve ninguém) e "todos alocados" (você já os arrastou) são
    // o mesmo `naoAlocados === 0`. Só o `total` parado distingue, e a tela mente num dos
    // dois casos se ele acompanhar o arrasto.
    const e = alocarCargoNaUnidade(estado(), "c1|pcd", "u1").estado;
    const pcd = e.cargos.find((c) => c.id === "c1|pcd")!;

    expect(pcd.naoAlocados).toBe(0);
    expect(pcd.total).toBe(4);

    // E devolver repõe `naoAlocados` sem mexer no total.
    const volta = devolverParaPendentes(e, "c1|pcd", "u1").estado;
    const depois = volta.cargos.find((c) => c.id === "c1|pcd")!;
    expect(depois.naoAlocados).toBe(4);
    expect(depois.total).toBe(4);
  });

  it("ordena os blocos PCD → sala especial → demais, e preserva a ordem dos cargos", () => {
    const grupos = agruparPorCargo(estado().cargos);

    expect(grupos.map((g) => g.chave)).toEqual(["c1", "c2"]);
    expect(grupos[0].blocos.map((b) => b.bloco)).toEqual(["pcd", "sala_especial", "comum"]);
    expect(grupos[0].nome).toBe("Professor");
  });

  it("cargo nulo vira a chave 'sem-cargo' em vez de sumir", () => {
    const grupos = agruparPorCargo([
      { id: "x", cargoId: null, nome: "(sem cargo)", bloco: "comum", naoAlocados: 2, total: 2 },
    ]);
    expect(grupos[0].chave).toBe("sem-cargo");
  });
});

describe("montarPlano — o payload que a RPC recebe", () => {
  it("🔴 respeita a ORDEM DE ARRASTO, e ela atravessa unidades", () => {
    // A ordem decide quem cai onde quando um cargo se divide: a 1ª entrada leva os
    // primeiros N alfabéticos, a 2ª os N seguintes. Achatar por unidade perderia isso.
    let e = estado();
    e = alocarCargoNaUnidade(e, "c1|comum", "u2").estado; // 1º arrasto: c1 → u2 (10, o que cabe)
    e = alocarCargoNaUnidade(e, "c2|comum", "u1").estado; // 2º arrasto: c2 → u1
    e = alocarCargoNaUnidade(e, "c1|comum", "u1").estado; // 3º arrasto: c1 → u1 (o resto)

    expect(montarPlano(e)).toEqual([
      { cargo_id: "c1", unidade_id: "u2", quantidade: 10, bloco: "comum" },
      { cargo_id: "c2", unidade_id: "u1", quantidade: 8, bloco: "comum" },
      { cargo_id: "c1", unidade_id: "u1", quantidade: 35, bloco: "comum" },
    ]);
  });

  it("devolver um bloco tira a entrada e NÃO reordena os que ficaram", () => {
    let e = estado();
    e = alocarCargoNaUnidade(e, "c1|comum", "u2").estado; // ordem 1
    e = alocarCargoNaUnidade(e, "c2|comum", "u1").estado; // ordem 2
    e = devolverParaPendentes(e, "c1|comum", "u2").estado;
    e = alocarCargoNaUnidade(e, "c1|comum", "u1").estado; // ordem 3 — depois do c2

    expect(montarPlano(e)).toEqual([
      { cargo_id: "c2", unidade_id: "u1", quantidade: 8, bloco: "comum" },
      { cargo_id: "c1", unidade_id: "u1", quantidade: 45, bloco: "comum" },
    ]);
  });

  it("rascunho vazio vira plano vazio (a RPC recusa com AL008, e é a tela que evita)", () => {
    expect(montarPlano(estado())).toEqual([]);
  });

  it("totalNoPlano e totalForaDoPlano somam o rascunho e o que sobrou", () => {
    const e = alocarCargoNaUnidade(estado(), "c1|comum", "u2").estado; // 10 dos 45
    expect(totalNoPlano(e)).toBe(10);
    expect(totalForaDoPlano(e)).toBe(50); // 35 do c1 comum + 4 PCD + 3 sala especial + 8 do c2
  });
});

describe("vagasRestantes", () => {
  it("nunca é negativa, mesmo se a ocupação manual passar da capacidade", () => {
    // Dado incoerente não pode virar número negativo na tela — ele viraria "vagas" ao ser
    // somado com outra unidade.
    expect(
      vagasRestantes({
        id: "x",
        nome: "X",
        salas: [{ id: "s1", capacidade: 10, ocupadasManuais: 15 }],
        alocacoesPorCargo: [],
      }),
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


describe("🔴 simularEmpacotamento — a regra que a tela ignorava até 2026-08-05", () => {
  const unidade = (salas: { id: string; capacidade: number; ocupadasManuais: number }[], blocos: {
    blocoId: string;
    quantidade: number;
    ordem: number;
  }[]) => ({
    id: "u",
    nome: "U",
    salas,
    alocacoesPorCargo: blocos.map((b) => ({
      blocoId: b.blocoId,
      cargoId: "c",
      nome: "C",
      bloco: "comum" as const,
      quantidade: b.quantidade,
      ordem: b.ordem,
    })),
  });

  it("⭐ REPRODUZ o caso real da unidade CGV (16 salas × 30 = 480)", () => {
    // Este é o bug relatado com captura de tela em 05/08. A UI oferecia 480 − 328 = 152
    // para o terceiro bloco; o banco tinha 120 e recusou com AL004 depois de tudo montado.
    // As 32 de diferença são a sobra das duas salas de fronteira.
    const cgv = unidade(salasDe(16, 30), [
      { blocoId: "geografia", quantidade: 322, ordem: 1 },
      { blocoId: "ingles-pcd", quantidade: 6, ordem: 2 },
    ]);

    const r = simularEmpacotamento(cgv);

    expect(r.vagasUteis).toBe(120); // o número EXATO da recusa do banco
    expect(r.ociosas).toBe(32); //     8 na 11ª sala + 24 na 12ª
    expect(vagasTotais(cgv)).toBe(480); // a soma crua, que NÃO é o que cabe
  });

  it("um bloco que fecha a sala exata não deixa ociosidade", () => {
    // 20 em salas de 10 = duas salas cheias; o ponteiro vai para a 3ª sem desperdiçar.
    const r = simularEmpacotamento(
      unidade(salasDe(5, 10), [{ blocoId: "a", quantidade: 20, ordem: 1 }]),
    );
    expect(r.ociosas).toBe(0);
    expect(r.vagasUteis).toBe(30);
  });

  it("bloco de 1 pessoa gasta a sala inteira", () => {
    // É a regra, não um defeito: sala não se divide entre blocos.
    const r = simularEmpacotamento(
      unidade(salasDe(3, 10), [{ blocoId: "a", quantidade: 1, ordem: 1 }]),
    );
    expect(r.ociosas).toBe(9);
    expect(r.vagasUteis).toBe(20);
  });

  it("a ORDEM dos blocos muda a ociosidade", () => {
    const crescente = simularEmpacotamento(
      unidade(salasDe(4, 10), [
        { blocoId: "a", quantidade: 1, ordem: 1 },
        { blocoId: "b", quantidade: 10, ordem: 2 },
      ]),
    );
    const decrescente = simularEmpacotamento(
      unidade(salasDe(4, 10), [
        { blocoId: "b", quantidade: 10, ordem: 1 },
        { blocoId: "a", quantidade: 1, ordem: 2 },
      ]),
    );

    // 1+10: a 1ª sala perde 9, a 2ª fecha exata → 9 ociosas.
    expect(crescente.ociosas).toBe(9);
    // 10+1: a 1ª fecha exata, a 2ª perde 9 → mesma sobra, mas o ponteiro é outro.
    expect(decrescente.ociosas).toBe(9);
    expect(crescente.vagasUteis).toBe(20);
    expect(decrescente.vagasUteis).toBe(20);
  });

  it("alocação MANUAL de base encolhe a sala, sem gastar o bloco todo", () => {
    const salas = salasDe(3, 10);
    salas[0].ocupadasManuais = 4;

    const r = simularEmpacotamento(unidade(salas, [{ blocoId: "a", quantidade: 6, ordem: 1 }]));

    // O bloco enche o que restava da 1ª sala (6) e o ponteiro vai para a 2ª: 0 ociosas.
    expect(r.ociosas).toBe(0);
    expect(r.vagasUteis).toBe(20);
  });

  it("⭐ CONTROLE: sem bloco nenhum, tudo é útil e nada é ocioso", () => {
    const r = simularEmpacotamento(unidade(salasDe(16, 30), []));
    expect(r.vagasUteis).toBe(480);
    expect(r.ociosas).toBe(0);
  });
});
