/**
 * Bateria de comportamento da tela de Editais.
 *
 * ⚠️ **O que justifica testar a PÁGINA, e não só o dialog:** desde 2026-08-02 o card não
 * mostra mais um número guardado na linha do edital — ele mostra a **contagem real de
 * inscritos**, que vem de outro módulo (a RPC de `candidatos`). Isso criou três estados
 * onde antes havia um campo, e **nenhum deles pode virar "0"**: zero é a afirmação
 * "não há inscrito", e afirmá-la enquanto se conta é o defeito que este repo mais repete.
 *
 * O dialog continua coberto por `EditalDialog.ui.test.tsx`; aqui o objeto é a LIGAÇÃO
 * entre a página e a contagem. Ver `my_rules/estrutura/modulos/editais/00-modulo.md` e as
 * nove armadilhas em `my_rules/estrutura/transversais/testes.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import { setTableResult, setRpcResult, resetSupabaseMock } from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

// O `Layout` consome o `useAuth` inteiro. Mockar o hook — e não montar o AuthProvider —
// é a armadilha 1 de `testes.md`: o objeto aqui é a listagem, não a sessão.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-1", email: "admin@fevre.test", user_metadata: {} },
    session: null,
    loading: false,
    role: "admin",
    roles: ["admin"],
    rolesLoaded: true,
    isAdmin: true,
    isSuperAdmin: false,
    isCoordenador: false,
    isColaborador: false,
    isLoggingOut: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

import Editais from "./Editais";

const COM_LISTA = {
  id: "edital-com-lista",
  nome: "Edital 001/2026 SMA",
  cabecalho_linha1: null,
  cabecalho_linha2: null,
  created_at: null,
  updated_at: null,
  created_by: null,
};

const SEM_LISTA = { ...COM_LISTA, id: "edital-sem-lista", nome: "Edital 002/2026 - SMA" };

/**
 * O card de um edital, achado pelo NOME — as asserções de contagem são todas `within` ele,
 * porque o que se quer provar é a associação card↔número, não a presença do número na tela.
 *
 * ⚠️ Ancora no `heading` (o `CardTitle` é um `h3`) e sobe até o `div.rounded-lg` do
 * primitivo `Card`. Não ancore em classe de LAYOUT da página (`flex`, `gap-4`): o
 * `CardHeader` também é `div.flex`, então um `closest("div.flex")` devolveria o cabeçalho
 * e as asserções cairiam fora do card, procurando um texto que está no `CardContent`.
 */
const cardDe = async (nome: string) => {
  const titulo = await screen.findByRole("heading", { name: nome });
  const card = titulo.closest("div.rounded-lg");
  if (!card) throw new Error(`Card do edital "${nome}" não encontrado`);
  return card as HTMLElement;
};

describe("Editais (interação)", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableResult("editais", { data: [COM_LISTA, SEM_LISTA], error: null });
  });

  describe("🔴 o nº do card é a CONTAGEM REAL de inscritos (2026-08-02)", () => {
    it("mostra quantos inscritos o edital tem, vindos da RPC", async () => {
      setRpcResult("contar_candidatos_por_edital", {
        data: [{ edital_id: COM_LISTA.id, total: 7231 }],
        error: null,
      });

      renderWithProviders(<Editais />, { route: "/editais" });

      expect(await screen.findByText("7231 inscrito(s) importado(s)")).toBeInTheDocument();
    });

    it("🔴 casa a contagem com o EDITAL CERTO quando há mais de um", async () => {
      // A ligação é por id, e trocar um `[edital.id]` por um índice é o tipo de erro que
      // passa despercebido com um edital só na tela.
      setRpcResult("contar_candidatos_por_edital", {
        data: [
          { edital_id: SEM_LISTA.id, total: 12 },
          { edital_id: COM_LISTA.id, total: 7231 },
        ],
        error: null,
      });

      renderWithProviders(<Editais />, { route: "/editais" });

      const card = await cardDe(COM_LISTA.nome);
      await waitFor(() =>
        expect(within(card).getByText("7231 inscrito(s) importado(s)")).toBeInTheDocument(),
      );
      const outro = await cardDe(SEM_LISTA.nome);
      expect(within(outro).getByText("12 inscrito(s) importado(s)")).toBeInTheDocument();
    });

    it("edital sem lista importada DIZ isso — não mostra 0", async () => {
      // A RPC não devolve linha para edital sem inscrito. "0 inscritos" seria uma
      // afirmação sobre o concurso; "nenhum importado" é a verdade sobre o sistema.
      setRpcResult("contar_candidatos_por_edital", {
        data: [{ edital_id: COM_LISTA.id, total: 7231 }],
        error: null,
      });

      renderWithProviders(<Editais />, { route: "/editais" });

      const card = await cardDe(SEM_LISTA.nome);
      await waitFor(() =>
        expect(within(card).getByText("Nenhum inscrito importado")).toBeInTheDocument(),
      );
      expect(within(card).queryByText(/0 inscrito/)).not.toBeInTheDocument();
    });

    it("⭐ enquanto conta, diz que está contando — e NENHUM card afirma zero", async () => {
      // Armadilha 6: espera POSITIVA. Afirma-se o que passa a valer (o texto de contagem
      // aparece), não o estouro de um timeout.
      let liberar: (v: unknown) => void = () => {};
      setRpcResult(
        "contar_candidatos_por_edital",
        new Promise((resolve) => {
          liberar = resolve;
        }) as never,
      );

      renderWithProviders(<Editais />, { route: "/editais" });

      const carregando = await screen.findAllByText("Contando inscritos…");
      expect(carregando).toHaveLength(2);
      expect(screen.queryByText(/inscrito\(s\) importado\(s\)/)).not.toBeInTheDocument();
      expect(screen.queryByText("Nenhum inscrito importado")).not.toBeInTheDocument();

      // CONTROLE POSITIVO: resolvida a contagem, a tela sai do estado de espera. Sem isto
      // o teste passaria mesmo que a página ficasse presa em "Contando" para sempre.
      liberar({ data: [{ edital_id: COM_LISTA.id, total: 7231 }], error: null });
      expect(await screen.findByText("7231 inscrito(s) importado(s)")).toBeInTheDocument();
    });
  });

  it("a lista de editais em si continua aparecendo", async () => {
    // Controle positivo do fixture: se os cards não renderizassem, os casos acima
    // passariam por vacuidade em vez de por acerto.
    setRpcResult("contar_candidatos_por_edital", { data: [], error: null });

    renderWithProviders(<Editais />, { route: "/editais" });

    expect(await screen.findByText(COM_LISTA.nome)).toBeInTheDocument();
    expect(screen.getByText(SEM_LISTA.nome)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo Edital/ })).toBeInTheDocument();
  });
});
