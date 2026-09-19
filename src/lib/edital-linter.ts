/**
 * Linter do edital — regras determinísticas, sem LLM (decisão D3 de 2026-09-16).
 *
 * 🎯 **Ele existe por dois defeitos REAIS do Edital 004/2026, já publicado:**
 *
 * 1. `"dia XX/xx/2026"` no corpo, itens 12.4 e 14.9 — placeholder que ninguém preencheu.
 * 2. "Certidão Nada Consta do COREN" exigida de Agente Comunitário de Saúde, item 15.8-L
 *    — resíduo de copia-e-cola do edital de Enfermagem.
 *
 * O (1) é regra daqui. O (2) precisa dos cargos e mora na fatia 8 — mas a natureza é a
 * mesma: uma regra determinística que o sistema checa antes de alguém publicar.
 *
 * ⚠️ "Sanitizar texto" com LLM, como o material de referência propunha, NÃO é necessário
 * para nenhuma das duas. Procurar marcador vazio é regex.
 *
 * ## 🔵 O que mudou em 2026-09-16, quando o artigo virou registro
 *
 * | Regra | |
 * |---|---|
 * | `placeholder-nao-preenchido` | passou a apontar o **artigo** (`item 12.4`), não o capítulo inteiro |
 * | `ancora-duplicada` | **saiu** — virou o índice único `edital_itens_ancora_key`. Deixou de ser detectada porque deixou de ser possível |
 * | `artigo-vazio`, `nivel-fora-de-sequencia`, `quadro-sem-dado` | entraram |
 *
 * 🔴 A saída da `ancora-duplicada` é o §2 em ação: enquanto a regra era um laço aqui, ela
 * valia só para quem passasse pela tela. Agora vale para `psql`, PostgREST e script.
 *
 * ## 🔵 O que mudou em 2026-09-18, com o marcador `{{campo:}}`
 *
 * Entraram `campo-desconhecido` e `campo-sem-valor` — ver o comentário no corpo de
 * `analisarArtigo`, que explica por que são duas regras e não uma.
 *
 * 🔴 **E o linter continua olhando o texto CRU, não o resolvido.** Isso é decisão, não
 * descuido: no texto cru, `{{campo:executora_endereco}}` não é placeholder nenhum. Se a
 * análise passasse a olhar o texto já resolvido, um endereço legítimo cairia na regra
 * `placeholder-nao-preenchido` — e o caso não é hipotético: o Anexo I do Edital 004 tem um
 * logradouro chamado **"Rua: Antonio XX"**, que casa com `/x{2,}/i`. Hoje ele mora em
 * `territorialidade_abrangencia` e nunca chega a `edital_itens.texto`; se um dia chegar, o
 * grito do linter estará certo.
 */
import { camposDoTexto, trechosARedigir, CAMPO_POR_CHAVE } from "@/lib/edital-campos";
import { CAPITULO_POR_CHAVE } from "@/lib/edital-capitulos";
import { montarDocumento, referenciasDoTexto, type CapituloResolvido } from "@/lib/edital-numeracao";
import {
  agruparPorCapitulo,
  ancorasDoDocumento,
  mapaDeAncoras,
  numerarItens,
  RE_REFERENCIA_ITEM,
  type ItemBruto,
  type QuadroFonte,
} from "@/lib/edital-itens";

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
  overrides?: readonly { chave: string; ordem?: number | null; incluido?: boolean | null }[];
  /** Todos os artigos do edital, de todos os capítulos. */
  itens?: readonly ItemBruto[];
  /**
   * Quantas linhas cada fonte de quadro tem neste edital. Ausente = ainda não medido, e
   * a regra `quadro-sem-dado` não roda — melhor não acusar do que acusar por ignorância.
   */
  linhasPorFonte?: Partial<Record<QuadroFonte, number>>;
  /**
   * Os valores de `{{campo:}}` deste edital, já formatados.
   *
   * ⚠️ Mesma doutrina de `linhasPorFonte`: **ausente = ainda não carregado**, e a regra
   * `campo-sem-valor` não roda. Um `Map` vazio, em vez de `undefined`, acusaria dezenas de
   * campos no primeiro frame da tela — a armadilha "vazio enquanto carrega".
   *
   * A regra `campo-desconhecido` NÃO depende disto e roda sempre: ela só precisa do
   * catálogo. A assimetria é intencional, e é a diferença entre os dois erros (ver abaixo).
   */
  valoresDeCampo?: ReadonlyMap<string, string>;
}

/** Como o artigo é nomeado na mensagem: pelo número, ou pela posição quando não tem. */
function rotuloDoArtigo(numero: string, posicao: number): string {
  return numero ? `o item ${numero}` : `o ${posicao + 1}º parágrafo`;
}

/**
 * As duas regras dos marcadores de dado variável.
 *
 * 🔴 São DOIS erros com DONOS diferentes, e é por isso que são duas regras e não uma.
 * Uma chave fora do catálogo é typo de quem escreveu o texto — e se o texto veio do edital
 * modelo, o teste da rodada daquele capítulo devia tê-lo pego antes de chegar aqui. Já um
 * campo sem valor é trabalho que falta ao autor DESTE edital, e a mensagem tem de dizer
 * em que capítulo ir preencher.
 *
 * ⚠️ Chave desconhecida NÃO acusa também `campo-sem-valor`: a mesma linha apareceria duas
 * vezes no painel, atribuída a duas pessoas diferentes.
 *
 * ⚠️ Mora fora de `analisarArtigo` pelo mesmo motivo que `analisarArtigo` mora fora de
 * `analisarEdital`: com estas regras dentro, aquela função passou de 15 de complexidade no
 * lint. Extrair é a saída deste repo — elevar o baseline não é.
 */
function analisarCamposDoArtigo(
  cap: CapituloResolvido,
  onde: string,
  texto: string,
  valoresDeCampo: ReadonlyMap<string, string> | undefined,
): Achado[] {
  const achados: Achado[] = [];

  // ── o que ainda falta REDIGIR ─────────────────────────────────────────────
  //
  // 🔴 Erro, não aviso. O marcador `{{redigir:}}` existe porque o modelo tem frases que só
  // uma pessoa pode escrever — fundamento legal e objeto do certame, que no Edital 004 são de
  // Agente Comunitário de Saúde. Publicar sem escrever é publicar o edital errado, e a frase
  // seria plausível o bastante para passar por uma revisão apressada.
  //
  // ⚠️ A mensagem CITA a instrução. Sem isso a regra só diria "falta redigir algo aqui", que
  // é o defeito do `[ ]` vazio que este marcador veio resolver.
  for (const instrucao of trechosARedigir(texto)) {
    achados.push({
      severidade: "erro",
      capitulo: cap.chave,
      regra: "texto-a-redigir",
      mensagem: `Em "${cap.titulo}", ${onde} tem trecho não redigido: "${instrucao}".`,
    });
  }

  for (const campo of camposDoTexto(texto)) {
    if (!campo.conhecido) {
      achados.push({
        severidade: "erro",
        capitulo: cap.chave,
        regra: "campo-desconhecido",
        mensagem: `Em "${cap.titulo}", ${onde} usa o marcador "{{campo:${campo.chave}}}", que não existe no catálogo de campos — ele sairia impresso como "[?campo:${campo.chave}]".`,
      });
      continue;
    }
    if (valoresDeCampo && !valoresDeCampo.has(campo.chave)) {
      const cat = CAMPO_POR_CHAVE.get(campo.chave)!;
      const quemPreenche = CAPITULO_POR_CHAVE.get(cat.ondeSePreenche)?.titulo ?? cat.ondeSePreenche;
      achados.push({
        severidade: "erro",
        capitulo: cap.chave,
        regra: "campo-sem-valor",
        mensagem: `Em "${cap.titulo}", ${onde} usa "${cat.rotulo}", que ainda não foi preenchido neste edital — preencha em "${quemPreenche}".`,
      });
    }
  }

  return achados;
}

/**
 * As regras que olham UM artigo.
 *
 * ⚠️ Mora fora de `analisarEdital` porque o laço lá dentro passou de 15 de complexidade
 * no lint (baseline 111). Extrair é a saída deste repo — elevar o baseline não é.
 */
function analisarArtigo(
  ctx: {
    cap: CapituloResolvido;
    documento: readonly CapituloResolvido[];
    mapaAncoras: ReadonlyMap<string, string>;
    linhasPorFonte: Partial<Record<QuadroFonte, number>> | undefined;
    valoresDeCampo: ReadonlyMap<string, string> | undefined;
  },
  item: { tipo: string; nivel: number; texto: string | null; quadro_fonte: string | null; numero: string },
  posicao: number,
): Achado[] {
  const { cap } = ctx;
  const texto = item.texto ?? "";
  const onde = rotuloDoArtigo(item.numero, posicao);
  const achados: Achado[] = [];
  const erro = (regra: string, mensagem: string) =>
    achados.push({ severidade: "erro" as const, capitulo: cap.chave, regra, mensagem });

  if (item.tipo === "quadro") {
    const fonte = item.quadro_fonte as QuadroFonte | null;
    if (fonte && ctx.linhasPorFonte?.[fonte] === 0) {
      erro(
        "quadro-sem-dado",
        `Em "${cap.titulo}", ${onde} publica um quadro que ainda não tem nenhuma linha parametrizada — sairia uma tabela vazia no edital.`,
      );
    }
    // Quadro não tem texto próprio além da legenda: as regras de texto abaixo não se
    // aplicam ao conteúdo dele, que vem do dado estruturado.
    return achados;
  }

  // ── artigo vazio ──────────────────────────────────────────────────────────
  // O banco aceita de propósito: "Adicionar artigo" cria a linha em branco, e uma CHECK
  // obrigaria a UI a inventar um texto-placeholder. Quem acusa é esta regra.
  if (texto.trim() === "") {
    erro("artigo-vazio", `Em "${cap.titulo}", ${onde} está sem texto.`);
    return achados;
  }

  for (const p of PADROES_PLACEHOLDER) {
    if (p.re.test(texto)) {
      erro(
        "placeholder-nao-preenchido",
        `Em "${cap.titulo}", ${onde} tem ${p.descricao}. Foi assim que "dia XX/xx/2026" chegou ao Diário Oficial no Edital 004/2026.`,
      );
    }
  }

  achados.push(...analisarCamposDoArtigo(cap, onde, texto, ctx.valoresDeCampo));

  for (const m of texto.matchAll(RE_REFERENCIA_ITEM)) {
    if (!ctx.mapaAncoras.has(m[1])) {
      erro(
        "referencia-de-item-quebrada",
        `Em "${cap.titulo}", ${onde} referencia "${m[1]}", e nenhuma âncora com esse nome existe num capítulo incluído.`,
      );
    }
  }

  for (const ref of referenciasDoTexto(texto, ctx.documento)) {
    if (ref.problema === "desconhecida") {
      erro(
        "referencia-desconhecida",
        `Em "${cap.titulo}", ${onde} referencia um capítulo que não existe no catálogo: ${ref.chave}.`,
      );
    } else if (ref.problema === "excluida") {
      erro(
        "referencia-a-capitulo-excluido",
        `Em "${cap.titulo}", ${onde} referencia "${ref.chave}", que está desligado neste edital — a referência não tem número para onde apontar.`,
      );
    }
  }

  return achados;
}

/** As regras que olham o CAPÍTULO como um todo. */
function analisarCapitulo(cap: CapituloResolvido, temArtigo: boolean): Achado[] {
  if (!cap.incluido) {
    // Capítulo desligado não se analisa: o conteúdo dele não sai no documento. Analisá-lo
    // encheria o painel de avisos sobre o que ninguém vai publicar. A exceção: desligar
    // um capítulo PADRÃO é legítimo, mas um edital sem "Das Disposições Gerais" é quase
    // sempre descuido, não decisão.
    return cap.padrao
      ? [
          {
            severidade: "aviso",
            capitulo: cap.chave,
            regra: "capitulo-padrao-desligado",
            mensagem: `"${cap.titulo}" está desligado. É permitido, mas incomum — confirme que é intencional.`,
          },
        ]
      : [];
  }

  return temArtigo
    ? []
    : [
        {
          severidade: "erro",
          capitulo: cap.chave,
          regra: "capitulo-vazio",
          mensagem: `"${cap.titulo}" está incluído no edital e não tem nenhum artigo.`,
        },
      ];
}

export function analisarEdital(entrada: EntradaLinter): Achado[] {
  const documento = entrada.documento ?? montarDocumento(entrada.overrides ?? []);
  const porCapitulo = agruparPorCapitulo(entrada.itens ?? []);
  const achados: Achado[] = [];

  // 🔴 As referências dos editais reais apontam para ITEM, não para capítulo: 95 delas
  // nos três de referência, e nenhuma para capítulo.
  const mapaAncoras = mapaDeAncoras(
    ancorasDoDocumento(
      documento.map((c) => ({
        chave: c.chave,
        numero: c.numero,
        incluido: c.incluido,
        itens: porCapitulo.get(c.chave) ?? [],
      })),
    ),
  );

  for (const cap of documento) {
    const itens = porCapitulo.get(cap.chave) ?? [];
    achados.push(...analisarCapitulo(cap, itens.length > 0));
    if (!cap.incluido || itens.length === 0) continue;

    const ctx = {
      cap,
      documento,
      mapaAncoras,
      linhasPorFonte: entrada.linhasPorFonte,
      valoresDeCampo: entrada.valoresDeCampo,
    };
    let viuItemDeTopo = false;

    numerarItens(itens, cap.numero).forEach((item, i) => {
      // ── subitem sem item acima ──────────────────────────────────────────
      //
      // 🔴 MEDIDO em 2026-09-16, e a primeira versão desta regra estava ERRADA. Eu
      // acusava todo nível que "pulasse" — e os três editais reais têm de 64 a 74
      // alíneas, a maioria pendurada DIRETO num item de nível 0 (o item 6.1 do Edital
      // 002 tem "A) B) C)" logo abaixo, sem subitem no meio). A regra teria enchido o
      // painel de aviso falso em todo edital, que é o começo de ninguém mais olhar.
      //
      // O que de fato quebra é só isto: um SUBITEM (nível 1) antes de existir qualquer
      // item de nível 0 no capítulo — aí `numerarItens` produz "7.0.1", com um zero que
      // não corresponde a artigo nenhum. Alínea nunca quebra: ela é letra.
      if (item.nivel === 1 && !viuItemDeTopo) {
        achados.push({
          severidade: "aviso",
          capitulo: cap.chave,
          regra: "subitem-sem-item",
          mensagem: `Em "${cap.titulo}", ${rotuloDoArtigo(item.numero, i)} é um subitem e não há nenhum artigo de primeiro nível acima dele — a numeração sai como "${cap.numero}.0.1".`,
        });
      }
      if (item.nivel === 0 && item.tipo !== "prosa") viuItemDeTopo = true;

      achados.push(...analisarArtigo(ctx, item, i));
    });
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
