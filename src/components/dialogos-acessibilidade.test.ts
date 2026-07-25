import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Invariante de acessibilidade dos diálogos.
 *
 * Todo `<DialogContent>` (e as variantes AlertDialog/Sheet) precisa conter um
 * `<DialogDescription>`. Sem ele, o Radix emite
 * `Missing 'Description' or 'aria-describedby={undefined}' for {DialogContent}`
 * e o leitor de tela anuncia **só o título** — a pessoa abre um formulário e não
 * recebe nenhum contexto sobre o que ele faz.
 *
 * POR QUE UM TESTE ESTÁTICO, E NÃO DE RENDER: são 28 diálogos em 20 arquivos, e a
 * maioria não tem teste de UI. Renderizar todos custaria caro e exigiria montar as
 * props de cada um. Ler o fonte cobre os 28 de uma vez e falha na hora em que um
 * diálogo novo nasce sem descrição — que é exatamente o modo de regressão real:
 * ninguém percebe, porque nada quebra na tela.
 *
 * Histórico: em 2026-07-25 havia 6 diálogos sem descrição. Este teste existe para
 * que o número não volte a subir.
 */

const RAIZ = join(__dirname, "..");
const TAGS = ["Dialog", "AlertDialog", "Sheet"] as const;

/** Arquivos .tsx do app, exceto os primitivos de `ui/` (que definem os componentes). */
function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      return nome === "ui" ? [] : arquivosTsx(caminho);
    }
    return caminho.endsWith(".tsx") ? [caminho] : [];
  });
}

/**
 * Recorta cada bloco `<XContent ...> ... </XContent>`, respeitando aninhamento
 * (contagem de abre/fecha do mesmo tipo de tag).
 */
function blocosDeConteudo(fonte: string, tag: string): string[] {
  const abre = new RegExp(`<${tag}Content\\b`, "g");
  const fecha = `</${tag}Content>`;
  const blocos: string[] = [];

  for (const inicio of [...fonte.matchAll(abre)].map((m) => m.index!)) {
    let profundidade = 0;
    let i = inicio;
    while (i < fonte.length) {
      const proximoAbre = fonte.indexOf(`<${tag}Content`, i + 1);
      const proximoFecha = fonte.indexOf(fecha, i + 1);
      if (proximoFecha === -1) break;
      if (proximoAbre !== -1 && proximoAbre < proximoFecha) {
        profundidade++;
        i = proximoAbre;
      } else if (profundidade > 0) {
        profundidade--;
        i = proximoFecha;
      } else {
        blocos.push(fonte.slice(inicio, proximoFecha));
        break;
      }
    }
  }
  return blocos;
}

describe("acessibilidade dos diálogos", () => {
  const arquivos = arquivosTsx(RAIZ);

  it("encontra os arquivos do app (guarda contra o teste passar por vacuidade)", () => {
    // Se a varredura quebrar, os testes abaixo passariam sem verificar nada.
    expect(arquivos.length).toBeGreaterThan(20);
  });

  it("todo DialogContent tem um DialogDescription", () => {
    const semDescricao: string[] = [];
    let total = 0;

    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, "utf-8");
      for (const tag of TAGS) {
        for (const bloco of blocosDeConteudo(fonte, tag)) {
          total++;
          const temDescricao =
            new RegExp(`<${tag}Description\\b`).test(bloco) ||
            /aria-describedby=/.test(bloco);
          if (!temDescricao) {
            const linha = fonte.slice(0, fonte.indexOf(bloco)).split("\n").length;
            semDescricao.push(`${arquivo.replace(RAIZ, "src")}:${linha} (${tag}Content)`);
          }
        }
      }
    }

    expect(total).toBeGreaterThan(0);
    expect(semDescricao).toEqual([]);
  });
});
