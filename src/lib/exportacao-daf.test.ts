import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  COLUNAS_DAF,
  linhasDaExportacaoDaf,
  nomeDoArquivoDaf,
  unidadesComOcorrenciasAbertas,
  type AlocacaoParaDaf,
} from "@/lib/exportacao-daf";
import {
  COLUNAS_SISTEMA,
  sugerirMapeamento,
  lerPagamentosDaPlanilha,
} from "@/lib/financeiro-planilha-pagamentos";
import { lerPlanilha } from "@/lib/financeiro-ler-planilha";

/**
 * A Exportação DAF é a ENTRADA do módulo Financeiro (remessa PIX). Este arquivo guarda
 * duas coisas: o que cada coluna carrega, e o contrato entre os dois módulos — que até
 * 2026-11-27 estava escrito em dois lugares sem nada conferindo um contra o outro.
 */

const FISCAL = "func-fiscal";
const PORTEIRO = "func-porteiro";

/** CPFs com dígito verificador VÁLIDO — o Financeiro recusa CPF inválido. */
const CPF_A = "52998224725";
const CPF_B = "11144477735";

function alocacao(over: Partial<AlocacaoParaDaf> & { colab?: Partial<NonNullable<AlocacaoParaDaf["colaboradores"]>> } = {}): AlocacaoParaDaf {
  const { colab, ...resto } = over;
  return {
    funcao_id: FISCAL,
    funcoes_colaboradores: { cargo_nome: "Fiscal de Sala", cargo_cbo: "1234-56" },
    prova_unidades: { unidades_prova: { unid_sigla: "CGV       " } },
    colaboradores: {
      colab_matricula: "M-1",
      colab_nome_completo: "MARIA SOUZA",
      colab_cpf: ` ${CPF_A} `,
      colab_pis: "12345678901",
      colab_data_nascimento: "1990-05-10",
      colab_rua: "Rua A",
      colab_numero_casa: 12,
      colab_complemento_endereco: "Casa 2",
      colab_bairro: "Centro",
      colab_cidade: "Macaé",
      colab_cep: 27910000,
      colab_telefone: 22999998888,
      colab_estado_civil: 2,
      colab_raca: 8,
      colab_grau_instrucao: 7,
      colab_chave_pix: "maria@exemplo.com",
      colab_deficiente: false,
      ...colab,
    },
    ...resto,
  };
}

describe("linhasDaExportacaoDaf", () => {
  it("preenche cada coluna da fonte certa, na ordem do contrato", () => {
    const [linha] = linhasDaExportacaoDaf([alocacao()], { [FISCAL]: 150 }, "Edital 002/2026 - SMA");

    expect(Object.keys(linha)).toEqual([...COLUNAS_DAF]);
    expect(linha).toEqual({
      "Edital": "Edital 002/2026 - SMA",
      "Sigla Unidade": "CGV", // a sigla chega do banco com espaços à direita
      "Matrícula": "M-1",
      "Nome Completo": "MARIA SOUZA",
      "Função": "Fiscal de Sala",
      "CBO": "1234-56",
      "Valor Líquido": 150,
      "CPF": CPF_A,
      "PIS": "12345678901",
      "Data Nascimento": "1990-05-10",
      "Rua": "Rua A",
      "Número": "12",
      "Complemento": "Casa 2",
      "Bairro": "Centro",
      "Cidade": "Macaé",
      "CEP": "27910000",
      "Telefone": "22999998888",
      "Estado Civil": 2,
      "Estado Civil (Descrição)": "Casado(a)",
      "Raça": 8,
      "Raça (Descrição)": "Parda",
      "Grau Instrução": 7,
      "Grau Instrução (Descrição)": "Superior Completo",
      "Chave PIX": "maria@exemplo.com",
      "PcD": "Não",
    });
  });

  it("o valor é AO VIVO: vem de valores_funcao_prova, por função", () => {
    // Decisão de 2026-11-27: não existe valor congelado por alocação
    // (`colaboradores_prova.valor_pagamento` nunca é preenchido).
    const linhas = linhasDaExportacaoDaf(
      [
        alocacao(),
        alocacao({
          funcao_id: PORTEIRO,
          funcoes_colaboradores: { cargo_nome: "Porteiro", cargo_cbo: null },
          colab: { colab_nome_completo: "ZECA" },
        }),
      ],
      { [FISCAL]: 150, [PORTEIRO]: 90 },
      "E",
    );
    expect(linhas.map((l) => l["Valor Líquido"])).toEqual([150, 90]);
  });

  it("função sem valor e alocação sem função saem com o valor EM BRANCO, não zero", () => {
    // Em branco o Financeiro RECUSA a linha de forma visível; zero seria pagamento de R$ 0.
    const linhas = linhasDaExportacaoDaf(
      [alocacao(), alocacao({ funcao_id: null, colab: { colab_nome_completo: "ZECA" } })],
      {},
      "E",
    );
    expect(linhas.map((l) => l["Valor Líquido"])).toEqual(["", ""]);
  });

  it("valor 0 cadastrado sai como 0, e não como branco", () => {
    // `?? ""`, não `|| ""`: zero é valor válido (função não remunerada).
    const [linha] = linhasDaExportacaoDaf([alocacao()], { [FISCAL]: 0 }, "E");
    expect(linha["Valor Líquido"]).toBe(0);
  });

  it("sobrevive a joins nulos e códigos fora do mapa", () => {
    const [linha] = linhasDaExportacaoDaf(
      [
        {
          funcao_id: FISCAL,
          colaboradores: null,
          funcoes_colaboradores: null,
          prova_unidades: null,
        },
      ],
      { [FISCAL]: 10 },
      "E",
    );
    expect(linha["Nome Completo"]).toBe("");
    expect(linha["Sigla Unidade"]).toBe("");
    expect(linha["Estado Civil"]).toBe("");
    expect(linha["PcD"]).toBe("Não");

    const [codigoDesconhecido] = linhasDaExportacaoDaf(
      [alocacao({ colab: { colab_raca: 3, colab_deficiente: true } })],
      {},
      "E",
    );
    expect(codigoDesconhecido["Raça"]).toBe(3);
    expect(codigoDesconhecido["Raça (Descrição)"]).toBe("");
    expect(codigoDesconhecido["PcD"]).toBe("Sim");
  });

  it("ordena por unidade e depois por nome, com acento no lugar certo", () => {
    const linhas = linhasDaExportacaoDaf(
      [
        alocacao({ prova_unidades: { unidades_prova: { unid_sigla: "IEMM" } }, colab: { colab_nome_completo: "ANA" } }),
        alocacao({ colab: { colab_nome_completo: "ZECA" } }),
        alocacao({ colab: { colab_nome_completo: "ÁLVARO" } }),
      ],
      {},
      "E",
    );
    // `ÁLVARO` é U+00C1: com `<` em vez de localeCompare iria para depois de `ZECA`.
    expect(linhas.map((l) => `${l["Sigla Unidade"]}/${l["Nome Completo"]}`)).toEqual([
      "CGV/ÁLVARO",
      "CGV/ZECA",
      "IEMM/ANA",
    ]);
  });
});

describe("nomeDoArquivoDaf", () => {
  it("troca espaços por _ e cai em 'prova' sem edital", () => {
    expect(nomeDoArquivoDaf("Edital 002/2026 - SMA")).toBe("colaboradores_Edital_002/2026_-_SMA.xls");
    expect(nomeDoArquivoDaf(undefined)).toBe("colaboradores_prova.xls");
    expect(nomeDoArquivoDaf("")).toBe("colaboradores_prova.xls");
  });
});

/**
 * 🔴 O CONTRATO com o módulo Financeiro. Renomear uma coluna do DAF (ou um rótulo de
 * `COLUNAS_SISTEMA`) derruba estes casos — antes, só se descobria na hora de pagar,
 * com a tela de mapeamento do Financeiro pedindo para casar a coluna à mão.
 */
describe("contrato DAF → Financeiro", () => {
  it("o mapeamento automático encontra TODA coluna obrigatória do Financeiro", () => {
    const mapa = sugerirMapeamento([...COLUNAS_DAF]);
    const faltando = COLUNAS_SISTEMA.filter((c) => c.obrigatoria && mapa[c.id] === -1).map(
      (c) => c.label,
    );
    expect(faltando).toEqual([]);
  });

  it("e casa cada campo de dinheiro com a coluna CERTA do DAF", () => {
    // Encontrar "alguma" coluna não basta: valor casado com a coluna errada paga errado.
    const mapa = sugerirMapeamento([...COLUNAS_DAF]);
    const colunaDe = (id: keyof typeof mapa) => COLUNAS_DAF[mapa[id]];
    expect(colunaDe("nome")).toBe("Nome Completo");
    expect(colunaDe("cpf")).toBe("CPF");
    expect(colunaDe("valor")).toBe("Valor Líquido");
    expect(colunaDe("chavePix")).toBe("Chave PIX"); // casa `chave_pix` por normalização
    expect(colunaDe("siglaUnidade")).toBe("Sigla Unidade");
    expect(colunaDe("edital")).toBe("Edital");
    // "Estado Civil" não pode casar com "Estado Civil (Descrição)".
    expect(colunaDe("estadoCivil")).toBe("Estado Civil");
  });

  it("ponta a ponta: o .xls gerado como a página gera vira o pagamento certo no Financeiro", async () => {
    const linhas = linhasDaExportacaoDaf(
      [
        alocacao({ colab: { colab_cpf: CPF_A, colab_nome_completo: "MARIA SOUZA" } }),
        alocacao({
          funcao_id: PORTEIRO,
          funcoes_colaboradores: { cargo_nome: "Porteiro", cargo_cbo: null },
          colab: { colab_cpf: CPF_B, colab_nome_completo: "ZECA", colab_chave_pix: null },
        }),
      ],
      { [FISCAL]: 150 }, // Porteiro SEM valor: tem de ser recusado, não pago com zero
      "Edital 002/2026 - SMA",
    );

    // Mesmo caminho da página: json_to_sheet com o cabeçalho explícito, e `.xls` (BIFF8).
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas, { header: [...COLUNAS_DAF] }), "Colaboradores");
    const buffer = XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer;
    const file = new File([buffer], nomeDoArquivoDaf("Edital 002/2026 - SMA"));
    if (typeof file.arrayBuffer !== "function") {
      Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
    }

    const matriz = await lerPlanilha(file);
    const { pagamentos, recusadas } = lerPagamentosDaPlanilha(matriz, "28112026");

    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0]).toMatchObject({
      nomeFornecedor: "MARIA SOUZA",
      valorPagamento: 150,
      edital: "Edital 002/2026 - SMA",
      siglaUnidade: "CGV",
    });
    expect(pagamentos[0].cpfFornecedor).toContain(CPF_A);
    expect(recusadas).toHaveLength(1);
    expect(recusadas[0].nome).toBe("ZECA");
    expect(recusadas[0].motivo).toMatch(/valor/i);
  });
});

describe("unidadesComOcorrenciasAbertas", () => {
  const u = (sigla: string | null, nome: string | null, encerradas: boolean) => ({
    ocorrencias_encerradas: encerradas,
    unidades_prova: { unid_sigla: sigla, unid_nome: nome },
  });

  it("lista só as abertas, aparadas e em ordem", () => {
    expect(
      unidadesComOcorrenciasAbertas([
        u("IEMM      ", "I. E. MANUEL MARINHO", false),
        u("CGV       ", "COLÉGIO GETÚLIO VARGAS", true),
        u("CEF 01    ", "ESCOLA A", false),
      ]),
    ).toEqual(["CEF 01 — ESCOLA A", "IEMM — I. E. MANUEL MARINHO"]);
  });

  it("⭐ CONTROLE POSITIVO: todas encerradas = nada pendente", () => {
    expect(unidadesComOcorrenciasAbertas([u("A", "X", true), u("B", "Y", true)])).toEqual([]);
  });

  it("unidade sem join ainda aparece — pendente sem nome não pode sumir da lista", () => {
    expect(
      unidadesComOcorrenciasAbertas([{ ocorrencias_encerradas: false, unidades_prova: null }]),
    ).toEqual(["Unidade sem nome"]);
  });
});
