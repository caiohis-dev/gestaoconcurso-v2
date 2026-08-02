/**
 * Bateria do PAINEL DE ALOCAÇÃO de `GerenciarProva`.
 *
 * 🔴 **Por que esta tela ganhou teste de página em 2026-08-02.** O painel dizia
 * "Total de Candidatos: 200" numa prova cujo edital tem **7.231 inscritos**, porque lia
 * `provas.prova_n_candidatos` — um número digitado à mão. Com isso ele pintava a prova de
 * COBERTA faltando 7.031 lugares, sem erro nenhum na tela: o formato de defeito que este
 * repo mais teme. A fonte passou a ser a contagem real de `candidatos` do edital da prova.
 *
 * ⚠️ **O escopo é o painel, de propósito.** `GerenciarProva` é uma página grande (unidades,
 * salas, valores de função, exports, finalização) e testá-la inteira aqui compraria
 * fragilidade sem comprar garantia. A ARITMÉTICA já é coberta por `src/lib/alocacao.ts`
 * (`alocacao.test.ts`, função pura); o que só existe aqui é a LIGAÇÃO — a página pega o
 * edital certo, entrega os números certos à função, e respeita quem pode ver o painel.
 *
 * Ver `my_rules/estrutura/modulos/aplicacao-provas/provas-e-unidades.md` e as nove
 * armadilhas em `my_rules/estrutura/transversais/testes.md`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { screen, waitFor, within } from "@testing-library/react";
import { setTableResult, setRpcResult, resetSupabaseMock } from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

/**
 * O papel é o que decide se o painel existe, então ele é PARÂMETRO da bateria — não uma
 * constante. `vi.hoisted` porque o factory do `vi.mock` sobe para o topo do arquivo.
 */
const { papel } = vi.hoisted(() => ({ papel: { admin: true, coordenador: false } }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-1", email: "admin@fevre.test", user_metadata: {} },
    session: null,
    loading: false,
    role: papel.admin ? "admin" : "coordenador",
    roles: papel.admin ? ["admin"] : ["coordenador"],
    rolesLoaded: true,
    isAdmin: papel.admin,
    isSuperAdmin: false,
    isCoordenador: papel.coordenador,
    isColaborador: false,
    isLoggingOut: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

import GerenciarProva from "./GerenciarProva";

const PROVA_ID = "prova-1";
const EDITAL_DA_PROVA = "edital-1";
const OUTRO_EDITAL = "edital-2";

const PROVA = {
  id: PROVA_ID,
  prova_edital: "Edital 001/2026 SMA",
  edital_id: EDITAL_DA_PROVA,
  prova_data: "2026-03-08",
  prova_hora_inicio: "09:00",
  prova_hora_final: "11:00",
  prova_finalizada: false,
  finalizada_at: null,
  created_at: null,
  updated_at: null,
  created_by: null,
  prova_cabecalho_linha1: null,
  prova_cabecalho_linha2: null,
  editais: { nome: "Edital 001/2026 SMA", cabecalho_linha1: null, cabecalho_linha2: null },
};

/**
 * ⚠️ Um valor de função é OBRIGATÓRIO no fixture: `GerenciarProva` abre sozinho o dialog
 * de valores quando `valoresFuncao.length === 0` (é `useEffect` deliberado da página), e o
 * modal por cima do painel atrapalharia toda asserção daqui.
 */
const VALOR_FUNCAO = { id: "vf-1", prova_id: PROVA_ID, funcao_id: "f-1", valor_pagamento: 100 };

/**
 * Uma unidade com 5.000 lugares. ⚠️ Os três números do painel precisam ser DISTINTOS no
 * fixture: com capacidade 0, "Total de Inscritos" e "Não Alocados" dariam ambos 7231 e as
 * asserções passariam sem provar qual é qual — foi o que a primeira versão desta bateria
 * fez, e o `getByText` ambíguo foi quem denunciou.
 */
const PROVA_UNIDADE = {
  id: "pu-1",
  prova_id: PROVA_ID,
  unidade_id: "un-1",
  unidades_prova: { id: "un-1", unid_nome: "ESCOLA MUNICIPAL X", unid_sigla: "EMX" },
};
const SALAS = [{ sala_fk_unidade: "un-1", sala_capacidade: 5000 }];

/** Compõe rota + página como o `App.tsx` compõe — a página lê `:provaId` de `useParams`. */
function abrir() {
  return renderWithProviders(
    <Routes>
      <Route path="/gerenciar-prova/:provaId" element={<GerenciarProva />} />
      <Route path="*" element={<span>SAIU DA PÁGINA</span>} />
    </Routes>,
    { route: `/gerenciar-prova/${PROVA_ID}` },
  );
}

/** O painel é o bloco que traz "Alocados:" — âncora estável por texto, não por classe. */
async function painel() {
  const rotulo = await screen.findByText("Alocados:");
  return rotulo.closest("div.flex-wrap") as HTMLElement;
}

/**
 * O número ao lado de um rótulo do painel. Ancora no rótulo e lê o valor DENTRO da mesma
 * caixa — assim "7231" não é confundido com o "7231" de outro contador.
 *
 * ⚠️ "Alocados:" e "Não Alocados:" não colidem porque o `findByText` casa a string
 * INTEIRA por padrão; se algum dia virar `{ exact: false }`, os dois passam a colidir.
 */
async function valorDe(rotulo: string): Promise<string> {
  const label = await screen.findByText(rotulo);
  const caixa = label.parentElement as HTMLElement;
  return within(caixa).getByText(/^-?\d+$/).textContent ?? "";
}

describe("GerenciarProva — painel de alocação (interação)", () => {
  beforeEach(() => {
    resetSupabaseMock();
    papel.admin = true;
    papel.coordenador = false;
    setTableResult("provas", { data: [PROVA], error: null });
    setTableResult("valores_funcao_prova", { data: [VALOR_FUNCAO], error: null });
    setTableResult("prova_unidades", { data: [PROVA_UNIDADE], error: null });
    setTableResult("salas_prova_distribuidas", { data: SALAS, error: null });
    // As demais tabelas caem no default do mock: lista vazia (armadilha 4).
    setRpcResult("contar_candidatos_por_edital", {
      data: [
        { edital_id: OUTRO_EDITAL, total: 12 },
        { edital_id: EDITAL_DA_PROVA, total: 7231 },
      ],
      error: null,
    });
  });

  describe("🔴 a fonte do total é a lista REAL de inscritos (2026-08-02)", () => {
    it("mostra os inscritos do edital DA PROVA, não os de outro edital", async () => {
      // O `12` do outro edital está no fixture justamente para que pegar a chave errada
      // (ou o primeiro item da lista) apareça como falha, e não como acerto por sorte.
      abrir();

      expect(await valorDe("Total de Inscritos:")).toBe("7231");
      const p = await painel();
      expect(within(p).queryByText("12")).not.toBeInTheDocument();
    });

    it("⭐ CONTROLE POSITIVO: o rótulo antigo saiu junto com a fonte antiga", async () => {
      // "Total de Candidatos" era o texto da versão que lia `prova_n_candidatos`. Se ele
      // reaparecer, é sinal de que alguém restaurou a leitura antiga.
      abrir();

      await painel();
      expect(screen.queryByText("Total de Candidatos:")).not.toBeInTheDocument();
    });

    it("calcula Não Alocados a partir dos inscritos reais, não do número da prova", async () => {
      // 7231 inscritos − 5000 lugares = 2231 faltando. Com a fonte antiga (200) a conta
      // dava −4800, e o painel dizia que a prova estava coberta.
      abrir();

      expect(await valorDe("Total de Inscritos:")).toBe("7231");
      expect(await valorDe("Alocados:")).toBe("5000");
      expect(await valorDe("Não Alocados:")).toBe("2231");
    });
  });

  describe("os estados que a contagem criou — e nenhum deles é 0", () => {
    it("edital sem lista importada: diz isso e OFERECE o caminho, sem mostrar números", async () => {
      setRpcResult("contar_candidatos_por_edital", {
        data: [{ edital_id: OUTRO_EDITAL, total: 12 }],
        error: null,
      });

      abrir();

      expect(
        await screen.findByText("Nenhum inscrito importado neste edital."),
      ).toBeInTheDocument();
      // Nem o painel de números aparece: "0 inscritos, 0 alocados" pintaria a prova de
      // coberta, que é exatamente o defeito de origem com outra causa.
      expect(screen.queryByText("Alocados:")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Importar lista" })).toHaveAttribute(
        "href",
        "/candidatos",
      );
    });

    it("prova sem edital vinculado NÃO é culpa da importação", async () => {
      // `provas.edital_id` é NULLABLE no banco. Mandar essa pessoa importar a lista seria
      // mandá-la para a tela errada.
      setTableResult("provas", { data: [{ ...PROVA, edital_id: null }], error: null });

      abrir();

      expect(
        await screen.findByText(/não tem edital vinculado/i),
      ).toBeInTheDocument();
      expect(screen.queryByText("Nenhum inscrito importado neste edital.")).not.toBeInTheDocument();
    });

    it("⭐ enquanto conta, DIZ que está contando — e não afirma zero", async () => {
      // Armadilha 6: espera positiva. Afirma-se o texto que passa a valer, nunca o
      // estouro de um timeout.
      let liberar: (v: unknown) => void = () => {};
      setRpcResult(
        "contar_candidatos_por_edital",
        new Promise((resolve) => {
          liberar = resolve;
        }) as never,
      );

      abrir();

      expect(await screen.findByText("Contando os inscritos do edital…")).toBeInTheDocument();
      expect(screen.queryByText("Alocados:")).not.toBeInTheDocument();
      expect(screen.queryByText("Nenhum inscrito importado neste edital.")).not.toBeInTheDocument();

      // CONTROLE POSITIVO: resolvida a contagem, a tela SAI da espera. Sem isto o teste
      // passaria com uma página presa em "Contando" para sempre.
      liberar({ data: [{ edital_id: EDITAL_DA_PROVA, total: 7231 }], error: null });
      expect(await valorDe("Total de Inscritos:")).toBe("7231");
    });
  });

  describe("🔴 quem pode VER o painel — a RLS decide, e a tela tem de concordar", () => {
    it("coordenador não vê o painel", async () => {
      // ⚠️ Não é preferência de layout: a RLS de `candidatos` é só de admin e a RPC é
      // SECURITY INVOKER, então para coordenador a contagem volta VAZIA SEM ERRO. Um
      // painel visível diria "nenhum inscrito importado" a quem tem 7.231 na lista.
      papel.admin = false;
      papel.coordenador = true;
      setRpcResult("contar_candidatos_por_edital", { data: [], error: null });

      abrir();

      // Espera positiva: a página CARREGOU (o cabeçalho da prova aparece) e, mesmo assim,
      // o painel não está lá — sem isso o teste passaria por a página nem ter renderizado.
      expect(await screen.findByText(/Alocação de Candidatos|Sua Unidade de Prova/)).toBeInTheDocument();
      expect(screen.queryByText("Alocados:")).not.toBeInTheDocument();
      expect(screen.queryByText("Nenhum inscrito importado neste edital.")).not.toBeInTheDocument();
      expect(screen.queryByText("Contando os inscritos do edital…")).not.toBeInTheDocument();
    });

    it("⭐ CONTROLE POSITIVO: o mesmo cenário COM admin mostra o painel", async () => {
      // O par do caso acima. Sem ele, "não aparece" poderia significar "nunca aparece".
      papel.admin = true;
      papel.coordenador = false;

      abrir();

      expect(await valorDe("Total de Inscritos:")).toBe("7231");
    });
  });
});
