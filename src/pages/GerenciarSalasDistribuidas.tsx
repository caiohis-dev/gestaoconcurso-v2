import { useState, useEffect, useMemo, useRef } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProvas } from "@/hooks/useProvas";
import { useProvaUnidades } from "@/hooks/useProvaUnidades";
import { useUnidadesProva } from "@/hooks/useUnidadesProva";
import { useSalasDistribuidas, useFiscaisSala, SalaDistribuida } from "@/hooks/useSalasDistribuidas";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2, Building2, Plus, Lock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateBRWithFallback } from "@/lib/utils";
import { SalaExtraDialog } from "@/components/SalaExtraDialog";
import { numeroDigitado, mensagemCamposObrigatorios } from "@/lib/salas";

/**
 * 🔴 Os três campos numéricos podem ficar `null` AQUI, e não no banco: `null` significa
 * "em branco enquanto a pessoa digita". Até 2026-08-03 eles eram `number` puro e o
 * handler descartava a tecla quando o campo ficava vazio — com input controlado, isso
 * REPUNHA o valor antigo e o campo parecia travado (não dava para apagar dígito a dígito).
 *
 * `sala_numero` e `sala_capacidade` são NOT NULL no banco, então em branco é estado de
 * digitação, nunca de gravação: `handleSave` recusa antes de mandar. `sala_andar` é
 * NULLABLE — para ele, em branco é valor final legítimo.
 */
interface EditableSala
  extends Omit<SalaDistribuida, "sala_numero" | "sala_capacidade" | "sala_andar"> {
  sala_numero: number | null;
  sala_capacidade: number | null;
  sala_andar: number | null;
  isModified?: boolean;
}

export default function GerenciarSalasDistribuidas() {
  const { provaId, unidadeId } = useParams<{ provaId: string; unidadeId: string }>();
  // Só o `loading` é usado: quem autoriza esta rota é o `RequireAcesso papeis={["admin"]}`
  // do `App.tsx`, não a página. `user` e `isAdmin` estavam desestruturados sem uso.
  const { loading: authLoading } = useAuth();
  const { provas, isLoading: isLoadingProvas } = useProvas();
  const { unidades, isLoading: isLoadingUnidades } = useUnidadesProva();
  const { provaUnidades } = useProvaUnidades(provaId || "");
  const { salas, isLoading: isLoadingSalas, updateSalas, isSaving, addSala, isAddingSala } = useSalasDistribuidas(
    provaId || "",
    unidadeId
  );
  const { data: fiscais, isLoading: isLoadingFiscais } = useFiscaisSala(provaId || "");
  const { toast } = useToast();

  const [editableSalas, setEditableSalas] = useState<EditableSala[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  /** O servidor mudou enquanto havia edição na tela — ver o efeito abaixo. */
  const [servidorMudou, setServidorMudou] = useState(false);

  /**
   * 🔴 EDIÇÃO NÃO SALVA NÃO É SOBRESCRITA (2026-08-03). Este efeito copiava `salas` por
   * cima do estado local a CADA mudança de referência da query. Com `refetchOnWindowFocus`
   * ligado (o `QueryClient` do `App.tsx` é criado sem defaults), bastava outra pessoa
   * salvar naquela unidade e você voltar para a aba: **tudo o que estava digitado sumia,
   * sem aviso e sem confirmação**. Medido nos dois cenários, com teste próprio:
   *
   *   • refetch trazendo dado IDÊNTICO → a edição sobrevivia (o structural sharing do
   *     react-query preserva a referência), e por isso o defeito não aparecia no uso comum;
   *   • refetch trazendo dado MUDADO → a edição era apagada.
   *
   * Agora, havendo edição pendente, o dado novo NÃO entra: a tela avisa que o servidor
   * mudou e oferece descartar. Perder trabalho digitado precisa ser escolha de quem
   * digitou.
   *
   * ⚠️ O flag mora num `ref` de propósito. Em estado, ele entraria nas deps e o próprio
   * ato de começar a editar dispararia o efeito — que então acusaria "o servidor mudou"
   * sem que nada tivesse mudado.
   */
  const temEdicaoPendente = useRef(false);

  useEffect(() => {
    if (temEdicaoPendente.current) {
      setServidorMudou(true);
      return;
    }
    // ⚠️ Sem `salas.length > 0`: a lista voltar VAZIA é informação (unidade sem salas), e
    // ignorá-la deixava as linhas da carga anterior na tela.
    setEditableSalas(salas.map((s) => ({ ...s, isModified: false })));
  }, [salas]);

  /** Descarta o que está na tela e assume o que veio do servidor. */
  const recarregarDoServidor = () => {
    temEdicaoPendente.current = false;
    setServidorMudou(false);
    setEditableSalas(salas.map((s) => ({ ...s, isModified: false })));
  };

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

  /**
   * 🔴 Prova ou unidade finalizada CONGELA as salas (2026-08-03). A barreira de verdade é
   * o trigger `check_sala_de_prova_finalizada` (PF001, migration 20260803003152) — até
   * então o único obstáculo era `GerenciarProva` não mostrar o link para cá na visão de
   * prova finalizada, o que não impede URL na mão, aba antiga nem PostgREST direto.
   *
   * O que a tela faz é EXPLICAR e tirar os controles do caminho; se ainda assim uma
   * escrita sair (aba aberta antes de finalizar), a mensagem do trigger chega ao usuário
   * pelo `onError` do hook, que a repassa intacta.
   *
   * São dois níveis, e o segundo é acionado pelo COORDENADOR (`finalizar_prova_unidade`):
   * a unidade fechada congela as salas dela mesmo com a prova aberta.
   */
  const vinculo = provaUnidades.find((pu) => pu.unidade_id === unidadeId);
  const congelada = (prova?.prova_finalizada ?? false) || (vinculo?.unidade_finalizada ?? false);
  const motivoCongelamento = prova?.prova_finalizada
    ? "Esta prova está finalizada. As salas não podem mais ser alteradas — reabra a prova em Gerenciar Prova para editar."
    : "Esta unidade já foi finalizada nesta prova. As salas não podem mais ser alteradas — reabra a unidade para editar.";

  /**
   * Toda edição de célula passa por aqui — é o ÚNICO lugar que marca a edição pendente.
   * Espalhar `temEdicaoPendente.current = true` por seis handlers era convite a alguém
   * escrever o sétimo sem ele, e o sintoma seria a perda silenciosa de volta.
   */
  const aplicarEdicao = (id: string, patch: Partial<EditableSala>) => {
    temEdicaoPendente.current = true;
    setEditableSalas((prev) =>
      prev.map((sala) => (sala.id === id ? { ...sala, ...patch, isModified: true } : sala))
    );
  };

  const handleCapacidadeChange = (id: string, value: string) => {
    const numValue = numeroDigitado(value);
    if (numValue === undefined) return;
    aplicarEdicao(id, { sala_capacidade: numValue });
  };

  const handleDescricaoChange = (id: string, value: string) => {
    aplicarEdicao(id, { sala_descricao: value });
  };

  const handleAndarChange = (id: string, value: string) => {
    const numValue = numeroDigitado(value);
    if (numValue === undefined) return;
    aplicarEdicao(id, { sala_andar: numValue });
  };

  const handleNumeroChange = (id: string, value: string) => {
    const numValue = numeroDigitado(value);
    if (numValue === undefined) return;
    aplicarEdicao(id, { sala_numero: numValue });
  };

  const handleFiscal1Change = (id: string, value: string) => {
    aplicarEdicao(id, { sala_fiscal_1: value === "none" ? null : value });
  };

  const handleFiscal2Change = (id: string, value: string) => {
    aplicarEdicao(id, { sala_fiscal_2: value === "none" ? null : value });
  };

  const handleSave = () => {
    // ⚠️ EM BRANCO vem ANTES de duplicado, e a ordem não é estética: com dois campos de
    // número vazios, a checagem de duplicata veria `null === null` e acusaria "número
    // duplicado" — mandando corrigir a coisa errada.
    const emBranco = mensagemCamposObrigatorios(editableSalas);
    if (emBranco) {
      toast({ title: "Campos obrigatórios em branco", description: emBranco, variant: "destructive" });
      return;
    }

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
      // Salvou: o que estava na tela virou o estado do servidor, então o refetch da
      // invalidação pode reassumir. Sem isto, a tela ficaria presa em "servidor mudou".
      updateSalas(modifiedSalas, {
        onSuccess: () => {
          temEdicaoPendente.current = false;
          setServidorMudou(false);
        },
      });
    }
  };

  const hasModifications = editableSalas.some((s) => s.isModified);
  const isLoading = isLoadingProvas || isLoadingUnidades || isLoadingSalas || isLoadingFiscais;

  // Campo em branco vale 0 no total — a soma continua legível enquanto se digita.
  const totalCapacidade = editableSalas.reduce((sum, sala) => sum + (sala.sala_capacidade ?? 0), 0);

  // Só números de verdade: o dialog de sala extra usa esta lista para recusar repetido.
  const existingNumeros = editableSalas
    .map((s) => s.sala_numero)
    .filter((n): n is number => n !== null);

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
          {!congelada && (
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
          )}
        </div>

        {congelada && (
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted px-4 py-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Salas somente leitura</p>
              <p className="text-sm text-muted-foreground">{motivoCongelamento}</p>
            </div>
          </div>
        )}

        {servidorMudou && !congelada && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-medium text-foreground">
                Estas salas mudaram no servidor enquanto você editava
              </p>
              <p className="text-sm text-muted-foreground">
                Suas alterações continuam aqui, sem serem salvas, e a tela está mostrando
                elas — não o que está no servidor. Salvar sobrescreve o que a outra pessoa
                gravou.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={recarregarDoServidor} className="shrink-0">
              Descartar as minhas e recarregar
            </Button>
          </div>
        )}

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
                            value={sala.sala_numero ?? ""}
                            onChange={(e) => handleNumeroChange(sala.id, e.target.value)}
                            className="h-8 w-20"
                            min={1}
                            disabled={congelada}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={sala.sala_descricao || ""}
                            onChange={(e) => handleDescricaoChange(sala.id, e.target.value)}
                            className="h-8"
                            placeholder="Descrição"
                            disabled={congelada}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sala.sala_andar ?? ""}
                            onChange={(e) => handleAndarChange(sala.id, e.target.value)}
                            className="h-8 w-16"
                            min={0}
                            disabled={congelada}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sala.sala_capacidade ?? ""}
                            onChange={(e) => handleCapacidadeChange(sala.id, e.target.value)}
                            className="h-8 w-20"
                            min={0}
                            disabled={congelada}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={sala.sala_fiscal_1 || "none"}
                            onValueChange={(value) => handleFiscal1Change(sala.id, value)}
                            disabled={congelada}
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
                            disabled={congelada}
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
