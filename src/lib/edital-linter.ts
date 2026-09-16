/**
 * Linter do edital — regras determinísticas, sem LLM (decisão D3 de 2026-09-16).
 *
 * 🎯 **Ele existe por dois defeitos REAIS do Edital 004/2026, já publicado:**
 *
 * 1. `"dia XX/xx/2026"` no corpo, itens 12.4 e 14.9 — placeholder que ninguém preencheu.
 * 2. "Certidão Nada Consta do COREN" exigida de Agente Comunitário de Saúde, item 15.8-L
 *    — resíduo de copia-e-cola do edital de Enfermagem.
 *
 * O (1) é regra desta fatia. O (2) precisa dos cargos e mora na fatia 8 — mas a natureza
 * é a mesma: uma regra determinística que o sistema checa antes de alguém publicar.
 *
 * ⚠️ "Sanitizar texto" com LLM, como o material de referência propunha, NÃO é necessário
 * para nenhuma das duas. Procurar marcador vazio é regex.
 */
import { montarDocumento, referenciasDoTexto, type CapituloResolvido } from "@/lib/edital-numeracao";
import { ancorasDoDocumento, mapaDeAncoras, RE_REFERENCIA_ITEM } from "@/lib/edital-itens";

export type Severidade = "erro" | "aviso";

export interface Achado {
  severidade: Severidade;
  /** Chave do capítulo em que o achado está, ou `null` quando é do edital inteiro. */
  capitulo: string | null;
  regra: string;
  mensagem: string;
}

/**
 * Marcadores de "preencher depois" que chegaram a ser publicados ou que aparecem em
 * minuta. ⚠️ O caso real é `XX/xx/2026` — dois ou mais X seguidos, em qualquer caixa.
 * `X` sozinho não entra: pegaria "Raio X" e "artigo X".
 */
const PADROES_PLACEHOLDER: ReadonlyArray<{ re: RegExp; descricao: string }> = [
  { re: /x{2,}/i, descricao: "data ou valor não preenchido (XX)" },
  { re: /\[\s*\.{3}\s*\]|\[\s*\]/, descricao: "marcador vazio [...]" },
  { re: /\b(a preencher|preencher|TODO|a definir|DEFINIR)\b/i, descricao: "lembrete de redação" },
];

export interface EntradaLinter {
  /** Os capítulos já resolvidos. Passe o resultado de `montarDocumento`. */
  documento?: readonly CapituloResolvido[];
  /** Ou os overrides crus — o linter monta o documento sozinho. */
  overrides?: readonly { chave: string; ordem?: number | null; incluido?: boolean | null; texto?: string | null }[];
}

/** Âncora repetida faz a referência cair no primeiro item, que pode não ser o pretendido. */
function ancorasDuplicadas(ancoras: readonly { ancora: string; capitulo: string }[]): Achado[] {
  const vistas = new Set<string>();
  const achados: Achado[] = [];
  for (const a of ancoras) {
    if (vistas.has(a.ancora)) {
      achados.push({
        severidade: "erro",
        capitulo: a.capitulo,
        regra: "ancora-duplicada",
        mensagem: `A âncora "${a.ancora}" aparece mais de uma vez. Quem a referenciar vai cair no primeiro item, e não necessariamente no pretendido.`,
      });
    }
    vistas.add(a.ancora);
  }
  return achados;
}

export function analisarEdital(entrada: EntradaLinter): Achado[] {
  const documento = entrada.documento ?? montarDocumento(entrada.overrides ?? []);
  const achados: Achado[] = [];

  // 🔴 As referências dos editais reais apontam para ITEM, não para capítulo: 95 delas
  // nos três de referência, e nenhuma para capítulo. Por isso a âncora de item tem as
  // suas próprias duas regras.
  const ancoras = ancorasDoDocumento(documento);
  const mapaAncoras = mapaDeAncoras(ancoras);

  achados.push(...ancorasDuplicadas(ancoras));

  for (const cap of documento) {
    // Capítulo desligado não se analisa: o texto dele não sai no documento. Analisá-lo
    // encheria o painel de avisos sobre conteúdo que ninguém vai publicar.
    if (!cap.incluido) {
      // A exceção: desligar um capítulo PADRÃO é escolha legítima, mas merece aviso —
      // um edital sem "Das Disposições Gerais" é quase sempre descuido, não decisão.
      if (cap.padrao) {
        achados.push({
          severidade: "aviso",
          capitulo: cap.chave,
          regra: "capitulo-padrao-desligado",
          mensagem: `"${cap.titulo}" está desligado. É permitido, mas incomum — confirme que é intencional.`,
        });
      }
      continue;
    }

    if (cap.texto.trim() === "") {
      achados.push({
        severidade: "erro",
        capitulo: cap.chave,
        regra: "capitulo-vazio",
        mensagem: `"${cap.titulo}" está incluído no edital e não tem texto.`,
      });
      continue; // sem texto não há placeholder nem referência a checar
    }

    for (const p of PADROES_PLACEHOLDER) {
      if (p.re.test(cap.texto)) {
        achados.push({
          severidade: "erro",
          capitulo: cap.chave,
          regra: "placeholder-nao-preenchido",
          mensagem: `"${cap.titulo}" tem ${p.descricao}. Foi assim que "dia XX/xx/2026" chegou ao Diário Oficial no Edital 004/2026.`,
        });
      }
    }

    for (const m of cap.texto.matchAll(RE_REFERENCIA_ITEM)) {
      if (!mapaAncoras.has(m[1])) {
        achados.push({
          severidade: "erro",
          capitulo: cap.chave,
          regra: "referencia-de-item-quebrada",
          mensagem: `"${cap.titulo}" referencia o item "${m[1]}", e nenhuma âncora com esse nome existe num capítulo incluído.`,
        });
      }
    }

    for (const ref of referenciasDoTexto(cap.texto, documento)) {
      if (ref.problema === "desconhecida") {
        achados.push({
          severidade: "erro",
          capitulo: cap.chave,
          regra: "referencia-desconhecida",
          mensagem: `"${cap.titulo}" referencia um capítulo que não existe no catálogo: ${ref.chave}.`,
        });
      } else if (ref.problema === "excluida") {
        achados.push({
          severidade: "erro",
          capitulo: cap.chave,
          regra: "referencia-a-capitulo-excluido",
          mensagem: `"${cap.titulo}" referencia "${ref.chave}", que está desligado neste edital — a referência não tem número para onde apontar.`,
        });
      }
    }
  }

  return achados;
}

/** Quantos achados de cada severidade — para o resumo do painel. */
export function resumoDoLinter(achados: readonly Achado[]): { erros: number; avisos: number } {
  return {
    erros: achados.filter((a) => a.severidade === "erro").length,
    avisos: achados.filter((a) => a.severidade === "aviso").length,
  };
}
