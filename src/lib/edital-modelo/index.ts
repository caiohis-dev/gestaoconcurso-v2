/**
 * O EDITAL MODELO — o índice dos capítulos já transcritos.
 *
 * 🔴 **O modelo é a soma dos capítulos que EXISTEM, e por isso nunca há meio-estado.** Numa
 * empreitada de 19 rodadas, a tentação é tratar o intervalo como incompleto; aqui ele é um
 * modelo completo de N capítulos, e a clonagem copia exatamente o que há. Cada rodada
 * acrescenta um arquivo, uma entrada nesta lista e sobe a `VERSAO`.
 *
 * ⚠️ A ORDEM desta lista é irrelevante para o documento: quem ordena é o catálogo de
 * `edital-capitulos.ts`, e o número sai de `numerarItens`. Aqui a ordem é só a de leitura.
 */
import { ATRIBUICOES_DOS_CARGOS } from "@/lib/edital-modelo/atribuicoes-dos-cargos";
import { COMPROVANTE_INSCRICAO } from "@/lib/edital-modelo/comprovante-inscricao";
import { CONDICOES_ESPECIAIS_PROVA } from "@/lib/edital-modelo/condicoes-especiais-prova";
import { PROVA_OBJETIVA } from "@/lib/edital-modelo/prova-objetiva";
import { DISPOSICOES_PRELIMINARES } from "@/lib/edital-modelo/disposicoes-preliminares";
import { DISTRIBUICAO_GEOGRAFICA } from "@/lib/edital-modelo/distribuicao-geografica";
import { INSCRICAO_E_PAGAMENTO } from "@/lib/edital-modelo/inscricao-e-pagamento";
import { ISENCAO_TAXA } from "@/lib/edital-modelo/isencao-taxa";
import { PREAMBULO } from "@/lib/edital-modelo/preambulo";
import { VAGAS_COTAS_RACIAIS } from "@/lib/edital-modelo/vagas-cotas-raciais";
import { VAGAS_PCD } from "@/lib/edital-modelo/vagas-pcd";
import { QUADRO_DE_CARGOS } from "@/lib/edital-modelo/quadro-de-cargos";
import { REQUISITOS_INVESTIDURA } from "@/lib/edital-modelo/requisitos-investidura";
import type { ArtigoDoModelo, CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export type { ArtigoDoModelo, CapituloDoModelo };

/**
 * A versão do texto padrão. Sobe a cada rodada de capítulo.
 *
 * ⚠️ Ela vive TAMBÉM na coluna `editais.modelo_versao` da linha do modelo, gravada pela
 * migration de cada rodada — e é de lá que a clonagem a lê, nunca daqui. Este valor existe
 * para a migration ser gerada a partir de um lugar só; o teste confere que os dois batem.
 */
export const VERSAO = "1.0";

export const CAPITULOS_DO_MODELO: readonly CapituloDoModelo[] = [
  PREAMBULO,
  DISPOSICOES_PRELIMINARES,
  QUADRO_DE_CARGOS,
  ATRIBUICOES_DOS_CARGOS,
  REQUISITOS_INVESTIDURA,
  DISTRIBUICAO_GEOGRAFICA,
  INSCRICAO_E_PAGAMENTO,
  ISENCAO_TAXA,
  VAGAS_PCD,
  VAGAS_COTAS_RACIAIS,
  COMPROVANTE_INSCRICAO,
  CONDICOES_ESPECIAIS_PROVA,
  PROVA_OBJETIVA,
];

export const CAPITULO_DO_MODELO_POR_CHAVE: ReadonlyMap<string, CapituloDoModelo> = new Map(
  CAPITULOS_DO_MODELO.map((c) => [c.chave, c]),
);

/**
 * As âncoras que um capítulo já transcrito CONSOME e que ainda não existem porque o capítulo
 * dono não foi transcrito.
 *
 * 🔴 **É uma lista BURN-DOWN, não uma lista de exceções.** Cada rodada a encurta, e o teste
 * da rodada final exige que ela esteja vazia. Enquanto uma âncora está aqui, o modelo emite o
 * `{{item:}}` mesmo assim: a prévia mostra `[?item:…]` e o linter conta. Visível, contado,
 * decrescente — o contrato do módulo.
 */
export const ANCORAS_PENDENTES: ReadonlyArray<{ ancora: string; capituloPrevisto: string }> = [];

/** Os artigos do modelo, de todos os capítulos ou só dos pedidos. */
export function artigosDoModelo(
  chaves?: readonly string[],
): { capituloChave: string; ordem: number; artigo: ArtigoDoModelo }[] {
  const escolhidos = chaves
    ? CAPITULOS_DO_MODELO.filter((c) => chaves.includes(c.chave))
    : CAPITULOS_DO_MODELO;

  return escolhidos.flatMap((cap) =>
    cap.artigos.map((artigo, ordem) => ({ capituloChave: cap.chave, ordem, artigo })),
  );
}

/** Escapa uma string para literal SQL — só o apóstrofo precisa, e ele dobra. */
function literal(valor: string | null): string {
  return valor === null ? "NULL" : `'${valor.replace(/'/g, "''")}'`;
}

/**
 * O `INSERT` de um capítulo no edital modelo, como a migration da rodada o carrega.
 *
 * 🔴 **Guardado por `NOT EXISTS` do CAPÍTULO, não do edital.** É a diferença entre uma
 * rodada nova alcançar um modelo que já existe e não alcançar: guardando pelo edital, a
 * primeira rodada semearia e todas as seguintes seriam no-op num banco que já tem o modelo.
 * Guardando pelo capítulo, cada rodada entra uma vez e **nenhuma sobrescreve capítulo que
 * alguém já editou pela tela**.
 *
 * ⚠️ Esta função é a fonte da migration, e o teste confere que o arquivo commitado é igual
 * ao que ela produz. Editar a migration à mão é o jeito de o modelo nascer diferente do que
 * a suíte afirma.
 */
export function sqlDoCapitulo(chave: string): string {
  const cap = CAPITULO_DO_MODELO_POR_CHAVE.get(chave);
  if (!cap) throw new Error(`Capítulo "${chave}" não está no modelo.`);

  const linhas = cap.artigos.map((a, ordem) =>
    "    (v_modelo, " +
    [
      literal(cap.chave),
      String(ordem),
      String(a.nivel ?? 0),
      literal(a.tipo),
      literal(a.texto),
      literal(a.ancora ?? null),
      literal(a.quadroFonte ?? null),
    ].join(", ") +
    ")",
  );

  return [
    "DO $$",
    "DECLARE",
    "  v_modelo UUID;",
    "BEGIN",
    "  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;",
    "  IF v_modelo IS NULL THEN RETURN; END IF;",
    "",
    `  IF EXISTS (SELECT 1 FROM public.edital_itens`,
    `             WHERE edital_id = v_modelo AND capitulo_chave = ${literal(cap.chave)}) THEN`,
    "    RETURN;",
    "  END IF;",
    "",
    "  INSERT INTO public.edital_itens",
    "    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)",
    "  VALUES",
    linhas.join(",\n") + ";",
    "END $$;",
  ].join("\n");
}
