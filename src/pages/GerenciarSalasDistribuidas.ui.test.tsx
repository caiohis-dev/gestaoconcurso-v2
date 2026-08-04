/**
 * Bateria do CONGELAMENTO de `/gerenciar-salas-distribuidas`.
 *
 * 🔴 Por que esta tela ganhou teste de página em 2026-08-03. Ela nunca olhou
 * `prova_finalizada`: o único obstáculo a editar salas de uma prova encerrada era
 * `GerenciarProva` não mostrar o link para cá na visão de prova finalizada. URL na mão,
 * aba aberta antes da finalização ou PostgREST direto gravavam normalmente — e as 58 salas
 * do banco local estão TODAS em provas já finalizadas.
 *
 * 🔵 O arquivo cresceu em 03/08 com um segundo assunto, no fim: o refetch que apagava
 * edição não salva.
 *
 * ⚠️ **A barreira NÃO é esta tela**, e nenhum teste daqui prova barreira. Quem recusa é o
 * trigger `check_sala_de_prova_finalizada` (PF001, migration 20260803003152), e quem o
 * verifica é `docs/bateria-salas-renumeracao.sql` — a suíte mocka o Supabase. O que se
 * fixa aqui é o dever da tela: EXPLICAR, e não oferecer controle que o banco vai recusar.
 *
 * O escopo é só o congelamento, de propósito: o resto da página (fiscais, capacidade,
 * sala extra) não tem bateria e testá-lo junto compraria fragilidade sem garantia.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusManager } from "@tanstack/react-query";
import { supabaseMock, setTableResult, resetSupabaseMock } from "@/test/supabase-mock";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

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

import GerenciarSalasDistribuidas from "./GerenciarSalasDistribuidas";

const PROVA_ID = "prova-1";
const UNIDADE_ID = "unid-1";

const PROVA = {
  id: PROVA_ID,
  prova_edital: "Edital 001/2026 SMA",
  edital_id: "edital-1",
  prova_data: "2026-03-08",
  prova_finalizada: false,
  finalizada_at: null,
  created_at: null,
  updated_at: null,
  created_by: "u-1",
  editais: { nome: "Edital 001/2026 SMA" },
};

const UNIDADE = { id: UNIDADE_ID, unid_nome: "ESCOLA MUNICIPAL X", unid_sigla: "EMX" };

/** O vínculo prova↔unidade carrega o SEGUNDO nível de finalização. */
const vinculo = (unidade_finalizada: boolean) => ({
  id: "pu-1",
  prova_id: PROVA_ID,
  unidade_id: UNIDADE_ID,
  unidade_finalizada,
  unidade_finalizada_at: null,
  created_at: null,
  created_by: null,
  unidades_prova: UNIDADE,
});

const SALA = {
  id: "s1",
  prova_id: PROVA_ID,
  sala_fk_unidade: UNIDADE_ID,
  sala_numero: 101,
  sala_descricao: "Sala 1",
  sala_capacidade: 30,
  sala_andar: 1,
  sala_fiscal_1: null,
  sala_fiscal_2: null,
  created_at: null,
  updated_at: null,
  created_by: null,
};

function abrir() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/gerenciar-salas-distribuidas/:provaId/:unidadeId"
        element={<GerenciarSalasDistribuidas />}
      />
      <Route path="*" element={<span>SAIU DA PÁGINA</span>} />
    </Routes>,
    { route: `/gerenciar-salas-distribuidas/${PROVA_ID}/${UNIDADE_ID}` },
  );
}

/** A âncora de "a página carregou": a tabela de salas só existe com dado. */
const linhaDaSala = () => screen.findByDisplayValue("Sala 1");

describe("GerenciarSalasDistribuidas — prova/unidade finalizada congela as salas", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableResult("provas", { data: [PROVA], error: null });
    setTableResult("unidades_prova", { data: [UNIDADE], error: null });
    setTableResult("prova_unidades", { data: [vinculo(false)], error: null });
    setTableResult("salas_prova_distribuidas", { data: [SALA], error: null });
  });

  it("⭐ CONTROLE POSITIVO: prova e unidade ABERTAS — edita normalmente", async () => {
    // Sem este caso, "não dá para editar" poderia significar "nunca deu".
    abrir();

    expect(await linhaDaSala()).toBeEnabled();
    expect(screen.getByRole("button", { name: /Salvar Alterações/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar Sala Extra/ })).toBeInTheDocument();
    expect(screen.queryByText("Salas somente leitura")).not.toBeInTheDocument();
  });

  it("prova finalizada: diz POR QUÊ, tira os botões e trava os campos", async () => {
    setTableResult("provas", { data: [{ ...PROVA, prova_finalizada: true }], error: null });

    abrir();

    // Explicar vem antes de impedir: sem o motivo, a tela morta parece defeito.
    expect(await screen.findByText("Salas somente leitura")).toBeInTheDocument();
    expect(screen.getByText(/prova está finalizada/i)).toBeInTheDocument();
    expect(screen.getByText(/reabra a prova/i)).toBeInTheDocument();

    expect(await linhaDaSala()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salvar Alterações/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adicionar Sala Extra/ })).not.toBeInTheDocument();
  });

  it("🔴 unidade finalizada COM a prova aberta: congela do mesmo jeito", async () => {
    // O segundo nível existe e diverge do primeiro no dado real (2 de 13 vínculos). Quem
    // o aciona é o COORDENADOR, via `finalizar_prova_unidade` — daí a mensagem falar em
    // reabrir a UNIDADE, não a prova.
    setTableResult("prova_unidades", { data: [vinculo(true)], error: null });

    abrir();

    expect(await screen.findByText("Salas somente leitura")).toBeInTheDocument();
    expect(screen.getByText(/unidade já foi finalizada/i)).toBeInTheDocument();
    expect(screen.queryByText(/prova está finalizada/i)).not.toBeInTheDocument();
    expect(await linhaDaSala()).toBeDisabled();
  });

  it("⚠️ vínculo AUSENTE não congela — e não quebra a página", async () => {
    // `find` devolvendo undefined não pode virar "congelada": travar por falta de dado
    // esconderia o estado inconsistente em vez de mostrá-lo, e é a mesma decisão que o
    // trigger toma no banco (`coalesce(..., false)`).
    setTableResult("prova_unidades", { data: [], error: null });

    abrir();

    expect(await linhaDaSala()).toBeEnabled();
    expect(screen.queryByText("Salas somente leitura")).not.toBeInTheDocument();
  });
});

/**
 * 🔴 EDIÇÃO NÃO SALVA NÃO É SOBRESCRITA (2026-08-03).
 *
 * O efeito que copia `salas` para o estado local rodava a cada mudança de referência da
 * query. Com `refetchOnWindowFocus` ligado (o `QueryClient` do `App.tsx` nasce sem
 * defaults), bastava outra pessoa salvar naquela unidade e você voltar para a aba: o que
 * estava digitado sumia, sem aviso e sem confirmação — perda silenciosa, o formato de
 * defeito que este repo mais teme.
 *
 * ⚠️ **O defeito não aparecia no uso comum**, e é por isso que sobreviveu: com dado
 * IDÊNTICO o structural sharing do react-query preserva a referência e a edição fica de
 * pé. Só mordia quando o dado tinha mudado de verdade — exatamente a hora em que perder
 * o trabalho é mais caro. Medido nos dois cenários antes de mexer.
 *
 * O refetch se dispara aqui pelo `focusManager`, que é a API do react-query por trás do
 * "voltar para a aba" — `window.dispatchEvent(new Event("focus"))` não basta no jsdom.
 */
describe("GerenciarSalasDistribuidas — refetch não apaga edição pendente", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableResult("provas", { data: [PROVA], error: null });
    setTableResult("unidades_prova", { data: [UNIDADE], error: null });
    setTableResult("prova_unidades", { data: [vinculo(false)], error: null });
    setTableResult("salas_prova_distribuidas", { data: [SALA], error: null });
  });

  /** Simula o "voltar para a aba" que o react-query traduz em refetch. */
  async function voltarParaAAba() {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  }

  it("🔴 dado MUDADO no servidor: a edição fica, e a tela AVISA", async () => {
    abrir();

    const campo = await linhaDaSala();
    await userEvent.clear(campo);
    await userEvent.type(campo, "MINHA EDIÇÃO");

    // Outra pessoa mudou a capacidade da mesma sala.
    setTableResult("salas_prova_distribuidas", {
      data: [{ ...SALA, sala_capacidade: 99 }],
      error: null,
    });
    await voltarParaAAba();

    expect(
      await screen.findByText("Estas salas mudaram no servidor enquanto você editava"),
    ).toBeInTheDocument();
    // O que a pessoa digitou continua lá; o número do servidor NÃO entrou por cima.
    expect(screen.getByDisplayValue("MINHA EDIÇÃO")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("99")).not.toBeInTheDocument();
  });

  it("⭐ CONTROLE POSITIVO: SEM edição pendente, o dado novo entra normalmente", async () => {
    // Sem este par, "a edição fica" poderia significar "a tela congelou e nunca mais
    // atualiza" — que seria trocar um defeito por outro.
    abrir();
    await linhaDaSala();

    setTableResult("salas_prova_distribuidas", {
      data: [{ ...SALA, sala_capacidade: 99 }],
      error: null,
    });
    await voltarParaAAba();

    expect(await screen.findByDisplayValue("99")).toBeInTheDocument();
    expect(
      screen.queryByText("Estas salas mudaram no servidor enquanto você editava"),
    ).not.toBeInTheDocument();
  });

  it("descartar as minhas alterações assume o que veio do servidor", async () => {
    abrir();

    const campo = await linhaDaSala();
    await userEvent.clear(campo);
    await userEvent.type(campo, "MINHA EDIÇÃO");

    setTableResult("salas_prova_distribuidas", {
      data: [{ ...SALA, sala_capacidade: 99 }],
      error: null,
    });
    await voltarParaAAba();
    await screen.findByText("Estas salas mudaram no servidor enquanto você editava");

    await userEvent.click(
      screen.getByRole("button", { name: "Descartar as minhas e recarregar" }),
    );

    expect(await screen.findByDisplayValue("99")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("MINHA EDIÇÃO")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Estas salas mudaram no servidor enquanto você editava"),
    ).not.toBeInTheDocument();
  });

  it("⚠️ a lista voltar VAZIA limpa a tabela — não deixa a carga anterior na tela", async () => {
    // Era `if (salas.length > 0)`, que ignorava a lista vazia. Tirar esse guarda expôs um
    // laço infinito de render (o hook devolvia `?? []`, array novo a cada render, e o
    // efeito se realimentava) — o worker do Vitest morria por falta de memória. A saída
    // foi a referência estável `SEM_SALAS` no hook; este caso é o que a exercita.
    abrir();
    await linhaDaSala();

    setTableResult("salas_prova_distribuidas", { data: [], error: null });
    await voltarParaAAba();

    await waitFor(() =>
      expect(screen.getByText("Nenhuma sala encontrada")).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("Sala 1")).not.toBeInTheDocument();
  });
});

/**
 * 🔴 CAMPO NUMÉRICO QUE NÃO DEIXAVA APAGAR (2026-08-03).
 *
 * `handleCapacidadeChange` e `handleNumeroChange` faziam `return` quando o valor não era
 * número. Apagar o conteúdo produz `""` → `NaN` → o estado não mudava → e, como o input é
 * CONTROLADO, o React repunha o valor antigo na tela. Efeito prático: não dava para
 * apagar dígito a dígito; só selecionando tudo e digitando por cima. `handleAndarChange`
 * fazia o oposto (vazio virava `null`): três campos numéricos, duas regras, nenhuma
 * escrita em lugar nenhum.
 *
 * Agora vazio é um estado de digitação legítimo nos três. O que muda é ONDE a exigência
 * mora: `sala_numero` e `sala_capacidade` são NOT NULL no banco (medido), então salvar em
 * branco é recusado com mensagem; `sala_andar` é NULLABLE e em branco é valor final.
 */
describe("GerenciarSalasDistribuidas — campos numéricos aceitam ficar vazios", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableResult("provas", { data: [PROVA], error: null });
    setTableResult("unidades_prova", { data: [UNIDADE], error: null });
    setTableResult("prova_unidades", { data: [vinculo(false)], error: null });
    setTableResult("salas_prova_distribuidas", { data: [SALA], error: null });
  });

  const campoCapacidade = () => screen.getByDisplayValue("30");

  it("🔴 apagar a capacidade DEIXA o campo vazio — não repõe o valor antigo", async () => {
    abrir();
    await linhaDaSala();

    await userEvent.clear(campoCapacidade());

    // O defeito aparecia exatamente aqui: o "30" voltava sozinho.
    expect(screen.queryByDisplayValue("30")).not.toBeInTheDocument();
  });

  it("⭐ CONTROLE POSITIVO: depois de apagar, dá para digitar o valor novo", async () => {
    // Sem este par, "o campo esvazia" poderia significar "o campo parou de aceitar
    // qualquer coisa".
    abrir();
    await linhaDaSala();

    const campo = campoCapacidade();
    await userEvent.clear(campo);
    await userEvent.type(campo, "45");

    expect(screen.getByDisplayValue("45")).toBeInTheDocument();
  });

  it("salvar com campo obrigatório em branco é RECUSADO, e nada vai ao banco", async () => {
    abrir();
    await linhaDaSala();

    await userEvent.clear(campoCapacidade());
    await userEvent.click(screen.getByRole("button", { name: /Salvar Alterações/ }));

    // A recusa é do cliente, antes da chamada — o banco tem NOT NULL, mas mandar para
    // levar erro seria transformar uma orientação em mensagem de erro.
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it("⭐ CONTROLE POSITIVO: preenchido de volta, salva normalmente", async () => {
    abrir();
    await linhaDaSala();

    const campo = campoCapacidade();
    await userEvent.clear(campo);
    await userEvent.type(campo, "45");
    await userEvent.click(screen.getByRole("button", { name: /Salvar Alterações/ }));

    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledTimes(1));
    const [nome, args] = supabaseMock.rpc.mock.calls[0];
    expect(nome).toBe("salvar_salas_distribuidas");
    expect(args.p_salas[0]).toMatchObject({ sala_capacidade: 45 });
  });

  it("⚠️ o ANDAR é NULLABLE: em branco é valor final, e vai como null", async () => {
    abrir();
    await linhaDaSala();

    await userEvent.clear(screen.getByDisplayValue("1"));
    await userEvent.click(screen.getByRole("button", { name: /Salvar Alterações/ }));

    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledTimes(1));
    expect(supabaseMock.rpc.mock.calls[0][1].p_salas[0]).toMatchObject({ sala_andar: null });
  });
});
