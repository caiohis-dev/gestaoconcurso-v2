/**
 * Helpers de renderização. Envolvem o que o app monta em `App.tsx` e de que os
 * componentes/hooks dependem para sequer renderizar: React Query e o Router.
 *
 * O AuthProvider NÃO entra aqui de propósito: ele dispara chamadas ao Supabase no
 * mount, então quem precisa dele deve montá-lo explicitamente com o mock já
 * configurado — senão o teste passa a depender de um efeito invisível.
 */
import { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, renderHook, type RenderOptions } from "@testing-library/react";

/**
 * QueryClient de teste: sem retry (senão um teste de erro espera os backoffs) e
 * sem cache entre testes (`gcTime: 0`), para que um teste não veja o dado do outro.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface WrapperOpts {
  queryClient?: QueryClient;
  /** Rota inicial do MemoryRouter — use quando o componente lê params ou location. */
  route?: string;
}

function criarWrapper({ queryClient, route = "/" }: WrapperOpts = {}) {
  const client = queryClient ?? createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

/** `render` da RTL com QueryClientProvider + MemoryRouter. */
export function renderWithProviders(
  ui: ReactElement,
  { queryClient, route, ...options }: WrapperOpts & Omit<RenderOptions, "wrapper"> = {},
) {
  return render(ui, { wrapper: criarWrapper({ queryClient, route }), ...options });
}

/** `renderHook` da RTL com os mesmos providers — para os hooks de React Query. */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  { queryClient, route }: WrapperOpts = {},
) {
  return renderHook(hook, { wrapper: criarWrapper({ queryClient, route }) });
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
