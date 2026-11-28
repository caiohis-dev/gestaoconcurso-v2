/**
 * O portão da exportação (D-P1): bloquear com pendência aberta, liberar só confirmando
 * CADA uma pelo nome — e as duas recusas que NÃO se confirmam (consulta que falhou e
 * rascunho não salvo).
 */
import { describe, expect, it } from "vitest";
import { montarDocumento } from "@/lib/edital-numeracao";
import type { ItemBruto } from "@/lib/edital-itens";
import type { DadosDoCabecalho, DadosDosQuadros, DocumentoMontado } from "@/lib/edital-documento";
import { montarEditalCompleto } from "@/lib/edital-documento";
import {
  avaliarExportacao,
  nomeDoArquivo,
  pendenciasDaExportacao,
  type PendenciaDeExportacao,
} from "@/lib/edital-exportacao";

/** O cabeçalho do Edital 002/2026 como publicado — completo, então não gera pendência. */
const CABECALHO_002: DadosDoCabecalho = {
  numero_edital: "002",
  ano: 2026,
  secretaria_sigla: "SMA",
  secretaria_publicadora: "Secretaria Municipal de Administração",
  natureza_juridica: "CONCURSO_PUBLICO",
  orgao_demandante: "Secretaria Municipal de Educação",
};

const SEM_DADOS: DadosDosQuadros = {
  cargosDoEdital: [],
  nomesDosCargos: new Map(),
  disciplinas: [],
  titulos: [],
  distribuicao: [],
  nomesDasUnidades: new Map(),
  etapas: [],
};

let seq = 0;
const item = (capitulo_chave: string, p: Partial<ItemBruto> = {}): ItemBruto => ({
  id: `i${++seq}`,
  capitulo_chave,
  ordem: seq,
  nivel: 0,
  tipo: "item",
  texto: "texto",
  ancora: null,
  quadro_fonte: null,
  ...p,
});

/** Só o capítulo de disposições preliminares e os anexos ligados — o resto desligado. */
function cenario(itens: ItemBruto[], cabecalho: DadosDoCabecalho = CABECALHO_002) {
  const capitulos = montarDocumento(
    montarDocumento().map((c) => ({ chave: c.chave, incluido: ["disposicoes_preliminares", "anexos"].includes(c.chave) })),
  );
  const porCapitulo = new Map<string, ItemBruto[]>();
  for (const i of itens) porCapitulo.set(i.capitulo_chave, [...(porCapitulo.get(i.capitulo_chave) ?? []), i]);
  const valores = new Map<string, string>();
  const documento = montarEditalCompleto({
    cabecalho,
    documento: capitulos,
    porCapitulo,
    valores,
    quadros: SEM_DADOS,
    anexos: { ementas: [], abrangencia: [] },
  });
  return { capitulos, itens, valores, documento, conferencias: [] };
}

describe("pendenciasDaExportacao", () => {
  const anexoComTexto = item("anexos", { texto: "Fecho." });

  it("🔴 ANEXO VAZIO é pendência — o linter não o vê, só o documento montado", () => {
    const p = pendenciasDaExportacao(cenario([item("disposicoes_preliminares"), anexoComTexto]));
    expect(p.filter((x) => x.origem === "anexo").map((x) => x.texto)).toEqual([
      "Anexo I (Conteúdos programáticos): Nenhuma ementa cadastrada no conteúdo programático — o anexo sairia vazio.",
    ]);
  });

  it("🔴 quadro sem dado entra UMA vez, com o número — não também pela regra quadro-sem-dado do linter", () => {
    const p = pendenciasDaExportacao(
      cenario([item("disposicoes_preliminares", { tipo: "quadro", quadro_fonte: "cargos", texto: "Quadro:" }), anexoComTexto]),
    );
    // O capítulo do quadro: a regra `quadro-sem-dado` acusaria AQUI, com origem "linter".
    const doQuadro = p.filter((x) => x.capitulo === "disposicoes_preliminares");
    expect(doQuadro).toHaveLength(1);
    expect(doQuadro[0]).toMatchObject({ origem: "quadro" });
    expect(doQuadro[0].texto).toMatch(/^Quadro I: /);
  });

  it("os achados do linter entram — erro e aviso (campo sem valor, marcador [a redigir])", () => {
    const p = pendenciasDaExportacao(
      cenario([item("disposicoes_preliminares", { texto: "Em {{campo:site_oficial}}." }), anexoComTexto]),
    );
    const doLinter = p.filter((x) => x.origem === "linter");
    expect(doLinter.some((x) => /site_oficial|site oficial/i.test(x.texto))).toBe(true);
  });

  it("controle positivo: capítulo com texto completo não gera pendência de linter", () => {
    const p = pendenciasDaExportacao(cenario([item("disposicoes_preliminares", { texto: "Tudo certo." }), anexoComTexto]));
    expect(p.filter((x) => x.origem === "linter" && x.capitulo === "disposicoes_preliminares")).toEqual([]);
  });

  it("pendências de texto IGUAL ganham ids distintos — cada uma é uma confirmação", () => {
    const doc: DocumentoMontado = {
      cabecalho: { linhas: [], pendencias: [] },
      capitulos: [],
      anexos: [
        { chave: "abrangencia", numero: "I", titulo: "T", conteudo: null, abrangencia: [], pendencia: "vazio" },
        { chave: "abrangencia", numero: "I", titulo: "T", conteudo: null, abrangencia: [], pendencia: "vazio" },
      ],
    };
    const p = pendenciasDaExportacao({ capitulos: [], itens: [], valores: new Map(), documento: doc, conferencias: [] });
    expect(p).toHaveLength(2);
    expect(new Set(p.map((x) => x.id)).size).toBe(2);
  });
});

describe("avaliarExportacao", () => {
  const pend = (id: string): PendenciaDeExportacao => ({ id, origem: "linter", severidade: "erro", capitulo: null, texto: id });
  const base = { consultasComErro: [] as string[], pendencias: [pend("a"), pend("b")], rascunhosSujos: 0, confirmadas: new Set<string>() };

  it("🔴 com pendência aberta, BLOQUEIA — e diz quais faltam", () => {
    const e = avaliarExportacao(base);
    expect(e.tipo).toBe("pendente");
    expect(e.tipo === "pendente" && e.faltam.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("confirmar só uma não basta", () => {
    expect(avaliarExportacao({ ...base, confirmadas: new Set(["a"]) }).tipo).toBe("pendente");
  });

  it("controle positivo: confirmando CADA uma, libera", () => {
    expect(avaliarExportacao({ ...base, confirmadas: new Set(["a", "b"]) }).tipo).toBe("livre");
  });

  it("controle positivo: sem pendência nenhuma, libera sem confirmar nada", () => {
    expect(avaliarExportacao({ ...base, pendencias: [] }).tipo).toBe("livre");
  });

  it("🔴 pendência NOVA depois de confirmar volta a bloquear — confirmação não é cheque em branco", () => {
    const e = avaliarExportacao({ ...base, pendencias: [pend("a"), pend("b"), pend("c")], confirmadas: new Set(["a", "b"]) });
    expect(e.tipo === "pendente" && e.faltam.map((p) => p.id)).toEqual(["c"]);
  });

  it("🔴 confirmação VELHA não ocupa o lugar de uma nova — conta-se por id, não por quantidade", () => {
    // O caso real: renumerar muda o texto da pendência ("o item 7.3" vira "o item 7.4"), e
    // com ele o id. A confirmação antiga continua no conjunto, mas não vale para a nova.
    const e = avaliarExportacao({ ...base, confirmadas: new Set(["a", "velha"]) });
    expect(e.tipo === "pendente" && e.faltam.map((p) => p.id)).toEqual(["b"]);
  });

  it("confirmação de pendência que já sumiu não conta, nem atrapalha", () => {
    expect(avaliarExportacao({ ...base, pendencias: [pend("a")], confirmadas: new Set(["a", "velha"]) }).tipo).toBe("livre");
  });

  it("🔴 consulta que FALHOU recusa — mesmo com tudo confirmado, e mesmo carregando", () => {
    const tudo = { ...base, confirmadas: new Set(["a", "b"]), consultasComErro: ["edital_itens"] };
    expect(avaliarExportacao(tudo)).toEqual({ tipo: "falha", consultas: ["edital_itens"] });
    expect(avaliarExportacao({ ...tudo, pendencias: undefined }).tipo).toBe("falha");
  });

  it("🔴 rascunho não salvo recusa — mesmo sem pendência", () => {
    expect(avaliarExportacao({ ...base, pendencias: [], rascunhosSujos: 2 })).toEqual({ tipo: "rascunho", quantidade: 2 });
  });

  it("documento ainda não montado: carregando, nunca livre", () => {
    expect(avaliarExportacao({ ...base, pendencias: undefined }).tipo).toBe("carregando");
  });
});

describe("o CABEÇALHO no portão (E2)", () => {
  it("controle positivo: cabeçalho completo não gera pendência", () => {
    const p = pendenciasDaExportacao(cenario([item("disposicoes_preliminares")]));
    expect(p.filter((x) => x.origem === "cabecalho")).toEqual([]);
  });

  it("🔴 número sem ano é pendência de ERRO, e leva ao Preâmbulo", () => {
    const p = pendenciasDaExportacao(cenario([item("disposicoes_preliminares")], { ...CABECALHO_002, ano: null }));
    expect(p.filter((x) => x.origem === "cabecalho")).toMatchObject([
      { severidade: "erro", capitulo: "preambulo", texto: expect.stringContaining("número do edital") },
    ]);
  });
});

describe("nomeDoArquivo — recebe o número JÁ COMPOSTO (M11)", () => {
  it.each([
    [{ numeroComposto: "002/2026-SMA", nome: "Concurso" }, "edital-002-2026-sma.md"],
    [{ numeroComposto: "002/2026", nome: "Concurso" }, "edital-002-2026.md"],
    [{ numeroComposto: null, nome: "Processo Seletivo Saúde" }, "processo-seletivo-saude.md"],
    [{ numeroComposto: "  ", nome: "" }, "edital.md"],
    [null, "edital.md"],
  ])("%j → %s", (e, nome) => expect(nomeDoArquivo(e)).toBe(nome));
});
