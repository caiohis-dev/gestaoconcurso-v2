/**
 * Bateria dos GUARDS DE PÁGINA — a matriz rota × papel.
 *
 * Por que este arquivo existe: até 2026-07-26 as 23 páginas tinham cobertura ZERO, e
 * cada uma escrevia o próprio guard à mão. Duas ficaram meses aceitando qualquer conta
 * autenticada (`Colaboradores` e `FuncoesColaboradores`, corrigidas em 2026-07-25) sem
 * nada acusar — guard escrito à mão erra por esquecimento, e o erro é silencioso: nada
 * quebra, a página só fica aberta demais. Esta bateria é a rede que faltava.
 *
 * Também é a ESPECIFICAÇÃO do `RequireModulo` (item aberto no backlog): quando os guards
 * forem centralizados num wrapper, esta matriz é o contrato que ele tem de preservar. Se
 * um teste daqui quebrar durante aquela refatoração, a decisão mudou de comportamento.
 *
 * O que se afirma, e o que NÃO se afirma:
 *  - RECUSA é asserção exata: para onde a página manda quem não pode entrar.
 *  - PERMISSÃO é asserção negativa: quem pode entrar não é mandado para `/` nem `/auth`.
 *    Não se afirma que a página renderiza inteira porque quatro delas dependem de a
 *    entidade da URL existir (`/gerenciar-prova/:provaId` etc.) e, com o banco vazio do
 *    mock, redirecionam para `/provas` — isso é o caminho de DADO, não o guard.
 *
 * E o de sempre: guard de página é UX/roteamento. A barreira real é RLS + as checagens
 * das Edge Functions. Um guard furado é porta aberta na tela, não vazamento de dado.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComponentType, ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { createTestQueryClient } from "@/test/utils";
import { resetSupabaseMock, setTableResult, setRpcResult } from "@/test/supabase-mock";
import { RequireAcesso, type PapelExigido } from "@/components/RequireAcesso";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * O `useAuth` é mockado (e não o AuthProvider de verdade) porque o objeto de teste é o
 * GUARD, não o provider: o que interessa é "dado este estado de auth, para onde vai?".
 * Montar o provider real obrigaria a simular sessão do Supabase para chegar em cada
 * combinação — e a janela do `rolesLoaded` (mais abaixo) é praticamente inalcançável por
 * ali. O provider tem cobertura própria em `hooks/useAuth.test.tsx`.
 *
 * `vi.hoisted` é necessário porque `vi.mock` é içado: sem ele, a fábrica referenciaria um
 * `const` ainda não inicializado.
 */
const auth = vi.hoisted(() => ({ atual: null as unknown }));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => auth.atual,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));


// ---------------------------------------------------------------------------
// Banco vazio, mas não nulo
// ---------------------------------------------------------------------------

/**
 * O default do mock é `{ data: null }`, e várias páginas chamam `.some()`/`.map()` no
 * resultado sem coalescer — o que derruba a página por TypeError antes de o guard ser
 * avaliado, e o teste passaria a medir o crash, não a autorização. Então toda tabela e
 * toda RPC do app respondem lista vazia aqui.
 *
 * A lista vem de `grep -rhoE '\.from\(...' src/`. Tabela nova no app sem entrada aqui não
 * passa em silêncio: a página que a usa cai com TypeError.
 */
const TABELAS = [
  "bancos",
  "candidatos",
  // ⚠️ Acrescentadas em 2026-07-30 com a página de Cargos: sem elas, o `useCargosComUso`
  // recebe `undefined` do mock e a página quebra com TypeError ANTES de o guard rodar —
  // o teste de recusa passaria por acidente, medindo o crash e não a autorização.
  "cargos",
  "cargo_apelidos",
  "colaboradores",
  "colaboradores_prova",
  "coordenadores_prova",
  "editais",
  "funcoes_colaboradores",
  "meta_colaboradores_unidade",
  "ocorrencias_colaborador",
  "profiles",
  "provas",
  "prova_unidades",
  "sala_prova",
  "salas_prova_distribuidas",
  "unidades_prova",
  "user_roles",
  "valores_funcao_prova",
];

const RPCS = [
  "contar_candidatos_por_edital",
  "encerrar_ocorrencias_unidade",
  "finalizar_prova",
  "finalizar_prova_unidade",
  "get_coordenador_colaboradores",
  "get_meu_colaborador",
  "reabrir_prova",
  "reabrir_prova_unidade",
  "update_meu_colaborador",
  "update_meus_dados_bancarios",
];

function bancoVazio(): void {
  for (const t of TABELAS) setTableResult(t, { data: [], error: null });
  for (const r of RPCS) setRpcResult(r, { data: [], error: null });
}

/**
 * `DocumentosImpressao` busca o logo com `fetch` cru no mount para embutir no PDF, e o
 * jsdom não resolve a URL de asset do Vite — 14 stacks de "Invalid URL" no stderr, que
 * escondem ruído de verdade. O stub devolve um blob vazio: o guard não depende do logo.
 */
function stubarFetchDoLogo(): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob()));
}

function cenarioLimpo(): void {
  resetSupabaseMock();
  bancoVazio();
  stubarFetchDoLogo();
}

// ---------------------------------------------------------------------------
// Estados de auth
// ---------------------------------------------------------------------------

const USUARIO = { id: "u-1", email: "gestor@fevre.test", user_metadata: {} };

/** Base deslogada e resolvida (`loading: false`, `rolesLoaded: true`). */
function estado(over: Record<string, unknown> = {}) {
  return {
    user: null,
    session: null,
    loading: false,
    role: null,
    roles: [] as string[],
    rolesLoaded: true,
    isAdmin: false,
    isSuperAdmin: false,
    isCoordenador: false,
    isColaborador: false,
    isLoggingOut: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    ...over,
  };
}

/**
 * Os papéis espelham o que o `useAuth` monta de verdade (ver `useAuth.tsx:185-188`):
 * `isAdmin` é true para superadmin também, e `colaborador` é dimensão PARALELA — o
 * colaborador puro tem `role === null`, não um papel de gestão rebaixado.
 */
const PAPEIS = {
  deslogado: () => estado(),
  /** Colaborador puro: sem papel de gestão — não é coordenador nem admin. */
  colaborador: () => estado({ user: USUARIO, roles: ["colaborador"], isColaborador: true }),
  coordenador: () =>
    estado({ user: USUARIO, role: "coordenador", roles: ["coordenador"], isCoordenador: true }),
  admin: () => estado({ user: USUARIO, role: "admin", roles: ["admin"], isAdmin: true }),
  superadmin: () =>
    estado({
      user: USUARIO,
      role: "superadmin",
      roles: ["superadmin"],
      isAdmin: true,
      isSuperAdmin: true,
    }),
};

type Papel = keyof typeof PAPEIS;
const TODOS_OS_PAPEIS = Object.keys(PAPEIS) as Papel[];

const HUB = "/";
const LOGIN = "/auth";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function Sonda() {
  const loc = useLocation();
  return <span data-testid="rota">{loc.pathname}</span>;
}

interface Pagina {
  nome: string;
  /** O `path` da rota como está no `App.tsx` — com os `:params`. */
  path: string;
  /** A URL concreta visitada no teste. */
  rota: string;
  mod: () => Promise<{ default: ComponentType }>;
  /** Papéis que a página deve DEIXAR entrar (o resultado observável). */
  permitidos: Papel[];
  /**
   * O que o `App.tsx` declara no `RequireAcesso` daquela rota. `undefined` = a página
   * guarda a si mesma (hub, /perfil, /perfil-colaborador — nenhuma é página de módulo).
   */
  exige?: PapelExigido[];
  /**
   * Destino esperado quando ele não é o padrão da recusa (`/auth` para deslogado, `/`
   * para papel insuficiente). Cada entrada aqui carrega o porquê no comentário.
   */
  desvios?: Partial<Record<Papel, string>>;
}

async function montar(pagina: Pagina, st: unknown): Promise<void> {
  auth.atual = st;
  const { default: Componente } = await pagina.mod();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter
        initialEntries={[pagina.rota]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Sonda />
        <Routes>
          <Route
            path={pagina.path}
            element={
              // Compor aqui do mesmo jeito que o `App.tsx` é o que faz esta bateria
              // continuar sendo a especificação depois que os guards saíram das páginas.
              pagina.exige ? (
                <RequireAcesso papeis={pagina.exige}>
                  <Componente />
                </RequireAcesso>
              ) : (
                <Componente />
              )
            }
          />
          {/* Rota-sentinela: existe só para o router ter onde parar. O que se afirma é o
              pathname, não o conteúdo dela. */}
          <Route path="*" element={<span>SENTINELA</span>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rotaAtual(): string {
  return screen.getByTestId("rota").textContent ?? "";
}

function spinnerNaTela(): boolean {
  return document.querySelector(".animate-spin") !== null;
}

/**
 * ⚠️ TODA espera aqui é POSITIVA (aguarda algo passar a valer), nunca um timeout usado
 * como resposta. A primeira versão deste arquivo esperava 400ms pelo fim do spinner e
 * tratava o estouro como "a página está esperando" — o que passava isolado e falhava na
 * suíte cheia, porque sob carga uma página lenta é indistinguível de uma que espera. Com
 * asserção positiva o timeout generoso é de graça: `waitFor` retorna no instante em que a
 * condição vale, e só cobra o tempo quando o teste realmente vai falhar.
 */
const ESPERA = { timeout: 5000 };

/** Aguarda o router parar no destino esperado. */
async function esperarRota(destino: string): Promise<void> {
  await waitFor(() => expect(rotaAtual()).toBe(destino), ESPERA);
}

/**
 * Aguarda o fim do carregamento. Sem isso, as páginas que somam o `isLoading` das queries
 * ao `authLoading` no early return (`OcorrenciasProva`, `GerenciarProva` e as outras duas
 * com `:provaId`) seriam medidas ANTES de o guard rodar — e "ficou na rota" sairia como
 * resultado para todo mundo, inclusive deslogado.
 */
async function esperarCarregar(): Promise<void> {
  await waitFor(() => expect(spinnerNaTela()).toBe(false), ESPERA);
}

// ---------------------------------------------------------------------------
// A matriz
// ---------------------------------------------------------------------------

/**
 * Fonte da matriz: os guards das próprias páginas, conferidos um a um em 2026-07-26. A
 * coluna `permitidos` é a REGRA pretendida — bate com `src/lib/modulos.ts` e com a matriz
 * papel × módulo de `estrutura/transversais/auth-e-permissoes.md`.
 */
const PAGINAS: Pagina[] = [
  {
    nome: "Inicio (hub)",
    path: "/",
    rota: "/",
    mod: () => import("./Inicio"),
    permitidos: ["coordenador", "admin", "superadmin"],
    desvios: {
      // O colaborador puro nunca vê o hub: ele é dos papéis de gestão, e o colaborador
      // segue direto para o próprio cadastro. Decisão de produto, não recusa.
      colaborador: "/perfil-colaborador",
    },
  },
  {
    nome: "Dashboard",
    path: "/dashboard",
    rota: "/dashboard",
    mod: () => import("./Dashboard"),
    exige: ["admin"],
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "Colaboradores",
    path: "/colaboradores",
    rota: "/colaboradores",
    mod: () => import("./Colaboradores"),
    exige: ["admin", "coordenador"],
    permitidos: ["coordenador", "admin", "superadmin"],
  },
  {
    nome: "Provas",
    path: "/provas",
    rota: "/provas",
    mod: () => import("./Provas"),
    exige: ["admin", "coordenador"],
    permitidos: ["coordenador", "admin", "superadmin"],
  },
  {
    nome: "Editais",
    path: "/editais",
    rota: "/editais",
    mod: () => import("./Editais"),
    exige: ["admin"],
    // Módulo à parte, só admin: editais são a base sobre a qual as provas são criadas.
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "Candidatos",
    path: "/candidatos",
    rota: "/candidatos",
    mod: () => import("./Candidatos"),
    exige: ["admin"],
    // Só admin, e o motivo é mais forte do que em Editais: cada linha de `candidatos` é
    // CPF, endereço e telefone de um cidadão. O coordenador opera colaboradores (quem
    // APLICA a prova), não inscritos. A RLS da tabela fecha no mesmo papel.
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "CandidatosImportar",
    path: "/candidatos/importar",
    rota: "/candidatos/importar",
    mod: () => import("./CandidatosImportar"),
    exige: ["admin"],
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "Cargos",
    path: "/candidatos/cargos",
    rota: "/candidatos/cargos",
    mod: () => import("./Cargos"),
    exige: ["admin"],
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "UnidadesProva",
    path: "/unidades-prova",
    rota: "/unidades-prova",
    mod: () => import("./UnidadesProva"),
    exige: ["admin"],
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "SalasProva",
    path: "/salas-prova/:unidadeId",
    rota: "/salas-prova/u-1",
    mod: () => import("./SalasProva"),
    exige: ["admin"],
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "GerenciarProva",
    path: "/gerenciar-prova/:provaId",
    rota: "/gerenciar-prova/p-1",
    mod: () => import("./GerenciarProva"),
    exige: ["admin", "coordenador"],
    permitidos: ["coordenador", "admin", "superadmin"],
  },
  {
    nome: "GerenciarSalasDistribuidas",
    path: "/gerenciar-salas-distribuidas/:provaId/:unidadeId",
    rota: "/gerenciar-salas-distribuidas/p-1/u-1",
    mod: () => import("./GerenciarSalasDistribuidas"),
    exige: ["admin"],
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "GerenciarColaboradoresProva",
    path: "/gerenciar-colaboradores-prova/:provaUnidadeId",
    rota: "/gerenciar-colaboradores-prova/pu-1",
    mod: () => import("./GerenciarColaboradoresProva"),
    exige: ["admin", "coordenador"],
    permitidos: ["coordenador", "admin", "superadmin"],
  },
  {
    nome: "OcorrenciasProva",
    path: "/ocorrencias-prova/:provaId",
    rota: "/ocorrencias-prova/p-1",
    mod: () => import("./OcorrenciasProva"),
    exige: ["admin", "coordenador"],
    permitidos: ["coordenador", "admin", "superadmin"],
  },
  {
    nome: "FuncoesColaboradores",
    path: "/funcoes-colaboradores",
    rota: "/funcoes-colaboradores",
    mod: () => import("./FuncoesColaboradores"),
    exige: ["admin"],
    // Só admin, por decisão de 2026-07-25: cadastro de funções é gestão, e o coordenador
    // já vê os nomes das funções na tela de alocação.
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "DocumentosImpressao",
    path: "/documentos-impressao/:provaId",
    rota: "/documentos-impressao/p-1",
    mod: () => import("./DocumentosImpressao"),
    exige: ["admin"],
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "PainelDadosColaboradores",
    path: "/painel-dados-colaboradores/:provaId",
    rota: "/painel-dados-colaboradores/p-1",
    mod: () => import("./PainelDadosColaboradores"),
    exige: ["admin"],
    permitidos: ["admin", "superadmin"],
  },
  {
    nome: "GerenciarUsuarios",
    path: "/gerenciar-usuarios",
    rota: "/gerenciar-usuarios",
    mod: () => import("./GerenciarUsuarios"),
    exige: ["superadmin"],
    // Config geral, não módulo: criar conta e dar papel é privilégio de superadmin. O
    // admin é recusado aqui — é a única página em que isso acontece.
    permitidos: ["superadmin"],
  },
  {
    nome: "Cadastro",
    path: "/cadastro",
    rota: "/cadastro",
    mod: () => import("./Cadastro"),
    exige: ["admin", "coordenador"],
    permitidos: ["coordenador", "admin", "superadmin"],
  },
  {
    nome: "CadastroLote",
    path: "/cadastro-lote",
    rota: "/cadastro-lote",
    mod: () => import("./CadastroLote"),
    exige: ["admin", "coordenador"],
    permitidos: ["coordenador", "admin", "superadmin"],
  },
  {
    nome: "Perfil",
    path: "/perfil",
    rota: "/perfil",
    mod: () => import("./Perfil"),
    // Config geral, não módulo: é a conta do Supabase Auth (nome + senha). Ganhou guard
    // em 2026-07-26 — antes não tinha nenhum e renderizava para visitante deslogado.
    permitidos: ["coordenador", "admin", "superadmin"],
    desvios: {
      // Colaborador puro tem página própria para "meus dados"; duas telas concorrentes
      // seria pior que uma recusa.
      colaborador: "/perfil-colaborador",
    },
  },
  {
    nome: "PerfilColaborador",
    path: "/perfil-colaborador",
    rota: "/perfil-colaborador",
    mod: () => import("./PerfilColaborador"),
    permitidos: ["colaborador"],
    desvios: {
      // Quem é gestor e NÃO é colaborador vai para `/auth`, não para o hub: o guard trata
      // "não é colaborador" no mesmo ramo de "não está logado"
      // (PerfilColaborador.tsx:132). Na prática o usuário volta ao hub, porque o /auth
      // rebate quem já está logado — é feio, mas não trava ninguém. Não afeta os 12 que
      // são gestor E colaborador: para eles `isColaborador` é true.
      coordenador: LOGIN,
      admin: LOGIN,
      superadmin: LOGIN,
    },
  },
];

describe("guards de página — matriz papel × rota", () => {
  beforeEach(cenarioLimpo);

  it("a matriz cobre as páginas guardadas do App.tsx", () => {
    // Sem esta asserção, esvaziar PAGINAS por acidente faria todo o resto passar por
    // vacuidade — o mesmo cuidado que o teste de acessibilidade dos diálogos toma.
    // 19 até 2026-07-26; 21 desde o módulo Candidatos (/candidatos e /candidatos/importar);
    // 22 desde 2026-07-30, com a página de gestão de cargos (/candidatos/cargos).
    expect(PAGINAS.length).toBe(22);
    expect(new Set(PAGINAS.map((p) => p.nome)).size).toBe(PAGINAS.length);
  });

  describe.each(PAGINAS)("$nome", (pagina) => {
    const esperado = (papel: Papel): string =>
      pagina.desvios?.[papel] ?? (papel === "deslogado" ? LOGIN : HUB);

    const recusados = TODOS_OS_PAPEIS.filter((p) => !pagina.permitidos.includes(p));

    it.each(recusados)("recusa %s", async (papel) => {
      await montar(pagina, PAPEIS[papel]());
      await esperarRota(esperado(papel));
    });

    it.each(pagina.permitidos)("deixa %s entrar", async (papel) => {
      await montar(pagina, PAPEIS[papel]());
      await esperarCarregar();
      expect(rotaAtual()).not.toBe(LOGIN);
      // O hub só é destino de RECUSA; para a página que mora nele, ficar é o certo.
      if (pagina.rota !== HUB) expect(rotaAtual()).not.toBe(HUB);
      // Esperar as queries assentarem antes de encerrar. Sem isto, o que ainda estava em
      // voo atualiza estado depois do teste e vira aviso de `act` (armadilha 3): ruído
      // que esconde problema real na suíte seguinte. Só a página maior do repo (935 l.)
      // chegava a produzi-lo, mas a espera é barata e vale para todas.
      // ⚠️ RUÍDO CONHECIDO, 3 avisos de `act` nesta página e só nela.
      // `GerenciarColaboradoresProva` tem dois `useEffect` que chamam
      // `supabase...then()` CRU (linhas ~116 e ~132), fora do React Query — o resto do
      // repo não faz isso. O estado que eles atualizam aterrissa fora de qualquer
      // `act`, e nem esperar as queries, nem drenar macrotarefa, nem desmontar a árvore
      // silenciam: as três coisas foram tentadas. A causa é a página, não o teste.
      // Anotado no backlog; some quando aqueles efeitos virarem query.
    });
  });
});

// ---------------------------------------------------------------------------
// As duas dimensões que o RequireModulo tem de herdar
// ---------------------------------------------------------------------------

describe("a janela em que o usuário existe e os papéis ainda não", () => {
  beforeEach(cenarioLimpo);

  /**
   * O estado: `user` setado, `loading` já false, `rolesLoaded` false, `role` ainda null.
   * É real — `useAuth.tsx:88` zera `rolesLoaded` a cada `applySession`.
   *
   * **Antes do `RequireAcesso` esta seção era `⚠️ ATENÇÃO`:** 13 páginas decidiam sobre
   * um conjunto de papéis VAZIO e mandavam para o hub, e só quatro esperavam. Não chegava
   * a expulsar ninguém — no refresh de token o `role` anterior sobrevive ao refetch —,
   * mas era fragilidade latente, e virava bug real no dia em que alguém limpasse os
   * papéis antes do refetch ou fizesse o login cair direto numa página de módulo.
   *
   * Com a guarda única, **nenhuma página decide sem os papéis**. Deixou de ser ressalva e
   * virou invariante — é o principal ganho da centralização, junto com o `isLoggingOut`.
   */
  const janela = () => estado({ user: USUARIO, rolesLoaded: false, role: null });

  it.each(PAGINAS)("$nome espera, em vez de decidir", async (pagina) => {
    await montar(pagina, janela());
    // O spinner na tela é a evidência positiva de que está esperando — mais forte que
    // "não navegou". A única exceção é o /perfil, que resolve o mesmo estado sem spinner.
    if (pagina.nome !== "Perfil") {
      await waitFor(() => expect(spinnerNaTela()).toBe(true), ESPERA);
    }
    expect(rotaAtual()).toBe(pagina.rota);
  });

  it("as duas páginas consertadas em 2026-07-25 seguem esperando", () => {
    // Elas ganharam o `rolesLoaded` à mão porque decidir na janela expulsava coordenador
    // legítimo. Agora a regra vale para todas, mas o registro fica: foi o que motivou.
    const nomes = PAGINAS.map((p) => p.nome);
    expect(nomes).toContain("Colaboradores");
    expect(nomes).toContain("FuncoesColaboradores");
  });
});

describe("logout em curso não dispara redirecionamento por conta própria", () => {
  beforeEach(cenarioLimpo);

  /**
   * `signOut` limpa `user` ANTES de navegar (`useAuth.tsx:157-163`) e só depois faz
   * `window.location.href = '/auth'`. Entre as duas coisas, um guard que reaja a `!user`
   * navega sozinho.
   *
   * Antes eram três páginas respeitando `isLoggingOut` e quinze mandando para `/auth` —
   * inofensivo (o destino era o mesmo), mas inconsistente. A guarda única fecha isso: as
   * de gestão ficam todas quietas. As três que guardam a si mesmas seguem com a regra
   * delas.
   */
  const saindo = () => estado({ user: null, isLoggingOut: true });

  it.each(PAGINAS.filter((p) => p.exige || p.nome !== "PerfilColaborador"))(
    "$nome fica quieta",
    async (pagina) => {
      await montar(pagina, saindo());
      expect(rotaAtual()).toBe(pagina.rota);
    },
  );

  it("PerfilColaborador segue mandando ao login — guarda própria, não é página de módulo", async () => {
    const pagina = PAGINAS.find((p) => p.nome === "PerfilColaborador")!;
    await montar(pagina, saindo());
    await esperarRota(LOGIN);
  });
});

// ---------------------------------------------------------------------------
// Regressões do /perfil — a página que não tinha guard
// ---------------------------------------------------------------------------

/**
 * Até 2026-07-26 `Perfil.tsx` não tinha guard NENHUM: lia `user` do contexto e
 * renderizava, sem `useEffect` de redirecionamento e sem `<Navigate>`. Era a terceira
 * ocorrência da mesma omissão (as duas primeiras foram `Colaboradores` e
 * `FuncoesColaboradores`) e a mais completa: aquelas ao menos mandavam o deslogado para
 * `/auth`.
 *
 * A recusa em si é afirmada pela matriz lá em cima. Aqui ficam as duas coisas que a
 * matriz não vê — e que foi o guard ausente que deixou passar.
 */
describe("Perfil (/perfil)", () => {
  beforeEach(cenarioLimpo);

  const perfil = PAGINAS.find((p) => p.nome === "Perfil")!;

  it("não deixa escapar o formulário para quem não tem sessão", async () => {
    // Complemento da matriz: ela afirma "foi para /auth", isto afirma "e a tela de conta
    // não apareceu no caminho". Era exatamente o que acontecia antes do guard.
    await montar(perfil, PAPEIS.deslogado());
    await esperarRota(LOGIN);
    expect(screen.queryByRole("heading", { name: "Meu Perfil" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nome Completo")).not.toBeInTheDocument();
  });

  it("preenche o nome atual quando a sessão resolve depois do mount", async () => {
    // O nome vinha só do `useState` inicial, que roda no primeiro render — quando a
    // sessão ainda não resolveu. Num reload direto em /perfil o campo aparecia VAZIO
    // para quem tinha nome salvo, e salvar assim APAGAVA o nome. A sincronização por
    // `user?.id` conserta; este teste é a rede dela.
    await montar(
      perfil,
      estado({
        user: { ...USUARIO, user_metadata: { full_name: "Fulana de Souza" } },
        role: "admin",
        roles: ["admin"],
        isAdmin: true,
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("Nome Completo")).toHaveValue("Fulana de Souza"));
  });
});
