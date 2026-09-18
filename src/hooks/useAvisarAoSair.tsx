/**
 * Avisa o navegador que há trabalho não salvo, para ele confirmar antes de fechar a aba ou
 * recarregar a página.
 *
 * 🔴 **Por que existe.** É o terceiro e último caminho de perda de rascunho no Edital
 * Studio. Os outros dois — trocar de capítulo e sair pelo "Voltar para Editais" — são
 * navegação do app e se resolvem com diálogo próprio, que pode nomear o que está em risco.
 * Fechar a aba não passa pelo React em momento nenhum: só o navegador pode interromper, e
 * só por este evento.
 *
 * ⚠️ **O texto é do NAVEGADOR e não se customiza.** Todos os navegadores ignoram mensagem
 * própria desde ~2017, justamente porque ela era usada para chantagear quem tentava sair.
 * Então este hook não recebe mensagem: ele só diz *se* há o que perder. Quem precisa
 * explicar o que está em risco tem de fazê-lo na tela, antes — e no Studio é o contador
 * "N artigo(s) não salvo(s)" que faz isso.
 *
 * ⚠️ **`ativo` tem de ser booleano, não uma contagem.** Com a contagem, cada tecla digitada
 * num artigo novo re-registraria o listener. É o motivo de o parâmetro não ser `sujos.length`.
 *
 * 🔴 **E o listener só existe enquanto `ativo`.** Um listener permanente faria o navegador
 * pedir confirmação em TODO recarregamento, inclusive com a tela limpa — que é o jeito mais
 * rápido de ensinar alguém a clicar "sair" sem ler. Este repo já registrou o mesmo raciocínio
 * sobre aviso de linter em edital válido (`edital-linter.ts`).
 */
import { useEffect } from "react";

export function useAvisarAoSair(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;

    const aoSair = (e: BeforeUnloadEvent) => {
      // ⚠️ As DUAS linhas são necessárias, e não é redundância: `preventDefault()` é o que a
      // especificação manda hoje, e `returnValue` é o que versões mais antigas de Chrome e
      // Safari ainda exigem para exibir o diálogo. Só uma delas deixa navegador de fora.
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [ativo]);
}
