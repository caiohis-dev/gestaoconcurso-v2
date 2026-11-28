import type { Tables } from "@/integrations/supabase/types";
import { ESTADO_CIVIL_MAP, RACA_MAP, GRAU_INSTRUCAO_MAP } from "@/lib/constants";

/**
 * Exportação DAF — a planilha de colaboradores de uma prova FINALIZADA, botão
 * "Exportação DAF" de `GerenciarProva`.
 *
 * 🔴 **É o arquivo que vira dinheiro.** O módulo Financeiro lê esta planilha e gera a
 * remessa PIX (CNAB 240) a partir dela: os cabeçalhos abaixo são os rótulos que
 * `sugerirMapeamento` (`financeiro-planilha-pagamentos.ts`) procura. Renomear uma
 * coluna aqui quebra o mapeamento automático de lá — e é isso que
 * `exportacao-daf.test.ts` guarda.
 *
 * 🔴 **O valor é AO VIVO** (decisão do usuário, 2026-11-27): "Valor Líquido" vem de
 * `valores_funcao_prova`, não de `colaboradores_prova.valor_pagamento` — coluna que
 * nenhuma tela preenche (977/977 NULL medidos). O que impede o arquivo de mudar depois
 * da prova é o trigger `check_valor_de_prova_finalizada` (PF001).
 *
 * Extraída de `GerenciarProva.tsx` em 2026-11-27 sem mudar comportamento: até então
 * eram ~100 linhas de regra de pagamento dentro da página, sem nenhum teste.
 */

type Colaborador = Pick<
  Tables<"colaboradores">,
  | "colab_matricula"
  | "colab_nome_completo"
  | "colab_cpf"
  | "colab_pis"
  | "colab_data_nascimento"
  | "colab_rua"
  | "colab_numero_casa"
  | "colab_complemento_endereco"
  | "colab_bairro"
  | "colab_cidade"
  | "colab_cep"
  | "colab_telefone"
  | "colab_estado_civil"
  | "colab_raca"
  | "colab_grau_instrucao"
  | "colab_chave_pix"
  | "colab_deficiente"
>;

/** Uma linha de `colaboradores_prova` com os joins que a exportação usa. */
export interface AlocacaoParaDaf {
  funcao_id: string | null;
  colaboradores: Colaborador | null;
  funcoes_colaboradores: { cargo_nome: string | null; cargo_cbo: string | null } | null;
  prova_unidades: { unidades_prova: { unid_sigla: string | null } | null } | null;
}

/** As colunas, NA ORDEM do arquivo. É o contrato com o Financeiro — ver o cabeçalho. */
export const COLUNAS_DAF = [
  "Edital",
  "Sigla Unidade",
  "Matrícula",
  "Nome Completo",
  "Função",
  "CBO",
  "Valor Líquido",
  "CPF",
  "PIS",
  "Data Nascimento",
  "Rua",
  "Número",
  "Complemento",
  "Bairro",
  "Cidade",
  "CEP",
  "Telefone",
  "Estado Civil",
  "Estado Civil (Descrição)",
  "Raça",
  "Raça (Descrição)",
  "Grau Instrução",
  "Grau Instrução (Descrição)",
  "Chave PIX",
  "PcD",
] as const;

export type LinhaDaf = Record<(typeof COLUNAS_DAF)[number], string | number>;

const descricao = (mapa: Record<number, string>, codigo: number | null | undefined) =>
  codigo ? (mapa[codigo] ?? "") : "";

/**
 * Monta as linhas da planilha.
 *
 * @param valoresPorFuncao `funcao_id → valor_pagamento` de `valores_funcao_prova` desta
 *   prova. Função sem valor sai com "Valor Líquido" em BRANCO — e o Financeiro recusa
 *   a linha de forma visível ("valor em branco"), não paga zero.
 */
export function linhasDaExportacaoDaf(
  alocacoes: AlocacaoParaDaf[],
  valoresPorFuncao: Record<string, number>,
  nomeEdital: string,
): LinhaDaf[] {
  const linhas: LinhaDaf[] = alocacoes.map((cp) => {
    const colab = cp.colaboradores;
    return {
      "Edital": nomeEdital,
      "Sigla Unidade": cp.prova_unidades?.unidades_prova?.unid_sigla?.trim() || "",
      "Matrícula": colab?.colab_matricula || "",
      "Nome Completo": colab?.colab_nome_completo || "",
      "Função": cp.funcoes_colaboradores?.cargo_nome || "",
      "CBO": cp.funcoes_colaboradores?.cargo_cbo || "",
      "Valor Líquido": cp.funcao_id ? (valoresPorFuncao[cp.funcao_id] ?? "") : "",
      "CPF": colab?.colab_cpf?.trim() || "",
      "PIS": colab?.colab_pis || "",
      "Data Nascimento": colab?.colab_data_nascimento || "",
      "Rua": colab?.colab_rua || "",
      "Número": colab?.colab_numero_casa?.toString() || "",
      "Complemento": colab?.colab_complemento_endereco || "",
      "Bairro": colab?.colab_bairro || "",
      "Cidade": colab?.colab_cidade || "",
      "CEP": colab?.colab_cep?.toString() || "",
      "Telefone": colab?.colab_telefone?.toString() || "",
      "Estado Civil": colab?.colab_estado_civil ?? "",
      "Estado Civil (Descrição)": descricao(ESTADO_CIVIL_MAP, colab?.colab_estado_civil),
      "Raça": colab?.colab_raca ?? "",
      "Raça (Descrição)": descricao(RACA_MAP, colab?.colab_raca),
      "Grau Instrução": colab?.colab_grau_instrucao ?? "",
      "Grau Instrução (Descrição)": descricao(GRAU_INSTRUCAO_MAP, colab?.colab_grau_instrucao),
      "Chave PIX": colab?.colab_chave_pix || "",
      "PcD": colab?.colab_deficiente ? "Sim" : "Não",
    };
  });

  // 🔵 A ordem do ARQUIVO é decidida aqui, e não pelo banco: a consulta ordena por `id`
  // porque o laço de fatias exige ordem estável, mas `id` é uuid e sairia embaralhado.
  // Unidade e depois nome é a ordem de conferência de uma folha de colaboradores.
  return linhas.sort(
    (a, b) =>
      String(a["Sigla Unidade"]).localeCompare(String(b["Sigla Unidade"]), "pt-BR") ||
      String(a["Nome Completo"]).localeCompare(String(b["Nome Completo"]), "pt-BR"),
  );
}

/** `colaboradores_<edital>.xls` — espaços viram `_`; sem edital, `colaboradores_prova.xls`. */
export function nomeDoArquivoDaf(nomeEdital: string | null | undefined): string {
  return `colaboradores_${(nomeEdital ?? "").replace(/\s+/g, "_") || "prova"}.xls`;
}

/** Uma linha de `prova_unidades` com o que a checagem pré-DAF precisa. */
export interface UnidadeParaChecagemDaf {
  ocorrencias_encerradas: boolean;
  unidades_prova: { unid_sigla: string | null; unid_nome: string | null } | null;
}

/**
 * As unidades da prova que AINDA NÃO encerraram o registro de ocorrências — rótulos
 * prontos para listar, em ordem. Vazio = o DAF pode sair.
 *
 * Por que é pré-condição (decisão do usuário, 2026-11-27): ocorrência é o que tira gente
 * do pagamento — uma falta remove o colaborador de `colaboradores_prova` (migration
 * `20260923232343`). Exportar antes de toda unidade fechar o registro geraria um arquivo
 * de pagamento com quem ainda pode sair dele.
 *
 * O flag é `prova_unidades.ocorrencias_encerradas` (NOT NULL, default false), gravado só
 * pela RPC `encerrar_ocorrencias_unidade` — e irreversível pelo app.
 */
export function unidadesComOcorrenciasAbertas(unidades: UnidadeParaChecagemDaf[]): string[] {
  return unidades
    .filter((u) => !u.ocorrencias_encerradas)
    .map((u) => {
      // `trim`: `unid_sigla` é CHAR e chega com espaços à direita.
      const sigla = u.unidades_prova?.unid_sigla?.trim();
      const nome = u.unidades_prova?.unid_nome?.trim();
      return [sigla, nome].filter(Boolean).join(" — ") || "Unidade sem nome";
    })
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}
