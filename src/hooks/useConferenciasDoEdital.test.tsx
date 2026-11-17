/**
 * O dado das dez conferências — e a guarda contra "vazio enquanto carrega".
 *
 * 🔴 Três consultas DEPENDEM dos cargos do edital (matriz, títulos, distribuição). Um render
 * entre a chegada dos cargos e a delas diria "1 cargo, 0 disciplinas" — e o portão
 * avaliaria a matriz como vazia. A asserção é sobre TODOS os renders.
 *
 * ⚠️ Falsificado em 2026-11-16, com a mesma nuance de `useQuadrosDoEdital.test.tsx`: tirar
 * as cargas das TRÊS dependentes derruba o caso; tirar SÓ a de `useEditalCargos` (a guarda
 * delas) deixa verde. No mock tudo responde no mesmo tique, e enquanto os cargos não chegam
 * as outras oito consultas ainda estão carregando e cobrem o intervalo. A proteção é
 * sobreposta, não ausente — mas na rede real os cargos podem ser os últimos, e então a carga
 * de `useEditalCargos` é a única guarda. Não a tire.
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

import { useDadosDasConferencias } from "@/hooks/useConferenciasDoEdital";
import type { DadosDasConferencias } from "@/lib/edital-conferencias";

const resumo = (d: DadosDasConferencias | undefined) =>
  d && {
    cargos: d.cargosDoEdital.length,
    disciplinas: d.prova.disciplinas.length,
    titulos: d.titulos.itens.length,
    distribuicao: d.distribuicao.length,
  };

beforeEach(() => {
  resetSupabaseMock();
  setTableResult("edital_cargos", { data: [{ id: "ec1", cargo_id: "c1" }], error: null });
  setTableResult("provas_disciplinas", {
    data: [
      { id: "d1", edital_cargo_id: "ec1", nome_disciplina: "Português", quantidade_questoes: 10, peso_por_questao: 1, ordem: 0 },
      { id: "d2", edital_cargo_id: "ec1", nome_disciplina: "SUS", quantidade_questoes: 10, peso_por_questao: 1, ordem: 1 },
    ],
    error: null,
  });
  setTableResult("titulos_itens", {
    data: [{ id: "t1", edital_cargo_id: "ec1", nivel: "DOUTORADO", descricao: "D", pontos_minimo: 4, pontos_maximo: 4 }],
    error: null,
  });
  setTableResult("edital_cargo_unidades", {
    data: [{ id: "v1", edital_cargo_id: "ec1", unidade_lotacao_id: "u1", vagas_ampla_concorrencia: 1, vagas_pcd: 0, vagas_negros: 0 }],
    error: null,
  });
});

describe("useDadosDasConferencias", () => {
  it("🔴 nenhum render devolve dado parcial: ou `undefined`, ou o final", async () => {
    const FINAL = { cargos: 1, disciplinas: 2, titulos: 1, distribuicao: 1 };
    const vistos: unknown[] = [];
    const hook = renderHookWithProviders(() => {
      const r = useDadosDasConferencias("edital-1");
      vistos.push(resumo(r));
      return r;
    });
    await waitFor(() => expect(resumo(hook.result.current)).toEqual(FINAL));
    expect(vistos[0]).toBeUndefined();
    for (const v of vistos) if (v !== undefined) expect(v).toEqual(FINAL);
  });

  it("controle positivo: edital sem cargo chega a um dado VAZIO de verdade, não `undefined` para sempre", async () => {
    setTableResult("edital_cargos", { data: [], error: null });
    const hook = renderHookWithProviders(() => useDadosDasConferencias("edital-1"));
    await waitFor(() => expect(resumo(hook.result.current)).toEqual({ cargos: 0, disciplinas: 0, titulos: 0, distribuicao: 0 }));
  });
});
