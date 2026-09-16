/**
 * Catálogo canônico dos capítulos de um edital da FEVRE.
 *
 * 🔴 **Este arquivo é a fonte de verdade da ESTRUTURA do documento, e vive em código de
 * propósito** — não no banco. Assim ele é versionado, revisável em diff e testável como
 * dado puro. O banco guarda só o que varia POR EDITAL (`edital_capitulos`): quais
 * capítulos foram desligados, reordenados, e o texto de cada um.
 *
 * Consequência que vale saber: capítulo SEM linha no banco não é capítulo ausente — é
 * capítulo no padrão. Acrescentar uma entrada aqui vale para todos os editais que já
 * existem, sem migration de dados.
 *
 * ## A numeração NÃO mora aqui
 *
 * O `[n]` do material de referência é ORDEM NO CATÁLOGO, não o número publicado. Os dois
 * não coincidem, e a diferença foi medida nos três editais reais em 2026-09-16:
 *
 * | | capítulos | territorialidade | títulos | PCD cai em |
 * |---|---|---|---|---|
 * | Edital 002/2026 | 16 | não | sim | **7** |
 * | Edital 003/2026 | 15 | não | não | **7** |
 * | Edital 004/2026 | 16 | **sim** | não | **8** |
 *
 * O mesmo capítulo em três posições. Quem numera é `edital-numeracao.ts`, a partir dos
 * capítulos incluídos. Ver `my_rules/modulo_editais/00-Plano-v3.md`.
 */

export interface CapituloCatalogo {
  /** Slug estável. É por ela que a referência cruzada aponta — nunca pelo número. */
  chave: string;
  titulo: string;
  /**
   * Recebe número no documento publicado. O preâmbulo e os anexos não recebem:
   * são elementos pré e pós-textuais.
   */
  numerado: boolean;
  /**
   * Entra ligado num edital novo. ⚠️ `false` NÃO quer dizer "só para certo tipo de
   * concurso": qualquer capítulo é ligável em qualquer edital (decisão de 2026-09-16 —
   * um edital de ACS pode ter prova de títulos, e vice-versa). Isto é só o padrão.
   */
  padrao: boolean;
}

/**
 * Os 19 elementos do documento: preâmbulo + 17 capítulos numerados + anexos.
 *
 * ⚠️ A ORDEM DESTE ARRAY É A ORDEM DO DOCUMENTO. Inserir no meio muda a numeração de
 * todos os editais que não tenham ordem própria gravada — que é o comportamento certo,
 * mas é bom saber antes de reordenar por engano.
 */
export const CAPITULOS_CATALOGO: readonly CapituloCatalogo[] = [
  { chave: "preambulo",                 titulo: "Preâmbulo e Cabeçalho Institucional",                      numerado: false, padrao: true  },
  { chave: "disposicoes_preliminares",  titulo: "Das Disposições Preliminares",                             numerado: true,  padrao: true  },
  { chave: "quadro_de_cargos",          titulo: "Do Quadro de Cargos, Vagas, Vencimentos e Benefícios",     numerado: true,  padrao: true  },
  { chave: "atribuicoes_dos_cargos",    titulo: "Das Atribuições dos Cargos",                               numerado: true,  padrao: true  },
  { chave: "requisitos_investidura",    titulo: "Dos Requisitos Básicos para Investidura",                  numerado: true,  padrao: true  },
  // Condicional. Presente só no Edital 004 (ACS, por UBS/UBSF) entre os três de referência
  // — mas ligável em qualquer edital que tenha territorialidade ou polos regionais.
  { chave: "distribuicao_geografica",   titulo: "Da Distribuição Geográfica de Vagas",                      numerado: true,  padrao: false },
  { chave: "inscricao_e_pagamento",     titulo: "Dos Procedimentos para Inscrição e Forma de Pagamento",    numerado: true,  padrao: true  },
  { chave: "isencao_taxa",              titulo: "Da Isenção do Pagamento da Taxa de Inscrição",             numerado: true,  padrao: true  },
  { chave: "vagas_pcd",                 titulo: "Das Vagas Reservadas para Pessoas com Deficiência",        numerado: true,  padrao: true  },
  { chave: "vagas_cotas_raciais",       titulo: "Das Vagas Reservadas para Negros",                         numerado: true,  padrao: true  },
  { chave: "comprovante_inscricao",     titulo: "Do Comprovante e Confirmação da Inscrição",                numerado: true,  padrao: true  },
  { chave: "condicoes_especiais_prova", titulo: "Das Condições Especiais para Realização da Prova",         numerado: true,  padrao: true  },
  { chave: "prova_objetiva",            titulo: "Da Prova Objetiva",                                        numerado: true,  padrao: true  },
  { chave: "recursos_prova_objetiva",   titulo: "Dos Recursos da Prova Objetiva e Vista da Folha de Respostas", numerado: true, padrao: true },
  // Condicional. Presente só no Edital 002 (Magistério) entre os três — mas o Magistério
  // é o caso conhecido, não uma condição: ligável em qualquer edital.
  { chave: "prova_de_titulos",          titulo: "Da Prova de Títulos",                                      numerado: true,  padrao: false },
  { chave: "desempate_e_resultado",     titulo: "Dos Critérios de Desempate e Resultado Final",             numerado: true,  padrao: true  },
  { chave: "investidura_e_posse",       titulo: "Da Convocação e Investidura no Cargo",                     numerado: true,  padrao: true  },
  { chave: "disposicoes_gerais",        titulo: "Das Disposições Gerais",                                   numerado: true,  padrao: true  },
  { chave: "anexos",                    titulo: "Elementos Pós-textuais e Anexos",                          numerado: false, padrao: true  },
] as const;

/** Índice por chave — para resolver referência cruzada sem varrer o array. */
export const CAPITULO_POR_CHAVE: ReadonlyMap<string, CapituloCatalogo> = new Map(
  CAPITULOS_CATALOGO.map((c) => [c.chave, c]),
);

export function capituloExiste(chave: string): boolean {
  return CAPITULO_POR_CHAVE.has(chave);
}
