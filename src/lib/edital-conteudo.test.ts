/**
 * O conteúdo programático e o cruzamento com a matriz da prova.
 *
 * 🎯 **O controle desta bateria é um defeito PUBLICADO**, não inventado: o Anexo I do
 * Edital 003/2026 escreve `LESGISLAÇÃO DO SUS` enquanto o corpo cobra `Legislação do SUS`.
 * O erro aparece duas vezes no anexo porque o bloco foi copiado de um cargo para o outro.
 */
import { describe, it, expect } from "vitest";
import {
  conferirConteudo,
  coberturaPorCargo,
  ementasDoCargo,
  chaveDeDisciplina,
  type Ementa,
  type DisciplinaDaProva,
} from "@/lib/edital-conteudo";

let seq = 0;
const comum = (nome: string, texto = "Ementa."): Ementa => ({
  id: `e${seq++}`, cargo_id: null, aplica_a_todos_os_cargos: true,
  nome_disciplina: nome, texto_ementa: texto,
});
const doCargo = (cargoId: string, nome: string, texto = "Ementa."): Ementa => ({
  id: `e${seq++}`, cargo_id: cargoId, aplica_a_todos_os_cargos: false,
  nome_disciplina: nome, texto_ementa: texto,
});
const naProva = (cargoId: string, nomeDoCargo: string, nome: string): DisciplinaDaProva => ({
  edital_cargo_id: `ec-${cargoId}`, cargo_id: cargoId, nomeDoCargo, nome_disciplina: nome,
});

/** A matriz do Edital 003: dois cargos, três disciplinas cada. */
const MATRIZ_003: DisciplinaDaProva[] = [
  naProva("enf", "Enfermeiro", "Língua Portuguesa"),
  naProva("enf", "Enfermeiro", "Legislação do SUS"),
  naProva("enf", "Enfermeiro", "Conhecimentos Específicos"),
  naProva("tec", "Técnico em Enfermagem", "Língua Portuguesa"),
  naProva("tec", "Técnico em Enfermagem", "Legislação do SUS"),
  naProva("tec", "Técnico em Enfermagem", "Conhecimentos Específicos"),
];

/** O Anexo I do 003 como DEVERIA estar: 2 comuns + 2 específicas. */
const ANEXO_003_CORRETO: Ementa[] = [
  comum("Língua Portuguesa", "Compreensão e interpretação de textos."),
  comum("Legislação do SUS", "Lei nº 8.080/1990 — princípios e diretrizes."),
  doCargo("enf", "Conhecimentos Específicos", "Ementa do Enfermeiro."),
  doCargo("tec", "Conhecimentos Específicos", "Ementa do Técnico."),
];

const regras = (ementas: Ementa[], disciplinas = MATRIZ_003) =>
  conferirConteudo({ ementas, disciplinas }).map((a) => a.regra);

describe("⭐ CONTROLE POSITIVO: o Anexo I do Edital 003", () => {
  it("🎯 o anexo correto não acusa nada", () => {
    expect(conferirConteudo({ ementas: ANEXO_003_CORRETO, disciplinas: MATRIZ_003 })).toEqual([]);
  });

  it("⭐ CONTROLE: anexo ainda VAZIO não acusa", () => {
    // Edital novo começa sem anexo. Acusar desde o primeiro minuto ensina a ignorar o
    // painel — é a mesma escolha das fatias 6 e 8.
    expect(conferirConteudo({ ementas: [], disciplinas: MATRIZ_003 })).toEqual([]);
  });

  it("a ementa COMUM vale para os dois cargos", () => {
    expect(ementasDoCargo(ANEXO_003_CORRETO, "enf").map((e) => e.nome_disciplina)).toEqual([
      "Língua Portuguesa", "Legislação do SUS", "Conhecimentos Específicos",
    ]);
    expect(ementasDoCargo(ANEXO_003_CORRETO, "tec")).toHaveLength(3);
  });
});

describe("🎯 O DEFEITO PUBLICADO: LESGISLAÇÃO DO SUS", () => {
  /** O anexo como o Edital 003 o publicou, com o erro de digitação. */
  const ANEXO_COM_O_ERRO: Ementa[] = [
    comum("Língua Portuguesa"),
    comum("LESGISLAÇÃO DO SUS", "Lei nº 8.080/1990."),
    doCargo("enf", "Conhecimentos Específicos"),
    doCargo("tec", "Conhecimentos Específicos"),
  ];

  it("🔴 acusa nas DUAS direções, e o par é a assinatura do defeito", () => {
    const avisos = conferirConteudo({ ementas: ANEXO_COM_O_ERRO, disciplinas: MATRIZ_003 });
    const rs = avisos.map((a) => a.regra);
    // Uma disciplina sem ementa (por cargo) e uma ementa sem disciplina: são a MESMA
    // coisa escrita de dois jeitos, e é o par que denuncia o erro de digitação.
    expect(rs.filter((r) => r === "disciplina-sem-ementa")).toHaveLength(2);
    expect(rs.filter((r) => r === "ementa-sem-disciplina")).toHaveLength(1);
    expect(avisos.every((a) => a.severidade === "erro")).toBe(true);
  });

  it("a mensagem nomeia a disciplina que ficou sem programa", () => {
    const avisos = conferirConteudo({ ementas: ANEXO_COM_O_ERRO, disciplinas: MATRIZ_003 });
    expect(avisos[0].mensagem).toContain("Legislação do SUS");
    expect(avisos.at(-1)!.mensagem).toContain("LESGISLAÇÃO DO SUS");
  });

  it("🔴 CONTROLE: a mesma disciplina com ACENTO OU CAIXA diferente NÃO acusa", () => {
    // É a divergência mais comum entre corpo e anexo de um PDF, e acusá-la encheria o
    // painel de falso positivo. O "LESGISLAÇÃO" continua sendo pego porque tem uma letra
    // a mais — que sobrevive a qualquer normalização.
    expect(regras([comum("LEGISLACAO DO SUS"), comum("lingua  portuguesa"),
                   doCargo("enf", "Conhecimentos Específicos"),
                   doCargo("tec", "CONHECIMENTOS ESPECIFICOS")])).toEqual([]);
  });
});

describe("a cobertura por cargo", () => {
  it("🎯 separa o que tem ementa do que não tem", () => {
    const c = coberturaPorCargo(MATRIZ_003, [comum("Língua Portuguesa")]);
    expect(c).toHaveLength(2);
    expect(c[0].nomeDoCargo).toBe("Enfermeiro");
    expect(c[0].comEmenta).toEqual(["Língua Portuguesa"]);
    expect(c[0].semEmenta).toEqual(["Legislação do SUS", "Conhecimentos Específicos"]);
  });

  it("🔴 a ementa ESPECÍFICA de um cargo não cobre o outro", () => {
    // Sem isto, "Conhecimentos Específicos" do Enfermeiro contaria como programa do
    // Técnico — e o anexo sairia faltando um bloco inteiro sem ninguém acusar.
    const c = coberturaPorCargo(MATRIZ_003, [doCargo("enf", "Conhecimentos Específicos")]);
    expect(c.find((x) => x.cargo_id === "enf")!.comEmenta).toEqual(["Conhecimentos Específicos"]);
    expect(c.find((x) => x.cargo_id === "tec")!.comEmenta).toEqual([]);
  });

  it("matriz vazia devolve cobertura vazia, sem cargo fantasma", () => {
    expect(coberturaPorCargo([], ANEXO_003_CORRETO)).toEqual([]);
  });
});

describe("as outras regras", () => {
  it("🎯 acusa disciplina da prova sem ementa nenhuma", () => {
    const a = conferirConteudo({
      ementas: [comum("Língua Portuguesa")], disciplinas: MATRIZ_003,
    });
    expect(a.map((x) => x.regra)).toEqual(["disciplina-sem-ementa", "disciplina-sem-ementa"]);
    expect(a[0].mensagem).toContain("Enfermeiro");
  });

  it("🎯 acusa ementa comum REPETIDA por cargo com texto idêntico, como aviso", () => {
    // É o que o Edital 003 faz — Português idêntico byte a byte nos dois cargos. É
    // redundância, não incoerência; mas é ela que propaga o erro de digitação.
    const a = conferirConteudo({
      ementas: [...ANEXO_003_CORRETO,
                doCargo("enf", "Língua Portuguesa", "Compreensão e interpretação de textos.")],
      disciplinas: MATRIZ_003,
    });
    expect(a.map((x) => x.regra)).toEqual(["ementa-repetida-identica"]);
    expect(a[0].severidade).toBe("aviso");
  });

  it("⭐ CONTROLE NEGATIVO: mesma disciplina com texto DIFERENTE não acusa", () => {
    // É legítimo e o Edital 002 faz: "LÍNGUA PORTUGUESA (comum a todos)" e também
    // "DOCENTE I – LÍNGUA PORTUGUESA", que é a específica daquele cargo.
    expect(
      regras([...ANEXO_003_CORRETO,
              doCargo("enf", "Língua Portuguesa", "Ementa específica, outro texto.")]),
    ).toEqual([]);
  });

  it("⭐ CONTROLE: sem matriz da prova, não há o que cruzar", () => {
    // A fatia 5 pode não estar preenchida ainda. Acusar todas as ementas de "não existem
    // na prova" seria acusar a ordem em que o usuário decidiu trabalhar.
    expect(conferirConteudo({ ementas: ANEXO_003_CORRETO, disciplinas: [] })).toEqual([]);
  });
});

describe("chaveDeDisciplina", () => {
  it("ignora acento, caixa e espaço duplicado", () => {
    expect(chaveDeDisciplina("Legislação do SUS")).toBe(chaveDeDisciplina("LEGISLACAO DO SUS"));
    expect(chaveDeDisciplina("  Língua   Portuguesa ")).toBe("lingua portuguesa");
  });

  it("🔴 mas NÃO ignora letra a mais — é o que pega o LESGISLAÇÃO", () => {
    expect(chaveDeDisciplina("LESGISLAÇÃO DO SUS")).not.toBe(chaveDeDisciplina("Legislação do SUS"));
  });
});
