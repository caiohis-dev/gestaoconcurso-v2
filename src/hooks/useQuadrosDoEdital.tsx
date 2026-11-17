/**
 * O dado dos cinco quadros de um edital, buscado num lugar só.
 *
 * 🔵 **Desde 2026-11-16 (fatia 12) há DOIS consumidores do mesmo dado:** a contagem para o
 * linter (`useLinhasPorFonte`) e o documento montado (`useDocumentoDoEdital`), que a prévia
 * e a exportação desenham. Os dois passam por `useDadosDosQuadros`, para que a regra
 * `quadro-sem-dado` e a tabela desenhada nunca leiam fontes diferentes.
 *
 * ⚠️ **Chamadas de hook explícitas, nunca um laço.** Tentar um helper genérico
 * `contar(tabela)` chamando `useQuery` lá dentro quebra `react-hooks/rules-of-hooks` —
 * já aconteceu nesta v3 e o lint pegou.
 *
 * 🔵 As consultas reaproveitam as chaves de React Query dos hooks que os editores já
 * usam, então abrir a prévia não gera tráfego novo.
 */
import { useMemo } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCronograma } from "@/hooks/useCronograma";
import { useProvaObjetiva } from "@/hooks/useProvaObjetiva";
import { useTitulos } from "@/hooks/useTitulos";
import { useTerritorialidade, useUnidadesLotacao } from "@/hooks/useTerritorialidade";
import { useCargos } from "@/hooks/useCargos";
import type { QuadroFonte } from "@/lib/edital-itens";
import type { DadosDosQuadros } from "@/lib/edital-documento";

/**
 * 🔴 `undefined` ENQUANTO CARREGA — nunca listas vazias.
 *
 * Lista vazia aqui quer dizer "este edital não tem linha", e é o que faz um quadro sair
 * como pendência. Devolver `[]` durante a carga faria cada quadro se acusar vazio no
 * primeiro frame — a armadilha "vazio enquanto carrega".
 */
export function useDadosDosQuadros(editalId: string | undefined): DadosDosQuadros | undefined {
  const cargosDoEditalQ = useEditalCargos(editalId);
  const { cargosDoEdital } = cargosDoEditalQ;
  const ids = cargosDoEdital.map((c) => c.id);
  const cargosQ = useCargos();
  const cronogramaQ = useCronograma(editalId);
  const provaQ = useProvaObjetiva(ids);
  const titulosQ = useTitulos(editalId, ids);
  const territorioQ = useTerritorialidade(editalId, ids);
  const unidadesQ = useUnidadesLotacao();

  const carregando =
    !editalId ||
    cargosDoEditalQ.isLoading ||
    cargosQ.isLoading ||
    cronogramaQ.isLoading ||
    provaQ.isLoading ||
    titulosQ.isLoading ||
    territorioQ.isLoading ||
    unidadesQ.isLoading;

  return useMemo(() => {
    if (carregando) return undefined;
    return {
      cargosDoEdital,
      nomesDosCargos: new Map(cargosQ.cargos.map((c) => [c.id, c.nome])),
      disciplinas: provaQ.disciplinas,
      titulos: titulosQ.itens,
      distribuicao: territorioQ.distribuicao,
      nomesDasUnidades: new Map(unidadesQ.unidades.map((u) => [u.id, u.nome])),
      etapas: cronogramaQ.etapas,
    };
  }, [
    carregando, cargosDoEdital, cargosQ.cargos, provaQ.disciplinas, titulosQ.itens,
    territorioQ.distribuicao, unidadesQ.unidades, cronogramaQ.etapas,
  ]);
}

/**
 * Quantas linhas cada fonte de quadro tem neste edital — para a regra `quadro-sem-dado`.
 *
 * Um artigo que publica o Quadro I enquanto o Quadro de Cargos está vazio sairia com uma
 * tabela em branco no Diário Oficial — e ninguém veria antes.
 *
 * 🔵 **CORRIGIDO em 2026-11-16.** Devolvia `{ cargos: 0, … }` enquanto carregava, contra a
 * doutrina que o próprio linter declara (*"ausente = ainda não carregado, a regra não roda"*):
 * o painel acusava `quadro-sem-dado` em todos os quadros no primeiro frame. Era só uma
 * piscada até o portão da exportação passar a consultar o linter — e um portão não pode
 * decidir com base num zero que quer dizer "carregando".
 */
export function useLinhasPorFonte(
  editalId: string | undefined,
): Partial<Record<QuadroFonte, number>> | undefined {
  const dados = useDadosDosQuadros(editalId);
  if (!dados) return undefined;
  return {
    cargos: dados.cargosDoEdital.length,
    disciplinas: dados.disciplinas.length,
    cronograma: dados.etapas.length,
    titulos: dados.titulos.length,
    vagas_por_area: dados.distribuicao.length,
  };
}
