import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { removerAcentos, ACENTUADOS, SEM_ACENTO } from "@/lib/texto";

describe("removerAcentos", () => {
  it("tira acento e baixa a caixa", () => {
    expect(removerAcentos("José Antônio")).toBe("jose antonio");
    expect(removerAcentos("MARIA DA CONCEIÇÃO")).toBe("maria da conceicao");
  });

  it("é simétrico: com e sem acento chegam ao mesmo lugar", () => {
    // É disto que depende "Jose" achar "José" — os dois lados pousam na mesma string.
    expect(removerAcentos("José")).toBe(removerAcentos("Jose"));
    expect(removerAcentos("SIMEÃO")).toBe(removerAcentos("simeao"));
  });

  it("não mexe em quem não tem acento", () => {
    expect(removerAcentos("ABC123")).toBe("abc123");
    expect(removerAcentos("")).toBe("");
  });

  it("cobre os acentos que EXISTEM no dado real", () => {
    // Medidos em 2026-09-10 sobre `colaboradores.colab_nome_completo` no banco local
    // (cópia de produção): exatamente estes, em 97 dos 771 nomes.
    expect(removerAcentos("áâãçéêíóôõú")).toBe("aaaceeiooou");
  });

  it("os dois mapas têm o mesmo tamanho", () => {
    // Se um crescer sem o outro, `translate` casa posição a posição e a letra sobrando
    // seria simplesmente REMOVIDA — mudando a string, não só o acento.
    expect([...ACENTUADOS]).toHaveLength([...SEM_ACENTO].length);
  });
});

/**
 * 🔴 O par cliente ↔ banco.
 *
 * `removerAcentos` normaliza o termo DIGITADO; a função `colab_nome_busca` do banco
 * normaliza o DADO. Se os dois mapas divergirem, a busca passa a não achar — sem erro,
 * sem log, sem nada. É o formato de defeito que este repo mais teme, e nenhuma outra
 * verificação o pega: a suíte mocka o Supabase e o `docs:conferir` não lê migration.
 */
describe("o mapa do cliente casa com o `translate()` da migration", () => {
  const DIR = join(__dirname, "..", "..", "supabase", "migrations");
  const NOME = "busca_de_colaborador_sem_acento";

  it("acha a migration — se este caso cair, o resto não estaria verificando nada", () => {
    expect(readdirSync(DIR).filter((f) => f.includes(NOME))).toHaveLength(1);
  });

  it("os dois pares de strings são idênticos", () => {
    const arquivo = readdirSync(DIR).find((f) => f.includes(NOME))!;
    const sql = readFileSync(join(DIR, arquivo), "utf8");

    // As duas linhas literais do translate(), na ordem em que aparecem no corpo da função.
    const literais = sql
      .slice(sql.indexOf("SELECT translate("))
      .match(/'([^']+)'/g)
      ?.map((s) => s.slice(1, -1));

    expect(literais?.[0]).toBe(ACENTUADOS);
    expect(literais?.[1]).toBe(SEM_ACENTO);
  });
});
