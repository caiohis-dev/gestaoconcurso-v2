import { useState, useEffect, useMemo } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProvas } from "@/hooks/useProvas";
import { useUnidadesProva } from "@/hooks/useUnidadesProva";
import { useSalasDistribuidas, useFiscaisSala, SalaDistribuida } from "@/hooks/useSalasDistribuidas";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2, Building2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateBRWithFallback } from "@/lib/utils";
import { SalaExtraDialog } from "@/components/SalaExtraDialog";

interface EditableSala extends SalaDistribuida {
  isModified?: boolean;
}

export default function GerenciarSalasDistribuidas() {
  const { provaId, unidadeId } = useParams<{ provaId: string; unidadeId: string }>();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { provas, isLoading: isLoadingProvas } = useProvas();
  const { unidades, isLoading: isLoadingUnidades } = useUnidadesProva();
  const { salas, isLoading: isLoadingSalas, updateSalas, isSaving, addSala, isAddingSala } = useSalasDistribuidas(
    provaId || "",
    unidadeId
  );
  const { data: fiscais, isLoading: isLoadingFiscais } = useFiscaisSala(provaId || "");
  const { toast } = useToast();

  const [editableSalas, setEditableSalas] = useState<EditableSala[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    if (salas.length > 0) {
      setEditableSalas(salas.map((s) => ({ ...s, isModified: false })));
    }
  }, [salas]);

  // Get all fiscais already selected in this screen
  const selectedFiscais = useMemo(() => {
    const selected = new Set<string>();
    editableSalas.forEach((sala) => {
      if (sala.sala_fiscal_1) selected.add(sala.sala_fiscal_1);
      if (sala.sala_fiscal_2) selected.add(sala.sala_fiscal_2);
    });
    return selected;
  }, [editableSalas]);

  // Check if a fiscal is available for a specific sala and field
  const isFiscalAvailable = (fiscalId: string, salaId: string, field: "fiscal_1" | "fiscal_2") => {
    // If this fiscal is already selected in this sala's other field, it's not available
    const sala = editableSalas.find((s) => s.id === salaId);
    if (!sala) return true;

    if (field === "fiscal_1" && sala.sala_fiscal_2 === fiscalId) return false;
    if (field === "fiscal_2" && sala.sala_fiscal_1 === fiscalId) return false;

    // If this fiscal is selected in another sala, it's not available
    for (const s of editableSalas) {
      if (s.id === salaId) continue;
      if (s.sala_fiscal_1 === fiscalId || s.sala_fiscal_2 === fiscalId) return false;
    }

    return true;
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const prova = provas.find((p) => p.id === provaId);
  const unidade = unidades.find((u) => u.id === unidadeId);

  if (!isLoadingProvas && !prova) {
    return <Navigate to="/provas" replace />;
  }

  if (!isLoadingUnidades && !unidade) {
    return <Navigate to={`/gerenciar-prova/${provaId}`} replace />;
  }

  const formatDate = (dateStr: string | null) => {
    return formatDateBRWithFallback(dateStr);
  };

  const handleCapacidadeChange = (id: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;

    setEditableSalas((prev) =>
      prev.map((sala) =>
        sala.id === id ? { ...sala, sala_capacidade: numValue, isModified: true } : sala
      )
    );
  };

  const handleDescricaoChange = (id: string, value: string) => {
    setEditableSalas((prev) =>
      prev.map((sala) =>
        sala.id === id ? { ...sala, sala_descricao: value, isModified: true } : sala
      )
    );
  };

  const handleAndarChange = (id: string, value: string) => {
    const numValue = parseInt(value, 10);
    setEditableSalas((prev) =>
      prev.map((sala) =>
        sala.id === id
          ? { ...sala, sala_andar: isNaN(numValue) ? null : numValue, isModified: true }
          : sala
      )
    );
  };

  const handleNumeroChange = (id: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;

    setEditableSalas((prev) =>
      prev.map((sala) =>
        sala.id === id ? { ...sala, sala_numero: numValue, isModified: true } : sala
      )
    );
  };

  const handleFiscal1Change = (id: string, value: string) => {
    setEditableSalas((prev) =>
      prev.map((sala) =>
        sala.id === id
          ? { ...sala, sala_fiscal_1: value === "none" ? null : value, isModified: true }
          : sala
      )
    );
  };

  const handleFiscal2Change = (id: string, value: string) => {
    setEditableSalas((prev) =>
      prev.map((sala) =>
        sala.id === id
          ? { ...sala, sala_fiscal_2: value === "none" ? null : value, isModified: true }
          : sala
      )
    );
  };

  const handleSave = () => {
    // Check for duplicate room numbers
    const numeros = editableSalas.map((s) => s.sala_numero);
    const duplicados = numeros.filter((num, idx) => numeros.indexOf(num) !== idx);
    
    if (duplicados.length > 0) {
      const numerosUnicos = [...new Set(duplicados)];
      toast({
        title: "Números de sala duplicados",
        description: `Os seguintes números de sala estão duplicados: ${numerosUnicos.join(", ")}. Corrija antes de salvar.`,
        variant: "destructive",
      });
      return;
    }

    const modifiedSalas = editableSalas.filter((s) => s.isModified);
    if (modifiedSalas.length > 0) {
      updateSalas(modifiedSalas);
    }
  };

  const hasModifications = editableSalas.some((s) => s.isModified);
  const isLoading = isLoadingProvas || isLoadingUnidades || isLoadingSalas || isLoadingFiscais;

  const totalCapacidade = editableSalas.reduce((sum, sala) => sum + sala.sala_capacidade, 0);

  const existingNumeros = editableSalas.map((s) => s.sala_numero);

  const getFiscalName = (fiscalId: string | null) => {
    if (!fiscalId) return null;
    const fiscal = fiscais?.find((f) => f.colaborador_prova_id === fiscalId);
    return fiscal?.colaborador_nome || null;
  };

  const handleAddSalaExtra = (data: {
    sala_numero: number;
    sala_descricao: string | null;
    sala_andar: string | null;
    sala_capacidade: number;
  }) => {
    if (!provaId || !unidadeId) return;

    // Convert andar string to number if possible, otherwise set to null
    let andarNumerico: number | null = null;
    if (data.sala_andar) {
      const parsed = parseInt(data.sala_andar, 10);
      if (!isNaN(parsed)) {
        andarNumerico = parsed;
      }
    }

    addSala(
      {
        prova_id: provaId,
        sala_fk_unidade: unidadeId,
        sala_numero: data.sala_numero,
        sala_descricao: data.sala_descricao,
        sala_andar: andarNumerico,
        sala_capacidade: data.sala_capacidade,
      },
      {
        onSuccess: () => {
          setIsAddDialogOpen(false);
        },
      }
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/gerenciar-prova/${provaId}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Gerenciar Salas Distribuídas</h1>
              <p className="text-muted-foreground">
                {prova?.editais?.nome} - {formatDate(prova?.prova_data || null)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar Sala Extra
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasModifications || isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar Alterações
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Building2 className="h-4 w-4" />
              {unidade?.unid_sigla?.trim()} - {unidade?.unid_nome}
            </CardTitle>
            <div className="flex gap-4 mt-3 text-sm">
              <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md">
                <span className="text-muted-foreground">Total de Salas:</span>
                <span className="font-semibold text-foreground">{editableSalas.length}</span>
              </div>
              <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md">
                <span className="text-muted-foreground">Capacidade Total:</span>
                <span className="font-semibold text-foreground">{totalCapacidade}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : editableSalas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground">Nenhuma sala encontrada</h3>
                <p className="text-muted-foreground mt-1">
                  Esta unidade não possui salas distribuídas para esta prova.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Número</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[80px]">Andar</TableHead>
                      <TableHead className="w-[120px]">Capacidade</TableHead>
                      <TableHead className="w-[200px]">Fiscal 1</TableHead>
                      <TableHead className="w-[200px]">Fiscal 2</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editableSalas.map((sala) => (
                      <TableRow
                        key={sala.id}
                        className={sala.isModified ? "bg-primary/5" : ""}
                      >
                        <TableCell>
                          <Input
                            type="number"
                            value={sala.sala_numero}
                            onChange={(e) => handleNumeroChange(sala.id, e.target.value)}
                            className="h-8 w-20"
                            min={1}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={sala.sala_descricao || ""}
                            onChange={(e) => handleDescricaoChange(sala.id, e.target.value)}
                            className="h-8"
                            placeholder="Descrição"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sala.sala_andar ?? ""}
                            onChange={(e) => handleAndarChange(sala.id, e.target.value)}
                            className="h-8 w-16"
                            min={0}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sala.sala_capacidade}
                            onChange={(e) => handleCapacidadeChange(sala.id, e.target.value)}
                            className="h-8 w-20"
                            min={0}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={sala.sala_fiscal_1 || "none"}
                            onValueChange={(value) => handleFiscal1Change(sala.id, value)}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue placeholder="Selecionar...">
                                {getFiscalName(sala.sala_fiscal_1) || "Selecionar..."}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum</SelectItem>
                              {fiscais?.map((fiscal) => {
                                const isAvailable = isFiscalAvailable(fiscal.colaborador_prova_id, sala.id, "fiscal_1");
                                const isCurrentValue = sala.sala_fiscal_1 === fiscal.colaborador_prova_id;
                                
                                if (!isAvailable && !isCurrentValue) return null;
                                
                                return (
                                  <SelectItem
                                    key={fiscal.colaborador_prova_id}
                                    value={fiscal.colaborador_prova_id}
                                  >
                                    {fiscal.colaborador_nome}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={sala.sala_fiscal_2 || "none"}
                            onValueChange={(value) => handleFiscal2Change(sala.id, value)}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue placeholder="Selecionar...">
                                {getFiscalName(sala.sala_fiscal_2) || "Selecionar..."}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum</SelectItem>
                              {fiscais?.map((fiscal) => {
                                const isAvailable = isFiscalAvailable(fiscal.colaborador_prova_id, sala.id, "fiscal_2");
                                const isCurrentValue = sala.sala_fiscal_2 === fiscal.colaborador_prova_id;
                                
                                if (!isAvailable && !isCurrentValue) return null;
                                
                                return (
                                  <SelectItem
                                    key={fiscal.colaborador_prova_id}
                                    value={fiscal.colaborador_prova_id}
                                  >
                                    {fiscal.colaborador_nome}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <SalaExtraDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onSubmit={handleAddSalaExtra}
          isLoading={isAddingSala}
          existingNumeros={existingNumeros}
        />
      </div>
    </Layout>
  );
}
