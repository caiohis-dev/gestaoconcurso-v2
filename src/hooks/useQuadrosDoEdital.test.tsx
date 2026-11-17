/**
 * O dado dos quadros — e a guarda contra "vazio enquanto carrega".
 *
 * 🔴 Até 2026-11-16 `useLinhasPorFonte` devolvia `{ cargos: 0, … }` enquanto carregava, e o
 * linter acusava `quadro-sem-dado` em todos os quadros no primeiro frame. Com o portão da
 * exportação consultando o linter, um zero que quer dizer "carregando" decidiria se o
 * edital sai. O que se guarda aqui: NENHUM render devolve contagem que não seja a final.
 *
 * ⚠️ O caso mais traiçoeiro é a consulta DEPENDENTE: as disciplinas só são buscadas depois
 * que os cargos do edital chegam. Se houver um render entre as duas, ele diria "1 cargo,
 * 0 disciplinas" — plausível e falso. Por isso a asserção é sobre TODOS os renders, não só
 * sobre o primeiro e o último.
 *
 * ⚠️ Falsificado em 2026-11-16, e o resultado tem uma nuance: tirar SÓ a carga da prova
 * (`provaQ.isLoading`) deixa a suíte verde — títulos e vagas por área também dependem dos
 * cargos e começam no mesmo render, então a carga delas cobre a da prova. Tirando as TRÊS,
 * o caso cai exatamente no render parcial: `{ cargos: 1, disciplinas: 0 }`. A proteção é
 * sobreposta, não ausente; mas se um dia sobrar uma só consulta dependente, cada flag passa
 * a ser a única guarda dela.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { setTableResult, resetSupabaseMock } from "@/test/supabase-mock";
import { renderHookWithProviders } from "@/test/utils";

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useLinhasPorFonte } from "@/hooks/useQuadrosDoEdital";

const FINAL = { cargos: 1, disciplinas: 2, cronograma: 1, titulos: 0, vagas_por_area: 0 };

beforeEach(() => {
  resetSupabaseMock();
  setTableResult("edital_cargos", { data: [{ id: "ec1", cargo_id: "c1" }], error: null });
  setTableResult("cargos", { data: [{ id: "c1", nome: "ENFERMEIRO" }], error: null });
  setTableResult("cronograma_etapas", {
    data: [{ id: "e1", nome_evento: "Prova", tipo: "DATA_UNICA", datas: ["2026-09-20"], ordem: 0, chave: null }],
    error: null,
  });
  setTableResult("provas_disciplinas", {
    data: [
      { id: "d1", edital_cargo_id: "ec1", nome_disciplina: "Português", quantidade_questoes: 10, peso_por_questao: 1, ordem: 0 },
      { id: "d2", edital_cargo_id: "ec1", nome_disciplina: "SUS", quantidade_questoes: 10, peso_por_questao: 1, ordem: 1 },
    ],
    error: null,
  });
});

describe("useLinhasPorFonte", () => {
  it("🔴 nenhum render devolve contagem parcial: ou `undefined`, ou a final", async () => {
    const vistos: unknown[] = [];
    const hook = renderHookWithProviders(() => {
      const r = useLinhasPorFonte("edital-1");
      vistos.push(r);
      return r;
    });

    await waitFor(() => expect(hook.result.current).toEqual(FINAL));
    // O primeiro render é de carga — e tem de dizer isso, não "zero linhas".
    expect(vistos[0]).toBeUndefined();
    for (const v of vistos) if (v !== undefined) expect(v).toEqual(FINAL);
  });

  it("controle positivo: edital sem quadro nenhum devolve ZEROS de verdade, não `undefined` para sempre", async () => {
    setTableResult("edital_cargos", { data: [], error: null });
    setTableResult("cronograma_etapas", { data: [], error: null });
    const hook = renderHookWithProviders(() => useLinhasPorFonte("edital-1"));
    await waitFor(() =>
      expect(hook.result.current).toEqual({ cargos: 0, disciplinas: 0, cronograma: 0, titulos: 0, vagas_por_area: 0 }),
    );
  });
});
