/**
 * Bateria da página de gestão de CARGOS.
 *
 * O que ela guarda, e por que cada caso está aqui:
 *
 *  - **A invalidação dupla do rename** vive no hook e tem teste lá; aqui o que se guarda é
 *    o caminho da tela até ele — que o diálogo de edição chegue com o nome certo e que o
 *    submit chame `atualizar`, não `criar`. Um diálogo só serve aos dois, e trocar o ramo
 *    é o erro fácil.
 *  - **⭐ O aviso de que os apelidos vão junto.** `cargo_apelidos.cargo_id` é CASCADE:
 *    excluir o cargo apaga em silêncio a memória de "texto sujo → cargo" que pré-preenche
 *    as próximas importações. É perda real e invisível; sem teste, o aviso some na primeira
 *    refatoração do diálogo e ninguém percebe.
 *  - **A ausência de pré-check de uso.** Quem barra a exclusão é a FK do banco, não um
 *    `if` aqui. A tela informa a contagem; ela não decide.
 *
 * Ler `my_rules/estrutura/transversais/testes.md` (as 8 armadilhas) antes de estender.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  setTableResult,
  resetSupabaseMock,
  erroPostgrest,
  builderQueChamou,
  buildersDaTabela,
} from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...real, useNavigate: () => navigateMock };
});

/**
 * O `Layout` que a página envolve consome o `useAuth` inteiro. Mockar o hook — e não
 * montar o AuthProvider — segue o padrão de `Candidatos.ui.test.tsx` e do
 * `guards.test.tsx`: o objeto de teste aqui é o CRUD, não a sessão.
 */
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

import Cargos from "./Cargos";

/** Uma linha do catálogo no formato que o embed de agregação devolve. */
function linha(nome: string, candidatos: number, apelidos: number, id = nome.toLowerCase()) {
  return {
    id,
    nome,
    nome_chave: nome.toLowerCase(),
    ativo: true,
    created_at: null,
    updated_at: null,
    candidatos: [{ count: candidatos }],
    cargo_apelidos: [{ count: apelidos }],
  };
}

const EM_USO = linha("DOCENTE II", 3756, 2, "cargo-docente-ii");
const SEM_USO = linha("ARTE", 0, 0, "cargo-arte");

function abrir() {
  renderWithProviders(<Cargos />, { route: "/candidatos/cargos" });
  return userEvent.setup();
}

describe("Cargos (interação)", () => {
  beforeEach(() => {
    resetSupabaseMock();
    toastMock.mockClear();
    navigateMock.mockClear();
    setTableResult("cargos", { data: [EM_USO, SEM_USO], error: null });
  });

  describe("listagem", () => {
    it("mostra o uso de cada cargo — é o que decide se dá para excluir", async () => {
      abrir();

      const linhaEmUso = (await screen.findByText("DOCENTE II")).closest("tr") as HTMLElement;
      expect(within(linhaEmUso).getByText("3756")).toBeInTheDocument();
      expect(within(linhaEmUso).getByText("2")).toBeInTheDocument();
    });

    it("o estado vazio diz o que fazer, e nomeia as duas portas", async () => {
      setTableResult("cargos", { data: [], error: null });
      abrir();

      expect(await screen.findByText("Nenhum cargo cadastrado")).toBeInTheDocument();
      // As DUAS portas: o botão daqui e o passo Cargos do assistente. Dizer só uma
      // deixaria o usuário achando que precisa cadastrar os 9 à mão antes de importar.
      expect(screen.getByText(/para criar o primeiro/i)).toBeInTheDocument();
      expect(screen.getByText(/assistente também cadastra/i)).toBeInTheDocument();
    });
  });

  describe("🔴 cargo com menção é IMUTÁVEL (2026-07-31)", () => {
    it("⭐ não oferece Renomear nem Excluir, e DIZ por quê", async () => {
      // Botão cinza e mudo deixa o usuário procurando o que fazer. E deixá-lo clicável
      // seria pior: ele digitaria um nome novo para só então levar erro do banco.
      abrir();

      const linhaEmUso = (await screen.findByText("DOCENTE II")).closest("tr") as HTMLElement;
      expect(within(linhaEmUso).getByText(/não editável/i)).toBeInTheDocument();
      expect(within(linhaEmUso).queryByRole("button", { name: /Renomear/i })).not.toBeInTheDocument();
      expect(within(linhaEmUso).queryByRole("button", { name: /Excluir/i })).not.toBeInTheDocument();
    });

    it("⚠️ APELIDO sozinho também tranca — menção é menção", async () => {
      // Este é o caso que mudou em 31/07: até 30/07 o apelido era levado por CASCADE e não
      // impedia nada. Um cargo sem inscrito nenhum, mas com um texto memorizado, agora é
      // tão imutável quanto um com 3.756 inscritos.
      setTableResult("cargos", { data: [linha("SÓ APELIDO", 0, 1, "cargo-so-apelido")], error: null });
      abrir();

      const l = (await screen.findByText("SÓ APELIDO")).closest("tr") as HTMLElement;
      expect(within(l).getByText(/não editável/i)).toBeInTheDocument();
    });

    it("CONTROLE POSITIVO: cargo sem menção nenhuma continua editável", async () => {
      // Sem este caso, os dois acima provariam só que a tela travou tudo.
      abrir();

      const l = (await screen.findByText("ARTE")).closest("tr") as HTMLElement;
      expect(within(l).getByRole("button", { name: /Renomear/i })).toBeInTheDocument();
      expect(within(l).getByRole("button", { name: /Excluir/i })).toBeInTheDocument();
    });
  });

  describe("criar e renomear — um diálogo só", () => {
    it("⭐ 'Novo cargo' abre em branco e chama a CRIAÇÃO", async () => {
      const user = abrir();
      await screen.findByText("DOCENTE II");

      await user.click(screen.getByRole("button", { name: /Novo cargo/i }));
      const campo = await screen.findByLabelText(/Nome do cargo/i);
      expect(campo).toHaveValue("");

      await user.type(campo, "DOCENTE I — GEOGRAFIA");
      await user.click(screen.getByRole("button", { name: "Criar" }));

      await waitFor(() =>
        expect(buildersDaTabela("cargos").some((b) => b.upsert.mock.calls.length > 0)).toBe(true),
      );
    });

    it("⭐ 'Renomear' abre COM o nome atual e chama o UPDATE, não o upsert", async () => {
      // O erro fácil aqui é o diálogo compartilhado cair no ramo errado: renomear passaria
      // a criar um cargo novo, e o antigo ficaria lá com todos os inscritos.
      const user = abrir();
      await screen.findByText("DOCENTE II");

      await user.click(screen.getByRole("button", { name: "Renomear ARTE" }));
      const campo = await screen.findByLabelText(/Nome do cargo/i);
      expect(campo).toHaveValue("ARTE");

      await user.clear(campo);
      await user.type(campo, "DOCENTE I - ARTE");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() =>
        expect(builderQueChamou("cargos", "update").update).toHaveBeenCalledWith({
          nome: "DOCENTE I - ARTE",
        }),
      );
      expect(buildersDaTabela("cargos").some((b) => b.upsert.mock.calls.length > 0)).toBe(false);
    });

    it("⚠️ abrir 'Novo' depois de 'Renomear' NÃO traz o formulário sujo", async () => {
      // A armadilha do `useEffect` sem ramo `else`: o usuário renomearia sem querer, ou
      // criaria um duplicado do cargo que acabou de editar.
      const user = abrir();
      await screen.findByText("DOCENTE II");

      await user.click(screen.getByRole("button", { name: "Renomear ARTE" }));
      expect(await screen.findByLabelText(/Nome do cargo/i)).toHaveValue("ARTE");
      await user.click(screen.getByRole("button", { name: /Cancelar/i }));

      await user.click(screen.getByRole("button", { name: /Novo cargo/i }));
      expect(await screen.findByLabelText(/Nome do cargo/i)).toHaveValue("");
    });
  });

  describe("exclusão", () => {
    // ⚠️ TRÊS TESTES SAÍRAM DAQUI EM 2026-07-31, e o motivo vale registrar: eles cobriam
    // ramos do diálogo que a regra "cargo com menção é imutável" tornou INALCANÇÁVEIS —
    // o aviso de "N inscritos vão barrar" (o botão sumiu) e o de "N apelidos serão
    // apagados junto" (o apelido deixou de ser CASCADE e passou a BARRAR). Manter testes
    // sobre ramos mortos faria a suíte afirmar comportamento que não existe mais.
    // O que sobrou é o caso real: o diálogo só abre para cargo sem menção nenhuma.

    it("o diálogo só fala do caso que sobrou: cargo sem menção nenhuma", async () => {
      const user = abrir();
      await screen.findByText("ARTE");

      await user.click(screen.getByRole("button", { name: "Excluir ARTE" }));

      const dialogo = await screen.findByRole("alertdialog");
      expect(within(dialogo).getByText(/não tem nenhum inscrito nem texto/i)).toBeInTheDocument();
    });

    it("cancelar não chama exclusão nenhuma", async () => {
      const user = abrir();
      await screen.findByText("ARTE");

      await user.click(screen.getByRole("button", { name: "Excluir ARTE" }));
      await user.click(await screen.findByRole("button", { name: /Cancelar/i }));

      expect(buildersDaTabela("cargos").some((b) => b.delete.mock.calls.length > 0)).toBe(false);
    });

    it("confirmar exclui pelo id do cargo escolhido", async () => {
      const user = abrir();
      await screen.findByText("ARTE");

      await user.click(screen.getByRole("button", { name: "Excluir ARTE" }));
      const dialogo = await screen.findByRole("alertdialog");
      await user.click(within(dialogo).getByRole("button", { name: "Excluir" }));

      await waitFor(() =>
        expect(builderQueChamou("cargos", "delete").eq).toHaveBeenCalledWith("id", "cargo-arte"),
      );
    });

    // ⚠️ A tradução da recusa do banco (RESTRICT → "em uso por candidatos") é testada no
    // HOOK, em `useCargos.test.tsx`. Aqui um `setTableResult` atingiria o SELECT junto com
    // o DELETE, e o teste mediria a lista falhando em vez da exclusão — provaria outra
    // coisa com o nome desta.
  });

  it("volta para a listagem de candidatos", async () => {
    const user = abrir();
    await screen.findByText("DOCENTE II");

    await user.click(screen.getByRole("button", { name: /Voltar para a lista de candidatos/i }));
    expect(navigateMock).toHaveBeenCalledWith("/candidatos");
  });
});
