import { useState } from "react";
import { Link } from "react-router-dom";
import { Prova } from "@/hooks/useProvas";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Settings, Building2, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateBR } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ProvaCardProps {
  prova: Prova;
  /** When defined, restricts displayed units to these prova_unidade ids (coordenador scope). */
  allowedProvaUnidadeIds?: string[] | null;
}

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

export function ProvaCard({ prova, allowedProvaUnidadeIds }: ProvaCardProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const { isAdmin } = useAuth();
  const { data: unidades = [], isLoading } = useQuery({
    queryKey: ["prova-card-unidades", prova.id, allowedProvaUnidadeIds],
    queryFn: async (): Promise<UnidadeStat[]> => {
      const { data: provaUnidades, error: puErr } = await supabase
        .from("prova_unidades")
        .select("id, unidade_finalizada, unidades_prova(unid_nome, unid_sigla)")
        .eq("prova_id", prova.id);
      if (puErr) throw puErr;
      if (!provaUnidades?.length) return [];

      let filtered = provaUnidades;
      if (allowedProvaUnidadeIds) {
        const allowed = new Set(allowedProvaUnidadeIds);
        filtered = provaUnidades.filter((pu) => allowed.has(pu.id));
      }
      if (!filtered.length) return [];

      const puIds = filtered.map((pu) => pu.id);

      const [metasRes, colabsRes] = await Promise.all([
        supabase
          .from("meta_colaboradores_unidade")
          .select("prova_unidade_id, funcao_id, quantidade_meta, funcoes_colaboradores(cargo_nome)")
          .in("prova_unidade_id", puIds),
        supabase
          .from("colaboradores_prova")
          .select("prova_unidade_id, funcao_id, funcoes_colaboradores(cargo_nome)")
          .in("prova_unidade_id", puIds),
      ]);
      if (metasRes.error) throw metasRes.error;
      if (colabsRes.error) throw colabsRes.error;

      return filtered
        .map((pu) => {
          const map: Record<string, FuncaoStat> = {};
          metasRes.data?.forEach((m: any) => {
            if (m.prova_unidade_id !== pu.id || !m.funcao_id) return;
            map[m.funcao_id] = {
              funcao_id: m.funcao_id,
              funcao_nome: m.funcoes_colaboradores?.cargo_nome ?? "—",
              ocupadas: 0,
              meta: m.quantidade_meta ?? 0,
            };
          });
          colabsRes.data?.forEach((c: any) => {
            if (c.prova_unidade_id !== pu.id || !c.funcao_id) return;
            if (!map[c.funcao_id]) {
              map[c.funcao_id] = {
                funcao_id: c.funcao_id,
                funcao_nome: c.funcoes_colaboradores?.cargo_nome ?? "—",
                ocupadas: 0,
                meta: 0,
              };
            }
            map[c.funcao_id].ocupadas += 1;
          });
          return {
            prova_unidade_id: pu.id,
            unid_nome: (pu as any).unidades_prova?.unid_nome ?? "—",
            unid_sigla: (pu as any).unidades_prova?.unid_sigla ?? "",
            unidade_finalizada: (pu as any).unidade_finalizada ?? false,
            funcoes: Object.values(map)
              .filter((f) => f.meta > 0)
              .sort((a, b) =>
                a.funcao_nome.localeCompare(b.funcao_nome, "pt-BR"),
              ),
          };
        })
        .sort((a, b) => a.unid_nome.localeCompare(b.unid_nome, "pt-BR"));
    },
  });

  const formatDate = (dateStr: string | null) =>
    formatDateBR(dateStr, "dd 'de' MMMM 'de' yyyy");
  const formatTime = (t: string | null) => (t ? t.slice(0, 5) : null);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-semibold leading-tight">
            {prova.editais?.nome}
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link to={`/gerenciar-prova/${prova.id}`}>
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {prova.prova_data && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(prova.prova_data)}</span>
            </div>
          )}
          {(prova.prova_hora_inicio || prova.prova_hora_final) && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>
                {formatTime(prova.prova_hora_inicio)} - {formatTime(prova.prova_hora_final)}
              </span>
            </div>
          )}
        </div>

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
              {isAdmin && (() => {
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
                    (u) =>
                      u.funcoes.length > 0 && u.funcoes.every((f) => f.ocupadas >= f.meta),
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
                            {funcoesTotais.map((f) => {
                              const atingido = f.meta > 0 && f.ocupadas >= f.meta;
                              return (
                                <div
                                  key={f.funcao_id}
                                  className={cn(
                                    "flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors",
                                    atingido
                                      ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                      : "",
                                  )}
                                >
                                  <span
                                    className={
                                      atingido ? "font-medium" : "text-muted-foreground"
                                    }
                                  >
                                    {f.funcao_nome}
                                  </span>
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      !atingido && "text-foreground",
                                    )}
                                  >
                                    {f.ocupadas}/{f.meta}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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
                            {u.funcoes.map((f) => {
                              const atingido = f.meta > 0 && f.ocupadas >= f.meta;
                              return (
                                <div
                                  key={f.funcao_id}
                                  className={cn(
                                    "flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors",
                                    atingido
                                      ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                      : "",
                                  )}
                                >
                                  <span
                                    className={
                                      atingido ? "font-medium" : "text-muted-foreground"
                                    }
                                  >
                                    {f.funcao_nome}
                                  </span>
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      !atingido && "text-foreground",
                                    )}
                                  >
                                    {f.ocupadas}/{f.meta}
                                  </span>
                                </div>
                              );
                            })}
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

        {prova.profiles?.full_name && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Criado por: {prova.profiles.full_name}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
