import { useState } from 'react';
import { useColaboradores, Colaborador } from '@/hooks/useColaboradores';
import { supabase } from '@/integrations/supabase/client';
import { useOnlineColaboradores } from '@/hooks/useOnlineColaboradores';
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

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

export default function ColaboradoresList() {
  const { colaboradores, isLoading, delete: deleteColaborador, isDeleting } = useColaboradores({ fetchAll: true });
  const { isAdmin, isCoordenador } = useAuth();
  const { toast } = useToast();
  
  // Coordenadores can edit/delete, similar to admins
  const canEditDelete = isAdmin || isCoordenador;
  const [search, setSearch] = useState('');
  const hasSearch = search.trim().length > 0;
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editColaborador, setEditColaborador] = useState<Colaborador | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<'nome' | 'ultimo_acesso' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleEdit = async (colaborador: Colaborador) => {
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

  const handleSort = (column: 'nome' | 'ultimo_acesso') => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const searchNormalized = removeAccents(search.toLowerCase());

  const filteredColaboradores = hasSearch
    ? colaboradores
        .filter((c) => {
          const searchLower = search.toLowerCase();
          return (
            removeAccents((c.colab_nome_completo || '').toLowerCase()).includes(searchNormalized) ||
            (c.colab_matricula || '').toLowerCase().includes(searchLower) ||
            c.colab_cpf.toString().includes(search)
          );
        })
    : [];


  const sortedColaboradores = [...filteredColaboradores].sort((a, b) => {
    if (!sortColumn) return 0;

    let comparison = 0;
    if (sortColumn === 'nome') {
      comparison = (a.colab_nome_completo || '').localeCompare(
        b.colab_nome_completo || '',
        'pt-BR'
      );
    } else if (sortColumn === 'ultimo_acesso') {
      const dateA = a.colab_ultimo_acesso ? new Date(a.colab_ultimo_acesso).getTime() : 0;
      const dateB = b.colab_ultimo_acesso ? new Date(b.colab_ultimo_acesso).getTime() : 0;
      comparison = dateA - dateB;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const selectableColaboradores = sortedColaboradores;

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
              className="pl-10"
            />
          </div>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {filteredColaboradores.length} colaborador(es)
          </Badge>
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

      {/* Table */}
      {hasSearch ? (
        sortedColaboradores.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum colaborador encontrado</p>
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
                  {sortedColaboradores.map((colaborador) => {
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
        )
      ) : null}


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
