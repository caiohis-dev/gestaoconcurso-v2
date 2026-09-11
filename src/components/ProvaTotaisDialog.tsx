import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FuncaoStat {
  funcao_id: string;
  funcao_nome: string;
  ocupadas: number;
  meta: number;
}

interface UnidadeStat {
  prova_unidade_id: string;
  unid_nome: string;
  unid_sigla: string;
  unidade_finalizada: boolean;
  funcoes: FuncaoStat[];
}

/** Uma linha crua da RPC `totais_da_prova`: um par (unidade × função). */
interface LinhaTotais {
  prova_unidade_id: string;
  unid_nome: string | null;
  unid_sigla: string | null;
  unidade_finalizada: boolean | null;
  funcao_id: string;
  funcao_nome: string | null;
  meta: number | null;
  ocupadas: number | null;
}

interface ProvaTotaisDialogProps {
  provaId: string;
  /** Nome do edital, só para o título — não dispara consulta. */
  titulo: string;
  /** Recorte do coordenador. `null` = admin, sem recorte. */
  allowedProvaUnidadeIds?: string[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Os totais de meta × ocupação de uma prova — atrás da lanterna de `/provas`.
 *
 * 🔴 POR QUE ISTO É UM DIÁLOGO, E POR QUE A CONSULTA É `enabled: open`.
 *
 * Até 2026-09-10 tudo isto morava dentro do `ProvaCard`, e cada card fazia TRÊS consultas
 * ao montar para somar no cliente. Medido no banco local (cópia de produção), na maior das
 * 2 provas — 11 unidades, 531 alocações: **122.418 bytes em 3 requisições, POR CARD**. E
 * `/provas` renderiza um card por prova, sem paginação, num sistema onde provas nunca são
 * apagadas — então a listagem crescia sem teto, e refazia tudo a cada volta de foco da
 * janela (o `QueryClient` do `App.tsx` nasce sem `staleTime`).
 *
 * Agora a soma é feita no banco (RPC `totais_da_prova`) e só acontece quando alguém abre.
 *
 * ⚠️ O precedente do repo para atrasar a carga é `RelatorioImportacaoDialog`, que passa
 * `open ? id : null` para um hook com `enabled`. **NÃO copie `ValoresFuncaoProvaDialog`**:
 * ele é montado independente de `open` e os hooks dele não têm `enabled`, então consulta
 * mesmo fechado — é exatamente o defeito que este componente existe para eliminar.
 */
export function ProvaTotaisDialog({
  provaId,
  titulo,
  allowedProvaUnidadeIds,
  open,
  onOpenChange,
}: ProvaTotaisDialogProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const { isAdmin } = useAuth();

  const { data: unidades = [], isLoading } = useQuery({
    queryKey: ["prova-totais", provaId, allowedProvaUnidadeIds],
    // 🔴 A barreira contra "a listagem consulta sozinha" é esta linha.
    enabled: open,
    queryFn: async (): Promise<UnidadeStat[]> => {
      const { data, error } = await supabase.rpc("totais_da_prova", {
        p_prova_id: provaId,
        // ⚠️ `null` significa SEM RECORTE (admin). Array vazio significa "nenhuma
        // unidade" e devolve zero linhas — os dois não são a mesma coisa, e trocá-los
        // faria um coordenador sem unidade ver a prova inteira.
        p_prova_unidade_ids: allowedProvaUnidadeIds ?? null,
      });
      if (error) throw error;

      const porUnidade = new Map<string, UnidadeStat>();
      for (const linha of (data ?? []) as LinhaTotais[]) {
        let u = porUnidade.get(linha.prova_unidade_id);
        if (!u) {
          u = {
            prova_unidade_id: linha.prova_unidade_id,
            unid_nome: linha.unid_nome ?? "—",
            unid_sigla: linha.unid_sigla ?? "",
            unidade_finalizada: linha.unidade_finalizada ?? false,
            funcoes: [],
          };
          porUnidade.set(linha.prova_unidade_id, u);
        }
        u.funcoes.push({
          funcao_id: linha.funcao_id,
          funcao_nome: linha.funcao_nome ?? "—",
          ocupadas: Number(linha.ocupadas ?? 0),
          meta: Number(linha.meta ?? 0),
        });
      }

      // ⚠️ `meta > 0` PRESERVA o comportamento anterior: função com gente alocada e sem
      // meta cadastrada não aparece. A RPC devolve essa linha de propósito (para o dado
      // existir), e o descarte fica aqui — mudá-lo alteraria em silêncio o que o usuário
      // vê, e isso é decisão dele, não efeito colateral desta refatoração.
      return [...porUnidade.values()].map((u) => ({
        ...u,
        funcoes: u.funcoes.filter((f) => f.meta > 0),
      }));
    },
  });

  const totalGeralOcup = unidades.reduce(
    (sum, u) => sum + u.funcoes.reduce((a, f) => a + f.ocupadas, 0),
    0,
  );
  const totalGeralMeta = unidades.reduce(
    (sum, u) => sum + u.funcoes.reduce((a, f) => a + f.meta, 0),
    0,
  );
  const geralAtingido =
    unidades.length > 0 &&
    unidades.every(
      (u) => u.funcoes.length > 0 && u.funcoes.every((f) => f.ocupadas >= f.meta),
    );
  const isTotalOpen = expanded["__total__"] ?? false;

  const funcoesTotais: FuncaoStat[] = Object.values(
    unidades
      .flatMap((u) => u.funcoes)
      .reduce((acc, f) => {
        if (!acc[f.funcao_id]) {
          acc[f.funcao_id] = {
            funcao_id: f.funcao_id,
            funcao_nome: f.funcao_nome,
            ocupadas: 0,
            meta: 0,
          };
        }
        acc[f.funcao_id].ocupadas += f.ocupadas;
        acc[f.funcao_id].meta += f.meta;
        return acc;
      }, {} as Record<string, FuncaoStat>),
  ).sort((a, b) => a.funcao_nome.localeCompare(b.funcao_nome, "pt-BR"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Totais de cargos</DialogTitle>
          {/* 🔴 `DialogDescription` não é enfeite: `dialogos-acessibilidade.test.ts`
              varre os fontes e reprova diálogo sem descrição (ou `aria-describedby`). */}
          <DialogDescription>
            Metas e ocupação por unidade de {titulo}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : unidades.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma unidade disponível.</p>
          ) : (
            <>
              {isAdmin && (
                <div
                  className={cn(
                    "rounded-md border",
                    geralAtingido &&
                      "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle("__total__")}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 p-3 text-left transition-colors",
                      geralAtingido
                        ? "hover:bg-green-200/50 text-green-800 dark:text-green-300"
                        : "hover:bg-muted/50",
                    )}
                    aria-expanded={isTotalOpen}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          geralAtingido
                            ? "text-green-700 dark:text-green-300"
                            : "text-muted-foreground",
                          isTotalOpen && "rotate-180",
                        )}
                      />
                      <span>TOTAIS DE CARGOS DISPONÍVEIS E OCUPADOS</span>
                    </div>
                    <span
                      className={cn(
                        "text-xs",
                        geralAtingido
                          ? "text-green-700 dark:text-green-300"
                          : "text-muted-foreground",
                      )}
                    >
                      Total: {totalGeralOcup}/{totalGeralMeta}
                    </span>
                  </button>
                  {isTotalOpen && (
                    <div className="border-t p-3">
                      {funcoesTotais.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Sem funções cadastradas.
                        </p>
                      ) : (
                        <div className="flex flex-col divide-y">
                          {funcoesTotais.map((f) => (
                            <LinhaFuncao key={f.funcao_id} funcao={f} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {unidades.map((u) => {
                const totalOcup = u.funcoes.reduce((a, f) => a + f.ocupadas, 0);
                const totalMeta = u.funcoes.reduce((a, f) => a + f.meta, 0);
                const isOpen = expanded[u.prova_unidade_id] ?? false;
                const allMet =
                  u.funcoes.length > 0 && u.funcoes.every((f) => f.ocupadas >= f.meta);
                return (
                  <div
                    key={u.prova_unidade_id}
                    className={cn(
                      "rounded-md border",
                      allMet &&
                        "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(u.prova_unidade_id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 p-3 text-left transition-colors",
                        allMet
                          ? "hover:bg-green-200/50 text-green-800 dark:text-green-300"
                          : "hover:bg-muted/50",
                      )}
                      aria-expanded={isOpen}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            allMet
                              ? "text-green-700 dark:text-green-300"
                              : "text-muted-foreground",
                            isOpen && "rotate-180",
                          )}
                        />
                        <Building2
                          className={cn(
                            "h-4 w-4",
                            allMet
                              ? "text-green-700 dark:text-green-300"
                              : "text-muted-foreground",
                          )}
                        />
                        <span className="flex items-center gap-2 flex-wrap">
                          {u.unid_nome}
                          {u.unid_sigla ? ` (${u.unid_sigla})` : ""}
                          {u.unidade_finalizada && (
                            <span className="inline-flex items-center rounded-md border border-red-200 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
                              Alocação fechada
                            </span>
                          )}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-xs",
                          allMet
                            ? "text-green-700 dark:text-green-300"
                            : "text-muted-foreground",
                        )}
                      >
                        Total: {totalOcup}/{totalMeta}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t p-3">
                        {u.funcoes.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Sem funções cadastradas.
                          </p>
                        ) : (
                          <div className="flex flex-col divide-y">
                            {u.funcoes.map((f) => (
                              <LinhaFuncao key={f.funcao_id} funcao={f} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A linha `nome … ocupadas/meta`, idêntica nos dois blocos — era duplicada no card. */
function LinhaFuncao({ funcao }: { funcao: FuncaoStat }) {
  const atingido = funcao.meta > 0 && funcao.ocupadas >= funcao.meta;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors",
        atingido ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "",
      )}
    >
      <span className={atingido ? "font-medium" : "text-muted-foreground"}>
        {funcao.funcao_nome}
      </span>
      <span className={cn("font-semibold", !atingido && "text-foreground")}>
        {funcao.ocupadas}/{funcao.meta}
      </span>
    </div>
  );
}
