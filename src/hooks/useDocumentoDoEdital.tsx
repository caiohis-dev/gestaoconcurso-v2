/**
 * O edital montado, pronto para desenhar ou exportar.
 *
 * 🔴 **`documento` é `undefined` até TUDO ter chegado**: capítulos, artigos, valores dos
 * campos, o dado dos cinco quadros e o dos dois anexos. Montar com uma parte faltando
 * produziria um documento plausível e incompleto (um `{{campo:}}` como `[?campo:…]`, um quadro como pendência) — e
 * um arquivo exportado nesse instante sairia assim, sem erro nenhum.
 *
 * ⚠️ As consultas são as mesmas dos editores (mesmas chaves de React Query): montar o
 * documento não gera tráfego novo numa tela que já está aberta.
 */
import { useMemo } from "react";
import { useEdital } from "@/hooks/useEdital";
import { useEditalItens } from "@/hooks/useEditalItens";
import { useCamposDoEdital } from "@/hooks/useCamposDoEdital";
import { useDadosDosQuadros } from "@/hooks/useQuadrosDoEdital";
import { useConteudoProgramatico } from "@/hooks/useConteudoProgramatico";
import { useTerritorialidade } from "@/hooks/useTerritorialidade";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import {
  montarEditalCompleto,
  type DadosDosAnexos,
  type DocumentoMontado,
} from "@/lib/edital-documento";
import { pendenciasDaExportacao, type PendenciaDeExportacao } from "@/lib/edital-exportacao";
import { conferenciasDoEdital } from "@/lib/edital-conferencias";
import { useDadosDasConferencias } from "@/hooks/useConferenciasDoEdital";

/**
 * O dado dos dois anexos. `undefined` enquanto carrega, pela mesma razão dos quadros.
 *
 * 🔴 A abrangência vem de `useTerritorialidade`, que a lê por `buscarEmFatias`: são 843
 * logradouros num edital só, 84% do teto de 1.000 do PostgREST. Um select solto aqui
 * devolveria 1.000 no dia em que passasse, e o anexo sairia com uma rua faltando, sem erro.
 */
function useDadosDosAnexos(editalId: string | undefined): DadosDosAnexos | undefined {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const conteudo = useConteudoProgramatico(editalId);
  const territorio = useTerritorialidade(editalId, cargosDoEdital.map((c) => c.id));
  const carregando = !editalId || conteudo.isLoading || territorio.isLoading;
  return useMemo(
    () => (carregando ? undefined : { ementas: conteudo.ementas, abrangencia: territorio.abrangencia }),
    [carregando, conteudo.ementas, territorio.abrangencia],
  );
}

export function useDocumentoDoEdital(editalId: string | undefined): {
  documento: DocumentoMontado | undefined;
  /** O que o portão da exportação cobra. `undefined` junto com o documento. */
  pendencias: PendenciaDeExportacao[] | undefined;
  isLoading: boolean;
} {
  const { edital, documento: capitulos, isLoading: carregandoEdital } = useEdital(editalId);
  const { itens, porCapitulo, isLoading: carregandoItens } = useEditalItens(editalId);
  const { valores } = useCamposDoEdital(editalId);
  const quadros = useDadosDosQuadros(editalId);
  const anexos = useDadosDosAnexos(editalId);
  const dadosDosPaineis = useDadosDasConferencias(editalId);

  // ⚠️ `!edital` conta como carregando: sem a linha de `editais` o cabeçalho sairia todo em
  // pendência — plausível e falso. Se a consulta FALHOU, quem diz é o portão (`falha` vem antes).
  const isLoading =
    carregandoEdital || !edital || carregandoItens || valores === undefined || quadros === undefined || anexos === undefined;

  const documento = useMemo(
    () =>
      isLoading || !edital
        ? undefined
        : montarEditalCompleto({ documento: capitulos, porCapitulo, valores, quadros, anexos, cabecalho: edital }),
    [isLoading, edital, capitulos, porCapitulo, valores, quadros, anexos],
  );

  // 🔴 `undefined` também enquanto o dado dos PAINÉIS carrega: avaliar sem ele seria
  // "nenhuma pendência de painel" por ignorância, e o portão liberaria.
  const pendencias = useMemo(
    () =>
      documento && valores && dadosDosPaineis
        ? pendenciasDaExportacao({
            capitulos,
            itens,
            valores,
            documento,
            conferencias: conferenciasDoEdital(capitulos, dadosDosPaineis),
          })
        : undefined,
    [documento, capitulos, itens, valores, dadosDosPaineis],
  );

  return { documento, pendencias, isLoading };
}
