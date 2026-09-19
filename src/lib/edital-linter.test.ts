/**
 * O linter do edital — regras determinísticas, sem LLM.
 *
 * 🎯 As duas primeiras regras nascem de defeitos REAIS do Edital 004/2026, já publicado:
 * `"dia XX/xx/2026"` nos itens 12.4 e 14.9, e capítulo que sai incompleto.
 *
 * ⚠️ Cada caso aqui tem o seu CONTROLE NEGATIVO ao lado: provar que a regra acusa é
 * metade; a outra é provar que ela NÃO acusa o texto legítimo. Sem isso, a saída fácil
 * para "o linter pegou" é afrouxar a regra até ela não pegar mais nada.
 *
 * 🔵 Desde 16/09 o conteúdo entra como ARTIGOS (`itens`), não como texto de capítulo. A
 * regra `ancora-duplicada` saiu daqui: virou o índice único `edital_itens_ancora_key`, e
 * quem a verifica agora é `docs/bateria-edital-itens.sql`, CASO 2. Testá-la aqui seria
 * afirmar o comportamento de um laço que não existe mais.
 */
import { describe, it, expect } from "vitest";
import { analisarEdital, resumoDoLinter } from "@/lib/edital-linter";
import { CAPITULOS_CATALOGO } from "@/lib/edital-capitulos";
import type { CapituloOverride } from "@/lib/edital-numeracao";
import type { ItemBruto } from "@/lib/edital-itens";

let seq = 0;
const artigo = (capitulo: string, texto: string, extra: Partial<ItemBruto> = {}): ItemBruto => ({
  id: `a${seq++}`,
  capitulo_chave: capitulo,
  ordem: 0,
  nivel: 0,
  tipo: "item",
  texto,
  ancora: null,
  quadro_fonte: null,
  ...extra,
});

/**
 * Um artigo em cada capítulo padrão — para isolar a regra sob teste.
 *
 * ⚠️ Sai do CATÁLOGO, não de uma lista copiada: a lista copiada envelhece calada no dia
 * em que um capítulo padrão entra, e o caso de linha de base passaria a acusar
 * `capitulo-vazio` por um motivo que nada tem a ver com o teste.
 */
const base = (): ItemBruto[] =>
  CAPITULOS_CATALOGO.filter((c) => c.padrao).map((c) =>
    artigo(c.chave, "Texto do capítulo, redigido."),
  );

/** Troca o conteúdo de um capítulo por estes artigos, na ordem dada. */
const comArtigos = (chave: string, ...itens: (string | Partial<ItemBruto>)[]): ItemBruto[] => [
  ...base().filter((i) => i.capitulo_chave !== chave),
  ...itens.map((it, i) =>
    typeof it === "string"
      ? artigo(chave, it, { ordem: i })
      : artigo(chave, it.texto ?? "", { ...it, ordem: i }),
  ),
];

const regras = (itens: ItemBruto[], overrides?: CapituloOverride[]) =>
  analisarEdital({ itens, overrides }).map((a) => a.regra);

describe("linha de base", () => {
  it("⭐ CONTROLE: edital com todos os capítulos padrão preenchidos não acusa nada", () => {
    // Se este caso acusar, qualquer outro teste deste arquivo vira ruído.
    expect(analisarEdital({ itens: base() })).toEqual([]);
  });
});

describe("placeholder não preenchido — o defeito do Edital 004", () => {
  it("🎯 acusa `dia XX/xx/2026`, que é o texto literal publicado", () => {
    const achados = analisarEdital({
      itens: comArtigos("prova_objetiva", "A prova será aplicada no dia XX/xx/2026."),
    });
    expect(achados).toHaveLength(1);
    expect(achados[0].regra).toBe("placeholder-nao-preenchido");
    expect(achados[0].severidade).toBe("erro");
    expect(achados[0].capitulo).toBe("prova_objetiva");
  });

  it("🔴 a mensagem nomeia o ARTIGO, não o capítulo inteiro", () => {
    // É o ganho concreto de o artigo ter virado registro: no Edital 004 o defeito está
    // nos itens 12.4 e 14.9, e a mensagem antiga dizia só "o capítulo Do Cronograma".
    //
    // ⚠️ 11.2, e não 12.2: aqui `prova_objetiva` é o capítulo 11, porque os dois
    // condicionais nascem desligados. No Edital 004 ele é o 12 justamente porque a
    // territorialidade está ligada — é a renumeração que este módulo existe para fazer.
    const achados = analisarEdital({
      itens: comArtigos("prova_objetiva", "Primeiro artigo.", "Aplicada no dia XX/xx/2026."),
    });
    expect(achados).toHaveLength(1);
    expect(achados[0].mensagem).toContain("o item 11.2");
  });

  it("acusa marcador vazio `[...]` e lembrete de redação", () => {
    expect(regras(comArtigos("isencao_taxa", "O prazo é [...]"))).toContain("placeholder-nao-preenchido");
    expect(regras(comArtigos("isencao_taxa", "Valor a definir pela banca"))).toContain("placeholder-nao-preenchido");
  });

  it("⭐ CONTROLE NEGATIVO: um X sozinho NÃO é placeholder", () => {
    // Sem isto a regra pegaria "Raio X", "artigo X" e "Anexo X" — e quem redige
    // aprenderia a ignorar o painel, que é o pior resultado possível.
    expect(regras(comArtigos("prova_objetiva", "exame de Raio X, conforme o artigo X"))).toEqual([]);
  });

  it("⭐ CONTROLE NEGATIVO: data de verdade não acusa", () => {
    expect(regras(comArtigos("prova_objetiva", "A prova será aplicada em 16/03/2026."))).toEqual([]);
  });
});

describe("capítulo incluído e sem artigo", () => {
  it("acusa como ERRO", () => {
    const achados = analisarEdital({ itens: comArtigos("vagas_pcd") });
    expect(achados).toHaveLength(1);
    expect(achados[0].regra).toBe("capitulo-vazio");
    expect(achados[0].severidade).toBe("erro");
  });

  it("⭐ CONTROLE NEGATIVO: capítulo DESLIGADO e vazio não acusa vazio", () => {
    // O conteúdo dele não sai no documento. Acusar encheria o painel de pendência sobre
    // conteúdo que ninguém vai publicar.
    expect(
      regras(comArtigos("vagas_pcd"), [{ chave: "vagas_pcd", incluido: false }]),
    ).not.toContain("capitulo-vazio");
  });
});

describe("artigo vazio", () => {
  it("🔴 acusa o artigo em branco — o banco o aceita de propósito", () => {
    // "Adicionar artigo" cria a linha em branco; uma CHECK no banco obrigaria a UI a
    // inventar um texto-placeholder, que é o inimigo declarado deste módulo.
    const achados = analisarEdital({ itens: comArtigos("vagas_pcd", "Tem texto.", "   ") });
    expect(achados.map((a) => a.regra)).toEqual(["artigo-vazio"]);
    expect(achados[0].mensagem).toContain("o item 7.2");
  });

  it("⭐ CONTROLE NEGATIVO: artigo do tipo quadro não precisa de texto", () => {
    // A legenda é opcional; o conteúdo dele vem do dado estruturado.
    expect(
      regras(comArtigos("quadro_de_cargos", { tipo: "quadro", quadro_fonte: "cargos", texto: "" })),
    ).toEqual([]);
  });
});

describe("subitem sem item acima", () => {
  it("é AVISO: o subitem sairia como 7.0.1", () => {
    const achados = analisarEdital({
      itens: comArtigos("vagas_pcd", { texto: "Subitem órfão.", nivel: 1 }, "Item."),
    });
    expect(achados.map((a) => a.regra)).toEqual(["subitem-sem-item"]);
    expect(achados[0].severidade).toBe("aviso");
    expect(achados[0].mensagem).toContain("7.0.1");
  });

  it("🔴 CONTROLE NEGATIVO MEDIDO: alínea DIRETO sob o item é normal, e não avisa", () => {
    // Medido nos três editais reais em 2026-09-16: de 64 a 74 alíneas por edital, e o
    // item 6.1 do Edital 002 tem "A) B) C)" logo abaixo, sem subitem no meio. A primeira
    // versão desta regra acusava todo nível que pulasse e teria enchido o painel de
    // aviso falso em TODO edital — que é o começo de ninguém mais olhar o painel.
    expect(
      regras(
        comArtigos(
          "vagas_pcd",
          "O candidato poderá requerer a Isenção, desde que atenda a um dos requisitos:",
          { texto: "Estar inscrito no CadÚnico;", nivel: 2 },
          { texto: "Ser doador regular de sangue;", nivel: 2 },
          { texto: "Ter prestado serviço eleitoral.", nivel: 2 },
        ),
      ),
    ).toEqual([]);
  });

  it("⭐ CONTROLE NEGATIVO: subitem DEPOIS de um item não avisa", () => {
    expect(regras(comArtigos("vagas_pcd", "Item.", { texto: "Subitem.", nivel: 1 }))).toEqual([]);
  });
});

describe("quadro sem dado", () => {
  const comQuadro = comArtigos("quadro_de_cargos", {
    tipo: "quadro",
    quadro_fonte: "cargos",
    texto: "QUADRO I: DOS CARGOS",
  });

  it("🎯 acusa quadro cuja fonte não tem nenhuma linha — sairia tabela vazia", () => {
    const achados = analisarEdital({ itens: comQuadro, linhasPorFonte: { cargos: 0 } });
    expect(achados.map((a) => a.regra)).toEqual(["quadro-sem-dado"]);
    expect(achados[0].severidade).toBe("erro");
  });

  it("⭐ CONTROLE NEGATIVO: com linhas na fonte, não acusa", () => {
    expect(regras(comQuadro).length).toBe(0);
    expect(analisarEdital({ itens: comQuadro, linhasPorFonte: { cargos: 3 } })).toEqual([]);
  });

  it("⭐ CONTROLE: fonte NÃO MEDIDA não acusa — melhor calar que acusar por ignorância", () => {
    expect(analisarEdital({ itens: comQuadro, linhasPorFonte: {} })).toEqual([]);
  });
});

describe("capítulo padrão desligado", () => {
  it("é AVISO, não erro — desligar é permitido", () => {
    const achados = analisarEdital({
      itens: base(),
      overrides: [{ chave: "disposicoes_gerais", incluido: false }],
    });
    expect(achados).toHaveLength(1);
    expect(achados[0].regra).toBe("capitulo-padrao-desligado");
    expect(achados[0].severidade).toBe("aviso");
  });

  it("⭐ CONTROLE NEGATIVO: condicional desligado é o padrão dele — não avisa", () => {
    // Territorialidade e títulos nascem desligados. Avisar sobre eles faria todo edital
    // comum abrir com dois avisos falsos.
    expect(regras(base())).toEqual([]);
  });
});

describe("referência cruzada de capítulo", () => {
  it("acusa referência a capítulo DESLIGADO neste edital", () => {
    expect(regras(comArtigos("prova_objetiva", "na forma do {{cap:prova_de_titulos}}"))).toEqual([
      "referencia-a-capitulo-excluido",
    ]);
  });

  it("acusa referência a capítulo que não existe no catálogo", () => {
    expect(regras(comArtigos("prova_objetiva", "ver {{cap:capitulo_inventado}}"))).toEqual([
      "referencia-desconhecida",
    ]);
  });

  it("⭐ CONTROLE NEGATIVO: referência que resolve não acusa", () => {
    expect(regras(comArtigos("prova_objetiva", "ver {{cap:vagas_pcd}}"))).toEqual([]);
  });

  it("🔴 a MESMA referência deixa de acusar quando o capítulo é ligado", () => {
    // É o par que prova que a regra olha o estado do edital, e não uma lista fixa.
    const itens = comArtigos("prova_objetiva", "na forma do {{cap:prova_de_titulos}}");
    expect(regras(itens)).toEqual(["referencia-a-capitulo-excluido"]);

    expect(
      regras([...itens, artigo("prova_de_titulos", "Da prova de títulos.")], [
        { chave: "prova_de_titulos", incluido: true },
      ]),
    ).toEqual([]);
  });
});

describe("referência a ARTIGO — a granularidade que os editais reais usam", () => {
  it("acusa referência a artigo que não existe", () => {
    expect(regras(comArtigos("prova_objetiva", "nos termos do {{item:nao_existe}}"))).toEqual([
      "referencia-de-item-quebrada",
    ]);
  });

  it("⭐ CONTROLE NEGATIVO: referência que resolve não acusa", () => {
    const itens = comArtigos("vagas_pcd", { texto: "do laudo", ancora: "laudo" }).filter(
      (i) => i.capitulo_chave !== "prova_objetiva",
    );
    expect(regras([...itens, artigo("prova_objetiva", "ver {{item:laudo}}")])).toEqual([]);
  });

  it("🔴 desligar o capítulo da âncora QUEBRA a referência, e o linter acusa", () => {
    // O par que prova que a regra olha o estado do edital: a mesma referência passa e
    // depois falha, sem ninguém tocar no texto que a contém.
    const itens = [
      ...comArtigos("vagas_pcd", { texto: "do laudo", ancora: "laudo" }).filter(
        (i) => i.capitulo_chave !== "prova_objetiva",
      ),
      artigo("prova_objetiva", "ver {{item:laudo}}"),
    ];
    expect(regras(itens)).toEqual([]);
    expect(regras(itens, [{ chave: "vagas_pcd", incluido: false }])).toContain(
      "referencia-de-item-quebrada",
    );
  });
});

describe("resumoDoLinter", () => {
  it("separa erro de aviso", () => {
    const achados = analisarEdital({
      itens: comArtigos("prova_objetiva", "no dia XX/xx/2026"),
      overrides: [{ chave: "disposicoes_gerais", incluido: false }],
    });
    expect(resumoDoLinter(achados)).toEqual({ erros: 1, avisos: 1 });
  });
});

describe("os marcadores de dado variável — `{{campo:}}`", () => {
  it("⭐ CONTROLE: marcador conhecido e preenchido não acusa nada", () => {
    const achados = analisarEdital({
      itens: comArtigos("prova_objetiva", "A prova será aplicada em {{campo:cronograma_prova_objetiva}}."),
      valoresDeCampo: new Map([["cronograma_prova_objetiva", "20/09/2026"]]),
    });
    expect(achados).toEqual([]);
  });

  it("🔴 chave fora do catálogo acusa `campo-desconhecido` — é typo de quem escreveu", () => {
    const achados = analisarEdital({
      itens: comArtigos("prova_objetiva", "A prova será em {{campo:data_da_prova}}."),
      valoresDeCampo: new Map(),
    });
    // Uma só: a chave desconhecida NÃO acusa também `campo-sem-valor`, senão a mesma
    // linha apareceria duas vezes no painel, com dois donos diferentes.
    expect(achados.map((a) => a.regra)).toEqual(["campo-desconhecido"]);
    expect(achados[0].mensagem).toContain("[?campo:data_da_prova]");
  });

  it("🔴 chave conhecida e não preenchida acusa `campo-sem-valor` e diz ONDE preencher", () => {
    const achados = analisarEdital({
      itens: comArtigos("prova_objetiva", "A prova será em {{campo:cronograma_prova_objetiva}}."),
      valoresDeCampo: new Map(),
    });
    expect(achados.map((a) => a.regra)).toEqual(["campo-sem-valor"]);
    expect(achados[0].severidade).toBe("erro");
    // A mensagem tem de nomear o que fazer — §2 do CLAUDE.md. "Elementos Pós-textuais e
    // Anexos" é o título do capítulo `anexos`, onde mora o editor do cronograma.
    expect(achados[0].mensagem).toContain("Elementos Pós-textuais e Anexos");
  });

  it("🔴 SEM o mapa, `campo-sem-valor` não roda — melhor não acusar do que acusar por ignorância", () => {
    // É o primeiro frame da tela, antes de os hooks resolverem. Um Map vazio aqui encheria
    // o painel de erro que some sozinho, e é assim que alguém aprende a ignorar o painel.
    const achados = analisarEdital({
      itens: comArtigos("prova_objetiva", "A prova será em {{campo:cronograma_prova_objetiva}}."),
    });
    expect(achados).toEqual([]);
  });

  it("⚠️ mas `campo-desconhecido` roda SEM o mapa: ele só depende do catálogo", () => {
    const achados = analisarEdital({
      itens: comArtigos("prova_objetiva", "A prova será em {{campo:invento_qualquer}}."),
    });
    expect(achados.map((a) => a.regra)).toEqual(["campo-desconhecido"]);
  });

  it("⭐ CONTROLE: o marcador NÃO é lido como placeholder não preenchido", () => {
    // O linter olha o texto CRU. Se olhasse o resolvido, um endereço como o logradouro
    // "Rua: Antonio XX" do Anexo I do Edital 004 cairia em `/x{2,}/i`.
    const achados = analisarEdital({
      itens: comArtigos("inscricao_e_pagamento", "Entregue na sede, à {{campo:executora_endereco}}."),
      valoresDeCampo: new Map([["executora_endereco", "Rua 154, nº 783, Laranjal"]]),
    });
    expect(achados).toEqual([]);
  });

  it("acusa cada marcador do artigo, não só o primeiro", () => {
    const achados = analisarEdital({
      itens: comArtigos("preambulo", "{{campo:nao_existe_um}} e {{campo:nao_existe_dois}}"),
    });
    expect(achados.map((a) => a.regra)).toEqual(["campo-desconhecido", "campo-desconhecido"]);
  });
});

describe("o que falta REDIGIR", () => {
  it("🔴 acusa ERRO e CITA a instrução", () => {
    const achados = analisarEdital({
      itens: comArtigos(
        "disposicoes_preliminares",
        "Em observância a {{redigir:o fundamento legal deste certame}}, visa ao provimento.",
      ),
    });
    expect(achados.map((a) => a.regra)).toEqual(["texto-a-redigir"]);
    expect(achados[0].severidade).toBe("erro");
    // Sem citar a instrução, a regra só diria "falta redigir algo" — que é o defeito do
    // `[ ]` vazio que este marcador veio resolver.
    expect(achados[0].mensagem).toContain("o fundamento legal deste certame");
  });

  it("acusa UM achado por trecho pendente, não um por artigo", () => {
    const achados = analisarEdital({
      itens: comArtigos("disposicoes_preliminares", "{{redigir:as leis}} e {{redigir:a finalidade}}"),
    });
    expect(achados.map((a) => a.regra)).toEqual(["texto-a-redigir", "texto-a-redigir"]);
  });

  it("⭐ CONTROLE: artigo redigido por inteiro não acusa nada", () => {
    expect(analisarEdital({ itens: comArtigos("disposicoes_preliminares", "Artigo completo.") })).toEqual([]);
  });

  it("⚠️ o marcador NÃO cai na regra de placeholder — são achados diferentes", () => {
    // `placeholder-nao-preenchido` pega `[ ]` e `XX`; este pega o marcador que DIZ o que
    // falta. Se os dois acusassem o mesmo trecho, o painel mostraria a linha duas vezes.
    const achados = analisarEdital({
      itens: comArtigos("disposicoes_preliminares", "Funda-se em {{redigir:as leis}}."),
    });
    expect(achados.map((a) => a.regra)).not.toContain("placeholder-nao-preenchido");
  });
});
