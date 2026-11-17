/**
 * O dado das DEZ conferências de painel, para o portão da exportação.
 *
 * 🔴 **`undefined` enquanto QUALQUER parte carrega.** Uma lista vazia aqui não é neutra:
 * `conferirInscricao` com zero canais, ou a matriz com zero disciplinas, produziria avisos
 * (ou deixaria de produzi-los) sobre um edital que não é este — "vazio enquanto carrega", o
 * padrão de defeito que mais se repetiu no repo.
 *
 * ⚠️ As consultas dependentes (`useProvaObjetiva`, `useTitulos`, `useTerritorialidade`)
 * recebem os ids dos cargos do edital; com a lista ainda vazia elas não buscam nada e dizem
 * "não carregando". Por isso a carga de `useEditalCargos` está na conta — é a guarda delas.
 *
 * As consultas são as mesmas dos painéis (mesmas chaves de React Query): numa tela aberta,
 * isto não gera tráfego novo. E por estarem montadas aqui, `useConsultasComErro` as enxerga.
 */
import { useMemo } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCargos } from "@/hooks/useCargos";
import { useCronograma } from "@/hooks/useCronograma";
import { useProvaObjetiva } from "@/hooks/useProvaObjetiva";
import { useTitulos } from "@/hooks/useTitulos";
import { useTerritorialidade } from "@/hooks/useTerritorialidade";
import { useInvestidura } from "@/hooks/useInvestidura";
import { useInscricao } from "@/hooks/useInscricao";
import { useDesempate } from "@/hooks/useDesempate";
import { useAcoesAfirmativas } from "@/hooks/useAcoesAfirmativas";
import { useConteudoProgramatico } from "@/hooks/useConteudoProgramatico";
import type { DadosDasConferencias } from "@/lib/edital-conferencias";

export function useDadosDasConferencias(editalId: string | undefined): DadosDasConferencias | undefined {
  const editalCargos = useEditalCargos(editalId);
  const ids = editalCargos.cargosDoEdital.map((c) => c.id);
  const catalogo = useCargos();
  const cronograma = useCronograma(editalId);
  const prova = useProvaObjetiva(ids);
  const titulos = useTitulos(editalId, ids);
  const territorio = useTerritorialidade(editalId, ids);
  const investidura = useInvestidura(editalId);
  const inscricao = useInscricao(editalId);
  const desempate = useDesempate(editalId);
  const acoes = useAcoesAfirmativas(editalId);
  const conteudo = useConteudoProgramatico(editalId);

  const carregando =
    !editalId ||
    editalCargos.isLoading ||
    catalogo.isLoading ||
    cronograma.isLoading ||
    prova.isLoading ||
    titulos.isLoading ||
    territorio.isLoading ||
    investidura.isLoading ||
    inscricao.isLoading ||
    desempate.isLoading ||
    acoes.isLoading ||
    conteudo.isLoading;

  return useMemo(
    () =>
      carregando
        ? undefined
        : {
            cargosDoEdital: editalCargos.cargosDoEdital,
            cargos: catalogo.cargos,
            etapas: cronograma.etapas,
            prova: { configs: prova.configs, disciplinas: prova.disciplinas },
            titulos: { config: titulos.config, itens: titulos.itens },
            distribuicao: territorio.distribuicao,
            documentosDeInvestidura: investidura.documentos,
            inscricao: {
              criterios: inscricao.criterios,
              canais: inscricao.canais,
              emailDaVistaDeProva: inscricao.emailDaVistaDeProva,
            },
            criteriosDeDesempate: desempate.criterios,
            acoes: { pcd: acoes.pcd, cotas: acoes.cotas, lactantes: acoes.lactantes },
            ementas: conteudo.ementas,
          },
    [
      carregando,
      editalCargos.cargosDoEdital,
      catalogo.cargos,
      cronograma.etapas,
      prova.configs,
      prova.disciplinas,
      titulos.config,
      titulos.itens,
      territorio.distribuicao,
      investidura.documentos,
      inscricao.criterios,
      inscricao.canais,
      inscricao.emailDaVistaDeProva,
      desempate.criterios,
      acoes.pcd,
      acoes.cotas,
      acoes.lactantes,
      conteudo.ementas,
    ],
  );
}
