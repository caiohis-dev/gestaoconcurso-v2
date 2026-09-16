/**
 * O linter do edital — regras determinísticas, sem LLM.
 *
 * 🎯 As duas primeiras regras nascem de defeitos REAIS do Edital 004/2026, já publicado:
 * `"dia XX/xx/2026"` nos itens 12.4 e 14.9, e capítulo que sai incompleto.
 *
 * ⚠️ Cada caso aqui tem o seu CONTROLE NEGATIVO ao lado: provar que a regra acusa é
 * metade; a outra é provar que ela NÃO acusa o texto legítimo. Sem isso, a saída fácil
 * para "o linter pegou" é afrouxar a regra até ela não pegar mais nada.
 */
import { describe, it, expect } from "vitest";
import { analisarEdital, resumoDoLinter } from "@/lib/edital-linter";
import type { CapituloOverride } from "@/lib/edital-numeracao";

/** Todo capítulo padrão preenchido — para isolar a regra sob teste. */
const TUDO_PREENCHIDO: CapituloOverride[] = [
  "preambulo", "disposicoes_preliminares", "quadro_de_cargos", "atribuicoes_dos_cargos",
  "requisitos_investidura", "inscricao_e_pagamento", "isencao_taxa", "vagas_pcd",
  "vagas_cotas_raciais", "comprovante_inscricao", "condicoes_especiais_prova",
  "prova_objetiva", "recursos_prova_objetiva", "desempate_e_resultado",
  "investidura_e_posse", "disposicoes_gerais", "anexos",
].map((chave) => ({ chave, texto: "Texto do capítulo, redigido." }));

const comTexto = (chave: string, texto: string): CapituloOverride[] =>
  TUDO_PREENCHIDO.map((c) => (c.chave === chave ? { ...c, texto } : c));

const regras = (overrides: CapituloOverride[]) =>
  analisarEdital({ overrides }).map((a) => a.regra);

describe("linha de base", () => {
  it("⭐ CONTROLE: edital com todos os capítulos padrão preenchidos não acusa nada", () => {
    // Se este caso acusar, qualquer outro teste deste arquivo vira ruído.
    expect(analisarEdital({ overrides: TUDO_PREENCHIDO })).toEqual([]);
  });
});

describe("placeholder não preenchido — o defeito do Edital 004", () => {
  it("🎯 acusa `dia XX/xx/2026`, que é o texto literal publicado", () => {
    const achados = analisarEdital({
      overrides: comTexto("prova_objetiva", "A prova será aplicada no dia XX/xx/2026."),
    });
    expect(achados).toHaveLength(1);
    expect(achados[0].regra).toBe("placeholder-nao-preenchido");
    expect(achados[0].severidade).toBe("erro");
    expect(achados[0].capitulo).toBe("prova_objetiva");
  });

  it("acusa marcador vazio `[...]` e lembrete de redação", () => {
    expect(regras(comTexto("isencao_taxa", "O prazo é [...]"))).toContain("placeholder-nao-preenchido");
    expect(regras(comTexto("isencao_taxa", "Valor a definir pela banca"))).toContain("placeholder-nao-preenchido");
  });

  it("⭐ CONTROLE NEGATIVO: um X sozinho NÃO é placeholder", () => {
    // Sem isto a regra pegaria "Raio X", "artigo X" e "Anexo X" — e quem redige
    // aprenderia a ignorar o painel, que é o pior resultado possível.
    expect(regras(comTexto("prova_objetiva", "exame de Raio X, conforme o artigo X"))).toEqual([]);
  });

  it("⭐ CONTROLE NEGATIVO: data de verdade não acusa", () => {
    expect(regras(comTexto("prova_objetiva", "A prova será aplicada em 16/03/2026."))).toEqual([]);
  });
});

describe("capítulo incluído e vazio", () => {
  it("acusa como ERRO", () => {
    const achados = analisarEdital({ overrides: comTexto("vagas_pcd", "   ") });
    expect(achados).toHaveLength(1);
    expect(achados[0].regra).toBe("capitulo-vazio");
    expect(achados[0].severidade).toBe("erro");
  });

  it("⭐ CONTROLE NEGATIVO: capítulo DESLIGADO e vazio não acusa vazio", () => {
    // O texto dele não sai no documento. Acusar encheria o painel de pendência sobre
    // conteúdo que ninguém vai publicar.
    const overrides = TUDO_PREENCHIDO.map((c) =>
      c.chave === "vagas_pcd" ? { chave: c.chave, incluido: false, texto: "" } : c,
    );
    expect(regras(overrides)).not.toContain("capitulo-vazio");
  });
});

describe("capítulo padrão desligado", () => {
  it("é AVISO, não erro — desligar é permitido", () => {
    const overrides = TUDO_PREENCHIDO.map((c) =>
      c.chave === "disposicoes_gerais" ? { ...c, incluido: false } : c,
    );
    const achados = analisarEdital({ overrides });
    expect(achados).toHaveLength(1);
    expect(achados[0].regra).toBe("capitulo-padrao-desligado");
    expect(achados[0].severidade).toBe("aviso");
  });

  it("⭐ CONTROLE NEGATIVO: condicional desligado é o padrão dele — não avisa", () => {
    // Territorialidade e títulos nascem desligados. Avisar sobre eles faria todo edital
    // comum abrir com dois avisos falsos.
    expect(regras(TUDO_PREENCHIDO)).toEqual([]);
  });
});

describe("referência cruzada", () => {
  it("acusa referência a capítulo DESLIGADO neste edital", () => {
    const achados = analisarEdital({
      overrides: comTexto("prova_objetiva", "na forma do {{cap:prova_de_titulos}}"),
    });
    expect(achados.map((a) => a.regra)).toEqual(["referencia-a-capitulo-excluido"]);
  });

  it("acusa referência a capítulo que não existe no catálogo", () => {
    const achados = analisarEdital({
      overrides: comTexto("prova_objetiva", "ver {{cap:capitulo_inventado}}"),
    });
    expect(achados.map((a) => a.regra)).toEqual(["referencia-desconhecida"]);
  });

  it("⭐ CONTROLE NEGATIVO: referência que resolve não acusa", () => {
    expect(regras(comTexto("prova_objetiva", "ver {{cap:vagas_pcd}}"))).toEqual([]);
  });

  it("🔴 a MESMA referência deixa de acusar quando o capítulo é ligado", () => {
    // É o par que prova que a regra olha o estado do edital, e não uma lista fixa.
    const texto = "na forma do {{cap:prova_de_titulos}}";
    expect(regras(comTexto("prova_objetiva", texto))).toEqual(["referencia-a-capitulo-excluido"]);

    const comTitulos = comTexto("prova_objetiva", texto).concat({
      chave: "prova_de_titulos",
      incluido: true,
      texto: "Da prova de títulos.",
    });
    expect(regras(comTitulos)).toEqual([]);
  });
});

describe("resumoDoLinter", () => {
  it("separa erro de aviso", () => {
    const overrides = comTexto("prova_objetiva", "no dia XX/xx/2026").map((c) =>
      c.chave === "disposicoes_gerais" ? { ...c, incluido: false } : c,
    );
    expect(resumoDoLinter(analisarEdital({ overrides }))).toEqual({ erros: 1, avisos: 1 });
  });
});
