/**
 * Quantas linhas cada fonte de quadro tem neste edital.
 *
 * É o que permite ao linter acusar `quadro-sem-dado`: um artigo que publica o Quadro I
 * enquanto o Quadro de Cargos está vazio sairia com uma tabela em branco no Diário
 * Oficial — e ninguém veria antes.
 *
 * ⚠️ **Três chamadas de hook explícitas, nunca um laço.** Tentar um helper genérico
 * `contar(tabela)` chamando `useQuery` lá dentro quebra `react-hooks/rules-of-hooks` —
 * já aconteceu nesta v3 e o lint pegou.
 *
 * 🔵 As consultas reaproveitam as chaves de React Query dos hooks que os editores já
 * usam, então abrir a prévia não gera tráfego novo.
 */
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCronograma } from "@/hooks/useCronograma";
import { useProvaObjetiva } from "@/hooks/useProvaObjetiva";
import type { QuadroFonte } from "@/lib/edital-itens";

export function useLinhasPorFonte(
  editalId: string | undefined,
): Partial<Record<QuadroFonte, number>> {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { etapas } = useCronograma(editalId);
  const { disciplinas } = useProvaObjetiva(cargosDoEdital.map((c) => c.id));

  return {
    cargos: cargosDoEdital.length,
    disciplinas: disciplinas.length,
    cronograma: etapas.length,
    // 🔴 ZERO explícito, não `undefined`. As fatias 6 e 7 ainda não existem, então um
    // artigo que publique esses quadros publicaria mesmo uma tabela vazia — o linter
    // tem de dizer isso, e `undefined` significaria "não medido" e o calaria.
    titulos: 0,
    vagas_por_area: 0,
  };
}
