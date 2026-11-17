/**
 * O editor da vista da folha — o que tornou `{{campo:email_vista_folha}}` e
 * `{{campo:intersticio_vista_horas}}` preenchíveis (antes de 2026-11-16, nenhuma tela
 * escrevia `regras_vista_prova`).
 *
 * O que se guarda: grava SÓ as duas colunas, por upsert na PK `edital_id` (as outras duas
 * colunas da tabela não podem ser apagadas por quem só mexe nestas); e o interstício não
 * inteiro NÃO é gravado — nem arredondado calado.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { builderQueChamou, buildersDaTabela, resetSupabaseMock, setTableResult } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { VistaDaFolha } from "@/components/VistaDaFolha";

beforeEach(() => {
  resetSupabaseMock();
  toast.mockClear();
  setTableResult("regras_vista_prova", { data: null, error: null });
});

const algumUpsert = () => buildersDaTabela("regras_vista_prova").some((b) => b.upsert.mock.calls.length > 0);

describe("VistaDaFolha", () => {
  it("grava o e-mail por upsert na PK, mandando SÓ a coluna mexida", async () => {
    renderWithProviders(<VistaDaFolha editalId="ed-1" />);
    const email = await screen.findByLabelText(/e-mail para pedir vista/i);
    await userEvent.type(email, "  vista@fevre.org ");
    await userEvent.tab();
    await waitFor(() => expect(algumUpsert()).toBe(true));
    expect(builderQueChamou("regras_vista_prova", "upsert").upsert).toHaveBeenCalledWith(
      { email_solicitacao: "vista@fevre.org", edital_id: "ed-1" },
      { onConflict: "edital_id" },
    );
  });

  it("controle positivo: interstício inteiro é gravado", async () => {
    renderWithProviders(<VistaDaFolha editalId="ed-1" />);
    await userEvent.type(await screen.findByLabelText(/interstício/i), "48");
    await userEvent.tab();
    await waitFor(() => expect(algumUpsert()).toBe(true));
    expect(builderQueChamou("regras_vista_prova", "upsert").upsert.mock.calls[0][0]).toEqual({
      intersticio_minimo_horas: 48,
      edital_id: "ed-1",
    });
  });

  it("🔴 interstício fracionário NÃO é gravado, nem arredondado — e a pessoa é avisada", async () => {
    renderWithProviders(<VistaDaFolha editalId="ed-1" />);
    await userEvent.type(await screen.findByLabelText(/interstício/i), "1.5");
    await userEvent.tab();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "O interstício é em horas inteiras" }));
    expect(algumUpsert()).toBe(false);
  });

  it("apagar o e-mail grava NULL, não string vazia", async () => {
    setTableResult("regras_vista_prova", { data: { email_solicitacao: "a@b.c", intersticio_minimo_horas: null }, error: null });
    renderWithProviders(<VistaDaFolha editalId="ed-1" />);
    const email = await screen.findByLabelText(/e-mail para pedir vista/i);
    await waitFor(() => expect(email).toHaveValue("a@b.c"));
    await userEvent.clear(email);
    await userEvent.tab();
    await waitFor(() => expect(algumUpsert()).toBe(true));
    expect(builderQueChamou("regras_vista_prova", "upsert").upsert.mock.calls[0][0]).toEqual({
      email_solicitacao: null,
      edital_id: "ed-1",
    });
  });
});
