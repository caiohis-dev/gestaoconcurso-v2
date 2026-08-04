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
import userEvent from "@testing-library/user-event";
import {
  setTableResult,
  setRpcResult,
  resetSupabaseMock,
  erroPostgrest,
} from "@/test/supabase-mock";
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
 * 🔵 **Este valor deixou de ser obrigatório no fixture em 02/08**, quando a abertura
 * automática do dialog de valores foi abolida (ver o último bloco desta bateria). Até
 * então, sem uma linha de `valores_funcao_prova` aqui, o modal cobria a tela e derrubava
 * toda asserção por um motivo que não era o medido. Fica porque é o estado realista de
 * uma prova configurada — e os casos que precisam do oposto sobrescrevem a tabela.
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

/**
 * O catálogo de unidades (`unidades_prova`) e as salas do CADASTRO (`sala_prova`) — o que
 * alimenta o seletor de "adicionar unidade", acrescentado em 2026-08-03.
 *
 * 🔴 **Os números do cadastro são deliberadamente diferentes dos do snapshot.** A `un-1`
 * tem 5.000 lugares em `salas_prova_distribuidas` e 999 em `sala_prova`; a `un-2` tem 350
 * no cadastro e **nenhuma** linha no snapshot, que é o estado real de qualquer unidade
 * ainda não vinculada. Quem trocar a fonte pelo snapshot faz a `un-2` aparecer como "sem
 * salas cadastradas" — a confusão template-vs-snapshot vira falha, em vez de passar como
 * um número plausível.
 *
 * As siglas vêm com espaço à direita de propósito: `unid_sigla` é CHAR(10).
 */
const UNIDADES_CATALOGO = [
  { id: "un-1", unid_sigla: "EMX       ", unid_nome: "ESCOLA MUNICIPAL X" },
  { id: "un-2", unid_sigla: "UGB-II    ", unid_nome: "UGB - Bloco II" },
  {
    id: "un-3",
    unid_sigla: "CIEP 295  ",
    unid_nome: "PROFª GLÓRIA ROUSSIM G. PINTO",
  },
];

/** `un-2` soma 350 em duas salas; `un-3` não tem nenhuma. */
const SALAS_DO_CADASTRO = [
  { sala_fk_unidade: "un-1", sala_capacidade: 999 },
  { sala_fk_unidade: "un-2", sala_capacidade: 200 },
  { sala_fk_unidade: "un-2", sala_capacidade: 150 },
];

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
    setTableResult("unidades_prova", { data: UNIDADES_CATALOGO, error: null });
    setTableResult("sala_prova", { data: SALAS_DO_CADASTRO, error: null });
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

  /**
   * 🔴 A página NÃO abre modal sozinha — decisão do usuário em 02/08, "abolido em
   * qualquer cenário".
   *
   * Até aqui um `useEffect` abria o `ValoresFuncaoProvaDialog` quando a prova não tinha
   * nenhum valor de função. Duas coisas estavam erradas nele. A visível: ele tapava a
   * página de quem entrou para fazer outra coisa, a cada visita, enquanto a prova
   * seguisse sem valores. A invisível: `[]` não significa "prova sem valores" — a policy
   * de leitura é `admin OR is_coordenador_prova(prova_id)`, então para o coordenador de
   * OUTRA prova a lista volta VAZIA SEM ERRO, e o modal disparava numa prova que tinha 17
   * valores cadastrados.
   *
   * O que estes casos guardam é o estado de repouso: **nenhum papel, com ou sem valor
   * cadastrado, recebe modal sem ter clicado**. O botão continua sendo o caminho.
   */
  describe("🔴 nenhum modal aparece sozinho — em cenário nenhum", () => {
    /** Ancora no título do dialog, que carrega o nome do edital. */
    const TITULO = `Cadastrar Funções dos Colaboradores - ${PROVA.editais.nome}`;

    /**
     * ⚠️ A ESPERA QUE ESTOURA É OBRIGATÓRIA AQUI, não zelo — e é o oposto do que a
     * armadilha 6 proíbe, porque o objeto é **ausência permanente**, que não tem forma
     * positiva. A primeira versão destes casos afirmava `queryByRole("dialog")` logo
     * depois da âncora da página e passava por VÁCUO: o cabeçalho aparece assim que
     * `provas` assenta, ANTES de `valores_funcao_prova` assentar, ou seja, media um
     * instante em que a página nem tinha o dado que abria o modal. Falsifiquei na época
     * sabotando a guarda de papel: os testes continuavam VERDES (armadilha 8 pura).
     *
     * Quem prova que a espera é longa o bastante é o CONTROLE POSITIVO do clique, no fim
     * do bloco: no mesmo fixture e no mesmo mock, o modal aparece em ~200 ms.
     */
    async function nenhumModalApareceu() {
      await expect(screen.findByRole("dialog")).rejects.toThrow(/Unable to find role/);
      expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
    }

    it("admin numa prova SEM valor de função: nada abre sozinho", async () => {
      // Este era EXATAMENTE o cenário que disparava o modal — hoje é o caso de repouso.
      setTableResult("valores_funcao_prova", { data: [], error: null });

      abrir();

      // Âncora positiva primeiro: a página carregou de verdade.
      expect(await valorDe("Total de Inscritos:")).toBe("7231");
      await nenhumModalApareceu();
    });

    it("admin numa prova COM valor de função: idem", async () => {
      // O fixture padrão já tem VALOR_FUNCAO. Serve de par ao caso acima: o resultado não
      // depende mais de haver ou não valor cadastrado.
      abrir();

      expect(await valorDe("Total de Inscritos:")).toBe("7231");
      await nenhumModalApareceu();
    });

    it("coordenador, sem valor de função visível para ele: idem", async () => {
      // ⚠️ Para o coordenador, `[]` pode ser RLS e não ausência de cadastro — indistinguível
      // da tela. Era o segundo defeito do efeito removido.
      papel.admin = false;
      papel.coordenador = true;
      setTableResult("valores_funcao_prova", { data: [], error: null });
      setRpcResult("contar_candidatos_por_edital", { data: [], error: null });

      abrir();

      expect(
        await screen.findByText(/Alocação de Candidatos|Sua Unidade de Prova/),
      ).toBeInTheDocument();
      await nenhumModalApareceu();
    });

    it("⭐ CONTROLE POSITIVO: o botão continua abrindo o dialog", async () => {
      // Sem este caso, "não aparece" poderia significar "o dialog virou código morto" ou
      // "a espera acima é curta demais para qualquer modal". Ele fecha os dois buracos.
      setTableResult("valores_funcao_prova", { data: [], error: null });

      abrir();

      await userEvent.click(
        await screen.findByRole("button", { name: "Cadastrar Funções dos Colaboradores" }),
      );

      expect(await screen.findByRole("dialog")).toHaveTextContent(TITULO);
    });
  });

  /**
   * 🔵 **O seletor de unidades diz quantos lugares cada unidade tem (2026-08-03).**
   *
   * Quem vincula uma unidade a uma prova está decidindo onde caberão os inscritos, e o
   * seletor só dizia o nome: para saber o tamanho da unidade era preciso sair da página,
   * ir a `/unidades-prova` → `/salas-prova/:id` e somar as salas na cabeça.
   *
   * ⚠️ **A fonte é `sala_prova`, o CADASTRO** — ver o fixture acima. Uma unidade ainda não
   * vinculada não tem linha nenhuma em `salas_prova_distribuidas`, então o snapshot diria
   * zero para todas, sempre.
   */
  describe("🔵 o seletor de unidades mostra a capacidade do cadastro", () => {
    /**
     * Abre o Select e devolve as opções. Espera o gatilho ficar HABILITADO antes de
     * clicar: ele nasce `disabled` (a página ainda carrega provas/unidades/vínculos) e
     * `user.click` num elemento desabilitado não faz nada — o teste falharia depois, ao
     * não achar opção nenhuma, e por um motivo que não é o medido.
     */
    async function abrirSeletor() {
      const user = userEvent.setup();
      const gatilho = await screen.findByRole("combobox");
      await waitFor(() => expect(gatilho).toBeEnabled());
      await user.click(gatilho);
      return screen.findAllByRole("option");
    }

    it("mostra a soma das salas cadastradas, no formato pedido", async () => {
      abrir();

      await abrirSeletor();

      expect(
        screen.getByRole("option", { name: "UGB-II - UGB - Bloco II (capacidade: 350)" }),
      ).toBeInTheDocument();
    });

    it("🔴 unidade sem sala cadastrada DIZ isso — não mostra '(capacidade: 0)'", async () => {
      // Medido em 03/08: 7 das 11 unidades do banco estão neste estado. É o caso comum,
      // não a borda.
      abrir();

      await abrirSeletor();

      expect(
        screen.getByRole("option", {
          name: "CIEP 295 - PROFª GLÓRIA ROUSSIM G. PINTO (sem salas cadastradas)",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/\(capacidade: 0\)/)).not.toBeInTheDocument();
    });

    it("⭐ a unidade JÁ VINCULADA não entra na lista — nem a capacidade dela", async () => {
      // Confirma o recorte que já existia (`unidadesDisponiveis`) e, de quebra, que o
      // rótulo não pesca a capacidade de outra unidade: 999 é só da `un-1`.
      abrir();

      const opcoes = await abrirSeletor();

      expect(opcoes).toHaveLength(2);
      expect(screen.queryByRole("option", { name: /ESCOLA MUNICIPAL X/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/999/)).not.toBeInTheDocument();
    });

    it("⭐ enquanto conta, o rótulo NÃO afirma capacidade nenhuma", async () => {
      // "Vazio enquanto carrega": um "(sem salas cadastradas)" transitório acusaria de
      // vazias todas as unidades da lista, no instante em que a pessoa abre o seletor.
      let liberar: (v: unknown) => void = () => {};
      setTableResult(
        "sala_prova",
        new Promise((resolve) => {
          liberar = resolve;
        }) as never,
      );

      abrir();

      const opcoes = await abrirSeletor();
      expect(opcoes.map((o) => o.textContent)).toEqual([
        "UGB-II - UGB - Bloco II",
        "CIEP 295 - PROFª GLÓRIA ROUSSIM G. PINTO",
      ]);

      // CONTROLE POSITIVO: resolvida a contagem, o número aparece no mesmo seletor. Sem
      // ele, o caso passaria com um rótulo que nunca mostra capacidade.
      liberar({ data: SALAS_DO_CADASTRO, error: null });
      expect(
        await screen.findByRole("option", { name: "UGB-II - UGB - Bloco II (capacidade: 350)" }),
      ).toBeInTheDocument();
    });

    it("🔴 consulta que FALHA não acusa as unidades de estarem vazias", async () => {
      // `{}` é a resposta tanto de "nenhuma sala" quanto de "não deu para perguntar".
      // Diante do erro, o rótulo cala sobre capacidade em vez de mentir.
      setTableResult("sala_prova", {
        data: null,
        error: erroPostgrest("42501", "permission denied for table sala_prova"),
      });

      abrir();

      const opcoes = await abrirSeletor();
      expect(opcoes.map((o) => o.textContent)).toEqual([
        "UGB-II - UGB - Bloco II",
        "CIEP 295 - PROFª GLÓRIA ROUSSIM G. PINTO",
      ]);
    });
  });
});
