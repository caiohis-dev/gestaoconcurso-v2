/**
 * Setup global dos testes (carregado por `setupFiles` no vitest.config.ts).
 *
 * Três responsabilidades, todas obrigatórias — nenhuma é zelo opcional:
 *   1. matchers do jest-dom + cleanup entre testes;
 *   2. env dummy do Supabase, porque o client.ts chama createClient NA IMPORTAÇÃO;
 *   3. polyfills que o Radix (shadcn/ui) exige e o jsdom não tem.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// ── 1. Cleanup ────────────────────────────────────────────────────────────────
// A RTL só faz cleanup automático quando detecta o global `afterEach`; explícito
// aqui para não depender dessa detecção.
afterEach(() => {
  cleanup();
});

// ── 2. Env do Supabase ────────────────────────────────────────────────────────
// `src/integrations/supabase/client.ts` lê import.meta.env e chama createClient no
// topo do módulo. Sem estes valores, QUALQUER import transitivo do client explode
// com "supabaseUrl is required" antes do primeiro teste rodar. Os testes mockam o
// client, mas isto cobre o caso de um import transitivo escapar do mock.
vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-anon-key");

// ── 3. Polyfills do jsdom para o Radix ────────────────────────────────────────
// Dialog, Select, Popover e afins usam estas APIs. O jsdom não implementa nenhuma,
// e a falha aparece como erro obscuro dentro do Radix, não como "falta polyfill".

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!globalThis.matchMedia) {
  Object.defineProperty(globalThis, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Usados pelo Radix ao abrir/fechar overlays e ao navegar por teclado.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
