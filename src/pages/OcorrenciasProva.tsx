import { useState, useMemo, useEffect } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useProvas } from "@/hooks/useProvas";
import { useProvaUnidades } from "@/hooks/useProvaUnidades";
import { useCoordenadorUnidades } from "@/hooks/useCoordenadorUnidades";
import { useOcorrencias, Ocorrencia, OcorrenciaInsert, EfeitoOcorrencia } from "@/hooks/useOcorrencias";
import { supabase } from "@/integrations/supabase/client";
import { useBuscarColaboradoresParaAlocacao } from "@/hooks/useColaboradores";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { useSalasDoFiscal, avisoFiscalDeSala } from "@/hooks/useSalasDistribuidas";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowLeft, Plus, Trash2, Loader2, AlertTriangle, UserPlus, Lock, ChevronsUpDown, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBRWithFallback, maskDateBR, brDateToIso, isoToBrDate, formatDateBR } from "@/lib/utils";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  useLogoBase64,
  criarDocumentoPaisagem,
  desenharTimbre,
  MARGEM_LATERAL,
  ESTILOS_TABELA,
  ESTILOS_CABECALHO,
  TIMBRE_LINHA1_PADRAO,
  TIMBRE_LINHA2_PADRAO,
} from "@/lib/pdf-timbre";

interface FormState {
  prova_unidade_id: string;
  colaborador_id: string;
  tipo_ocorrencia: string;
  data_ocorrencia: string; // ISO local
  descricao: string;
  efeito: EfeitoOcorrencia;
}

const emptyForm: FormState = {
  prova_unidade_id: "",
  colaborador_id: "",
  tipo_ocorrencia: "",
  data_ocorrencia: "",
  descricao: "",
  efeito: "nenhum",
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function OcorrenciasProva() {
  const { provaId } = useParams<{ provaId: string }>();
  const { user, loading: authLoading, isAdmin, isSuperAdmin, isCoordenador } = useAuth() as any;
  const { provas, isLoading: isLoadingProvas } = useProvas();
  const { provaUnidades, isLoading: isLoadingProvaUnidades } = useProvaUnidades(provaId || "");
  const { provaUnidades: coordenadorUnidades, isLoading: isLoadingCoordUnidades } =
    useCoordenadorUnidades();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdminOrSuper = !!isAdmin || !!isSuperAdmin;

  // Base list scoped to user's role (admins see all; coordenador only their units)
  const scopedUnidades = useMemo(() => {
    if (isAdminOrSuper) return provaUnidades;
    if (isCoordenador) {
      const ids = new Set(coordenadorUnidades.map((cu) => cu.id));
      return provaUnidades.filter((pu) => ids.has(pu.id));
    }
    return [];
  }, [provaUnidades, coordenadorUnidades, isAdminOrSuper, isCoordenador]);

  // For coordenadores, hide units whose ocorrências registration is closed
  const allowedUnidades = useMemo(() => {
    if (isAdminOrSuper) return scopedUnidades;
    return scopedUnidades.filter((pu: any) => !pu.ocorrencias_encerradas);
  }, [scopedUnidades, isAdminOrSuper]);

  const allowedUnidadeIds = useMemo(() => allowedUnidades.map((pu) => pu.id), [allowedUnidades]);
  const scopedUnidadeIds = useMemo(() => scopedUnidades.map((pu) => pu.id), [scopedUnidades]);

  const { ocorrencias, isLoading, create, remove, isCreating, isRemoving } = useOcorrencias(
    provaId || "",
    isAdminOrSuper ? undefined : scopedUnidadeIds,
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [dataDisplay, setDataDisplay] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [substitutoOpen, setSubstitutoOpen] = useState(false);
  // 🔵 `allColaboradores` e `alocadosMap` saíram em 2026-09-12. A lista inteira vinha em
  // duas consultas sem teto (771 colaboradores + todas as alocações da prova) e o filtro
  // acontecia aqui em memória — o PostgREST corta em `max_rows` (1000) SEM ERRO, então um
  // colaborador simplesmente sumiria do picker. Agora a busca e o cruzamento são da RPC
  // `buscar_colaboradores_para_alocacao`, com LIMIT.
  const [substitutoSearch, setSubstitutoSearch] = useState("");
  const [substitutoNome, setSubstitutoNome] = useState<string>("");
  const [substitutoId, setSubstitutoId] = useState<string>("");
  const [encerrarUnidadeId, setEncerrarUnidadeId] = useState<string | null>(null);
  const logoBase64 = useLogoBase64();
  const [exportingPdf, setExportingPdf] = useState(false);

  const openSubstituto = () => {
    setSubstitutoOpen(true);
    setSubstitutoSearch("");
  };

  const termoSubstituto = useDebounce(substitutoSearch);
  // Sem `excluirProvaUnidadeId`: aqui se vê todo mundo, e quem já está alocado aparece
  // com a sigla e o botão desabilitado — a escolha de um substituto precisa mostrar
  // por que alguém não serve, não escondê-lo.
  const {
    colaboradores: colaboradoresSubstituto,
    isFetching: loadingAllColabs,
    podeHaverMais: podeHaverMaisSubstitutos,
  } = useBuscarColaboradoresParaAlocacao({
    provaId,
    termo: termoSubstituto,
    habilitado: substitutoOpen,
  });


  const [colaboradoresUnidade, setColaboradoresUnidade] = useState<
    {
      id: string;
      colaborador_prova_id: string;
      colab_nome_completo: string;
      colab_cpf: string;
      sigla_alocada: string;
      disabled: boolean;
    }[]
  >([]);
  const [loadingColabs, setLoadingColabs] = useState(false);
  const [colabSearch, setColabSearch] = useState("");
  const [colabPopoverOpen, setColabPopoverOpen] = useState(false);

  // Load colaboradores linked to the selected prova_unidade only
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!form.prova_unidade_id || !provaId) {
        setColaboradoresUnidade([]);
        return;
      }
      setLoadingColabs(true);
      const { data } = await supabase
        .from("colaboradores_prova")
        .select("id, colaboradores ( id, colab_nome_completo, colab_cpf )")
        .eq("prova_unidade_id", form.prova_unidade_id);
      if (cancelled) return;

      const list = (((data as any[]) || [])
        .filter((row) => row?.colaboradores?.id)
        .map((row) => ({
          id: row.colaboradores.id,
          colaborador_prova_id: row.id,
          colab_nome_completo: row.colaboradores.colab_nome_completo,
          colab_cpf: row.colaboradores.colab_cpf,
          sigla_alocada: "",
          disabled: false,
        }))
        .sort((a, b) =>
          (a.colab_nome_completo || "").localeCompare(b.colab_nome_completo || "", "pt-BR"),
        ));
      setColaboradoresUnidade(list);
      setLoadingColabs(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [form.prova_unidade_id, provaId]);

  const normalize = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filteredColabs = useMemo(() => {
    const q = normalize(colabSearch.trim());
    if (!q) return colaboradoresUnidade;
    return colaboradoresUnidade.filter((c) => normalize(c.colab_nome_completo).includes(q));
  }, [colaboradoresUnidade, colabSearch]);

  const selectedColab = useMemo(
    () => colaboradoresUnidade.find((c) => c.id === form.colaborador_id),
    [colaboradoresUnidade, form.colaborador_id],
  );

  // Aviso de fiscal de sala quando o efeito é "falta": a remoção de `colaboradores_prova`
  // esvazia `sala_fiscal_1/2` em silêncio (ON DELETE SET NULL) — mesmo padrão de
  // `GerenciarColaboradoresProva.tsx`, reaproveitado aqui em vez de duplicado.
  const { data: salasDoFiscalFalta = [] } = useSalasDoFiscal(
    form.efeito === "falta" ? selectedColab?.colaborador_prova_id ?? null : null,
  );
  const avisoFaltaFiscal = avisoFiscalDeSala(selectedColab?.colab_nome_completo, salasDoFiscalFalta);

  // O escopo do coordenador entra na espera: `useCoordenadorUnidades` devolve `[]`
  // enquanto carrega, e `[]` agora significa "nenhuma unidade" — correto para a
  // consulta (que passou a devolver zero linhas em vez da prova inteira), mas na tela
  // apareceria um "nenhuma ocorrência" que é mentira. Esperar evita afirmar o vazio.
  if (authLoading || isLoadingProvas || (isCoordenador && !isAdminOrSuper && isLoadingCoordUnidades)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdminOrSuper && !isCoordenador) return <Navigate to="/" replace />;

  const prova = provas.find((p) => p.id === provaId);
  if (!prova) return <Navigate to="/provas" replace />;

  const openCreate = () => {
    setSubstitutoNome("");
    setSubstitutoId("");
    setForm({
      ...emptyForm,
      prova_unidade_id: allowedUnidades.length === 1 ? allowedUnidades[0].id : "",
      data_ocorrencia: todayISO(),
    });
    setDataDisplay(isoToBrDate(todayISO()));
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.prova_unidade_id || !form.colaborador_id || !form.descricao.trim()) return;

    if (form.efeito === "substituicao" && !substitutoNome.trim()) {
      toast({
        variant: "destructive",
        title: "Substituto obrigatório",
        description: "Selecione um substituto para registrar a ocorrência.",
      });
      return;
    }

    // O efeito sobre `colaboradores_prova` (substituição ou falta) acontece dentro do
    // RPC `registrar_ocorrencia_colaborador`, numa única transação — ver
    // `useOcorrencias.tsx`. Não há mais passos manuais aqui.
    const payload: OcorrenciaInsert = {
      prova_unidade_id: form.prova_unidade_id,
      colaborador_id: form.colaborador_id,
      descricao: form.descricao.trim(),
      tipo_ocorrencia: form.tipo_ocorrencia.trim() || null,
      efeito: form.efeito,
      substituto_id: form.efeito === "substituicao" ? substitutoId : null,
      data_ocorrencia: form.data_ocorrencia || todayISO(),
    };

    create(payload, { onSuccess: () => setDialogOpen(false) });
  };

  // O que aconteceu com a alocação por causa desta ocorrência — "Falta" tem prioridade
  // porque, embora mutuamente exclusiva de `substituido` no banco (CHECK), as duas
  // colunas descrevem o MESMO eixo (o que ocorreu com `colaboradores_prova`).
  const descricaoAlocacao = (o: Ocorrencia) => {
    if (o.falta) return "Falta";
    if (o.substituto_id && o.substituto?.colab_nome_completo) return o.substituto.colab_nome_completo;
    return "Não";
  };

  const formatDateDDMMYYYY = (iso: string) => {
    if (!iso) return "";
    const s = String(iso).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[3]}${m[2]}${m[1]}`;
  };

  const busy = isLoading || isLoadingProvaUnidades;

  const headerLine1 = (prova as any)?.prova_cabecalho_linha1 || TIMBRE_LINHA1_PADRAO;
  const headerLine2 = (prova as any)?.prova_cabecalho_linha2 || TIMBRE_LINHA2_PADRAO;

  const exportPdf = async () => {
    if (!prova) return;
    setExportingPdf(true);
    try {
      const doc = criarDocumentoPaisagem();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const edital = prova.editais?.nome || "PROVA";
      const dataProva = formatDateBR(prova.prova_data) || "";

      // Três linhas — sem unidade, ao contrário da lista de presença: este documento é da
      // prova inteira, e as ocorrências de todas as unidades saem na mesma tabela.
      const startY =
        desenharTimbre(doc, {
          logoBase64,
          linhas: [headerLine1, headerLine2, edital],
          titulo: `REGISTRO DE OCORRÊNCIAS${dataProva ? ` - ${dataProva}` : ""}`,
        }) + 7;

      const body = ocorrencias.map((o) => [
        formatDateDDMMYYYY(o.data_ocorrencia),
        o.prova_unidades?.unidades_prova?.unid_sigla?.trim() || "—",
        o.colaboradores?.colab_nome_completo || "—",
        o.tipo_ocorrencia || "—",
        descricaoAlocacao(o),
        o.descricao || "",
      ]);

      autoTable(doc, {
        startY,
        head: [["Data", "Unidade", "Colaborador", "Tipo", "Substituído", "Descrição"]],
        body: body.length > 0 ? body : [["—", "—", "Nenhuma ocorrência registrada", "—", "—", "—"]],
        theme: "grid",
        margin: { left: MARGEM_LATERAL, right: MARGEM_LATERAL, bottom: 15 },
        styles: { ...ESTILOS_TABELA, overflow: "linebreak" },
        headStyles: { ...ESTILOS_CABECALHO, halign: "center" },
        columnStyles: {
          0: { halign: "center", cellWidth: 22 },
          1: { halign: "center", cellWidth: 22 },
          2: { halign: "left", cellWidth: 60 },
          3: { halign: "left", cellWidth: 35 },
          4: { halign: "left", cellWidth: 50 },
          5: { halign: "left", cellWidth: "auto" },
        },
        // ⚠️ Numera SEM total, e por isso não usa `numerarPaginas` do helper: aqui a
        // contagem sai dentro do `didDrawPage`, quando as páginas seguintes ainda não
        // existem. Trocar pelo passe final mudaria o rodapé do documento emitido.
        didDrawPage: () => {
          doc.setFont("times", "normal");
          doc.setFontSize(10);
          doc.text(`Página ${doc.getNumberOfPages()}`, pageWidth / 2, pageHeight - 8, {
            align: "center",
          });
        },
      });

      const timestamp = format(new Date(), "dd-MM-yyyy HH-mm-ss");
      doc.save(`${edital} - OCORRENCIAS - ${timestamp}.pdf`);

      toast({ title: "Exportação concluída", description: "PDF de ocorrências gerado." });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro ao exportar", description: "Não foi possível gerar o PDF." });
    } finally {
      setExportingPdf(false);
    }
  };


  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/gerenciar-prova/${provaId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Ocorrências da Prova</h1>
            <p className="text-muted-foreground">
              {prova.editais?.nome} - {formatDateBRWithFallback(prova.prova_data)}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={exportPdf}
            className="gap-2"
            disabled={exportingPdf || busy}
          >
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar PDF
          </Button>
          <Button onClick={openCreate} className="gap-2" disabled={allowedUnidades.length === 0}>
            <Plus className="h-4 w-4" />
            Nova Ocorrência
          </Button>
        </div>

        {scopedUnidades.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Lock className="h-4 w-4" />
                Encerramento de Registro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {scopedUnidades.map((pu: any) => {
                  const sigla = pu.unidades_prova?.unid_sigla?.trim() || pu.unidades_prova?.unid_nome || "Unidade";
                  const encerrada = !!pu.ocorrencias_encerradas;
                  if (encerrada) {
                    return (
                      <span
                        key={pu.id}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        {sigla} — Registro encerrado
                      </span>
                    );
                  }
                  return (
                    <Button
                      key={pu.id}
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={() => setEncerrarUnidadeId(pu.id)}
                    >
                      <Lock className="h-4 w-4" />
                      Encerrar Registro{scopedUnidades.length > 1 ? ` — ${sigla}` : ""}
                    </Button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Após o encerramento, esta tela não poderá mais ser acessada. Se necessário, solicite acesso à FEVRE.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle className="h-4 w-4" />
              Registro de Ocorrências
              {isCoordenador && !isAdminOrSuper && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">(limitado à sua unidade)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {busy ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : ocorrencias.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground">Nenhuma ocorrência registrada</h3>
                <p className="text-muted-foreground mt-1">
                  Utilize o botão "Nova Ocorrência" para registrar uma ocorrência.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Substituído</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[110px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ocorrencias.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap">{formatDateDDMMYYYY(o.data_ocorrencia)}</TableCell>
                        <TableCell>{o.prova_unidades?.unidades_prova?.unid_sigla?.trim() || "—"}</TableCell>
                        <TableCell>{o.colaboradores?.colab_nome_completo || "—"}</TableCell>
                        <TableCell>{o.tipo_ocorrencia || "—"}</TableCell>
                        <TableCell>{descricaoAlocacao(o)}</TableCell>
                        <TableCell className="max-w-md">
                          <div className="line-clamp-2 whitespace-pre-wrap">{o.descricao}</div>
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(o.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Ocorrência</DialogTitle>
            <DialogDescription>
              Registre uma ocorrência relacionada à atuação de um colaborador nesta prova.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unidade">Unidade de Prova *</Label>
              <Select
                value={form.prova_unidade_id}
                onValueChange={(v) => setForm((f) => ({ ...f, prova_unidade_id: v, colaborador_id: "" }))}
              >
                <SelectTrigger id="unidade">
                  <SelectValue placeholder="Selecione uma unidade" />
                </SelectTrigger>
                <SelectContent>
                  {allowedUnidades.map((pu: any) => (
                    <SelectItem key={pu.id} value={pu.id}>
                      {pu.unidades_prova?.unid_sigla?.trim()} - {pu.unidades_prova?.unid_nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="colaborador">Colaborador *</Label>
              <Popover open={colabPopoverOpen} onOpenChange={setColabPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="colaborador"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={colabPopoverOpen}
                    disabled={!form.prova_unidade_id || loadingColabs}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {!form.prova_unidade_id
                        ? "Selecione uma unidade primeiro"
                        : loadingColabs
                          ? "Carregando..."
                          : selectedColab
                            ? selectedColab.colab_nome_completo
                            : colaboradoresUnidade.length === 0
                              ? "Nenhum colaborador nesta unidade"
                              : "Selecione um colaborador"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar colaborador..."
                      value={colabSearch}
                      onValueChange={setColabSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                      <CommandGroup>
                        {filteredColabs.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            disabled={c.disabled}
                            onSelect={() => {
                              if (c.disabled) return;
                              setForm((f) => ({ ...f, colaborador_id: c.id }));
                              setColabPopoverOpen(false);
                              setColabSearch("");
                            }}
                            className={cn(c.disabled && "opacity-50 cursor-not-allowed")}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                form.colaborador_id === c.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="flex-1 truncate">{c.colab_nome_completo}</span>
                            {c.disabled && c.sigla_alocada && (
                              <span className="ml-2 text-xs text-muted-foreground">{c.sigla_alocada}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>


            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Input
                  id="tipo"
                  value={form.tipo_ocorrencia}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_ocorrencia: e.target.value }))}
                  placeholder="Ex: Atraso, Falta, Elogio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data">Data *</Label>
                <Input
                  id="data"
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                  value={dataDisplay}
                  onChange={(e) => {
                    const masked = maskDateBR(e.target.value);
                    setDataDisplay(masked);
                    const iso = brDateToIso(masked);
                    setForm((f) => ({ ...f, data_ocorrencia: iso }));
                  }}
                  required
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="efeito">Resultado *</Label>
                <Select
                  value={form.efeito}
                  onValueChange={(v: EfeitoOcorrencia) => {
                    setForm((f) => ({ ...f, efeito: v }));
                    if (v !== "substituicao") {
                      setSubstitutoNome("");
                      setSubstitutoId("");
                    }
                  }}
                >
                  <SelectTrigger id="efeito">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Não</SelectItem>
                    <SelectItem value="substituicao">Sim, substituído</SelectItem>
                    <SelectItem value="falta">Falta — remover da lista, sem substituto</SelectItem>
                  </SelectContent>
                </Select>
                {form.efeito === "substituicao" && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2 gap-2"
                      onClick={openSubstituto}
                    >
                      <UserPlus className="h-4 w-4" />
                      Substituto
                    </Button>
                    {substitutoNome && (
                      <p className="text-sm text-muted-foreground">
                        Substituto selecionado: <span className="font-medium text-foreground">{substitutoNome}</span>
                      </p>
                    )}
                  </>
                )}
                {form.efeito === "falta" && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-foreground">
                    <p>
                      Ao salvar, {selectedColab?.colab_nome_completo || "o colaborador"} será removido da lista de
                      trabalhadores desta prova.
                    </p>
                    {avisoFaltaFiscal && <p className="mt-2">{avisoFaltaFiscal}</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Textarea
                id="descricao"
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                rows={4}
                required
                placeholder="Descreva a ocorrência..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isCreating || !form.prova_unidade_id || !form.colaborador_id || !form.descricao.trim()}
              >
                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ocorrência</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta ocorrência? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteId) return;
                // Reverter o efeito sobre `colaboradores_prova` (substituição ou falta)
                // é responsabilidade do RPC `excluir_ocorrencia_colaborador`, dentro da
                // mesma transação — ver `useOcorrencias.tsx`.
                remove(deleteId, { onSuccess: () => setDeleteId(null) });
              }}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={substitutoOpen} onOpenChange={setSubstitutoOpen}>
        <DialogContent className="max-w-xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Selecionar Substituto</DialogTitle>
            <DialogDescription>Lista de todos os colaboradores cadastrados no sistema.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por nome..."
              value={substitutoSearch}
              onChange={(e) => setSubstitutoSearch(e.target.value)}
            />
            {podeHaverMaisSubstitutos && (
              <p className="text-xs text-muted-foreground">
                Mostrando os primeiros resultados. Refine a busca para achar quem não está na lista.
              </p>
            )}
            <Card>
              <CardContent className="p-0 max-h-[400px] overflow-y-auto">
                {loadingAllColabs ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : colaboradoresSubstituto.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado.</div>
                ) : (
                  <ul className="divide-y">
                    {colaboradoresSubstituto.map((c) => {
                      const sigla = c.alocado_unid_sigla?.trim();
                      const alocado = !!sigla;
                      return (
                        <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                          <span className="truncate flex items-center gap-2">
                            <span className="truncate">{c.colab_nome_completo}</span>
                            {alocado && (
                              <span className="inline-flex shrink-0 items-center rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                {sigla}
                              </span>
                            )}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1 shrink-0"
                            disabled={alocado}
                            onClick={() => {
                              setSubstitutoNome(c.colab_nome_completo);
                              setSubstitutoId(c.id);
                              setSubstitutoOpen(false);
                            }}
                          >
                            <Plus className="h-3 w-3" />
                            Adicionar
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <PasswordConfirmDialog
        open={!!encerrarUnidadeId}
        onOpenChange={(o) => !o && setEncerrarUnidadeId(null)}
        title="Encerrar Registro de Ocorrências"
        description={
          <>
            Esta ação encerrará o registro de ocorrências desta unidade nesta prova. Após confirmar, a unidade deixará
            de ser exibida para usuários do tipo Coordenador e <strong>não poderá ser reaberta</strong>.
          </>
        }
        confirmText="Encerrar"
        confirmVariant="destructive"
        onConfirm={async () => {
          if (!encerrarUnidadeId || !user?.id) return;
          const { error } = await supabase.rpc("encerrar_ocorrencias_unidade", {
            p_prova_unidade_id: encerrarUnidadeId,
            p_user_id: user.id,
          });
          if (error) {
            toast({
              variant: "destructive",
              title: "Erro ao encerrar registro",
              description: error.message,
            });
            throw error;
          }
          toast({
            title: "Registro encerrado",
            description: "O registro de ocorrências desta unidade foi encerrado.",
          });
          await queryClient.invalidateQueries({ queryKey: ["prova_unidades", provaId] });
          setEncerrarUnidadeId(null);
        }}
      />
    </Layout>
  );
}
