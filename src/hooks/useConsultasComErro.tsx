/**
 * As consultas ATIVAS da tela que terminaram em ERRO.
 *
 * 🔴 **Por que existe.** Os hooks do módulo devolvem `data ?? []`: uma consulta que falhou
 * aparece como lista VAZIA, e o documento montado a partir dela é plausível e falso — o
 * quadro sai como "sem linha", o anexo como "nenhuma ementa". Para a prévia é tolerável;
 * para a exportação, não (fatia 12, etapa 4).
 *
 * ⚠️ **Por que olha o CACHE em vez de um `isError` em cada hook.** São uns dez hooks, alguns
 * aninhados (`useCamposDoEdital` sozinho consulta seis). Um `isError` por hook seria uma
 * lista escrita à mão — e o próximo hook que o documento passar a usar reabriria o buraco
 * calado, que é o padrão "varra os campos irmãos" deste repo. O cache vê toda consulta,
 * inclusive as que ainda não existem.
 *
 * Só conta consulta com OBSERVADOR (montada na tela agora): uma que falhou noutra página e
 * ficou no cache não tem nada a ver com este edital. O erro sobra para o lado seguro: uma
 * consulta ativa da tela que não alimenta o documento também bloqueia — recusar a mais é
 * recarregar a página; liberar a menos é publicar um edital com tabela faltando.
 *
 * Durante as tentativas automáticas do React Query (3, com espera crescente) a consulta
 * ainda está `pending`, não `error`: quem chama vê "carregando" até a última falhar.
 */
import { useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useConsultasComErro(): string[] {
  const cache = useQueryClient().getQueryCache();
  // A fotografia é uma STRING: `useSyncExternalStore` compara por `Object.is`, e um array
  // novo a cada leitura faria a tela renderizar em laço.
  const assinatura = useSyncExternalStore(
    (avisar) => cache.subscribe(avisar),
    () =>
      [
        ...new Set(
          cache
            .getAll()
            .filter((q) => q.state.status === "error" && q.getObserversCount() > 0)
            .map((q) => String(q.queryKey[0])),
        ),
      ]
        .sort()
        .join("\n"),
  );
  return useMemo(() => (assinatura ? assinatura.split("\n") : []), [assinatura]);
}
