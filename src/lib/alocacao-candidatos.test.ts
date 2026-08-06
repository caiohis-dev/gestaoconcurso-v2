import { describe, expect, it } from "vitest";
import { mensagemErroAlocacao, agruparSalasComVagaPorUnidade } from "./alocacao-candidatos";

describe("mensagemErroAlocacao", () => {
  it("traduz o 23505 da chave (prova, candidato): já alocado", () => {
    // O nome do índice vem da migration 20260804225156. Renomeá-lo lá sem mexer aqui
    // devolve ao usuário o 'duplicate key value violates' cru.
    expect(
      mensagemErroAlocacao({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "candidatos_alocacao_prova_candidato_key"',
      }),
    ).toMatch(/já está alocado/i);
  });

  it("traduz a recusa da RLS para papel", () => {
    expect(
      mensagemErroAlocacao({
        code: "42501",
        message: 'new row violates row-level security policy for table "candidatos_alocacao"',
      }),
    ).toMatch(/administrador/i);
  });

  it("⭐ CONTROLE: as recusas que o banco já explica passam INTACTAS", () => {
    // PF001, AL004, AL005, AL006 chegam em português nomeando o que fazer — traduzi-las
    // aqui trocaria uma explicação por um genérico, que é o defeito ao contrário.
    const doBanco = [
      'A prova "Edital 001/2026 SMA" está finalizada: a alocação de candidatos não pode mais ser alterada. Reabra a prova para editar.',
      "A sala está lotada (30 de 30 lugares ocupados). Escolha outra sala ou aumente a capacidade desta.",
      "O candidato não é do edital desta prova. A alocação foi recusada.",
      'Faltou espaço ao alocar o cargo "DOCENTE II": precisa de 40 vaga(s) e restam 39 (cargo novo começa em sala nova, e as salas não se dividem entre cargos). Vincule mais unidades à prova ou aumente capacidades. Nada foi alterado.',
    ];
    for (const message of doBanco) {
      expect(mensagemErroAlocacao({ message })).toBe(message);
    }
  });

  it("erro vazio ganha um fallback em vez de toast em branco", () => {
    expect(mensagemErroAlocacao({ message: "  " })).toBe("Erro ao alterar a alocação");
  });
});

describe("agruparSalasComVagaPorUnidade", () => {
  // Os nomes e siglas são os REAIS do banco local, escolhidos porque expõem o conflito:
  // por sigla a ordem seria CGV → ICT → UGB; por nome é UGB → CGV → ICT.
  const unidades = [
    { unidade_id: "u-ugb", sigla: "UGB     ", nome: "CENTRO UNIV. GERALDO DI BIASE" },
    { unidade_id: "u-cgv", sigla: "CGV", nome: "COLÉGIO GETÚLIO VARGAS" },
    { unidade_id: "u-ict", sigla: "ICT", nome: "INSTITUTO DE CULTURA TÉCNICA" },
  ];

  const sala = (
    id: string,
    unidade: string,
    numero: number,
    andar: number | null,
    capacidade = 30,
  ) => ({
    id,
    sala_fk_unidade: unidade,
    sala_numero: numero,
    sala_andar: andar,
    sala_capacidade: capacidade,
  });

  it("🔴 ordena as unidades por NOME, não por sigla", () => {
    const grupos = agruparSalasComVagaPorUnidade(
      [sala("a", "u-ict", 1, 1), sala("b", "u-cgv", 1, 1), sala("c", "u-ugb", 1, 1)],
      unidades,
      {},
    );

    // Por sigla seria CGV, ICT, UGB. Por nome — a chave que o banco usa — é esta:
    expect(grupos.map((g) => g.sigla)).toEqual(["UGB", "CGV", "ICT"]);
  });

  it("dentro da unidade: andar e depois número, com andar nulo POR ÚLTIMO", () => {
    const grupos = agruparSalasComVagaPorUnidade(
      [
        sala("s205", "u-cgv", 205, 2),
        sala("sNull", "u-cgv", 5, null),
        sala("s102", "u-cgv", 102, 1),
        sala("s101", "u-cgv", 101, 1),
      ],
      unidades,
      {},
    );

    expect(grupos[0].salas.map((s) => s.id)).toEqual(["s101", "s102", "s205", "sNull"]);
  });

  it("⭐ CONTROLE: sala CHEIA não entra, e unidade que ficou sem vaga some do seletor", () => {
    // Oferecer sala cheia é oferecer um AL006 — a recusa do banco no clique.
    const grupos = agruparSalasComVagaPorUnidade(
      [sala("cheia", "u-cgv", 101, 1, 30), sala("livre", "u-ict", 1, 1, 30)],
      unidades,
      { cheia: 30, livre: 29 },
    );

    expect(grupos.map((g) => g.unidadeId)).toEqual(["u-ict"]);
    expect(grupos[0].salas.map((s) => s.id)).toEqual(["livre"]);
  });

  it("unidade sem dado carregado NÃO some: sumir esconderia salas com vaga", () => {
    const grupos = agruparSalasComVagaPorUnidade([sala("x", "u-desconhecida", 1, 1)], [], {});

    expect(grupos).toHaveLength(1);
    expect(grupos[0].nome).toBe("(unidade não carregada)");
    expect(grupos[0].sigla).toBe("?");
  });

  it("a sigla chega com espaços do char(n) e sai limpa", () => {
    const grupos = agruparSalasComVagaPorUnidade([sala("x", "u-ugb", 1, 1)], unidades, {});
    expect(grupos[0].sigla).toBe("UGB");
  });
});
