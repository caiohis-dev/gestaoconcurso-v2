import { useState, useMemo, useEffect } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProvas } from "@/hooks/useProvas";
import { useUnidadesProva } from "@/hooks/useUnidadesProva";
import { useColaboradores } from "@/hooks/useColaboradores";
import { useColaboradoresProva } from "@/hooks/useColaboradoresProva";
import { useFuncoesColaboradores } from "@/hooks/useFuncoesColaboradores";
import { useValoresFuncaoProva } from "@/hooks/useValoresFuncaoProva";
import { useMetaColaboradoresUnidade } from "@/hooks/useMetaColaboradoresUnidade";
import { supabase } from "@/integrations/supabase/client";
import { useProvaLock } from "@/hooks/useProvaLock";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import Layout from "@/components/Layout";
import { MetaColaboradoresDialog } from "@/components/MetaColaboradoresDialog";
import { CoordenadoresProvaDialog } from "@/components/CoordenadoresProvaDialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Building2, UserPlus, Users, Search, Trash2, Pencil, Shield, Download, Lock, LockOpen, CheckCircle2, XCircle } from "lucide-react";
import { formatDateBRWithFallback } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { Badge } from "@/components/ui/badge";

export default function GerenciarColaboradoresProva() {
  const { provaUnidadeId } = useParams<{ provaUnidadeId: string }>();
  const { user, loading: authLoading, isAdmin, isCoordenador, isSuperAdmin } = useAuth();
  const { provas, isLoading: isLoadingProvas } = useProvas();
  const { unidades, isLoading: isLoadingUnidades } = useUnidadesProva();
  const { colaboradores, isLoading: isLoadingColaboradores } = useColaboradores({ fetchAll: true });
  const { funcoes, isLoading: isLoadingFuncoes } = useFuncoesColaboradores();
  const {
    colaboradoresProva,
    isLoading: isLoadingColabProva,
    colaboradoresAlocados,
    colaboradoresAlocadosInfo,

    create,
    update,
    delete: deleteColaborador,
    isCreating,
    isDeleting,
  } = useColaboradoresProva(provaUnidadeId || "");

  const [selectedColaborador, setSelectedColaborador] = useState("");
  const [selectedFuncao, setSelectedFuncao] = useState("");
  const [filterText, setFilterText] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [colaboradorToDelete, setColaboradorToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFuncao, setEditFuncao] = useState("");
  const [metaDialogOpen, setMetaDialogOpen] = useState(false);
  const [coordenadoresDialogOpen, setCoordenadoresDialogOpen] = useState(false);
  // Fetch prova_unidade info
  const [provaUnidade, setProvaUnidade] = useState<{ prova_id: string; unidade_id: string } | null>(null);
  const [provaId, setProvaId] = useState<string | null>(null);
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [unidadeFinalizada, setUnidadeFinalizada] = useState<boolean>(false);
  const [provaCreatedBy, setProvaCreatedBy] = useState<string | null>(null);
  const [finalizadaBy, setFinalizadaBy] = useState<string | null>(null);
  const [finalizadaByName, setFinalizadaByName] = useState<string | null>(null);
  const [isCoordDestaProva, setIsCoordDestaProva] = useState<boolean>(false);
  const [finalizarConfirmOpen, setFinalizarConfirmOpen] = useState(false);
  const [finalizarDialogOpen, setFinalizarDialogOpen] = useState(false);
  const [reabrirDialogOpen, setReabrirDialogOpen] = useState(false);
  const [resultDialog, setResultDialog] = useState<{ open: boolean; success: boolean; message: string }>({ open: false, success: true, message: "" });

  const fetchProvaUnidadeInfo = async () => {
    if (!provaUnidadeId) return;
    const { data } = await supabase
      .from("prova_unidades")
      .select("prova_id, unidade_id, unidade_finalizada, unidade_finalizada_by, provas!inner(created_by)")
      .eq("id", provaUnidadeId)
      .single();
    if (data) {
      setProvaUnidade({ prova_id: data.prova_id, unidade_id: data.unidade_id });
      setProvaId(data.prova_id);
      setUnidadeId(data.unidade_id);
      setUnidadeFinalizada(!!(data as any).unidade_finalizada);
      setProvaCreatedBy(((data as any).provas?.created_by) ?? null);
      const finBy = (data as any).unidade_finalizada_by ?? null;
      setFinalizadaBy(finBy);
      if (finBy) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", finBy)
          .maybeSingle();
        setFinalizadaByName(prof?.full_name || prof?.email || "usuário desconhecido");
      } else {
        setFinalizadaByName(null);
      }
    }
  };

  useEffect(() => {
    fetchProvaUnidadeInfo();
  }, [provaUnidadeId]);

  // Verifica se o usuário é coordenador desta prova
  useEffect(() => {
    if (!user || !provaId) {
      setIsCoordDestaProva(false);
      return;
    }
    supabase
      .from("coordenadores_prova")
      .select("id")
      .eq("user_id", user.id)
      .eq("prova_id", provaId)
      .limit(1)
      .then(({ data }) => setIsCoordDestaProva(!!data && data.length > 0));
  }, [user, provaId]);

  // Nome do usuário para o lock
  const [userName, setUserName] = useState<string>("");
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setUserName(data?.full_name || data?.email || user.email || "Usuário");
      });
  }, [user]);

  // Lock de edição exclusiva para esta unidade
  const unidadeLock = useProvaLock({
    provaId: provaUnidadeId,
    userId: user?.id,
    userName: userName || undefined,
    enabled: !!provaUnidadeId && !!user && !!userName,
  });

  // Get valores por função da prova
  const { valoresFuncao, isLoading: isLoadingValores } = useValoresFuncaoProva(provaId || "");
  
  // Get metas de colaboradores por função
  const { metas: metasColaboradores, isLoading: isLoadingMetas } = useMetaColaboradoresUnidade(provaUnidadeId || "");

  const prova = provas.find((p) => p.id === provaId);
  const unidade = unidades.find((u) => u.id === unidadeId);

  const formatDate = (dateStr: string | null) => {
    return formatDateBRWithFallback(dateStr);
  };

  // Colaboradores alocados na unidade ATUAL (devem ser totalmente ocultados)
  const colaboradoresNaUnidadeAtual = useMemo(() => {
    return new Set(
      Object.entries(colaboradoresAlocadosInfo)
        .filter(([, info]) => info.prova_unidade_id === provaUnidadeId)
        .map(([colabId]) => colabId)
    );
  }, [colaboradoresAlocadosInfo, provaUnidadeId]);

  const colaboradoresDisponiveis = useMemo(() => {
    return colaboradores.filter((c) => !colaboradoresNaUnidadeAtual.has(c.id));
  }, [colaboradores, colaboradoresNaUnidadeAtual]);


  const colaboradoresFiltrados = useMemo(() => {
    if (!filterText) return colaboradoresDisponiveis;
    return colaboradoresDisponiveis.filter((c) =>
      c.colab_nome_completo.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [colaboradoresDisponiveis, filterText]);

  // Ordena colaboradores por função e depois por nome (ordem alfabética)
  const colaboradoresProvaSorted = useMemo(() => {
    return [...colaboradoresProva].sort((a, b) => {
      const funcaoA = a.funcoes_colaboradores?.cargo_nome || "";
      const funcaoB = b.funcoes_colaboradores?.cargo_nome || "";
      const cmpFuncao = funcaoA.localeCompare(funcaoB, "pt-BR");
      if (cmpFuncao !== 0) return cmpFuncao;
      const nomeA = a.colaboradores?.colab_nome_completo || "";
      const nomeB = b.colaboradores?.colab_nome_completo || "";
      return nomeA.localeCompare(nomeB, "pt-BR");
    });
  }, [colaboradoresProva]);

  // Filtra funções que têm valor cadastrado para esta prova
  const funcoesDisponiveis = useMemo(() => {
    const funcaoIdsComValor = valoresFuncao.map((v) => v.funcao_id);
    return funcoes.filter((f) => funcaoIdsComValor.includes(f.id));
  }, [funcoes, valoresFuncao]);

  // Calcula contagem de colaboradores por função
  const contagemPorFuncao = useMemo(() => {
    const contagem: Record<string, number> = {};
    colaboradoresProva.forEach((cp) => {
      if (cp.funcao_id) {
        contagem[cp.funcao_id] = (contagem[cp.funcao_id] || 0) + 1;
      }
    });
    return contagem;
  }, [colaboradoresProva]);

  // Filtra funções disponíveis para o dropdown (apenas as que têm meta > 0 e não atingiram a meta)
  const funcoesParaAdicionar = useMemo(() => {
    return funcoesDisponiveis.filter((funcao) => {
      const meta = metasColaboradores.find((m) => m.funcao_id === funcao.id);
      const cadastrados = contagemPorFuncao[funcao.id] || 0;
      const metaQuantidade = meta?.quantidade_meta || 0;
      // Só permite adicionar se há meta definida (> 0) e ainda não foi atingida
      return metaQuantidade > 0 && cadastrados < metaQuantidade;
    });
  }, [funcoesDisponiveis, metasColaboradores, contagemPorFuncao]);

  // Verifica se há alguma meta definida
  const temMetasDefinidas = useMemo(() => {
    return metasColaboradores.some((m) => m.quantidade_meta > 0);
  }, [metasColaboradores]);

  // Função para obter valor da função na prova
  const getValorFuncao = (funcaoId: string | null) => {
    if (!funcaoId) return null;
    const valorFuncao = valoresFuncao.find((v) => v.funcao_id === funcaoId);
    return valorFuncao?.valor_pagamento ?? null;
  };

  const handleAddColaborador = () => {
    if (selectedColaborador) {
      create({
        prova_unidade_id: provaUnidadeId!,
        colaborador_id: selectedColaborador,
        funcao_id: selectedFuncao || null,
      });
      setSelectedColaborador("");
      setSelectedFuncao("");
      setFilterText("");
    }
  };

  const handleDeleteClick = (id: string) => {
    setColaboradorToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (colaboradorToDelete) {
      deleteColaborador(colaboradorToDelete);
      setDeleteDialogOpen(false);
      setColaboradorToDelete(null);
    }
  };

  const handleEditClick = (cp: typeof colaboradoresProva[0]) => {
    setEditingId(cp.id);
    setEditFuncao(cp.funcao_id || "");
  };

  const handleSaveEdit = (id: string) => {
    update({
      id,
      data: {
        funcao_id: editFuncao || null,
      },
    });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFuncao("");
  };

  const isLoading = isLoadingProvas || isLoadingUnidades || isLoadingColabProva || isLoadingColaboradores || isLoadingFuncoes || isLoadingValores || isLoadingMetas;
  
  // Funções com metas definidas para exibir no totalizador
  const funcoesComMeta = useMemo(() => {
    return funcoesDisponiveis
      .map((funcao) => {
        const meta = metasColaboradores.find((m) => m.funcao_id === funcao.id);
        const cadastrados = contagemPorFuncao[funcao.id] || 0;
        const metaQuantidade = meta?.quantidade_meta || 0;
        return {
          funcao,
          cadastrados,
          meta: metaQuantidade,
          atingido: metaQuantidade > 0 && cadastrados >= metaQuantidade,
        };
      })
      .filter((item) => item.meta > 0 || item.cadastrados > 0);
  }, [funcoesDisponiveis, metasColaboradores, contagemPorFuncao]);

  const formatCurrency = (value: number | null) => {
    if (value === null) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportColaboradores = async () => {
    if (colaboradoresProva.length === 0) {
      toast({ title: "Nenhum colaborador para exportar", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const ids = colaboradoresProva.map((cp) => cp.colaborador_id);
      const { data, error } = await supabase
        .from("colaboradores")
        .select("id, colab_nome_completo")
        .in("id", ids);
      if (error) throw error;

      const map = new Map((data || []).map((c) => [c.id, c]));
      const rows = colaboradoresProva
        .map((cp) => {
          const c = map.get(cp.colaborador_id);
          return {
            "Nome completo": c?.colab_nome_completo ?? cp.colaboradores?.colab_nome_completo ?? "",
          };
        })
        .sort((a, b) => a["Nome completo"].localeCompare(b["Nome completo"], "pt-BR"));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 50 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");

      const edital = (prova?.editais?.nome || "edital").replace(/[^\w\-]+/g, "_");
      const sigla = (unidade?.unid_sigla || "unidade").trim().replace(/[^\w\-]+/g, "_");
      XLSX.writeFile(wb, `colaboradores_${edital}_${sigla}.xlsx`);
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const canManageUnidadeStatus =
    !!user && (isSuperAdmin || (!!provaCreatedBy && provaCreatedBy === user.id) || isCoordenador || isCoordDestaProva);

  const canReabrir =
    !!user && unidadeFinalizada && (isSuperAdmin || (!!finalizadaBy && finalizadaBy === user.id));

  const pendenciasFinalizacao = useMemo(
    () => funcoesComMeta.filter((i) => i.meta > 0 && i.cadastrados < i.meta),
    [funcoesComMeta]
  );

  const handleFinalizarUnidade = async () => {
    if (!provaUnidadeId || !user) return;
    const { data, error } = await supabase.rpc("finalizar_prova_unidade", {
      p_prova_unidade_id: provaUnidadeId,
      p_user_id: user.id,
    });
    if (error || data !== true) {
      setResultDialog({ open: true, success: false, message: error?.message || "Não foi possível finalizar a unidade." });
      return;
    }
    await fetchProvaUnidadeInfo();
    setResultDialog({ open: true, success: true, message: "Unidade finalizada com sucesso." });
  };

  const handleReabrirUnidade = async () => {
    if (!provaUnidadeId || !user) return;
    const { data, error } = await supabase.rpc("reabrir_prova_unidade", {
      p_prova_unidade_id: provaUnidadeId,
      p_user_id: user.id,
    });
    if (error || data !== true) {
      setResultDialog({ open: true, success: false, message: error?.message || "Não foi possível reabrir a unidade." });
      return;
    }
    await fetchProvaUnidadeInfo();
    setResultDialog({ open: true, success: true, message: "Unidade reaberta com sucesso." });
  };




  // Early returns AFTER all hooks
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin && !isCoordenador) {
    return <Navigate to="/" replace />;
  }

  if (unidadeLock.isLoading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (unidadeLock.isLocked && !unidadeLock.hasAccess) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center px-4">
          <Card className="max-w-md w-full border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <Lock className="h-5 w-5" />
                Unidade em edição
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <strong>{unidadeLock.lockedByName}</strong> está editando esta unidade no momento.
              </p>
              {unidadeLock.lockedSince && (
                <p className="text-muted-foreground">
                  Início da edição: {formatDistanceToNow(unidadeLock.lockedSince, { addSuffix: true, locale: ptBR })}
                </p>
              )}
              <p className="text-muted-foreground">
                Somente um usuário por vez pode acessar esta página. Tente novamente em alguns minutos.
              </p>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" asChild className="flex-1">
                  <Link to={`/gerenciar-prova/${provaId}`}>Voltar</Link>
                </Button>
                <Button onClick={() => window.location.reload()} className="flex-1">
                  Tentar novamente
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }


  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/gerenciar-prova/${provaId}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                Gerenciar Colaboradores
                {unidadeFinalizada && (
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">
                    Unidade Finalizada
                  </Badge>
                )}
              </h1>
              <p className="text-muted-foreground">
                {prova?.editais?.nome} - {formatDate(prova?.prova_data || null)}
              </p>
              {unidadeFinalizada && (
                <p className="text-sm text-red-700 mt-1">
                  Unidade fechada. Apenas <strong>{finalizadaByName || "o usuário que finalizou"}</strong> pode reabri-la.
                </p>
              )}
            </div>
          </div>
          <div className="w-full sm:w-auto sm:ml-auto flex flex-col sm:flex-row gap-2">
            {isAdmin && (
              <Button
                onClick={() => setCoordenadoresDialogOpen(true)}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700 w-full sm:w-auto"
              >
                <Shield className="h-4 w-4" />
                Acesso dos Coordenadores
              </Button>
            )}
            {isAdmin && (
              <Button
                onClick={() => setMetaDialogOpen(true)}
                className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 w-full sm:w-auto"
              >
                <Users className="h-4 w-4" />
                Definir Número de Colaboradores
              </Button>
            )}
            {(isAdmin || isCoordenador) && (
              <Button
                onClick={handleExportColaboradores}
                disabled={isExporting || colaboradoresProva.length === 0}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700 w-full sm:w-auto"
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportar Colaboradores
              </Button>
            )}
            {canManageUnidadeStatus && (
              unidadeFinalizada ? (
                canReabrir ? (
                  <Button
                    onClick={() => setReabrirDialogOpen(true)}
                    className="gap-2 bg-blue-600 text-white hover:bg-blue-700 w-full sm:w-auto"
                  >
                    <LockOpen className="h-4 w-4" />
                    Reabrir Unidade
                  </Button>
                ) : null
              ) : (
                <Button
                  onClick={() => setFinalizarConfirmOpen(true)}
                  className="gap-2 bg-red-600 text-white hover:bg-red-700 w-full sm:w-auto"
                >
                  <Lock className="h-4 w-4" />
                  Finalizar Unidade
                </Button>
              )
            )}
          </div>

        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Building2 className="h-4 w-4" />
              {unidade?.unid_sigla?.trim()} - {unidade?.unid_nome}
            </CardTitle>
            <div className="flex flex-wrap gap-3 mt-3 text-sm">
              <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Total Alocados:</span>
                <span className="font-semibold text-foreground">{colaboradoresProva.length}</span>
              </div>
              {funcoesComMeta.map((item) => (
                <div
                  key={item.funcao.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                    item.atingido
                      ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                      : "bg-muted"
                  }`}
                >
                  <span className={item.atingido ? "font-medium" : "text-muted-foreground"}>
                    {item.funcao.cargo_nome}:
                  </span>
                  <span className={`font-semibold ${item.atingido ? "" : "text-foreground"}`}>
                    {item.cadastrados}/{item.meta}
                  </span>
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {unidadeFinalizada && (
              <div className="flex items-center gap-2 p-3 border border-red-200 rounded-md bg-red-50 text-red-800 text-sm">
                <Lock className="h-4 w-4" />
                Esta unidade está finalizada. Modo somente leitura.
              </div>
            )}
            {/* Add collaborator form - for admin and coordinators */}
            {!unidadeFinalizada && (
            <div className="grid gap-4 p-4 border rounded-lg bg-muted/50">
              <h3 className="font-semibold flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Adicionar Colaborador
              </h3>
              {!temMetasDefinidas ? (
                <div className="flex items-center justify-center py-4 px-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-md">
                  <p className="text-sm text-center">
                    É necessário definir o número de colaboradores por função antes de adicionar colaboradores.
                    <br />
                    Clique em <strong>"Definir Número de Colaboradores"</strong> para configurar as metas.
                  </p>
                </div>
              ) : funcoesParaAdicionar.length === 0 ? (
                <div className="flex items-center justify-center py-4 px-4 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-md">
                  <p className="text-sm text-center">
                    Todas as metas de colaboradores foram atingidas para esta unidade.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Colaborador</label>
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Filtrar..."
                          value={filterText}
                          onChange={(e) => setFilterText(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                      <Select
                        value={selectedColaborador}
                        onValueChange={setSelectedColaborador}
                        disabled={colaboradoresFiltrados.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              colaboradoresDisponiveis.length === 0
                                ? "Sem colaboradores"
                                : colaboradoresFiltrados.length === 0
                                ? "Nenhum resultado"
                                : "Selecionar"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {colaboradoresFiltrados.map((colab) => {
                            const alocInfo = colaboradoresAlocadosInfo[colab.id];
                            const isAlocadoOutraUnidade = !!alocInfo && alocInfo.prova_unidade_id !== provaUnidadeId;
                            return (
                              <SelectItem key={colab.id} value={colab.id} disabled={isAlocadoOutraUnidade}>
                                {colab.colab_nome_completo}
                                {isAlocadoOutraUnidade && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {alocInfo.unid_sigla.trim()}
                                  </span>
                                )}
                              </SelectItem>
                            );
                          })}

                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Função</label>
                    <Select value={selectedFuncao} onValueChange={setSelectedFuncao}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar função" />
                      </SelectTrigger>
                      <SelectContent>
                        {funcoesParaAdicionar.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.cargo_nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddColaborador}
                      disabled={!selectedColaborador || !selectedFuncao || isCreating}
                      className="w-full gap-2"
                    >
                      {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Adicionar
                    </Button>
                  </div>
                </div>
              )}
            </div>
            )}



            {/* Collaborators list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : colaboradoresProva.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground">Nenhum colaborador alocado</h3>
                <p className="text-muted-foreground mt-1">
                  Adicione colaboradores para esta unidade de prova.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {colaboradoresProvaSorted.map((cp) => (
                      <TableRow key={cp.id}>
                        <TableCell className="font-medium">
                          {cp.colaboradores?.colab_nome_completo}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const colab = colaboradores.find(c => c.id === cp.colaborador_id);
                            if (!colab?.colab_cpf) return "-";
                            const cpf = colab.colab_cpf.toString().padStart(11, '0');
                            return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const colab = colaboradores.find(c => c.id === cp.colaborador_id);
                            if (!colab?.colab_telefone) return "-";
                            const phone = colab.colab_telefone.toString();
                            if (phone.length === 11) return phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
                            if (phone.length === 10) return phone.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
                            return phone;
                          })()}
                        </TableCell>
                        <TableCell>
                          {editingId === cp.id ? (
                            <Select value={editFuncao} onValueChange={setEditFuncao}>
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Selecionar" />
                              </SelectTrigger>
                                <SelectContent>
                                {funcoesDisponiveis.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.cargo_nome}
                                  </SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                          ) : (
                            cp.funcoes_colaboradores?.cargo_nome || "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(getValorFuncao(cp.funcao_id))}
                        </TableCell>
                        <TableCell>
                          {unidadeFinalizada ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : editingId === cp.id ? (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSaveEdit(cp.id)}
                              >
                                Salvar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEdit}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditClick(cp)}
                                className="h-8 w-8"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(cp.id)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover colaborador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este colaborador desta unidade de prova? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {prova && provaUnidadeId && unidade && (
        <MetaColaboradoresDialog
          open={metaDialogOpen}
          onOpenChange={setMetaDialogOpen}
          provaUnidadeId={provaUnidadeId}
          provaId={prova.id}
          unidadeNome={`${unidade.unid_sigla?.trim()} - ${unidade.unid_nome}`}
        />
      )}

      {prova && provaUnidadeId && (
        <CoordenadoresProvaDialog
          open={coordenadoresDialogOpen}
          onOpenChange={setCoordenadoresDialogOpen}
          provaId={prova.id}
          provaEdital={prova.editais?.nome || ""}
          provaUnidadeId={provaUnidadeId}
        />
      )}

      <AlertDialog open={finalizarConfirmOpen} onOpenChange={setFinalizarConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar Unidade</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {pendenciasFinalizacao.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-green-100 text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Todas as metas atingidas.
                  </div>
                ) : (
                  <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900">
                    <p className="font-medium mb-2">Existem cargos com metas pendentes:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {pendenciasFinalizacao.map((p) => (
                        <li key={p.funcao.id}>
                          {p.funcao.cargo_nome}: {p.cadastrados}/{p.meta}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Após finalizar, a unidade ficará em modo somente leitura e apenas você poderá reabri-la.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setFinalizarConfirmOpen(false);
                setFinalizarDialogOpen(true);
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PasswordConfirmDialog
        open={finalizarDialogOpen}
        onOpenChange={setFinalizarDialogOpen}
        title="Finalizar Unidade"
        description="Confirme sua senha para finalizar esta unidade de prova."
        confirmText="Finalizar"
        confirmVariant="destructive"
        onConfirm={handleFinalizarUnidade}
      />

      <PasswordConfirmDialog
        open={reabrirDialogOpen}
        onOpenChange={setReabrirDialogOpen}
        title="Reabrir Unidade"
        description="Confirme sua senha para reabrir esta unidade de prova."
        confirmText="Reabrir"
        onConfirm={handleReabrirUnidade}
      />

      <AlertDialog open={resultDialog.open} onOpenChange={(open) => setResultDialog((s) => ({ ...s, open }))}>
        <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {resultDialog.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {resultDialog.success ? "Sucesso" : "Erro"}
            </AlertDialogTitle>
            <AlertDialogDescription>{resultDialog.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setResultDialog((s) => ({ ...s, open: false }))}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
