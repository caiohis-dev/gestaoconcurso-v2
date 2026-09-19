/**
 * O EDITAL MODELO — coerência do índice e dos capítulos já transcritos.
 *
 * 🔴 **Este arquivo cresce com o modelo.** Os testes de COERÊNCIA (campos no catálogo,
 * âncoras únicas, âncoras resolvidas, migration em dia) valem para todos os capítulos e não
 * mudam; cada rodada acrescenta só o bloco do seu capítulo.
 *
 * ⚠️ E o teste que mais importa não é sobre o texto: é o `artigosEsperados`. Ele é o ÚNICO
 * que pega artigo **omitido** na transcrição — o linter fica contente, a numeração segue
 * coerente, e o capítulo sai do sistema com um artigo a menos do que o edital real tem.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CAPITULOS_DO_MODELO,
  ANCORAS_PENDENTES,
  VERSAO,
  artigosDoModelo,
  sqlDoCapitulo,
} from "@/lib/edital-modelo";
import { CAMPO_POR_CHAVE, camposDoTexto, trechosARedigir } from "@/lib/edital-campos";
import { CAPITULO_POR_CHAVE } from "@/lib/edital-capitulos";
import { RE_REFERENCIA_ITEM } from "@/lib/edital-itens";
import { segmentarNegrito } from "@/lib/edital-texto";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** O conteúdo de todas as migrations de modelo, concatenado. */
function sqlDasMigrations(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.includes("modelo_edital_"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf-8"))
    .join("\n");
}

describe("coerência do modelo — vale para todo capítulo", () => {
  it("todo capítulo do modelo existe no CATÁLOGO", () => {
    for (const cap of CAPITULOS_DO_MODELO) {
      expect(CAPITULO_POR_CHAVE.has(cap.chave), `capítulo "${cap.chave}" fora do catálogo`).toBe(true);
    }
  });

  it("🔴 a contagem de artigos bate com a declarada", () => {
    // O único teste que pega artigo omitido na transcrição.
    for (const cap of CAPITULOS_DO_MODELO) {
      expect(cap.artigos.length, `capítulo "${cap.chave}"`).toBe(cap.artigosEsperados);
    }
  });

  it("🔴 capítulo que DIVERGE da fonte tem de dizer por quê", () => {
    // Sem este par, a diferença entre "divergi de propósito" e "esqueci 24 artigos" seria
    // invisível — e a segunda é justamente o que `artigosEsperados` existe para pegar.
    for (const cap of CAPITULOS_DO_MODELO) {
      if (cap.artigosNaFonte === undefined) continue;
      expect(cap.artigosNaFonte, `"${cap.chave}" declara divergência sem divergir`)
        .not.toBe(cap.artigosEsperados);
      expect(cap.porQueDiverge?.trim(), `"${cap.chave}" diverge da fonte e não diz por quê`)
        .toBeTruthy();
    }
  });

  it("🔴 todo `{{campo:}}` usado existe no catálogo de campos", () => {
    for (const cap of CAPITULOS_DO_MODELO) {
      for (const artigo of cap.artigos) {
        for (const campo of camposDoTexto(artigo.texto)) {
          expect(campo.conhecido, `"${campo.chave}" em "${cap.chave}" não está no catálogo`).toBe(true);
        }
      }
    }
  });

  it("o `camposUsados` declarado bate com os marcadores do texto", () => {
    // Guarda a declaração contra o texto, nos dois sentidos: declarar a mais esconde um
    // marcador removido; declarar a menos deixa a rodada sem saber o que precisa preencher.
    for (const cap of CAPITULOS_DO_MODELO) {
      const noTexto = new Set(cap.artigos.flatMap((a) => camposDoTexto(a.texto).map((c) => c.chave)));
      expect([...noTexto].sort(), `capítulo "${cap.chave}"`).toEqual([...cap.camposUsados].sort());
    }
  });

  it("🔴 âncora publicada é ÚNICA no modelo inteiro", () => {
    // É o `23505` de `edital_itens_ancora_key` pego no `npm test`, antes de abortar uma
    // absorção inteira no banco de alguém.
    const todas = CAPITULOS_DO_MODELO.flatMap((c) => c.ancorasPublicadas);
    expect(todas.length).toBe(new Set(todas).size);
  });

  it("o `ancorasPublicadas` declarado bate com as âncoras dos artigos", () => {
    for (const cap of CAPITULOS_DO_MODELO) {
      const nosArtigos = cap.artigos.map((a) => a.ancora).filter((a): a is string => !!a);
      expect(nosArtigos.sort(), `capítulo "${cap.chave}"`).toEqual([...cap.ancorasPublicadas].sort());
    }
  });

  it("🔴 toda `{{item:}}` consumida resolve, ou está em ANCORAS_PENDENTES", () => {
    const publicadas = new Set(CAPITULOS_DO_MODELO.flatMap((c) => c.ancorasPublicadas));
    const pendentes = new Set(ANCORAS_PENDENTES.map((p) => p.ancora));
    for (const cap of CAPITULOS_DO_MODELO) {
      for (const artigo of cap.artigos) {
        for (const m of artigo.texto.matchAll(RE_REFERENCIA_ITEM)) {
          const ok = publicadas.has(m[1]) || pendentes.has(m[1]);
          expect(ok, `"${m[1]}" em "${cap.chave}" não resolve nem está declarada pendente`).toBe(true);
        }
      }
    }
  });

  it("⏳ ANCORAS_PENDENTES é burn-down — a rodada final a exige VAZIA", () => {
    // Enquanto houver rodada por fazer, este caso só registra o tamanho. Na última rodada
    // ele vira `toBe(0)` e passa a ser o portão de fechamento do tema.
    expect(ANCORAS_PENDENTES.length).toBeLessThanOrEqual(CAPITULOS_DO_MODELO.length * 3);
  });

  it("🔴 nenhum `**` solto — a transcrição de origem tem negrito quebrado", () => {
    // Medido: os itens 12.4 (`**dia XX/xx/2026*`) e 14.9 (`xx**/xx/2026**`) do Edital 004
    // têm o marcador sem fechar. `segmentarNegrito` deixa o asterisco literal de propósito,
    // então ele aparece no documento — e é aqui que se pega antes disso.
    for (const cap of CAPITULOS_DO_MODELO) {
      for (const artigo of cap.artigos) {
        const solto = segmentarNegrito(artigo.texto).some((s) => s.texto.includes("*"));
        expect(solto, `"${cap.chave}" tem asterisco solto: ${artigo.texto.slice(0, 60)}`).toBe(false);
      }
    }
  });

  it("🔴 nenhum LITERAL que devia ser marcador", () => {
    // Data, dinheiro e e-mail em texto fixo é exatamente o que o `{{campo:}}` existe para
    // impedir. Se um capítulo legítimo precisar de um deles (o número de uma lei, por
    // exemplo), a exceção se declara aqui com o motivo — nunca afrouxando a regex.
    const proibidos: { nome: string; re: RegExp }[] = [
      { nome: "data dd/mm/aaaa", re: /\b\d{2}\/\d{2}\/\d{4}\b/ },
      { nome: "valor em R$", re: /R\$\s?\d/ },
      { nome: "e-mail", re: /[\w.-]+@[\w.-]+\.\w+/ },
      { nome: "placeholder XX", re: /x{2,}/i },
    ];
    for (const cap of CAPITULOS_DO_MODELO) {
      for (const artigo of cap.artigos) {
        for (const p of proibidos) {
          expect(p.re.test(artigo.texto), `${p.nome} em "${cap.chave}": ${artigo.texto.slice(0, 70)}`).toBe(false);
        }
      }
    }
  });

  it("`quadro` e `quadroFonte` andam juntos — a CHECK do banco é bicondicional", () => {
    for (const { capituloChave, artigo } of artigosDoModelo()) {
      expect(
        (artigo.tipo === "quadro") === (artigo.quadroFonte !== undefined),
        `artigo de "${capituloChave}" viola a bicondicional`,
      ).toBe(true);
    }
  });

  it("🔴 todo texto do modelo EXISTE em alguma migration", () => {
    // Sem isto, editar o TS sem levar a mudança ao banco faz o modelo nascer diferente do que
    // todos os testes acima afirmam — e nada avisaria.
    //
    // ⚠️ Confere TEXTO e ÂNCORA, não o bloco `DO $$` inteiro, e a razão é durável: enquanto as
    // migrations do modelo estão sem commit, corrigir um capítulo é regerar o arquivo. Depois
    // de commitadas isso deixa de ser permitido — "nunca edite uma migration já aplicada" é
    // absoluto no CLAUDE.md —, e a correção passa a ser uma migration NOVA com um `UPDATE`.
    // Um teste que exigisse o bloco gerado reprovaria justamente o caminho certo; este
    // sobrevive a ele, e continua pegando o que importa: texto que o TS tem e o banco não.
    const sql = sqlDasMigrations();
    for (const cap of CAPITULOS_DO_MODELO) {
      for (const artigo of cap.artigos) {
        const comoNoSql = artigo.texto.replace(/'/g, "''");
        expect(sql, `o texto de um artigo de "${cap.chave}" não está em nenhuma migration`).toContain(comoNoSql);
        if (artigo.ancora) {
          expect(sql, `a âncora "${artigo.ancora}" não está em nenhuma migration`).toContain(artigo.ancora);
        }
      }
    }
  });

  it("⭐ CONTROLE: o bloco gerado de cada capítulo é SQL válido e completo", () => {
    // O teste acima é tolerante de propósito; este guarda o gerador em si. Se `sqlDoCapitulo`
    // parar de emitir a guarda `NOT EXISTS`, a migration da próxima rodada duplicaria o texto
    // a cada `db reset` — e nenhum caso acima notaria.
    for (const cap of CAPITULOS_DO_MODELO) {
      const bloco = sqlDoCapitulo(cap.chave);
      expect(bloco).toContain("IF EXISTS (SELECT 1 FROM public.edital_itens");
      expect(bloco).toContain(`capitulo_chave = '${cap.chave}'`);
      expect(bloco.match(/\(v_modelo, /g) ?? []).toHaveLength(cap.artigos.length);
    }
  });

  it("a VERSAO do código é a que as migrations gravam", () => {
    expect(sqlDasMigrations()).toContain(`SET modelo_versao = '${VERSAO}'`);
  });
});

describe("capítulo `preambulo`", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "preambulo")!;

  it("é UM parágrafo, e é `prosa` — pré-textual não recebe número", () => {
    expect(cap.artigos).toHaveLength(1);
    expect(cap.artigos[0].tipo).toBe("prosa");
    // O catálogo diz que o preâmbulo não é numerado; `prosa` é como o artigo respeita isso.
    expect(CAPITULO_POR_CHAVE.get("preambulo")!.numerado).toBe(false);
  });

  it("⭐ CONTROLE: o nome do município é LITERAL, e escrito certo", () => {
    // O defeito medido: `V0LTA` com zero, 3× no Edital 002 e 1× no 003 — copia-e-cola que
    // viajou entre documentos. Aqui está escrito uma vez, e este caso é o que o mantém.
    expect(cap.artigos[0].texto).toContain("MUNICÍPIO DE VOLTA REDONDA");
    expect(cap.artigos[0].texto).not.toMatch(/V0LTA/i);
  });

  it("os quatro dados variáveis viraram marcador", () => {
    expect([...cap.camposUsados].sort()).toEqual([
      "cargos_do_edital",
      "natureza_juridica",
      "regime_trabalho",
      "signatario_cargo",
    ]);
    for (const chave of cap.camposUsados) {
      expect(CAMPO_POR_CHAVE.has(chave), `campo "${chave}"`).toBe(true);
    }
  });

  it("⚠️ corrige o 'nos termos NO presente Edital' do Edital 004", () => {
    // O 002 escreve "do", que é o certo. Registrado para a correção não parecer descuido.
    expect(cap.artigos[0].texto).toContain("nos termos do presente Edital");
  });

  it("não publica nem consome âncora — ninguém referencia o preâmbulo", () => {
    expect(cap.ancorasPublicadas).toEqual([]);
    expect(cap.ancorasConsumidas).toEqual([]);
  });
});

describe("capítulo `disposicoes_preliminares`", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "disposicoes_preliminares")!;

  it("são 6 artigos, todos de nível 0 e numerados", () => {
    expect(cap.artigos).toHaveLength(6);
    for (const a of cap.artigos) {
      expect(a.tipo).toBe("item");
      expect(a.nivel ?? 0).toBe(0);
    }
  });

  it("🔴 o fundamento legal e a finalidade são `{{redigir:}}`, não texto do 004", () => {
    // Medido: cada lei do item 1.1 do Edital 004 (11.350/2006, Municipais 6.787/26 e
    // 6.836/26) aparece UMA vez no documento — pela regra do catálogo não viram campo. Mas
    // literais, elas fariam o modelo publicar fundamento legal de saúde num edital de
    // magistério, e a frase seria plausível.
    const pendentes = trechosARedigir(cap.artigos[0].texto);
    expect(pendentes).toHaveLength(2);
    expect(pendentes[0]).toMatch(/fundamento legal/i);
    expect(pendentes[1]).toMatch(/finalidade/i);
  });

  it("⭐ CONTROLE: nenhuma lei específica do Edital 004 sobrou no texto", () => {
    // O contrário é o defeito: transcrever "fielmente" e levar o fundamento de ACS adiante.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    for (const lei of ["11.350/2006", "6.787/26", "6.836/26", "Estratégia Saúde da Família"]) {
      expect(tudo, `"${lei}" vazou do Edital 004`).not.toContain(lei);
    }
  });

  it("⚠️ mas a LGPD fica LITERAL — ela não varia entre editais", () => {
    // A regra do catálogo exige que o dado VARIE para virar campo. Campo para constante é
    // formulário a mais sem verdade a mais.
    expect(cap.artigos[3].texto).toContain("13.709/2018");
  });

  it("🔴 o item do conteúdo programático NÃO cita número de anexo", () => {
    // Medido: é o Anexo I no 002 e no 003, e o Anexo II no 004 (lá o Anexo I é a abrangência).
    // Referência calculada sem mecanismo — "como anexo" é impreciso e nunca falso, contra um
    // número errado em 2 dos 3 editais reais.
    const ultimo = cap.artigos[5].texto;
    expect(ultimo).toContain("como anexo deste Edital");
    expect(ultimo).not.toMatch(/Anexo\s+(I|II|III)\b/);
  });

  it("publica as duas âncoras que capítulos seguintes vão consumir", () => {
    expect([...cap.ancorasPublicadas].sort()).toEqual(["conteudo_programatico_anexo", "objeto_do_certame"]);
  });
});

describe("capítulo `quadro_de_cargos`", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "quadro_de_cargos")!;

  it("são 4 artigos, e o primeiro é o QUADRO gerado de `cargos`", () => {
    expect(cap.artigos).toHaveLength(4);
    expect(cap.artigos[0].tipo).toBe("quadro");
    expect(cap.artigos[0].quadroFonte).toBe("cargos");
    // Os outros três são texto e NÃO podem ter fonte — a CHECK do banco é bicondicional.
    for (const a of cap.artigos.slice(1)) {
      expect(a.tipo).toBe("item");
      expect(a.quadroFonte).toBeUndefined();
    }
  });

  it("🔴 NENHUM número de quadro em nenhum artigo", () => {
    // Medido: "Quadro II" é a prova no 002/003 e as vagas por UBSF no 004 — que ainda chama a
    // tabela da prova de Quadro II também, dois quadros com o mesmo número no mesmo documento.
    for (const a of cap.artigos) {
      expect(a.texto, `número de quadro literal em: ${a.texto.slice(0, 60)}`)
        .not.toMatch(/Quadro\s+(I|II|III|IV)\b/);
    }
  });

  it("🔴 o vencimento aponta para o QUADRO, e as vantagens são `{{redigir:}}`", () => {
    const ultimo = cap.artigos[3].texto;
    expect(ultimo).toContain("indicado no quadro deste capítulo");
    // Nenhum valor em prosa: é a regra medida do módulo (valor por cargo sai no quadro).
    expect(ultimo).not.toMatch(/R\$/);
    expect(trechosARedigir(ultimo)).toHaveLength(1);
    expect(trechosARedigir(ultimo)[0]).toMatch(/vantagens/i);
  });

  it("🔴 os artigos de territorialidade se AUTODENUNCIAM pela referência de capítulo", () => {
    // Com `distribuicao_geografica` desligado, o linter acusa `referencia-a-capitulo-excluido`.
    // É o que dispensa um mecanismo de "artigo condicional".
    const comReferencia = cap.artigos.filter((a) => a.texto.includes("{{cap:distribuicao_geografica}}"));
    expect(comReferencia).toHaveLength(2);
  });

  it("⭐ CONTROLE: o texto foi GENERALIZADO — nada de ACS", () => {
    // O 004 diz "Para o cargo de Agente Comunitário de Saúde (ACS)". A regra vale para
    // qualquer cargo com restrição territorial, e transcrever literal levaria o cargo adiante.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/Agente Comunitário|ACS|UBSF/);
  });
});

describe("capítulo `atribuicoes_dos_cargos` — o primeiro MOLDE", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "atribuicoes_dos_cargos")!;

  it("🔴 diverge da fonte, e declara o par que explica a divergência", () => {
    expect(cap.artigos).toHaveLength(4);
    expect(cap.artigosNaFonte).toBe(28);
    expect(cap.porQueDiverge).toMatch(/Agente Comunitário/);
  });

  it("⭐ CONTROLE: NENHUMA atribuição de ACS sobrou no modelo", () => {
    // O defeito que este capítulo evita: transcrever os 24 incisos faria todo edital novo
    // nascer com as atribuições de Agente Comunitário de Saúde.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    for (const trecho of ["adscrição", "visitas domiciliares", "endemias", "Estratégia Saúde"]) {
      expect(tudo, `"${trecho}" vazou do Edital 004`).not.toContain(trecho);
    }
  });

  it("🔴 a lista de atribuições é ALÍNEA (nível 2), não romano digitado", () => {
    // Alínea em letra é CALCULADA por `numerarItens`; romano teria de ser digitado, e é o que o
    // módulo existe para matar. A divergência de estilo com o publicado é deliberada.
    const lista = cap.artigos[3];
    expect(lista.nivel).toBe(2);
    expect(lista.texto).not.toMatch(/\b(I|II|III|IV|V)\.\s/);
  });

  it("o nome do cargo é `{{redigir:}}`, NÃO o campo com todos os cargos", () => {
    // `{{campo:cargos_do_edital}}` rende TODOS os cargos numa frase; aqui o bloco é de UM.
    expect(trechosARedigir(cap.artigos[0].texto)).toHaveLength(1);
    expect(camposDoTexto(cap.artigos[0].texto)).toEqual([]);
  });

  it("todo artigo do molde pede redação — é um molde, não texto pronto", () => {
    // O artigo "Atribuições:" é o único rótulo fixo; os outros três são instrução.
    const comInstrucao = cap.artigos.filter((a) => trechosARedigir(a.texto).length > 0);
    expect(comInstrucao).toHaveLength(3);
  });
});

describe("capítulo `requisitos_investidura` — o primeiro transcrito POR INTEIRO", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "requisitos_investidura")!;

  it("são 15 artigos, sem divergência da fonte", () => {
    expect(cap.artigos).toHaveLength(15);
    expect(cap.artigosNaFonte).toBeUndefined();
  });

  it("🔴 NENHUM `{{redigir:}}` — o conteúdo é genérico e vem pronto", () => {
    // É o contraste que explica a regra: requisito de investidura vale para qualquer certame;
    // atribuição de cargo não. Conteúdo genérico o modelo entrega; do certame, vira instrução.
    for (const a of cap.artigos) {
      expect(trechosARedigir(a.texto), `artigo pediu redação: ${a.texto.slice(0, 50)}`).toEqual([]);
    }
  });

  it("um caput de nível 0 e catorze incisos de nível 1", () => {
    expect(cap.artigos[0].nivel).toBe(0);
    expect(cap.artigos.slice(1).every((a) => a.nivel === 1)).toBe(true);
  });

  it("🔴 o requisito territorial se AUTODENUNCIA pela referência de capítulo", () => {
    const territorial = cap.artigos.filter((a) => a.texto.includes("{{cap:distribuicao_geografica}}"));
    expect(territorial).toHaveLength(1);
    // E NÃO cita "Quadro II", como o publicado faz.
    expect(territorial[0].texto).not.toMatch(/Quadro/);
  });

  it("⚠️ usa o termo da LBI, não o do documento de 2026", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).toContain("pessoa com deficiência");
    expect(tudo).not.toContain("portador de deficiência");
  });
});

describe("capítulo `distribuicao_geografica` — condicional", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "distribuicao_geografica")!;

  it("nasce DESLIGADO no catálogo, e é para cá que as outras rodadas apontam", () => {
    expect(CAPITULO_POR_CHAVE.get("distribuicao_geografica")!.padrao).toBe(false);
    // Rodadas 4 e 6 deixaram referências para cá; com o capítulo desligado elas se autodenunciam.
    const apontamPraCa = CAPITULOS_DO_MODELO.filter((c) =>
      c.artigos.some((a) => a.texto.includes("{{cap:distribuicao_geografica}}")),
    ).map((c) => c.chave);
    expect(apontamPraCa.sort()).toEqual(["quadro_de_cargos", "requisitos_investidura"]);
  });

  it("tem o quadro de vagas por área, e é a fonte `vagas_por_area`", () => {
    const quadro = cap.artigos.filter((a) => a.tipo === "quadro");
    expect(quadro).toHaveLength(1);
    expect(quadro[0].quadroFonte).toBe("vagas_por_area");
  });

  it("🔴 os TOTAIS de vagas NÃO entram em prosa — o quadro já os rende", () => {
    // O 004 escreve "80 vagas" e "143 vagas". Repetir o total em prosa cria duas fontes para o
    // mesmo número, e é assim que um edital publica 80 num lugar e 82 no quadro.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/\b\d{2,}\s+vagas\b/);
  });

  it("⭐ CONTROLE: nada de UBSF, ACS nem `USBF` — e o typo do 004 não sobreviveu", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/UBSF|USBF|Agente Comunitário/);
  });

  it("as duas referências internas usam ÂNCORA, não número de subitem", () => {
    const comAncora = cap.artigos.filter((a) => a.texto.includes("{{item:residencia_na_area}}"));
    expect(comAncora).toHaveLength(2);
    expect(cap.ancorasPublicadas).toContain("residencia_na_area");
  });
});

describe("capítulo `inscricao_e_pagamento` — o maior", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "inscricao_e_pagamento")!;

  it("são 38 artigos, contra 39 na fonte, com o motivo declarado", () => {
    expect(cap.artigos).toHaveLength(38);
    expect(cap.artigosNaFonte).toBe(39);
    expect(cap.porQueDiverge).toMatch(/taxas por cargo/);
  });

  it("🔴 as CINCO referências deslocadas foram reapontadas para o alvo real", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    // Os três de capítulo (6.31, 6.32a, 6.32b) e os dois de item (6.1, 6.35).
    expect(tudo).toContain("{{cap:isencao_taxa}}");
    expect(tudo).toContain("{{cap:vagas_pcd}}");
    expect(tudo).toContain("{{cap:desempate_e_resultado}}");
    expect((tudo.match(/\{\{cap:condicoes_especiais_prova\}\}/g) ?? [])).toHaveLength(2);
  });

  it("⭐ CONTROLE: nenhuma referência por NÚMERO de item ou capítulo sobrou", () => {
    // É o defeito central do tema: "Item 7", "Item 10", "subitens 6.8 a 6.13", "subitens 13.3".
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/Item\s+\d/);
    expect(tudo).not.toMatch(/subitens?\s+\d+\.\d/);
  });

  it("🔴 a taxa por cargo é alínea-molde, e NÃO valor em prosa", () => {
    const caput = cap.artigos.find((a) => a.ancora === "valor_do_boleto")!;
    const molde = cap.artigos[cap.artigos.indexOf(caput) + 1];
    expect(molde.nivel).toBe(2);
    expect(trechosARedigir(molde.texto)).toHaveLength(1);
    // Nenhum valor em prosa em todo o capítulo.
    expect(cap.artigos.map((a) => a.texto).join(" ")).not.toMatch(/R\$/);
  });

  it("as datas do período de inscrição e do boleto vêm do CRONOGRAMA", () => {
    expect(cap.camposUsados).toContain("cronograma_inscricoes");
    expect(cap.camposUsados).toContain("cronograma_pagamento_boleto");
  });
});

describe("capítulo `isencao_taxa` — o que melhor prova o defeito do tema", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "isencao_taxa")!;

  it("28 artigos contra 30 elementos na fonte, com o motivo declarado", () => {
    expect(cap.artigos).toHaveLength(28);
    expect(cap.artigosNaFonte).toBe(30);
    expect(cap.porQueDiverge).toMatch(/MESMO parágrafo/);
  });

  it("🔴 NENHUMA das 11 referências erradas do 004 sobreviveu como número", () => {
    // O 004 tem 12 referências neste capítulo e 11 estão erradas — cinco dizem "subitem 6.1"
    // para um alvo que é 7.1, e o 7.13 aponta para "5.3 até 5.32", faixa que não existe.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/subitens?\s+(de\s+)?\d+\.\d/);
    expect(tudo).not.toMatch(/item\s+\d+\.\d/);
  });

  it("as referências internas viraram ÂNCORA, e as três âncoras são consumidas", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    for (const ancora of cap.ancorasPublicadas) {
      expect(tudo, `a âncora "${ancora}" é publicada e nunca usada`).toContain(`{{item:${ancora}}}`);
    }
  });

  it("🔴 o item que apontava para a faixa INEXISTENTE virou referência de capítulo", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).toContain("{{cap:inscricao_e_pagamento}}");
  });

  it("⭐ CONTROLE: as alíneas são de nível 2 — o sistema as reletra em MINÚSCULA", () => {
    // O 004 usa `A)` neste capítulo e `a)` no anterior. O modelo não escolhe: `numerarItens`
    // rende minúscula, calculada, e a inconsistência medida desaparece por construção.
    const alineas = cap.artigos.filter((a) => a.nivel === 2);
    expect(alineas.length).toBeGreaterThanOrEqual(7);
    for (const a of alineas) {
      expect(a.texto, `alínea com letra digitada: ${a.texto.slice(0, 40)}`).not.toMatch(/^[A-Z]\)/);
    }
  });

  it("os dois números que já tinham coluna viraram campo", () => {
    expect(cap.camposUsados).toContain("minimo_doacoes_sangue");
    expect(cap.camposUsados).toContain("limite_envelopes");
    // E nenhum dos dois ficou literal no texto.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/\b0?3\s+doações\b/);
    expect(tudo).not.toMatch(/\bdois envelopes\b/);
  });

  it("⚠️ o envelope usa a NATUREZA do certame, não 'Concurso Público' cravado", () => {
    // O 004 manda escrever "Concurso Público para a Secretaria Municipal de Saúde" num edital
    // que é Processo Seletivo Público.
    const envelope = cap.artigos.find((a) => a.texto.includes("{{campo:natureza_juridica}}"))!;
    expect(envelope.texto).toContain("{{campo:orgao_demandante}}");
  });
});

describe("capítulos `vagas_pcd` e `vagas_cotas_raciais` — as ações afirmativas", () => {
  const pcd = CAPITULOS_DO_MODELO.find((c) => c.chave === "vagas_pcd")!;
  const cotas = CAPITULOS_DO_MODELO.find((c) => c.chave === "vagas_cotas_raciais")!;

  it("o de PCD é o maior transcrito SEM divergência", () => {
    expect(pcd.artigos).toHaveLength(43);
    expect(pcd.artigosNaFonte).toBeUndefined();
    expect(cotas.artigos).toHaveLength(26);
    expect(cotas.artigosNaFonte).toBeUndefined();
  });

  it("🔴 os PERCENTUAIS vêm de campo — eles alimentam o cálculo da reserva", () => {
    // `edital-cotas.ts` calcula a reserva do Quadro I a partir dessas colunas. Literais no texto,
    // o documento diria 10% e 20% enquanto o quadro distribuiria por outro valor, em silêncio.
    expect(pcd.camposUsados).toContain("percentual_pcd");
    expect(cotas.camposUsados).toContain("percentual_cotas_raciais");
    const tudo = [...pcd.artigos, ...cotas.artigos].map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/\b(10|20)%/);
  });

  it("⭐ CONTROLE: as leis de reserva também vêm de campo, não do 004", () => {
    const tudo = [...pcd.artigos, ...cotas.artigos].map((a) => a.texto).join(" ");
    expect(tudo).not.toContain("3.113/94");
    expect(tudo).not.toContain("3.221/95");
    expect(tudo).not.toContain("5.309/2017");
  });

  it("🔴 nenhuma das 11 referências deslocadas dos dois capítulos sobreviveu", () => {
    // PCD: 8.11, 8.13, 8.15, 8.16, 8.26. Cotas: 9.4, 9.6, 9.8, 9.9, 9.10, 9.18.
    const tudo = [...pcd.artigos, ...cotas.artigos].map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/subitens?\s+\d+\.\d/);
    expect(tudo).not.toMatch(/item\s+\d+\./);
  });

  it("🔴 a referência ao ANEXO inexistente da autodeclaração saiu", () => {
    // O 9.2 manda ver "o formulário de autodeclaração constante do Anexo II" — mas o Anexo II do
    // 004 é o conteúdo programático, e o formulário não é anexo de edital nenhum.
    const tudo = cotas.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/Anexo\s+(I|II)\b/);
    expect(tudo).toContain("{{campo:site_oficial}}");
  });

  it("⭐ CONTROLE: as alíneas dos dois são nível 2 — nem `a)` nem `A)` digitados", () => {
    // O capítulo 9 usa `a)` no item 9.3 e `A)` no 9.7, no mesmo capítulo. O modelo não escolhe.
    for (const cap of [pcd, cotas]) {
      for (const a of cap.artigos.filter((x) => x.nivel === 2)) {
        expect(a.texto, `letra digitada em "${cap.chave}"`).not.toMatch(/^[A-Za-z]\)/);
      }
    }
  });
});

describe("capítulo `comprovante_inscricao` — as duas referências, as duas deslocadas", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "comprovante_inscricao")!;

  it("são 19 artigos, sem divergência da fonte", () => {
    expect(cap.artigos).toHaveLength(19);
    expect(cap.artigosNaFonte).toBeUndefined();
    // 11 itens + 2 subitens + 6 alíneas (4 em MAIÚSCULA e 2 em minúscula na fonte).
    const porNivel = [0, 1, 2].map((n) => cap.artigos.filter((a) => (a.nivel ?? 0) === n).length);
    expect(porNivel).toEqual([11, 2, 6]);
  });

  it("🔴 as duas referências deslocadas foram reapontadas por ÂNCORA", () => {
    // O 10.7 diz "subitem 9.3" para a listagem de confirmação, que é o 10.3; o 10.8 diz
    // "subitem 9.7" para o envelope do recurso, que é o 10.7. Um capítulo inteiro de
    // deslocamento, e o próprio texto do 10.7 descreve o alvo certo.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).toContain("{{item:listagem_confirmacao}}");
    expect(tudo).toContain("{{item:entrega_recurso_inscricao}}");
    expect([...cap.ancorasPublicadas].sort()).toEqual(["entrega_recurso_inscricao", "listagem_confirmacao"]);
  });

  it("⭐ CONTROLE: nenhuma referência por NÚMERO sobrou", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/subitens?\s+\d+\.\d/);
    expect(tudo).not.toMatch(/[Ii]tem\s+\d+\.\d/);
  });

  it("🔴 as QUATRO datas vêm do cronograma, e nenhuma ficou em prosa", () => {
    // O capítulo é o mais denso em data de todo o documento: pagamento, confirmação, recurso e
    // decisão do recurso. Literais, seriam quatro lugares para envelhecer em silêncio.
    for (const etapa of [
      "cronograma_pagamento_boleto",
      "cronograma_confirmacao_inscricao",
      "cronograma_recurso_inscricao",
      "cronograma_decisao_recurso_inscricao",
    ]) {
      expect(cap.camposUsados, `falta ${etapa}`).toContain(etapa);
    }
  });

  it("⚠️ a expressão 'primeiro dia útil subsequente' fica como REGRA, não como data", () => {
    // O 004 escreve o dia E a expressão — duas fontes para a mesma data. A data sai do
    // cronograma; a expressão explica de onde ela vem.
    const entrega = cap.artigos.find((a) => a.ancora === "entrega_recurso_inscricao")!;
    expect(entrega.texto).toContain("primeiro dia útil subsequente");
    expect(entrega.texto).toContain("{{campo:cronograma_recurso_inscricao}}");
  });

  it("o envelope usa a NATUREZA do certame, e o limite vem da coluna", () => {
    const envelope = cap.artigos.find((a) => a.texto.includes("{{campo:natureza_juridica}}"))!;
    expect(envelope.texto).toContain("{{campo:orgao_demandante}}");
    expect(cap.camposUsados).toContain("limite_envelopes");
    expect(cap.artigos.map((a) => a.texto).join(" ")).not.toMatch(/\bdois envelopes\b/);
  });

  it("⭐ CONTROLE: as seis alíneas são nível 2 — nem `a)` nem `A)` digitados", () => {
    // O capítulo 10 repete o achado do 9: `a)`/`b)` no 10.6.1 e `A)` a `D)` no 10.7.
    const alineas = cap.artigos.filter((a) => a.nivel === 2);
    expect(alineas).toHaveLength(6);
    for (const a of alineas) {
      expect(a.texto, `letra digitada: ${a.texto.slice(0, 40)}`).not.toMatch(/^[A-Za-z]\)/);
    }
  });

  it("⚠️ usa o termo da LBI, como o capítulo de requisitos", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).toContain("pessoas com deficiência");
    expect(tudo).not.toMatch(/Pessoa com Deficiência|portador/);
  });
});

describe("capítulo `condicoes_especiais_prova` — o defeito de NÚMERO REPETIDO", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "condicoes_especiais_prova")!;

  it("são 27 artigos, sem divergência da fonte", () => {
    expect(cap.artigos).toHaveLength(27);
    expect(cap.artigosNaFonte).toBeUndefined();
    const porNivel = [0, 1, 2].map((n) => cap.artigos.filter((a) => (a.nivel ?? 0) === n).length);
    expect(porNivel).toEqual([21, 4, 2]);
  });

  it("🔴 os DOIS subitens que o 004 numera igual existem, e são distintos", () => {
    // O Edital 004 chama de `11.4.1` tanto "DA DIFERENÇA DE CRITÉRIOS" quanto "DA ENTREGA
    // SEPARADA", e o seguinte é 11.4.2 — um dos dois fica sem endereço. Aqui os dois são
    // nível 1 na posição certa e `numerarItens` lhes dá números diferentes por construção.
    const subitens = cap.artigos.filter((a) => a.nivel === 1);
    expect(subitens).toHaveLength(4);
    expect(subitens[0].texto).toMatch(/diferença de critérios/i);
    expect(subitens[1].texto).toMatch(/entrega separada/i);
  });

  it("🔴 o subitem da prótese vem DEPOIS do item da prótese", () => {
    // No 004 ele é numerado `11.8.1` (prova ampliada) e está logo abaixo do 11.10 (prótese):
    // número e posição se contradizem. Aqui a posição é a única coisa que existe.
    const i = cap.artigos.findIndex((a) => a.texto.includes("prótese ou aparelho auditivo"));
    expect(i).toBeGreaterThan(-1);
    expect(cap.artigos[i + 1].nivel).toBe(1);
    expect(cap.artigos[i + 1].texto).toMatch(/retirar o aparelho auditivo/);
  });

  it("⭐ CONTROLE: nenhuma referência por NÚMERO sobrou — o 11.21 tinha duas", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/subitens?\s+\d+\.\d/);
    expect(tudo).not.toMatch(/[Ii]tem\s+\d+\b/);
    // E as duas viraram a mesma âncora, porque o alvo é o mesmo item.
    const tardio = cap.artigos[cap.artigos.length - 1];
    expect(tardio.texto).toContain("{{item:entrega_documentacao_especial}}");
    expect(tardio.texto).toContain("naquele subitem");
  });

  it("🔴 os três valores da lactante são CAMPO, e nenhum ficou literal", () => {
    for (const campo of ["idade_maxima_lactente", "tempo_compensacao_lactante", "data_corte_lactante"]) {
      expect(cap.camposUsados, `falta ${campo}`).toContain(campo);
      expect(CAMPO_POR_CHAVE.has(campo), `campo "${campo}" fora do catálogo`).toBe(true);
    }
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    // Os números do 004: 6 meses, 30 minutos, e a data de corte escrita à mão.
    expect(tudo).not.toMatch(/6\s*\(seis\)\s*meses/i);
    expect(tudo).not.toMatch(/30\s*\(trinta\)\s*minutos/i);
    expect(tudo).not.toMatch(/16 de (março|setembro)/i);
  });

  it("⭐ CONTROLE: o tempo de compensação aparece DUAS vezes, e as duas como campo", () => {
    // O item do 004 diz "até 30 minutos" e "em exatamente 30 minutos" — o mesmo número em duas
    // pontas da mesma frase. Se só uma virasse campo, o documento se contradiria sozinho.
    const artigo = cap.artigos.find((a) => a.texto.includes("um único período"))!;
    expect(artigo.texto.match(/\{\{campo:tempo_compensacao_lactante\}\}/g)).toHaveLength(2);
  });

  it("consome a âncora dos documentos de PCD, em vez de repetir a lista", () => {
    const envelope = cap.artigos.find((a) => a.texto.includes("Envelope 1"))!;
    expect(envelope.texto).toContain("{{item:documentos_pcd}}");
    expect(cap.ancorasConsumidas).toContain("documentos_pcd");
  });

  it("⚠️ o que ficou literal é o que NÃO tem coluna — e é só isso", () => {
    // Registrado para a escolha não parecer descuido: sem fonte no banco, um `{{campo:}}`
    // seria marcador que nunca resolve. O texto é editável pela tela.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).toContain("Arial, tamanho 20");
    expect(tudo).toContain("60 (sessenta) minutos");
    expect(tudo).toContain("72 horas antes");
  });
});

describe("capítulo `prova_objetiva` — o maior, e o item que publica formulário", () => {
  const cap = CAPITULOS_DO_MODELO.find((c) => c.chave === "prova_objetiva")!;

  it("42 artigos contra 43 na fonte, com o motivo declarado", () => {
    expect(cap.artigos).toHaveLength(42);
    expect(cap.artigosNaFonte).toBe(43);
    expect(cap.porQueDiverge).toMatch(/mesma frase repetida por cargo/);
  });

  it("🔴 a composição por cargo é o QUADRO, não duas frases iguais", () => {
    // O 004 escreve a mesma composição duas vezes, uma por cargo. Num edital de oito cargos
    // seriam oito itens — e o quadro de `provas_disciplinas` já rende cargo × disciplina.
    const quadros = cap.artigos.filter((a) => a.tipo === "quadro");
    expect(quadros).toHaveLength(1);
    expect(quadros[0].quadroFonte).toBe("disciplinas");
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/Agente Comunitário|Endemias/);
    // E nenhum número de questão em prosa: quem os diz é o quadro.
    expect(tudo).not.toMatch(/\d+\s*\((dez|trinta|cinquenta)\)\s*questões/i);
  });

  it("🔴 a data da prova é CAMPO — o 004 publicou o formulário em branco", () => {
    // O item 12.4 saiu no Diário Oficial com "dia XX/xx/2026" e o negrito sem fechar. Com o
    // marcador, a data vem do cronograma e o linter acusa `campo-sem-valor` enquanto faltar.
    expect(cap.camposUsados).toContain("cronograma_prova_objetiva");
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/x{2,}/i);
  });

  it("🔴 a referência deslocada do 12.18 virou a FAIXA certa, por âncora", () => {
    // "subitens de 11.10 a 11.15" aponta, no capítulo 11, para a lactante. O alvo real é a
    // faixa do documento de identificação, aqui delimitada pelas duas âncoras.
    const artigo = cap.artigos.find((a) => a.texto.includes("não fará a prova"))!;
    expect(artigo.texto).toContain("{{item:documentos_no_dia}}");
    expect(artigo.texto).toContain("{{item:perda_do_documento}}");
    expect([...cap.ancorasPublicadas].sort()).toEqual(["documentos_no_dia", "perda_do_documento"]);
  });

  it("⭐ CONTROLE: nenhuma referência por NÚMERO sobrou", () => {
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/subitens?\s+(de\s+)?\d+\.\d/);
    expect(tudo).not.toMatch(/Quadro\s+(I|II|III)\b/);
    // E o conteúdo programático não cita número de anexo — é Anexo I no 12.3 e Anexo II no 004.
    expect(tudo).toContain("como anexo deste Edital");
    expect(tudo).not.toMatch(/Anexo\s+(I|II)\b/);
  });

  it("🔴 os valores POR CARGO não viraram campo — e nenhum ficou em prosa", () => {
    // `provas_objetivas_config` tem PK `edital_cargo_id`: duração, tempos e nota de corte são
    // por cargo, e `{{campo:}}` é escalar por edital. Qualificador por cargo foi rejeitado.
    const tudo = cap.artigos.map((a) => a.texto).join(" ");
    expect(tudo).not.toMatch(/3\s*\(três\)\s*horas/i);
    expect(tudo).not.toMatch(/50%/);
    expect(tudo).toContain("pontuação mínima indicada para o seu cargo");
    // Os três tempos ficam como instrução, NOMEANDO A TABELA de onde o número sai — e sem
    // exemplo numérico de propósito: um "ex.: 3 horas" na instrução é o número por cargo
    // convidando a ser copiado cegamente, que é o defeito que este capítulo evita.
    // ⚠️ A primeira versão deste caso reprovou por isso mesmo, e estava certa.
    const comInstrucao = cap.artigos.filter((a) => trechosARedigir(a.texto).some((t) => /provas_objetivas_config/.test(t)));
    expect(comInstrucao).toHaveLength(3);
  });

  it("as 16 alíneas da eliminação são nível 2, e o caput NÃO publica âncora", () => {
    const alineas = cap.artigos.filter((a) => a.nivel === 2);
    expect(alineas).toHaveLength(16);
    for (const a of alineas) {
      expect(a.texto, `letra digitada: ${a.texto.slice(0, 40)}`).not.toMatch(/^[a-p]\)/);
    }
  });

  it("⚠️ o 12.27 deixou de repetir o 12.19 palavra por palavra", () => {
    // No 004 os dois abrem com "Não haverá, sob qualquer pretexto, segunda chamada, nem
    // justificativa de falta" — o 12.19 para listar eliminações, o 12.27 para tratar da falta.
    const caput = cap.artigos.find((a) => a.texto.startsWith("Será eliminado"))!;
    expect(caput.texto).not.toMatch(/segunda chamada/);
    const ultimo = cap.artigos[cap.artigos.length - 1];
    expect(ultimo.texto).toMatch(/segunda chamada de prova/);
  });
});
