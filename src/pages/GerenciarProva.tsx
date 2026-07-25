import { useState, useMemo, useEffect } from "react";
import { Navigate, useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProvas, ProvaUpdate } from "@/hooks/useProvas";
import { useUnidadesProva } from "@/hooks/useUnidadesProva";
import { useProvaUnidades } from "@/hooks/useProvaUnidades";
import { useUnidadeCapacidade } from "@/hooks/useUnidadeCapacidade";
import { useValoresFuncaoProva } from "@/hooks/useValoresFuncaoProva";
import { useCoordenadorUnidades } from "@/hooks/useCoordenadorUnidades";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Loader2, Building2, Users, Settings, DollarSign, Download, Lock, Unlock, AlertTriangle, FileText, Pencil, RefreshCw } from "lucide-react";
import { ValoresFuncaoProvaDialog } from "@/components/ValoresFuncaoProvaDialog";
import { ProvaDialog } from "@/components/ProvaDialog";
import { formatDateBRWithFallback } from "@/lib/utils";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { ESTADO_CIVIL_MAP, RACA_MAP, GRAU_INSTRUCAO_MAP } from "@/lib/constants";

export default function GerenciarProva() {
  const { provaId } = useParams<{ provaId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin, isCoordenador } = useAuth();
  const { provas, isLoading: isLoadingProvas, update: updateProva, isUpdating } = useProvas();
  const { unidades, isLoading: isLoadingUnidades } = useUnidadesProva();
  const {
    provaUnidades,
    isLoading: isLoadingProvaUnidades,
    addUnidade,
    removeUnidade,
    isAdding,
    isRemoving,
  } = useProvaUnidades(provaId || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { provaUnidades: coordenadorUnidades, isLoading: isLoadingCoordenadorUnidades } = useCoordenadorUnidades();

  const unidadeIds = useMemo(() => provaUnidades.map((pu) => pu.unidade_id), [provaUnidades]);
  const { data: capacidadePorUnidade = {} } = useUnidadeCapacidade(provaId || "", unidadeIds);
  const { valoresFuncao, isLoading: isLoadingValoresFuncao } = useValoresFuncaoProva(provaId || "");


  // Filter prova_unidades based on coordinator access
  const filteredProvaUnidades = useMemo(() => {
    if (isAdmin) return provaUnidades;
    if (isCoordenador) {
      const coordenadorProvaUnidadeIds = coordenadorUnidades.map((cu) => cu.id);
      return provaUnidades.filter((pu) => coordenadorProvaUnidadeIds.includes(pu.id));
    }
    return provaUnidades;
  }, [provaUnidades, coordenadorUnidades, isAdmin, isCoordenador]);

  const [selectedUnidade, setSelectedUnidade] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unidadeToRemove, setUnidadeToRemove] = useState<string | null>(null);
  const [valoresDialogOpen, setValoresDialogOpen] = useState(false);
  const [parametrosDialogOpen, setParametrosDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCoordenadores, setIsExportingCoordenadores] = useState(false);
  const [isExportingCargos, setIsExportingCargos] = useState(false);
  const [finalizarDialogOpen, setFinalizarDialogOpen] = useState(false);
  const [reabrirDialogOpen, setReabrirDialogOpen] = useState(false);

  // Abre automaticamente o dialog de funções se não houver nenhuma cadastrada
  useEffect(() => {
    if (!isLoadingValoresFuncao && valoresFuncao.length === 0 && provaId) {
      setValoresDialogOpen(true);
    }
  }, [isLoadingValoresFuncao, valoresFuncao.length, provaId]);

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

  const prova = provas.find((p) => p.id === provaId);

  if (!isLoadingProvas && !prova) {
    return <Navigate to="/provas" replace />;
  }

  const isCreator = prova?.created_by === user.id;
  const isFinalizada = prova?.prova_finalizada ?? false;

  const formatDate = (dateStr: string | null) => {
    return formatDateBRWithFallback(dateStr);
  };

  const unidadesVinculadas = provaUnidades.map((pu) => pu.unidade_id);
  const unidadesDisponiveis = unidades.filter((u) => !unidadesVinculadas.includes(u.id));

  const handleAddUnidade = () => {
    if (selectedUnidade) {
      addUnidade(selectedUnidade);
      setSelectedUnidade("");
    }
  };

  const handleRemoveUnidade = (id: string) => {
    setUnidadeToRemove(id);
    setDeleteDialogOpen(true);
  };

  const confirmRemove = () => {
    if (unidadeToRemove) {
      removeUnidade(unidadeToRemove);
      setDeleteDialogOpen(false);
      setUnidadeToRemove(null);
    }
  };

  const handleFinalizarClick = () => {
    if (!isCreator) {
      toast({
        title: "Acesso negado",
        description: "Apenas o usuário que criou a prova pode finalizá-la.",
        variant: "destructive",
      });
      return;
    }
    setFinalizarDialogOpen(true);
  };

  const handleReabrirClick = () => {
    if (!isCreator) {
      toast({
        title: "Acesso negado",
        description: "Apenas o usuário que criou a prova pode reabri-la.",
        variant: "destructive",
      });
      return;
    }
    setReabrirDialogOpen(true);
  };

  const handleFinalizar = async () => {
    if (!provaId || !user) return;

    const { error } = await supabase.rpc("finalizar_prova", {
      p_prova_id: provaId,
      p_user_id: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    queryClient.invalidateQueries({ queryKey: ["provas"] });
    toast({
      title: "Prova finalizada",
      description: "A configuração da prova foi finalizada com sucesso.",
    });
  };

  const handleReabrir = async () => {
    if (!provaId || !user) return;

    const { error } = await supabase.rpc("reabrir_prova", {
      p_prova_id: provaId,
      p_user_id: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    queryClient.invalidateQueries({ queryKey: ["provas"] });
    toast({
      title: "Prova reaberta",
      description: "A configuração da prova foi reaberta com sucesso.",
    });
  };

  const isLoading = isLoadingProvas || isLoadingUnidades || isLoadingProvaUnidades || isLoadingCoordenadorUnidades;

  const totalCandidatos = prova?.prova_n_candidatos || 0;
  const totalAlocados = Object.values(capacidadePorUnidade).reduce((sum, cap) => sum + cap, 0);
  const naoAlocados = totalCandidatos - totalAlocados;

  const exportColaboradores = async () => {
    if (!provaId || !prova) return;
    
    setIsExporting(true);
    try {
      const { data: colaboradoresProva, error } = await supabase
        .from('colaboradores_prova')
        .select(`
          *,
          colaboradores (*),
          funcoes_colaboradores (cargo_nome, cargo_cbo),
          prova_unidades!inner (
            prova_id,
            unidades_prova (
              unid_sigla
            )
          )
        `)
        .eq('prova_unidades.prova_id', provaId);

      if (error) throw error;

      if (!colaboradoresProva || colaboradoresProva.length === 0) {
        toast({
          title: "Nenhum colaborador",
          description: "Não há colaboradores cadastrados para esta prova.",
          variant: "destructive",
        });
        return;
      }

      const { data: valoresFuncao, error: valoresError } = await supabase
        .from('valores_funcao_prova')
        .select('funcao_id, valor_pagamento')
        .eq('prova_id', provaId);

      if (valoresError) throw valoresError;

      const valoresFuncaoMap: Record<string, number> = {};
      if (valoresFuncao) {
        valoresFuncao.forEach((vf) => {
          valoresFuncaoMap[vf.funcao_id] = vf.valor_pagamento;
        });
      }

      // Exportar com colunas na ordem do modelo e códigos numéricos para Estado Civil, Raça e Grau Instrução
      const data = colaboradoresProva.map((cp) => {
        const colab = cp.colaboradores;
        const unidSigla = cp.prova_unidades?.unidades_prova?.unid_sigla?.trim() || "";
        const funcaoNome = cp.funcoes_colaboradores?.cargo_nome || "";
        const funcaoCbo = cp.funcoes_colaboradores?.cargo_cbo || "";
        const valorPagamento = cp.funcao_id ? (valoresFuncaoMap[cp.funcao_id] ?? "") : "";
        
        return {
          "Edital": prova.editais?.nome || "",
          "Sigla Unidade": unidSigla,
          "Matrícula": colab?.colab_matricula || "",
          "Nome Completo": colab?.colab_nome_completo || "",
          "Função": funcaoNome,
          "CBO": funcaoCbo,
          "Valor Líquido": valorPagamento,
          "CPF": colab?.colab_cpf?.trim() || "",
          "PIS": colab?.colab_pis || "",
          "Data Nascimento": colab?.colab_data_nascimento || "",
          "Rua": colab?.colab_rua || "",
          "Número": colab?.colab_numero_casa?.toString() || "",
          "Complemento": colab?.colab_complemento_endereco || "",
          "Bairro": colab?.colab_bairro || "",
          "Cidade": colab?.colab_cidade || "",
          "CEP": colab?.colab_cep?.toString() || "",
          "Telefone": colab?.colab_telefone?.toString() || "",
          "Estado Civil": colab?.colab_estado_civil ?? "",
          "Estado Civil (Descrição)": colab?.colab_estado_civil ? (ESTADO_CIVIL_MAP[colab.colab_estado_civil] ?? "") : "",
          "Raça": colab?.colab_raca ?? "",
          "Raça (Descrição)": colab?.colab_raca ? (RACA_MAP[colab.colab_raca] ?? "") : "",
          "Grau Instrução": colab?.colab_grau_instrucao ?? "",
          "Grau Instrução (Descrição)": colab?.colab_grau_instrucao ? (GRAU_INSTRUCAO_MAP[colab.colab_grau_instrucao] ?? "") : "",
          "Chave PIX": colab?.colab_chave_pix || "",
          "PcD": colab?.colab_deficiente ? "Sim" : "Não"
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Colaboradores");

      const fileName = `colaboradores_${(prova.editais?.nome ?? "").replace(/\s+/g, "_") || "prova"}.xls`;
      XLSX.writeFile(workbook, fileName);

      toast({
        title: "Exportação concluída",
        description: `${colaboradoresProva.length} colaborador(es) exportado(s) com sucesso.`,
      });
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar os colaboradores.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportCoordenadores = async () => {
    if (!provaId || !prova) return;

    setIsExportingCoordenadores(true);
    try {
      const { data: coordenadores, error } = await supabase
        .from('coordenadores_prova')
        .select(`
          colaboradores_prova!inner (
            colaboradores (
              colab_nome_completo
            )
          )
        `)
        .eq('prova_id', provaId);

      if (error) throw error;

      const rows = (coordenadores || [])
        .map((c: any) => c.colaboradores_prova?.colaboradores)
        .filter((c: any) => c)
        .map((c: any) => ({
          "Nome completo": c.colab_nome_completo || "",
        }))
        .sort((a, b) => a["Nome completo"].localeCompare(b["Nome completo"]));

      if (rows.length === 0) {
        toast({
          title: "Nenhum coordenador",
          description: "Não há coordenadores cadastrados para esta prova.",
          variant: "destructive",
        });
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Coordenadores");

      const fileName = `coordenadores_${(prova.editais?.nome ?? "").replace(/\s+/g, "_") || "prova"}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast({
        title: "Exportação concluída",
        description: `${rows.length} coordenador(es) exportado(s) com sucesso.`,
      });
    } catch (err) {
      console.error("Erro ao exportar coordenadores:", err);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar os coordenadores.",
        variant: "destructive",
      });
    } finally {
      setIsExportingCoordenadores(false);
    }
  };

  const exportCargosCSV = async () => {
    if (!provaId || !prova) return;
    setIsExportingCargos(true);
    try {
      const { data: colabs, error } = await supabase
        .from('colaboradores_prova')
        .select(`
          funcao_id,
          funcoes_colaboradores (cargo_nome),
          prova_unidades!inner (prova_id)
        `)
        .eq('prova_unidades.prova_id', provaId);

      if (error) throw error;

      const { data: valores, error: valoresError } = await supabase
        .from('valores_funcao_prova')
        .select('funcao_id, valor_pagamento, funcoes_colaboradores (cargo_nome)')
        .eq('prova_id', provaId);

      if (valoresError) throw valoresError;

      const map: Record<string, { nome: string; count: number; valor: number }> = {};
      (valores || []).forEach((v: any) => {
        map[v.funcao_id] = {
          nome: v.funcoes_colaboradores?.cargo_nome || "",
          count: 0,
          valor: Number(v.valor_pagamento) || 0,
        };
      });
      (colabs || []).forEach((c: any) => {
        if (!c.funcao_id) return;
        if (!map[c.funcao_id]) {
          map[c.funcao_id] = {
            nome: c.funcoes_colaboradores?.cargo_nome || "",
            count: 0,
            valor: 0,
          };
        }
        map[c.funcao_id].count += 1;
      });

      const rows = Object.values(map)
        .filter((r) => r.count > 0 || r.valor > 0)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      if (rows.length === 0) {
        toast({
          title: "Nenhum cargo",
          description: "Não há cargos alocados nesta prova.",
          variant: "destructive",
        });
        return;
      }

      const fmt = (n: number) =>
        n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const header = "Cargo;Total de Colaboradores;Valor Unitário (R$);Valor Total (R$)";
      const body = rows
        .map((r) => `${r.nome.replace(/;/g, ',')};${r.count};${fmt(r.valor)};${fmt(r.count * r.valor)}`)
        .join("\n");
      const totalGeral = rows.reduce((s, r) => s + r.count * r.valor, 0);
      const totalCount = rows.reduce((s, r) => s + r.count, 0);
      const footer = `\nTOTAL;${totalCount};;${fmt(totalGeral)}`;

      const csv = "\uFEFF" + header + "\n" + body + footer;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cargos_${(prova.editais?.nome ?? "").replace(/\s+/g, "_") || "prova"}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída",
        description: `${rows.length} cargo(s) exportado(s) com sucesso.`,
      });
    } catch (err) {
      console.error("Erro ao exportar cargos:", err);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar os cargos.",
        variant: "destructive",
      });
    } finally {
      setIsExportingCargos(false);
    }
  };

  // If prova is finalized, show locked view
  if (isFinalizada) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/provas">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Gerenciar Prova</h1>
              <p className="text-muted-foreground">
                {prova?.editais?.nome} - {formatDate(prova?.prova_data || null)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={exportColaboradores}
                disabled={isExporting}
                className="gap-2"
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportação DAF
              </Button>
              <Button
                variant="outline"
                onClick={exportCoordenadores}
                disabled={isExportingCoordenadores}
                className="gap-2"
              >
                {isExportingCoordenadores ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportar Coordenadores
              </Button>
              <Button
                variant="outline"
                onClick={exportCargosCSV}
                disabled={isExportingCargos}
                className="gap-2"
              >
                {isExportingCargos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportar Cargos (CSV)
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/documentos-impressao/${provaId}`)}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Documentos Impressão
              </Button>
            </div>
          </div>

          <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <AlertTriangle className="h-16 w-16 text-amber-500 mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Configuração da Prova Finalizada
              </h2>
              <p className="text-muted-foreground max-w-md mb-6">
                Impossível alterar parâmetros da prova. Para realizar alterações, é necessário reabrir a configuração.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/ocorrencias-prova/${provaId}`)}
                  className="gap-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Ocorrências
                </Button>
                <Button
                  onClick={handleReabrirClick}
                  variant="outline"
                  className="gap-2"
                >
                  <Unlock className="h-4 w-4" />
                  Reabrir Configuração da Prova
                </Button>
              </div>
              {!isCreator && (
                <p className="text-sm text-muted-foreground mt-4">
                  Apenas o criador da prova ({prova?.profiles?.full_name || "Desconhecido"}) pode reabri-la.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <PasswordConfirmDialog
          open={reabrirDialogOpen}
          onOpenChange={setReabrirDialogOpen}
          title="Reabrir Configuração da Prova"
          description="Esta ação permitirá que a configuração da prova seja alterada novamente. Digite sua senha para confirmar."
          onConfirm={handleReabrir}
          confirmText="Reabrir Configuração"
        />
      </Layout>
    );
  }

  // Normal editing view
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/provas">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Gerenciar Prova</h1>
            <p className="text-muted-foreground">
              {prova?.editais?.nome} - {formatDate(prova?.prova_data || null)}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/ocorrencias-prova/${provaId}`)}
              className="gap-2"
            >
              <AlertTriangle className="h-4 w-4" />
              Ocorrências
            </Button>
            <Button
              variant="outline"
              onClick={exportCoordenadores}
              disabled={isExportingCoordenadores}
              className="gap-2"
            >
              {isExportingCoordenadores ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar Coordenadores
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={exportCargosCSV}
                disabled={isExportingCargos}
                className="gap-2"
              >
                {isExportingCargos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportar Cargos (CSV)
              </Button>
            )}
            {isAdmin && (
              <>
                <Button
                  onClick={() => setParametrosDialogOpen(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Parâmetros Gerais
                </Button>
                <Button
                  onClick={() => setValoresDialogOpen(true)}
                  className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90"
                >
                  <Users className="h-4 w-4" />
                  Cadastrar Funções dos Colaboradores
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Building2 className="h-4 w-4" />
                {isCoordenador ? "Sua Unidade de Prova" : "Alocação de Candidatos"}
              </CardTitle>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/painel-dados-colaboradores/${provaId}`)}
                  className="gap-2"
                >
                  <Users className="h-4 w-4" />
                  Painel de Dados dos Colaboradores
                </Button>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-4 mt-3 text-sm">
                <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Total de Candidatos:</span>
                  <span className="font-semibold text-foreground">{totalCandidatos}</span>
                </div>
                <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md">
                  <span className="text-muted-foreground">Alocados:</span>
                  <span className="font-semibold text-foreground">{totalAlocados}</span>
                </div>
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${naoAlocados > 0 ? "bg-destructive/10" : "bg-muted"}`}
                >
                  <span className="text-muted-foreground">Não Alocados:</span>
                  <span className={`font-semibold ${naoAlocados > 0 ? "text-destructive" : "text-foreground"}`}>
                    {naoAlocados}
                  </span>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdmin && (
              <div className="flex gap-2">
                <Select
                  value={selectedUnidade}
                  onValueChange={setSelectedUnidade}
                  disabled={isLoading || unidadesDisponiveis.length === 0}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue
                      placeholder={
                        unidadesDisponiveis.length === 0
                          ? "Todas as unidades já foram adicionadas"
                          : "Selecione uma unidade"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {unidadesDisponiveis.map((unidade) => (
                      <SelectItem key={unidade.id} value={unidade.id}>
                        {unidade.unid_sigla.trim()} - {unidade.unid_nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddUnidade} disabled={!selectedUnidade || isAdding} className="gap-2">
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredProvaUnidades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground">
                  {isCoordenador ? "Você não está vinculado a nenhuma unidade" : "Nenhuma unidade vinculada"}
                </h3>
                <p className="text-muted-foreground mt-1">
                  {isCoordenador 
                    ? "Contate um administrador para associar você a uma unidade de prova."
                    : "Selecione uma unidade acima para vincular a esta prova."}
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sigla</TableHead>
                      <TableHead>Nome</TableHead>
                      {isAdmin && <TableHead className="text-right">Candidatos</TableHead>}
                      {isAdmin && <TableHead className="text-center">Salas</TableHead>}
                      <TableHead className="text-center">Colaboradores</TableHead>
                      {isAdmin && <TableHead className="w-[80px]">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProvaUnidades.map((pu) => (
                      <TableRow key={pu.id}>
                        <TableCell className="font-medium">{pu.unidades_prova.unid_sigla.trim()}</TableCell>
                        <TableCell>{pu.unidades_prova.unid_nome}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right font-medium">
                            {capacidadePorUnidade[pu.unidade_id] || 0}
                          </TableCell>
                        )}
                        {isAdmin && (
                          <TableCell className="text-center">
                            <Link
                              to={`/gerenciar-salas-distribuidas/${provaId}/${pu.unidade_id}`}
                              className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                              title="Gerenciar candidatos por sala"
                            >
                              <Settings className="h-5 w-5" />
                            </Link>
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                          <Link
                            to={`/gerenciar-colaboradores-prova/${pu.id}`}
                            className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                            title="Gerenciar colaboradores"
                          >
                            <Settings className="h-5 w-5" />
                          </Link>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveUnidade(pu.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Finalizar button - only for admin */}
            {isAdmin && (
              <>
                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={handleFinalizarClick}
                    className="gap-2"
                  >
                    <Lock className="h-4 w-4" />
                    Finalizar Configuração da Prova
                  </Button>
                </div>
                {!isCreator && (
                  <p className="text-sm text-muted-foreground text-right">
                    Apenas o criador da prova ({prova?.profiles?.full_name || "Desconhecido"}) pode finalizá-la.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover unidade</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover esta unidade da prova? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(() => {
        const unidadesAbertas = provaUnidades
          .filter((pu: any) => !pu.unidade_finalizada)
          .map((pu: any) => pu.unidades_prova?.unid_nome || pu.unidades_prova?.unid_sigla || "—");
        return (
          <PasswordConfirmDialog
            open={finalizarDialogOpen}
            onOpenChange={setFinalizarDialogOpen}
            title="Finalizar Configuração da Prova"
            description={
              <div className="space-y-3">
                <p>Após finalizar, nenhuma alteração poderá ser feita nos dados da prova.</p>
                {unidadesAbertas.length === 0 ? (
                  <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-foreground">
                    Todas as unidades de prova foram fechadas por seus Coordenadores.
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
                    <p className="font-medium mb-1">Atenção: unidades ainda não fechadas ({unidadesAbertas.length}):</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {unidadesAbertas.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p>Digite sua senha para confirmar.</p>
              </div>
            }
            onConfirm={handleFinalizar}
            confirmText="Finalizar Configuração"
          />
        );
      })()}

      {provaId && prova && (
          <ValoresFuncaoProvaDialog
            open={valoresDialogOpen}
            onOpenChange={setValoresDialogOpen}
            provaId={provaId}
            provaEdital={prova.editais?.nome || ""}
          />
      )}

      {isAdmin && prova && (
        <ProvaDialog
          open={parametrosDialogOpen}
          onOpenChange={setParametrosDialogOpen}
          prova={prova}
          onSubmit={(data) => {
            updateProva({ id: prova.id, data: data as ProvaUpdate });
            setParametrosDialogOpen(false);
          }}
          isLoading={isUpdating}
        />
      )}
    </Layout>
  );
}
