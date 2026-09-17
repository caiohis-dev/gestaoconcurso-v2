/**
 * O checklist de investidura — a fatia que mata o defeito de abertura do módulo.
 *
 * 🔴 **O CONTROLE POSITIVO DESTA BATERIA É UM PAR, e provar só metade não prova nada:**
 *   (1) num edital com Enfermeiro, o documento do COREN é legítimo e não acusa;
 *   (2) num edital só de ACS, o mesmo documento acusa.
 *
 * O risco R1 do roadmap é exatamente "testar só o caso feliz" — que foi o que aconteceu
 * no Edital 004/2026 e pôs a Certidão do COREN na posse de um Agente Comunitário.
 */
import { describe, it, expect } from "vitest";
import {
  conferirInvestidura,
  conselhosDoEdital,
  conselhoNoTexto,
  documentosDoConselho,
  DOCUMENTOS_PADRAO,
  type CargoDoEdital,
  type DocumentoInvestidura,
} from "@/lib/edital-investidura";

let seq = 0;
const doc = (nome: string, extra: Partial<DocumentoInvestidura> = {}): DocumentoInvestidura => ({
  id: `d${seq++}`,
  cargo_id: null,
  aplica_a_todos_os_cargos: true,
  nome_documento: nome,
  conselho_exigido: null,
  obrigatorio: true,
  ...extra,
});

const ENFERMEIRO: CargoDoEdital = {
  cargo_id: "c-enf", nome: "Enfermeiro", conselho_classe_obrigatorio: "COREN",
};
const ACS: CargoDoEdital = {
  cargo_id: "c-acs", nome: "Agente Comunitário de Saúde", conselho_classe_obrigatorio: "NENHUM",
};

const padrao = () => DOCUMENTOS_PADRAO.map((n) => doc(n));
const regras = (documentos: DocumentoInvestidura[], cargos: CargoDoEdital[]) =>
  conferirInvestidura({ documentos, cargos }).map((a) => a.regra);

describe("⭐ linha de base: o núcleo comum aos três editais", () => {
  it("os 10 documentos padrão não acusam nada, nem no edital de ACS nem no de Enfermeiro", () => {
    // Se a linha de base acusasse, qualquer outro caso deste arquivo viraria ruído.
    expect(conferirInvestidura({ documentos: padrao(), cargos: [ACS] })).toEqual([]);
    expect(
      regras([...padrao(), ...documentosDoConselho("COREN").map((n) =>
        doc(n, { conselho_exigido: "COREN" }))], [ENFERMEIRO]),
    ).toEqual([]);
  });

  it("⚠️ o padrão NÃO inclui ASO nem diploma — os três editais os escrevem diferente", () => {
    // O ASO é documento só no 002; nos outros dois está na frase de abertura. E o diploma
    // é por cargo: "do Curso exigido" (002), um por cargo (003), "do Ensino Médio" (004).
    // Pré-marcar qualquer um seria pôr na boca do edital o que ele não diz.
    // ⚠️ Fronteira de PALAVRA, e não `toContain`. A primeira versão deste caso falhou
    // porque "ASO" casa dentro de "caso declare" — o mesmo defeito de substring que
    // `conselhoNoTexto` já guarda para "CRM" dentro de "CRMV". Erro meu, pego pelo
    // próprio teste.
    const texto = DOCUMENTOS_PADRAO.join(" | ").toUpperCase();
    expect(texto).not.toMatch(/\bASO\b/);
    expect(texto).not.toMatch(/\bDIPLOMAS?\b/);
    expect(DOCUMENTOS_PADRAO).toHaveLength(10);
  });
});

describe("🎯 O PAR — o defeito do Edital 004, nas duas direções", () => {
  const CERTIDAO = "Certidão Nada Consta do COREN (Certidão Única Atualizada)";

  it("(1) ⭐ num edital COM Enfermeiro, a certidão do COREN é legítima", () => {
    const d = [...padrao(), doc(CERTIDAO, { conselho_exigido: "COREN" }),
               doc("Registro Ativo no COREN", { conselho_exigido: "COREN" })];
    expect(conferirInvestidura({ documentos: d, cargos: [ENFERMEIRO] })).toEqual([]);
  });

  it("🎯 (2) num edital SÓ DE ACS, a MESMA certidão acusa — é o item 15.8-L do 004", () => {
    // 🔴 É este caso que guarda o defeito real. O (1) sozinho passaria com a regra
    // simplesmente não acusando nada.
    const avisos = conferirInvestidura({
      documentos: [...padrao(), doc(CERTIDAO)],
      cargos: [ACS],
    });
    expect(avisos.map((a) => a.regra)).toEqual(["documento-de-conselho-nao-exigido"]);
    expect(avisos[0].severidade).toBe("erro");
    expect(avisos[0].mensagem).toContain("COREN");
    expect(avisos[0].mensagem).toContain("Edital 004");
  });

  it("🔴 e acusa mesmo SEM a coluna preenchida — é a brecha que o trigger não alcança", () => {
    // O trigger `IN001` só vê `conselho_exigido`. Quem cola a linha à mão deixa a coluna
    // vazia, e é aí que este módulo entra. O CASO 3e da bateria SQL prova que o banco
    // aceita essa linha de propósito.
    expect(regras([doc(CERTIDAO, { conselho_exigido: null })], [ACS]))
      .toContain("documento-de-conselho-nao-exigido");
  });

  it("🔴 o cargo com conselho 'NENHUM' NÃO abre brecha", () => {
    // 'NENHUM' é declaração de que o cargo não tem conselho — não um conselho.
    expect(conselhosDoEdital([ACS])).toEqual([]);
    expect(regras([doc(CERTIDAO)], [ACS])).toContain("documento-de-conselho-nao-exigido");
  });

  it("⭐ CONTROLE: com os DOIS cargos no mesmo edital, a certidão volta a ser legítima", () => {
    // É o par que prova que a regra olha o estado do edital, e não uma lista fixa: o
    // mesmo documento passa e falha conforme o elenco de cargos.
    expect(regras([doc(CERTIDAO, { conselho_exigido: "COREN" })], [ENFERMEIRO, ACS])).toEqual([]);
    expect(regras([doc(CERTIDAO, { conselho_exigido: "COREN" })], [ACS]))
      .toContain("documento-de-conselho-nao-exigido");
  });
});

describe("achar a sigla no texto livre", () => {
  it("acha pela sigla e pelo nome por extenso", () => {
    expect(conselhoNoTexto("Certidão Nada Consta do COREN")).toBe("COREN");
    expect(conselhoNoTexto("Registro no Conselho Regional de Enfermagem")).toBe("COREN");
    expect(conselhoNoTexto("registro ativo no coren-rj")).toBe("COREN");
  });

  it("🔴 sigla mais LONGA primeiro: CRMV não vira CRM, CRESS não vira CRC", () => {
    // Sem a ordenação por tamanho, um edital de Medicina Veterinária seria acusado de
    // exigir o conselho de medicina.
    expect(conselhoNoTexto("Registro no CRMV")).toBe("CRMV");
    expect(conselhoNoTexto("Registro no CRESS")).toBe("CRESS");
  });

  it("🔴 e a FRONTEIRA DE PALAVRA: sigla dentro de palavra comum NÃO casa", () => {
    // ⚠️ Este caso existe porque o de cima NÃO guardava a fronteira, e eu tinha escrito
    // que guardava. A falsificação provou: trocando a regex por `includes`, os 18 casos
    // seguiam verdes, porque a ordenação por tamanho já resolvia CRMV/CRM sozinha.
    // Armadilha 8 — teste verde afirmando uma proteção que não estava sendo exercitada.
    //
    // "MICROEMPREENDEDOR" contém "CRO", que é o Conselho Regional de Odontologia. Sem a
    // fronteira, um checklist que peça declaração de MEI seria acusado de exigir registro
    // no CRO — e quem redige aprenderia a ignorar o painel.
    expect(conselhoNoTexto("Declaração de MICROEMPREENDEDOR individual")).toBeNull();
    expect(conselhoNoTexto("Comprovante de MICROFILMAGEM do processo")).toBeNull();
    // ⭐ E o controle do outro lado: a sigla sozinha, como palavra, casa.
    expect(conselhoNoTexto("Registro no CRO")).toBe("CRO");
  });

  it("⭐ CONTROLE NEGATIVO: documento comum não vira conselho", () => {
    for (const n of DOCUMENTOS_PADRAO) expect(conselhoNoTexto(n)).toBeNull();
    expect(conselhoNoTexto("Comprovante de residência")).toBeNull();
  });
});

describe("as outras regras do checklist", () => {
  it("🎯 acusa conselho citado só no TEXTO, sem a coluna — como AVISO", () => {
    // O documento é legítimo; o problema é que, fora da coluna, ele não sai sozinho no
    // dia em que o cargo de Enfermeiro deixar o edital.
    const avisos = conferirInvestidura({
      documentos: [doc("Certidão Nada Consta do COREN"), doc("Registro Ativo no COREN")],
      cargos: [ENFERMEIRO],
    });
    expect(avisos.map((a) => a.regra)).toEqual(["conselho-so-no-texto", "conselho-so-no-texto"]);
    expect(avisos[0].severidade).toBe("aviso");
  });

  it("🔴 R3: cargo com conselho NÃO DECLARADO é avisado — nulo não vira 'nenhum'", () => {
    // Sem isto a regra degrada em silêncio: o documento do conselho nunca é oferecido, e
    // quem redige descobre quando o edital já saiu sem ele.
    const avisos = conferirInvestidura({
      documentos: padrao(),
      cargos: [{ cargo_id: "x", nome: "Fiscal", conselho_classe_obrigatorio: null }],
    });
    expect(avisos.map((a) => a.regra)).toEqual(["cargo-sem-conselho-declarado"]);
    expect(avisos[0].severidade).toBe("aviso");
    expect(avisos[0].mensagem).toContain("Fiscal");
  });

  it("⭐ CONTROLE NEGATIVO: 'NENHUM' é declaração, e não avisa", () => {
    expect(regras(padrao(), [ACS])).toEqual([]);
  });

  it("🎯 acusa o par INVERSO do 004: conselho exigido e nenhum documento dele", () => {
    // Um edital de Enfermeiro sem a certidão do COREN é tão errado quanto o 004 com ela.
    const avisos = conferirInvestidura({ documentos: padrao(), cargos: [ENFERMEIRO] });
    expect(avisos.map((a) => a.regra)).toEqual(["conselho-exigido-sem-documento"]);
    expect(avisos[0].mensagem).toContain("COREN");
  });

  it("acusa documento preso a cargo que não está no edital", () => {
    const avisos = conferirInvestidura({
      documentos: [doc("Diploma de Enfermeiro", { cargo_id: "c-enf", aplica_a_todos_os_cargos: false })],
      cargos: [ACS],
    });
    expect(avisos.map((a) => a.regra)).toContain("documento-de-cargo-fora-do-edital");
  });

  it("⭐ CONTROLE: checklist VAZIO não acusa nada", () => {
    // Capítulo ainda não preenchido é estado legítimo. Acusar encheria o painel desde o
    // primeiro minuto de um edital novo, e quem o vê aprende a ignorá-lo.
    expect(conferirInvestidura({ documentos: [], cargos: [ENFERMEIRO] })).toEqual([]);
    expect(conferirInvestidura({ documentos: [], cargos: [] })).toEqual([]);
  });
});

describe("os documentos que o conselho traz", () => {
  it("são os DOIS do Edital 003, que é de onde o 004 copiou um", () => {
    expect(documentosDoConselho("COREN")).toEqual([
      "Registro Ativo e regular com anuidade paga no COREN",
      "Certidão Nada Consta do COREN (Certidão Única Atualizada)",
    ]);
  });

  it("conselhosDoEdital junta, ordena e não repete", () => {
    expect(
      conselhosDoEdital([
        ENFERMEIRO, ACS,
        { cargo_id: "c2", nome: "Enfermeiro 2", conselho_classe_obrigatorio: "COREN" },
        { cargo_id: "c3", nome: "Médico", conselho_classe_obrigatorio: "CRM" },
      ]),
    ).toEqual(["COREN", "CRM"]);
  });
});
