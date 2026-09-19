/**
 * Os valores de `{{campo:}}` deste edital, já formatados.
 *
 * 🔴 **Este hook é a ÚNICA peça do mecanismo que fala com o banco.** O catálogo, a regex,
 * o resolvedor e os formatadores são função pura em `src/lib/edital-campos.ts`, testados
 * com os editais reais como fixture. É a mesma divisão das duas resoluções irmãs —
 * `resolverReferencias` recebe o documento pronto, `resolverReferenciasDeItem` recebe o
 * mapa de âncoras pronto — e é ela que mantém os 15 arquivos `edital-*.ts` puros.
 *
 * 🔴 **Nenhuma consulta nova.** Ele agrega hooks que a tela já monta, então o custo é
 * zero: o React Query devolve o mesmo cache que os painéis de capítulo já usam.
 *
 * ⚠️ **Enquanto carrega, devolve `undefined` — não um mapa vazio.** Um mapa vazio faria o
 * linter acusar dezenas de `campo-sem-valor` no primeiro frame e a prévia encher de
 * `[?campo:…]`, tudo sumindo sozinho um instante depois. É a armadilha "vazio enquanto
 * carrega", um dos dois padrões de defeito que mais se repetem neste repo — e a regra do
 * linter já está desenhada para não rodar sem o mapa.
 */
import { useMemo } from "react";
import { useEdital, type EditalMetadados } from "@/hooks/useEdital";
import { useCronograma } from "@/hooks/useCronograma";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCargos } from "@/hooks/useCargos";
import { useInscricao } from "@/hooks/useInscricao";
import { useAcoesAfirmativas } from "@/hooks/useAcoesAfirmativas";
import {
  formatarDataExtenso,
  formatarInteiro,
  formatarNatureza,
  formatarPercentual,
  formatarTexto,
  juntarComE,
} from "@/lib/edital-campos";
import { formatarDatasDaEtapa } from "@/lib/edital-cronograma";


/** Um par chave→valor pronto para o mapa. `null` significa "não entra". */
type Par = readonly [string, string | null];

/**
 * Os escalares que moram em colunas de `editais`.
 *
 * ⚠️ Mora fora do hook porque o `useMemo` passou de 15 de complexidade no lint com tudo junto —
 * cada `?.` e cada `??` conta. Extrair é a saída deste repo; elevar o baseline não é.
 */
function paresDoEdital(edital: EditalMetadados): Par[] {
  return [
    ["numero_edital", formatarTexto(edital.numero_edital)],
    ["orgao_demandante", formatarTexto(edital.orgao_demandante)],
    ["entidade_executora", formatarTexto(edital.entidade_executora)],
    ["decreto_autorizador", formatarTexto(edital.decreto_autorizador)],
    ["prazo_validade_anos", formatarInteiro(edital.prazo_validade_anos)],
    ["natureza_juridica", formatarNatureza(edital.natureza_juridica)],
    ["regime_trabalho", formatarTexto(edital.regime_trabalho)],
    ["site_oficial", formatarTexto(edital.site_oficial)],
    ["executora_endereco", formatarTexto(edital.executora_endereco)],
    ["signatario_nome", formatarTexto(edital.signatario_nome)],
    ["signatario_cargo", formatarTexto(edital.signatario_cargo)],
    ["data_publicacao", formatarDataExtenso(edital.data_publicacao)],
  ];
}

/**
 * Os escalares DERIVADOS das regras de INSCRIÇÃO.
 *
 * ⚠️ Separado de `paresDasAcoesAfirmativas` só por complexidade de lint: juntas, as duas listas
 * passavam de 15 (cada `?.` e cada `??` conta). Extrair é a saída deste repo.
 */
function paresDaInscricao(
  criterios: ReturnType<typeof useInscricao>["criterios"],
  configDeInscricao: ReturnType<typeof useInscricao>["config"],
): Par[] {
  const doador = criterios.find((c) => c.tipo_criterio === "DOADOR_SANGUE_OU_MEDULA");
  return [
    ["minimo_doacoes_sangue", formatarInteiro(doador?.minimo_doacoes_sangue_12m ?? null)],
    ["limite_envelopes", formatarInteiro(configDeInscricao?.limite_envelopes_por_candidato ?? null)],
  ];
}

/**
 * Os escalares DERIVADOS das regras de ação afirmativa.
 *
 * 🔴 Todos já têm coluna, e é por isso que estão aqui em vez de literais no texto do modelo. O
 * percentual é o mais crítico: `edital-cotas.ts` CALCULA a reserva do Quadro I a partir dele, e um
 * número literal no documento divergiria do quadro em silêncio.
 */
function paresDasAcoesAfirmativas(
  pcd: ReturnType<typeof useAcoesAfirmativas>["pcd"],
  cotas: ReturnType<typeof useAcoesAfirmativas>["cotas"],
): Par[] {
  return [
    ["percentual_pcd", formatarPercentual(pcd?.percentual_reserva ?? null)],
    ["leis_pcd", formatarTexto(pcd?.leis_base ?? null)],
    ["validade_laudo_temporario_meses", formatarInteiro(pcd?.validade_meses_laudo_temporario ?? null)],
    ["local_pericia", formatarTexto(pcd?.local_pericia ?? null)],
    ["percentual_cotas_raciais", formatarPercentual(cotas?.percentual_reserva ?? null)],
    ["lei_cotas_raciais", formatarTexto(cotas?.lei_base ?? null)],
  ];
}

export function useCamposDoEdital(editalId: string | undefined) {
  const { edital, isLoading: carregandoEdital } = useEdital(editalId);
  const { etapas, isLoading: carregandoCronograma } = useCronograma(editalId);
  const { cargosDoEdital, isLoading: carregandoEditalCargos } = useEditalCargos(editalId);
  const { cargos, isLoading: carregandoCatalogoDeCargos } = useCargos();
  const { criterios, config: configDeInscricao, isLoading: carregandoInscricao } = useInscricao(editalId);
  const { pcd, cotas, isLoading: carregandoAcoes } = useAcoesAfirmativas(editalId);

  // 🔴 O `isLoading` de `useCargos` ESTÁ nesta conta, e faltava na primeira versão — era um
  // defeito de verdade. `cargos_do_edital` cruza `edital_cargos` com o catálogo de nomes: se
  // o catálogo ainda não chegou, a frase de abertura sai com MENOS cargos, ou nenhum. Isso é
  // valor ERRADO, não valor ausente — o marcador resolve, o linter cala, e o edital publica
  // "inscrições para Agente Comunitário de Saúde" onde há dois cargos. É o padrão que
  // `useCargos` avisa no próprio retorno: quem consome precisa distinguir "ainda não sei" de
  // "não há".
  const isLoading =
    carregandoEdital ||
    carregandoCronograma ||
    carregandoEditalCargos ||
    carregandoCatalogoDeCargos ||
    carregandoInscricao ||
    carregandoAcoes;

  const valores = useMemo(() => {
    if (isLoading || !edital) return undefined;

    const m = new Map<string, string>();
    // 🔴 `por` descarta null, undefined E string vazia. Ausente e vazio são a MESMA coisa
    // aqui de propósito: um "" no mapa resolveria o marcador para nada, deixando um buraco
    // invisível no meio da frase. `[?campo:x]` é feio, e é por isso que funciona.
    const por = (chave: string, valor: string | null) => {
      if (valor) m.set(chave, valor);
    };

    for (const [chave, valor] of paresDoEdital(edital)) por(chave, valor);
    for (const [chave, valor] of paresDaInscricao(criterios, configDeInscricao)) por(chave, valor);
    for (const [chave, valor] of paresDasAcoesAfirmativas(pcd, cotas)) por(chave, valor);

    // 🔴 Os cargos numa frase — ESCALAR derivado de coleção, não valor por cargo.
    //
    // ⚠️ Ordem ALFABÉTICA, e é escolha forçada: `edital_cargos` não tem coluna `ordem`, e a ordem
    // em que o banco devolve as linhas não é ordem nenhuma. Sem ordenar, a frase de abertura do
    // edital trocaria de forma entre dois carregamentos da mesma tela — o mesmo motivo que fez
    // `ordenarItens` desempatar por `created_at`.
    //
    // ⚠️ Um cargo sem nome no catálogo é IMPOSSÍVEL com os dois carregados (`cargo_id` é FK para
    // `cargos`). O `filter` é rede, não regra; se um dia descartar algo de verdade, a frase
    // encurta calada, e o lugar de consertar é aqui.
    const nomesDosCargos = cargosDoEdital
      .map((ec) => cargos.find((c) => c.id === ec.cargo_id)?.nome)
      .filter((n): n is string => !!n)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    por("cargos_do_edital", juntarComE(nomesDosCargos));

    // ⚠️ A etapa entra pela CHAVE do catálogo. Etapa própria do autor (`chave` nula) não
    // vira campo: ela não tem nome estável para um marcador apontar, e inventar um a
    // partir do `nome_evento` quebraria todo texto no dia em que alguém renomeasse a etapa.
    for (const e of etapas) {
      if (!e.chave) continue;
      por(`cronograma_${e.chave}`, formatarDatasDaEtapa(e) || null);
    }

    return m as ReadonlyMap<string, string>;
  }, [isLoading, edital, etapas, cargosDoEdital, cargos, criterios, configDeInscricao, pcd, cotas]);

  return { valores, isLoading };
}
