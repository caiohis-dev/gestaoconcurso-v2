/**
 * O marcador de dado variável `{{campo:chave}}`.
 *
 * ⭐ **O controle positivo são os valores REAIS do Edital 004/2026** — a sede da FEVRE, o
 * site, o signatário e as datas do cronograma, como publicados.
 *
 * 🔴 E o teste que mais importa aqui não é de resolução, é de CATÁLOGO: nenhuma chave
 * pode terminar em `_inicio` ou `_fim`. Esse par existiria para uma etapa de INTERVALO e
 * seria copiado para uma de ALTERNATIVAS — e aí o documento passaria a dizer "de 22 a 23
 * de julho" onde o edital oferece "22 OU 23". A frase é plausível, e é por isso que só um
 * teste a pega.
 */
import { describe, it, expect } from "vitest";
import {
  CAMPOS_CATALOGO,
  CAMPO_POR_CHAVE,
  camposDoTexto,
  resolverCampos,
  formatarDataExtenso,
  formatarHora,
  formatarMoeda,
  formatarInteiro,
  formatarTexto,
} from "@/lib/edital-campos";
import { ETAPAS_SUGERIDAS } from "@/lib/edital-cronograma";

/** Os valores do Edital 004/2026, como publicados. */
const VALORES_004 = new Map<string, string>([
  ["numero_edital", "004/2026"],
  ["entidade_executora", "Fundação Educacional de Volta Redonda – FEVRE"],
  ["executora_endereco", "Rua 154, nº 783, Laranjal, Volta Redonda/RJ"],
  ["site_oficial", "www.voltaredonda.rj.gov.br/concursopublico"],
  ["signatario_nome", "Cláudio dos Santos Franco"],
  ["signatario_cargo", "Secretário Municipal de Administração"],
  ["cronograma_prova_objetiva", "20/09/2026"],
  ["cronograma_inscricoes", "29/06/2026 a 27/07/2026"],
]);

describe("resolverCampos", () => {
  it("troca o marcador pelo valor", () => {
    expect(resolverCampos("O Gabarito será divulgado em {{campo:cronograma_divulgacao_gabarito}}.", new Map([["cronograma_divulgacao_gabarito", "20/09/2026"]])))
      .toBe("O Gabarito será divulgado em 20/09/2026.");
  });

  it("resolve vários marcadores no mesmo texto", () => {
    const t = "Entregue na {{campo:entidade_executora}}, situada à {{campo:executora_endereco}}.";
    expect(resolverCampos(t, VALORES_004)).toBe(
      "Entregue na Fundação Educacional de Volta Redonda – FEVRE, situada à Rua 154, nº 783, Laranjal, Volta Redonda/RJ.",
    );
  });

  it("🔴 o que não resolve vira marcador VISÍVEL, nunca some", () => {
    expect(resolverCampos("previstas para {{campo:cronograma_prova_objetiva}}", new Map()))
      .toBe("previstas para [?campo:cronograma_prova_objetiva]");
  });

  it("🔴 valor VAZIO é tratado como ausente — o buraco invisível é pior que o marcador", () => {
    // Quem monta o mapa nunca põe "" nele; este teste guarda o caso de alguém pôr.
    expect(resolverCampos("em {{campo:site_oficial}}", new Map([["site_oficial", ""]])))
      .toBe("em [?campo:site_oficial]");
  });

  it("um valor que contenha `{{` não vira referência — por isso esta resolução é a última", () => {
    const saida = resolverCampos("Veja {{campo:site_oficial}}.", new Map([["site_oficial", "{{cap:vagas_pcd}}"]]));
    expect(saida).toBe("Veja {{cap:vagas_pcd}}.");
  });

  it("texto sem marcador passa intacto", () => {
    expect(resolverCampos("A inscrição implicará plena aceitação.", VALORES_004))
      .toBe("A inscrição implicará plena aceitação.");
  });
});

describe("camposDoTexto", () => {
  it("acha os campos e diz quais o catálogo conhece", () => {
    const achados = camposDoTexto("{{campo:site_oficial}} e {{campo:nao_existe}}");
    expect(achados).toEqual([
      { chave: "site_oficial", conhecido: true },
      { chave: "nao_existe", conhecido: false },
    ]);
  });

  it("conta a repetição — a sede aparece 7 vezes no Edital 004", () => {
    const t = "{{campo:executora_endereco}} … {{campo:executora_endereco}}";
    expect(camposDoTexto(t)).toHaveLength(2);
  });
});

describe("o catálogo", () => {
  it("não tem chave repetida", () => {
    expect(CAMPO_POR_CHAVE.size).toBe(CAMPOS_CATALOGO.length);
  });

  it("dá exatamente UM campo a cada etapa do cronograma", () => {
    for (const e of ETAPAS_SUGERIDAS) {
      const campo = CAMPO_POR_CHAVE.get(`cronograma_${e.chave}`);
      expect(campo, `etapa ${e.chave} sem campo`).toBeDefined();
      expect(campo!.formato).toBe("periodo");
    }
  });

  it("🔴 NENHUMA chave termina em _inicio ou _fim", () => {
    // Um par `_inicio`/`_fim` só faz sentido para INTERVALO, e seria copiado para uma
    // etapa de ALTERNATIVAS — publicando "de 22 a 23 de julho" onde o edital oferece dois
    // dias à ESCOLHA. O formato `periodo` lê o `tipo` da etapa e torna o par desnecessário.
    const proibidas = CAMPOS_CATALOGO.filter((c) => /_(inicio|fim)$/.test(c.chave));
    expect(proibidas.map((c) => c.chave)).toEqual([]);
  });

  it("todo campo declara onde se preenche — senão a mensagem do linter não é acionável", () => {
    for (const c of CAMPOS_CATALOGO) {
      expect(c.ondeSePreenche.trim(), `campo ${c.chave}`).not.toBe("");
      expect(c.fonte.trim(), `campo ${c.chave}`).not.toBe("");
    }
  });
});

describe("os formatadores", () => {
  it("data por extenso, sem passar por Date", () => {
    // `new Date("2026-06-29")` é UTC e em fuso negativo devolve 28/06. A conta é sobre os
    // números do calendário, como em `diaDaSemana`.
    expect(formatarDataExtenso("2026-06-29")).toBe("29 de junho de 2026");
    expect(formatarDataExtenso("2026-01-01")).toBe("01 de janeiro de 2026");
    expect(formatarDataExtenso("2026-12-31")).toBe("31 de dezembro de 2026");
  });

  it("devolve null para ausente ou inválido, nunca string vazia", () => {
    expect(formatarDataExtenso(null)).toBeNull();
    expect(formatarDataExtenso("")).toBeNull();
    expect(formatarDataExtenso("2026-13-01")).toBeNull();
    expect(formatarMoeda(null)).toBeNull();
    expect(formatarMoeda("")).toBeNull();
    expect(formatarHora(null)).toBeNull();
    expect(formatarInteiro(null)).toBeNull();
    expect(formatarTexto("   ")).toBeNull();
  });

  it("moeda em BRL", () => {
    // O Intl separa `R$` do número com espaço NÃO SEPARÁVEL (U+00A0), não com espaço
    // comum. Escrito como escape de propósito: literal na fonte, o caractere é
    // invisível na revisão e o lint o recusa.
    expect(formatarMoeda(80)).toBe("R$\u00a080,00");
    expect(formatarMoeda("3036")).toBe("R$\u00a03.036,00");
  });

  it("hora nas DUAS formas que o Edital 004 publica", () => {
    expect(formatarHora("16:00:00")).toBe("16 horas");   // "das 9 horas às 16 horas"
    expect(formatarHora("15:30:00")).toBe("15h30");      // "às 15h30"
  });

  it("inteiro e texto", () => {
    expect(formatarInteiro(2)).toBe("2");
    expect(formatarTexto("  FEVRE  ")).toBe("FEVRE");
  });
});
