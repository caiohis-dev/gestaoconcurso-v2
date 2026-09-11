import { useState } from 'react';
import {
  useBuscarColaboradores,
  useColaboradoresMutations,
  POR_PAGINA_COLABORADORES,
  Colaborador,
  ColaboradorListagem,
  OrdemColaboradores,
} from '@/hooks/useColaboradores';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Pencil, Trash2, Users, Loader2, Clock, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ESTADO_CIVIL_MAP } from '@/lib/constants';
import ColaboradorDialog from './ColaboradorDialog';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

function formatCPF(cpf: string): string {
  const str = cpf.padStart(11, '0');
  return `${str.slice(0, 3)}.${str.slice(3, 6)}.${str.slice(6, 9)}-${str.slice(9)}`;
}

function formatTelefone(tel: number | null): string {
  if (!tel) return '-';
  const str = tel.toString();
  if (str.length === 11) {
    return `(${str.slice(0, 2)}) ${str.slice(2, 7)}-${str.slice(7)}`;
  }
  return str;
}


interface SortableHeaderProps {
  label: string;
  column: 'nome' | 'ultimo_acesso';
  currentColumn: 'nome' | 'ultimo_acesso' | null;
  direction: 'asc' | 'desc';
  onSort: (column: 'nome' | 'ultimo_acesso') => void;
}

function SortableHeader({ label, column, currentColumn, direction, onSort }: SortableHeaderProps) {
  const isActive = currentColumn === column;
  return (
    <TableHead
      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDown className="h-3 w-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </div>
    </TableHead>
  );
}

interface PaginacaoProps {
  buscou: boolean;
  pagina: number;
  total: number;
  ocupado: boolean;
  onPagina: (atualiza: (p: number) => number) => void;
}

/**
 * Botões próprios, seguindo o padrão real do repo (`Candidatos.tsx`).
 * ⚠️ `components/ui/pagination.tsx` existe (shadcn, completo) mas não é importado por
 * nenhuma tela — não é o padrão daqui, apesar de parecer.
 */
function PaginacaoBusca({ buscou, pagina, total, ocupado, onPagina }: PaginacaoProps) {
  // A decisão de aparecer mora AQUI, não no chamador: uma página só não se pagina.
  if (!buscou || total <= POR_PAGINA_COLABORADORES) return null;

  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA_COLABORADORES) - 1);

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <span className="text-sm text-muted-foreground">
        Página {pagina + 1} de {ultimaPagina + 1} · {total} colaborador(es)
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPagina((p) => Math.max(0, p - 1))}
          disabled={pagina === 0 || ocupado}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPagina((p) => Math.min(ultimaPagina, p + 1))}
          disabled={pagina >= ultimaPagina || ocupado}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}

export default function ColaboradoresList() {
  const { delete: deleteColaborador, isDeleting } = useColaboradoresMutations();
  const { isAdmin, isCoordenador } = useAuth();
  const { toast } = useToast();

  // Coordenadores can edit/delete, similar to admins
  const canEditDelete = isAdmin || isCoordenador;

  // 🔴 DOIS estados, de propósito: `search` é o que está DIGITADO, `criterio` é o que foi
  // SUBMETIDO. Só o segundo vai ao servidor. Digitar não consulta — a consulta acontece no
  // clique em Buscar (ou no Enter), e nunca com critério vazio.
  //
  // Antes de 2026-09-10 esta tela baixava os 774 colaboradores inteiros ao montar (707 kB,
  // 33 colunas cada, incluindo dados bancários) e filtrava no cliente, refazendo tudo a
  // cada volta de foco da janela.
  const [search, setSearch] = useState('');
  const [criterio, setCriterio] = useState('');
  const [pagina, setPagina] = useState(0);
  const podeBuscar = search.trim().length > 0;
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editColaborador, setEditColaborador] = useState<Colaborador | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<OrdemColaboradores | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { colaboradores, total, isFetching, buscou } = useBuscarColaboradores({
    termo: criterio,
    pagina,
    ordenarPor: sortColumn,
    direcao: sortDirection,
  });

  const buscaDesabilitada = !podeBuscar || isFetching;

  const handleBuscar = () => {
    if (!podeBuscar) return;
    setCriterio(search.trim());
    // Critério novo recomeça da primeira página — senão a busca nasce na página 3 da
    // busca anterior e parece não ter achado nada.
    setPagina(0);
    setSelectedIds(new Set());
  };

  const handleEdit = async (colaborador: ColaboradorListagem) => {
    setEditLoadingId(colaborador.id);
    try {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('*')
        .eq('id', colaborador.id)
        .single();

      if (error) throw error;
      if (data) {
        setEditColaborador(data as Colaborador);
      }
    } catch (error) {
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível resgatar os dados atualizados do colaborador.',
        variant: 'destructive',
      });
    } finally {
      setEditLoadingId(null);
    }
  };

  // A ordenação vai ao SERVIDOR (entra na queryKey do hook), então vale para o resultado
  // inteiro e não só para a página visível. Reordenar volta à página 0 pelo mesmo motivo
  // que trocar de critério: a linha que você procura passou a estar em outro lugar.
  const handleSort = (column: OrdemColaboradores) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setPagina(0);
  };

  // Filtro e ordenação moram no SERVIDOR desde 2026-09-10. Filtrar aqui voltaria a exigir
  // o conjunto inteiro em memória, e faria o contador `total` (que é do servidor) falar de
  // um conjunto diferente do que a tabela mostra — a tela mentiria sem quebrar nada.
  const selectableColaboradores = colaboradores;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(selectableColaboradores.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteColaborador(deleteId);
      setDeleteId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    setIsBulkDeleting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedIds) {
      try {
        await deleteColaborador(id);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }

    setIsBulkDeleting(false);
    setShowBulkDeleteDialog(false);
    setSelectedIds(new Set());

    if (errorCount === 0) {
      toast({
        title: 'Exclusão em massa concluída',
        description: `${successCount} colaborador(es) excluído(s) com sucesso.`,
      });
    } else {
      toast({
        title: 'Exclusão parcialmente concluída',
        description: `${successCount} excluído(s), ${errorCount} erro(s).`,
        variant: 'destructive',
      });
    }
  };

  const allSelectableSelected = selectableColaboradores.length > 0 && 
    selectableColaboradores.every(c => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;

  // Não há mais spinner de página inteira: sem busca não há carga, então a tela nasce
  // pronta. O estado de "buscando" é local ao botão e à tabela.

  return (
    <div className="space-y-4">
      {/* Search and Bulk Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, matrícula ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleBuscar();
                }
              }}
              className="pl-10"
              aria-label="Buscar por nome, matrícula ou CPF"
            />
          </div>
          <Button onClick={handleBuscar} disabled={buscaDesabilitada} className="gap-1">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
          {buscou && (
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              {total} colaborador(es)
            </Badge>
          )}
        </div>
        {canEditDelete && someSelected && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedIds.size} selecionado(s)</Badge>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => setShowBulkDeleteDialog(true)}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Excluir Selecionados
            </Button>
          </div>
        )}
      </div>

      {/* Table — TRÊS estados distintos, e confundi-los é o padrão "vazio enquanto
          carrega" que já custou caro neste repo: "ainda não busquei", "busquei e não
          achei" e "achei". O primeiro NÃO é um resultado vazio. */}
      {!buscou ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Informe nome, matrícula ou CPF e clique em Buscar.</p>
          <p className="text-sm mt-1">
            A lista não é carregada automaticamente — são milhares de registros.
          </p>
        </div>
      ) : colaboradores.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum colaborador encontrado</p>
            <p className="text-sm mt-1">
              A busca diferencia acentos — tente "Jose" e "José".
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {canEditDelete && (
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={allSelectableSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="Selecionar todos"
                        />
                      </TableHead>
                    )}
                    <TableHead className="font-semibold">Matrícula</TableHead>
                    <SortableHeader
                      label="Nome"
                      column="nome"
                      currentColumn={sortColumn}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <TableHead className="font-semibold">CPF</TableHead>
                    <TableHead className="font-semibold">Telefone</TableHead>
                    <SortableHeader
                      label="Último Acesso"
                      column="ultimo_acesso"
                      currentColumn={sortColumn}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <TableHead className="font-semibold">Chave PIX</TableHead>
                    {canEditDelete && <TableHead className="font-semibold text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colaboradores.map((colaborador) => {
                    return (
                    <TableRow key={colaborador.id} className={cn(
                      "hover:bg-muted/30",
                      selectedIds.has(colaborador.id) && "bg-primary/10"
                    )}>
                      {canEditDelete && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(colaborador.id)}
                            onCheckedChange={(checked) => handleSelectOne(colaborador.id, !!checked)}
                            aria-label={`Selecionar ${colaborador.colab_nome_completo}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-mono">{colaborador.colab_matricula || '-'}</TableCell>
                      <TableCell className="font-medium">{colaborador.colab_nome_completo || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{formatCPF(colaborador.colab_cpf)}</TableCell>
                      <TableCell>{formatTelefone(colaborador.colab_telefone)}</TableCell>
                      <TableCell>
                        {colaborador.colab_ultimo_acesso ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 text-sm">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span>{formatDistanceToNow(new Date(colaborador.colab_ultimo_acesso), { addSuffix: true, locale: ptBR })}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {format(new Date(colaborador.colab_ultimo_acesso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-sm">Nunca acessou</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={colaborador.colab_chave_pix || ''}>
                        {colaborador.colab_chave_pix || '-'}
                      </TableCell>
                      {canEditDelete && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(colaborador)}
                              disabled={editLoadingId === colaborador.id}
                            >
                              {editLoadingId === colaborador.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Pencil className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteId(colaborador.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

      <PaginacaoBusca
        buscou={buscou}
        pagina={pagina}
        total={total}
        ocupado={isFetching}
        onPagina={setPagina}
      />


      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este colaborador? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete confirmation */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão em massa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedIds.size} colaborador(es)? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? 'Excluindo...' : `Excluir ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      <ColaboradorDialog
        open={!!editColaborador}
        onOpenChange={() => setEditColaborador(null)}
        colaborador={editColaborador}
      />
    </div>
  );
}
