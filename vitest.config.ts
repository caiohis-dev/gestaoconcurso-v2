import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Config de teste separada do vite.config.ts de propósito: o build de produção não
// precisa carregar nada disto. O alias `@` é o mesmo de lá — se um dia mudar, mude nos
// dois (não há como importar o outro config sem arrastar o bloco `server` junto).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Testes ficam ao lado do código (co-localização), não numa pasta __tests__.
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
  },
});
