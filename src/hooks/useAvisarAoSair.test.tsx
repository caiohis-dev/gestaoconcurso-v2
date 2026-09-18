/**
 * O aviso do navegador ao fechar a aba com trabalho não salvo.
 *
 * ⭐ **O controle positivo é o caso DESLIGADO**, e é o que mais importa: provar que o aviso
 * aparece é metade; a outra é provar que ele **não** aparece com a tela limpa. Um listener
 * permanente faria o navegador pedir confirmação em todo recarregamento — o jeito mais rápido
 * de ensinar alguém a clicar "sair" sem ler.
 *
 * ⚠️ **O que este arquivo NÃO consegue cobrir, e a falsificação provou:** o hook chama
 * `e.preventDefault()` **e** atribui `e.returnValue` — a primeira é a especificação de hoje, a
 * segunda é o que Chrome e Safari antigos ainda exigem para exibir o diálogo. **No jsdom as
 * duas são o mesmo bit:** `preventDefault()` faz `returnValue` virar `false`, e atribuir
 * `returnValue` faz `defaultPrevented` virar `true`. Sondei isso antes de escrever a asserção.
 *
 * Consequência aceita, dita em voz alta em vez de disfarçada: **tirar a linha do `returnValue`
 * deixa esta suíte VERDE.** Ela existe para navegador que o jsdom não simula, e quem a remover
 * não vai ser avisado aqui. A linha do `preventDefault`, essa sim, está guardada.
 *
 * E o diálogo em si é do navegador: o que se verifica aqui é o **contrato** — o evento sai
 * cancelado —, nunca o desenho da caixa.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAvisarAoSair } from "@/hooks/useAvisarAoSair";

/** Dispara um `beforeunload` cancelável e devolve os sinais que dá para distinguir. */
function tentarSair(): { cancelado: boolean; chamouPreventDefault: boolean } {
  const evento = new Event("beforeunload", { cancelable: true });
  const espiao = vi.spyOn(evento, "preventDefault");
  window.dispatchEvent(evento);
  return { cancelado: evento.defaultPrevented, chamouPreventDefault: espiao.mock.calls.length > 0 };
}

describe("useAvisarAoSair", () => {
  it("🔴 com trabalho não salvo, o navegador é avisado", () => {
    renderHook(() => useAvisarAoSair(true));
    const r = tentarSair();
    expect(r.chamouPreventDefault).toBe(true);
    expect(r.cancelado).toBe(true);
  });

  it("⭐ CONTROLE: sem trabalho não salvo, NÃO avisa por via nenhuma", () => {
    renderHook(() => useAvisarAoSair(false));
    const r = tentarSair();
    expect(r.chamouPreventDefault).toBe(false);
    expect(r.cancelado).toBe(false);
  });

  it("para de avisar quando o trabalho é salvo", () => {
    const { rerender } = renderHook(({ ativo }) => useAvisarAoSair(ativo), {
      initialProps: { ativo: true },
    });
    expect(tentarSair().cancelado).toBe(true);

    rerender({ ativo: false });
    expect(tentarSair().cancelado).toBe(false);
  });

  it("🔴 desmontar remove o listener — senão ele sobreviveria à saída da tela", () => {
    // ⚠️ Este caso é também o detector de vazamento do arquivo. A primeira versão fazia essa
    // checagem num `afterEach`, e o resultado foi pior: quando um caso falhava antes do
    // `unmount()`, o listener vazava e derrubava TODOS os outros em cascata — quatro falhas
    // para um defeito só. Aqui a checagem é explícita e local, e o `cleanup` global da RTL
    // (`src/test/setup.ts`) desmonta o resto.
    const { unmount } = renderHook(() => useAvisarAoSair(true));
    expect(tentarSair().cancelado).toBe(true);

    unmount();
    expect(tentarSair().cancelado).toBe(false);
  });
});
