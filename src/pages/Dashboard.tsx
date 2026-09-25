import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, Building2, Users, UserCheck, UserX, CalendarCheck, CalendarX, Armchair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = {
  green: "hsl(142, 76%, 36%)",
  amber: "hsl(45, 93%, 47%)",
  purple: "hsl(270, 50%, 40%)",
  orange: "hsl(25, 95%, 53%)",
  blue: "hsl(217, 91%, 60%)",
};

export default function Dashboard() {
  const { user, loading, isAdmin, role } = useAuth();
  const navigate = useNavigate();


  // Fetch total provas
  const { data: totalProvas = 0, isLoading: loadingProvas } = useQuery({
    queryKey: ["dashboard-provas"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("provas")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin,
  });

  // Fetch provas finalizadas
  const { data: provasFinalizadas = 0, isLoading: loadingProvasFinalizadas } = useQuery({
    queryKey: ["dashboard-provas-finalizadas"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("provas")
        .select("*", { count: "exact", head: true })
        .eq("prova_finalizada", true);
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin,
  });

  // Fetch total unidades
  const { data: totalUnidades = 0, isLoading: loadingUnidades } = useQuery({
    queryKey: ["dashboard-unidades"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("unidades_prova")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin,
  });

  // Fetch total colaboradores
  const { data: totalColaboradores = 0, isLoading: loadingColaboradores } = useQuery({
    queryKey: ["dashboard-colaboradores"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("colaboradores")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin,
  });

  // "Já atuaram" e a capacidade total vêm AGREGADOS DO BANCO (RPC `totais_do_dashboard`).
  // 🔴 Não troque por `select` da tabela + conta no cliente: era assim até 2026-09-24, e o
  // PostgREST corta em `max_rows` (1000) SEM ERRO — `colaboradores_prova` já tinha 977
  // linhas, e o card passaria a mostrar número errado sem ninguém perceber.
  const { data: totais, isLoading: loadingTotais } = useQuery({
    queryKey: ["dashboard-totais"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("totais_do_dashboard");
      if (error) throw error;
      const linha = data?.[0];
      return {
        colaboradoresAtuaram: Number(linha?.colaboradores_atuaram ?? 0),
        capacidadeTotal: Number(linha?.capacidade_total ?? 0),
      };
    },
    enabled: isAdmin,
  });
  const colaboradoresAtuaram = totais?.colaboradoresAtuaram ?? 0;
  const capacidadeTotal = totais?.capacidadeTotal ?? 0;

  // Fetch total de salas
  const { data: totalSalas = 0, isLoading: loadingSalas } = useQuery({
    queryKey: ["dashboard-salas"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sala_prova")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin,
  });

  // Calculate colaboradores que não atuaram
  const colaboradoresNaoAtuaram = totalColaboradores - colaboradoresAtuaram;

  // Prepare chart data
  const provasChartData = [
    { name: "Finalizadas", value: provasFinalizadas, color: COLORS.green },
    { name: "Em Configuração", value: totalProvas - provasFinalizadas, color: COLORS.amber },
  ];

  const colaboradoresChartData = [
    { name: "Já Atuaram", value: colaboradoresAtuaram, color: COLORS.green },
    { name: "Nunca Atuaram", value: colaboradoresNaoAtuaram, color: COLORS.orange },
  ];


  const isLoadingAny = loadingProvas || loadingProvasFinalizadas || loadingUnidades || 
    loadingColaboradores || loadingTotais || loadingSalas;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard Administrativo</h1>
          <p className="text-muted-foreground mt-1">Visão geral do sistema de gestão de concursos</p>
        </div>

        {isLoadingAny ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Main Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {/* Total Provas */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total de Provas
                  </CardTitle>
                  <FileText className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{totalProvas}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    cadastradas no sistema
                  </p>
                </CardContent>
              </Card>

              {/* Provas Finalizadas vs Abertas */}
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Provas Finalizadas
                  </CardTitle>
                  <CalendarCheck className="h-5 w-5 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{provasFinalizadas}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <CalendarX className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-muted-foreground">
                      {totalProvas - provasFinalizadas} em configuração
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Total Unidades */}
              <Card className="border-l-4 border-l-secondary">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Unidades de Prova
                  </CardTitle>
                  <Building2 className="h-5 w-5 text-secondary" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{totalUnidades}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    locais cadastrados
                  </p>
                </CardContent>
              </Card>

              {/* Total Salas */}
              <Card className="border-l-4 border-l-amber-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total de Salas
                  </CardTitle>
                  <Building2 className="h-5 w-5 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{totalSalas}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    em todas as unidades
                  </p>
                </CardContent>
              </Card>

              {/* Capacidade Total de Candidatos */}
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Capacidade Total
                  </CardTitle>
                  <Armchair className="h-5 w-5 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{capacidadeTotal.toLocaleString('pt-BR')}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    candidatos em todas as salas
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Colaboradores Section */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Total Colaboradores */}
              <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total de Colaboradores
                  </CardTitle>
                  <Users className="h-5 w-5 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{totalColaboradores}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    cadastrados no sistema
                  </p>
                </CardContent>
              </Card>

              {/* Colaboradores que já atuaram */}
              <Card className="border-l-4 border-l-green-600">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Já Atuaram em Provas
                  </CardTitle>
                  <UserCheck className="h-5 w-5 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{colaboradoresAtuaram}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalColaboradores > 0 
                      ? `${((colaboradoresAtuaram / totalColaboradores) * 100).toFixed(1)}% do total`
                      : "0% do total"
                    }
                  </p>
                </CardContent>
              </Card>

              {/* Colaboradores que nunca atuaram */}
              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Nunca Atuaram
                  </CardTitle>
                  <UserX className="h-5 w-5 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-500">{colaboradoresNaoAtuaram}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalColaboradores > 0 
                      ? `${((colaboradoresNaoAtuaram / totalColaboradores) * 100).toFixed(1)}% do total`
                      : "0% do total"
                    }
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Section */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Pie Chart - Provas */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Status das Provas</CardTitle>
                </CardHeader>
                <CardContent>
                  {totalProvas > 0 ? (
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={provasChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={4}
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {provasChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => [value, "Quantidade"]}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      Nenhuma prova cadastrada
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pie Chart - Colaboradores */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Atuação dos Colaboradores</CardTitle>
                </CardHeader>
                <CardContent>
                  {totalColaboradores > 0 ? (
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={colaboradoresChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={4}
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {colaboradoresChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => [value, "Colaboradores"]}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      Nenhum colaborador cadastrado
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
